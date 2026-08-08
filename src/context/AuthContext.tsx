import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ALLOW_LOCAL_FALLBACK } from '../lib/business'
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
  resetPassword: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  setUserRole: (userId: string, role: Role) => Promise<void>
  refresh: () => Promise<void>
}

export function formatAuthIdentifier(input: string): string {
  const trimmed = input.trim().toLowerCase()
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length >= 10 && !trimmed.includes('@')) {
    const last10 = digitsOnly.slice(-10)
    return `${last10}@greenvest.shop`
  }
  return trimmed
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const cloud = isSupabaseConfigured
  const allowLocal = ALLOW_LOCAL_FALLBACK && !cloud

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
    if (cloud && supabase) {
      const { data } = await supabase.auth.getSession()
      await applyCloudSession(data.session?.user.id ?? null)
      setLoading(false)
      return
    }
    if (allowLocal) {
      refreshLocal()
      setLoading(false)
      return
    }
    setUser(null)
    setUsers([])
    setLoading(false)
  }, [cloud, allowLocal, refreshLocal, applyCloudSession])

  useEffect(() => {
    void refresh()
    if (cloud && supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        void applyCloudSession(session?.user.id ?? null)
      })
      return () => sub.subscription.unsubscribe()
    }
    if (!allowLocal) return
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
  }, [cloud, allowLocal, refresh, refreshLocal, applyCloudSession])

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)
      if (cloud && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        })
        if (error) {
          const msg = error.message || 'Login failed'
          if (/rate limit|over_email/i.test(msg)) {
            return {
              ok: false,
              error:
                'Email sending limit reached. Wait ~1 hour, or ask admin to turn OFF Confirm email in Supabase.',
            }
          }
          // Supabase returns this when email confirm is ON and not confirmed yet
          if (/invalid login credentials/i.test(msg)) {
            return {
              ok: false,
              error:
                'Wrong email/password, or email not confirmed yet. After Sign up, check inbox — or ask admin to confirm your account.',
            }
          }
          return { ok: false, error: msg }
        }
        const profile = data.user ? await fetchProfile(data.user.id) : null
        if (!profile) return { ok: false, error: 'Profile missing. Contact support.' }
        setUser(profile)
        await loadUsersIfStaff(profile)
        return { ok: true, user: profile }
      }

      if (!allowLocal) {
        return { ok: false, error: 'Store is not configured. Contact support.' }
      }

      ensureSeeded()
      const all = getUsers()
      const found = all.find(
        (u) => u.email.toLowerCase() === authEmail.toLowerCase() && u.password === password,
      )
      if (!found) return { ok: false, error: 'Invalid phone/email or password' }
      setSessionUserId(found.id)
      setUser(found)
      setUsers(all)
      return { ok: true, user: found }
    },
    [cloud, allowLocal, loadUsersIfStaff],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)
      if (cloud && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: { data: { name: name.trim() } },
        })
        if (error) {
          const msg = error.message || 'Signup failed'
          if (/rate limit|over_email/i.test(msg)) {
            return {
              ok: false,
              error:
                'Email sending limit reached (Supabase free mail). Wait ~1 hour, or admin must turn OFF Confirm email so signup works without email.',
            }
          }
          return { ok: false, error: msg }
        }
        if (!data.user) return { ok: false, error: 'Signup failed' }
        if (data.session) {
          const profile = await fetchProfile(data.user.id)
          if (profile) {
            setUser(profile)
            await loadUsersIfStaff(profile)
            return { ok: true, user: profile }
          }
        }
        return { ok: true }
      }

      if (!allowLocal) {
        return { ok: false, error: 'Store is not configured. Contact support.' }
      }

      ensureSeeded()
      const all = getUsers()
      if (all.some((u) => u.email.toLowerCase() === authEmail.toLowerCase())) {
        return { ok: false, error: 'Phone number / email already registered' }
      }
      const newUser: User = {
        id: uid('u'),
        email: authEmail,
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
      return { ok: true, user: newUser }
    },
    [cloud, allowLocal, loadUsersIfStaff],
  )

  const logout = useCallback(async () => {
    if (cloud && supabase) await supabase.auth.signOut()
    else setSessionUserId(null)
    setUser(null)
    if (allowLocal) setUsers(getUsers())
    else setUsers([])
  }, [cloud, allowLocal])

  const resetPassword = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!cloud || !supabase) {
        return { ok: false, error: 'Password reset needs the live store (Supabase).' }
      }
      const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/?$/, '/')}`
      const redirectTo = `${base}auth/reset`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      })
      if (error) {
        const msg = error.message || 'Reset failed'
        if (/rate limit|over_email/i.test(msg)) {
          return {
            ok: false,
            error: 'Email sending limit reached. Wait about 1 hour and try again.',
          }
        }
        return { ok: false, error: msg }
      }
      return { ok: true }
    },
    [cloud],
  )

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      if (!cloud || !supabase) {
        return { ok: false, error: 'Password update needs the live store (Supabase).' }
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },
    [cloud],
  )

  const setUserRole = useCallback(
    async (userId: string, role: Role) => {
      if (cloud) {
        await updateProfileRole(userId, role)
        const all = await fetchProfiles()
        setUsers(all)
        if (user?.id === userId) setUser(all.find((u) => u.id === userId) ?? null)
        return
      }
      if (!allowLocal) return
      const all = getUsers()
      const next = all.map((u) => (u.id === userId ? { ...u, role } : u))
      saveUsers(next)
      setUsers(next)
      if (getSessionUserId() === userId) setUser(next.find((u) => u.id === userId) ?? null)
    },
    [cloud, allowLocal, user?.id],
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
      resetPassword,
      updatePassword,
      setUserRole,
      refresh,
    }),
    [
      user,
      users,
      loading,
      cloud,
      login,
      signup,
      logout,
      resetPassword,
      updatePassword,
      setUserRole,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
