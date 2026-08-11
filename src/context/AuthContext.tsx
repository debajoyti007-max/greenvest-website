import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ALLOW_LOCAL_FALLBACK } from '../lib/business'
import { fetchProfiles, updateProfileRole, checkAccountExistsByEmail } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  ensureSeeded,
  getSessionUserId,
  getUsers,
  saveUsers,
  setSessionUserId,
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
  signup: (name: string, email: string, password: string, phone?: string) => Promise<AuthResult>
  logout: () => Promise<void>
  resetPassword: (name: string, email: string, newPin: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  setUserRole: (userId: string, role: Role) => Promise<void>
  updateUserProfile: (data: { name?: string; phone?: string }) => Promise<void>
  adminResetUserPin: (userId: string, newPin: string) => Promise<AuthResult>
  toggleBlockUser: (userId: string, isBlocked: boolean) => Promise<AuthResult>
  refresh: () => Promise<void>
  checkAccountExists: (email: string) => Promise<boolean>
}

function ensureAdminRole(profile: User | null): User | null {
  if (!profile) return null
  const email = (profile.email || '').toLowerCase()
  const phone = (profile.phone || '').trim()
  if (
    email === 'debajoyti007@gmail.com' ||
    email.includes('debajoyti007') ||
    email === '8170859653@greenvest.shop' ||
    phone === '8170859653'
  ) {
    return { ...profile, role: 'admin' }
  }
  return profile
}

export function normalizeText(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function formatAuthIdentifier(input: string): string {
  const trimmed = normalizeText(input)
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length >= 10 && !trimmed.includes('@')) {
    const last10 = digitsOnly.slice(-10)
    return `${last10}@greenvest.shop`
  }
  return trimmed
}

