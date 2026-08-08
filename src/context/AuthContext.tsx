import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
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

interface AuthContextValue {
  user: User | null
  users: User[]
  login: (email: string, password: string) => { ok: boolean; error?: string; user?: User }
  signup: (name: string, email: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  setUserRole: (userId: string, role: Role) => void
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState<User | null>(null)

  const refresh = useCallback(() => {
    ensureSeeded()
    const all = getUsers()
    setUsers(all)
    const sid = getSessionUserId()
    setUser(sid ? all.find((u) => u.id === sid) ?? null : null)
  }, [])

  useEffect(() => {
    refresh()
    const onStore = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('gv_')) refresh()
    }
    window.addEventListener(STORE_EVENT, onStore)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORE_EVENT, onStore)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const login = useCallback((email: string, password: string) => {
    const all = getUsers()
    const found = all.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    )
    if (!found) return { ok: false, error: 'Invalid email or password' }
    setSessionUserId(found.id)
    setUser(found)
    return { ok: true, user: found }
  }, [])

  const signup = useCallback((name: string, email: string, password: string) => {
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
  }, [])

  const logout = useCallback(() => {
    setSessionUserId(null)
    setUser(null)
  }, [])

  const setUserRole = useCallback((userId: string, role: Role) => {
    const all = getUsers()
    const next = all.map((u) => (u.id === userId ? { ...u, role } : u))
    saveUsers(next)
    setUsers(next)
    const sid = getSessionUserId()
    if (sid === userId) {
      setUser(next.find((u) => u.id === userId) ?? null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, users, login, signup, logout, setUserRole, refresh }),
    [user, users, login, signup, logout, setUserRole, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
