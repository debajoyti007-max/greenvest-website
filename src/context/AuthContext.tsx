import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchProfile, fetchProfiles, updateProfileRole } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  ensureSeeded,
  getSessionUserId,
  getUsers,
  saveUsers,
  setSessionUserId,
  STORE_EVENT,
  uid,
} from '../lib/storage'
import type { Role, User } from '../types'

type AuthResult = { ok: boolean; error?: string; user?: User }

interface AuthContextValue {
  user: User | null
  users: User[]
  loading: boolean
  configured: boolean
  mode: 'cloud' | 'local'
  login: (email: string, password: string) => Promise<AuthResult>
  signup: (name: string, email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
  setUserRole: (userId: string, role: Role) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const cloud = isSupabaseConfigured

  const loadUsersIfStaff = useCallback(async (profile: User | null) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'seller')) {
      setUsers(profile ? [profile] : [])
      return
    }
    try {
      const all = await fetchProfiles()
      setUsers(all)
    } catch {
      setUsers(profile ? [profile] : [])
    }
  }, [])

  const applyCloudSession = useCallback(
    async (userId: string | null) => {
      if (!userId) {
        setUser(null)
        setUsers([])
        return
      }
      const profile = await fetchProfile(userId)
      setUser(profile)
      await loadUsersIfStaff(profile)
    },
    [loadUsersIfStaff],
  )

  const refreshLocal = useCallback(() => {
    ensureSeeded()
    const all = getUsers()
    setUsers(all)
    const sid = getSessionUserId()
    setUser(sid ? all.find((u) => u.id === sid) ?? null : null)
  }, [])

  const refresh = useCallback(async () => {
    if (!cloud || !supabase) {
      refreshLocal()
      setLoading(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    await applyCloudSession(data.session?.user.id ?? null)
    setLoading(false)
  }, [cloud, refreshLocal, applyCloudSession])

  useEffect(() => {
    void refresh()
    if (cloud && supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        void applyCloudSession(session?.user.id ?? null)
      })
      return () => sub.subscription.unsubscribe()
    }
    const onStore = () => refreshLocal()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('gv_')) refreshLocal()
    }
    window.addEventListener(STORE_EVENT, onStore)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORE_EVENT, onStore)
      window.removeEventListener('storage', onStorage)
    }
  }, [cloud, refresh, refreshLocal, applyCloudSession])

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (cloud && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) return { ok: false, error: error.message }
        const profile = data.user ? await fetchProfile(data.user.id) : null
        if (!profile) return { ok: false, error: 'Profile missing. Run schema.sql.' }
        setUser(profile)
        await loadUsersIfStaff(profile)
        return { ok: true, user: profile }
      }

      ensureSeeded()
      const all = getUsers()
      const found = all.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
      )
      if (!found) return { ok: false, error: 'Invalid email or password' }
      setSessionUserId(found.id)
      setUser(found)
      setUsers(all)
      return { ok: true, user: found }
    },
    [cloud, loadUsersIfStaff],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      if (cloud && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { name: name.trim() } },
        })
        if (error) return { ok: false, error: error.message }
        if (!data.user) return { ok: false, error: 'Signup failed' }
        if (data.session) {
          const profile = await fetchProfile(data.user.id)
          if (profile) {
            setUser(profile)
            await loadUsersIfStaff(profile)
          }
        }
        return { ok: true }
      }

      ensureSeeded()
      const all = getUsers()
      if (all.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return { ok: false, error: 'Email already registered' }
      }
      const newUser: User = {
        id: uid('u'),
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        role: 'customer',
        createdAt: new Date().toISOString(),
      }
      const next = [...all, newUser]
      saveUsers(next)
      setUsers(next)
      setSessionUserId(newUser.id)
      setUser(newUser)
      return { ok: true }
    },
    [cloud, loadUsersIfStaff],
  )

  const logout = useCallback(async () => {
    if (cloud && supabase) await supabase.auth.signOut()
    else setSessionUserId(null)
    setUser(null)
    if (!cloud) setUsers(getUsers())
    else setUsers([])
  }, [cloud])

  const setUserRole = useCallback(
    async (userId: string, role: Role) => {
      if (cloud) {
        await updateProfileRole(userId, role)
        const all = await fetchProfiles()
        setUsers(all)
        if (user?.id === userId) setUser(all.find((u) => u.id === userId) ?? null)
        return
      }
      const all = getUsers()
      const next = all.map((u) => (u.id === userId ? { ...u, role } : u))
      saveUsers(next)
      setUsers(next)
      if (getSessionUserId() === userId) setUser(next.find((u) => u.id === userId) ?? null)
    },
    [cloud, user?.id],
  )

  const value = useMemo(
    () => ({
      user,
      users,
      loading,
      configured: cloud,
      mode: cloud ? ('cloud' as const) : ('local' as const),
      login,
      signup,
      logout,
      setUserRole,
      refresh,
    }),
    [user, users, loading, cloud, login, signup, logout, setUserRole, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
