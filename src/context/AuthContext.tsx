import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ALLOW_LOCAL_FALLBACK } from '../lib/business'
import {
  fetchProfiles,
  updateProfileRole,
  updateOwnPin,
  updateProfilePinAdmin,
  updateProfileBlocked,
  updateProfileDetails,
  updateProfileTier,
  deleteUserProfileApi,
  upgradeStaffPasswordApi,
  mapProfile,
} from '../lib/api'
import { getStaffCredentials, promptForStaffPin, type StaffCredentials } from '../lib/staffAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { formatAuthIdentifier } from '../lib/authUtils'
import { cleanDigits } from '../lib/phone'
import {
  ensureSeeded,
  getCurrentUser,
  getOrders,
  getSessionUserId,
  getUsers,
  saveCurrentUser,
  saveUsers,
  setSessionUserId,
  storePin,
  getActiveUserPin,
  clearStoredPins,
  uid,
} from '../lib/storage'
import type { Role, User } from '../types'

type AuthResult = { ok: boolean; error?: string; user?: User; mfaPending?: boolean }

interface AuthContextValue {
  user: User | null
  users: User[]
  loading: boolean
  configured: boolean
  mode: 'cloud' | 'local'
  /** True when super admin PIN is verified but email OTP not yet entered */
  mfaPending: boolean
  login: (email: string, password: string) => Promise<AuthResult>
  /** Verify the 6-digit email OTP sent to super admin's Gmail after PIN success */
  verifyAdminOtp: (code: string) => Promise<AuthResult>
  signup: (name: string, email: string, password: string, phone?: string) => Promise<AuthResult>
  logout: () => Promise<void>
  resetPassword: (name: string, email: string, newPin: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  upgradeStaffPassword: (newPassword: string, oldSecret?: string) => Promise<AuthResult>
  setUserRole: (userId: string, role: Role) => Promise<AuthResult>
  setUserTier: (userId: string, tier: import('../types').CustomerTier) => Promise<AuthResult>
  updateUserProfile: (data: { name?: string; phone?: string }) => Promise<void>
  adminResetUserPin: (userId: string, newPin: string) => Promise<AuthResult>
  toggleBlockUser: (userId: string, isBlocked: boolean) => Promise<AuthResult>
  deleteUser: (userId: string) => Promise<AuthResult>
  refresh: () => Promise<void>
  refreshUsers: () => Promise<void>
  checkAccountExists: (email: string) => Promise<boolean>
}

/** Pad 4-digit PIN to meet Supabase 6-char minimum. */
function padPin(pin: string): string {
  return pin.length < 6 ? pin + '0'.repeat(6 - pin.length) : pin
}

// ── Brute Force Rate-Limiting Helpers ──────────────────────────────
function getLoginAttemptRecord(identifier: string): { count: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(`gv_auth_lock_${identifier.toLowerCase()}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { count: 0, lockedUntil: 0 }
}

function recordFailedLoginAttempt(identifier: string): { locked: boolean; remaining: number; waitMins: number } {
  const key = `gv_auth_lock_${identifier.toLowerCase()}`
  const now = Date.now()
  const rec = getLoginAttemptRecord(identifier)
  const count = rec.count + 1
  let lockedUntil = rec.lockedUntil

  if (count >= 5) {
    lockedUntil = now + 15 * 60 * 1000 // 15 minutes lockout
  }

  try {
    localStorage.setItem(key, JSON.stringify({ count, lockedUntil }))
  } catch {}

  const remaining = Math.max(0, 5 - count)
  const waitMins = Math.ceil((lockedUntil - now) / 60000)
  return { locked: count >= 5, remaining, waitMins }
}

function clearLoginAttempts(identifier: string): void {
  try {
    localStorage.removeItem(`gv_auth_lock_${identifier.toLowerCase()}`)
  } catch {}
}


// eslint-disable-next-line react/only-export-components -- context must be exported for useAuth.ts hook companion file
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => {
    ensureSeeded()
    return getUsers()
  })
  const [user, setUser] = useState<User | null>(() => {
    ensureSeeded()
    const cached = getCurrentUser()
    if (cached) return cached
    const sessionUserId = getSessionUserId()
    if (!sessionUserId) return null
    const all = getUsers()
    return all.find((u) => u.id === sessionUserId) || null
  })
  const [loading, setLoading] = useState(false)
  // MFA state: set after PIN success for super admin, cleared after OTP verified
  const [mfaPending, setMfaPending] = useState(false)
  const mfaProfileRef = useRef<User | null>(null)
  const mfaPinRef = useRef<string>('')
  // Use a ref for initialized so refresh() doesn't re-create itself (Bug 7 fix)
  const initializedRef = useRef(false)
  const cloud = isSupabaseConfigured
  const allowLocal = ALLOW_LOCAL_FALLBACK && !cloud
  // Use a ref so applyCloudSession can read the latest user without being recreated every render.
  // Must be initialized lazily to match whatever user useState resolved to.
  const userRef = useRef<User | null>((() => {
    const cached = getCurrentUser()
    if (cached) return cached
    const sessionUserId = getSessionUserId()
    if (!sessionUserId) return null
    const all = getUsers()
    return all.find((u) => u.id === sessionUserId) || null
  })())

  const loadUsersIfStaff = useCallback(async (profile: User | null) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'seller')) {
      setUsers(profile ? [profile] : [])
      return
    }

    if (cloud) {
      let cloudUsers: User[] = []
      try {
        const callerPin = getActiveUserPin(profile)
        cloudUsers = await fetchProfiles(profile.id, callerPin)
      } catch {
        cloudUsers = []
      }

      const map = new Map<string, User>()
      cloudUsers.forEach((u) => {
        if (u.id) map.set(u.id, u)
      })
      if (profile && profile.id) {
        map.set(profile.id, profile)
      }
      const finalUsers = Array.from(map.values())
      setUsers(finalUsers)
      saveUsers(finalUsers)
      return
    }

    ensureSeeded()
    const localUsers = getUsers()
    const map = new Map<string, User>()
    localUsers.forEach((u) => {
      if (u.email) map.set(u.email.toLowerCase(), u)
    })
    if (profile && profile.email) {
      map.set(profile.email.toLowerCase(), profile)
    }
    setUsers(Array.from(map.values()))
  }, [cloud])


  const refreshLocal = useCallback(() => {
    ensureSeeded()
    const id = getSessionUserId()
    const all = getUsers()
    setUsers(all)
    if (!id) {
      if (userRef.current) {
        setUser(null)
        userRef.current = null
      }
    } else {
      const found = all.find((u) => u.id === id) || null
      if (found) {
        setUser(found)
        userRef.current = found
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    // Bug 7 fix: use ref so this callback isn't recreated each time initialized changes
    if (!initializedRef.current) setLoading(true)
    if (cloud && supabase) {
      // 1. Check if user just landed via a Magic Link email redirect or active Supabase session
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionEmail = sessionData?.session?.user?.email
        if (sessionEmail) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', sessionEmail.toLowerCase())
            .maybeSingle()
          if (profileRow) {
            const profile = mapProfile(profileRow as any)
            if (profile) {
              setUser(profile)
              userRef.current = profile
              setSessionUserId(profile.id)
              await loadUsersIfStaff(profile)
              setLoading(false)
              initializedRef.current = true
              return
            }
          }
        }
      } catch (err) {
        console.warn('Supabase session check error:', err)
      }

      // 2. Restore session from localStorage userId or cached profile
      const localId = getSessionUserId()
      const cachedProfile = getCurrentUser()

      if (localId) {
        // PIN-auth users have no JWT — restore from local cache (RLS blocks anon profile reads)
        if (cachedProfile && cachedProfile.id === localId) {
          if (cachedProfile.isBlocked) {
            saveCurrentUser(null)
            setUser(null)
            userRef.current = null
            clearStoredPins()
          } else {
            setUser(cachedProfile)
            userRef.current = cachedProfile
            await loadUsersIfStaff(cachedProfile)
          }
        } else if (!cachedProfile) {
          setSessionUserId(null)
        }
      } else if (cachedProfile) {
        setUser(cachedProfile)
        userRef.current = cachedProfile
        setSessionUserId(cachedProfile.id)
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

  const refreshUsers = useCallback(async () => {
    if (userRef.current) {
      await loadUsersIfStaff(userRef.current)
    } else if (user) {
      await loadUsersIfStaff(user)
    }
  }, [user, loadUsersIfStaff])

  useEffect(() => {
    void refresh()
    const client = supabase
    if (!cloud || !client) return

    // 🔗 Magic Link listener:
    // When you tap "Sign in" in your Gmail, this catches the session and immediately logs you in!
    const { data: authSub } = client.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.email) {
        try {
          const { data: profileRow } = await client
            .from('profiles')
            .select('*')
            .eq('email', session.user.email.toLowerCase())
            .maybeSingle()
          if (profileRow) {
            const profile = mapProfile(profileRow as any)
            if (profile) {
              setMfaPending(false)
              mfaProfileRef.current = null
              setUser(profile)
              userRef.current = profile
              setSessionUserId(profile.id)
              await loadUsersIfStaff(profile)
              if (
                (profile.role === 'admin' || profile.isSuperAdmin) &&
                typeof window !== 'undefined' &&
                (window.location.pathname === '/' || window.location.pathname === '/auth')
              ) {
                window.location.replace(`${window.location.origin}/admin`)
              }
            }
          }
        } catch (err) {
          console.warn('Magic link session hydrate error:', err)
        }
      }
    })

    return () => {
      authSub?.subscription?.unsubscribe()
    }
  }, [cloud, refresh, loadUsersIfStaff])

  // ── Realtime: auto-update role/status when admin changes this user's profile ──
  const currentUserId = user?.id
  useEffect(() => {
    if (!cloud || !supabase || !currentUserId) return
    const channel = supabase
      .channel(`profile-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as any
          if (!row) return
          const updated = mapProfile(row)
          if (updated) {
            setUser(updated)
            userRef.current = updated
            if (updated.role === 'admin' || updated.role === 'seller') {
              void loadUsersIfStaff(updated)
            }
          }
        }
      )
      .subscribe()
    return () => {
      if (supabase) void supabase.removeChannel(channel)
    }
  }, [cloud, currentUserId, loadUsersIfStaff])

  // ── Staff Realtime: auto-sync newly registered customers and live profile edits ──
  useEffect(() => {
    if (!cloud || !supabase || !user) return
    const isStaff = user.role === 'admin' || user.role === 'seller'
    if (!isStaff) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const staffChannel = supabase
      .channel('staff-all-profiles-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            void loadUsersIfStaff(user)
          }, 800)
        }
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      if (supabase) void supabase.removeChannel(staffChannel)
    }
  }, [cloud, user, loadUsersIfStaff])


  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)

      // 🛡️ Brute-Force Protection: Check lockout
      const lockRecord = getLoginAttemptRecord(authEmail)
      if (lockRecord.lockedUntil && lockRecord.lockedUntil > Date.now()) {
        const remainingMins = Math.ceil((lockRecord.lockedUntil - Date.now()) / 60000)
        return {
          ok: false,
          error: `🔒 Security Lockout: Too many failed login attempts. Please wait ${remainingMins} minute(s) before trying again.`,
        }
      }

      if (cloud && supabase) {
        // 🔒 Security: Use server-side login_with_pin RPC — never exposes PIN column to the client.
        // The RPC validates credentials in the DB and returns safe profile fields only on success.
        const inputPin = password.trim()
        const paddedInput = padPin(inputPin)

        // Check local brute-force lockout first (client-side early exit)
        // then verify via secure RPC
        const { data: rpcResult, error: rpcErr } = await supabase
          .rpc('login_with_pin', { p_identifier: email.trim(), p_pin: inputPin })

        if (rpcErr) {
          console.error('login_with_pin RPC error:', rpcErr)
          // Fallback: try padded pin
        }

        const rpcData = rpcResult as { ok: boolean; error?: string; id?: string; email?: string; name?: string; role?: string; phone?: string; is_super_admin?: boolean; is_blocked?: boolean; tier?: string } | null

        if (rpcErr && !rpcData) {
          // True infrastructure failure — RPC call didn't execute at all
          console.error('login_with_pin hard failure:', rpcErr)
          return { ok: false, error: '❌ Login service temporarily unavailable. Please try again.' }
        }
        if (!rpcData) {
          // Schema cache miss or unexpected null
          return { ok: false, error: '❌ Login is starting up. Please wait 10 seconds and try again.' }
        }

        if (!rpcData.ok) {
          const serverMsg = rpcData.error || 'Invalid credentials'

          // If it's a PIN error, try padded PIN as fallback
          if (serverMsg === 'Invalid credentials' && paddedInput !== inputPin) {
            const { data: rpcResult2 } = await supabase
              .rpc('login_with_pin', { p_identifier: email.trim(), p_pin: paddedInput })
            const rpcData2 = rpcResult2 as typeof rpcData
            if (rpcData2?.ok) {
              // padded pin worked — continue with rpcData2
              return _completeLogin(rpcData2, paddedInput)
            }
          }

          // Track failed attempt for brute-force protection
          const failed = recordFailedLoginAttempt(authEmail)
          if (failed.locked) {
            return { ok: false, error: `🔒 Account locked for 15 minutes due to 5 consecutive failed PIN attempts.` }
          }
          if (serverMsg === 'Invalid credentials') {
            return {
              ok: false,
              error: `❌ Incorrect PIN. (${failed.remaining} attempt${failed.remaining === 1 ? '' : 's'} remaining before 15-minute security lockout).`,
            }
          }
          if (serverMsg.includes('no account') || serverMsg.includes('No account')) {
            return { ok: false, error: '❌ No account found with this phone/email. Please Sign Up first — it\'s free!' }
          }
          return { ok: false, error: serverMsg }
        }

        return _completeLogin(rpcData, inputPin)

        async function _completeLogin(
          data: NonNullable<typeof rpcData>,
          usedPin: string,
        ): Promise<AuthResult> {
          clearLoginAttempts(authEmail)

          // Cache PIN/password locally for offline fallback and Staff Gateway RPC
          if (usedPin && usedPin.length >= 4) {
            if (data.id) storePin(data.id, usedPin)
            if (data.email) storePin(data.email, usedPin)
            if (data.phone) storePin(data.phone, usedPin)
            storePin(authEmail, usedPin)
          }

          const profileRow = {
            id: data.id,
            email: data.email,
            name: data.name,
            role: data.role,
            phone: data.phone,
            is_super_admin: data.is_super_admin,
            is_blocked: data.is_blocked,
            tier: data.tier,
            created_at: undefined,
          }
          const profile = mapProfile(profileRow as any)
          if (!profile) return { ok: false, error: 'Profile error. Please contact support.' }
          if (profile.isBlocked) return { ok: false, error: '🚫 Your account has been suspended. Please contact support.' }
          if ((data as any).needs_password_upgrade || (profile.role !== 'customer' && usedPin && usedPin.length < 8)) {
            profile.needsPasswordUpgrade = true
          }

          // 🔐 Super Admin 2FA: Send magic link to Gmail
          if (profile.isSuperAdmin && supabase) {
            try {
              const { error: otpErr } = await supabase.auth.signInWithOtp({
                email: profile.email,
                options: {
                  shouldCreateUser: true,
                  emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined,
                },
              })
              if (otpErr) {
                console.error('Super Admin OTP send failed:', otpErr)
                return { ok: false, error: `Failed to send verification code to ${profile.email}: ${otpErr.message}` }
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err)
              return { ok: false, error: `Error sending security code to Gmail: ${msg}` }
            }
            mfaPinRef.current = usedPin
            mfaProfileRef.current = profile
            setMfaPending(true)
            return { ok: true, mfaPending: true, user: profile }
          }

          setUser(profile)
          userRef.current = profile
          saveCurrentUser(profile)
          await loadUsersIfStaff(profile)
          return { ok: true, user: profile }
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
      if (found.isBlocked) return { ok: false, error: '🚫 Your account has been suspended. Please contact support.' }
      setSessionUserId(found.id)
      setUser(found)
      userRef.current = found
      setUsers(all)
      return { ok: true, user: found }
    },
    [cloud, allowLocal, loadUsersIfStaff],
  )

  const verifyAdminOtp = useCallback(
    async (code: string): Promise<AuthResult> => {
      const pendingProfile = mfaProfileRef.current
      if (!pendingProfile || !pendingProfile.isSuperAdmin) {
        return { ok: false, error: 'No super admin verification session pending.' }
      }
      if (!cloud || !supabase) {
        return { ok: false, error: 'Cloud service unavailable.' }
      }

      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: pendingProfile.email,
          token: code.trim(),
          type: 'email',
        })

        if (error || !data) {
          return { ok: false, error: '❌ Invalid or expired verification code. Please check your Gmail.' }
        }

        // Super Admin 2FA passed! Complete session and preserve PIN for Staff RPCs
        if (mfaPinRef.current) {
          if (pendingProfile.id) storePin(pendingProfile.id, mfaPinRef.current)
          if (pendingProfile.email) storePin(pendingProfile.email, mfaPinRef.current)
          if (pendingProfile.phone) storePin(pendingProfile.phone, mfaPinRef.current)
          mfaPinRef.current = ''
        }

        setMfaPending(false)
        mfaProfileRef.current = null
        setUser(pendingProfile)
        userRef.current = pendingProfile
        saveCurrentUser(pendingProfile)
        await loadUsersIfStaff(pendingProfile)
        return { ok: true, user: pendingProfile }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg || 'Verification failed.' }
      }
    },
    [cloud, loadUsersIfStaff],
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
        // Atomic Registration: Prevents duplicate phone/email registration and race conditions
        const targetPhone = phoneVal?.trim() || cleanDigits(email)
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('register_customer_atomic', {
          p_name: name.trim(),
          p_email: authEmail.toLowerCase(),
          p_phone: targetPhone || '',
          p_pin: password.trim(),
        })

        if (rpcErr) {
          console.error('register_customer_atomic error:', rpcErr)
          return { ok: false, error: 'Registration service temporarily unavailable. Please try again.' }
        }

        const resData = rpcRes as { ok: boolean; error?: string; user?: any } | null
        if (!resData?.ok) {
          return { ok: false, error: resData?.error || 'Signup failed. Please try again.' }
        }

        const newUserObj = resData.user
        storePin(authEmail, password.trim())

        const profile: User = {
          id: newUserObj.id,
          email: newUserObj.email,
          name: newUserObj.name,
          role: 'customer',
          phone: newUserObj.phone || undefined,
          createdAt: newUserObj.createdAt || new Date().toISOString(),
        }
        setUser(profile)
        userRef.current = profile
        saveCurrentUser(profile)
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
    [cloud, allowLocal],
  )

  const logout = useCallback(async () => {
    if (cloud && supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        /* ignore */
      }
    }
    saveCurrentUser(null)
    setUser(null)
    userRef.current = null
    setUsers([])
    clearStoredPins()
  }, [cloud])

  const resetPassword = useCallback(
    async (nameInput: string, email: string, newPin: string): Promise<AuthResult> => {
      const authEmail = formatAuthIdentifier(email)

      if (newPin.length !== 4 || /\D/.test(newPin)) {
        return { ok: false, error: 'PIN must be exactly 4 digits.' }
      }

      if (cloud && supabase) {
        // Atomic & Secure: Allows unauthenticated PIN reset while validating registered name via RPC
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('reset_pin_with_verification', {
          p_identifier: email.trim(),
          p_name: nameInput.trim(),
          p_new_pin: newPin.trim(),
        })

        if (rpcErr) {
          console.error('reset_pin_with_verification RPC error:', rpcErr)
          return { ok: false, error: 'Password reset service temporarily unavailable. Please try again.' }
        }

        const resData = rpcRes as { ok: boolean; error?: string; message?: string } | null
        if (!resData?.ok) {
          return { ok: false, error: resData?.error || 'PIN reset failed.' }
        }

        storePin(authEmail, newPin.trim())
        storePin(email.trim(), newPin.trim())
        const cleanPh = email.replace(/\D/g, '').slice(-10)
        if (cleanPh.length === 10) storePin(cleanPh, newPin.trim())
        return { ok: true }
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
    [cloud],
  )

  const updatePassword = useCallback(
    async (newPin: string): Promise<AuthResult> => {
      if (!user) return { ok: false, error: 'Not logged in.' }
      const isStaff = user.role === 'admin' || user.role === 'seller' || user.role === 'rider' || user.isSuperAdmin
      if (isStaff) {
        if (newPin.trim().length < 8) {
          return { ok: false, error: 'Staff password must be at least 8 characters long.' }
        }
      } else {
        if (newPin.length !== 4 || /\D/.test(newPin)) {
          return { ok: false, error: 'Customer PIN must be exactly 4 digits.' }
        }
      }
      const oldPin = getActiveUserPin(user)
      if (cloud && supabase) {
        try {
          if (!oldPin) {
            return { ok: false, error: 'Session expired. Please log in again before changing your PIN.' }
          }
          await updateOwnPin(user.id, oldPin, newPin)
          storePin(user.email, newPin)
          if (user.phone) {
            storePin(user.phone, newPin)
            storePin(formatAuthIdentifier(user.phone), newPin)
          }
          if (user.id) storePin(user.id, newPin)
          const staffCreds = getStaffCredentials(user)
          if (staffCreds && (user.role === 'admin' || user.role === 'seller')) {
            const cloudUsers = await fetchProfiles(staffCreds.callerId, staffCreds.callerPin)
            if (cloudUsers.length > 0) {
              setUsers(cloudUsers)
              saveUsers(cloudUsers)
            }
          }
        } catch (err: unknown) {
          console.error('updatePassword error:', err)
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: msg || 'Failed to update PIN in database' }
        }
      } else {
        storePin(user.email, newPin)
        if (user.phone) {
          storePin(user.phone, newPin)
          storePin(formatAuthIdentifier(user.phone), newPin)
        }
        if (user.id) storePin(user.id, newPin)
      }
      return { ok: true }
    },
    [user, cloud],
  )

  const upgradeStaffPassword = useCallback(
    async (newPassword: string, oldSecret?: string): Promise<AuthResult> => {
      if (!user) return { ok: false, error: 'Not logged in.' }
      if (newPassword.trim().length < 8) {
        return { ok: false, error: 'Staff password must be at least 8 characters long.' }
      }
      const callerPin = oldSecret?.trim() || getActiveUserPin(user)
      if (cloud && supabase) {
        try {
          await upgradeStaffPasswordApi(user.id, callerPin, newPassword.trim())
          storePin(user.id, newPassword.trim())
          if (user.email) storePin(user.email, newPassword.trim())
          if (user.phone) storePin(user.phone, newPassword.trim())
          const updatedUser = { ...user, needsPasswordUpgrade: false }
          setUser(updatedUser)
          userRef.current = updatedUser
          saveCurrentUser(updatedUser)
          return { ok: true }
        } catch (err: any) {
          return { ok: false, error: err?.message || 'Failed to upgrade staff password.' }
        }
      } else {
        storePin(user.id, newPassword.trim())
        if (user.email) storePin(user.email, newPassword.trim())
        if (user.phone) storePin(user.phone, newPassword.trim())
        const updatedUser = { ...user, needsPasswordUpgrade: false }
        setUser(updatedUser)
        userRef.current = updatedUser
        saveCurrentUser(updatedUser)
        return { ok: true }
      }
    },
    [user, cloud],
  )

  const executeWithStaffAuth = useCallback(
    async <T,>(
      operation: (staff: StaffCredentials) => Promise<T>,
    ): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
      if (!user?.id) {
        return { ok: false, error: 'You must be logged in as staff to perform this action.' }
      }

      let staff = getStaffCredentials(user, false)
      if (!staff?.callerPin && typeof window !== 'undefined') {
        const pin = promptForStaffPin(user)
        if (pin) {
          staff = { callerId: user.id, callerPin: pin }
        } else {
          // Fallback: pass callerId so active Supabase session (auth.uid()) can authorize in PostgreSQL
          staff = { callerId: user.id, callerPin: '' }
        }
      }

      if (!staff) {
        return { ok: false, error: 'Staff session expired. Please log in again.' }
      }

      try {
        const result = await operation(staff)
        return { ok: true, data: result }
      } catch (err: any) {
        const errMsg = err?.message || String(err)
        const isCredIssue =
          errMsg.includes('Invalid staff credentials') ||
          errMsg.includes('Invalid PIN') ||
          errMsg.includes('Access denied')

        if (isCredIssue && typeof window !== 'undefined') {
          const pin = promptForStaffPin(user)
          if (pin) {
            try {
              const retryStaff = { callerId: user.id, callerPin: pin }
              const result = await operation(retryStaff)
              return { ok: true, data: result }
            } catch (retryErr: any) {
              return { ok: false, error: retryErr?.message || 'Action authorization failed.' }
            }
          }
        }
        return { ok: false, error: errMsg }
      }
    },
    [user],
  )

  const setUserRole = useCallback(
    async (userId: string, role: Role): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''
      const actualId = targetUser?.id || userId

      // 🛡️ Super Admin Protection: Nobody can alter the Super Admin's role
      if (targetUser?.isSuperAdmin) {
        return { ok: false, error: '🛡️ Super Admin Shield: Master Administrator role cannot be modified.' }
      }

      // 👑 Only Super Admin can promote someone to Admin
      if (role === 'admin' && !user?.isSuperAdmin) {
        return { ok: false, error: '👑 Permission Denied: Only Super Admin can assign the Admin role.' }
      }

      // 👑 Only Super Admin can revoke or change an existing Admin's role
      if (targetUser?.role === 'admin' && role !== 'admin' && !user?.isSuperAdmin) {
        return { ok: false, error: '👑 Permission Denied: Only Super Admin can revoke the Admin role.' }
      }

      // 1. Optimistic update
      setUsers((prev) =>
        prev.map((u) =>
          u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
            ? { ...u, role }
            : u,
        ),
      )
      if (user && (user.id === actualId || user.id === userId || (targetEmail && user.email === targetEmail))) {
        setUser({ ...user, role })
      }

      // 2. Persist to Local Storage
      const currentStored = getUsers()
      const updatedStored = currentStored.map((u) =>
        u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
          ? { ...u, role }
          : u,
      )
      saveUsers(updatedStored)

      if (cloud && supabase && user) {
        const result = await executeWithStaffAuth(async (staff) => {
          await updateProfileRole(actualId, role, staff, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles(staff.callerId, staff.callerPin)
          if (cloudUsers && cloudUsers.length > 0) {
            // Verify if cloud actually accepted the new role
            const updatedCloudUser = cloudUsers.find(
              (cu) => cu.id === actualId || cu.id === userId || (targetEmail && cu.email === targetEmail),
            )
            if (updatedCloudUser && updatedCloudUser.role !== role) {
              console.error('Role update was rejected by Supabase database. Reverting local state.')
              setUsers(cloudUsers)
              saveUsers(cloudUsers)
              throw new Error('Database rejected role update. Please ensure user privileges are configured.')
            }
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
        })

        if (!result.ok) {
          console.error('setUserRole cloud error:', result.error)
          const currentReal = getUsers()
          setUsers(currentReal)
          return {
            ok: false,
            error: result.error || 'Failed to save role update in Supabase database.',
          }
        }
        return { ok: true }
      }
      return { ok: true }
    },
    [cloud, user, users],
  )

  const setUserTier = useCallback(
    async (userId: string, tier: import('../types').CustomerTier): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const actualId = targetUser?.id || userId

      setUsers((prev) =>
        prev.map((u) =>
          u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
            ? { ...u, tier }
            : u,
        ),
      )
      if (user && (user.id === actualId || user.id === userId || (targetEmail && user.email === targetEmail))) {
        setUser({ ...user, tier })
      }

      const currentStored = getUsers()
      const updatedStored = currentStored.map((u) =>
        u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
          ? { ...u, tier }
          : u,
      )
      saveUsers(updatedStored)

      if (cloud && user) {
        try {
          await executeWithStaffAuth(async (staff) => {
            await updateProfileTier(actualId, tier, staff)
          })
        } catch (err) {
          console.warn('Failed to sync tier to Supabase:', err)
        }
      }

      return { ok: true }
    },
    [cloud, user, users],
  )

  const adminResetUserPin = useCallback(
    async (userId: string, newPin: string): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''
      const actualId = targetUser?.id || userId

      const isTargetStaff = targetUser?.isSuperAdmin || targetUser?.role === 'admin' || targetUser?.role === 'seller' || targetUser?.role === 'rider'
      if (isTargetStaff) {
        if (newPin.trim().length < 8) {
          return { ok: false, error: 'Staff password must be at least 8 characters long.' }
        }
      } else {
        if (newPin.length !== 4 || /\D/.test(newPin)) {
          return { ok: false, error: 'Customer PIN must be exactly 4 digits.' }
        }
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
            ? { ...u, password: newPin }
            : u,
        ),
      )

      if (targetEmail) storePin(targetEmail, newPin)
      if (targetPhone) {
        storePin(targetPhone, newPin)
        storePin(formatAuthIdentifier(targetPhone), newPin)
      }

      if (cloud && supabase && user) {
        const result = await executeWithStaffAuth(async (staff) => {
          await updateProfilePinAdmin(actualId, newPin, staff)
          const cloudUsers = await fetchProfiles(staff.callerId, staff.callerPin)
          if (cloudUsers.length > 0) {
            setUsers(cloudUsers)
            saveUsers(cloudUsers)
          }
        })
        if (!result.ok) {
          return { ok: false, error: result.error || 'Failed to update PIN in database' }
        }
        return { ok: true }
      }
      return { ok: true }
    },
    [cloud, user, users],
  )

  const toggleBlockUser = useCallback(
    async (userId: string, isBlocked: boolean): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''
      const actualId = targetUser?.id || userId

      setUsers((prev) =>
        prev.map((u) =>
          u.id === actualId || u.id === userId || (targetEmail && u.email === targetEmail)
            ? { ...u, isBlocked }
            : u,
        ),
      )
      if (cloud && supabase && user) {
        const result = await executeWithStaffAuth(async (staff) => {
          await updateProfileBlocked(actualId, isBlocked, staff, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles(staff.callerId, staff.callerPin)
          if (cloudUsers && cloudUsers.length > 0) {
            const merged = cloudUsers.map((cu) => {
              if (cu.id === actualId || cu.id === userId || (targetEmail && cu.email === targetEmail)) {
                return { ...cu, isBlocked }
              }
              return cu
            })
            setUsers(merged)
            saveUsers(merged)
          }
        })
        if (!result.ok) {
          return { ok: false, error: result.error || 'Failed to toggle block status' }
        }
        return { ok: true }
      }
      return { ok: true }
    },
    [cloud, user, users],
  )

  const deleteUser = useCallback(
    async (userId: string): Promise<AuthResult> => {
      const targetUser = users.find((u) => u.id === userId || u.email === userId || u.phone === userId)
      const targetEmail = targetUser?.email || ''
      const targetPhone = targetUser?.phone || ''
      const actualId = targetUser?.id || userId

      // 🛡️ Super Admin Shield: Master accounts cannot be deleted
      if (targetUser?.isSuperAdmin) {
        return {
          ok: false,
          error: '🛡️ Super Admin Shield: Master Administrator account cannot be deleted.',
        }
      }

      // 👑 Only Super Admin can delete another Administrator
      if (targetUser?.role === 'admin' && !user?.isSuperAdmin) {
        return {
          ok: false,
          error: '👑 Permission Denied: Only Super Admin can delete an Administrator account.',
        }
      }

      // Check self-deletion
      if (user && (user.id === actualId || (targetEmail && user.email.toLowerCase() === targetEmail.toLowerCase()))) {
        return {
          ok: false,
          error: 'You cannot delete your own logged-in administrator account.',
        }
      }

      // Safety Check: Active orders in transit
      try {
        const activeOrders = getOrders().filter(
          (o) =>
            (o.userId === actualId || (targetPhone && o.phone === targetPhone)) &&
            ['pending', 'advance_paid', 'confirmed', 'out_for_delivery'].includes(o.status),
        )
        if (activeOrders.length > 0) {
          return {
            ok: false,
            error: `⚠️ Cannot delete: Customer has ${activeOrders.length} active order(s) in transit. Wait until orders are delivered or cancelled before deleting.`,
          }
        }
      } catch {}

      // 1. Optimistic local delete
      setUsers((prev) => prev.filter((u) => u.id !== actualId && (!targetEmail || u.email !== targetEmail)))
      saveUsers(getUsers().filter((u) => u.id !== actualId && (!targetEmail || u.email !== targetEmail)))

      // 2. Cloud delete
      if (cloud && supabase && user) {
        const result = await executeWithStaffAuth(async (staff) => {
          await deleteUserProfileApi(actualId, staff, targetEmail, targetPhone)
          const cloudUsers = await fetchProfiles(staff.callerId, staff.callerPin)
          setUsers(cloudUsers)
          saveUsers(cloudUsers)
        })
        if (!result.ok) {
          const currentReal = getUsers()
          setUsers(currentReal)
          return { ok: false, error: result.error || 'Failed to delete user from Supabase database' }
        }
        return { ok: true }
      }

      return { ok: true }
    },
    [cloud, user, users],
  )

  const updateUserProfile = useCallback(
    async (data: { name?: string; phone?: string }) => {
      if (!user) return
      const cleanPhone = data.phone ? data.phone.replace(/\D/g, '').slice(-10) : undefined
      const patch = {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      }
      const updated = { ...user, ...patch }
      setUser(updated)
      userRef.current = updated
      saveUsers(getUsers().map((u) => (u.id === user.id ? { ...u, ...patch } : u)))

      if (cloud && supabase) {
        try {
          const callerPin = getActiveUserPin(user)
          if (!callerPin) return
          await updateProfileDetails(user.id, patch, callerPin)
        } catch (err: unknown) {
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

      // 3️⃣ Try Supabase (calls lightweight check_account_exists RPC, safe for anon)
      if (cloud && supabase) {
        try {
          const { data: exists, error: rpcErr } = await supabase.rpc('check_account_exists', {
            p_identifier: authEmail,
          })
          if (!rpcErr && exists) return true
          if (authEmail !== normalEmail) {
            const { data: exists2, error: rpcErr2 } = await supabase.rpc('check_account_exists', {
              p_identifier: normalEmail,
            })
            if (!rpcErr2 && exists2) return true
          }
        } catch {
          /* Fallback gracefully */
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
      mfaPending,
      login,
      verifyAdminOtp,
      signup,
      logout,
      resetPassword,
      updatePassword,
      upgradeStaffPassword,
      setUserRole,
      setUserTier,
      updateUserProfile,
      adminResetUserPin,
      toggleBlockUser,
      deleteUser,
      refresh,
      refreshUsers,
      checkAccountExists,
    }),
    [
      user,
      users,
      loading,
      cloud,
      allowLocal,
      mfaPending,
      login,
      verifyAdminOtp,
      signup,
      logout,
      resetPassword,
      updatePassword,
      upgradeStaffPassword,
      setUserRole,
      setUserTier,
      updateUserProfile,
      adminResetUserPin,
      toggleBlockUser,
      deleteUser,
      refresh,
      refreshUsers,
      checkAccountExists,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

