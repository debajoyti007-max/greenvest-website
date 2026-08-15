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
import { showToast } from '../components/Toast'
import { fetchProfiles, checkAccountExistsByEmail, updateProfileRole, updateProfilePin, updateProfileBlocked, updateProfileDetails } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  ensureSeeded,
  getSessionUserId,
  getStoredPin,
  getUsers,
  saveUsers,
  setSessionUserId,
  storePin,
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
  // Use a ref for initialized so refresh() doesn't re-create itself (Bug 7 fix)
  const initializedRef = useRef(false)
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
    // Bug 7 fix: use ref so this callback isn't recreated each time initialized changes
    if (!initializedRef.current) setLoading(true)
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
      initializedRef.current = true
      return
    }
    if (allowLocal) {
      refreshLocal()
      setLoading(false)
      initializedRef.current = true
      return
    }
    setLoading(false)
    initializedRef.current = true
  // Removed `initialized` from deps — it was a stale-closure that caused double-init (Bug 7)
  }, [cloud, allowLocal, refreshLocal, loadUsersIfStaff])

  useEffect(() => {
    void refresh()
    // No supabase.auth listener needed — sessions are managed via localStorage
  }, [refresh])

  // ── Realtime: auto-update role/status when admin changes this user's profile ──
  useEffect(() => {
    if (!cloud || !supabase || !user) return
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row) return
          const updated = ensureAdminRole({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string,
            role: row.role as Role,
            phone: (row.phone as string) || undefined,
            isBlocked: (row.isBlocked as boolean) || false,
            createdAt: row.created_at as string,
          })
          if (updated) {
            setUser(updated)
            userRef.current = updated
          }
        }
      )
      .subscribe()
    return () => {
      if (supabase) void supabase.removeChannel(channel)
    }
  }, [cloud, user?.id])


  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)

      if (cloud && supabase) {
        // Search by email (primary)
        let profileRow: Record<string, unknown> | null = null
        const { data: byEmail, error: emailErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', authEmail.toLowerCase())
          .maybeSingle()
        if (emailErr) console.error('Login email lookup error:', emailErr)
        profileRow = byEmail

        // Fallback: if not found and user entered a phone number,
        // also search by the raw phone column
        if (!profileRow && !email.trim().includes('@')) {
          const rawPhone = email.trim().replace(/\D/g, '')
          const { data: byPhone, error: phoneErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone', rawPhone)
            .maybeSingle()
          if (phoneErr) console.error('Login phone lookup error:', phoneErr)
          if (byPhone) profileRow = byPhone
        }

        if (profileRow) {
          // Check PIN: matches either DB pin or local pin cache
          const dbPin = ((profileRow.pin as string) || '').trim()
          const localPin = getStoredPin(profileRow.email as string).trim()
          const hasPin = Boolean(dbPin || localPin)

          if (!hasPin) {
            return {
              ok: false,
              error: '🔑 Your account exists but has no PIN set yet. Click "Forgot PIN? Verify & Reset" below to create your PIN — it only takes 10 seconds.',
            }
          }

          const inputPin = password.trim()
          const paddedInput = padPin(inputPin)

          const pinMatch =
            (dbPin && (inputPin === dbPin || paddedInput === dbPin)) ||
            (localPin && (inputPin === localPin || paddedInput === localPin))

          if (!pinMatch) {
            return { ok: false, error: '❌ Incorrect PIN. Click "Forgot PIN?" below to reset it.' }
          }

          // Auto-sync valid PIN across localStorage and Supabase DB
          if (inputPin && inputPin.length === 4) {
            storePin(profileRow.email as string, inputPin)
            if (profileRow.phone) storePin(profileRow.phone as string, inputPin)
            if (dbPin !== inputPin) {
              void updateProfilePin(profileRow.id as string, inputPin, profileRow.email as string, profileRow.phone as string)
            }
          }

          const profile = ensureAdminRole({
            id: profileRow.id as string,
            email: profileRow.email as string,
            name: profileRow.name as string,
            role: profileRow.role as Role,
            phone: (profileRow.phone as string) || undefined,
            isBlocked: (profileRow.isBlocked as boolean) || false,
            createdAt: profileRow.created_at as string,
          })

          if (profile?.isBlocked) return { ok: false, error: '🚫 Your account has been suspended. Contact GreenVest Admin.' }
          if (!profile) return { ok: false, error: 'Profile error. Please contact support.' }

          setUser(profile)
          userRef.current = profile
          setSessionUserId(profile.id)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
        }

        return { ok: false, error: '❌ No account found with this phone/email. Please Sign Up first — it\'s free!' }
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
        // Fix: use .eq() not .or() — PostgREST misparses emails with @ and . in .or() strings
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', authEmail.toLowerCase())
          .maybeSingle()

        if (existing) {
          return { ok: false, error: 'This phone number / email is already registered. Click Login tab to sign in.' }
        }

        // Bug 5 fix: use crypto.randomUUID() so the ID is a valid UUID (not 'u-...')
        // Bug 1 fix: store PIN in `profiles.pin` column so login works on any device
        const newId = crypto.randomUUID()
        const { error: insertErr } = await supabase.from('profiles').insert({
          id: newId,
          email: authEmail.toLowerCase(),
          name: name.trim(),
          role: 'customer',
          phone: phoneVal?.trim() || null,
          pin: password,           // ← stored in DB (survives device changes)
        })

        if (insertErr) return { ok: false, error: insertErr.message || 'Signup failed. Try again.' }

        // Also cache PIN in localStorage for instant offline login
        storePin(authEmail, password)

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
        // Fix: use .eq() not .or() — PostgREST misparses emails with @ and . in .or() strings
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('id,email,name')
          .eq('email', authEmail.toLowerCase())
          .maybeSingle()

        if (profileRow) {
          // Bug 1 fix: update PIN in DB so it works on all devices
          await supabase.from('profiles').update({ pin: newPin }).eq('id', profileRow.id)
          // Also update localStorage cache
          storePin(profileRow.email, newPin)
          return { ok: true }
        }

        return { ok: false, error: 'Account not found with that email/phone. Please Sign Up first.' }
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
      storePin(user.email, newPin)
      if (user.phone) {
        storePin(user.phone, newPin)
        storePin(formatAuthIdentifier(user.phone), newPin)
      }
      if (cloud && supabase) {
        try {
          await updateProfilePin(user.id, newPin, user.email, user.phone)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
        } catch (err: any) {
          console.error('updatePassword error:', err)
          return { ok: false, error: err.message || 'Failed to update PIN in database' }
        }
      }
      return { ok: true }
    },
    [user, cloud],
  )

  const setUserRole = useCallback(
    async (userId: string, role: Role) => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
      if (user && user.id === userId) {
        setUser({ ...user, role })
      }

      if (cloud && supabase) {
        try {
          await updateProfileRole(userId, role, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
        } catch (err: any) {
          console.error('setUserRole cloud error:', err)
          showToast(`⚠️ Role update error: ${err.message || err}`, '❌', 'error')
        }
      }
    },
    [cloud, user, users],
  )

  const adminResetUserPin = useCallback(
    async (userId: string, newPin: string): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, password: newPin } : u))
      )

      if (targetEmail) storePin(targetEmail, newPin)
      if (targetPhone) {
        storePin(targetPhone, newPin)
        storePin(formatAuthIdentifier(targetPhone), newPin)
      }

      if (cloud && supabase) {
        try {
          await updateProfilePin(userId, newPin, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
          return { ok: true }
        } catch (err: any) {
          console.error('adminResetUserPin error:', err)
          return { ok: false, error: err.message || 'Failed to update PIN in database' }
        }
      }
      return { ok: true }
    },
    [cloud, users],
  )

  const toggleBlockUser = useCallback(
    async (userId: string, isBlocked: boolean): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBlocked } : u)))
      if (cloud && supabase) {
        try {
          await updateProfileBlocked(userId, isBlocked, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
          return { ok: true }
        } catch (err: any) {
          console.error('toggleBlockUser error:', err)
          return { ok: false, error: err.message || 'Failed to toggle block status' }
        }
      }
      return { ok: true }
    },
    [cloud, users],
  )

  const updateUserProfile = useCallback(
    async (data: { name?: string; phone?: string }) => {
      if (!user) return
      const cleanPhone = data.phone ? data.phone.replace(/\D/g, '').slice(-10) : undefined
      const patch = {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      }
      const updated = ensureAdminRole({ ...user, ...patch })
      setUser(updated)
      userRef.current = updated
      saveUsers(getUsers().map((u) => (u.id === user.id ? { ...u, ...patch } : u)))

      if (cloud && supabase) {
        try {
          await updateProfileDetails(user.id, patch, user.email, cleanPhone || user.phone)
          const cloudUsers = await fetchProfiles()
          if (cloudUsers && cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
        } catch (err: any) {
          console.error('updateUserProfile error:', err)
        }
      }
    },
    [user, cloud],
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
