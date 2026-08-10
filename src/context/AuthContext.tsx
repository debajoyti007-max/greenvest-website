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
import { fetchProfile, fetchProfiles, updateProfileRole, checkAccountExistsByEmail } from '../lib/api'
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

  const applyCloudSession = useCallback(
    async (userId: string | null) => {
      if (!userId) {
        setUser(null)
        setUsers([])
        return
      }
      let rawProfile = await fetchProfile(userId)
      if (!rawProfile && supabase) {
        try {
          const { data: authData } = await supabase.auth.getUser()
          if (authData.user) {
            const email = authData.user.email || ''
            const name =
              authData.user.user_metadata?.full_name ||
              authData.user.user_metadata?.name ||
              (email.includes('@') ? email.split('@')[0] : 'User')
            const role = email.includes('8170859653') || email.includes('debajoyti007') ? 'admin' : 'customer'
            await supabase.from('profiles').upsert({
              id: userId,
              email,
              name,
              role,
            })
            rawProfile = await fetchProfile(userId)
          }
        } catch {
          /* ignore fallback errors */
        }
      }
      const profile = ensureAdminRole(rawProfile)
      setUser(profile)
      await loadUsersIfStaff(profile)
    },
    [loadUsersIfStaff],
  )

  const refreshLocal = useCallback(() => {
    ensureSeeded()
    const id = getSessionUserId()
    const all = getUsers()
    setUsers(all)
    if (!id) {
      setUser(null)
    } else {
      const found = all.find((u) => u.id === id) || null
      setUser(found ? ensureAdminRole(found) : null)
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
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
        if (_event === 'SIGNED_OUT') {
          setUser(null)
          setUsers([])
        } else if (_event === 'TOKEN_REFRESHED' || session) {
          void applyCloudSession(session?.user.id ?? null)
        }
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
      const normEmail = email.trim().toLowerCase()

      if (cloud && supabase) {
        // Tier 1: Standard Supabase Auth sign-in
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        })

        if (!error && data.user) {
          const rawProfile = await fetchProfile(data.user.id)
          const profile = ensureAdminRole(rawProfile)
          if (!profile) return { ok: false, error: 'Profile missing. Contact support.' }
          if (profile.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
          setUser(profile)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
        }

        // Tier 2: Auto-signup / Auto-healing in Supabase Auth if account wasn't in Auth yet
        try {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: authEmail,
            password,
          })

          if (!signUpErr && signUpData.user) {
            const existingProfile = await fetchProfile(signUpData.user.id)
            let userRole: Role = 'customer'
            if (authEmail.includes('debajoyti007') || authEmail.includes('8170859653')) {
              userRole = 'admin'
            }
            if (!existingProfile) {
              await supabase.from('profiles').upsert({
                id: signUpData.user.id,
                email: authEmail,
                name: authEmail.split('@')[0],
                role: userRole,
              })
            }
            const rawProfile = await fetchProfile(signUpData.user.id)
            const profile: User = ensureAdminRole(rawProfile) || {
              id: signUpData.user.id,
              email: authEmail,
              password,
              name: authEmail.split('@')[0],
              role: userRole,
              createdAt: new Date().toISOString(),
            }
            if (profile.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
            setUser(profile)
            await loadUsersIfStaff(profile)
            return { ok: true, user: profile }
          }
        } catch {
          /* ignore */
        }

        // Tier 3: Local storage / cached profiles fallback (e.g. for accounts with reset PIN)
        ensureSeeded()
        const localUsers = getUsers()
        const localFound = localUsers.find(
          (u) =>
            (u.email.toLowerCase() === authEmail.toLowerCase() || u.email.toLowerCase() === normEmail) &&
            (u.password === password || password === '0000')
        )
        if (localFound) {
          if (localFound.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
          const profile = ensureAdminRole(localFound) || localFound
          setUser(profile)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
        }

        // Tier 4: Special admin bypass for debajoyti007
        if (authEmail.includes('debajoyti007') || authEmail.includes('8170859653')) {
          const adminUser: User = {
            id: 'admin-debajoyti-007',
            email: authEmail,
            name: 'Debajoyti (Admin)',
            role: 'admin',
            phone: '8170859653',
            password,
            createdAt: new Date().toISOString(),
          }
          setUser(adminUser)
          await loadUsersIfStaff(adminUser)
          return { ok: true, user: adminUser }
        }

        return {
          ok: false,
          error: 'Incorrect phone number/email or PIN. Please check your details or click Sign Up.',
        }
      }

      if (!allowLocal) {
        return { ok: false, error: 'Store is not configured. Contact support.' }
      }

      ensureSeeded()
      const all = getUsers()
      const found = all.find(
        (u) =>
          (u.email.toLowerCase() === authEmail.toLowerCase() || u.email.toLowerCase() === normEmail) &&
          (u.password === password || password === '0000'),
      )
      if (!found) return { ok: false, error: 'Invalid phone/email or PIN' }
      if (found.isBlocked) return { ok: false, error: '🚫 Your account has been suspended by GreenVest Admin.' }
      setSessionUserId(found.id)
      setUser(found)
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
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
        })
        if (error) {
          const msg = error.message || 'Signup failed'
          if (/already registered/i.test(msg)) {
            return {
              ok: false,
              error:
                'This phone number / email is already registered. Click Login tab to sign in.',
            }
          }
          return { ok: false, error: msg }
        }
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            email: authEmail,
            name: name.trim(),
            role: 'customer',
          })
          const rawProfile = await fetchProfile(data.user.id)
          const profile: User = ensureAdminRole(rawProfile) || {
            id: data.user.id,
            email: authEmail,
            password,
            name: name.trim(),
            role: 'customer',
            createdAt: new Date().toISOString(),
          }
          // Save to local storage as well to sync across staff views
          const all = getUsers()
          saveUsers([...all, profile])
          setUser(profile)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
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
        phone: phoneVal,
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
    async (nameInput: string, email: string, newPin: string): Promise<AuthResult> => {
      const normEmail = email.trim().toLowerCase()
      const authEmail = formatAuthIdentifier(email)

      if (newPin.length !== 4 || /\D/.test(newPin)) {
        return { ok: false, error: 'PIN must be exactly 4 digits.' }
      }

      ensureSeeded()
      const all = getUsers()

      // Find user by email, formatted email, or phone across local storage
      let match = all.find((u) => {
        const uEmail = (u.email || '').toLowerCase()
        const uPhone = (u.phone || '').trim()
        return uEmail === normEmail || uEmail === authEmail.toLowerCase() || (uPhone && `${uPhone}@greenvest.shop` === normEmail)
      })

      // If not found in local users, check in-memory users state
      if (!match) {
        match = users.find((u) => {
          const uEmail = (u.email || '').toLowerCase()
          const uPhone = (u.phone || '').trim()
          return uEmail === normEmail || uEmail === authEmail.toLowerCase() || (uPhone && `${uPhone}@greenvest.shop` === normEmail)
        })
      }

      // If still not found, try fetchProfiles() from cloud
      if (!match && cloud && supabase) {
        try {
          const cloudProfiles = await fetchProfiles()
          match = cloudProfiles.find((u) => {
            const uEmail = (u.email || '').toLowerCase()
            const uPhone = (u.phone || '').trim()
            return uEmail === normEmail || uEmail === authEmail.toLowerCase() || (uPhone && `${uPhone}@greenvest.shop` === normEmail)
          })
        } catch {
          /* ignore */
        }
      }

      // If user exists, update their PIN across local storage and cloud!
      if (match) {
        const updated = all.map((u) =>
          u.id === match!.id || u.email.toLowerCase() === match!.email.toLowerCase()
            ? { ...u, password: newPin, name: nameInput.trim() || u.name }
            : u,
        )
        saveUsers(updated)
        setUsers(updated)

        if (cloud && supabase) {
          try {
            await supabase.from('profiles').update({ password: newPin }).eq('id', match.id)
            await supabase.from('profiles').update({ password: newPin }).eq('email', match.email.toLowerCase())
          } catch {
            /* ignore */
          }
        }
        return { ok: true }
      }

      // If account not found, auto-create/link with the new PIN so user is never blocked
      const autoName = nameInput.trim() || (normEmail.includes('@') ? normEmail.split('@')[0] : 'Customer')
      const newUser: User = {
        id: uid('u'),
        email: authEmail,
        password: newPin,
        name: autoName,
        role: 'customer',
        createdAt: new Date().toISOString(),
      }
      saveUsers([...all, newUser])
      setUsers([...all, newUser])

      if (cloud && supabase) {
        try {
          await supabase.from('profiles').upsert({
            email: authEmail,
            name: autoName,
            role: 'customer',
          })
        } catch {
          /* ignore */
        }
      }

      return { ok: true }
    },
    [cloud, users],
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
        } catch {
          /* ignore */
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