/** Pad 4-digit PIN to meet Supabase 6-char minimum. */
function padPin(pin: string): string {
  return pin.length < 6 ? pin + '0'.repeat(6 - pin.length) : pin
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => {
    ensureSeeded()
    return getUsers()
  })
  const [user, setUser] = useState<User | null>(() => {
    ensureSeeded()
    const sessionUserId = getSessionUserId()
    if (!sessionUserId) return null
    const all = getUsers()
    const found = all.find((u) => u.id === sessionUserId) || null
    return found ? ensureAdminRole(found) : null
  })
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const cloud = isSupabaseConfigured
  const allowLocal = ALLOW_LOCAL_FALLBACK && !cloud
  // Use a ref so applyCloudSession can read the latest user without being recreated every render.
  // Must be initialized lazily to match whatever user useState resolved to.
  const userRef = useRef<User | null>((() => {
    const sessionUserId = getSessionUserId()
    if (!sessionUserId) return null
    const all = getUsers()
    const found = all.find((u) => u.id === sessionUserId) || null
    return found ? ensureAdminRole(found) : null
  })())

  const loadUsersIfStaff = useCallback(async (profile: User | null) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'seller')) {
      setUsers(profile ? [profile] : [])
      return
    }
    ensureSeeded()
    const localUsers = getUsers()
    let cloudUsers: User[] = []
    try {
      cloudUsers = await fetchProfiles()
    } catch {
      cloudUsers = []
    }

    const map = new Map<string, User>()
    // 1. Add local & seeded demo users first
    localUsers.forEach((u) => {
      if (u.email) map.set(u.email.toLowerCase(), u)
    })
    // 2. Add cloud profiles (overriding local if email matches)
    cloudUsers.forEach((u) => {
      if (u.email) map.set(u.email.toLowerCase(), u)
    })
    // 3. Ensure current active logged in profile is present
    if (profile && profile.email) {
      map.set(profile.email.toLowerCase(), profile)
    }

    const merged = Array.from(map.values())
    setUsers(merged)
  }, [])


  const refreshLocal = useCallback(() => {
    ensureSeeded()
    const id = getSessionUserId()
    const all = getUsers()
    setUsers(all)
    if (!id) {
      if (!user) setUser(null)
    } else {
      const found = all.find((u) => u.id === id) || null
      if (found) setUser(ensureAdminRole(found))
    }
  }, [user])

  const refresh = useCallback(async () => {
    if (!initialized) setLoading(true)
    if (cloud && supabase) {
      // Restore session from localStorage userId (we don't use Supabase Auth sessions)
      const localId = getSessionUserId()
      if (localId && !userRef.current) {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', localId)
            .maybeSingle()
          if (profileRow) {
            const profile = ensureAdminRole({
              id: profileRow.id,
              email: profileRow.email,
              name: profileRow.name,
              role: profileRow.role,
              phone: profileRow.phone || undefined,
              isBlocked: profileRow.isBlocked || false,
              createdAt: profileRow.created_at,
            })
            if (profile) {
              setUser(profile)
              userRef.current = profile
              await loadUsersIfStaff(profile)
            }
          } else {
            // Session ID in localStorage but no matching profile — clear stale session
            setSessionUserId(null)
          }
        } catch {
          // Network error — keep existing in-memory user if any
        }
      }
      setLoading(false)
      setInitialized(true)
      return
    }
    if (allowLocal) {
      refreshLocal()
      setLoading(false)
      setInitialized(true)
      return
    }
    setLoading(false)
    setInitialized(true)
  }, [cloud, allowLocal, refreshLocal, initialized, loadUsersIfStaff])

  useEffect(() => {
    void refresh()
    // No supabase.auth listener needed — sessions are managed via localStorage
  }, [refresh])



  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)

      if (cloud && supabase) {
        // ── Simple approach: check profiles table directly (no Supabase Auth needed) ──
        // Step 1: find the profile row by email
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('*')
          .or(`email.eq.${authEmail.toLowerCase()},email.eq.${email.trim().toLowerCase()}`)
          .maybeSingle()

        if (profileRow) {
          // Step 2: compare PIN (stored as password field in profiles)
          const storedPin: string = profileRow.password || ''

          // If account exists but PIN was never set (old Supabase Auth account)
          if (!storedPin) {
            return {
              ok: false,
              error: '🔑 No PIN set for this account yet. Click "Forgot PIN? Verify Username & Reset" below to create your 4-digit PIN.',
            }
          }

          const pinMatch = storedPin === password || storedPin === padPin(password)
          if (!pinMatch) {
            return { ok: false, error: '❌ Incorrect PIN. Click "Forgot PIN?" below to reset it.' }
          }

          const profile = ensureAdminRole({
            id: profileRow.id,
            email: profileRow.email,
            name: profileRow.name,
            role: profileRow.role,
            phone: profileRow.phone || undefined,
            isBlocked: profileRow.isBlocked || false,
            createdAt: profileRow.created_at,
          })

          if (profile?.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
          if (!profile) return { ok: false, error: 'Profile not found. Contact support.' }

          setUser(profile)
          userRef.current = profile
          setSessionUserId(profile.id)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
        }

        // Profile not found in Supabase at all
        return {
          ok: false,
          error: 'Account not found. Please Sign Up first.',
        }
      }


      if (!allowLocal) {
        return { ok: false, error: 'Store is not configured. Contact support.' }
      }

      ensureSeeded()
      const all = getUsers()
      const found = all.find(
        (u) =>
          (u.email.toLowerCase() === authEmail.toLowerCase()) &&
          (u.password === password),
      )
      if (!found) return { ok: false, error: 'Invalid phone/email or PIN' }
      if (found.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
      setSessionUserId(found.id)
      setUser(found)
      userRef.current = found
      setUsers(all)
      return { ok: true, user: found }
    },
    [cloud, allowLocal, loadUsersIfStaff],
  )

  const signup = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      phoneVal?: string,
    ): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)
      if (cloud && supabase) {
        // Simple approach: insert directly into profiles table — no Supabase Auth needed
        // Step 1: check if already registered
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${authEmail.toLowerCase()},email.eq.${email.trim().toLowerCase()}`)
          .maybeSingle()

        if (existing) {
          return { ok: false, error: 'This phone number / email is already registered. Click Login tab to sign in.' }
        }

        // Step 2: insert new profile with PIN stored as password
        const newId = uid('u')
        const { error: insertErr } = await supabase.from('profiles').insert({
          id: newId,
          email: authEmail.toLowerCase(),
          name: name.trim(),
          role: 'customer',
          phone: phoneVal?.trim() || null,
          password,                   // stores the 4-digit PIN
        })

        if (insertErr) {
          // Surface the real error — most likely the `password` column is missing
          // Fix: run in Supabase SQL Editor:
          // ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;
          const isColumnMissing = insertErr.code === '42703' || (insertErr.message || '').includes('column')
          if (isColumnMissing) {
            return { ok: false, error: 'Database setup needed. Ask admin to run: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;' }
          }
          return { ok: false, error: insertErr.message || 'Signup failed. Try again.' }
        }

        const profile: User = {
          id: newId,
          email: authEmail,
          name: name.trim(),
          role: 'customer',
          phone: phoneVal?.trim() || undefined,
          createdAt: new Date().toISOString(),
        }
        setUser(profile)
        userRef.current = profile
        setSessionUserId(profile.id)
        return { ok: true, user: profile }
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
        phone: phoneVal,
        createdAt: new Date().toISOString(),
      }
      const next = [...all, newUser]
      saveUsers(next)
      setUsers(next)
      setSessionUserId(newUser.id)
      setUser(newUser)
      userRef.current = newUser
      return { ok: true, user: newUser }
    },
    [cloud, allowLocal, loadUsersIfStaff],
  )

  const logout = useCallback(async () => {
    // No supabase.auth.signOut() needed — we manage sessions via localStorage
    setSessionUserId(null)
    setUser(null)
    userRef.current = null
    setUsers([])
  }, [])

  const resetPassword = useCallback(
    async (nameInput: string, email: string, newPin: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)

      if (newPin.length !== 4 || /\D/.test(newPin)) {
        return { ok: false, error: 'PIN must be exactly 4 digits.' }
      }

      if (cloud && supabase) {
        // Find profile directly in Supabase
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('*')
          .or(`email.eq.${authEmail.toLowerCase()},email.eq.${email.trim().toLowerCase()}`)
          .maybeSingle()

        if (profileRow) {
          // Update their PIN in Supabase profiles table
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({
              password: newPin,
              name: nameInput.trim() || profileRow.name,
            })
            .eq('id', profileRow.id)

          if (updateErr) {
            // PostgreSQL error 42703 = column doesn't exist in the table schema
            const isColumnMissing = updateErr.code === '42703' || (updateErr.message || '').includes('column')
            if (isColumnMissing) {
              return {
                ok: false,
                error: 'Setup needed: Run this SQL in Supabase → SQL Editor:\n\nALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;',
              }
            }
            return { ok: false, error: `PIN update failed: ${updateErr.message}` }
          }
          return { ok: true }
        }

        // Account not found — show clear error, don't silently create
        return {
          ok: false,
          error: 'Account not found with that email/phone. Please Sign Up first.',
        }
      }

      // Local fallback (dev mode only)
      ensureSeeded()
      const all = getUsers()
      const match = all.find((u) => {
        const uEmail = (u.email || '').toLowerCase()
        return uEmail === authEmail.toLowerCase() || uEmail === email.trim().toLowerCase()
      })
      if (!match) return { ok: false, error: 'Account not found. Please Sign Up first.' }

      const updated = all.map((u) =>
        u.id === match.id ? { ...u, password: newPin, name: nameInput.trim() || u.name } : u
      )
      saveUsers(updated)
      setUsers(updated)
      return { ok: true }
    },
    [cloud, users],
  )

  const updatePassword = useCallback(
    async (newPin: string): Promise<AuthResult> => {
      if (!user) return { ok: false, error: 'Not logged in.' }
      if (newPin.length !== 4 || /\D/.test(newPin)) {
        return { ok: false, error: 'PIN must be exactly 4 digits.' }
      }
      if (cloud && supabase) {
        const { error } = await supabase
          .from('profiles')
          .update({ password: newPin })
          .eq('id', user.id)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }
      // Local fallback
      const all = getUsers()
      const updated = all.map((u) => (u.id === user.id ? { ...u, password: newPin } : u))
      saveUsers(updated)
      setUsers(updated)
      return { ok: true }
    },
    [cloud, user],
  )

  const setUserRole = useCallback(
    async (userId: string, role: Role) => {
      ensureSeeded()
      const all = getUsers()
      const targetUser = all.find((u) => u.id === userId || u.email === userId)
      const targetEmail = targetUser?.email || userId

      const updated = all.map((u) =>
        u.id === userId || (targetEmail && u.email.toLowerCase() === targetEmail.toLowerCase())
          ? { ...u, role }
          : u,
      )
      saveUsers(updated)
      setUsers(updated)

      if (user && (user.id === userId || (targetEmail && user.email.toLowerCase() === targetEmail.toLowerCase()))) {
        setUser({ ...user, role })
      }

      if (cloud && supabase) {
        try {
          await updateProfileRole(userId, role, targetEmail)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
          }
        } catch (err) {
          console.warn('setUserRole cloud error:', err)
        }
      }
    },
    [cloud, user],
  )

  const adminResetUserPin = useCallback(
    async (userId: string, newPin: string): Promise<AuthResult> => {
      ensureSeeded()
      const all = getUsers()
      const targetUser = all.find((u) => u.id === userId || u.email === userId)
      const targetEmail = targetUser?.email || userId

      const updated = all.map((u) =>
        u.id === userId || (targetEmail && u.email.toLowerCase() === targetEmail.toLowerCase())
          ? { ...u, password: newPin }
          : u,
      )
      saveUsers(updated)
      setUsers(updated)

      if (cloud && supabase) {
        try {
          await supabase.from('profiles').update({ password: newPin }).eq('id', userId)
          if (targetEmail) {
            await supabase.from('profiles').update({ password: newPin }).eq('email', targetEmail.toLowerCase())
          }
        } catch {
          /* ignore */
        }
      }
      return { ok: true }
    },
    [cloud],
  )

  const toggleBlockUser = useCallback(
    async (userId: string, isBlocked: boolean): Promise<AuthResult> => {
      if (cloud && supabase) {
        try {
          await supabase.from('profiles').update({ isBlocked }).eq('id', userId)
        } catch {
          /* ignore */
        }
      }
      const all = getUsers()
      const updated = all.map((u) => (u.id === userId ? { ...u, isBlocked } : u))
      saveUsers(updated)
      setUsers(updated)
      return { ok: true }
    },
    [cloud],
  )

  const updateUserProfile = useCallback(
    async (data: { name?: string; phone?: string }) => {
      if (!user) return
      const updated = { ...user, ...data }
      if (cloud && supabase) {
        await supabase
          .from('profiles')
          .update({ name: updated.name, phone: updated.phone })
          .eq('id', user.id)
      } else {
        const all = getUsers()
        const next = all.map((u) => (u.id === user.id ? updated : u))
        saveUsers(next)
        setUsers(next)
      }
      setUser(updated)
    },
    [cloud, user],
  )

  const checkAccountExists = useCallback(
    async (email: string): Promise<boolean> => {
      const authEmail = formatAuthIdentifier(email)
      const normalEmail = email.trim().toLowerCase()

      // 1️⃣ Always check local/seeded users first (works without auth)
      ensureSeeded()
      const localUsers = getUsers()
      const localMatch = localUsers.some(
        (u) =>
          u.email.toLowerCase() === authEmail.toLowerCase() ||
          u.email.toLowerCase() === normalEmail
      )
      if (localMatch) return true

      // 2️⃣ Check in-memory users state (already loaded after any login)
      const memMatch = users.some(
        (u) =>
          u.email.toLowerCase() === authEmail.toLowerCase() ||
          u.email.toLowerCase() === normalEmail
      )
      if (memMatch) return true

      // 3️⃣ Try Supabase (may fail due to RLS for unauthenticated)
      if (cloud && supabase) {
        try {
          const found = await checkAccountExistsByEmail(authEmail)
          if (found) return true
          // Also try with original email if different
          if (authEmail !== normalEmail) {
            const found2 = await checkAccountExistsByEmail(normalEmail)
            if (found2) return true
          }
        } catch {
          /* RLS may block — that's OK, local check already ran */
        }
      }

      return false
    },
    [cloud, users],
  )

  const value = useMemo(
    () => ({
      user,
      users,
      loading,
      configured: cloud || allowLocal,
      mode: cloud ? ('cloud' as const) : ('local' as const),
      login,
      signup,
      logout,
      resetPassword,
      updatePassword,
      setUserRole,
      updateUserProfile,
      adminResetUserPin,
      toggleBlockUser,
      refresh,
      checkAccountExists,
    }),
    [
      user,
      users,
      loading,
      cloud,
      allowLocal,
      login,
      signup,
      logout,
      resetPassword,
      updatePassword,
      setUserRole,
      updateUserProfile,
      adminResetUserPin,
      toggleBlockUser,
      refresh,
      checkAccountExists,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
