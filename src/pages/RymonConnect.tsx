import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  type RymonAccount,
  type RymonLicense,
  type RymonActivity,
  type StreamerControlRecord,
  loginWithCredentials,
  verifyLicenseKey,
  fetchAllLicenses,
  fetchAllAccounts,
  fetchAllActivities,
  generateLicenseKeyBackend,
  topUpUserBalanceBackend,
  resetHwidBackend,
  deleteLicenseBackend,
  deleteAccountBackend,
  bulkDeleteKeysBackend,
  toggleBanStatusBackend,
  extendLicenseBackend,
  selfServiceResetKeyHwidBackend,
  SOVEREIGN_CONNECT_CONFIG,
  type RymonReferral,
  fetchReferralCodes,
  createReferralCode,
  deleteReferralCode,
  registerWithReferral,
  renewUserSubscriptionBackend,
  updateUserPermissionsBackend,
  togglePauseLicenseBackend,
  bulkTogglePauseAllKeysBackend,
  bulkResetAllHwidBackend,
  bulkExtendAllKeysBackend,
  DEFAULT_KEY_PRICES,
  getGlobalPriceMap,
  saveGlobalPriceMap,
  getAllUserCustomPriceMaps,
  getUserCustomPriceMap,
  saveUserCustomPriceMap,
  clearUserCustomPriceMap,
  getEffectivePriceMap,
  syncPricingFromSupabase,
  calculateExtensionCost,
  fetchAllStreamerControls,
  isStreamerKeyActivelyPlaying,
  buildDefaultStreamerControlPayload,
  fetchRenderVipState,
  warmRenderVipBridge,
  sendRenderVipCommand,
  sendRenderVipPatch,
  type SovereignSecurityPolicy,
  getSovereignSecurityPolicy,
  saveSovereignSecurityPolicy,
  syncSecurityPolicyFromSupabase,
  resetUserPasswordBackend,
  type RegisteredApp,
  getLocalRegisteredApps,
  fetchRegisteredApps,
  addRegisteredApp,
  deleteRegisteredApp,
  saveStoredAccounts
} from '../lib/rymonBackend'
import RymonAnimatedLogo from '../components/RymonAnimatedLogo'

type TabType =
  | 'overview'
  | 'remote'
  | 'generate'
  | 'keys'
  | 'users'
  | 'connect-api'
  | 'apps'
  | 'referrals'
  | 'add-balance'
  | 'delete'
  | 'extend'
  | 'advance'

const THEME_NAMES = ['Cyber Blue', 'Neon Pink', 'Emerald', 'Violet', 'Amber']

const DEFAULT_ANON_STREAMER: RymonAccount = {
  id: 'usr-streamer',
  username: 'Streamer VIP',
  email: 'streamer@greenvest.shop',
  role: 'streamer',
  balance: 0,
  uplink: 'debajoyti',
  status: 'ACTIVE'
}

// ── Rate Limiting & Brute-Force Lockout Engine (5-Minute Window) ──
interface RymonThrottleRecord {
  count: number
  lockedUntil: number
}

function getRymonThrottle(key: string): RymonThrottleRecord {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as RymonThrottleRecord
      if (parsed.lockedUntil && Date.now() > parsed.lockedUntil) {
        localStorage.removeItem(key)
        return { count: 0, lockedUntil: 0 }
      }
      return parsed
    }
  } catch {}
  return { count: 0, lockedUntil: 0 }
}

function recordRymonFailedAttempt(
  key: string,
  maxAttempts = 5,
  lockDurationMs = 5 * 60 * 1000
): { locked: boolean; remaining: number; waitSecs: number } {
  const now = Date.now()
  const rec = getRymonThrottle(key)
  const count = rec.count + 1
  let lockedUntil = rec.lockedUntil

  if (count >= maxAttempts) {
    lockedUntil = now + lockDurationMs
  }

  try {
    localStorage.setItem(key, JSON.stringify({ count, lockedUntil }))
  } catch {}

  const remaining = Math.max(0, maxAttempts - count)
  const waitSecs = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  return { locked: count >= maxAttempts, remaining, waitSecs }
}

function clearRymonThrottle(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function formatLockCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function RymonConnect() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }

  // Auth Gateway State (Dual Mode: Staff Username/Password vs Streamer Key)
  const [authMode, setAuthMode] = useState<'staff' | 'key'>('staff')
  const [staffUsername, setStaffUsername] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Rate Limiting & Brute-Force Lockout State (5-min lock duration)
  const [staffLockSeconds, setStaffLockSeconds] = useState(0)
  const [keyLockSeconds, setKeyLockSeconds] = useState(0)
  const [lastAuthSubmitTime, setLastAuthSubmitTime] = useState(0)

  // Authenticated Session State
  const [currentUser, setCurrentUser] = useState<RymonAccount | null>(null)
  const isRootOwner = currentUser?.username?.toLowerCase() === 'debajoyti'
  const isOwner = currentUser?.role === 'owner'
  const isAdmin = currentUser?.role === 'admin'
  const isReseller = currentUser?.role === 'reseller'
  const isStreamer = currentUser?.role === 'streamer'
  const isStaff = isOwner || isAdmin || isReseller
  const [currentKey, setCurrentKey] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)



  // Streamer Telemetry State
  const [record, setRecord] = useState<StreamerControlRecord | null>(null)
  const [expiryDate, setExpiryDate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState('--d --h --m --s')
  const [ping, setPing] = useState(28)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live Database Collections
  const [keysList, setKeysList] = useState<RymonLicense[]>([])
  const [usersList, setUsersList] = useState<RymonAccount[]>([])
  const [activities, setActivities] = useState<RymonActivity[]>([])
  const [streamerControls, setStreamerControls] = useState<StreamerControlRecord[]>([])

  const keysListRef = useRef(keysList)
  keysListRef.current = keysList
  const usersListRef = useRef(usersList)
  usersListRef.current = usersList
  const streamerControlsRef = useRef(streamerControls)
  streamerControlsRef.current = streamerControls

  // Dynamic Pricing Management State (Owner)
  const [globalPrices, setGlobalPrices] = useState<Record<string, number>>(() => getGlobalPriceMap())
  const [targetPriceUser, setTargetPriceUser] = useState<string>('')
  const [customUserPrices, setCustomUserPrices] = useState<Record<string, number>>(() => getGlobalPriceMap())
  const [allCustomUserMaps, setAllCustomUserMaps] = useState<Record<string, Record<string, number>>>(() =>
    getAllUserCustomPriceMaps()
  )

  // Generate Key Form State
  const [genGame, setGenGame] = useState<string>(() => localStorage.getItem('rymon_selected_gen_game') || 'Free Fire MAX')
  const [genCreatedGame, setGenCreatedGame] = useState<string>(() => localStorage.getItem('rymon_selected_gen_game') || 'Free Fire MAX')
  const [genEdition, setGenEdition] = useState<'normal' | 'vip'>('normal')
  const [isCustomAppMode, setIsCustomAppMode] = useState(false)
  const [customAppNameInput, setCustomAppNameInput] = useState('')
  const [genDuration, setGenDuration] = useState('1 Day')
  const [genCustomPrefix, setGenCustomPrefix] = useState('')
  const [genDevicesMax, setGenDevicesMax] = useState(1)
  const [genQuantity, setGenQuantity] = useState(1)
  const [genCreatedKeysList, setGenCreatedKeysList] = useState<string[]>([])
  const [genError, setGenError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedDeliverySlip, setCopiedDeliverySlip] = useState<string | null>(null)
  const [vipPingMs, setVipPingMs] = useState<number | null>(null)

  // Top Up Balance Form State
  const [topUpTargetUser, setTopUpTargetUser] = useState('')
  const [topUpAmount, setTopUpAmount] = useState<number | ''>('')
  const [topUpMode, setTopUpMode] = useState<'set' | 'add'>('set')
  const [topUpLoading, setTopUpLoading] = useState(false)

  // Search & Filter
  const [searchKeyQuery, setSearchKeyQuery] = useState('')
  const [keyStatusFilter, setKeyStatusFilter] = useState<
    'ALL' | 'PLAYING' | 'ACTIVE' | 'PAUSED' | 'WAITING' | 'EXPIRED' | 'BANNED'
  >('ALL')
  const [keyEditionFilter, setKeyEditionFilter] = useState<'ALL' | 'NORMAL' | 'VIP'>('ALL')
  const [keyCreatorFilter, setKeyCreatorFilter] = useState<string>('ALL')
  const [keyGameFilter, setKeyGameFilter] = useState<string>('ALL')
  const [searchUserQuery, setSearchUserQuery] = useState('')

  // Ecosystem & Multi-App Management State
  const [registeredApps, setRegisteredApps] = useState<RegisteredApp[]>(() => getLocalRegisteredApps())
  const [appsLoading, setAppsLoading] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppPackage, setNewAppPackage] = useState('')
  const [newAppPlatform, setNewAppPlatform] = useState('Android Mobile')
  const [newAppDesc, setNewAppDesc] = useState('')
  const [newAppIcon, setNewAppIcon] = useState('🎮')
  const [appActionError, setAppActionError] = useState('')
  const [appActionSuccess, setAppActionSuccess] = useState('')
  const [selectedSnippetApp, setSelectedSnippetApp] = useState<RegisteredApp | null>(null)
  const [snippetLanguage, setSnippetLanguage] = useState<'curl' | 'java' | 'cpp' | 'csharp' | 'python'>('curl')

  // Management Action State
  const [targetDeleteUser, setTargetDeleteUser] = useState('__ALL__')
  const [deleteKeyType, setDeleteKeyType] = useState<'expired' | 'unused' | 'all'>('expired')
  const [targetExtendKey, setTargetExtendKey] = useState('')
  const [extendAmount, setExtendAmount] = useState(7)
  const [actionSuccessMsg, setActionSuccessMsg] = useState('')

  // Advanced System Toggles & Sovereign Security Policy
  const [singleDeviceAdmin, setSingleDeviceAdmin] = useState(false)
  const [singleDeviceReseller, setSingleDeviceReseller] = useState(true)
  const [trialAdmin, setTrialAdmin] = useState(true)
  const [trialReseller, setTrialReseller] = useState(false)
  const [securityPolicy, setSecurityPolicy] = useState<SovereignSecurityPolicy>(() => getSovereignSecurityPolicy())

  // Password Reset Modal State
  const [pwdModalUser, setPwdModalUser] = useState<string | null>(null)
  const [pwdNewValue, setPwdNewValue] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  // App Permission Modal State (Debajoyti Granular Permission Engine)
  const [appPermModalUser, setAppPermModalUser] = useState<RymonAccount | null>(null)
  const [appPermWildcard, setAppPermWildcard] = useState(false)
  const [appPermSelectedApps, setAppPermSelectedApps] = useState<string[]>([])
  const [appPermLoading, setAppPermLoading] = useState(false)

  const [selfResetMsg, setSelfResetMsg] = useState('')
  const [selfResetBusy, setSelfResetBusy] = useState(false)

  // User Registration with Referral Code State
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regInviteCode, setRegInviteCode] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')

  // Sovereign Referral Codes Engine State
  const [referralList, setReferralList] = useState<RymonReferral[]>([])
  const [refTargetRole, setRefTargetRole] = useState<'reseller' | 'admin'>('reseller')
  const [refSubDays, setRefSubDays] = useState<30 | 60>(30)
  const [refInitialBal, setRefInitialBal] = useState<number | ''>('')
  const [refCustomCode, setRefCustomCode] = useState('')
  const [refMaxUses, setRefMaxUses] = useState(1)
  const [refCreating, setRefCreating] = useState(false)
  const [copiedRefCode, setCopiedRefCode] = useState<string | null>(null)

  // Sovereign Connect URL & APK Test Sandbox State
  const [testConnectKey, setTestConnectKey] = useState('')
  const [testConnectHwid, setTestConnectHwid] = useState('DEVICE-SIM-ANDROID-9981')
  const [testConnectLoading, setTestConnectLoading] = useState(false)
  const [testConnectResult, setTestConnectResult] = useState<string>('')
  const [codeSnippetTab, setCodeSnippetTab] = useState<'cpp' | 'java' | 'python' | 'curl'>('cpp')
  const [connectSelectedApp, setConnectSelectedApp] = useState<string>(() => localStorage.getItem('rymon_connect_selected_app') || 'Free Fire MAX')
  const [connectCustomAppName, setConnectCustomAppName] = useState('Tool X')

  // Rate Limiting Live Cooldown Monitors
  useEffect(() => {
    const cleanUser = staffUsername.trim().toLowerCase()
    if (!cleanUser) {
      setStaffLockSeconds(0)
      return
    }
    const rec = getRymonThrottle(`rymon_auth_lock_${cleanUser}`)
    if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
      setStaffLockSeconds(Math.ceil((rec.lockedUntil - Date.now()) / 1000))
    } else {
      setStaffLockSeconds(0)
    }
  }, [staffUsername])

  useEffect(() => {
    const rec = getRymonThrottle('rymon_keyauth_lock')
    if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
      setKeyLockSeconds(Math.ceil((rec.lockedUntil - Date.now()) / 1000))
    } else {
      setKeyLockSeconds(0)
    }
  }, [authMode])

  useEffect(() => {
    if (staffLockSeconds <= 0 && keyLockSeconds <= 0) return
    const timer = setInterval(() => {
      setStaffLockSeconds((prev) => (prev > 1 ? prev - 1 : 0))
      setKeyLockSeconds((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [staffLockSeconds, keyLockSeconds])


  // 1. Initial Session & Database Verification on Mount
  useEffect(() => {


    // Check if key is provided via query parameter (?key=... or ?k=...)
    let queryKey = ''
    try {
      const urlParams = new URLSearchParams(window.location.search)
      queryKey = (urlParams.get('key') || urlParams.get('k') || '').trim()
    } catch {}

    // Restore saved session
    const savedUserJson = localStorage.getItem('rymon_session_user')
    const savedKey = queryKey || localStorage.getItem('rymon_remote_key')
    const savedExp = localStorage.getItem('rymon_remote_expiry')

    if (queryKey) {
      try {
        localStorage.setItem('rymon_remote_key', queryKey)
      } catch {}
      setCurrentKey(queryKey)
      setIsAuthenticated(true)
      setActiveTab('remote')
      if (!savedUserJson) {
        setCurrentUser(DEFAULT_ANON_STREAMER)
      }
    }

    if (savedUserJson) {
      try {
        let u = JSON.parse(savedUserJson) as RymonAccount
        // Immediate Sovereign Role Enforcement for Root Founder & Owner:
        if (u.username && (u.username.toLowerCase() === 'ryzen' || u.username.toLowerCase() === 'debajoyti')) {
          u.role = 'owner'
          try {
            localStorage.setItem('rymon_session_user', JSON.stringify(u))
          } catch {}
        }
        setCurrentUser(u)
        setWalletBalance(u.balance || 0)
        setIsAuthenticated(true)
        if (savedKey && savedKey !== 'RYMON-MASTER-KEY') setCurrentKey(savedKey)

        // Live Cloud Sync: ensure role, permissions, and wallet balance are up to date from Supabase
        if (supabase && u.username) {
          ;(async () => {
            try {
              let liveAcc: any = null
              const { data: rpcAcc, error: rpcErr } = await supabase.rpc('rpc_rymon_get_account', {
                p_username: u.username
              })
              if (!rpcErr && rpcAcc && rpcAcc.found) {
                liveAcc = rpcAcc
              } else {
                const { data } = await supabase
                  .from('rymon_accounts')
                  .select('*')
                  .ilike('username', u.username)
                  .maybeSingle()
                liveAcc = data
              }

              if (liveAcc) {
                const isSovereignOwner =
                  liveAcc.username?.toLowerCase() === 'debajoyti' || liveAcc.username?.toLowerCase() === 'ryzen'
                const effectiveRole = isSovereignOwner ? 'owner' : (liveAcc.role || u.role)
                const refreshedUser: RymonAccount = {
                  ...u,
                  id: liveAcc.id || u.id,
                  username: liveAcc.username,
                  email: liveAcc.email,
                  role: effectiveRole,
                  balance: Number(liveAcc.balance ?? u.balance ?? 0),
                  uplink: liveAcc.uplink || u.uplink,
                  status: liveAcc.status || u.status,
                  expires_at: liveAcc.expires_at || u.expires_at,
                  permissions: liveAcc.permissions || u.permissions
                }
                setCurrentUser(refreshedUser)
                setWalletBalance(Number(refreshedUser.balance) || 0)
                try {
                  localStorage.setItem('rymon_session_user', JSON.stringify(refreshedUser))
                } catch {}
              }
            } catch {}
          })()
        }
      } catch {}
    } else if (savedKey && savedKey !== 'RYMON-MASTER-KEY') {
      setCurrentKey(savedKey)
      setIsAuthenticated(true)
      const exp = savedExp ? new Date(savedExp) : new Date(Date.now() + 30 * 86400000)
      setExpiryDate(exp)
      if (!queryKey) {
        setCurrentUser(DEFAULT_ANON_STREAMER)
      }
      setActiveTab('remote')
    }
  }, [])



  // 2. Fetch Live Supabase Data when Authenticated
  useEffect(() => {
    if (!isAuthenticated) return

    let isMounted = true

    async function loadLiveData() {
      const isStreamerRole = currentUser?.role === 'streamer'
      await Promise.all([syncPricingFromSupabase(), syncSecurityPolicyFromSupabase()])
      const [lcs, usrs, acts, ctrls, refs] = await Promise.all([
        fetchAllLicenses(currentUser),
        fetchAllAccounts(currentUser),
        isStreamerRole ? Promise.resolve([]) : fetchAllActivities(currentUser),
        fetchAllStreamerControls(currentUser),
        fetchReferralCodes(currentUser)
      ])

      if (isMounted) {
        setGlobalPrices(getGlobalPriceMap())
        setAllCustomUserMaps(getAllUserCustomPriceMaps())
        setSecurityPolicy(getSovereignSecurityPolicy())
        setKeysList(lcs)
        setUsersList(usrs)
        setActivities(acts)
        setStreamerControls(ctrls)
        setReferralList(refs)
        fetchRegisteredApps().then((a) => isMounted && setRegisteredApps(a))

        // Auto-select a target license key for Staff so Streamer Remote works immediately
        setCurrentKey((prevKey) => {
          if (prevKey) return prevKey
          if (lcs.length === 0) return ''
          const playingCtrl = ctrls.find((c) => isStreamerKeyActivelyPlaying(c))
          if (playingCtrl && lcs.some((k) => k.license_key === playingCtrl.license_key)) {
            return playingCtrl.license_key
          }
          const boundActive = lcs.find((k) => k.status === 'ACTIVE' && k.device_hwid)
          if (boundActive) return boundActive.license_key
          const anyActive = lcs.find((k) => k.status === 'ACTIVE')
          return anyActive ? anyActive.license_key : lcs[0].license_key
        })

        // Sync fresh balance & permissions if currentUser in list
        if (currentUser && currentUser.username) {
          const freshMe = usrs.find(
            (u) => (u.username || '').toLowerCase() === currentUser.username.toLowerCase()
          )
          if (freshMe) {
            setWalletBalance(freshMe.balance)
            setCurrentUser((prev) => {
              if (
                !prev ||
                prev.balance !== freshMe.balance ||
                prev.role !== freshMe.role ||
                prev.status !== freshMe.status ||
                prev.expires_at !== freshMe.expires_at ||
                prev.uplink !== freshMe.uplink ||
                JSON.stringify(prev.permissions || {}) !== JSON.stringify(freshMe.permissions || {})
              ) {
                localStorage.setItem('rymon_session_user', JSON.stringify(freshMe))
                return freshMe
              }
              return prev
            })
          } else if (supabase) {
            // Reseller or Streamer account: fetchAllAccounts is intentionally empty for privacy.
            // Sync live account & permissions directly from rpc_rymon_get_account
            try {
              const { data: myAcc } = await supabase.rpc('rpc_rymon_get_account', {
                p_username: currentUser.username
              })
              if (myAcc && myAcc.found) {
                setWalletBalance(Number(myAcc.balance) || 0)
                setCurrentUser((prev) => {
                  if (!prev) return null
                  if (
                    prev.balance !== Number(myAcc.balance) ||
                    prev.role !== myAcc.role ||
                    prev.status !== myAcc.status ||
                    prev.expires_at !== myAcc.expires_at ||
                    JSON.stringify(prev.permissions || {}) !== JSON.stringify(myAcc.permissions || {})
                  ) {
                    const updatedUser: RymonAccount = {
                      id: myAcc.id || prev.id,
                      username: myAcc.username || prev.username,
                      email: myAcc.email || prev.email,
                      uplink: myAcc.uplink || prev.uplink,
                      referral_code: myAcc.referral_code || prev.referral_code,
                      balance: Number(myAcc.balance) || 0,
                      role: myAcc.role || prev.role,
                      status: myAcc.status || prev.status,
                      expires_at: myAcc.expires_at || prev.expires_at,
                      permissions: myAcc.permissions || prev.permissions
                    }
                    localStorage.setItem('rymon_session_user', JSON.stringify(updatedUser))
                    return updatedUser
                  }
                  return prev
                })
              }
            } catch {}
          }
        }
      }
    }

    loadLiveData()

    // Periodic 60-second gentle fallback sweep (only when tab is visible)
    const statusPollTimer = setInterval(async () => {
      if (!isMounted) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const [c, l, u] = await Promise.all([
        fetchAllStreamerControls(currentUser),
        fetchAllLicenses(currentUser),
        fetchAllAccounts(currentUser)
      ])
      if (!isMounted) return
      setStreamerControls(c)
      setKeysList(l)
      setUsersList(u)
    }, 60000)

    // Setup Realtime Phoenix Subscriptions (Senior Dev In-Memory State Merging - ZERO HTTP egress)
    if (supabase) {
      const channel = supabase
        .channel('rymon-global-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_licenses' },
          (payload) => {
            if (!isMounted) return
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedLic = payload.new as RymonLicense
              setKeysList((prev) =>
                prev.map((k) => (k.id === updatedLic.id || k.license_key === updatedLic.license_key ? { ...k, ...updatedLic } : k))
              )
            } else if (payload.eventType === 'INSERT' && payload.new) {
              const newLic = payload.new as RymonLicense
              setKeysList((prev) => {
                const exists = prev.some((k) => k.license_key === newLic.license_key)
                return exists ? prev.map((k) => (k.license_key === newLic.license_key ? { ...k, ...newLic } : k)) : [newLic, ...prev]
              })
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const oldLic = payload.old as Partial<RymonLicense>
              setKeysList((prev) => prev.filter((k) => k.id !== oldLic.id && k.license_key !== oldLic.license_key))
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_streamer_controls' },
          (payload) => {
            if (!isMounted) return
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedCtrl = payload.new as StreamerControlRecord
              setStreamerControls((prev) =>
                prev.map((c) => (c.license_key === updatedCtrl.license_key ? { ...c, ...updatedCtrl } : c))
              )
            } else if (payload.eventType === 'INSERT' && payload.new) {
              const newCtrl = payload.new as StreamerControlRecord
              setStreamerControls((prev) => {
                const exists = prev.some((c) => c.license_key === newCtrl.license_key)
                return exists ? prev.map((c) => (c.license_key === newCtrl.license_key ? { ...c, ...newCtrl } : c)) : [newCtrl, ...prev]
              })
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const oldCtrl = payload.old as Partial<StreamerControlRecord>
              setStreamerControls((prev) => prev.filter((c) => c.license_key !== oldCtrl.license_key))
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_accounts' },
          (payload) => {
            if (!isMounted) return
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedAcc = payload.new as RymonAccount
              setUsersList((prev) =>
                prev.map((u) => (u.id === updatedAcc.id || ((u.username || '').toLowerCase() === (updatedAcc.username || '').toLowerCase()) ? { ...u, ...updatedAcc } : u))
              )
              if (currentUser?.username && updatedAcc?.username && currentUser.username.toLowerCase() === updatedAcc.username.toLowerCase()) {
                setWalletBalance(updatedAcc.balance)
                setCurrentUser((prev) => {
                  if (
                    !prev ||
                    prev.balance !== updatedAcc.balance ||
                    prev.role !== updatedAcc.role ||
                    prev.status !== updatedAcc.status ||
                    prev.expires_at !== updatedAcc.expires_at ||
                    prev.uplink !== updatedAcc.uplink
                  ) {
                    return prev ? { ...prev, ...updatedAcc } : updatedAcc
                  }
                  return prev
                })
              }
            } else if (payload.eventType === 'INSERT' && payload.new) {
              const newAcc = payload.new as RymonAccount
              setUsersList((prev) => [newAcc, ...prev])
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const oldAcc = payload.old as Partial<RymonAccount>
              setUsersList((prev) => prev.filter((u) => u.id !== oldAcc.id && u.username !== oldAcc.username))
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_activities' },
          (payload) => {
            if (!isMounted) return
            if (payload.eventType === 'INSERT' && payload.new) {
              const newAct = payload.new as RymonActivity
              const actorLower = String(newAct.actor_username || '').toLowerCase()
              const curUser = (currentUser?.username || '').toLowerCase()
              const role = currentUser?.role || ''

              // 1. Root Owner (debajoyti): sees all platform activities
              if (!currentUser || curUser === 'debajoyti') {
                setActivities((prev) => [newAct, ...prev.slice(0, 29)])
                return
              }
              // 2. Reseller: only sees activities they performed themselves
              if (role === 'reseller') {
                if (actorLower === curUser) {
                  setActivities((prev) => [newAct, ...prev.slice(0, 29)])
                }
                return
              }
              // 3. Admin: sees activities for themselves + their downline
              if (role === 'admin') {
                const isDownline = usersListRef.current.some(
                  (u) => (u.username || '').toLowerCase() === actorLower
                )
                if (actorLower === curUser || isDownline) {
                  setActivities((prev) => [newAct, ...prev.slice(0, 29)])
                }
                return
              }
              // 4. Partner Owner: sees activities for themselves and non-root downlines
              if (role === 'owner') {
                if (actorLower !== 'debajoyti') {
                  setActivities((prev) => [newAct, ...prev.slice(0, 29)])
                }
                return
              }
            }
          }
        )
        .subscribe()

      return () => {
        isMounted = false
        clearInterval(statusPollTimer)
        if (supabase) supabase.removeChannel(channel)
      }
    }

    return () => {
      isMounted = false
      clearInterval(statusPollTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser?.username, currentUser?.role])

  // Ensure selected game and connect app fall back gracefully if deleted from registered apps
  useEffect(() => {
    if (registeredApps.length > 0) {
      if (genGame.toLowerCase() !== 'free fire max' && !isCustomAppMode) {
        const exists = registeredApps.some((a) => (a?.name || '').toLowerCase() === genGame.toLowerCase())
        if (!exists) {
          setGenGame('Free Fire MAX')
          localStorage.setItem('rymon_selected_gen_game', 'Free Fire MAX')
        }
      }
      if (connectSelectedApp.toLowerCase() !== 'free fire max' && connectSelectedApp !== 'Custom') {
        const exists = registeredApps.some((a) => (a?.name || '').toLowerCase() === connectSelectedApp.toLowerCase())
        if (!exists) {
          setConnectSelectedApp('Free Fire MAX')
          localStorage.setItem('rymon_connect_selected_app', 'Free Fire MAX')
        }
      }
    }
  }, [registeredApps, genGame, connectSelectedApp, isCustomAppMode])

  // 3. Telemetry Realtime Subscription for Current Key
  useEffect(() => {
    if (!isAuthenticated || !currentKey || !supabase) return

    let isMounted = true
    let cachedCtrl: Partial<StreamerControlRecord> | null = null
    let cachedLic: Partial<RymonLicense> | null = null
    let lastDbSyncTime = 0
    let isDbSyncing = false

    async function syncFromSupabase() {
      if (!supabase || isDbSyncing) return
      isDbSyncing = true
      try {
        const targetLic = currentKey ? keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase()) : null
        const isKeyVip = Boolean(
          targetLic?.plan_duration?.includes('[VIP]') ||
          record?.streamer_name?.includes('VIP_REALTIME') ||
          record?.streamer_name?.startsWith('VIP|')
        )
        const ctrlPromise = isKeyVip
          ? supabase.from('rymon_streamer_controls').select('*').eq('license_key', currentKey).maybeSingle()
          : Promise.resolve({ data: null })

        const [{ data: ctrlData }, { data: licData }] = await Promise.all([
          ctrlPromise,
          supabase
            .from('rymon_licenses')
            .select('device_hwid, devices_used, devices_max, last_heartbeat, status, is_paused, expires_at, game, creator_username')
            .eq('license_key', currentKey)
            .maybeSingle()
        ])

        if (isMounted) {
          const isRootFounder = currentUser?.username?.toLowerCase() === 'debajoyti'
          const isStreamerUser = currentUser?.role === 'streamer'
          const keyCreator = (licData?.creator_username || ctrlData?.creator || '').toLowerCase()
          if (!isRootFounder && !isStreamerUser && (keyCreator === 'debajoyti' || (keysList.length > 0 && !keysList.some((k) => k.license_key.toUpperCase() === currentKey.toUpperCase())))) {
            setCurrentKey(keysList[0]?.license_key || '')
            setRecord(null)
            return
          }

          lastDbSyncTime = Date.now()
          if (ctrlData) cachedCtrl = ctrlData
          if (licData) cachedLic = licData

          if (licData?.expires_at) {
            setExpiryDate(new Date(licData.expires_at))
          } else if (licData?.status === 'WAITING') {
            setExpiryDate(null)
            setCountdown('Starts on 1st Login')
          }

          // If DB had stale is_online=true when activelyPlaying is false, reset in background
          if (ctrlData && isKeyVip) {
            const tempMerged = { ...ctrlData, last_heartbeat: ctrlData.last_heartbeat || licData?.last_heartbeat } as StreamerControlRecord
            if (ctrlData.is_online && !isStreamerKeyActivelyPlaying(tempMerged)) {
              supabase
                .from('rymon_streamer_controls')
                .update({ is_online: false, updated_at: new Date().toISOString() })
                .eq('license_key', currentKey)
                .then(() => {})
            }
          }
        }
      } catch {
      } finally {
        isDbSyncing = false
      }
    }

    async function fastPulseTelemetry() {
      if (!isMounted || sliderTimerRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      const targetLic = currentKey ? keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase()) : null
      const isKeyVip = Boolean(
        targetLic?.plan_duration?.includes('[VIP]') ||
        (cachedCtrl as Partial<StreamerControlRecord> | null)?.streamer_name?.includes('VIP_REALTIME') ||
        (cachedCtrl as Partial<StreamerControlRecord> | null)?.streamer_name?.startsWith('VIP|') ||
        record?.streamer_name?.includes('VIP_REALTIME') ||
        record?.streamer_name?.startsWith('VIP|')
      )

      if (!isKeyVip) {
        if (isMounted) {
          setIsLiveConnected(false)
          setVipPingMs(null)
          if (cachedLic) {
            const activelyPlaying = Boolean(cachedLic?.last_heartbeat && (Date.now() - new Date(cachedLic.last_heartbeat).getTime() < 30000))
            setRecord((prev) => ({
              ...(prev || ({} as StreamerControlRecord)),
              license_key: currentKey,
              streamer_name: 'Standard Mobile APK (In-Game Only)',
              game_name: cachedLic?.game || 'Free Fire MAX',
              is_online: activelyPlaying,
              is_active: cachedLic?.status !== 'BANNED' && cachedLic?.status !== 'EXPIRED',
              is_paused: cachedLic?.is_paused ?? false,
              device_hwid: cachedLic?.device_hwid || '',
              devices_used: cachedLic?.devices_used ?? 0,
              devices_max: cachedLic?.devices_max ?? 1,
              last_heartbeat: cachedLic?.last_heartbeat
            } as StreamerControlRecord))
          }
        }
        return
      }

      // Gentle 60-second background refresh for license status / expiry without spamming DB
      if (Date.now() - lastDbSyncTime > 60000) {
        syncFromSupabase()
      }

      const defaults = buildDefaultStreamerControlPayload({
        license_key: currentKey,
        streamer_name: currentUser?.role === 'owner' ? 'Owner Console' : 'VIP Streamer',
        game_name: cachedLic?.game || 'Free Fire MAX',
        is_online: false,
        is_active: cachedLic?.status !== 'BANNED' && cachedLic?.status !== 'EXPIRED',
        is_paused: cachedLic?.is_paused ?? false,
        device_hwid: cachedLic?.device_hwid || '',
        devices_used: cachedLic?.devices_used ?? 0,
        devices_max: cachedLic?.devices_max ?? 1
      })

      const baseRecord: StreamerControlRecord = {
        ...defaults,
        ...(cachedCtrl as StreamerControlRecord),
        aim_silent: Boolean(cachedCtrl?.aim_silent ?? defaults.aim_silent),
        hit_rate: Number(cachedCtrl?.hit_rate ?? defaults.hit_rate),
        ignore_knocked: Boolean(cachedCtrl?.ignore_knocked ?? defaults.ignore_knocked),
        show_aim_line: Boolean(cachedCtrl?.show_aim_line ?? defaults.show_aim_line),
        show_aim_fov: Boolean(cachedCtrl?.show_aim_fov ?? defaults.show_aim_fov),
        aim_fov: Number(cachedCtrl?.aim_fov ?? defaults.aim_fov),
        esp_box: Boolean(cachedCtrl?.esp_box ?? defaults.esp_box),
        esp_line: Boolean(cachedCtrl?.esp_line ?? defaults.esp_line),
        esp_skeleton: Boolean(cachedCtrl?.esp_skeleton ?? defaults.esp_skeleton),
        esp_name: Boolean(cachedCtrl?.esp_name ?? defaults.esp_name),
        esp_distance: Boolean(cachedCtrl?.esp_distance ?? defaults.esp_distance),
        esp_health: Boolean(cachedCtrl?.esp_health ?? defaults.esp_health),
        esp_count: Boolean(cachedCtrl?.esp_count ?? defaults.esp_count),
        esp_radar: Boolean(cachedCtrl?.esp_radar ?? defaults.esp_radar),
        speed_hack: Boolean(cachedCtrl?.speed_hack ?? defaults.speed_hack),
        speed_multiplier: Number(cachedCtrl?.speed_multiplier ?? defaults.speed_multiplier),
        ghost_hack: Boolean(cachedCtrl?.ghost_hack ?? defaults.ghost_hack),
        no_reload: Boolean(cachedCtrl?.no_reload ?? defaults.no_reload),
        no_recoil: Boolean(cachedCtrl?.no_recoil ?? defaults.no_recoil),
        theme_color_index: Number(cachedCtrl?.theme_color_index ?? defaults.theme_color_index),
        emergency_purge: Boolean(cachedCtrl?.emergency_purge ?? defaults.emergency_purge),
        device_hwid: cachedLic?.device_hwid || cachedCtrl?.device_hwid || '',
        devices_used: cachedLic?.devices_used ?? cachedCtrl?.devices_used ?? 0,
        devices_max: cachedLic?.devices_max ?? cachedCtrl?.devices_max ?? 1,
        last_heartbeat: cachedCtrl?.last_heartbeat || cachedLic?.last_heartbeat,
        is_paused: Boolean(cachedCtrl?.is_paused || cachedLic?.is_paused)
      }

      // 1. Ultra-fast direct Render RAM query (<30ms, zero Supabase database queries)
      try {
        const t0 = performance.now()
        const vipState = await fetchRenderVipState(currentKey)
        if (vipState && isMounted) {
          const pingCalc = Math.max(1, Math.round(performance.now() - t0))
          setVipPingMs(pingCalc)
          setPing(pingCalc)
          const mergedVip: StreamerControlRecord = {
            ...baseRecord,
            aim_silent: vipState.aim_silent ?? baseRecord.aim_silent,
            hit_rate: vipState.hit_rate ?? baseRecord.hit_rate,
            aim_fov: vipState.aim_fov ?? baseRecord.aim_fov,
            esp_box: vipState.esp_box ?? baseRecord.esp_box,
            esp_line: vipState.esp_line ?? baseRecord.esp_line,
            esp_skeleton: vipState.esp_skeleton ?? baseRecord.esp_skeleton,
            esp_name: vipState.esp_name ?? baseRecord.esp_name,
            esp_distance: vipState.esp_distance ?? baseRecord.esp_distance,
            esp_health: vipState.esp_health ?? baseRecord.esp_health,
            esp_count: vipState.esp_count ?? baseRecord.esp_count,
            esp_radar: vipState.esp_radar ?? baseRecord.esp_radar,
            speed_hack: vipState.speed_hack ?? baseRecord.speed_hack,
            speed_multiplier: vipState.speed_multiplier ?? baseRecord.speed_multiplier,
            ghost_hack: vipState.ghost_hack ?? baseRecord.ghost_hack,
            no_reload: vipState.no_reload ?? baseRecord.no_reload,
            no_recoil: vipState.no_recoil ?? baseRecord.no_recoil,
            theme_color_index: vipState.theme_color_index ?? baseRecord.theme_color_index,
            streamer_name: vipState.streamer_name || baseRecord.streamer_name,
            is_online: vipState.is_online ?? baseRecord.is_online,
            is_paused: Boolean(vipState.is_paused ?? baseRecord.is_paused),
            last_heartbeat: vipState.last_heartbeat || baseRecord.last_heartbeat
          }
          const activelyPlaying = isStreamerKeyActivelyPlaying(mergedVip)
          setRecord({ ...mergedVip, is_online: activelyPlaying })
          setIsLiveConnected(true)
          return
        }
      } catch {}

      // 2. Render Fallback: If Render bridge is cold or network jitter, fallback to cached DB data
      if (Date.now() - lastDbSyncTime > 60000) {
        await syncFromSupabase()
      }
      if (isMounted) {
        const activelyPlaying = isStreamerKeyActivelyPlaying(baseRecord)
        setRecord({ ...baseRecord, is_online: activelyPlaying })
        setIsLiveConnected(true)
      }
    }

    // Initial load: fetch DB baseline, then start high-speed Render RAM pulse
    syncFromSupabase().then(() => {
      if (isMounted) fastPulseTelemetry()
    })

    const fastSyncTimer = setInterval(fastPulseTelemetry, 1000)

    const targetLic = currentKey ? keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase()) : null
    const isKeyVip = Boolean(
      targetLic?.plan_duration?.includes('[VIP]') ||
      record?.streamer_name?.includes('VIP_REALTIME') ||
      record?.streamer_name?.startsWith('VIP|')
    )

    const channel = supabase.channel(`streamer-remote-${currentKey}`)

    if (isKeyVip) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rymon_streamer_controls',
          filter: `license_key=eq.${currentKey}`
        },
        (payload) => {
          if (payload.new && isMounted) {
            cachedCtrl = { ...(cachedCtrl || {}), ...(payload.new as StreamerControlRecord) }
            setRecord((prev) => {
              const nextRec = {
                ...(prev || ({} as StreamerControlRecord)),
                ...(payload.new as StreamerControlRecord)
              }
              return {
                ...nextRec,
                is_online: isStreamerKeyActivelyPlaying(nextRec)
              }
            })
            setIsLiveConnected(true)
          }
        }
      )
    }

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rymon_licenses',
          filter: `license_key=eq.${currentKey}`
        },
        (payload) => {
          if (payload.new && isMounted) {
            const lic = payload.new as RymonLicense
            cachedLic = { ...(cachedLic || {}), ...lic }
            if (lic.expires_at) {
              setExpiryDate(new Date(lic.expires_at))
            }
            setRecord((prev) => {
              if (!prev) return null
              const nextRec: StreamerControlRecord = {
                ...prev,
                device_hwid: lic.device_hwid || prev.device_hwid,
                devices_used: lic.devices_used ?? prev.devices_used,
                devices_max: lic.devices_max ?? prev.devices_max,
                last_heartbeat: lic.last_heartbeat || prev.last_heartbeat,
                is_paused: lic.is_paused ?? prev.is_paused
              }
              return {
                ...nextRec,
                is_online: isStreamerKeyActivelyPlaying(nextRec)
              }
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isMounted && isKeyVip) {
          setIsLiveConnected(true)
        }
      })

    return () => {
      isMounted = false
      clearInterval(fastSyncTimer)
      if (supabase) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentKey, currentUser?.role])

  // 4. Live Countdown Clock
  useEffect(() => {
    if (!expiryDate) return
    const interval = setInterval(() => {
      const diff = expiryDate.getTime() - Date.now()
      if (diff <= 0) {
        setCountdown('EXPIRED')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const mins = Math.floor((diff / (1000 * 60)) % 60)
      const secs = Math.floor((diff / 1000) % 60)
      setCountdown(`${days}d ${hours}h ${mins}m ${secs}s`)
    }, 1000)
    return () => clearInterval(interval)
  }, [expiryDate])

  // 5. Dynamic Ping Telemetry & Real Live Network Latency Probe
  useEffect(() => {
    warmRenderVipBridge()
    let isCancelled = false

    const probeLivePing = async () => {
      const t0 = performance.now()
      try {
        await fetch('https://rymon-telegram-bot.onrender.com/', {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store'
        })
        const measured = Math.max(1, Math.round(performance.now() - t0))
        if (!isCancelled) {
          setPing(measured)
        }
      } catch {
        try {
          const t1 = performance.now()
          await fetch(window.location.origin + '/favicon.svg?t=' + Date.now(), {
            method: 'HEAD',
            cache: 'no-store'
          })
          const fallbackMeasured = Math.max(1, Math.round(performance.now() - t1))
          if (!isCancelled) {
            setPing(fallbackMeasured)
          }
        } catch {}
      }
    }

    probeLivePing()
    const interval = setInterval(probeLivePing, 8000)
    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [])

  // 6. REAL AUTHENTICATION HANDLERS
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    const cleanUser = staffUsername.trim().toLowerCase()
    if (!cleanUser) {
      setAuthError('Please enter your registered username.')
      return
    }

    const throttleKey = `rymon_auth_lock_${cleanUser}`
    const currentThrottle = getRymonThrottle(throttleKey)
    if (currentThrottle.lockedUntil && currentThrottle.lockedUntil > Date.now()) {
      const rem = Math.ceil((currentThrottle.lockedUntil - Date.now()) / 1000)
      setStaffLockSeconds(rem)
      setAuthError(`🔒 Security Lockout: Too many failed login attempts. Please wait ${formatLockCountdown(rem)} before trying again.`)
      return
    }

    // Debounce rapid submits (2 seconds)
    const now = Date.now()
    if (now - lastAuthSubmitTime < 2000) {
      setAuthError('⚠️ Please wait a moment before trying again.')
      return
    }
    setLastAuthSubmitTime(now)

    setAuthLoading(true)
    const res = await loginWithCredentials(staffUsername, staffPassword)
    setAuthLoading(false)

    if (res.success && res.user) {
      clearRymonThrottle(throttleKey)
      setStaffLockSeconds(0)
      setCurrentUser(res.user)
      setWalletBalance(res.user.balance)
      setIsAuthenticated(true)
      localStorage.setItem('rymon_session_user', JSON.stringify(res.user))

      showToast(`Welcome back, ${res.user.username} (${res.user.role.toUpperCase()})!`)
      setActiveTab('overview')
    } else {
      const failed = recordRymonFailedAttempt(throttleKey, 5, 5 * 60 * 1000)
      if (failed.locked) {
        setStaffLockSeconds(failed.waitSecs)
        setAuthError(`🔒 Account locked for 5 minutes due to 5 consecutive failed login attempts. Please wait ${formatLockCountdown(failed.waitSecs)}.`)
      } else if (failed.remaining === 1) {
        setAuthError(`❌ ${res.error || 'Authentication failed. Please verify credentials.'} (⚠️ 1 attempt remaining before 5-minute security lockout).`)
      } else {
        setAuthError(`❌ ${res.error || 'Authentication failed. Please verify credentials.'} (${failed.remaining} attempts remaining before 5-minute security lockout).`)
      }
    }
  }

  const handleKeyAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    const throttleKey = 'rymon_keyauth_lock'
    const currentThrottle = getRymonThrottle(throttleKey)
    if (currentThrottle.lockedUntil && currentThrottle.lockedUntil > Date.now()) {
      const rem = Math.ceil((currentThrottle.lockedUntil - Date.now()) / 1000)
      setKeyLockSeconds(rem)
      setAuthError(`🔒 Key authentication locked. Too many invalid attempts. Please wait ${formatLockCountdown(rem)}.`)
      return
    }

    const now = Date.now()
    if (now - lastAuthSubmitTime < 2000) {
      setAuthError('⚠️ Please wait a moment before trying again.')
      return
    }
    setLastAuthSubmitTime(now)

    setAuthLoading(true)
    const res = await verifyLicenseKey(keyInput)
    setAuthLoading(false)

    if (res.valid && res.key) {
      clearRymonThrottle(throttleKey)
      setKeyLockSeconds(0)
      const cleanKey = res.key
      setCurrentKey(cleanKey)
      const exp = res.expiresAt ? new Date(res.expiresAt) : new Date(Date.now() + 30 * 86400000)
      setExpiryDate(exp)
      setIsAuthenticated(true)

      const streamerUser: RymonAccount = {
        id: 'usr-streamer',
        username: 'Streamer VIP',
        email: 'streamer@rymon.vip',
        role: 'streamer',
        balance: 0,
        uplink: 'debajoyti',
        status: 'ACTIVE'
      }
      setCurrentUser(streamerUser)
      setWalletBalance(streamerUser.balance)
      localStorage.setItem('rymon_session_user', JSON.stringify(streamerUser))
      localStorage.setItem('rymon_remote_key', cleanKey)
      localStorage.setItem('rymon_remote_expiry', exp.toISOString())

      showToast(`Connected license ${cleanKey}!`)
      setActiveTab('remote')
    } else {
      const failed = recordRymonFailedAttempt(throttleKey, 5, 5 * 60 * 1000)
      if (failed.locked) {
        setKeyLockSeconds(failed.waitSecs)
        setAuthError(`🔒 Key authentication locked for 5 minutes due to 5 invalid attempts. Please wait ${formatLockCountdown(failed.waitSecs)}.`)
      } else {
        setAuthError(`❌ ${res.error || 'Invalid license key.'} (${failed.remaining} attempt${failed.remaining === 1 ? '' : 's'} remaining before 5-minute security lockout).`)
      }
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('rymon_session_user')
    localStorage.removeItem('rymon_remote_key')
    localStorage.removeItem('rymon_remote_expiry')
    setIsAuthenticated(false)
    setCurrentUser(null)
    setCurrentKey('')
    setRecord(null)
    setActiveTab('overview')
  }

  // ── Web Control Hourly Rate Limiter (Max 3 different keys per hour for normal users) ──
  const getControlledKeysThisHour = (): string[] => {
    try {
      const username = currentUser?.username || 'streamer'
      const raw = localStorage.getItem(`rymon_webctrl_keys_${username}`)
      if (!raw) return []
      const list: Array<{ key: string; timestamp: number }> = JSON.parse(raw)
      const cutoff = Date.now() - 3600000
      const valid = list.filter((item) => item.timestamp > cutoff)
      return Array.from(new Set(valid.map((item) => item.key.toUpperCase())))
    } catch {
      return []
    }
  }

  const handleSelectRemoteKey = (targetKey: string): boolean => {
    if (!targetKey) {
      setCurrentKey('')
      return true
    }
    const clean = targetKey.trim().toUpperCase()

    // 1. Owner, Admin, and Resellers run on automatic VIP Realtime Render RAM bridge (<50ms) with zero limits
    if (isOwner || currentUser?.role === 'admin' || currentUser?.role === 'reseller') {
      setCurrentKey(clean)
      return true
    }

    // 2. VIP Realtime keys have zero limits
    const targetLicense = keysList.find((k) => k.license_key.toUpperCase() === clean)
    const isVipKey = Boolean(
      targetLicense?.plan_duration?.includes('[VIP]') ||
      record?.streamer_name?.includes('VIP_REALTIME')
    )
    if (isVipKey) {
      setCurrentKey(clean)
      return true
    }

    // 3. Normal users: Check 1-hour distinct key limit (max 3)
    const username = currentUser?.username || 'streamer'
    const recentKeys = getControlledKeysThisHour()

    // If already controlling this key in current hour window, allow
    if (recentKeys.includes(clean)) {
      setCurrentKey(clean)
      return true
    }

    // If trying to control a 4th distinct key within 1 hour, block
    if (recentKeys.length >= 3) {
      showToast(
        `⛔ HOURLY KEY LIMIT: Normal accounts can only control 3 different keys per hour. Active this hour: ${recentKeys.join(', ')}. Upgrade to VIP Realtime for unlimited keys.`
      )
      return false
    }

    // Record new key in current hour window
    try {
      const raw = localStorage.getItem(`rymon_webctrl_keys_${username}`)
      const list: Array<{ key: string; timestamp: number }> = raw ? JSON.parse(raw) : []
      const cutoff = Date.now() - 3600000
      const pruned = list.filter((item) => item.timestamp > cutoff)
      pruned.push({ key: clean, timestamp: Date.now() })
      localStorage.setItem(`rymon_webctrl_keys_${username}`, JSON.stringify(pruned))
    } catch {}

    setCurrentKey(clean)
    return true
  }

  const handleToggleVipKey = async (licenseKey: string, makeVip: boolean) => {
    if ((!isOwner && currentUser?.role !== 'admin') || !supabase) return
    const keyRecord = keysList.find((k) => k.license_key === licenseKey)
    if (!keyRecord) return
    const curPlan = keyRecord.plan_duration || '30 Days'
    const newPlan = makeVip
      ? (curPlan.includes('[VIP]') ? curPlan : `${curPlan} [VIP]`)
      : curPlan.replace(' [VIP]', '').replace('[VIP]', '').trim()

    const { error } = await supabase
      .from('rymon_licenses')
      .update({ plan_duration: newPlan })
      .eq('license_key', licenseKey)

    if (!error) {
      if (makeVip) {
        const { data: existingCtrl } = await supabase
          .from('rymon_streamer_controls')
          .select('id')
          .eq('license_key', licenseKey)
          .maybeSingle()

        if (!existingCtrl) {
          await supabase.from('rymon_streamer_controls').insert(
            buildDefaultStreamerControlPayload({
              license_key: licenseKey,
              streamer_name: 'VIP_REALTIME',
              plan_duration: newPlan
            })
          )
        } else {
          await supabase
            .from('rymon_streamer_controls')
            .update({ streamer_name: 'VIP_REALTIME', plan_duration: newPlan })
            .eq('license_key', licenseKey)
        }
      } else {
        await supabase
          .from('rymon_streamer_controls')
          .update({ streamer_name: 'VIP Streamer', plan_duration: newPlan })
          .eq('license_key', licenseKey)
      }

      showToast(`Key ${licenseKey} ${makeVip ? 'upgraded to 👑 VIP Streamer Remote' : 'set to 📱 Standard APK'}!`)
      fetchAllLicenses(currentUser).then(setKeysList)
    } else {
      showToast(`Failed to update key tier: ${error.message}`)
    }
  }

  // 7. KEY GENERATION ENGINE WITH DYNAMIC DEFAULT + INDIVIDUAL USER PRICING
  const effectiveUserPrices = useMemo(() => {
    return getEffectivePriceMap(currentUser?.username)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username, globalPrices, allCustomUserMaps])

  const hasCustomPricingForCurrentUser = useMemo(() => {
    if (!currentUser?.username) return false
    return Boolean(getUserCustomPriceMap(currentUser.username))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username, allCustomUserMaps])

  const canGenerateVipRemote = useMemo(() => {
    if (isOwner) return true
    const userPerm = currentUser?.permissions?.allow_web_remote
    if (userPerm !== undefined) return Boolean(userPerm)
    if (isAdmin) return securityPolicy.allow_admin_web_remote ?? true
    if (isReseller) return securityPolicy.allow_reseller_web_remote ?? false
    return false
  }, [isOwner, isAdmin, isReseller, currentUser?.permissions?.allow_web_remote, securityPolicy.allow_admin_web_remote, securityPolicy.allow_reseller_web_remote])

  const basePlanPrice = effectiveUserPrices[genDuration] ?? 35
  const vipSurchargePercent = Math.max(0, Number(securityPolicy.vip_price_surcharge_percent ?? 50))
  const isVipSelected = genEdition === 'vip' && !isCustomAppMode
  const unitPlanPrice = isVipSelected
    ? Math.round(basePlanPrice * (1 + vipSurchargePercent / 100))
    : basePlanPrice
  const singleKeyPrice = unitPlanPrice * Math.max(1, genDevicesMax)
  const projectedInvoice = singleKeyPrice * Math.max(1, genQuantity)

  const handleSaveGlobalDefaultPrices = (e: React.FormEvent) => {
    e.preventDefault()
    const saved = saveGlobalPriceMap(globalPrices)
    setGlobalPrices(saved)
    if (!targetPriceUser || !getUserCustomPriceMap(targetPriceUser)) {
      setCustomUserPrices(saved)
    }
    showToast('✓ Default key prices updated for all Resellers & Admins!')
  }

  const handleResetGlobalDefaultPrices = () => {
    const saved = saveGlobalPriceMap(DEFAULT_KEY_PRICES)
    setGlobalPrices(saved)
    showToast('↺ Default key prices restored to factory defaults.')
  }

  const handleSelectTargetPriceUser = (username: string) => {
    setTargetPriceUser(username)
    if (!username) {
      setCustomUserPrices({ ...globalPrices })
      return
    }
    const existing = getUserCustomPriceMap(username)
    setCustomUserPrices(existing ? { ...globalPrices, ...existing } : { ...globalPrices })
  }

  const handleSaveIndividualUserPrices = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetPriceUser) {
      alert('Please select a target Admin or Reseller first.')
      return
    }
    saveUserCustomPriceMap(targetPriceUser, customUserPrices)
    setAllCustomUserMaps(getAllUserCustomPriceMaps())
    showToast(`👑 Custom key prices saved for @${targetPriceUser}!`)
  }

  const handleClearIndividualUserPrices = (username: string) => {
    clearUserCustomPriceMap(username)
    setAllCustomUserMaps(getAllUserCustomPriceMaps())
    if ((targetPriceUser || '').toLowerCase() === (username || '').toLowerCase()) {
      setCustomUserPrices({ ...globalPrices })
    }
    showToast(`Reverted @${username} to global default key prices.`)
  }

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    setGenError('')

    const targetGameName = (isCustomAppMode ? customAppNameInput.trim() : genGame) || 'Free Fire MAX'
    if (isCustomAppMode && !customAppNameInput.trim()) {
      setGenError('Please enter a custom app name')
      return
    }

    // Exclusive Authorization Check: Custom Apps (Debajoyti Authorization Engine)
    const isTargetFf = !targetGameName || targetGameName.toLowerCase().includes('free fire')
    if (!isTargetFf && !isUserCustomAppAllowed(currentUser, targetGameName)) {
      setGenError(`Permission Denied: Root Founder (@debajoyti) has not authorized your account for "${targetGameName}".`)
      return
    }
    if (isCustomAppMode && !isUserCustomAppAllowed(currentUser)) {
      setGenError('Permission Denied: Only Root Founder (@debajoyti) is authorized to create new custom game names.')
      return
    }

    // Lifetime Key Absolute Ban
    if (genDuration.toLowerCase().includes('lifetime')) {
      setGenError('Policy Violation: Lifetime keys are prohibited on this platform (Max validity cap: 30 Days).')
      return
    }

    // Reseller Policy Limits:
    if (isReseller) {
      const maxDev = securityPolicy.reseller_max_devices_limit ?? 1
      if (genDevicesMax > maxDev) {
        setGenError(`Policy Restriction: Reseller accounts are limited to a maximum of ${maxDev} device(s) per key.`)
        return
      }
      const maxBulk = securityPolicy.reseller_max_bulk_limit ?? 10
      if (genQuantity > maxBulk) {
        setGenError(`Policy Restriction: Reseller accounts are limited to generating a maximum of ${maxBulk} keys per batch.`)
        return
      }
    }

    // Strict Reseller & Role Permission Check: VIP Web Remote
    if (isVipSelected && !canGenerateVipRemote) {
      setGenError('Permission Denied: Your account is locked to Standard APK keys by default. Owner permission is required to generate VIP Web Remote keys.')
      return
    }

    // If custom name was entered and is not yet in registered apps, save it automatically
    if (isCustomAppMode && customAppNameInput.trim()) {
      const trimmed = customAppNameInput.trim()
      const alreadyExists = registeredApps.some((a) => (a?.name || '').toLowerCase() === trimmed.toLowerCase())
      if (!alreadyExists) {
        try {
          const updated = await addRegisteredApp({
            name: trimmed,
            platform: 'Custom Platform',
            icon: '🎮',
            description: 'Custom KeyAuth Application'
          })
          setRegisteredApps(updated)
        } catch {}
      }
      setGenGame(trimmed)
      localStorage.setItem('rymon_selected_gen_game', trimmed)
      setIsCustomAppMode(false)
      setCustomAppNameInput('')
    } else {
      localStorage.setItem('rymon_selected_gen_game', targetGameName)
    }

    setAuthLoading(true)
    const res = await generateLicenseKeyBackend({
      creator: currentUser,
      game: targetGameName,
      duration: genDuration,
      customPrefix: genCustomPrefix,
      devicesMax: genDevicesMax,
      quantity: genQuantity,
      isVipRealtime: isVipSelected
    })
    setAuthLoading(false)

    if (res.success && res.key) {
      const mintedKeys = res.keys && res.keys.length > 0 ? res.keys : [res.key]
      setGenCreatedKeysList(mintedKeys)
      setGenCreatedGame(targetGameName)
      if (res.remainingBalance !== undefined) {
        setWalletBalance(res.remainingBalance)
        const updatedUser = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedUser)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedUser))
      }
      const createdCount = mintedKeys.length
      showToast(
        createdCount > 1
          ? `⚡ Generated ${createdCount} keys (${genDuration}${isVipSelected ? ' • VIP Web Remote' : ' • Standard APK'})! Wallet updated.`
          : `Key ${res.key} generated! Wallet balance updated.`
      )
      // Refresh list
      fetchAllLicenses(currentUser).then(setKeysList)
      fetchAllAccounts(currentUser).then(setUsersList)
      fetchAllActivities(currentUser).then(setActivities)
    } else {
      setGenError(res.error || 'Failed to generate key.')
    }
  }

  // Save & Select Custom Target Game / App (Debajoyti Exclusively)
  const handleSaveCustomTargetApp = async () => {
    if ((currentUser?.username || '').toLowerCase() !== 'debajoyti') {
      showToast('🔒 Permission Denied: Only Root Founder (@debajoyti) can create new custom game names.')
      return
    }
    const trimmed = customAppNameInput.trim()
    if (!trimmed) {
      showToast('⚠️ Please type an app or game name first.')
      return
    }
    try {
      const updated = await addRegisteredApp({
        name: trimmed,
        platform: 'Custom Platform',
        icon: '🎮',
        description: 'Custom KeyAuth Application'
      })
      setRegisteredApps(updated)
      setGenGame(trimmed)
      localStorage.setItem('rymon_selected_gen_game', trimmed)
      setIsCustomAppMode(false)
      setCustomAppNameInput('')
      showToast(`✅ Game target "${trimmed}" saved & selected!`)
    } catch (err: unknown) {
      showToast(`❌ Failed to save game: ${err instanceof Error ? err.message : 'Error'}`)
    }
  }

  // 8. TOP UP / TRANSFER USER BALANCE HANDLER
  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topUpTargetUser) {
      alert('Please select a target user.')
      return
    }
    if (topUpAmount === '' || topUpAmount <= 0) {
      alert('Please enter a valid amount greater than ₹0.')
      return
    }

    setTopUpLoading(true)
    const effectiveMode = isOwner ? topUpMode : 'add'
    const res = await topUpUserBalanceBackend(
      topUpTargetUser,
      Number(topUpAmount),
      effectiveMode,
      currentUser?.username || 'debajoyti'
    )
    setTopUpLoading(false)

    if (res.success && res.newBalance !== undefined) {
      if (res.actorRemainingBalance !== undefined && currentUser) {
        setWalletBalance(res.actorRemainingBalance)
        const updatedMe = { ...currentUser, balance: res.actorRemainingBalance }
        setCurrentUser(updatedMe)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedMe))
      }
      showToast(
        isOwner
          ? `Success! Balance for @${topUpTargetUser} updated to ₹${res.newBalance.toLocaleString('en-IN')}`
          : `Transferred ₹${Number(topUpAmount).toLocaleString('en-IN')} from your wallet to @${topUpTargetUser}!`
      )
      setTopUpAmount('')
      fetchAllAccounts(currentUser).then((u) => {
        setUsersList(u)
        if (currentUser?.username && currentUser.username.toLowerCase() === (topUpTargetUser || '').toLowerCase()) {
          setWalletBalance(res.newBalance!)
          setCurrentUser({ ...currentUser, balance: res.newBalance! })
        }
      })
      fetchAllActivities(currentUser).then(setActivities)
    } else {
      alert(res.error || 'Failed to update balance.')
    }
  }

  // 9. TELEMETRY MUTATIONS
  const canControlCurrentKey = (): boolean => {
    if (!currentKey) {
      showToast('⚠️ Please select a Target License Key above to control.')
      return false
    }
    const targetLic = keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase())
    const isVip = Boolean(
      targetLic?.plan_duration?.includes('[VIP]') ||
      record?.streamer_name?.includes('VIP_REALTIME') ||
      record?.streamer_name?.startsWith('VIP|')
    )
    if (!isVip) {
      showToast('🔒 Web Remote is disabled for Standard Mobile APK keys (In-Game Only).')
      return false
    }
    if (isRootOwner || isStreamer) return true
    if (keysList.length > 0 && !keysList.some((k) => k.license_key.toUpperCase() === currentKey.toUpperCase())) {
      showToast('❌ Access Denied: Key is outside your downline.')
      return false
    }
    return true
  }

  const toggleFeature = async (field: keyof StreamerControlRecord) => {
    if (!canControlCurrentKey()) return
    const baseRecord =
      record ||
      buildDefaultStreamerControlPayload({
        license_key: currentKey,
        streamer_name: currentUser?.role === 'owner' ? 'Owner Console' : 'VIP Streamer'
      })
    if (baseRecord.is_paused) {
      showToast('⏸️ License key is PAUSED. Toggles and features are frozen until unpaused by staff.')
      return
    }
    const newVal = !baseRecord[field]
    const nowIso = new Date().toISOString()
    const nextRecord: StreamerControlRecord = {
      ...baseRecord,
      license_key: currentKey,
      [field]: newVal,
      ...(field === 'esp_radar' ? { esp_count: newVal } : {}),
      updated_at: nowIso
    }
    setRecord(nextRecord)
    setStreamerControls((prev) => {
      const exists = prev.some((c) => c.license_key === currentKey)
      if (!exists) return [nextRecord, ...prev]
      return prev.map((c) =>
        c.license_key === currentKey
          ? { ...c, [field]: newVal, ...(field === 'esp_radar' ? { esp_count: newVal } : {}), updated_at: nowIso }
          : c
      )
    })

    // Instant sub-50ms dispatch to Render VIP Bridge
    sendRenderVipCommand(currentKey, field as string, newVal)
    if (field === 'esp_radar') {
      sendRenderVipCommand(currentKey, 'esp_count', newVal)
    }

    if (supabase) {
      try {
        const updatePayload: Record<string, any> = {
          [field]: newVal,
          updated_at: nowIso
        }
        if (field === 'esp_radar') {
          updatePayload.esp_count = newVal
        }
        const { error } = await supabase
          .from('rymon_streamer_controls')
          .update(updatePayload)
          .eq('license_key', currentKey)
        if (error) {
          console.warn('Sync update warning:', error)
        }
      } catch (err) {
        console.warn('Sync warning:', err)
      }
    }
  }

  const handleSliderChange = (field: keyof StreamerControlRecord, val: number) => {
    if (!canControlCurrentKey()) return
    const baseRecord =
      record ||
      buildDefaultStreamerControlPayload({
        license_key: currentKey,
        streamer_name: currentUser?.role === 'owner' ? 'Owner Console' : 'VIP Streamer'
      })
    if (baseRecord.is_paused) {
      showToast('⏸️ License key is PAUSED. Slider adjustments are locked until unpaused by staff.')
      return
    }
    const nowIso = new Date().toISOString()
    const nextRecord: StreamerControlRecord = {
      ...baseRecord,
      license_key: currentKey,
      [field]: val,
      updated_at: nowIso
    }
    setRecord(nextRecord)

    sendRenderVipCommand(currentKey, field as string, val)

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current)
    sliderTimerRef.current = setTimeout(async () => {
      if (supabase && currentKey) {
        try {
          const ts = new Date().toISOString()
          await supabase
            .from('rymon_streamer_controls')
            .update({ [field]: val, updated_at: ts })
            .eq('license_key', currentKey)
        } catch (err) {
          console.warn('Sync warning:', err)
        }
      }
    }, 150)
  }

  const setThemePreset = async (idx: number) => {
    if (!canControlCurrentKey()) return
    const baseRecord =
      record ||
      buildDefaultStreamerControlPayload({
        license_key: currentKey,
        streamer_name: currentUser?.role === 'owner' ? 'Owner Console' : 'VIP Streamer'
      })
    if (baseRecord.is_paused) {
      showToast('⏸️ License key is PAUSED. Theme presets are locked until unpaused by staff.')
      return
    }
    const nowIso = new Date().toISOString()
    const nextRecord: StreamerControlRecord = {
      ...baseRecord,
      license_key: currentKey,
      theme_color_index: idx,
      updated_at: nowIso
    }
    setRecord(nextRecord)

    sendRenderVipCommand(currentKey, 'theme_color_index', idx)

    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ theme_color_index: idx, updated_at: nowIso })
          .eq('license_key', currentKey)
      } catch {}
    }
  }

  const handleEmergencyPurge = async () => {
    setShowPurgeModal(false)
    if (!canControlCurrentKey()) return
    if (currentKey) {
      sendRenderVipPatch(currentKey, { emergency_purge: true, is_online: false })
    }

    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ emergency_purge: true, is_online: false, updated_at: new Date().toISOString() })
          .eq('license_key', currentKey)
      } catch {}
    }
    alert(
      '🚨 Emergency Purge Dispatched!\nTarget device instructed to kill Stranger daemon and wipe /data/local/tmp.'
    )
  }

  const handleToggleRemotePanelMode = async () => {
    if (!canControlCurrentKey()) return
    const curName = record?.streamer_name || 'VIP|P:1|E:0|B:0'
    const isOverlayOn = !curName.includes('P:0')
    const nextOverlayOn = !isOverlayOn
    const eVal = curName.match(/E:(\d+)/)?.[1] || '0'
    const bVal = curName.match(/B:(\d+)/)?.[1] || '0'
    const nextName = `VIP|P:${nextOverlayOn ? '1' : '0'}|E:${eVal}|B:${bVal}`
    const nowIso = new Date().toISOString()

    setRecord((prev) => (prev ? { ...prev, streamer_name: nextName, updated_at: nowIso } : null))

    // Always send patch to Render VIP bridge (ensures in-memory zero-latency update)
    sendRenderVipPatch(currentKey, { streamer_name: nextName, in_game_panel: nextOverlayOn })

    if (supabase) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ streamer_name: nextName, updated_at: nowIso })
          .eq('license_key', currentKey)
      } catch {}
    }
    showToast(
      nextOverlayOn
        ? '👁️ Mode: WEB + IN-GAME OVERLAY'
        : '🕶️ Mode: WEB ONLY (In-Game Overlay Hidden)'
    )
  }

  const handleToggleStealthFreeze = async () => {
    if (!canControlCurrentKey()) return
    const nextPaused = !record?.is_paused
    const nowIso = new Date().toISOString()
    setRecord((prev) => (prev ? { ...prev, is_paused: nextPaused, updated_at: nowIso } : null))

    // 1. Immediately patch Render VIP bridge for zero-latency in-memory sync
    sendRenderVipPatch(currentKey, { is_paused: nextPaused })

    // 2. Patch Supabase streamer controls
    if (supabase) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ is_paused: nextPaused, updated_at: nowIso })
          .eq('license_key', currentKey)
      } catch {}

      // 3. Keep rymon_licenses in sync so telemetry refresh does not revert is_paused
      try {
        await supabase
          .from('rymon_licenses')
          .update({ is_paused: nextPaused, updated_at: nowIso })
          .eq('license_key', currentKey)
      } catch {}
    }

    // 4. Update local keys list if staff viewing admin/reseller table
    setKeysList((prev) =>
      prev.map((k) =>
        k.license_key.toUpperCase() === currentKey.toUpperCase()
          ? { ...k, is_paused: nextPaused }
          : k
      )
    )

    showToast(nextPaused ? '❄️ Stealth Freeze Active (Visuals Hidden)' : '▶️ Resumed Live Controls')
  }

  const handleCopyKey = (keyString: string) => {
    navigator.clipboard.writeText(keyString)
    setCopiedKey(keyString)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const formatDeliverySlip = (key: string, duration?: string, gameName?: string) => {
    const isVip = Boolean(duration?.includes('[VIP]'))
    const cleanDuration = (duration || '30 Days').replace(' [VIP]', '').replace('[VIP]', '').trim()
    const cleanGame = gameName || 'Free Fire MAX'

    if (isVip) {
      return [
        '👑 PAYMENT SUCCESSFUL — RYMON VIP STREAMER EDITION',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `🎮 GAME : ${cleanGame}`,
        `⏳ DURATION : ${cleanDuration} [VIP WEB REMOTE]`,
        `🔑 LICENSE KEY : ${key}`,
        '📱 APP LOGIN : Enter key in Android APK to authenticate',
        `💻 WEB REMOTE CONSOLE : https://greenvest.shop/connect?key=${encodeURIComponent(key)}`,
        '✨ VIP PERKS : 100% Invisible on screen • Live Remote Aimbot & ESP',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '❤️ Thank you for choosing RYMON VIP!'
      ].join('\n')
    }

    return [
      '📱 PAYMENT SUCCESSFUL — RYMON STANDARD APK LICENSE',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🎮 GAME : ${cleanGame}`,
      `⏳ DURATION : ${cleanDuration} (Standard Mobile)`,
      `🔑 LICENSE KEY : ${key}`,
      '📲 HOW TO USE : Login directly inside your APK game menu on your phone',
      'ℹ️ NOTE : Standard APK license for mobile use (Web Remote disabled)',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '❤️ Thank you for your purchase!'
    ].join('\n')
  }

  const handleCopyDeliverySlip = (key: string, duration?: string, gameName?: string) => {
    const slip = formatDeliverySlip(key, duration, gameName)
    navigator.clipboard.writeText(slip)
    setCopiedDeliverySlip(key)
    showToast('✅ Payment Successful Delivery Slip copied to clipboard!')
    setTimeout(() => setCopiedDeliverySlip(null), 2500)
  }

  const handleCopyAllDeliverySlips = (keys: string[], duration?: string, gameName?: string) => {
    if (!keys.length) return
    const slips = keys.map((k) => formatDeliverySlip(k, duration, gameName)).join('\n\n------------------------------\n\n')
    navigator.clipboard.writeText(slips)
    showToast(`✅ Copied ${keys.length} Payment & Delivery Slips to clipboard!`)
  }

  const handleCopyMultipleKeys = (keys: string[], label: string) => {
    if (!keys.length) {
      showToast(`No ${label} keys available to copy.`)
      return
    }
    navigator.clipboard.writeText(keys.join('\n'))
    showToast(`📋 Copied ${keys.length} ${label} key${keys.length > 1 ? 's' : ''} to clipboard!`)
  }

  const handleDownloadKeysTxt = (keys: string[], label: string) => {
    if (!keys.length) {
      showToast(`No ${label} keys available to download.`)
      return
    }
    const nowStr = new Date().toLocaleString('en-IN')
    const header = [
      '======================================================',
      '        ⚡ RYMON GHOST CONNECT VIP LICENSE KEYS       ',
      '======================================================',
      `Batch Type   : ${label.toUpperCase()} (${keys.length} Key${keys.length > 1 ? 's' : ''})`,
      `Issued By    : @${currentUser?.username || 'debajoyti'}`,
      `Generated At : ${nowStr}`,
      `Portal URL   : https://greenvest.shop/`,
      '======================================================',
      ''
    ].join('\r\n')
    const content = header + keys.join('\r\n') + '\r\n'
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `RYMON_${label.replace(/\s+/g, '_').toUpperCase()}_KEYS_${keys.length}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`📥 Downloaded ${keys.length} ${label} key${keys.length > 1 ? 's' : ''} as .TXT!`)
  }

  const handleShareKeysWhatsApp = (keys: string[], label: string) => {
    if (!keys.length) {
      showToast(`No ${label} keys available to share.`)
      return
    }
    const msg = [
      `⚡ *RYMON GHOST STREAMER VIP KEYS (${label.toUpperCase()})*`,
      `👤 Seller: *@${currentUser?.username || 'debajoyti'}*`,
      `📦 Total Keys: *${keys.length}*`,
      `⏳ Status: *Starts on 1st APK Login*`,
      '',
      ...keys.map((k, idx) => `${idx + 1}. \`${k}\``),
      '',
      `🌐 Web Remote Console: https://greenvest.shop/`
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  const formatRemainingTime = (expiresAt?: string | null, status?: string, isPaused?: boolean) => {
    if (status === 'BANNED') return '🚫 BANNED'
    if (status === 'WAITING' || !expiresAt) return '🟡 Starts on 1st Login'
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0 || status === 'EXPIRED') return '🔴 EXPIRED'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
    const mins = Math.floor((diff / (1000 * 60)) % 60)
    if (days > 0) return `${isPaused ? '⏸️ ' : '⏳ '}${days}d ${hours}h left`
    if (hours > 0) return `${isPaused ? '⏸️ ' : '⏳ '}${hours}h ${mins}m left`
    return `${isPaused ? '⏸️ ' : '⏳ '}${mins}m left`
  }

  const handleResetHWID = async (keyString: string) => {
    const res = await resetHwidBackend(
      keyString,
      currentUser?.username || 'debajoyti',
      currentUser?.role
    )
    if (!res.success) {
      alert(res.message)
      return
    }
    showToast(`🔄 ${res.message}`)
    fetchAllLicenses(currentUser).then(setKeysList)
    fetchAllActivities(currentUser).then(setActivities)
  }

  const handleDeleteKey = async (keyString: string, keyStatus?: string) => {
    const canDeleteThisKey =
      isOwner || keyStatus === 'EXPIRED' || keyStatus === 'WAITING'
    if (!canDeleteThisKey) {
      alert(
        'Power restriction: Only the Root Owner can delete an ACTIVE in-use key. You can delete Expired or Unused (Waiting) keys.'
      )
      return
    }
    if (confirm(`Permanently delete license key ${keyString}?`)) {
      const ok = await deleteLicenseBackend(keyString, currentUser?.username || 'debajoyti')
      if (ok) {
        showToast(`🗑️ Key ${keyString} deleted.`)
        fetchAllLicenses(currentUser).then(setKeysList)
        fetchAllActivities(currentUser).then(setActivities)
      } else {
        alert('Permission Denied: You cannot delete keys outside your downline.')
      }
    }
  }

  const handleToggleBanKey = async (keyString: string, currentStatus: string) => {
    if (!isOwner && !isAdmin) {
      alert('Power restriction: Resellers cannot ban keys (use Pause instead).')
      return
    }
    const shouldBan = currentStatus !== 'BANNED'
    const res = await toggleBanStatusBackend(
      keyString,
      'key',
      shouldBan,
      currentUser?.username || 'debajoyti'
    )
    if (res.success) {
      showToast(res.message)
      fetchAllLicenses(currentUser).then(setKeysList)
      fetchAllActivities(currentUser).then(setActivities)
    }
  }

  const handleQuickBulkDelete = async (keyType: 'expired' | 'unused' | 'all') => {
    if (keyType === 'all' && !isRootOwner) {
      alert('Power restriction: Only the Root Founder (debajoyti) can wipe ALL active keys.')
      return
    }
    const targetCount =
      keyType === 'expired'
        ? stats.expired
        : keyType === 'unused'
        ? stats.unused
        : stats.total
    if (targetCount === 0) {
      showToast(`No ${keyType.toUpperCase()} keys found to delete.`)
      return
    }
    const label =
      keyType === 'expired'
        ? `ALL ${targetCount} EXPIRED keys`
        : keyType === 'unused'
        ? `ALL ${targetCount} UNUSED (WAITING) keys`
        : `ALL ${targetCount} KEYS (INCLUDING ACTIVE)`
    if (!confirm(`⚠️ Are you sure you want to permanently delete ${label}?`)) {
      return
    }
    const count = await bulkDeleteKeysBackend(
      '__ALL__',
      keyType,
      currentUser?.username || 'debajoyti'
    )
    showToast(`🧹 Purged ${count} ${keyType.toUpperCase()} key${count === 1 ? '' : 's'}!`)
    fetchAllLicenses(currentUser).then(setKeysList)
    fetchAllActivities(currentUser).then(setActivities)
  }

  const handleToggleUserBan = async (targetUser: string, currentlyBanned: boolean) => {
    if ((targetUser || '').toLowerCase() === 'debajoyti') {
      alert('Action forbidden: Root Owner account cannot be banned.')
      return
    }
    const confirmMsg = currentlyBanned
      ? `Restore and unban account "${targetUser}"?`
      : `Revoke access and ban account "${targetUser}"?`
    if (!window.confirm(confirmMsg)) return

    const res = await toggleBanStatusBackend(
      targetUser,
      'user',
      !currentlyBanned,
      currentUser?.username || 'debajoyti'
    )
    if (res.success) {
      showToast(res.message)
      fetchAllAccounts(currentUser).then(setUsersList)
    } else {
      alert(res.message)
    }
  }

  const handleDeleteUser = async (targetUser: string, targetRole: string, targetUplink: string) => {
    if (!currentUser) return
    const cleanTarget = (targetUser || '').trim()

    if (cleanTarget.toLowerCase() === 'debajoyti') {
      alert('Action forbidden: Root Owner account cannot be deleted.')
      return
    }

    if (cleanTarget.toLowerCase() === 'ryzen' && !isRootOwner) {
      alert('Action forbidden: Owner account @RYZEN cannot be deleted.')
      return
    }

    if (currentUser?.username && cleanTarget.toLowerCase() === currentUser.username.toLowerCase()) {
      alert('Action forbidden: You cannot delete your own active account.')
      return
    }

    if (isOwner) {
      if (!isRootOwner && targetRole === 'owner') {
        alert('Permission Denied: Only the Root Founder can delete Owner accounts.')
        return
      }
    } else if (isAdmin) {
      if (targetRole !== 'reseller' || !currentUser?.username || (targetUplink || '').toLowerCase() !== currentUser.username.toLowerCase()) {
        alert('Permission Denied: Admins can only delete Resellers registered under their own downline.')
        return
      }
    } else {
      alert('Permission Denied: You do not have permission to delete accounts.')
      return
    }

    const confirmMsg = `⚠️ PERMANENT DELETE WARNING:\n\nAre you sure you want to permanently delete user @${cleanTarget} (${String(targetRole || 'user').toUpperCase()})?\n\nThis will remove their account credentials, login access, and wallet. This action CANNOT be undone.`
    if (!window.confirm(confirmMsg)) return

    const res = await deleteAccountBackend(cleanTarget, currentUser)
    if (res.success) {
      showToast(`🗑️ User @${cleanTarget} permanently deleted.`)
      fetchAllAccounts(currentUser).then(setUsersList)
      fetchAllActivities(currentUser).then(setActivities)
    } else {
      alert(`Failed to delete user: ${res.error || 'Unknown error'}`)
    }
  }

  const handleApplyDeleteUserKeys = async () => {
    if (!targetDeleteUser) {
      alert('Please select a target scope or user.')
      return
    }
    if (!isRootOwner && deleteKeyType === 'all') {
      alert('Power restriction: Only the Root Owner can delete ALL active keys. You can clean Expired or Unused keys.')
      return
    }
    const scopeLabel =
      targetDeleteUser === '__ALL__'
        ? isOwner
          ? 'Entire Platform'
          : isAdmin
          ? 'Your Admin Team'
          : `@${currentUser?.username}`
        : `@${targetDeleteUser}`
    if (!confirm(`Confirm permanent deletion of ${deleteKeyType.toUpperCase()} keys for ${scopeLabel}?`)) {
      return
    }
    const count = await bulkDeleteKeysBackend(
      targetDeleteUser,
      deleteKeyType,
      currentUser?.username || 'debajoyti'
    )
    showToast(`🧹 Purged ${count} ${deleteKeyType} key${count === 1 ? '' : 's'} (${scopeLabel}).`)
    fetchAllLicenses(currentUser).then(setKeysList)
    fetchAllActivities(currentUser).then(setActivities)
  }

  const handleApplyExtendKey = async () => {
    if (!targetExtendKey) {
      alert('Please select a target key.')
      return
    }
    if (extendAmount < 7) {
      alert('Extension under 7 days is disabled. Minimum extension duration is 7 days.')
      return
    }
    if (targetExtendKey === '__ALL__') {
      await handleBulkExtendAllKeys(extendAmount)
      return
    }
    const selectedKey = keysList.find((k) => k.license_key === targetExtendKey)
    const cost = isOwner ? 0 : calculateExtensionCost(extendAmount, currentUser?.username, selectedKey?.devices_max || 1)
    const currentBal = walletBalance ?? currentUser?.balance ?? 0
    if (!isOwner && currentBal < cost) {
      alert(`Insufficient wallet balance! Extending this key by +${extendAmount} days costs ₹${cost}, but your balance is ₹${currentBal}.`)
      return
    }
    const res = await extendLicenseBackend(
      targetExtendKey,
      extendAmount,
      currentUser?.username || 'debajoyti'
    )
    if (res.success) {
      if (res.remainingBalance !== undefined && currentUser) {
        setWalletBalance(res.remainingBalance)
        const updatedMe = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedMe)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedMe))
      }
      showToast(
        `License ${targetExtendKey} extended by +${extendAmount} days!${
          !isOwner && res.cost ? ` (₹${res.cost} deducted from wallet)` : ''
        }`
      )
      fetchAllLicenses(currentUser).then(setKeysList)
    } else {
      alert(res.error || 'Failed to extend license.')
    }
  }

  const handleCustomerSelfResetHwid = async (targetKey: string) => {
    const clean = (targetKey || '').trim().toUpperCase()
    if (!clean) {
      setSelfResetMsg('ℹ️ Enter your License Key above first, then click Reset Key HWID (2/Day).')
      showToast('ℹ️ Please enter your License Key first!')
      return
    }
    setSelfResetBusy(true)
    setSelfResetMsg('')
    const isOwnerOverride = Boolean(isOwner)
    const res = await selfServiceResetKeyHwidBackend(
      clean,
      isOwnerOverride,
      currentUser?.username || 'WebUser'
    )
    setSelfResetBusy(false)
    setSelfResetMsg(res.message)
    showToast(res.message)
    if (res.success) {
      setKeysList((prev) =>
        prev.map((k) =>
          k.license_key.toUpperCase() === clean ? { ...k, device_hwid: '', devices_used: 0 } : k
        )
      )
      setStreamerControls((prev) =>
        prev.map((c) =>
          c.license_key.toUpperCase() === clean
            ? { ...c, device_hwid: '', devices_used: 0, is_online: false }
            : c
        )
      )
    }
  }

  // 12. REFERRAL ONBOARDING & CONNECT API HANDLERS
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegLoading(true)
    setRegError('')

    const res = await registerWithReferral(regUsername, regPassword, regEmail, regInviteCode)
    setRegLoading(false)

    if (res.success && res.user) {
      setCurrentUser(res.user)
      setWalletBalance(res.user.balance)
      setIsAuthenticated(true)
      localStorage.setItem('rymon_session_user', JSON.stringify(res.user))
      showToast(`Welcome! You are registered as ${res.user.role.toUpperCase()} (Starting Balance: ₹${res.user.balance.toLocaleString('en-IN')})`)
      setActiveTab('overview')
    } else {
      setRegError(res.message || 'Registration failed. Check referral code.')
    }
  }

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOwner && refTargetRole !== 'reseller') {
      alert('Power restriction: Only Owners (debajoyti & ryzen) can issue Administrator invite codes. Admins can only invite downline Resellers.')
      return
    }
    setRefCreating(true)
    const bal = typeof refInitialBal === 'number' ? refInitialBal : 0
    const res = await createReferralCode(
      currentUser?.username || 'debajoyti',
      isOwner ? refTargetRole : 'reseller',
      bal,
      refCustomCode,
      refMaxUses,
      refSubDays
    )
    setRefCreating(false)
    if (res.success) {
      if (res.remainingBalance !== undefined && currentUser) {
        setWalletBalance(res.remainingBalance)
        const updatedMe = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedMe)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedMe))
      }
      showToast(`Created ${refSubDays}D subscription invite code: ${res.code}`)
      setRefCustomCode('')
      setRefInitialBal('')
      const updatedList = await fetchReferralCodes(currentUser)
      setReferralList(updatedList)
    } else {
      alert(res.message || 'Failed to create referral code')
    }
  }

  const handleDeleteReferral = async (id: number, code?: string) => {
    if (!confirm('Are you sure you want to permanently delete this invite code from the database?')) return
    const success = await deleteReferralCode(id, code, currentUser?.username || 'debajoyti')
    if (success) {
      setReferralList((prev) => prev.filter((r) => r.id !== id && (!code || r.code !== code)))
      showToast('Invite code permanently deleted from database')
    }
  }

  const handleCopyReferral = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedRefCode(code)
    showToast(`Copied ${code} to clipboard`)
    setTimeout(() => setCopiedRefCode(null), 2500)
  }

  const handleRenewUserSubscription = async (targetUsername: string, days: 30 | 60) => {
    const res = await renewUserSubscriptionBackend(
      targetUsername,
      days,
      currentUser?.username || 'debajoyti'
    )
    if (res.success) {
      if (res.remainingBalance !== undefined && currentUser) {
        setWalletBalance(res.remainingBalance)
        const updatedMe = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedMe)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedMe))
      }
      showToast(`✅ ${res.message}`)
      fetchAllAccounts(currentUser).then(setUsersList)
      fetchAllLicenses(currentUser).then(setKeysList)
      fetchAllActivities(currentUser).then(setActivities)
    } else {
      alert(`Error: ${res.message}`)
    }
  }

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwdModalUser) return
    if (!pwdNewValue.trim() || pwdNewValue.trim().length < 4) {
      alert('Password must be at least 4 characters.')
      return
    }
    setPwdLoading(true)
    const res = await resetUserPasswordBackend(
      pwdModalUser,
      pwdNewValue.trim(),
      currentUser?.username || 'debajoyti'
    )
    setPwdLoading(false)
    if (res.success) {
      showToast(`🔑 ${res.message}`)
      fetchAllAccounts(currentUser).then(setUsersList)
      fetchAllActivities(currentUser).then(setActivities)
      setPwdModalUser(null)
      setPwdNewValue('')
    } else {
      alert(res.message)
    }
  }

  const handleSaveSecurityPolicy = async (nextPolicy: SovereignSecurityPolicy) => {
    setSecurityPolicy(nextPolicy)
    await saveSovereignSecurityPolicy(nextPolicy)
    showToast('🛡️ RYMON Enterprise Security Policy saved!')
  }

  const handleTogglePauseKey = async (keyString: string) => {
    const res = await togglePauseLicenseBackend(keyString, currentUser?.username || 'debajoyti')
    if (res.success) {
      showToast(res.message)
      // Keep Render VIP in sync if streamer daemon is attached
      sendRenderVipPatch(keyString, { is_paused: res.is_paused })
      setKeysList((prev) =>
        prev.map((k) =>
          k.license_key === keyString
            ? {
                ...k,
                is_paused: res.is_paused,
                status: res.status as 'ACTIVE' | 'WAITING' | 'EXPIRED' | 'BANNED' | 'PAUSED',
                expires_at: res.newExpiresAt !== undefined ? res.newExpiresAt : k.expires_at
              }
            : k
        )
      )
      if (currentKey === keyString && res.newExpiresAt) {
        setExpiryDate(new Date(res.newExpiresAt))
      }
      if (record && record.license_key === keyString) {
        setRecord((prev) => (prev ? { ...prev, is_paused: res.is_paused } : null))
      }
    } else {
      alert(`Error: ${res.message}`)
    }
  }

  const handleBulkPauseAllKeys = async (pauseState: boolean) => {
    const creatorFilter = currentUser?.role === 'reseller' ? currentUser.username : undefined
    const res = await bulkTogglePauseAllKeysBackend(
      pauseState,
      currentUser?.username || 'debajoyti',
      creatorFilter
    )
    if (res.success) {
      showToast(`⚡ ${res.message}`)
      fetchAllLicenses(currentUser).then(setKeysList)
      if (record) {
        setRecord((prev) => (prev ? { ...prev, is_paused: pauseState } : null))
      }
    }
  }

  const handleBulkResetAllHwid = async () => {
    const creatorFilter = currentUser?.role === 'reseller' ? currentUser.username : undefined
    const res = await bulkResetAllHwidBackend(currentUser?.username || 'debajoyti', creatorFilter)
    if (res.success) {
      showToast(`🔄 ${res.message}`)
      fetchAllLicenses(currentUser).then(setKeysList)
    }
  }

  const handleBulkExtendAllKeys = async (days: number) => {
    if (days < 7) {
      alert('Extension under 7 days is disabled. Minimum extension duration is 7 days.')
      return
    }
    const creatorFilter = currentUser?.role === 'reseller' ? currentUser.username : undefined
    const activeTargets = keysList.filter((k) => {
      if (k.status === 'BANNED') return false
      if (creatorFilter && (k.creator_username || '').toLowerCase() !== creatorFilter.toLowerCase()) return false
      return true
    })
    if (activeTargets.length === 0) {
      showToast('⚠️ No active keys found in your downline to extend.')
      return
    }
    const totalCost = isOwner
      ? 0
      : activeTargets.reduce(
          (sum, k) => sum + calculateExtensionCost(days, currentUser?.username, k.devices_max || 1),
          0
        )
    const currentBal = walletBalance ?? currentUser?.balance ?? 0
    if (!isOwner && currentBal < totalCost) {
      alert(`Insufficient wallet balance! Bulk extending ${activeTargets.length} key(s) by +${days} days costs ₹${totalCost.toLocaleString('en-IN')}, but your balance is ₹${currentBal.toLocaleString('en-IN')}.`)
      return
    }
    const costNotice = isOwner ? 'FREE (Owner)' : `₹${totalCost.toLocaleString('en-IN')} (Bal: ₹${currentBal.toLocaleString('en-IN')})`
    if (!confirm(`Confirm bulk extending ${activeTargets.length} key(s) by +${days} Days?\nWallet Deduction: ${costNotice}`)) {
      return
    }
    const res = await bulkExtendAllKeysBackend(days, currentUser?.username || 'debajoyti', creatorFilter)
    if (res.success) {
      if (res.remainingBalance !== undefined && currentUser) {
        setWalletBalance(res.remainingBalance)
        const updatedMe = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedMe)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedMe))
      }
      showToast(`➕ ${res.message}`)
      fetchAllLicenses(currentUser).then(setKeysList)
    } else {
      alert(res.message)
    }
  }

  const handleTestConnectApi = async () => {
    setTestConnectLoading(true)
    setTestConnectResult('')
    const targetApp = (connectSelectedApp === 'Custom' || connectSelectedApp === '__CUSTOM__') ? (connectCustomAppName.trim() || 'Tool X') : connectSelectedApp
    try {
      // 1. Primary: Edge Gateway (zero headers required, SSL cloud-synced)
      const res = await fetch('https://greenvest.shop/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_key: testConnectKey.trim(),
          serial: testConnectHwid.trim(),
          app: targetApp
        })
      })
      const json = await res.json()
      setTestConnectResult(JSON.stringify(json, null, 2))
      if (json.status || json.success || json.valid) {
        showToast(`✅ [${targetApp}] Key authenticated!`)
      } else {
        showToast(`❌ [${targetApp}] ${json.reason || json.message || 'Key verification rejected'}`)
      }
    } catch {
      // 2. Direct RYMON RPC Fallback
      try {
        const resRpc = await fetch(SOVEREIGN_CONNECT_CONFIG.endpoint_url, {
          method: 'POST',
          headers: {
            'apikey': SOVEREIGN_CONNECT_CONFIG.anon_key,
            'Authorization': `Bearer ${SOVEREIGN_CONNECT_CONFIG.anon_key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_license_key: testConnectKey.trim(),
            p_hwid: testConnectHwid.trim(),
            p_game: targetApp
          })
        })
        const jsonRpc = await resRpc.json()
        setTestConnectResult(JSON.stringify(jsonRpc, null, 2))
        showToast('Verified via direct RPC fallback')
      } catch (fallbackErr: unknown) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Network connection error'
        setTestConnectResult(JSON.stringify({ error: errMsg }, null, 2))
      }
    } finally {
      setTestConnectLoading(false)
    }
  }

  const handleAddNewApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAppName.trim()) {
      setAppActionError('Application / Game name cannot be empty')
      return
    }
    setAppsLoading(true)
    setAppActionError('')
    setAppActionSuccess('')
    try {
      const updated = await addRegisteredApp({
        name: newAppName.trim(),
        package_name: newAppPackage.trim(),
        platform: newAppPlatform,
        icon: newAppIcon || '🎮',
        description: newAppDesc.trim()
      })
      setRegisteredApps(updated)
      setNewAppName('')
      setNewAppPackage('')
      setNewAppDesc('')
      setAppActionSuccess(`Successfully registered "${newAppName.trim()}" in ecosystem!`)
      showToast(`Registered app "${newAppName.trim()}"`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to register application'
      setAppActionError(errMsg)
    } finally {
      setAppsLoading(false)
    }
  }

  const handleDeleteApp = async (app: RegisteredApp) => {
    if (!window.confirm(`Are you sure you want to remove "${app.name}" from registered applications?\n\nExisting keys for "${app.name}" in database will remain intact, but new keys will no longer target this app unless re-added.`)) {
      return
    }
    setAppsLoading(true)
    try {
      const updated = await deleteRegisteredApp(app.id)
      setRegisteredApps(updated)
      if (genGame.toLowerCase() === (app.name || '').toLowerCase()) {
        setGenGame('Free Fire MAX')
        localStorage.setItem('rymon_selected_gen_game', 'Free Fire MAX')
      }
      if (connectSelectedApp.toLowerCase() === (app.name || '').toLowerCase()) {
        setConnectSelectedApp('Free Fire MAX')
        localStorage.setItem('rymon_connect_selected_app', 'Free Fire MAX')
      }
      showToast(`Removed app "${app.name}"`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to remove application'
      alert(errMsg)
    } finally {
      setAppsLoading(false)
    }
  }

  void [
    appsLoading, setAppsLoading, newAppName, setNewAppName, newAppPackage, setNewAppPackage,
    newAppPlatform, setNewAppPlatform, newAppDesc, setNewAppDesc, newAppIcon, setNewAppIcon,
    appActionError, setAppActionError, appActionSuccess, setAppActionSuccess,
    selectedSnippetApp, setSelectedSnippetApp, snippetLanguage, setSnippetLanguage,
    handleAddNewApp, handleDeleteApp
  ]

  const showToast = (msg: string) => {
    setActionSuccessMsg(msg)
    setTimeout(() => setActionSuccessMsg(''), 3500)
  }

  // Live Online / Playing Now Set (requires fresh heartbeat within 35s from running game)
  const onlineKeySet = useMemo(() => {
    const set = new Set<string>()
    for (const c of streamerControls) {
      if (isStreamerKeyActivelyPlaying(c)) {
        set.add(c.license_key.toUpperCase())
      }
    }
    if (record && isStreamerKeyActivelyPlaying(record) && currentKey) {
      set.add(currentKey.toUpperCase())
    }
    return set
  }, [streamerControls, record, currentKey])

  // Filtered queries
  const filteredKeys = useMemo(() => {
    return keysList.filter((k) => {
      if (!k) return false
      const licKey = String(k.license_key || '').toUpperCase()
      const creator = String(k.creator_username || '').toLowerCase()
      const gameName = String(k.game || '').toLowerCase()
      const hwid = String(k.device_hwid || '').toLowerCase()

      if (
        keyStatusFilter === 'PLAYING' &&
        !(!k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(licKey))
      ) {
        return false
      }
      if (keyStatusFilter === 'PAUSED' && !(k.is_paused || k.status === 'PAUSED')) return false
      if (keyStatusFilter === 'ACTIVE' && (k.is_paused || k.status !== 'ACTIVE')) return false
      if (keyStatusFilter === 'WAITING' && k.status !== 'WAITING') return false
      if (keyStatusFilter === 'EXPIRED' && k.status !== 'EXPIRED') return false
      if (keyStatusFilter === 'BANNED' && k.status !== 'BANNED') return false
      if (
        keyCreatorFilter !== 'ALL' &&
        creator !== keyCreatorFilter.toLowerCase()
      ) {
        return false
      }
      if (
        keyGameFilter !== 'ALL' &&
        gameName !== keyGameFilter.toLowerCase()
      ) {
        return false
      }
      if (keyEditionFilter === 'VIP' && !k.plan_duration?.includes('[VIP]')) {
        return false
      }
      if (keyEditionFilter === 'NORMAL' && k.plan_duration?.includes('[VIP]')) {
        return false
      }
      if (!searchKeyQuery.trim()) return true
      const q = searchKeyQuery.toLowerCase()
      return (
        licKey.toLowerCase().includes(q) ||
        gameName.includes(q) ||
        creator.includes(q) ||
        hwid.includes(q)
      )
    })
  }, [keysList, searchKeyQuery, keyStatusFilter, keyEditionFilter, keyCreatorFilter, keyGameFilter, onlineKeySet])

  const filteredUsers = useMemo(() => {
    if (!searchUserQuery.trim()) return usersList
    const q = searchUserQuery.toLowerCase()
    return usersList.filter(
      (u) =>
        Boolean(u) &&
        (String(u.username || '').toLowerCase().includes(q) ||
          String(u.email || '').toLowerCase().includes(q) ||
          String(u.role || '').toLowerCase().includes(q) ||
          String(u.uplink || '').toLowerCase().includes(q))
    )
  }, [usersList, searchUserQuery])

  // Overview Counts
  const stats = useMemo(() => {
    const validKeys = keysList.filter(Boolean)
    const total = validKeys.length
    const active = validKeys.filter((k) => k.status === 'ACTIVE' && !k.is_paused).length
    const paused = validKeys.filter((k) => k.is_paused || k.status === 'PAUSED').length
    const unused = validKeys.filter((k) => k.status === 'WAITING').length
    const expired = validKeys.filter((k) => k.status === 'EXPIRED').length
    const banned = validKeys.filter((k) => k.status === 'BANNED').length
    const reset = validKeys.filter((k) => k.devices_used === 0 && k.status === 'ACTIVE').length
    const playingNow = validKeys.filter(
      (k) => !k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(String(k.license_key || '').toUpperCase())
    ).length
    const notPlaying = Math.max(0, total - playingNow)
    const vipCount = validKeys.filter((k) => k.plan_duration?.includes('[VIP]')).length
    const normalCount = Math.max(0, total - vipCount)
    return { total, active, paused, unused, expired, banned, reset, playingNow, notPlaying, vipCount, normalCount }
  }, [keysList, onlineKeySet])

  // Cross-App & Custom App Permission Engine (Debajoyti Authorization Engine)
  const isUserCustomAppAllowed = (user?: RymonAccount | null, appName?: string) => {
    if (!user) return false
    const username = (user.username || '').toLowerCase()
    // Root Founder (debajoyti) has unrestricted access across all apps
    if (username === 'debajoyti') return true

    // Check specific allowed apps list if user has one
    const allowedApps = (user.permissions as any)?.allowed_apps as string[] | undefined
    if (appName && Array.isArray(allowedApps)) {
      if (allowedApps.some((a) => a.toLowerCase() === appName.toLowerCase())) return true
    }

    const perm = user.permissions?.allow_custom_apps
    if (perm !== undefined) return Boolean(perm)
    return false
  }

  const canGenerateCustomApps = isUserCustomAppAllowed(currentUser)

  const openAppPermModal = (user: RymonAccount) => {
    setAppPermModalUser(user)
    setAppPermWildcard(Boolean(user.permissions?.allow_custom_apps))
    const allowed = Array.isArray((user.permissions as any)?.allowed_apps)
      ? [...(user.permissions as any).allowed_apps]
      : []
    setAppPermSelectedApps(allowed)
  }

  const handleSaveAppPermissions = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appPermModalUser) return
    setAppPermLoading(true)
    const targetUsername = appPermModalUser.username
    try {
      const updated = usersList.map((u) => {
        if ((u.username || '').toLowerCase() === targetUsername.toLowerCase()) {
          return {
            ...u,
            permissions: {
              ...(u.permissions || {}),
              allow_custom_apps: appPermWildcard,
              allowed_apps: appPermSelectedApps
            }
          }
        }
        return u
      })
      setUsersList(updated)
      saveStoredAccounts(updated)

      if (supabase) {
        const targetObj = updated.find((u) => (u.username || '').toLowerCase() === targetUsername.toLowerCase())
        if (targetObj) {
          await updateUserPermissionsBackend(targetUsername, targetObj.permissions, currentUser?.username || 'debajoyti')
        }
      }
      showToast(`Updated app permissions for @${targetUsername}`)
      setAppPermModalUser(null)
    } catch {
      showToast('Failed to update app permissions')
    } finally {
      setAppPermLoading(false)
    }
  }

  const handleToggleUserCustomApps = async (targetUsername: string, allow: boolean) => {
    try {
      const updated = usersList.map((u) => {
        if ((u.username || '').toLowerCase() === (targetUsername || '').toLowerCase()) {
          return {
            ...u,
            permissions: {
              ...(u.permissions || {}),
              allow_custom_apps: allow
            }
          }
        }
        return u
      })
      setUsersList(updated)
      saveStoredAccounts(updated)

      if (supabase) {
        const targetObj = updated.find((u) => (u.username || '').toLowerCase() === (targetUsername || '').toLowerCase())
        if (targetObj) {
          await updateUserPermissionsBackend(targetUsername, targetObj.permissions, currentUser?.username || 'debajoyti')
        }
      }
      showToast(`Updated @${targetUsername}: ${allow ? '✨ Custom Allowed' : '🔒 FF MAX Only'}`)
    } catch {
      showToast('Failed to update user app permissions')
    }
  }
  void handleToggleUserCustomApps

  const isUserVipRemoteAllowed = (user?: RymonAccount | null) => {
    if (!user) return false
    if (user.role === 'owner') return true
    const perm = user.permissions?.allow_web_remote
    if (perm !== undefined) return Boolean(perm)
    if (user.role === 'admin') return securityPolicy.allow_admin_web_remote ?? true
    if (user.role === 'reseller') return securityPolicy.allow_reseller_web_remote ?? false
    return false
  }

  const handleToggleUserVipRemote = async (targetUsername: string, allow: boolean) => {
    try {
      const updated = usersList.map((u) => {
        if ((u.username || '').toLowerCase() === (targetUsername || '').toLowerCase()) {
          return {
            ...u,
            permissions: {
              ...(u.permissions || {}),
              allow_web_remote: allow
            }
          }
        }
        return u
      })
      setUsersList(updated)
      saveStoredAccounts(updated)

      if (supabase) {
        const targetObj = updated.find((u) => (u.username || '').toLowerCase() === (targetUsername || '').toLowerCase())
        if (targetObj) {
          await updateUserPermissionsBackend(targetUsername, targetObj.permissions, currentUser?.username || 'debajoyti')
        }
      }
      showToast(`Updated @${targetUsername}: ${allow ? '👑 VIP Web Remote Permitted' : '🔒 APK Only'}`)
    } catch {
      showToast('Failed to update user VIP remote permissions')
    }
  }

  // Sovereign RBAC tab isolation guard
  useEffect(() => {
    const streamerAllowed = ['remote']
    if (isStreamer && !streamerAllowed.includes(activeTab)) {
      setActiveTab('remote')
    } else if (
      isReseller &&
      !['remote', 'overview', 'generate', 'keys', 'extend', 'advance'].includes(activeTab)
    ) {
      setActiveTab('overview')
    } else if (
      isAdmin &&
      ![
        'remote',
        'overview',
        'generate',
        'keys',
        'extend',
        'users',
        'add-balance',
        'referrals',
        'delete',
        'advance'
      ].includes(activeTab)
    ) {
      setActiveTab('overview')
    } else if (!isRootOwner && (activeTab === 'connect-api' || activeTab === 'apps')) {
      setActiveTab('overview')
    }
  }, [isStreamer, isReseller, isAdmin, isOwner, isRootOwner, activeTab])

  return (
    <div style={styles.appShell}>
      {/* Phantom Amethyst Kinetic Micro-Interactions & Ambient FX */}
      <style>{`
        @keyframes sgRadarPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            box-shadow: 0 0 0 9px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
        @keyframes sgAmethystGlow {
          0%, 100% {
            box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
          }
          50% {
            box-shadow: 0 0 26px rgba(168, 85, 247, 0.65), 0 0 40px rgba(244, 63, 94, 0.2);
          }
        }
        @keyframes sgPanicPulse {
          0%, 100% {
            box-shadow: 0 0 8px rgba(244, 63, 94, 0.45);
            border-color: rgba(244, 63, 94, 0.6);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 22px rgba(244, 63, 94, 0.9);
            border-color: rgba(244, 63, 94, 1);
            transform: scale(1.02);
          }
        }
        @keyframes sgOnlineGlow {
          0%, 100% {
            opacity: 1;
            filter: drop-shadow(0 0 4px #05df72);
          }
          50% {
            opacity: 0.75;
            filter: drop-shadow(0 0 10px #05df72);
          }
        }
        /* Sleek cyber glass scrollbar */
        ::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(8, 7, 14, 0.7);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.35);
          border-radius: 999px;
          border: 1px solid rgba(168, 85, 247, 0.2);
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.65);
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
        }
        /* Kinetic glass hover */
        .sg-glass-card {
          transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.22s ease, box-shadow 0.22s ease;
        }
        .sg-glass-card:hover {
          transform: translateY(-2px);
          border-color: rgba(168, 85, 247, 0.45) !important;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6), 0 0 20px rgba(168, 85, 247, 0.18) !important;
        }
        .sg-panic-btn {
          animation: sgPanicPulse 2.4s infinite ease-in-out;
        }
        .sg-live-beacon {
          animation: sgRadarPulse 2s infinite cubic-bezier(0, 0, 0.2, 1);
        }

        /* Desktop defaults for mobile-only elements */
        .sg-mobile-bottom-bar { display: none; }
        .sg-mobile-drawer-header { display: none; }
        .sg-mobile-backdrop { display: none; }

        /* ══════════════════════════════════════════════════════════════════════════
           PHANTOM AMETHYST MOBILE-FIRST RESPONSIVE ENGINE (GREENVEST STREAMGUARD)
           ══════════════════════════════════════════════════════════════════════════ */
        @media (max-width: 900px) {
          /* Prevent horizontal screen wobbling/overflow */
          html, body, #root {
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }
          .sg-app-shell {
            overflow-x: hidden !important;
            width: 100% !important;
            max-width: 100vw !important;
          }

          /* Global touch optimization */
          button, a, input, select {
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Prevent iOS Safari auto-zoom on inputs */
          input[type="text"],
          input[type="password"],
          input[type="email"],
          input[type="number"],
          select {
            font-size: 16px !important;
          }

          /* Mobile range slider enhancement */
          input[type="range"] {
            height: 28px !important;
            touch-action: pan-x !important;
            cursor: pointer !important;
          }

          /* 1. Header Optimization (Zero-Overlap Architectural Shield) */
          .sg-top-header {
            padding: 8px 12px !important;
            gap: 8px !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 100 !important;
            width: 100% !important;
            max-width: 100vw !important;
            box-sizing: border-box !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            min-height: 52px !important;
          }
          .sg-header-left {
            gap: 8px !important;
            flex: 0 1 auto !important;
            min-width: 0 !important;
            max-width: calc(100% - 150px) !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
          }
          .sg-mobile-menu-toggle {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
            border-radius: 9px !important;
            background: rgba(168, 85, 247, 0.16) !important;
            border: 1px solid rgba(168, 85, 247, 0.35) !important;
            color: #c084fc !important;
            font-size: 18px !important;
            cursor: pointer !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
            transition: all 0.2s ease !important;
            touch-action: manipulation !important;
            box-shadow: 0 0 10px rgba(168, 85, 247, 0.2) !important;
          }
          .sg-mobile-menu-toggle:active {
            transform: scale(0.92) !important;
            background: rgba(168, 85, 247, 0.3) !important;
          }
          .sg-brand-cluster {
            gap: 8px !important;
            min-width: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
            cursor: default !important;
          }
          .sg-brand-text-block {
            min-width: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .sg-brand-title {
            font-size: 14px !important;
            font-weight: 900 !important;
            letter-spacing: 0.05em !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 120px !important;
            line-height: 1.15 !important;
          }
          .sg-brand-corp-text {
            display: none !important;
          }
          .sg-brand-sub {
            display: none !important;
          }
          .sg-header-right {
            gap: 6px !important;
            flex: 0 0 auto !important;
            margin-left: auto !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
          }
          .sg-balance-pill {
            padding: 4px 9px !important;
            font-size: 11px !important;
            border-radius: 12px !important;
            white-space: nowrap !important;
            flex-shrink: 0 !important;
            touch-action: manipulation !important;
            cursor: pointer !important;
            font-weight: 800 !important;
          }
          .sg-telemetry-pill {
            display: none !important;
          }
          .sg-user-profile-pill {
            padding: 3px 6px !important;
            gap: 5px !important;
            border-radius: 12px !important;
            flex-shrink: 0 !important;
            touch-action: manipulation !important;
          }
          .sg-user-name-block {
            display: none !important;
          }
          .sg-header-logout-btn {
            min-width: 28px !important;
            min-height: 28px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            border-radius: 7px !important;
            background: rgba(239, 68, 68, 0.15) !important;
            border: 1px solid rgba(239, 68, 68, 0.35) !important;
            color: #fca5a5 !important;
            padding: 0 !important;
          }

          /* 2. Main Layout & Sidebar Drawer */
          .sg-main-layout {
            flex-direction: column !important;
            min-height: calc(100vh - 52px) !important;
            width: 100% !important;
          }
          .sg-sidebar {
            display: none !important;
          }
          .sg-sidebar.open {
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 280px !important;
            max-width: 84vw !important;
            z-index: 1001 !important;
            background: #0d0a18 !important;
            box-shadow: 0 0 60px rgba(0, 0, 0, 0.95), 0 0 30px rgba(168, 85, 247, 0.3) !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 16px 14px calc(76px + env(safe-area-inset-bottom, 20px)) !important;
            border-right: 1px solid rgba(168, 85, 247, 0.35) !important;
            animation: sgSlideDrawer 0.24s cubic-bezier(0.16, 1, 0.3, 1) both !important;
          }
          .sg-mobile-backdrop {
            display: block !important;
            position: fixed !important;
            inset: 0 !important;
            background-color: rgba(0, 0, 0, 0.8) !important;
            backdrop-filter: blur(5px) !important;
            -webkit-backdrop-filter: blur(5px) !important;
            z-index: 1000 !important;
            animation: sgFadeIn 0.2s ease both !important;
          }
          .sg-mobile-drawer-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding-bottom: 14px !important;
            margin-bottom: 12px !important;
            border-bottom: 1px solid rgba(168, 85, 247, 0.2) !important;
          }
          .sg-mobile-close-btn {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 36px !important;
            height: 36px !important;
            border-radius: 8px !important;
            background: rgba(255, 255, 255, 0.08) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            color: #f8fafc !important;
            font-size: 16px !important;
            cursor: pointer !important;
            touch-action: manipulation !important;
          }
          .sg-mobile-close-btn:active {
            transform: scale(0.92) !important;
          }

          /* 3. Content Pane & Containers */
          .sg-content-pane {
            padding: 14px 12px calc(76px + env(safe-area-inset-bottom, 16px)) !important;
            width: 100% !important;
            max-width: 100vw !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          .sg-view-container {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* 4. Auth Gateway */
          .sg-auth-gate-box {
            width: 92% !important;
            max-width: 420px !important;
            margin: 16px auto calc(40px + env(safe-area-inset-bottom, 20px)) !important;
            padding: 22px 16px !important;
            border-radius: 16px !important;
            box-sizing: border-box !important;
          }
          .sg-auth-tab-selector {
            gap: 4px !important;
            padding: 3px !important;
            margin-bottom: 16px !important;
          }
          .sg-auth-tab-btn {
            padding: 10px 8px !important;
            font-size: 12px !important;
            touch-action: manipulation !important;
          }
          .sg-auth-head {
            font-size: 18px !important;
            margin-bottom: 12px !important;
          }

          /* 5. Streamer Remote HUD & Controls */
          .sg-banner-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 6px !important;
            margin-bottom: 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-remote-actions {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-remote-actions > span {
            flex: 1 1 100% !important;
            width: 100% !important;
            text-align: center !important;
            justify-content: center !important;
            min-height: 32px !important;
            box-sizing: border-box !important;
            display: inline-flex !important;
            align-items: center !important;
          }
          .sg-remote-actions > button {
            flex: 1 1 calc(50% - 4px) !important;
            min-height: 38px !important;
            font-size: 11.5px !important;
            font-weight: 800 !important;
            text-align: center !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 6px 8px !important;
            box-sizing: border-box !important;
            touch-action: manipulation !important;
          }
          .sg-telemetry-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            padding: 12px 10px !important;
            box-sizing: border-box !important;
          }
          .sg-key-select-box {
            width: 100% !important;
            max-width: 100% !important;
          }
          .sg-key-select-box select {
            width: 100% !important;
            max-width: 100% !important;
          }
          .sg-telemetry-meta-row {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
            padding-top: 8px !important;
          }
          .sg-telemetry-meta-row > div:first-child {
            grid-column: span 2 !important;
            word-break: break-all !important;
          }
          .sg-control-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-column-card {
            padding: 14px 12px !important;
            border-radius: 12px !important;
            box-sizing: border-box !important;
          }
          .sg-player-status-bar {
            padding: 12px 10px !important;
            gap: 10px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-player-status-bar > div {
            width: 100% !important;
          }

          /* 6. Form Grids (Key Gen, Settings, Top-Up) */
          .sg-form-grid-2col {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-form-stack {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-form-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-btn-choice-group {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
            gap: 8px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-btn-choice-group > button {
            width: 100% !important;
            min-height: 40px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }
          .sg-management-card {
            padding: 16px 14px !important;
            border-radius: 14px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          /* 7. Overview Dashboard Cards */
          .sg-stat-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            margin-bottom: 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-stat-card {
            padding: 12px 10px !important;
            gap: 10px !important;
            border-radius: 12px !important;
            touch-action: manipulation !important;
            cursor: pointer !important;
            user-select: none !important;
            box-sizing: border-box !important;
          }
          .sg-stat-num {
            font-size: 19px !important;
          }
          .sg-stat-label {
            font-size: 11px !important;
          }
          .sg-stat-icon-frame {
            width: 30px !important;
            height: 30px !important;
            font-size: 15px !important;
            border-radius: 8px !important;
          }
          .sg-dual-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 14px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-dual-grid > * {
            min-width: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-card-box {
            padding: 14px 12px !important;
            border-radius: 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-quick-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          /* 8. Tables & Horizontal Scroll Container */
          .sg-table-card {
            border-radius: 12px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            box-sizing: border-box !important;
          }
          .sg-data-table {
            min-width: 600px !important;
            width: 100% !important;
            border-collapse: collapse !important;
          }
          pre {
            max-width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            box-sizing: border-box !important;
            font-size: 11px !important;
          }
          .sg-data-table th, .sg-data-table td {
            padding: 10px 12px !important;
            font-size: 12px !important;
          }
          .sg-filter-scroll-row {
            display: flex !important;
            gap: 6px !important;
            overflow-x: auto !important;
            padding-bottom: 6px !important;
            flex-wrap: nowrap !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .sg-filter-scroll-row::-webkit-scrollbar {
            display: none !important;
          }
          .sg-filter-scroll-row > * {
            flex-shrink: 0 !important;
          }
          .sg-search-box {
            width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          /* 9. Modals (Responsive & Scrollable) */
          .sg-modal-overlay {
            position: fixed !important;
            inset: 0 !important;
            z-index: 1200 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 14px !important;
            background-color: rgba(0, 0, 0, 0.88) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
            box-sizing: border-box !important;
          }
          .sg-modal-card {
            width: 94% !important;
            max-width: 440px !important;
            max-height: 85vh !important;
            max-height: 85dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 18px 14px !important;
            border-radius: 14px !important;
            margin: auto !important;
            box-sizing: border-box !important;
          }

          /* 10. Mobile Bottom Quick Bar */
          .sg-mobile-bottom-bar {
            display: flex !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 990 !important;
            background: rgba(11, 9, 20, 0.97) !important;
            backdrop-filter: blur(20px) !important;
            -webkit-backdrop-filter: blur(20px) !important;
            border-top: 1px solid rgba(168, 85, 247, 0.3) !important;
            padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px)) !important;
            justify-content: space-around !important;
            align-items: center !important;
            box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.6) !important;
            box-sizing: border-box !important;
          }
          .sg-mobile-bottom-tab {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            background: transparent !important;
            border: none !important;
            color: #94a3b8 !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            padding: 4px 6px !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            transition: all 0.18s ease !important;
            min-width: 48px !important;
            touch-action: manipulation !important;
            user-select: none !important;
          }
          .sg-mobile-bottom-tab:active {
            transform: scale(0.92) !important;
          }
          .sg-mobile-bottom-tab.active {
            color: #c084fc !important;
            background: rgba(168, 85, 247, 0.16) !important;
          }
        }

        /* ── ULTRA-COMPACT MOBILE BREAKPOINT (Narrow phones e.g. iPhone SE / Galaxy A) ── */
        @media (max-width: 400px) {
          .sg-top-header {
            padding: 6px 8px !important;
            gap: 6px !important;
          }
          .sg-header-left {
            gap: 6px !important;
          }
          .sg-brand-title {
            max-width: 90px !important;
            font-size: 13px !important;
          }
          .sg-header-right {
            gap: 4px !important;
          }
          .sg-balance-pill {
            padding: 3px 6px !important;
            font-size: 10px !important;
          }
          .sg-user-profile-pill {
            padding: 2px 4px !important;
            gap: 3px !important;
          }
          .sg-mobile-bottom-tab {
            min-width: 42px !important;
            padding: 4px 2px !important;
            font-size: 9px !important;
          }
        }

        @keyframes sgSlideDrawer {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes sgFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Background Cyber Ambient */}
      <div style={styles.ambientGrid} />

      {/* ── TOP NAV HEADER ─────────────────────────────────────────────────── */}
      <header className="sg-top-header" style={styles.topHeader}>
        <div className="sg-header-left" style={styles.headerLeft}>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sg-mobile-menu-toggle"
            style={styles.mobileMenuToggle}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <div
            className="sg-brand-cluster"
            style={styles.brandCluster}
          >
            <RymonAnimatedLogo size="sm" showText={false} />
            <div className="sg-brand-text-block" style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="sg-brand-title" style={styles.brandTitleText}>
                RYMON <span className="sg-brand-corp-text" style={styles.brandVioletPill}>CORPORATION</span>
              </div>
              <div className="sg-brand-sub" style={styles.brandSubText}>SOVEREIGN DEFENSE • HARDWARE TELEMETRY</div>
            </div>
          </div>
        </div>

        <div className="sg-header-right" style={styles.headerRight}>
          {/* Wallet Balance Pill */}
          {isAuthenticated && currentUser?.role !== 'streamer' && (
            <div
              className="sg-balance-pill"
              style={styles.balancePill}
              onClick={() => (isOwner || isAdmin) && handleSelectTab('add-balance')}
              title={isOwner || isAdmin ? 'Click to manage balances' : 'Wallet balance'}
            >
              <span style={{ color: '#00d9ff', fontSize: '13px' }}>💳</span>
              <span style={styles.balanceAmount}>
                {isOwner ? '∞ FREE' : `₹${walletBalance.toLocaleString('en-IN')}`}
              </span>
            </div>
          )}

          {/* Database & WebSocket Link Status */}
          <div className="sg-telemetry-pill" style={styles.telemetryPill}>
            <span
              style={{
                ...styles.pulseDot,
                background: isLiveConnected ? '#05df72' : '#64748b'
              }}
            />
            <span className="sg-telemetry-text" style={styles.telemetryText}>
              {isLiveConnected ? 'LIVE' : 'STANDBY'}
            </span>
            <span className="sg-ping-text" style={styles.pingText}>
              {ping > 1200 ? 'WARMING...' : `${ping}ms`}
            </span>
          </div>

          {/* User Profile Pill */}
          {isAuthenticated ? (
            <div className="sg-user-profile-pill" style={styles.userProfilePill}>
              <div style={styles.userAvatarSquare}>
                {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="sg-user-name-block" style={styles.userNameBlock}>
                <span style={styles.userNameText}>
                  {currentUser?.username || 'VIP Streamer'}
                </span>
                <span style={styles.userRoleTag}>
                  {currentUser?.role === 'owner'
                    ? (currentUser.username?.toLowerCase() === 'debajoyti' ? 'ROOT OWNER' : 'OWNER')
                    : (currentUser?.role ? currentUser.role.toUpperCase() : 'VIP')}
                </span>
              </div>
              <button
                onClick={handleLogout}
                style={styles.headerLogoutBtn}
                className="sg-header-logout-btn"
                title="Logout"
                aria-label="Logout"
              >
                🚪
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setStaffUsername('')
                setStaffPassword('')
                setAuthMode('staff')
              }}
              style={styles.quickLoginBtn}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── NOTIFICATION TOAST ──────────────────────────────────────────────── */}
      {actionSuccessMsg && (
        <div style={styles.toastBanner}>
          <span>✓ {actionSuccessMsg}</span>
        </div>
      )}

      {/* ── CONDITIONAL VIEW: AUTH GATEWAY VS MAIN WORKSPACE ────────────────── */}
      {!isAuthenticated ? (
        <div className="sg-auth-gate-box" style={styles.authGateBox}>
          <div
            style={{ display: 'flex', justifyContent: 'center', marginBottom: '22px', cursor: 'pointer' }}
            onClick={() => window.dispatchEvent(new CustomEvent('replay_rymon_intro'))}
            title="Click to replay RYMON CORPORATION Intro"
          >
            <RymonAnimatedLogo size="lg" showText={true} />
          </div>

          <div style={styles.authBadge}>
            <span style={{ fontSize: '10px', marginRight: '6px' }}>🔒</span> SECURE RYMON GATEWAY
          </div>

          {/* Dual Gateway Tabs: Staff Portal vs Streamer Key */}
          <div className="sg-auth-tab-selector" style={styles.authTabSelector}>
            <button
              onClick={() => {
                setAuthMode('staff')
                setAuthError('')
              }}
              className="sg-auth-tab-btn"
              style={{
                ...styles.authTabBtn,
                ...(authMode === 'staff' ? styles.authTabBtnActive : {})
              }}
            >
              👤 Staff Portal
            </button>
            <button
              onClick={() => {
                setAuthMode('key')
                setAuthError('')
              }}
              className="sg-auth-tab-btn"
              style={{
                ...styles.authTabBtn,
                ...(authMode === 'key' ? styles.authTabBtnActive : {})
              }}
            >
              ⚡ Streamer Key
            </button>
          </div>

          {authMode === 'staff' ? (
            <div>
              {/* Sign In vs Register Toggle */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(false)
                    setAuthError('')
                    setRegError('')
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: !isRegisterMode ? '1px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                    background: !isRegisterMode ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                    color: !isRegisterMode ? '#00d9ff' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🔑 Sign In (Existing User)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(true)
                    setAuthError('')
                    setRegError('')
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isRegisterMode ? '1px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                    background: isRegisterMode ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                    color: isRegisterMode ? '#00d9ff' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📝 Register with Invite Code
                </button>
              </div>

              {!isRegisterMode ? (
                <div>
                  <h2 style={styles.authHead}>Staff Login</h2>

                  <form onSubmit={handleStaffLogin} style={styles.authForm}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>USERNAME</label>
                      <input
                        type="text"
                        value={staffUsername}
                        onChange={(e) => setStaffUsername(e.target.value)}
                        placeholder="Enter registered username"
                        style={styles.keyInput}
                        required
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>PASSWORD</label>
                      <input
                        type="password"
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        placeholder="Enter account password"
                        style={styles.keyInput}
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading || staffLockSeconds > 0}
                      style={{
                        ...styles.submitBtn,
                        ...(staffLockSeconds > 0
                          ? {
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid #ef4444',
                              color: '#f87171',
                              cursor: 'not-allowed'
                            }
                          : {})
                      }}
                    >
                      {authLoading
                        ? 'AUTHENTICATING...'
                        : staffLockSeconds > 0
                          ? `🔒 LOCKED (${formatLockCountdown(staffLockSeconds)})`
                          : 'SIGN IN TO DASHBOARD'}
                    </button>

                    {staffLockSeconds > 0 && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          color: '#f87171',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>🔒 5-Minute Security Lockout Active</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '14px', color: '#ef4444' }}>
                          {formatLockCountdown(staffLockSeconds)}
                        </span>
                      </div>
                    )}

                    {authError && <div style={styles.errorBox}>{authError}</div>}
                  </form>
                </div>
              ) : (
                <div>
                  <h2 style={styles.authHead}>Create Account</h2>

                  <form onSubmit={handleRegister} style={styles.authForm}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>DESIRED USERNAME</label>
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="e.g. MyResellerName"
                        style={styles.keyInput}
                        required
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>PASSWORD</label>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create strong account password"
                        style={styles.keyInput}
                        required
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>EMAIL ADDRESS (OPTIONAL)</label>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="e.g. contact@domain.com"
                        style={styles.keyInput}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        OWNER REFERRAL / INVITE CODE <span style={{ color: '#00d9ff' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={regInviteCode}
                        onChange={(e) => setRegInviteCode(e.target.value)}
                        placeholder="e.g. RYMON-RESELLER-VIP"
                        style={{ ...styles.keyInput, textTransform: 'uppercase' }}
                        required
                      />
                    </div>

                    <button type="submit" disabled={regLoading} style={styles.submitBtn}>
                      {regLoading ? 'VERIFYING REFERRAL CODE...' : '⚡ CREATE RYMON ACCOUNT'}
                    </button>

                    {regError && <div style={styles.errorBox}>{regError}</div>}
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 style={styles.authHead}>Streamer Key</h2>

              <form onSubmit={handleKeyAuth} style={styles.authForm}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                  <span>LICENSE KEY</span>
                </div>
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Enter your Rymon license key (e.g. RYMON-FF-XXXX-XXXX)"
                  style={styles.keyInput}
                  required
                />

                <button
                  type="submit"
                  disabled={authLoading || keyLockSeconds > 0}
                  style={{
                    ...styles.submitBtn,
                    ...(keyLockSeconds > 0
                      ? {
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid #ef4444',
                          color: '#f87171',
                          cursor: 'not-allowed'
                        }
                      : {})
                  }}
                >
                  {authLoading
                    ? 'VERIFYING KEYAUTH...'
                    : keyLockSeconds > 0
                      ? `🔒 LOCKED (${formatLockCountdown(keyLockSeconds)})`
                      : 'CONNECT GHOST REMOTE'}
                </button>

                {keyLockSeconds > 0 && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#f87171',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>🔒 5-Minute KeyAuth Lockout Active</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '14px', color: '#ef4444' }}>
                      {formatLockCountdown(keyLockSeconds)}
                    </span>
                  </div>
                )}


                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={selfResetBusy}
                    onClick={() => handleCustomerSelfResetHwid(keyInput)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(5, 223, 114, 0.12)',
                      border: '1px solid rgba(5, 223, 114, 0.4)',
                      color: '#05df72',
                      fontWeight: 800,
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {selfResetBusy ? 'RESETTING HWID...' : '🔄 RESET KEY HWID (2/DAY)'}
                  </button>
                </div>

                {selfResetMsg && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(5, 223, 114, 0.1)',
                      border: '1px solid rgba(5, 223, 114, 0.35)',
                      color: '#e2e8f0',
                      fontSize: '12px'
                    }}
                  >
                    {selfResetMsg}
                  </div>
                )}

                {authError && <div style={styles.errorBox}>{authError}</div>}
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="sg-main-layout" style={styles.mainLayout}>
          {/* Mobile Backdrop Overlay */}
          {mobileMenuOpen && (
            <div
              className="sg-mobile-backdrop"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* LEFT SIDEBAR NAVIGATION */}
          <aside
            className={`sg-sidebar ${mobileMenuOpen ? 'open' : ''}`}
            style={{
              ...styles.sidebar,
              ...(mobileMenuOpen ? styles.sidebarMobileOpen : {})
            }}
          >
            {/* Mobile Drawer Header */}
            <div className="sg-mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>⚡</span>
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#c084fc', letterSpacing: '0.04em' }}>
                  STREAMGUARD MENU
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="sg-mobile-close-btn"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            {/* User mini status */}
            <div style={styles.sidebarUserCard}>
              <div style={styles.sidebarUserRow}>
                <div style={styles.sidebarUserAvatar}>
                  {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div style={styles.sidebarUserName}>
                    {currentUser?.username || 'VIP Streamer'}
                  </div>
                  <div style={styles.sidebarUserSub}>
                    <span style={styles.activeDot} />{' '}
                    {currentUser?.role === 'owner'
                      ? (currentUser.username?.toLowerCase() === 'debajoyti' ? 'ROOT OWNER' : 'OWNER')
                      : (currentUser?.role ? currentUser.role.toUpperCase() : 'VIP')}
                  </div>
                </div>
              </div>
            </div>

            {/* Nav Categories */}
            {/* Nav Categories */}
            <nav style={styles.navStack}>
              {/* Telemetry Remote */}
              <div style={styles.navCategoryHeader}>TELEMETRY & HARDWARE</div>
              <button
                onClick={() => handleSelectTab('remote')}
                style={{
                  ...styles.navItem,
                  ...(activeTab === 'remote' ? styles.navItemActive : {})
                }}
              >
                <span style={styles.navIcon}>⚡</span>
                <span>Streamer Remote</span>
                <span style={styles.cyanMiniBadge}>LIVE</span>
              </button>

              {/* Streamer-Specific Utilities */}
              {isStreamer && (
                <>
                  <div style={styles.navCategoryHeader}>STREAMER UTILITIES</div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      window.dispatchEvent(new CustomEvent('replay_rymon_intro'))
                    }}
                    style={styles.navItem}
                  >
                    <span style={styles.navIcon}>🎬</span>
                    <span>Replay Rymon Intro</span>
                  </button>
                </>
              )}

              {/* Staff-Only Navigation Sections (Hidden from key-login Streamers) */}
              {!isStreamer && (
                <>
                  {/* Reseller — Focused simplified view */}
                  {isReseller && (
                    <>
                      <div style={styles.navCategoryHeader}>DASHBOARDS</div>
                      <button
                        onClick={() => handleSelectTab('overview')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'overview' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>📊</span>
                        <span>Overview</span>
                      </button>

                      <div style={styles.navCategoryHeader}>LICENSE ENGINE</div>
                      <button
                        onClick={() => handleSelectTab('generate')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'generate' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>⚡</span>
                        <span>Generate Key</span>
                      </button>
                      <button
                        onClick={() => handleSelectTab('keys')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'keys' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🔑</span>
                        <span>License Keys</span>
                      </button>

                      <div style={styles.navCategoryHeader}>PRICING</div>
                      <button
                        onClick={() => handleSelectTab('advance')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'advance' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>💰</span>
                        <span>Reseller Pricing</span>
                      </button>
                    </>
                  )}

                  {/* Owner & Admin — Full management view */}
                  {(isOwner || isAdmin) && (
                    <>
                      <div style={styles.navCategoryHeader}>DASHBOARDS</div>
                      <button
                        onClick={() => handleSelectTab('overview')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'overview' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>📊</span>
                        <span>Overview</span>
                      </button>

                      <div style={styles.navCategoryHeader}>LICENSE ENGINE</div>
                      <button
                        onClick={() => handleSelectTab('generate')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'generate' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>⚡</span>
                        <span>Generate Key</span>
                      </button>
                      <button
                        onClick={() => handleSelectTab('keys')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'keys' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🔑</span>
                        <span>License Keys</span>
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => handleSelectTab('connect-api')}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'connect-api' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>🔌</span>
                          <span>Connect & API</span>
                          <span style={{ ...styles.cyanMiniBadge, background: 'rgba(5, 223, 114, 0.15)', color: '#05df72', border: '1px solid rgba(5, 223, 114, 0.4)' }}>OWNER</span>
                        </button>
                      )}

                      <div style={styles.navCategoryHeader}>MANAGEMENT</div>
                      <button
                        onClick={() => handleSelectTab('referrals')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'referrals' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🎟️</span>
                        <span>Invite Codes</span>
                        <span style={styles.cyanMiniBadge}>{isOwner ? 'OWNER' : 'ADMIN'}</span>
                      </button>
                      <button
                        onClick={() => handleSelectTab('users')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'users' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>👥</span>
                        <span>{isOwner ? 'Users (All)' : 'My Resellers'}</span>
                      </button>
                      <button
                        onClick={() => handleSelectTab('add-balance')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'add-balance' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>💼</span>
                        <span>{isOwner ? 'Add Balance' : 'Transfer Balance'}</span>
                        <span style={styles.cyanMiniBadge}>{isOwner ? 'FREE' : 'WALLET'}</span>
                      </button>

                      <button
                        onClick={() => handleSelectTab('advance')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'advance' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>💰</span>
                        <span>{isOwner ? 'Pricing & Rates' : 'Reseller Pricing'}</span>
                      </button>

                      <div style={styles.navCategoryHeader}>SYSTEM UTILITIES</div>
                      {isRootOwner && (
                        <button
                          onClick={() => handleSelectTab('apps')}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'apps' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>📱</span>
                          <span>App Manager</span>
                          <span style={styles.cyanMiniBadge}>FOUNDER</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleSelectTab('delete')}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'delete' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🧹</span>
                        <span>Clean & Purge Keys</span>
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Bottom Drawer Actions */}
              <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleLogout()
                  }}
                  style={{
                    ...styles.navItem,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    fontWeight: 800,
                    justifyContent: 'center'
                  }}
                >
                  <span style={styles.navIcon}>🚪</span>
                  <span>Log Out</span>
                </button>
              </div>
            </nav>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="sg-content-pane" style={styles.contentPane}>
            {/* 1. OVERVIEW DASHBOARD */}
            {activeTab === 'overview' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Overview</h2>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● CLOUD ACTIVE</span>
                  </div>
                </div>

                {/* Metric Counters (Clickable to filter License Keys) */}
                <div className="sg-stat-grid" style={styles.statGrid}>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('PLAYING')
                      handleSelectTab('keys')
                    }}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(5, 223, 114, 0.45)',
                      background: 'linear-gradient(135deg, rgba(5, 223, 114, 0.12) 0%, rgba(13, 17, 26, 0.9) 100%)'
                    }}
                    title="Click to view keys currently playing in-game"
                  >
                    <div style={{ ...styles.statIconFrame, color: '#05df72' }}>🎮</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#05df72' }}>{stats.playingNow}</div>
                      <div style={{ ...styles.statLabel, color: '#86efac', fontWeight: 700 }}>Playing Now</div>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('ALL')
                      handleSelectTab('keys')
                    }}
                    style={{ ...styles.statCard, cursor: 'pointer' }}
                    title="Click to view all keys"
                  >
                    <div style={styles.statIconFrame}>🔑</div>
                    <div>
                      <div style={styles.statNum}>{stats.total}</div>
                      <div style={styles.statLabel}>Total Keys</div>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('ACTIVE')
                      handleSelectTab('keys')
                    }}
                    style={{ ...styles.statCard, cursor: 'pointer' }}
                    title="Click to view active keys"
                  >
                    <div style={{ ...styles.statIconFrame, color: '#00d9ff' }}>✓</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#00d9ff' }}>{stats.active}</div>
                      <div style={styles.statLabel}>Active Keys</div>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('WAITING')
                      handleSelectTab('keys')
                    }}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(234, 179, 8, 0.35)'
                    }}
                    title="Click to view Unused / Waiting keys"
                  >
                    <div style={{ ...styles.statIconFrame, color: '#eab308' }}>🟡</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#eab308' }}>{stats.unused}</div>
                      <div style={styles.statLabel}>Unused / Waiting</div>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('PAUSED')
                      handleSelectTab('keys')
                    }}
                    style={{ ...styles.statCard, cursor: 'pointer' }}
                    title="Click to view Paused keys"
                  >
                    <div style={{ ...styles.statIconFrame, color: '#ffb700' }}>⏸️</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#ffb700' }}>{stats.paused}</div>
                      <div style={styles.statLabel}>Paused Keys</div>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('EXPIRED')
                      handleSelectTab('keys')
                    }}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(239, 68, 68, 0.4)'
                    }}
                    title="Click to view Expired keys"
                  >
                    <div style={{ ...styles.statIconFrame, color: '#ef4444' }}>🔴</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#ef4444' }}>{stats.expired}</div>
                      <div style={{ ...styles.statLabel, color: '#fca5a5' }}>Expired Keys</div>
                    </div>
                  </div>
                </div>

                {/* Live Player Status Bar (Playing Now vs Not Playing Breakdown) */}
                <div
                  className="sg-player-status-bar"
                  style={{
                    backgroundColor: 'rgba(13, 17, 26, 0.88)',
                    border: '1px solid rgba(0, 217, 255, 0.28)',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        background: 'rgba(5, 223, 114, 0.14)',
                        border: '1px solid rgba(5, 223, 114, 0.4)',
                        color: '#05df72',
                        fontWeight: 800,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>🟢 PLAYING NOW: {stats.playingNow}</span>
                    </div>
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        background: 'rgba(148, 163, 184, 0.1)',
                        border: '1px solid rgba(148, 163, 184, 0.28)',
                        color: '#cbd5e1',
                        fontWeight: 700,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>⚪ OFFLINE: {stats.notPlaying}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {keysList
                      .filter((k) => !k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(k.license_key.toUpperCase()))
                      .slice(0, 4)
                      .map((k) => (
                        <button
                          key={k.license_key}
                          onClick={() => {
                            if (handleSelectRemoteKey(k.license_key)) {
                              handleSelectTab('remote')
                            }
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: 'rgba(0, 217, 255, 0.14)',
                            border: '1px solid rgba(0, 217, 255, 0.35)',
                            color: '#00d9ff',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title={`Seller: @${k.creator_username}`}
                        >
                          🟢 {k.license_key} • @{k.creator_username}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Quick Shortcuts & Recent Activities */}
                <div className="sg-dual-grid" style={styles.dualGrid}>
                  <div className="sg-card-box" style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>⚡ Fast Actions</h4>
                      <span style={styles.cyanMiniBadge}>RYMON</span>
                    </div>
                    <div className="sg-quick-grid" style={styles.quickGrid}>
                      <button
                        onClick={() => handleSelectTab('remote')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>⚡</div>
                        <div style={styles.quickActionTitle}>Streamer Remote</div>
                      </button>
                      <button
                        onClick={() => handleSelectTab('generate')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>🔑</div>
                        <div style={styles.quickActionTitle}>Generate License</div>
                      </button>
                      <button
                        onClick={() =>
                          handleCopyMultipleKeys(
                            keysList.filter((k) => k.status === 'WAITING').map((k) => k.license_key),
                            'UNUSED'
                          )
                        }
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(234, 179, 8, 0.4)' }}
                      >
                        <div style={styles.quickActionIcon}>📋</div>
                        <div style={{ ...styles.quickActionTitle, color: '#eab308' }}>
                          Copy Unused ({stats.unused})
                        </div>
                      </button>
                      <button
                        onClick={() => handleQuickBulkDelete('expired')}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <div style={styles.quickActionIcon}>🧹</div>
                        <div style={{ ...styles.quickActionTitle, color: '#ef4444' }}>
                          Purge Expired ({stats.expired})
                        </div>
                      </button>
                      <button
                        onClick={handleBulkResetAllHwid}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(0, 217, 255, 0.4)' }}
                      >
                        <div style={styles.quickActionIcon}>🔄</div>
                        <div style={{ ...styles.quickActionTitle, color: '#00d9ff' }}>Reset All HWID</div>
                      </button>
                      <button
                        onClick={() => handleSelectTab('keys')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>🗂️</div>
                        <div style={styles.quickActionTitle}>Manage All Keys</div>
                      </button>
                      <button
                        onClick={() => handleBulkPauseAllKeys(true)}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(255, 183, 0, 0.35)' }}
                      >
                        <div style={styles.quickActionIcon}>⏸️</div>
                        <div style={{ ...styles.quickActionTitle, color: '#ffb700' }}>Pause All Keys</div>
                      </button>
                      <button
                        onClick={() => handleBulkPauseAllKeys(false)}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(5, 223, 114, 0.35)' }}
                      >
                        <div style={styles.quickActionIcon}>▶️</div>
                        <div style={{ ...styles.quickActionTitle, color: '#05df72' }}>Resume All Keys</div>
                      </button>
                    </div>
                  </div>

                  <div className="sg-card-box" style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>📋 Real-time Activity Log</h4>
                      <span style={styles.cyanMiniBadge}>AUDIT</span>
                    </div>
                    <div style={styles.activityFeed}>
                      {activities.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748b', fontSize: '12px' }}>
                          ℹ️ No recent activity recorded for your account.
                        </div>
                      ) : (
                        activities.slice(0, 5).map((act) => (
                          <div key={act.id} style={styles.activityRow}>
                            <div style={styles.activityIcon}>✓</div>
                            <div style={{ flex: 1 }}>
                              <div style={styles.activityTitle}>{act.title}</div>
                              <div style={styles.activityDetails}>{act.details}</div>
                            </div>
                            <div style={styles.activityTime}>
                              {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. TOP UP / TRANSFER USER BALANCE */}
            {activeTab === 'add-balance' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? 'Top Up Balance' : 'Transfer Balance'}
                    </h2>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div className="sg-management-card" style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(5,223,114,0.15)', color: '#05df72' }}>
                          💼
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                            {isOwner ? 'Top Up Balance' : 'Transfer Balance'}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleTopUpSubmit} style={{ marginTop: '24px' }}>
                      <div className="sg-form-grid-2col" style={styles.formGrid2Col}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>
                            {isOwner ? 'Select Admin or Reseller' : 'Select Your Downline Reseller'}{' '}
                            <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <select
                            value={topUpTargetUser}
                            onChange={(e) => setTopUpTargetUser(e.target.value)}
                            style={styles.selectInput}
                            required
                          >
                            <option value="">-- Choose Account --</option>
                            {usersList
                              .filter((u) =>
                                isOwner
                                  ? u.role !== 'owner'
                                  : u.role === 'reseller' &&
                                    (u.username || '').toLowerCase() !== (currentUser?.username || '').toLowerCase()
                              )
                              .map((u) => (
                                <option key={u.id} value={u.username}>
                                  @{u.username} ({String(u.role || 'user').toUpperCase()} • Bal: ₹{Number(u.balance || 0).toLocaleString('en-IN')})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>
                            Amount (₹) <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={topUpAmount}
                            onChange={(e) => setTopUpAmount(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="Enter amount..."
                            style={styles.keyInput}
                            required
                          />
                        </div>
                      </div>

                      {isOwner ? (
                        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <label style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="topUpMode"
                              checked={topUpMode === 'set'}
                              onChange={() => setTopUpMode('set')}
                            />
                            Set Exact Balance
                          </label>
                          <label style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="topUpMode"
                              checked={topUpMode === 'add'}
                              onChange={() => setTopUpMode('add')}
                            />
                            Add (Credit) to Existing Balance
                          </label>
                        </div>
                      ) : (
                        <div style={{ ...styles.invoiceSummaryBox, marginTop: '18px' }}>
                          <div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Your Current Admin Wallet:</div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#00d9ff' }}>
                              ₹{walletBalance.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Remaining After Transfer:</div>
                            <div
                              style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color:
                                  walletBalance >= (Number(topUpAmount) || 0) ? '#05df72' : '#ef4444'
                              }}
                            >
                              ₹{Math.max(0, walletBalance - (Number(topUpAmount) || 0)).toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={topUpLoading}
                          style={{
                            ...styles.primaryActionBtn,
                            background: '#05df72',
                            color: '#07090e',
                            fontWeight: 700
                          }}
                        >
                          {topUpLoading
                            ? 'PROCESSING TRANSACTION...'
                            : isOwner
                            ? 'Credit Balance (FREE)'
                            : 'Transfer from My Wallet'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* 3. GENERATE KEY */}
            {activeTab === 'generate' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Generate Keys</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {hasCustomPricingForCurrentUser && (
                      <span
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'rgba(250, 204, 21, 0.15)',
                          border: '1px solid rgba(250, 204, 21, 0.45)',
                          color: '#fde047',
                          fontSize: '11px',
                          fontWeight: 800
                        }}
                      >
                        👑 CUSTOM VIP RATES ACTIVE
                      </span>
                    )}
                    <div className="sg-balance-pill" style={styles.balancePill}>
                      <span>Wallet Balance:</span>
                      <strong style={{ color: '#00d9ff', marginLeft: '6px' }}>
                        {isOwner ? '∞ FREE (OWNER)' : `₹${walletBalance.toLocaleString('en-IN')}`}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div className="sg-management-card" style={styles.managementCard}>
                    <form onSubmit={handleGenerateKey}>
                      <div className="sg-form-grid-2col" style={styles.formGrid2Col}>
                        <div style={styles.formGroup}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ ...styles.formLabel, marginBottom: 0 }}>SELECT TARGET GAME / APP</label>
                            {isOwner && !isCustomAppMode && genGame.toLowerCase() !== 'free fire max' && registeredApps.some((a) => (a?.name || '').toLowerCase() === genGame.toLowerCase()) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const targetApp = registeredApps.find((a) => (a?.name || '').toLowerCase() === genGame.toLowerCase())
                                  if (targetApp) {
                                    await handleDeleteApp(targetApp)
                                  } else {
                                    if (window.confirm(`Are you sure you want to remove "${genGame}" from registered games/apps?`)) {
                                      const updated = await deleteRegisteredApp(genGame)
                                      setRegisteredApps(updated)
                                      setGenGame('Free Fire MAX')
                                      localStorage.setItem('rymon_selected_gen_game', 'Free Fire MAX')
                                      showToast(`Removed "${genGame}"`)
                                    }
                                  }
                                }}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  color: '#ef4444',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Owner Action: Delete this custom game"
                              >
                                🗑️ Remove &quot;{genGame}&quot;
                              </button>
                            )}
                          </div>

                          <select
                            value={isCustomAppMode ? '__CUSTOM__' : genGame}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === '__CUSTOM__') {
                                if (!canGenerateCustomApps) {
                                  showToast('🔒 Custom App key generation is restricted by Owner for your role.')
                                  return
                                }
                                setIsCustomAppMode(true)
                              } else {
                                setIsCustomAppMode(false)
                                setGenGame(val)
                                localStorage.setItem('rymon_selected_gen_game', val)
                              }
                            }}
                            style={styles.selectInput}
                          >
                            <option value="Free Fire MAX">🔥 Free Fire MAX (Streamer &amp; Remote)</option>
                            {registeredApps
                              .filter((a) => {
                                if (!a || !a.name) return false
                                const name = a.name.trim()
                                if (name.toLowerCase() === 'free fire max') return false
                                // Invisible Rule: Only visible if user has explicit permission from Root Founder (@debajoyti)
                                return isUserCustomAppAllowed(currentUser, name)
                              })
                              .map((app) => (
                                <option key={app.id || app.name} value={app.name}>
                                  {app.icon || '🎮'} {app.name} (Custom App)
                                </option>
                              ))}
                            {/* Invisible Rule: Adding new custom games is only visible if permitted */}
                            {canGenerateCustomApps && (
                              <option value="__CUSTOM__">➕ Add / Type New Custom Game...</option>
                            )}
                          </select>

                          {/* Custom App Name Input on Click */}
                          {isCustomAppMode && (
                            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(5, 223, 114, 0.08)', borderRadius: '8px', border: '1px solid rgba(5, 223, 114, 0.35)' }}>
                              <label style={{ ...styles.formLabel, color: '#05df72', marginBottom: '4px', display: 'block' }}>
                                TYPE ANY CUSTOM APP OR GAME NAME:
                              </label>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <input
                                  type="text"
                                  value={customAppNameInput}
                                  onChange={(e) => setCustomAppNameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleSaveCustomTargetApp()
                                    }
                                  }}
                                  placeholder="Type any custom app or mod name (e.g. Tool X, BGMI, CODM)..."
                                  style={{ ...styles.keyInput, flex: 1, minWidth: '180px', borderColor: '#05df72', padding: '8px 12px', fontSize: '13px' }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveCustomTargetApp}
                                  style={{
                                    background: '#05df72',
                                    color: '#03140b',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '0 14px',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Save and select this game target"
                                >
                                  💾 Save &amp; Select
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsCustomAppMode(false)
                                    setCustomAppNameInput('')
                                    setGenGame(localStorage.getItem('rymon_selected_gen_game') || 'Free Fire MAX')
                                  }}
                                  style={{ ...styles.chipBtn, fontSize: '11px', padding: '0 12px', whiteSpace: 'nowrap' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          <div style={{ marginTop: '6px', fontSize: '11.5px', lineHeight: '1.4' }}>
                            {!isCustomAppMode && genGame === 'Free Fire MAX' ? (
                              <span style={{ color: '#05df72' }}>
                                🔥 <strong>Free Fire MAX Exclusive:</strong> Full Streamer Remote controls (ESP, Aimbot, Telemetry HUD) enabled.
                              </span>
                            ) : (
                              <span style={{ color: '#00d9ff' }}>
                                🔑 <strong>Pure KeyAuth Isolation:</strong> Key will <u>ONLY</u> work on <strong>{isCustomAppMode ? (customAppNameInput.trim() || 'Custom App') : genGame}</strong>. Zero streamer controls (authentication &amp; HWID only).
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>PLAN DURATION</label>
                          <select
                            value={genDuration}
                            onChange={(e) => setGenDuration(e.target.value)}
                            style={styles.selectInput}
                          >
                            <option value="2 Hours">2 Hours (₹{effectiveUserPrices['2 Hours'] ?? 20})</option>
                            <option value="1 Day">1 Day (₹{effectiveUserPrices['1 Day'] ?? 35})</option>
                            <option value="3 Days">3 Days (₹{effectiveUserPrices['3 Days'] ?? 50})</option>
                            <option value="7 Days">7 Days (₹{effectiveUserPrices['7 Days'] ?? 100})</option>
                            <option value="15 Days">15 Days (₹{effectiveUserPrices['15 Days'] ?? 180})</option>
                            <option value="30 Days">30 Days (₹{effectiveUserPrices['30 Days'] ?? 350})</option>
                          </select>
                        </div>
                      </div>

                      <div className="sg-form-grid-2col" style={{ ...styles.formGrid2Col, marginTop: '16px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>QUANTITY (BULK GENERATOR)</label>
                          <select
                            value={genQuantity}
                            onChange={(e) => setGenQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            style={styles.selectInput}
                          >
                            <option value={1}>1 Key (Single)</option>
                            <option value={5}>5 Keys (Bulk Pack)</option>
                            <option value={10}>10 Keys (Bulk Pack)</option>
                            <option value={20}>20 Keys (Reseller Stock)</option>
                            <option value={50}>50 Keys (Mega Stock)</option>
                          </select>
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>MAX DEVICES PER KEY</label>
                          <input
                            type="number"
                            min="1"
                            max="300"
                            value={genDevicesMax}
                            onChange={(e) => setGenDevicesMax(Math.max(1, parseInt(e.target.value) || 1))}
                            style={styles.keyInput}
                          />
                        </div>
                      </div>

                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>CUSTOM PREFIX (OPTIONAL)</label>
                        <input
                          type="text"
                          value={genCustomPrefix}
                          onChange={(e) => setGenCustomPrefix(e.target.value)}
                          placeholder="RYMON"
                          style={styles.keyInput}
                        />
                      </div>

                      {isCustomAppMode ? (
                        <div
                          style={{
                            marginTop: '16px',
                            padding: '12px 14px',
                            background: 'rgba(15, 23, 42, 0.7)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>📦</span>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8' }}>
                              CUSTOM APPLICATION MODE (PURE KEYAUTH ONLY)
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                              Keys generated for custom third-party apps use direct KeyAuth API verification. Web remote controls are exclusively designed for Free Fire MAX.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <label style={{ ...styles.formLabel, margin: 0 }}>SELECT KEY EDITION &bull; ARCHITECTURE</label>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Base: ₹{basePlanPrice} {isVipSelected ? `• +${vipSurchargePercent}% VIP Web Surcharge` : '• Zero Web Egress'}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                            {/* Card 1: Standard Mobile APK */}
                            <div
                              onClick={() => setGenEdition('normal')}
                              style={{
                                padding: '14px 16px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: genEdition === 'normal'
                                  ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.16), rgba(15, 23, 42, 0.85))'
                                  : 'rgba(15, 23, 42, 0.55)',
                                border: genEdition === 'normal'
                                  ? '1.5px solid #00d9ff'
                                  : '1px solid rgba(51, 65, 85, 0.5)',
                                boxShadow: genEdition === 'normal'
                                  ? '0 0 20px rgba(0, 217, 255, 0.2), inset 0 0 15px rgba(0, 217, 255, 0.08)'
                                  : 'none',
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: genEdition === 'normal' ? 'rgba(0, 217, 255, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                                  color: genEdition === 'normal' ? '#00d9ff' : '#94a3b8',
                                  border: genEdition === 'normal' ? '1px solid rgba(0, 217, 255, 0.5)' : '1px solid rgba(148, 163, 184, 0.2)'
                                }}>
                                  📱 STANDARD MOBILE
                                </span>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#00d9ff' }}>
                                  ₹{basePlanPrice}
                                </span>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', marginBottom: '4px' }}>
                                Normal APK In-Game Only
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                                Direct in-game mod/injector auth. Standard mobile play with zero web overhead.
                              </div>
                              {genEdition === 'normal' && (
                                <div style={{ marginTop: '8px', fontSize: '10.5px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>✓</span> ACTIVE SELECTION (BASE PRICE)
                                </div>
                              )}
                            </div>

                            {/* Card 2: VIP Streamer Remote */}
                            <div
                              onClick={() => {
                                if (!canGenerateVipRemote) {
                                  showToast('🔒 Reseller accounts are locked to Standard APK keys by default. Owner permission is required to unlock VIP Web Remote generation.')
                                  return
                                }
                                setGenEdition('vip')
                              }}
                              style={{
                                padding: '14px 16px',
                                borderRadius: '12px',
                                cursor: canGenerateVipRemote ? 'pointer' : 'not-allowed',
                                opacity: canGenerateVipRemote ? 1 : 0.65,
                                transition: 'all 0.2s ease',
                                background: genEdition === 'vip'
                                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(15, 23, 42, 0.9))'
                                  : 'rgba(15, 23, 42, 0.55)',
                                border: genEdition === 'vip'
                                  ? '1.5px solid #f59e0b'
                                  : '1px solid rgba(51, 65, 85, 0.5)',
                                boxShadow: genEdition === 'vip'
                                  ? '0 0 20px rgba(245, 158, 11, 0.25), inset 0 0 15px rgba(245, 158, 11, 0.1)'
                                  : 'none',
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: genEdition === 'vip' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(148, 163, 184, 0.1)',
                                  color: genEdition === 'vip' ? '#fbbf24' : '#94a3b8',
                                  border: genEdition === 'vip' ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(148, 163, 184, 0.2)'
                                }}>
                                  👑 VIP STREAMER REMOTE
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#fbbf24' }}>
                                    ₹{Math.round(basePlanPrice * (1 + vipSurchargePercent / 100))}
                                  </span>
                                  <span style={{ fontSize: '9px', fontWeight: 800, color: '#fbbf24', marginLeft: '4px', background: 'rgba(245, 158, 11, 0.2)', padding: '2px 4px', borderRadius: '4px' }}>
                                    +{vipSurchargePercent}%
                                  </span>
                                </div>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>Web Live Controller</span>
                                {!canGenerateVipRemote && <span style={{ fontSize: '11px', color: '#f43f5e' }}>🔒 LOCKED</span>}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                                Browser remote control (ESP radar, live Aimbot toggle, silent patch). 100% clean for screen recording.
                              </div>
                              {!canGenerateVipRemote ? (
                                <div style={{ marginTop: '8px', fontSize: '10.5px', fontWeight: 700, color: '#f43f5e' }}>
                                  🔒 LOCKED BY DEFAULT (Owner Permission Required)
                                </div>
                              ) : isReseller ? (
                                <div style={{ marginTop: '8px', fontSize: '10.5px', fontWeight: 700, color: '#05df72', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>✓</span> PERMITTED BY OWNER (+{vipSurchargePercent}% SURCHARGE)
                                </div>
                              ) : genEdition === 'vip' ? (
                                <div style={{ marginTop: '8px', fontSize: '10.5px', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>✓</span> ACTIVE SELECTION (+{vipSurchargePercent}% SURCHARGE)
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cost Summary Box */}
                      <div style={styles.invoiceSummaryBox}>
                        <div>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                            Invoice Cost ({genQuantity} Key{genQuantity > 1 ? 's' : ''} × {genDevicesMax} Device{genDevicesMax > 1 ? 's' : ''} × ₹{unitPlanPrice}):
                            {isVipSelected && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>
                                (Base ₹{basePlanPrice} + {vipSurchargePercent}% VIP Remote)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: isVipSelected ? '#fbbf24' : '#00d9ff' }}>
                            {isOwner ? '₹0 (Owner Free Mint)' : `₹${projectedInvoice.toLocaleString('en-IN')}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Remaining After Creation:</div>
                          <div
                            style={{
                              fontSize: '16px',
                              fontWeight: 600,
                              color: isOwner ? '#05df72' : walletBalance >= projectedInvoice ? '#05df72' : '#ef4444'
                            }}
                          >
                            {isOwner ? 'Unlimited (Owner)' : `₹${Math.max(0, walletBalance - projectedInvoice).toLocaleString('en-IN')}`}
                          </div>
                        </div>
                      </div>

                      {genError && <div style={{ ...styles.errorBox, marginTop: '16px' }}>{genError}</div>}

                      <button
                        type="submit"
                        disabled={authLoading}
                        style={{ ...styles.submitBtn, marginTop: '24px' }}
                      >
                        {authLoading
                          ? (isVipSelected ? 'ALLOCATING RYMON VIP KEYS...' : 'GENERATING STANDARD APK KEYS...')
                          : isVipSelected
                          ? `👑 GENERATE ${genQuantity > 1 ? `${genQuantity} VIP KEYS` : 'VIP KEY'} (${genDuration})`
                          : `📱 GENERATE ${genQuantity > 1 ? `${genQuantity} STANDARD KEYS` : 'STANDARD KEY'} (${genDuration})`}
                      </button>
                    </form>

                    {genCreatedKeysList.length > 0 && (
                      <div style={styles.generatedKeyBox}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px',
                            marginBottom: '10px'
                          }}
                        >
                          <div style={{ fontSize: '12px', color: '#05df72', fontWeight: 700 }}>
                            ✓ {genCreatedKeysList.length} KEY{genCreatedKeysList.length > 1 ? 'S' : ''} CREATED (WAITING FOR 1ST LOGIN)
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleCopyMultipleKeys(genCreatedKeysList, 'GENERATED')}
                              style={{
                                ...styles.copyKeyBtn,
                                background: '#05df72',
                                color: '#07090e',
                                fontWeight: 800
                              }}
                            >
                              📋 COPY {genCreatedKeysList.length > 1 ? `ALL (${genCreatedKeysList.length})` : 'KEY'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadKeysTxt(genCreatedKeysList, `${genDuration}_${genCreatedGame}`)}
                              style={{
                                ...styles.copyKeyBtn,
                                background: 'rgba(0, 217, 255, 0.2)',
                                border: '1px solid #00d9ff',
                                color: '#00d9ff',
                                fontWeight: 800
                              }}
                            >
                              📥 DOWNLOAD .TXT
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyAllDeliverySlips(genCreatedKeysList, genDuration, genCreatedGame)}
                              style={{
                                ...styles.copyKeyBtn,
                                background: 'rgba(5, 223, 114, 0.2)',
                                border: '1px solid #05df72',
                                color: '#05df72',
                                fontWeight: 800
                              }}
                              title="Copy formatted payment & delivery receipt for customer"
                            >
                              🧾 COPY SLIP{genCreatedKeysList.length > 1 ? `S (${genCreatedKeysList.length})` : ''}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareKeysWhatsApp(genCreatedKeysList, `${genDuration} (${genCreatedGame})`)}
                              style={{
                                ...styles.copyKeyBtn,
                                background: 'rgba(34, 197, 94, 0.2)',
                                border: '1px solid #22c55e',
                                color: '#4ade80',
                                fontWeight: 800
                              }}
                            >
                              📲 WHATSAPP
                            </button>
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            maxHeight: '240px',
                            overflowY: 'auto'
                          }}
                        >
                          {genCreatedKeysList.map((kStr) => (
                            <div key={kStr} style={styles.generatedKeyRow}>
                              <code style={styles.keyCodeText}>{kStr}</code>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleCopyDeliverySlip(kStr, genDuration, genCreatedGame)}
                                  style={{
                                    ...styles.copyKeyBtn,
                                    background: copiedDeliverySlip === kStr ? 'rgba(5, 223, 114, 0.35)' : 'rgba(5, 223, 114, 0.15)',
                                    border: '1px solid #05df72',
                                    color: '#05df72',
                                    fontSize: '11px',
                                    fontWeight: 700
                                  }}
                                  title="Copy Payment Successful & Key delivery slip for customer"
                                >
                                  {copiedDeliverySlip === kStr ? '✓ SLIP COPIED!' : '🧾 SLIP'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyKey(kStr)}
                                  style={styles.copyKeyBtn}
                                >
                                  {copiedKey === kStr ? 'COPIED!' : 'COPY'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. LICENSE KEYS TABLE */}
            {activeTab === 'keys' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      License Keys ({filteredKeys.length})
                    </h2>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>

                    {(isOwner || isAdmin) && (
                      <select
                        value={keyCreatorFilter}
                        onChange={(e) => setKeyCreatorFilter(e.target.value)}
                        style={{
                          ...styles.selectInput,
                          width: 'auto',
                          padding: '8px 12px',
                          fontSize: '12px'
                        }}
                      >
                        <option value="ALL">👥 All Creators</option>
                        {Array.from(new Set(keysList.map((k) => k.creator_username))).map((creator) => (
                          <option key={creator} value={creator}>
                            @{creator}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={keyGameFilter}
                      onChange={(e) => setKeyGameFilter(e.target.value)}
                      style={{
                        ...styles.selectInput,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: keyGameFilter === 'ALL' ? '#94a3b8' : '#00d9ff',
                        borderColor: keyGameFilter === 'ALL' ? 'rgba(51, 65, 85, 0.6)' : '#00d9ff'
                      }}
                    >
                      <option value="ALL">🎮 All Keys</option>
                      <option value="Free Fire MAX">🔥 Free Fire MAX</option>
                      {Array.from(new Set(keysList.map((k) => k.game || 'Free Fire MAX')))
                        .filter((g) => g !== 'Free Fire MAX')
                        .map((g) => (
                          <option key={g} value={g}>
                            ✨ {g} (Custom)
                          </option>
                        ))}
                    </select>
                    <div className="sg-search-box" style={styles.searchBox}>
                      <input
                        type="text"
                        value={searchKeyQuery}
                        onChange={(e) => setSearchKeyQuery(e.target.value)}
                        placeholder="Search key, HWID, game, seller..."
                        style={styles.searchInput}
                      />
                    </div>
                  </div>
                </div>

                {/* Bulk Key Command & Filter Bar */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '14px 16px',
                    backgroundColor: 'rgba(13, 17, 26, 0.9)',
                    border: '1px solid rgba(30, 41, 59, 0.8)',
                    borderRadius: '12px'
                  }}
                >
                  {/* Row 1: Status Filter Pills with Live Counts */}
                  <div className="sg-filter-scroll-row" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {(
                      [
                        { id: 'ALL', label: `ALL (${stats.total})`, color: '#00d9ff' },
                        { id: 'PLAYING', label: `🟢 PLAYING (${stats.playingNow})`, color: '#05df72' },
                        { id: 'ACTIVE', label: `⚡ ACTIVE (${stats.active})`, color: '#00d9ff' },
                        { id: 'WAITING', label: `🟡 UNUSED (${stats.unused})`, color: '#eab308' },
                        { id: 'PAUSED', label: `⏸️ PAUSED (${stats.paused})`, color: '#ffb700' },
                        { id: 'EXPIRED', label: `🔴 EXPIRED (${stats.expired})`, color: '#ef4444' },
                        { id: 'BANNED', label: `🚫 BANNED (${stats.banned})`, color: '#f43f5e' }
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setKeyStatusFilter(st.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border:
                            keyStatusFilter === st.id
                              ? `1px solid ${st.color}`
                              : '1px solid rgba(51, 65, 85, 0.6)',
                          backgroundColor:
                            keyStatusFilter === st.id
                              ? 'rgba(0, 217, 255, 0.16)'
                              : 'rgba(15, 23, 42, 0.65)',
                          color: keyStatusFilter === st.id ? st.color : '#94a3b8'
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Row 1B: Edition Filter Pills */}
                  <div
                    className="sg-filter-scroll-row"
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'nowrap',
                      overflowX: 'auto',
                      alignItems: 'center',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(30, 41, 59, 0.5)'
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      TIER / EDITION:
                    </span>
                    {(
                      [
                        { id: 'ALL', label: `ALL EDITIONS (${stats.total})`, color: '#38bdf8' },
                        { id: 'NORMAL', label: `📱 STANDARD APK (${stats.normalCount})`, color: '#00d9ff' },
                        { id: 'VIP', label: `👑 VIP STREAMER (${stats.vipCount})`, color: '#f59e0b' }
                      ] as const
                    ).map((ed) => (
                      <button
                        key={ed.id}
                        onClick={() => setKeyEditionFilter(ed.id)}
                        style={{
                          padding: '5px 11px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border:
                            keyEditionFilter === ed.id
                              ? `1px solid ${ed.color}`
                              : '1px solid rgba(51, 65, 85, 0.55)',
                          backgroundColor:
                            keyEditionFilter === ed.id
                              ? ed.id === 'VIP'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'rgba(0, 217, 255, 0.16)'
                              : 'rgba(15, 23, 42, 0.6)',
                          color: keyEditionFilter === ed.id ? ed.color : '#94a3b8'
                        }}
                      >
                        {ed.label}
                      </button>
                    ))}
                  </div>

                  {/* Row 2: Bulk Operations Toolbar */}
                  <div
                    className="sg-filter-scroll-row"
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'nowrap',
                      overflowX: 'auto',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(30, 41, 59, 0.7)'
                    }}
                  >
                    <button
                      onClick={() =>
                        handleCopyMultipleKeys(
                          keysList.filter((k) => k.status === 'WAITING').map((k) => k.license_key),
                          'UNUSED'
                        )
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid #eab308',
                        color: '#fde047',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Copy all Unused (Waiting) keys to clipboard for resale"
                    >
                      <span>📋</span> COPY UNUSED ({stats.unused})
                    </button>
                    <button
                      onClick={() =>
                        handleDownloadKeysTxt(
                          keysList.filter((k) => k.status === 'WAITING').map((k) => k.license_key),
                          'UNUSED'
                        )
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(0, 217, 255, 0.15)',
                        border: '1px solid #00d9ff',
                        color: '#00d9ff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Download all Unused (Waiting) keys as a .TXT file"
                    >
                      <span>📥</span> DOWNLOAD UNUSED .TXT
                    </button>
                    <button
                      onClick={() =>
                        handleShareKeysWhatsApp(
                          keysList.filter((k) => k.status === 'WAITING').map((k) => k.license_key),
                          'UNUSED'
                        )
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        border: '1px solid #22c55e',
                        color: '#4ade80',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Share Unused (Waiting) keys directly on WhatsApp"
                    >
                      <span>📲</span> WHATSAPP UNUSED
                    </button>
                    <button
                      onClick={() =>
                        handleCopyMultipleKeys(
                          filteredKeys.map((k) => k.license_key),
                          keyStatusFilter === 'ALL' ? 'VISIBLE' : keyStatusFilter
                        )
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(148, 163, 184, 0.15)',
                        border: '1px solid #94a3b8',
                        color: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Copy all currently filtered keys to clipboard"
                    >
                      <span>📋</span> COPY FILTERED ({filteredKeys.length})
                    </button>
                    <button
                      onClick={() => handleBulkPauseAllKeys(true)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(255, 183, 0, 0.15)',
                        border: '1px solid #ffb700',
                        color: '#ffb700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>⏸️</span> PAUSE ALL
                    </button>
                    <button
                      onClick={() => handleBulkPauseAllKeys(false)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(5, 223, 114, 0.15)',
                        border: '1px solid #05df72',
                        color: '#05df72',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>▶️</span> RESUME ALL
                    </button>
                    <button
                      onClick={handleBulkResetAllHwid}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(0, 217, 255, 0.15)',
                        border: '1px solid #00d9ff',
                        color: '#00d9ff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Unbind all devices across your keys without resetting active timers"
                    >
                      <span>🔄</span> RESET ALL HWID
                    </button>
                    <button
                      onClick={() => handleBulkExtendAllKeys(7)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        border: '1px solid #c084fc',
                        color: '#c084fc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>➕</span> +7 DAYS ALL
                    </button>
                    <button
                      onClick={() => handleQuickBulkDelete('expired')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(239, 68, 68, 0.16)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Permanently delete all Expired keys"
                    >
                      <span>🧹</span> DELETE EXPIRED ({stats.expired})
                    </button>
                    <button
                      onClick={() => handleQuickBulkDelete('unused')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        backgroundColor: 'rgba(249, 115, 22, 0.16)',
                        border: '1px solid #f97316',
                        color: '#fdba74',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Permanently delete all Unused (Waiting) keys"
                    >
                      <span>🗑️</span> DELETE UNUSED ({stats.unused})
                    </button>
                    {isRootOwner && (
                      <button
                        onClick={() => handleQuickBulkDelete('all')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          backgroundColor: 'rgba(220, 38, 38, 0.28)',
                          border: '1px solid #dc2626',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                        title="Owner Only: Wipe all keys in platform"
                      >
                        <span>💥</span> DELETE ALL ({stats.total})
                      </button>
                    )}
                  </div>
                </div>

                <div className="sg-table-card" style={styles.tableCard}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table className="sg-data-table" style={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={styles.th}># ID</th>
                          <th style={styles.th}>GAME & KEY</th>
                          <th style={styles.th}>DEVICES & HWID</th>
                          <th style={styles.th}>PLAN</th>
                          <th style={styles.th}>CREATOR</th>
                          <th style={styles.th}>STATUS & TIMER</th>
                          <th style={styles.th}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredKeys.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                              No licenses found matching criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredKeys.map((k) => (
                            <tr key={k.license_key} style={styles.tr}>
                              <td style={styles.td}>#{k.id}</td>
                              <td style={styles.td}>
                                <div style={{ fontWeight: 600, color: '#f8fafc' }}>{k.game}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                  <code style={{ fontSize: '12px', color: '#00d9ff' }}>{k.license_key}</code>
                                  <button
                                    onClick={() => handleCopyKey(k.license_key)}
                                    style={styles.miniCopyBtn}
                                    title="Copy key"
                                  >
                                    {copiedKey === k.license_key ? '✓' : '📋'}
                                  </button>
                                  <button
                                    onClick={() => handleCopyDeliverySlip(k.license_key, k.plan_duration, k.game)}
                                    style={{
                                      ...styles.miniCopyBtn,
                                      color: copiedDeliverySlip === k.license_key ? '#05df72' : '#cbd5e1'
                                    }}
                                    title="Copy Payment Successful & Delivery Slip"
                                  >
                                    {copiedDeliverySlip === k.license_key ? '✓' : '🧾'}
                                  </button>
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>
                                  {k.devices_used} / {k.devices_max} Bound
                                </div>
                                <div style={styles.deviceBarBack}>
                                  <div
                                    style={{
                                      ...styles.deviceBarFill,
                                      width: `${Math.min(100, (k.devices_used / (k.devices_max || 1)) * 100)}%`
                                    }}
                                  />
                                </div>
                                <div style={{ fontSize: '10px', color: k.device_hwid ? '#38bdf8' : '#64748b', marginTop: '4px' }}>
                                  {k.device_hwid ? `🔒 ${k.device_hwid.slice(0, 16)}` : '🟢 Unbound / Ready'}
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={styles.planBadge}>{k.plan_duration?.replace(' [VIP]', '')}</span>
                                  {k.plan_duration?.includes('[VIP]') ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <span
                                        style={{
                                          border: '1px solid rgba(250, 204, 21, 0.55)',
                                          background: 'rgba(250, 204, 21, 0.18)',
                                          color: '#fde047',
                                          fontSize: '9.5px',
                                          fontWeight: 800,
                                          padding: '2px 6px',
                                          borderRadius: '6px'
                                        }}
                                        title="VIP Streamer Edition: Live Web Remote & Streamer Controls"
                                      >
                                        👑 VIP REMOTE
                                      </span>
                                      {isOwner && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleVipKey(k.license_key, false)}
                                          style={{
                                            border: '1px solid rgba(148, 163, 184, 0.35)',
                                            background: 'rgba(15, 23, 42, 0.6)',
                                            color: '#94a3b8',
                                            fontSize: '9px',
                                            padding: '2px 5px',
                                            borderRadius: '5px',
                                            cursor: 'pointer'
                                          }}
                                          title="Revert to Standard APK key"
                                        >
                                          📱 Standard
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <span
                                        style={{
                                          border: '1px solid rgba(0, 217, 255, 0.35)',
                                          background: 'rgba(0, 217, 255, 0.1)',
                                          color: '#38bdf8',
                                          fontSize: '9.5px',
                                          fontWeight: 800,
                                          padding: '2px 6px',
                                          borderRadius: '6px'
                                        }}
                                        title="Standard Mobile Edition: In-Game APK Authentication Only (Zero Web Overhead)"
                                      >
                                        📱 APK ONLY
                                      </span>
                                      {(isOwner || isAdmin) && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleVipKey(k.license_key, true)}
                                          style={{
                                            border: '1px solid rgba(245, 158, 11, 0.5)',
                                            background: 'rgba(245, 158, 11, 0.16)',
                                            color: '#fbbf24',
                                            fontSize: '9.5px',
                                            fontWeight: 800,
                                            padding: '2px 6px',
                                            borderRadius: '6px',
                                            cursor: 'pointer'
                                          }}
                                          title="Click to upgrade key to VIP Streamer Remote (+50%)"
                                        >
                                          👑 +VIP
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={styles.avatarTiny}>
                                    {(k.creator_username || 'U').charAt(0).toUpperCase()}
                                  </span>
                                  <span style={{ fontWeight: 600, color: '#fde047' }}>
                                    👑 @{k.creator_username}
                                  </span>
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      ...styles.statusPill,
                                      background:
                                        k.is_paused || k.status === 'PAUSED'
                                          ? 'rgba(255,183,0,0.15)'
                                          : k.status === 'ACTIVE'
                                          ? 'rgba(5,223,114,0.15)'
                                          : k.status === 'WAITING'
                                          ? 'rgba(234,179,8,0.15)'
                                          : 'rgba(239,68,68,0.15)',
                                      color:
                                        k.is_paused || k.status === 'PAUSED'
                                          ? '#ffb700'
                                          : k.status === 'ACTIVE'
                                          ? '#05df72'
                                          : k.status === 'WAITING'
                                          ? '#eab308'
                                          : '#ef4444'
                                    }}
                                  >
                                    {k.is_paused || k.status === 'PAUSED'
                                      ? 'PAUSED'
                                      : k.status === 'WAITING'
                                      ? 'UNUSED (WAITING)'
                                      : k.status}
                                  </span>
                                  {!k.is_paused &&
                                    k.status === 'ACTIVE' &&
                                    onlineKeySet.has(k.license_key.toUpperCase()) && (
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 800,
                                          padding: '2px 6px',
                                          borderRadius: '6px',
                                          background: 'rgba(5, 223, 114, 0.2)',
                                          border: '1px solid rgba(5, 223, 114, 0.5)',
                                          color: '#05df72'
                                        }}
                                      >
                                        🟢 PLAYING
                                      </span>
                                    )}
                                </div>
                                <div
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color:
                                      k.status === 'EXPIRED'
                                        ? '#ef4444'
                                        : k.status === 'WAITING'
                                        ? '#eab308'
                                        : '#94a3b8',
                                    marginTop: '4px'
                                  }}
                                >
                                  {formatRemainingTime(k.expires_at, k.status, k.is_paused)}
                                  {k.expires_at && k.status !== 'WAITING' && (
                                    <span style={{ color: '#64748b', fontWeight: 400 }}>
                                      {' '}
                                      • {new Date(k.expires_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => {
                                      if (handleSelectRemoteKey(k.license_key)) {
                                        handleSelectTab('remote')
                                      }
                                    }}
                                    style={{ ...styles.actionIconBtn, color: '#00d9ff' }}
                                    title="Open Streamer Remote for this Key"
                                  >
                                    ⚡
                                  </button>
                                  <button
                                    onClick={() => handleTogglePauseKey(k.license_key)}
                                    style={{
                                      ...styles.actionIconBtn,
                                      color: k.is_paused || k.status === 'PAUSED' ? '#05df72' : '#ffb700'
                                    }}
                                    title={k.is_paused || k.status === 'PAUSED' ? 'Resume / Unpause Key' : 'Pause / Freeze Key'}
                                  >
                                    {k.is_paused || k.status === 'PAUSED' ? '▶️' : '⏸️'}
                                  </button>
                                  <button
                                    onClick={() => handleResetHWID(k.license_key)}
                                    style={styles.actionIconBtn}
                                    title="Reset HWID device binding (keeps timer)"
                                  >
                                    🔄
                                  </button>
                                  <button
                                    onClick={() => {
                                      setTargetExtendKey(k.license_key)
                                      handleSelectTab('extend')
                                    }}
                                    style={{ ...styles.actionIconBtn, color: '#a855f7' }}
                                    title="Extend License Duration"
                                  >
                                    ⏳
                                  </button>
                                  {(isOwner || isAdmin) && (
                                    <button
                                      onClick={() => handleToggleBanKey(k.license_key, k.status)}
                                      style={{
                                        ...styles.actionIconBtn,
                                        color: k.status === 'BANNED' ? '#05df72' : '#f43f5e'
                                      }}
                                      title={k.status === 'BANNED' ? 'Unban Key' : 'Ban Key'}
                                    >
                                      🚫
                                    </button>
                                  )}
                                  {(isOwner || k.status === 'EXPIRED' || k.status === 'WAITING') && (
                                    <button
                                      onClick={() => handleDeleteKey(k.license_key, k.status)}
                                      style={{ ...styles.actionIconBtn, color: '#ef4444' }}
                                      title="Delete License Key"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 5. USERS TABLE (MEDIA_1791705436370_50F30D3E.PNG) */}
            {activeTab === 'users' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? `Users (${usersList.length})` : `My Resellers (${usersList.length})`}
                    </h2>
                  </div>
                  <div className="sg-search-box" style={styles.searchBox}>
                    <input
                      type="text"
                      value={searchUserQuery}
                      onChange={(e) => setSearchUserQuery(e.target.value)}
                      placeholder="Search username, email, uplink..."
                      style={styles.searchInput}
                    />
                  </div>
                </div>

                <div className="sg-table-card" style={styles.tableCard}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table className="sg-data-table" style={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={styles.th}>USER PROFILE</th>
                          <th style={styles.th}>ROLE & STATUS</th>
                          <th style={styles.th}>REFERRAL / UPLINK</th>
                          <th style={styles.th}>BALANCE</th>
                          <th style={styles.th}>SUBSCRIPTION (30D / 60D)</th>
                          <th style={styles.th}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => {
                          const isSelfRow = Boolean(currentUser?.username) && (u.username || '').toLowerCase() === currentUser?.username.toLowerCase()
                          const isTargetRootOwner = (u.username || '').toLowerCase() === 'debajoyti'
                          const isTargetRyzen = (u.username || '').toLowerCase() === 'ryzen'
                          const canManageRow = isRootOwner 
                            ? !isSelfRow 
                            : isOwner
                            ? (!isSelfRow && u.role !== 'owner' && !isTargetRootOwner && !isTargetRyzen)
                            : isAdmin
                            ? (!isSelfRow && u.role === 'reseller' && Boolean(currentUser?.username) && (u.uplink || '').toLowerCase() === currentUser?.username.toLowerCase())
                            : false
                          const canDeleteThisUser = isRootOwner
                            ? !isSelfRow
                            : isOwner
                            ? (!isSelfRow && u.role !== 'owner' && !isTargetRootOwner && !isTargetRyzen)
                            : isAdmin
                            ? (!isSelfRow && u.role === 'reseller' && Boolean(currentUser?.username) && (u.uplink || '').toLowerCase() === currentUser?.username.toLowerCase())
                            : false
                          const expMs = u.expires_at ? new Date(u.expires_at).getTime() : Date.now() + 30 * 86400000
                          const diffMs = expMs - Date.now()
                          const daysLeft = Math.max(0, Math.ceil(diffMs / 86400000))
                          const isSubExpired = u.role !== 'owner' && diffMs <= 0
                          const subTierLabel = daysLeft > 30 ? '60D SUB' : '30D SUB'
                          return (
                            <tr key={u.id} style={styles.tr}>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={styles.avatarCircle}>
                                    {(u.username || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                                      {u.username} {isSelfRow && <span style={{ fontSize: '10px', color: '#00d9ff' }}>(YOU)</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={styles.td}>
                                <span style={styles.roleBadge}>
                                  {u.role === 'owner'
                                    ? (u.username?.toLowerCase() === 'debajoyti' ? 'ROOT OWNER' : 'OWNER')
                                    : String(u.role || 'user').toUpperCase()}
                                </span>
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: isSubExpired ? '#ef4444' : u.status === 'ACTIVE' ? '#05df72' : '#ef4444',
                                    marginTop: '4px'
                                  }}
                                >
                                  ● {isSubExpired ? 'SUB EXPIRED' : u.status}
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ fontSize: '13px', color: '#cbd5e1' }}>Uplink: {u.uplink}</div>
                                {u.referral_code && (
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>Code: {u.referral_code}</div>
                                )}
                              </td>
                              <td style={styles.td}>
                                <span style={styles.userBalanceGreen}>
                                  {u.role === 'owner' ? '∞ FREE' : `₹${u.balance.toLocaleString('en-IN')}`}
                                </span>
                              </td>
                              <td style={styles.td}>
                                {u.role === 'owner' ? (
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#fde047' }}>
                                    {u.username?.toLowerCase() === 'debajoyti' ? '👑 ROOT OWNER' : '👑 OWNER'}
                                  </span>
                                ) : (
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 800,
                                          padding: '2px 7px',
                                          borderRadius: '6px',
                                          background: isSubExpired
                                            ? 'rgba(239, 68, 68, 0.2)'
                                            : daysLeft > 30
                                            ? 'rgba(168, 85, 247, 0.2)'
                                            : 'rgba(0, 217, 255, 0.18)',
                                          border: isSubExpired
                                            ? '1px solid rgba(239, 68, 68, 0.5)'
                                            : daysLeft > 30
                                            ? '1px solid rgba(168, 85, 247, 0.45)'
                                            : '1px solid rgba(0, 217, 255, 0.4)',
                                          color: isSubExpired ? '#ef4444' : daysLeft > 30 ? '#c084fc' : '#00d9ff'
                                        }}
                                      >
                                        {isSubExpired ? '🔴 EXPIRED' : `⏳ ${daysLeft}d left (${subTierLabel})`}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                      Ends: {new Date(expMs).toLocaleDateString()}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td style={styles.td}>
                                {canManageRow ? (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button
                                      onClick={() => handleRenewUserSubscription(u.username, 30)}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        background: 'rgba(0, 217, 255, 0.16)',
                                        border: '1px solid rgba(0, 217, 255, 0.45)',
                                        color: '#00d9ff'
                                      }}
                                      title="Set / Renew 30 Days Reseller Subscription"
                                    >
                                      30D Sub
                                    </button>
                                    <button
                                      onClick={() => handleRenewUserSubscription(u.username, 60)}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        background: 'rgba(168, 85, 247, 0.18)',
                                        border: '1px solid rgba(168, 85, 247, 0.5)',
                                        color: '#c084fc'
                                      }}
                                      title="Set / Renew 60 Days Reseller Subscription"
                                    >
                                      60D Sub
                                    </button>
                                    <button
                                      onClick={() => {
                                        setTopUpTargetUser(u.username)
                                        handleSelectTab('add-balance')
                                      }}
                                      style={styles.actionIconBtn}
                                      title={isOwner ? 'Top up balance (Free Mint)' : 'Transfer balance from your wallet'}
                                    >
                                      💼
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleSelectTargetPriceUser(u.username)
                                        handleSelectTab('advance')
                                      }}
                                      style={{ ...styles.actionIconBtn, color: '#fde047' }}
                                      title="Set Individual Key Prices for this User"
                                    >
                                      💰
                                    </button>
                                    {isRootOwner && u.username.toLowerCase() !== 'debajoyti' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => openAppPermModal(u)}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontSize: '10px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            background: Boolean(u.permissions?.allow_custom_apps) || (Array.isArray((u.permissions as any)?.allowed_apps) && (u.permissions as any).allowed_apps.length > 0)
                                              ? 'rgba(0, 217, 255, 0.16)'
                                              : 'rgba(239, 68, 68, 0.16)',
                                            border: Boolean(u.permissions?.allow_custom_apps) || (Array.isArray((u.permissions as any)?.allowed_apps) && (u.permissions as any).allowed_apps.length > 0)
                                              ? '1px solid rgba(0, 217, 255, 0.45)'
                                              : '1px solid rgba(239, 68, 68, 0.45)',
                                            color: Boolean(u.permissions?.allow_custom_apps) || (Array.isArray((u.permissions as any)?.allowed_apps) && (u.permissions as any).allowed_apps.length > 0)
                                              ? '#00d9ff'
                                              : '#f87171'
                                          }}
                                          title="Click to manage custom app permissions for this user"
                                        >
                                          {u.permissions?.allow_custom_apps
                                            ? '✨ All Custom'
                                            : Array.isArray((u.permissions as any)?.allowed_apps) && (u.permissions as any).allowed_apps.length > 0
                                            ? `🛡️ ${(u.permissions as any).allowed_apps[0]} (${(u.permissions as any).allowed_apps.length})`
                                            : '🔒 FF MAX Only'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleUserVipRemote(u.username, !isUserVipRemoteAllowed(u))}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontSize: '10px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            background: isUserVipRemoteAllowed(u) ? 'rgba(245, 158, 11, 0.18)' : 'rgba(148, 163, 184, 0.1)',
                                            border: isUserVipRemoteAllowed(u) ? '1px solid rgba(245, 158, 11, 0.55)' : '1px solid rgba(148, 163, 184, 0.3)',
                                            color: isUserVipRemoteAllowed(u) ? '#fbbf24' : '#94a3b8'
                                          }}
                                          title={isUserVipRemoteAllowed(u) ? 'Owner Permitted: Click to lock account to Standard APK only' : 'Locked by Default: Click to Permit VIP Web Remote key generation'}
                                        >
                                          {isUserVipRemoteAllowed(u) ? '👑 VIP Permitted' : '🔒 APK Only'}
                                        </button>
                                      </>
                                    )}
                                    <button
                                      onClick={() => {
                                        setPwdModalUser(u.username)
                                        setPwdNewValue(`rymon@${Math.floor(1000 + Math.random() * 9000)}`)
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        background: 'rgba(5, 223, 114, 0.16)',
                                        border: '1px solid rgba(5, 223, 114, 0.45)',
                                        color: '#05df72'
                                      }}
                                      title="Reset Password for this User"
                                    >
                                      🔑 Pass
                                    </button>
                                    <button
                                      onClick={() => handleToggleUserBan(u.username, u.status === 'BANNED')}
                                      style={{
                                        ...styles.actionIconBtn,
                                        color: u.status === 'BANNED' ? '#ef4444' : '#94a3b8',
                                        borderColor: u.status === 'BANNED' ? 'rgba(239, 68, 68, 0.4)' : undefined
                                      }}
                                      title={u.status === 'BANNED' ? 'Unban User (Restore Access)' : 'Ban User (Revoke Access)'}
                                    >
                                      {u.status === 'BANNED' ? '🚫' : '🛡️'}
                                    </button>
                                    {canDeleteThisUser && (
                                      <button
                                        onClick={() => handleDeleteUser(u.username, u.role, u.uplink || '')}
                                        style={{
                                          ...styles.actionIconBtn,
                                          color: '#ef4444',
                                          borderColor: 'rgba(239, 68, 68, 0.4)',
                                          background: 'rgba(239, 68, 68, 0.12)'
                                        }}
                                        title={`Permanently Delete User @${u.username}`}
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{
                                    fontSize: '11px',
                                    color: isTargetRootOwner ? '#05df72' : '#64748b',
                                    fontWeight: isTargetRootOwner ? 800 : 400,
                                    background: isTargetRootOwner ? 'rgba(5, 223, 114, 0.12)' : 'transparent',
                                    padding: isTargetRootOwner ? '3px 8px' : 0,
                                    borderRadius: '4px',
                                    border: isTargetRootOwner ? '1px solid rgba(5, 223, 114, 0.3)' : 'none'
                                  }}>
                                    {isTargetRootOwner ? '👑 Root Founder (Immune)' : (isSelfRow ? 'Current Account' : 'Protected')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 7. DELETE KEYS */}
            {activeTab === 'delete' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner
                        ? 'Purge License Keys'
                        : isAdmin
                        ? 'Clean Team Expired Keys'
                        : 'Clean Expired Keys'}
                    </h2>
                  </div>
                </div>

                {/* 1-Click Quick Purge Bar */}
                <div className="sg-stat-grid" style={{ ...styles.statGrid, marginBottom: '24px' }}>
                  <div
                    className="sg-stat-card"
                    onClick={() => handleQuickBulkDelete('expired')}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(239, 68, 68, 0.45)',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(13, 17, 26, 0.92) 100%)'
                    }}
                  >
                    <div className="sg-stat-icon-frame" style={{ ...styles.statIconFrame, color: '#ef4444' }}>🧹</div>
                    <div>
                      <div className="sg-stat-num" style={{ ...styles.statNum, color: '#ef4444' }}>{stats.expired}</div>
                      <div className="sg-stat-label" style={{ ...styles.statLabel, color: '#fca5a5', fontWeight: 700 }}>
                        1-Click Purge Expired Keys
                      </div>
                    </div>
                  </div>
                  <div
                    className="sg-stat-card"
                    onClick={() => handleQuickBulkDelete('unused')}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(234, 179, 8, 0.45)',
                      background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(13, 17, 26, 0.92) 100%)'
                    }}
                  >
                    <div className="sg-stat-icon-frame" style={{ ...styles.statIconFrame, color: '#eab308' }}>🗑️</div>
                    <div>
                      <div className="sg-stat-num" style={{ ...styles.statNum, color: '#eab308' }}>{stats.unused}</div>
                      <div className="sg-stat-label" style={{ ...styles.statLabel, color: '#fde047', fontWeight: 700 }}>
                        1-Click Purge Unused Keys
                      </div>
                    </div>
                  </div>
                  {isRootOwner && (
                    <div
                      className="sg-stat-card"
                      onClick={() => handleQuickBulkDelete('all')}
                      style={{
                        ...styles.statCard,
                        cursor: 'pointer',
                        borderColor: 'rgba(220, 38, 38, 0.6)',
                        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.22) 0%, rgba(13, 17, 26, 0.95) 100%)'
                      }}
                    >
                      <div className="sg-stat-icon-frame" style={{ ...styles.statIconFrame, color: '#ffffff' }}>💥</div>
                      <div>
                        <div className="sg-stat-num" style={{ ...styles.statNum, color: '#ffffff' }}>{stats.total}</div>
                        <div className="sg-stat-label" style={{ ...styles.statLabel, color: '#fecaca', fontWeight: 800 }}>
                          1-Click Wipe ALL Keys (Owner)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={styles.centerCardWrapper}>
                  <div className="sg-management-card" style={styles.managementCard}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Target Scope / User <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={targetDeleteUser}
                        onChange={(e) => setTargetDeleteUser(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="__ALL__">
                          {isOwner
                            ? '🌐 ALL USERS (Entire Platform)'
                            : isAdmin
                            ? '🌐 ALL IN MY ADMIN TEAM (Me + My Resellers)'
                            : `👤 My Keys (@${currentUser?.username})`}
                        </option>
                        {(isOwner || isAdmin) &&
                          usersList.map((u) => (
                            <option key={u.id} value={u.username}>
                              @{u.username} ({String(u.role || 'user').toUpperCase()})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                      <label style={styles.formLabel}>
                        Key Type to Purge <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={deleteKeyType}
                        onChange={(e) => setDeleteKeyType(e.target.value as any)}
                        style={styles.selectInput}
                      >
                        <option value="expired">🔴 Expired Keys Only ({stats.expired} in scope)</option>
                        <option value="unused">🟡 Unused / Waiting Keys Only ({stats.unused} in scope)</option>
                        {isOwner && (
                          <option value="all">💥 ALL Keys Including Active ({stats.total} in scope — Owner Only)</option>
                        )}
                      </select>
                    </div>

                    <button
                      onClick={handleApplyDeleteUserKeys}
                      style={{
                        ...styles.submitBtn,
                        marginTop: '24px',
                        background: '#ef4444',
                        color: '#fff'
                      }}
                    >
                      🧹 Execute Key Purge Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 8. EXTEND KEYS */}
            {activeTab === 'extend' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Extend License Duration</h2>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div className="sg-management-card" style={styles.managementCard}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Select License Key <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={targetExtendKey}
                        onChange={(e) => setTargetExtendKey(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="">-- Select a Key --</option>
                        <option value="__ALL__">
                          ⚡ ALL ACTIVE & PAUSED KEYS ({keysList.filter((k) => k.status === 'ACTIVE' || k.status === 'PAUSED').length} Keys)
                        </option>
                        {keysList.map((k) => (
                          <option key={k.license_key} value={k.license_key}>
                            {k.license_key} ({k.game} • {k.plan_duration} • {k.devices_max || 1} Dev)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                      <label style={styles.formLabel}>
                        Days to Add (Max 30 Days Cap) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={extendAmount}
                        onChange={(e) => setExtendAmount(Math.min(30, Math.max(7, parseInt(e.target.value) || 7)))}
                        style={styles.selectInput}
                      >
                        <option value="7">7 Days</option>
                        <option value="15">15 Days</option>
                        <option value="30">30 Days (Max Cap)</option>
                      </select>
                    </div>

                    {/* Live Extension Cost Preview */}
                    {(() => {
                      const selectedKeyObj = keysList.find((k) => k.license_key === targetExtendKey)
                      const isBulkAll = targetExtendKey === '__ALL__'
                      const activeTargets = keysList.filter(
                        (k) => k.status === 'ACTIVE' || k.status === 'PAUSED'
                      )
                      const singleCost = calculateExtensionCost(
                        extendAmount,
                        currentUser?.username,
                        selectedKeyObj?.devices_max || 1
                      )
                      const bulkCost = activeTargets.reduce(
                        (sum, k) => sum + calculateExtensionCost(extendAmount, currentUser?.username, k.devices_max || 1),
                        0
                      )
                      const finalCost = isOwner ? 0 : isBulkAll ? bulkCost : targetExtendKey ? singleCost : 0
                      const actorWallet = walletBalance ?? currentUser?.balance ?? 0
                      const isInsufficient = !isOwner && finalCost > actorWallet

                      return (
                        <div
                          style={{
                            marginTop: '18px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: isOwner ? 'rgba(250, 204, 21, 0.1)' : 'rgba(0, 217, 255, 0.08)',
                            border: isOwner ? '1px solid rgba(250, 204, 21, 0.35)' : '1px solid rgba(0, 217, 255, 0.25)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                            {isOwner ? '👑 Owner Extension Cost:' : '💳 Wallet Deduction:'}
                          </div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 800,
                              color: isOwner ? '#fde047' : isInsufficient ? '#ef4444' : '#05df72'
                            }}
                          >
                            {isOwner
                              ? '₹0 (FREE UNLIMITED)'
                              : targetExtendKey
                              ? `₹${finalCost.toLocaleString('en-IN')} (Bal: ₹${actorWallet.toLocaleString('en-IN')})`
                              : 'Select a key above'}
                          </div>
                        </div>
                      )
                    })()}

                    <button
                      onClick={handleApplyExtendKey}
                      style={{
                        ...styles.submitBtn,
                        marginTop: '20px',
                        background: '#00d9ff',
                        color: '#07090e'
                      }}
                    >
                      Extend Key Expiration
                    </button>
                  </div>
                </div>
              </div>
            )}



            {/* 9. PRICING & ADVANCE SYSTEM */}
            {activeTab === 'advance' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? 'Pricing & Policies' : 'Reseller Pricing'}
                    </h2>
                  </div>
                  <span style={styles.cyanMiniBadge}>{isOwner ? 'PRICING' : 'RESELLER'}</span>
                </div>

                {/* Pricing Grid: Global Default (Owner) / Wholesale Rates (Admin) vs Target Individual */}
                <div className="sg-dual-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                  {isOwner ? (
                    /* Card 1 (Owner): Global Default Key Prices */
                    <div className="sg-card-box" style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>🌐 Default Key Prices (All Users)</h4>
                        <span style={styles.cyanMiniBadge}>GLOBAL RATE</span>
                      </div>

                      <form onSubmit={handleSaveGlobalDefaultPrices} style={{ marginTop: '14px' }}>
                        <div className="sg-form-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                          {Object.keys(DEFAULT_KEY_PRICES).map((plan) => (
                            <div key={plan} style={styles.formGroup}>
                              <label style={styles.formLabel}>{plan.toUpperCase()} (₹)</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={globalPrices[plan] ?? DEFAULT_KEY_PRICES[plan]}
                                onChange={(e) =>
                                  setGlobalPrices({
                                    ...globalPrices,
                                    [plan]: Math.max(0, parseInt(e.target.value) || 0)
                                  })
                                }
                                style={styles.keyInput}
                                required
                              />
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                          <button
                            type="submit"
                            style={{
                              ...styles.submitBtn,
                              flex: 1,
                              background: '#05df72',
                              color: '#07090e',
                              fontWeight: 800
                            }}
                          >
                            💾 SAVE DEFAULT PRICES
                          </button>
                          <button
                            type="button"
                            onClick={handleResetGlobalDefaultPrices}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: 'rgba(148, 163, 184, 0.12)',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                              color: '#cbd5e1',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            ↺ Reset
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    /* Card 1 (Admin/Reseller): Read-only view of Wholesale/Reseller Rates */
                    <div className="sg-card-box" style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>{isAdmin ? '🛡️ Your Admin Wholesale Key Rates' : '💼 Your Reseller Key Rates'}</h4>
                        <span style={styles.cyanMiniBadge}>YOUR BASE COST</span>
                      </div>
                      <div className="sg-form-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '14px' }}>
                        {Object.keys(DEFAULT_KEY_PRICES).map((plan) => (
                          <div
                            key={plan}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: 'rgba(15, 23, 42, 0.65)',
                              border: '1px solid rgba(255, 255, 255, 0.07)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>{plan}</span>
                            <span style={{ fontSize: '14px', color: '#05df72', fontWeight: 800 }}>
                              ₹{getEffectivePriceMap(currentUser?.username)[plan] ?? DEFAULT_KEY_PRICES[plan]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card 2: Target Individual Custom Price Override (Owner & Admin only) */}
                  {(isOwner || isAdmin) && (
                    <div className="sg-card-box" style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>🎯 Target Individual Price Override</h4>
                      <span
                        style={{
                          ...styles.cyanMiniBadge,
                          background: 'rgba(250, 204, 21, 0.15)',
                          color: '#fde047'
                        }}
                      >
                        {isOwner ? 'PER RESELLER / ADMIN' : 'MY DOWNLINE RESELLERS'}
                      </span>
                    </div>

                    <form onSubmit={handleSaveIndividualUserPrices} style={{ marginTop: '14px' }}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          SELECT TARGET {isOwner ? 'ADMIN / RESELLER' : 'DOWNLINE RESELLER'} <span style={{ color: '#fde047' }}>*</span>
                        </label>
                        <select
                          value={targetPriceUser}
                          onChange={(e) => handleSelectTargetPriceUser(e.target.value)}
                          style={styles.selectInput}
                          required
                        >
                          <option value="">-- Choose {isOwner ? 'Admin or Reseller' : 'Downline Reseller'} --</option>
                          {usersList
                            .filter((u) =>
                              isOwner
                                ? u.role !== 'owner'
                                : u.role === 'reseller' && (u.username || '').toLowerCase() !== (currentUser?.username || '').toLowerCase()
                            )
                            .map((u) => {
                              const hasCustom = Boolean(getUserCustomPriceMap(u.username))
                              return (
                                <option key={u.id} value={u.username}>
                                  @{u.username} ({String(u.role || 'user').toUpperCase()}) {hasCustom ? '★ CUSTOM RATE' : '• Default'}
                                </option>
                              )
                            })}
                        </select>
                      </div>

                      <div className="sg-form-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '12px' }}>
                        {Object.keys(DEFAULT_KEY_PRICES).map((plan) => (
                          <div key={plan} style={styles.formGroup}>
                            <label style={styles.formLabel}>{plan.toUpperCase()} (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={customUserPrices[plan] ?? globalPrices[plan] ?? DEFAULT_KEY_PRICES[plan]}
                              onChange={(e) =>
                                setCustomUserPrices({
                                  ...customUserPrices,
                                  [plan]: Math.max(0, parseInt(e.target.value) || 0)
                                })
                              }
                              style={styles.keyInput}
                              required
                            />
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                        <button
                          type="submit"
                          style={{
                            ...styles.submitBtn,
                            flex: 1,
                            background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
                            color: '#07090e',
                            fontWeight: 800
                          }}
                        >
                          👑 SAVE RATE FOR {targetPriceUser ? `@${targetPriceUser.toUpperCase()}` : 'USER'}
                        </button>
                        {targetPriceUser && getUserCustomPriceMap(targetPriceUser) && (
                          <button
                            type="button"
                            onClick={() => handleClearIndividualUserPrices(targetPriceUser)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#ef4444',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Use Default
                          </button>
                        )}
                      </div>
                    </form>

                    {/* Active Individual Overrides Summary */}
                    {Object.keys(allCustomUserMaps).length > 0 && (
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
                          ACTIVE CUSTOM OVERRIDES:
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {Object.entries(allCustomUserMaps)
                            .filter(([uname]) =>
                              isOwner ||
                              usersList.some(
                                (u) =>
                                  (u.username || '').toLowerCase() === (uname || '').toLowerCase() &&
                                  u.role === 'reseller' &&
                                  (u.username || '').toLowerCase() !== (currentUser?.username || '').toLowerCase()
                              )
                            )
                            .map(([uname, pmap]) => (
                              <div
                                key={uname}
                                onClick={() => handleSelectTargetPriceUser(uname)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  background: 'rgba(250, 204, 21, 0.12)',
                                  border: '1px solid rgba(250, 204, 21, 0.35)',
                                  color: '#fde047',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>👑 @{uname} (1D: ₹{pmap['1 Day']} • 30D: ₹{pmap['30 Days']})</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

                {isOwner && (
                  <>
                    <div style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>📱 Single Device Login</h4>
                        <span style={styles.cyanMiniBadge}>SECURITY POLICY</span>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Admin (Level 2)</div>
                          <div style={styles.settingSub}>Keys by Admins</div>
                        </div>
                        <div
                          onClick={() => setSingleDeviceAdmin(!singleDeviceAdmin)}
                          style={{
                            ...styles.switchPill,
                            background: singleDeviceAdmin ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: singleDeviceAdmin ? 'translateX(20px)' : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Reseller (Level 3)</div>
                          <div style={styles.settingSub}>Keys by Resellers</div>
                        </div>
                        <div
                          onClick={() => setSingleDeviceReseller(!singleDeviceReseller)}
                          style={{
                            ...styles.switchPill,
                            background: singleDeviceReseller ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: singleDeviceReseller ? 'translateX(20px)' : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ ...styles.cardBox, marginTop: '20px' }}>
                      <div style={styles.cardHeader}>
                        <h4>🔑 Trial Key Settings</h4>
                        <span style={styles.cyanMiniBadge}>ROLE PERMISSIONS</span>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Admin (Level 2)</div>
                          <div style={styles.settingSub}>Allow Admins to generate trial keys</div>
                        </div>
                        <div
                          onClick={() => setTrialAdmin(!trialAdmin)}
                          style={{
                            ...styles.switchPill,
                            background: trialAdmin ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: trialAdmin ? 'translateX(20px)' : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Reseller (Level 3)</div>
                          <div style={styles.settingSub}>Allow Resellers to generate trial keys</div>
                        </div>
                        <div
                          onClick={() => setTrialReseller(!trialReseller)}
                          style={{
                            ...styles.switchPill,
                            background: trialReseller ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: trialReseller ? 'translateX(20px)' : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Multi-App Generation & Role Key Restrictions */}
                    <div style={{ ...styles.cardBox, marginTop: '20px' }}>
                      <div style={styles.cardHeader}>
                        <h4>🎮 Multi-App Generation &amp; Role Key Restrictions</h4>
                        <span
                          style={{
                            ...styles.cyanMiniBadge,
                            background: 'rgba(0, 217, 255, 0.16)',
                            color: '#00d9ff'
                          }}
                        >
                          APP ACCESS POLICY
                        </span>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Allow Resellers to Generate Custom App Keys</div>
                          <div style={styles.settingSub}>
                            When OFF (Default / Recommended), Resellers are restricted to Free Fire MAX only. When ON, Resellers can generate keys for custom app names.
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              allow_reseller_custom_apps: !securityPolicy.allow_reseller_custom_apps
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: securityPolicy.allow_reseller_custom_apps
                              ? '#05df72'
                              : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: securityPolicy.allow_reseller_custom_apps
                                ? 'translateX(20px)'
                                : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Allow Level 2 Admins to Generate Custom App Keys</div>
                          <div style={styles.settingSub}>
                            Grants Admins permission to generate custom Pure KeyAuth keys for any third-party app
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              allow_admin_custom_apps: !(securityPolicy.allow_admin_custom_apps ?? true)
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: (securityPolicy.allow_admin_custom_apps ?? true)
                              ? '#00d9ff'
                              : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: (securityPolicy.allow_admin_custom_apps ?? true)
                                ? 'translateX(20px)'
                                : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Reseller Max Devices Cap (Anti-Sharing)</div>
                          <div style={styles.settingSub}>
                            Limits how many device HWIDs a Reseller key can bind (forces single device per license)
                          </div>
                        </div>
                        <select
                          value={securityPolicy.reseller_max_devices_limit ?? 1}
                          onChange={(e) =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              reseller_max_devices_limit: parseInt(e.target.value) || 1
                            })
                          }
                          style={{
                            ...styles.selectInput,
                            width: 'auto',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 800
                          }}
                        >
                          <option value={1}>🔒 1 Device Only (Anti-Sharing Strict)</option>
                          <option value={2}>2 Devices Max</option>
                          <option value={5}>5 Devices Max</option>
                          <option value={300}>300 Devices (Unlimited Multi-Device)</option>
                        </select>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Reseller Max Bulk Minting Limit</div>
                          <div style={styles.settingSub}>
                            Maximum quantity of keys a Reseller can generate in a single batch
                          </div>
                        </div>
                        <select
                          value={securityPolicy.reseller_max_bulk_limit ?? 10}
                          onChange={(e) =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              reseller_max_bulk_limit: parseInt(e.target.value) || 10
                            })
                          }
                          style={{
                            ...styles.selectInput,
                            width: 'auto',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 800
                          }}
                        >
                          <option value={1}>1 Key (Single Mint Only)</option>
                          <option value={5}>5 Keys (Mini Pack)</option>
                          <option value={10}>10 Keys (Standard Pack)</option>
                          <option value={20}>20 Keys (Reseller Stock)</option>
                          <option value={50}>50 Keys (Mega Stock)</option>
                        </select>
                      </div>

                      {/* VIP Web Remote Permission Controls */}
                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>
                            <span>👑 Allow Resellers to Generate VIP Web Remote Keys</span>
                            {!(securityPolicy.allow_reseller_web_remote ?? false) && (
                              <span style={{ marginLeft: '8px', fontSize: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                STRICT LOCKED
                              </span>
                            )}
                          </div>
                          <div style={styles.settingSub}>
                            When OFF (Default / Strict), Resellers are locked to Standard APK keys only (zero web remote egress). When ON, Resellers can generate VIP Streamer Web Remote keys.
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              allow_reseller_web_remote: !(securityPolicy.allow_reseller_web_remote ?? false)
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: (securityPolicy.allow_reseller_web_remote ?? false)
                              ? '#05df72'
                              : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: (securityPolicy.allow_reseller_web_remote ?? false)
                                ? 'translateX(20px)'
                                : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Allow Level 2 Admins to Generate VIP Web Remote Keys</div>
                          <div style={styles.settingSub}>
                            Grants Admins permission to generate VIP Streamer Web Remote keys with live web control
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              allow_admin_web_remote: !(securityPolicy.allow_admin_web_remote ?? true)
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: (securityPolicy.allow_admin_web_remote ?? true)
                              ? '#00d9ff'
                              : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: (securityPolicy.allow_admin_web_remote ?? true)
                                ? 'translateX(20px)'
                                : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>VIP Web Remote Price Surcharge Markup</div>
                          <div style={styles.settingSub}>
                            Automatic percentage surcharge applied to base plan pricing for VIP Streamer Web Remote keys
                          </div>
                        </div>
                        <select
                          value={securityPolicy.vip_price_surcharge_percent ?? 50}
                          onChange={(e) =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              vip_price_surcharge_percent: parseInt(e.target.value) || 0
                            })
                          }
                          style={{
                            ...styles.selectInput,
                            width: 'auto',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.4)'
                          }}
                        >
                          <option value={0}>0% (No Surcharge)</option>
                          <option value={25}>+25% VIP Surcharge</option>
                          <option value={50}>⭐ +50% VIP Surcharge (Standard Recommended)</option>
                          <option value={75}>+75% VIP Surcharge</option>
                          <option value={100}>+100% VIP Surcharge (2x Price)</option>
                        </select>
                      </div>
                    </div>

                    {/* Sovereign Anti-Sharing, Reseller Expiry & APK Force-Update Policy */}
                    <div style={{ ...styles.cardBox, marginTop: '20px' }}>
                      <div style={styles.cardHeader}>
                        <h4>🛡️ RYMON Anti-Sharing, Reseller Expiry &amp; APK Force-Update</h4>
                        <span
                          style={{
                            ...styles.cyanMiniBadge,
                            background: 'rgba(5, 223, 114, 0.16)',
                            color: '#05df72'
                          }}
                        >
                          ENTERPRISE POLICY
                        </span>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Reseller Daily HWID Reset Limit (Per Key)</div>
                          <div style={styles.settingSub}>
                            Prevents Resellers from resetting 1 key across multiple buyers all day (Owner &amp; Admin remain unlimited)
                          </div>
                        </div>
                        <select
                          value={securityPolicy.reseller_hwid_limit_per_day}
                          onChange={(e) =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              reseller_hwid_limit_per_day: parseInt(e.target.value)
                            })
                          }
                          style={{
                            ...styles.selectInput,
                            width: 'auto',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 800
                          }}
                        >
                          <option value={1}>1 Reset / Day / Key (Strict)</option>
                          <option value={2}>2 Resets / Day / Key (Recommended)</option>
                          <option value={3}>3 Resets / Day / Key</option>
                          <option value={5}>5 Resets / Day / Key</option>
                          <option value={999}>Unlimited Resets</option>
                        </select>
                      </div>

                      <div style={styles.settingToggleRow}>
                        <div>
                          <div style={styles.settingTitle}>Auto-Pause Customer Keys When Reseller Subscription Expires</div>
                          <div style={styles.settingSub}>
                            Automatically freezes all active keys of an expired Reseller until they renew their 30D/60D subscription
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              auto_pause_keys_on_reseller_expiry: !securityPolicy.auto_pause_keys_on_reseller_expiry
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: securityPolicy.auto_pause_keys_on_reseller_expiry
                              ? '#05df72'
                              : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: securityPolicy.auto_pause_keys_on_reseller_expiry
                                ? 'translateX(20px)'
                                : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '14px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>ADMIN 30D RESELLER RENEWAL FEE (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={securityPolicy.admin_sub_renew_fee_30d}
                            onChange={(e) =>
                              setSecurityPolicy({
                                ...securityPolicy,
                                admin_sub_renew_fee_30d: Math.max(0, parseInt(e.target.value) || 0)
                              })
                            }
                            style={styles.keyInput}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>ADMIN 60D RESELLER RENEWAL FEE (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={securityPolicy.admin_sub_renew_fee_60d}
                            onChange={(e) =>
                              setSecurityPolicy({
                                ...securityPolicy,
                                admin_sub_renew_fee_60d: Math.max(0, parseInt(e.target.value) || 0)
                              })
                            }
                            style={styles.keyInput}
                          />
                        </div>
                      </div>

                      <div style={{ ...styles.settingToggleRow, marginTop: '12px' }}>
                        <div>
                          <div style={styles.settingTitle}>Force Android APK Update on All Devices</div>
                          <div style={styles.settingSub}>
                            Require players to install the latest APK build ({securityPolicy.apk_latest_version})
                          </div>
                        </div>
                        <div
                          onClick={() =>
                            handleSaveSecurityPolicy({
                              ...securityPolicy,
                              apk_force_update: !securityPolicy.apk_force_update
                            })
                          }
                          style={{
                            ...styles.switchPill,
                            background: securityPolicy.apk_force_update ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                          }}
                        >
                          <div
                            style={{
                              ...styles.switchKnob,
                              transform: securityPolicy.apk_force_update ? 'translateX(20px)' : 'translateX(0)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginTop: '12px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>REQUIRED APK VERSION</label>
                          <input
                            type="text"
                            value={securityPolicy.apk_latest_version}
                            onChange={(e) =>
                              setSecurityPolicy({
                                ...securityPolicy,
                                apk_latest_version: e.target.value
                              })
                            }
                            placeholder="v2.4"
                            style={styles.keyInput}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>APK RELEASE NOTES / BANNER</label>
                          <input
                            type="text"
                            value={securityPolicy.apk_release_notes}
                            onChange={(e) =>
                              setSecurityPolicy({
                                ...securityPolicy,
                                apk_release_notes: e.target.value
                              })
                            }
                            placeholder="True Web Sync + Heartbeat Online Status"
                            style={styles.keyInput}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveSecurityPolicy(securityPolicy)}
                        style={{ ...styles.submitBtn, marginTop: '16px' }}
                      >
                        🛡️ SAVE ENTERPRISE SECURITY &amp; APK POLICY
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 11. REFERRAL / INVITE CODE ENGINE (OWNER & ADMIN) */}
            {activeTab === 'referrals' && (
              <div className="sg-view-container" style={styles.viewContainer}>
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Invite Codes</h2>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.cyanMiniBadge}>{isOwner ? 'OWNER' : 'ADMIN'}</span>
                  </div>
                </div>

                <div className="sg-dual-grid" style={styles.dualGrid}>
                  {/* Card 1: Generate Code */}
                  <div className="sg-management-card" style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff' }}>
                          🎟️
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Create Role Invite Code</h3>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleCreateReferral} className="sg-form-stack" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
                      <div className="sg-form-group" style={styles.formGroup}>
                        <label style={styles.formLabel}>TARGET USER ROLE</label>
                        <div className="sg-btn-choice-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', width: '100%' }}>
                          <button
                            type="button"
                            onClick={() => setRefTargetRole('reseller')}
                            style={{
                              padding: '10px 8px',
                              borderRadius: '8px',
                              border: refTargetRole === 'reseller' ? '1.5px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                              background: refTargetRole === 'reseller' ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refTargetRole === 'reseller' ? '#00d9ff' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            💼 RESELLER
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => setRefTargetRole('admin')}
                              style={{
                                padding: '10px 8px',
                                borderRadius: '8px',
                                border: refTargetRole === 'admin' ? '1.5px solid #05df72' : '1px solid rgba(255,255,255,0.08)',
                                background: refTargetRole === 'admin' ? 'rgba(5, 223, 114, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                                color: refTargetRole === 'admin' ? '#05df72' : '#94a3b8',
                                fontWeight: 800,
                                fontSize: '11.5px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                whiteSpace: 'nowrap'
                              }}
                              title="Create Administrator invite code"
                            >
                              🛡️ ADMINISTRATOR
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="sg-form-group" style={styles.formGroup}>
                        <label style={styles.formLabel}>RESELLER / ROLE SUBSCRIPTION VALIDITY</label>
                        <div className="sg-btn-choice-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', width: '100%' }}>
                          <button
                            type="button"
                            onClick={() => setRefSubDays(30)}
                            style={{
                              padding: '10px 8px',
                              borderRadius: '8px',
                              border: refSubDays === 30 ? '1.5px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                              background: refSubDays === 30 ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refSubDays === 30 ? '#00d9ff' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ⏳ 30 DAYS
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefSubDays(60)}
                            style={{
                              padding: '10px 8px',
                              borderRadius: '8px',
                              border: refSubDays === 60 ? '1.5px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                              background: refSubDays === 60 ? 'rgba(168, 85, 247, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refSubDays === 60 ? '#c084fc' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            💎 60 DAYS
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          Account expires automatically after {refSubDays} days unless renewed by Owner/Admin.
                        </div>
                      </div>

                      <div className="sg-form-group" style={styles.formGroup}>
                        <label style={styles.formLabel}>STARTING WALLET BALANCE (₹ INR)</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={refInitialBal}
                          onChange={(e) => setRefInitialBal(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g. 5000 (Credits to wallet upon signup)"
                          style={styles.keyInput}
                        />
                        <div style={{ fontSize: '11px', color: isOwner ? '#fde047' : '#38bdf8', marginTop: '4px', fontWeight: 600 }}>
                          {isOwner
                            ? '👑 Owner Privilege: Starting balance is minted for FREE (₹0 deducted).'
                            : `💳 Admin Wallet Notice: ₹${((Number(refInitialBal) || 0) * refMaxUses).toLocaleString('en-IN')} will be deducted from your wallet (${refMaxUses} use × ₹${(Number(refInitialBal) || 0).toLocaleString('en-IN')}).`}
                        </div>
                      </div>

                      <div className="sg-form-group" style={styles.formGroup}>
                        <label style={styles.formLabel}>CUSTOM CODE (OPTIONAL)</label>
                        <input
                          type="text"
                          value={refCustomCode}
                          onChange={(e) => setRefCustomCode(e.target.value.toUpperCase())}
                          placeholder="e.g. RYMON-RESELLER-VIP (Blank for auto)"
                          style={styles.keyInput}
                        />
                      </div>

                      <div className="sg-form-group" style={styles.formGroup}>
                        <label style={styles.formLabel}>MAX USES / REDEMPTIONS</label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={refMaxUses}
                          onChange={(e) => setRefMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                          style={styles.keyInput}
                          required
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          Each use creates 1 unique real account. Recommended: 1 use per person.
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={refCreating}
                        style={{ ...styles.submitBtn, marginTop: '16px' }}
                      >
                        {refCreating ? 'CREATING INVITE CODE...' : `🎟️ GENERATE ${refSubDays}D INVITE CODE`}
                      </button>
                    </form>
                  </div>

                  {/* Card 2: Active Codes Table */}
                  <div className="sg-management-card" style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Active Referral Codes ({referralList.length})</h3>
                        </div>
                        <button
                          onClick={() => fetchReferralCodes(currentUser).then(setReferralList)}
                          style={{ ...styles.chipBtn, fontSize: '11px' }}
                        >
                          🔄 Refresh
                        </button>
                      </div>
                    </div>

                    <div className="sg-table-card" style={{ marginTop: '16px', overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                      <table className="sg-data-table" style={styles.dataTable}>
                        <thead>
                          <tr>
                            <th style={styles.th}>INVITE CODE</th>
                            <th style={styles.th}>ROLE & SUB</th>
                            <th style={styles.th}>STARTING BAL</th>
                            <th style={styles.th}>USES</th>
                            <th style={styles.th}>STATUS</th>
                            <th style={styles.th}>ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referralList.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '30px' }}>
                                No active invite codes. Generate one on the left to onboard real staff.
                              </td>
                            </tr>
                          ) : (
                            referralList.map((ref) => (
                              <tr key={ref.id} style={styles.tr}>
                                <td style={styles.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#00d9ff', fontSize: '13px' }}>
                                      {ref.code}
                                    </span>
                                    <button
                                      onClick={() => handleCopyReferral(ref.code)}
                                      style={styles.miniCopyBtn}
                                      title="Copy code"
                                    >
                                      {copiedRefCode === ref.code ? '✓' : '📋'}
                                    </button>
                                  </div>
                                </td>
                                <td style={styles.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{
                                      ...styles.planBadge,
                                      background: ref.target_role === 'admin' ? 'rgba(5, 223, 114, 0.15)' : 'rgba(0, 217, 255, 0.15)',
                                      color: ref.target_role === 'admin' ? '#05df72' : '#00d9ff'
                                    }}>
                                      {ref.target_role.toUpperCase()}
                                    </span>
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      padding: '2px 6px',
                                      borderRadius: '6px',
                                      background: ref.subscription_days === 60 ? 'rgba(168, 85, 247, 0.2)' : 'rgba(0, 217, 255, 0.15)',
                                      color: ref.subscription_days === 60 ? '#c084fc' : '#38bdf8',
                                      border: ref.subscription_days === 60 ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(0, 217, 255, 0.3)'
                                    }}>
                                      {ref.subscription_days === 60 ? '60D SUB' : '30D SUB'}
                                    </span>
                                  </div>
                                </td>
                                <td style={styles.td}>
                                  <span style={{ color: '#05df72', fontWeight: 700 }}>
                                    ₹{ref.initial_balance.toLocaleString('en-IN')}
                                  </span>
                                </td>
                                <td style={styles.td}>
                                  <span style={{ color: '#cbd5e1', fontSize: '12px' }}>
                                    {ref.times_used} / {ref.max_uses}
                                  </span>
                                </td>
                                <td style={styles.td}>
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: ref.is_active ? '#05df72' : '#ef4444'
                                  }}>
                                    ● {ref.is_active ? 'ACTIVE' : 'DEPLETED'}
                                  </span>
                                </td>
                                <td style={styles.td}>
                                  <button
                                    onClick={() => handleDeleteReferral(ref.id, ref.code)}
                                    style={{ ...styles.actionIconBtn, color: '#ef4444' }}
                                    title="Revoke / Delete Code"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(0, 217, 255, 0.05)', border: '1px solid rgba(0, 217, 255, 0.15)', borderRadius: '10px', fontSize: '12px', color: '#94a3b8' }}>
                      💡 <strong style={{ color: '#00d9ff' }}>How New Staff Onboard:</strong> Give this invite code to your reseller or admin. When they open this site, they click <strong>"Register with Invite Code"</strong> on the login screen, enter their own desired username, password, email, and the invite code. Their account is created immediately with a <strong>30-Day or 60-Day subscription</strong> and starting wallet balance!
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connect-api' && isOwner && (() => {
              const isCustomTypeMode = connectSelectedApp === 'Custom' || connectSelectedApp === '__CUSTOM__';
              const effectiveConnectAppName = isCustomTypeMode ? (connectCustomAppName.trim() || 'Tool X') : (connectSelectedApp || 'Free Fire MAX');
              const getAppSecret = (appName: string): string => {
                if (appName === 'Free Fire MAX') return 'ff_max_sec_7a8b9c1d2e3f405162738495a6b7c8d9e0f1';
                let hash1 = 0x811c9dc5;
                let hash2 = 0x55555555;
                for (let i = 0; i < appName.length; i++) {
                  hash1 ^= appName.charCodeAt(i);
                  hash1 = (hash1 * 0x01000193) >>> 0;
                  hash2 = (hash2 * 33 + appName.charCodeAt(i)) >>> 0;
                }
                const part1 = hash1.toString(16).padStart(8, '0');
                const part2 = hash2.toString(16).padStart(8, '0');
                return (part1 + part2 + '1e584eab26bac5030d2a5fbfec013059afac1d348431d892632d8961').substring(0, 48);
              };
              const currentSecret = getAppSecret(effectiveConnectAppName);
              const ownerUsername = currentUser?.username || 'debajoyti';

              // Code snippets
              const cppSnippet = `/*
 * Safe Streamer - KeyAuth C++ Client (Drop-in Header & Example)
 * Application: ${effectiveConnectAppName}
 * Owner ID:    ${ownerUsername}
 * Gateway:     https://greenvest.shop/connect
 */

#include <iostream>
#include <string>
#include <curl/curl.h>

namespace KeyAuth {
    struct Response {
        bool success = false;
        std::string message;
        std::string expiry;
    };

    class Api {
    private:
        std::string name;
        std::string ownerid;
        std::string secret;
        std::string version;
        std::string gateway = "https://greenvest.shop/connect";

        static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
            ((std::string*)userp)->append((char*)contents, size * nmemb);
            return size * nmemb;
        }

    public:
        Response response;

        Api(std::string name, std::string ownerid, std::string secret, std::string version)
            : name(name), ownerid(ownerid), secret(secret), version(version) {}

        void init() {
            // Gateway connection initialized
        }

        void license(const std::string& key, const std::string& hwid = "DEVICE-SIM-ANDROID-9981") {
            CURL* curl = curl_easy_init();
            if (!curl) {
                response.success = false;
                response.message = "Failed to initialize CURL";
                return;
            }

            std::string resStr;
            std::string jsonBody = "{\\"user_key\\":\\"" + key + "\\",\\"serial\\":\\"" + hwid + "\\",\\"app\\":\\"" + name + "\\"}";

            struct curl_slist* headers = NULL;
            headers = curl_slist_append(headers, "Content-Type: application/json");

            curl_easy_setopt(curl, CURLOPT_URL, gateway.c_str());
            curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonBody.c_str());
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &resStr);
            curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);

            CURLcode res = curl_easy_perform(curl);
            curl_slist_free_all(headers);
            curl_easy_cleanup(curl);

            if (res == CURLE_OK && resStr.find("\\"status\\":true") != std::string::npos) {
                response.success = true;
                response.message = "Authenticated successfully!";
            } else {
                response.success = false;
                response.message = resStr;
            }
        }
    };
}

// =================== USAGE IN YOUR APK / DAEMON ===================
int main() {
    // 1. Initialize with your App Credentials
    KeyAuth::Api KeyAuthApp(
        "${effectiveConnectAppName}",
        "${ownerUsername}",
        "${currentSecret}",
        "1.0"
    );

    KeyAuthApp.init();

    // 2. Authenticate User Key
    KeyAuthApp.license("YOUR_LICENSE_KEY", "DEVICE_HWID");

    if (KeyAuthApp.response.success) {
        std::cout << "[+] Access Granted to ${effectiveConnectAppName}!\\n";
        // Launch your cheat / mod menu here
    } else {
        std::cout << "[-] Access Denied: " << KeyAuthApp.response.message << "\\n";
        exit(0);
    }
    return 0;
}`;

              const javaSnippet = `// Safe Streamer - KeyAuth Android Java Client
package com.rymon.keyauth;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class KeyAuth {
    public String name;
    public String ownerid;
    public String secret;
    public String version;
    private String gatewayUrl = "https://greenvest.shop/connect";

    public static class ResponseData {
        public boolean success;
        public String message;
        public String expiresAt;
    }

    public ResponseData response = new ResponseData();

    public KeyAuth(String name, String ownerid, String secret, String version) {
        this.name = name;
        this.ownerid = ownerid;
        this.secret = secret;
        this.version = version;
    }

    public void init() {
        // Ready for auth
    }

    public boolean license(String key, String hwid) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("user_key", key);
            body.put("serial", hwid);
            body.put("app", this.name);

            URL url = new URL(gatewayUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(12000);
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            BufferedReader br = new BufferedReader(new InputStreamReader(
                conn.getResponseCode() >= 200 && conn.getResponseCode() < 300
                    ? conn.getInputStream() : conn.getErrorStream()
            ));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);

            JSONObject res = new JSONObject(sb.toString());
            boolean ok = res.optBoolean("status", false) || res.optBoolean("valid", false);
            response.success = ok;
            response.message = ok ? "Login Successful" : res.optString("reason", "Login Failed");
            response.expiresAt = res.optString("expires_at", "");
            return response.success;
        } catch (Exception e) {
            response.success = false;
            response.message = e.getMessage();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

// =================== USAGE IN YOUR ANDROID ACTIVITY ===================
/*
KeyAuth KeyAuthApp = new KeyAuth(
    "${effectiveConnectAppName}",
    "${ownerUsername}",
    "${currentSecret}",
    "1.0"
);

KeyAuthApp.init();

boolean isAuth = KeyAuthApp.license(userKey, deviceHwid);
if (isAuth) {
    Toast.makeText(this, "Access Granted to ${effectiveConnectAppName}!", Toast.LENGTH_SHORT).show();
    startActivity(new Intent(this, MainActivity.class));
} else {
    Toast.makeText(this, "Denied: " + KeyAuthApp.response.message, Toast.LENGTH_LONG).show();
    finish();
}
*/`;

              const pythonSnippet = `# Safe Streamer - KeyAuth Python Client
import requests

class KeyAuth:
    def __init__(self, name, ownerid, secret, version):
        self.name = name
        self.ownerid = ownerid
        self.secret = secret
        self.version = version
        self.gateway = "https://greenvest.shop/connect"

    def license(self, key, hwid="PC_DEFAULT_HWID"):
        payload = {
            "user_key": key,
            "serial": hwid,
            "app": self.name
        }
        r = requests.post(self.gateway, json=payload, timeout=10)
        return r.json()

# 1. Initialize KeyAuth Client
KeyAuthApp = KeyAuth(
    name="${effectiveConnectAppName}",
    ownerid="${ownerUsername}",
    secret="${currentSecret}",
    version="1.0"
)

# 2. Authenticate Key
res = KeyAuthApp.license("YOUR_LICENSE_KEY", "DEVICE_HWID")
print("KeyAuth Response:", res)
if res.get("status"):
    print("[+] Successfully Authenticated to ${effectiveConnectAppName}!")
else:
    print("[-] Access Denied:", res.get("reason"))`;

              const curlSnippet = `curl -X POST "https://greenvest.shop/connect" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_key": "YOUR_LICENSE_KEY",
    "serial": "DEVICE_HWID_OR_ANDROID_ID",
    "app": "${effectiveConnectAppName}"
  }'`;

              return (
                <div className="sg-view-container" style={styles.viewContainer}>
                  {/* Top Header */}
                  <div className="sg-banner-row" style={styles.bannerRow}>
                    <div>
                      <h2 style={styles.pageTitle}>KeyAuth Connect &amp; SDK</h2>
                    </div>
                    <div style={styles.badgeCluster}>
                      <span style={{ ...styles.cyanMiniBadge, background: 'rgba(5, 223, 114, 0.15)', color: '#05df72', border: '1px solid rgba(5, 223, 114, 0.4)' }}>ROOT OWNER</span>
                    </div>
                  </div>

                  {/* 1. Target Application Selector & Live Credentials Card */}
                  <div className="sg-management-card" style={{ ...styles.managementCard, marginBottom: '24px', border: '1px solid rgba(0, 217, 255, 0.35)', background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(7, 9, 14, 0.95) 100%)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(0, 217, 255, 0.2)', color: '#00d9ff', fontSize: '18px' }}>
                          🔑
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc', fontWeight: 800 }}>
                            KeyAuth Application Credentials
                          </h3>
                        </div>
                      </div>

                      {/* App Switcher Buttons */}
                      <div style={{ display: 'flex', gap: '8px', background: 'rgba(3, 7, 18, 0.7)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setConnectSelectedApp('Free Fire MAX')
                            localStorage.setItem('rymon_connect_selected_app', 'Free Fire MAX')
                          }}
                          style={{
                            ...styles.chipBtn,
                            background: connectSelectedApp.toLowerCase() === 'free fire max' ? 'linear-gradient(135deg, #05df72 0%, #047857 100%)' : 'transparent',
                            color: connectSelectedApp.toLowerCase() === 'free fire max' ? '#07090e' : '#cbd5e1',
                            border: 'none',
                            fontWeight: 800,
                            padding: '6px 14px'
                          }}
                        >
                          🎮 Free Fire MAX
                        </button>

                        {registeredApps
                          .filter((a) => a && a.name && a.name.trim().toLowerCase() !== 'free fire max')
                          .map((app) => {
                            const isSelected = connectSelectedApp.toLowerCase() === app.name.toLowerCase();
                            return (
                              <button
                                key={app.id || app.name}
                                type="button"
                                onClick={() => {
                                  setConnectSelectedApp(app.name)
                                  localStorage.setItem('rymon_connect_selected_app', app.name)
                                }}
                                style={{
                                  ...styles.chipBtn,
                                  background: isSelected ? 'linear-gradient(135deg, #00d9ff 0%, #0284c7 100%)' : 'transparent',
                                  color: isSelected ? '#07090e' : '#cbd5e1',
                                  border: 'none',
                                  fontWeight: 800,
                                  padding: '6px 14px'
                                }}
                              >
                                {app.icon || '🎮'} {app.name}
                              </button>
                            );
                          })}

                        <button
                          type="button"
                          onClick={() => {
                            setConnectSelectedApp('Custom')
                            localStorage.setItem('rymon_connect_selected_app', 'Custom')
                          }}
                          style={{
                            ...styles.chipBtn,
                            background: connectSelectedApp === 'Custom' ? 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' : 'transparent',
                            color: connectSelectedApp === 'Custom' ? '#ffffff' : '#cbd5e1',
                            border: 'none',
                            fontWeight: 800,
                            padding: '6px 14px'
                          }}
                        >
                          ➕ Type New Custom App...
                        </button>
                      </div>
                    </div>

                    {/* Owner Action: Remove Registered App if currently selected */}
                    {isOwner && connectSelectedApp.toLowerCase() !== 'free fire max' && connectSelectedApp !== 'Custom' && (
                      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          Target Application: <strong style={{ color: '#00d9ff' }}>{connectSelectedApp}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const targetApp = registeredApps.find((a) => (a?.name || '').toLowerCase() === connectSelectedApp.toLowerCase())
                            if (targetApp) {
                              await handleDeleteApp(targetApp)
                            } else {
                              if (window.confirm(`Are you sure you want to remove "${connectSelectedApp}" from registered applications?`)) {
                                const updated = await deleteRegisteredApp(connectSelectedApp)
                                setRegisteredApps(updated)
                                setConnectSelectedApp('Free Fire MAX')
                                localStorage.setItem('rymon_connect_selected_app', 'Free Fire MAX')
                                showToast(`Removed "${connectSelectedApp}"`)
                              }
                            }
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#ef4444',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Owner Action: Delete this registered app"
                        >
                          🗑️ Remove &quot;{connectSelectedApp}&quot;
                        </button>
                      </div>
                    )}

                    {/* Custom App Name Input Row (Shown when Custom is selected) */}
                    {connectSelectedApp === 'Custom' && (
                      <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(0, 217, 255, 0.08)', borderRadius: '10px', border: '1px solid rgba(0, 217, 255, 0.3)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#00d9ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          CUSTOM APP NAME:
                        </div>
                        <input
                          type="text"
                          value={connectCustomAppName}
                          onChange={(e) => setConnectCustomAppName(e.target.value)}
                          placeholder="e.g. Tool X, VIP Injector, BGMI Mod, Private Tool"
                          style={{
                            ...styles.keyInput,
                            flex: 1,
                            minWidth: '220px',
                            background: '#04060a',
                            border: '1px solid #00d9ff',
                            color: '#f8fafc',
                            fontWeight: 700
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const trimmed = connectCustomAppName.trim()
                            if (!trimmed) {
                              showToast('Please type an app name first.')
                              return
                            }
                            try {
                              const updated = await addRegisteredApp({
                                name: trimmed,
                                platform: 'Android Mobile',
                                icon: '🎮',
                                description: 'Pure KeyAuth Mobile Application'
                              })
                              setRegisteredApps(updated)
                              setConnectSelectedApp(trimmed)
                              localStorage.setItem('rymon_connect_selected_app', trimmed)
                              showToast(`Successfully registered "${trimmed}"!`)
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : 'Failed to register app'
                              showToast(msg)
                            }
                          }}
                          style={{
                            ...styles.chipBtn,
                            background: '#00d9ff',
                            color: '#07090e',
                            fontWeight: 800,
                            padding: '6px 14px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          💾 Save App
                        </button>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          💡 Pure KeyAuth Only (HWID lock &amp; license validation, no streamer remote panel)
                        </span>
                      </div>
                    )}

                    {/* 4 Credential Mini Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginTop: '16px' }}>
                      {/* Name */}
                      <div style={{ background: 'rgba(7, 9, 14, 0.85)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                          APPLICATION NAME (<code>name</code>)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#05df72', fontWeight: 700 }}>
                            "{effectiveConnectAppName}"
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(effectiveConnectAppName);
                              showToast('Copied App Name');
                            }}
                            style={styles.miniCopyBtn}
                            title="Copy Name"
                          >
                            📋
                          </button>
                        </div>
                      </div>

                      {/* Owner ID */}
                      <div style={{ background: 'rgba(7, 9, 14, 0.85)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                          OWNER ID (<code>ownerid</code>)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#00d9ff', fontWeight: 700 }}>
                            "{ownerUsername}"
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(ownerUsername);
                              showToast('Copied Owner ID');
                            }}
                            style={styles.miniCopyBtn}
                            title="Copy Owner ID"
                          >
                            📋
                          </button>
                        </div>
                      </div>

                      {/* App Secret */}
                      <div style={{ background: 'rgba(7, 9, 14, 0.85)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                          APP SECRET (<code>secret</code>)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ffb700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={currentSecret}>
                            {currentSecret.substring(0, 16)}...
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(currentSecret);
                              showToast('Copied App Secret');
                            }}
                            style={styles.miniCopyBtn}
                            title="Copy Secret"
                          >
                            📋
                          </button>
                        </div>
                      </div>

                      {/* Version & Gateway */}
                      <div style={{ background: 'rgba(7, 9, 14, 0.85)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                          VERSION &amp; GATEWAY
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1' }}>
                            "1.0" · greenvest.shop
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('https://greenvest.shop/connect');
                              showToast('Copied Gateway URL');
                            }}
                            style={styles.miniCopyBtn}
                            title="Copy Gateway URL"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Copy KeyAuth::Api(...) One-Liner Box */}
                    <div style={{ marginTop: '16px', background: '#04060a', border: '1px solid rgba(5, 223, 114, 0.3)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                        <span style={{ fontSize: '14px' }}>⚡</span>
                        <code style={{ fontFamily: 'Consolas, monospace', fontSize: '12.5px', color: '#05df72', wordBreak: 'break-all' }}>
                          KeyAuth::Api("{effectiveConnectAppName}", "{ownerUsername}", "{currentSecret.substring(0, 16)}...", "1.0");
                        </code>
                      </div>
                      <button
                        onClick={() => {
                          const code = `KeyAuth::Api(\n    "${effectiveConnectAppName}",\n    "${ownerUsername}",\n    "${currentSecret}",\n    "1.0"\n);`;
                          navigator.clipboard.writeText(code);
                          showToast('Copied KeyAuth::Api(...) Initialization Code!');
                        }}
                        style={{
                          ...styles.chipBtn,
                          background: 'linear-gradient(135deg, #05df72 0%, #047857 100%)',
                          color: '#07090e',
                          fontWeight: 800,
                          fontSize: '11.5px',
                          padding: '6px 14px',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        📋 Copy KeyAuth::Api(...) Block
                      </button>
                    </div>
                  </div>

                  {/* 2. Visual "Why Custom is Different" Comparison Explainer Banner */}
                  <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                    {/* Free Fire MAX Card */}
                    <div style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: effectiveConnectAppName.toLowerCase() === 'free fire max' ? 'rgba(5, 223, 114, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                      border: effectiveConnectAppName.toLowerCase() === 'free fire max' ? '1px solid rgba(5, 223, 114, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#05df72', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          🎮 Free Fire MAX Mode
                        </div>
                        <span style={{ fontSize: '10.5px', background: 'rgba(5, 223, 114, 0.15)', color: '#05df72', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          STREAMER REMOTE + KEYAUTH
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                        • <strong>KeyAuth Licensing:</strong> HWID lock, expiration time, pause/resume.<br />
                        • <strong>Streamer Remote Control:</strong> Live web ESP toggle, box, skeleton, aimbot FOV slider, crosshair, spectator auto-hide.<br />
                        • <strong>Strict Isolation:</strong> Keys minted for Free Fire MAX will ONLY log in to Free Fire MAX.
                      </div>
                    </div>

                    {/* Custom Application Card */}
                    <div style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: effectiveConnectAppName.toLowerCase() !== 'free fire max' ? 'rgba(0, 217, 255, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                      border: effectiveConnectAppName.toLowerCase() !== 'free fire max' ? '1px solid rgba(0, 217, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#00d9ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          ⚙️ Custom Application Mode ({effectiveConnectAppName})
                        </div>
                        <span style={{ fontSize: '10.5px', background: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          PURE KEYAUTH ONLY
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                        • <strong>Pure KeyAuth Licensing:</strong> Device HWID lock, expiration check, instant freeze from dashboard.<br />
                        • <strong>Zero Streamer Overhead:</strong> Streamer controls and ESP panels are completely bypassed and excluded.<br />
                        • <strong>Strict App Isolation:</strong> Keys generated for <em>{effectiveConnectAppName}</em> will fail if used in Free Fire MAX or any other app!
                      </div>
                    </div>
                  </div>

                  {/* 3. Main Two-Column Layout: Drop-in Code & Test Sandbox */}
                  <div className="sg-dual-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
                    {/* Left Column: Drop-in KeyAuth Client Code */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="sg-management-card" style={styles.managementCard}>
                        <div style={styles.cardHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ ...styles.actionIconCircle, background: 'rgba(5, 223, 114, 0.15)', color: '#05df72' }}>
                              💻
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                                Drop-in KeyAuth Client Classes ({effectiveConnectAppName})
                              </h3>
                              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                                Ready-to-compile client classes with <code>KeyAuth::Api</code> and <code>KeyAuth.license()</code>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Code Snippet Tabs */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setCodeSnippetTab('cpp')}
                            style={{
                              ...styles.chipBtn,
                              background: codeSnippetTab === 'cpp' ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: codeSnippetTab === 'cpp' ? '#00d9ff' : '#94a3b8',
                              border: codeSnippetTab === 'cpp' ? '1px solid #00d9ff' : '1px solid rgba(255, 255, 255, 0.08)',
                              fontWeight: 700
                            }}
                          >
                            ⚡ C / C++ (Android JNI &amp; Daemon)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCodeSnippetTab('java')}
                            style={{
                              ...styles.chipBtn,
                              background: codeSnippetTab === 'java' ? 'rgba(5, 223, 114, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: codeSnippetTab === 'java' ? '#05df72' : '#94a3b8',
                              border: codeSnippetTab === 'java' ? '1px solid #05df72' : '1px solid rgba(255, 255, 255, 0.08)',
                              fontWeight: 700
                            }}
                          >
                            📱 Android (Java / Kotlin APK)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCodeSnippetTab('python')}
                            style={{
                              ...styles.chipBtn,
                              background: codeSnippetTab === 'python' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: codeSnippetTab === 'python' ? '#c084fc' : '#94a3b8',
                              border: codeSnippetTab === 'python' ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.08)',
                              fontWeight: 700
                            }}
                          >
                            🐍 Python
                          </button>
                          <button
                            type="button"
                            onClick={() => setCodeSnippetTab('curl')}
                            style={{
                              ...styles.chipBtn,
                              background: codeSnippetTab === 'curl' ? 'rgba(255, 183, 0, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: codeSnippetTab === 'curl' ? '#ffb700' : '#94a3b8',
                              border: codeSnippetTab === 'curl' ? '1px solid #ffb700' : '1px solid rgba(255, 255, 255, 0.08)',
                              fontWeight: 700
                            }}
                          >
                            🌐 cURL / REST
                          </button>
                        </div>

                        {/* Snippet Code Container */}
                        <div style={{ marginTop: '12px', position: 'relative' }}>
                          <button
                            onClick={() => {
                              let textToCopy = cppSnippet;
                              if (codeSnippetTab === 'java') textToCopy = javaSnippet;
                              else if (codeSnippetTab === 'python') textToCopy = pythonSnippet;
                              else if (codeSnippetTab === 'curl') textToCopy = curlSnippet;
                              navigator.clipboard.writeText(textToCopy);
                              showToast(`Copied ${codeSnippetTab.toUpperCase()} KeyAuth Code`);
                            }}
                            style={{
                              position: 'absolute',
                              top: '10px',
                              right: '10px',
                              background: 'rgba(15, 23, 42, 0.9)',
                              border: '1px solid rgba(0, 217, 255, 0.4)',
                              borderRadius: '6px',
                              color: '#00d9ff',
                              fontSize: '11px',
                              padding: '5px 12px',
                              cursor: 'pointer',
                              fontWeight: 700,
                              zIndex: 2
                            }}
                          >
                            📋 Copy Code
                          </button>

                          <pre style={{
                            background: '#04060a',
                            border: '1px solid rgba(30, 41, 59, 0.8)',
                            borderRadius: '10px',
                            padding: '16px',
                            fontSize: '11.5px',
                            fontFamily: 'Consolas, monospace',
                            color: '#cbd5e1',
                            overflowX: 'auto',
                            lineHeight: '1.5',
                            maxHeight: '440px'
                          }}>
                            {codeSnippetTab === 'cpp' && cppSnippet}
                            {codeSnippetTab === 'java' && javaSnippet}
                            {codeSnippetTab === 'python' && pythonSnippet}
                            {codeSnippetTab === 'curl' && curlSnippet}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Live KeyAuth Test Sandbox */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="sg-management-card" style={styles.managementCard}>
                        <div style={styles.cardHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ ...styles.actionIconCircle, background: 'rgba(255, 183, 0, 0.15)', color: '#ffb700' }}>
                              🧪
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                                Live KeyAuth Verification Sandbox
                              </h3>
                              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                                Test <code>KeyAuth.license()</code> live against edge gateway for <strong>{effectiveConnectAppName}</strong>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                          {/* Active App Target Indicator */}
                          <div style={{ padding: '8px 12px', background: 'rgba(0, 217, 255, 0.08)', borderRadius: '8px', border: '1px solid rgba(0, 217, 255, 0.25)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>TARGET APP:</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00d9ff', fontWeight: 700 }}>
                              {effectiveConnectAppName}
                            </span>
                          </div>

                          {/* Key Input */}
                          <div style={styles.formGroup}>
                            <label style={styles.formLabel}>LICENSE KEY TO TEST</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                value={testConnectKey}
                                onChange={(e) => setTestConnectKey(e.target.value.toUpperCase())}
                                placeholder="Enter key e.g. RYMON-FF-XXXX-XXXX"
                                style={{ ...styles.keyInput, flex: 1 }}
                              />
                              {keysList.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const matching = keysList.find(k =>
                                      effectiveConnectAppName.toLowerCase() === 'free fire max'
                                        ? String(k?.game || '').toLowerCase().includes('free fire')
                                        : String(k?.game || '').toLowerCase() === effectiveConnectAppName.toLowerCase()
                                    );
                                    const keyToPick = matching || keysList[0];
                                    setTestConnectKey(keyToPick.license_key);
                                    showToast(`Picked key (${keyToPick.game}): ${keyToPick.license_key.substring(0, 10)}...`);
                                  }}
                                  style={{ ...styles.chipBtn, fontSize: '11px', whiteSpace: 'nowrap' }}
                                  title="Pick key matching current app selection"
                                >
                                  Pick Key
                                </button>
                              )}
                            </div>
                          </div>

                          {/* HWID Input */}
                          <div style={styles.formGroup}>
                            <label style={styles.formLabel}>DEVICE HARDWARE ID (HWID / SERIAL)</label>
                            <input
                              type="text"
                              value={testConnectHwid}
                              onChange={(e) => setTestConnectHwid(e.target.value)}
                              placeholder="e.g. DEVICE-SIM-ANDROID-9981"
                              style={styles.keyInput}
                            />
                          </div>

                          {/* Submit Test Button */}
                          <button
                            type="button"
                            onClick={handleTestConnectApi}
                            disabled={testConnectLoading}
                            style={{
                              ...styles.submitBtn,
                              marginTop: '8px',
                              background: 'linear-gradient(135deg, #05df72 0%, #047857 100%)',
                              color: '#07090e',
                              fontWeight: 800
                            }}
                          >
                            {testConnectLoading ? 'CONNECTING & VERIFYING...' : `🚀 TEST KEYAUTH LOGIN (${effectiveConnectAppName})`}
                          </button>

                          {/* Live Response Terminal */}
                          <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '6px' }}>
                              LIVE KEYAUTH RESPONSE TERMINAL:
                            </div>
                            <div style={{
                              background: '#04060a',
                              border: '1px solid rgba(0, 217, 255, 0.3)',
                              borderRadius: '8px',
                              padding: '14px',
                              fontFamily: 'Consolas, monospace',
                              fontSize: '11.5px',
                              color: '#00d9ff',
                              minHeight: '140px',
                              maxHeight: '260px',
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap'
                            }}>
                              {testConnectResult || `// Select an app, enter your key, and click "TEST KEYAUTH LOGIN" to simulate APK verification...`}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Protocol Contract Card */}
                      <div style={{ padding: '16px 18px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '12px' }}>
                        <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: '8px', fontSize: '13px' }}>
                          📋 Gateway Request &amp; Response Contract
                        </div>
                        <div style={{ color: '#94a3b8', lineHeight: '1.7' }}>
                          • <strong>Gateway URL:</strong> <code>https://greenvest.shop/connect</code> (Cloudflare Edge Proxy)<br />
                          • <strong>Required Header:</strong> <code>Content-Type: application/json</code> (Zero secret API keys required in APK!)<br />
                          • <strong>Request Body:</strong> <code>{`{"user_key": "...", "serial": "...", "app": "${effectiveConnectAppName}"}`}</code><br />
                          • <strong>Response Fields:</strong><br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<code>status</code> (boolean): Key authenticity &amp; device match<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<code>is_paused</code> (boolean): Reseller pause status<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<code>expires_at</code> (ISO 8601 string): Exact expiration timestamp<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<code>game / app</code> (string): Target game/app name<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<code>reason</code> (string): Error reason if rejected (e.g. <em>App Mismatch!</em>)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}            {/* 12B. APP MANAGER (MULTI-APP ECOSYSTEM & PURE KEYAUTH) */}
            {activeTab === 'apps' && isRootOwner && (
              <div className="sg-view-container" style={styles.viewContainer}>
                {/* Header Banner */}
                <div className="sg-banner-row" style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Applications ({registeredApps.length})</h2>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="sg-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div className="sg-management-card" style={{ ...styles.managementCard, padding: '16px 20px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TOTAL CONFIGURED APPS
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#00d9ff', marginTop: '6px' }}>
                      {registeredApps.length}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                      1 Streamer Mod + {Math.max(0, registeredApps.length - 1)} Pure KeyAuth Apps
                    </div>
                  </div>

                  <div style={{ ...styles.managementCard, padding: '16px 20px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      FREE FIRE MAX STATUS
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#05df72', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔥 STREAMER REMOTE
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                      Dedicated ESP, Aimbot &amp; Telemetry Remote
                    </div>
                  </div>

                  <div style={{ ...styles.managementCard, padding: '16px 20px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      OTHER APPS MODE
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#fde047', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔑 PURE KEYAUTH
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                      Login, Device HWID Binding &amp; Expiry Only
                    </div>
                  </div>

                  <div style={{ ...styles.managementCard, padding: '16px 20px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      CONNECT GATEWAY
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#00d9ff', marginTop: '8px', wordBreak: 'break-all' }}>
                      greenvest.shop/connect
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://greenvest.shop/connect')
                        showToast('Copied https://greenvest.shop/connect to clipboard!')
                      }}
                      style={{ ...styles.chipBtn, fontSize: '11px', marginTop: '8px', padding: '4px 10px', width: 'fit-content' }}
                    >
                      📋 Copy Endpoint
                    </button>
                  </div>
                </div>

                {/* Main 2-Column Grid */}
                <div className="sg-dual-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px', alignItems: 'start' }}>
                  {/* Left Column: Configured Apps List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="sg-management-card" style={styles.managementCard}>
                      <div style={styles.cardHeader}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                            Configured Applications
                          </h3>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                        {registeredApps.map((app) => {
                          const isFf = String(app?.name || '').toLowerCase().includes('free fire')
                          const appKeys = keysList.filter((k) => (k.game || '').toLowerCase() === String(app?.name || '').toLowerCase())
                          const activeAppKeys = appKeys.filter((k) => k.status === 'ACTIVE').length

                          return (
                            <div
                              key={app.id}
                              style={{
                                padding: '16px 18px',
                                background: isFf ? 'rgba(5, 223, 114, 0.05)' : 'rgba(15, 23, 42, 0.7)',
                                border: isFf ? '1px solid rgba(5, 223, 114, 0.35)' : '1px solid rgba(51, 65, 85, 0.6)',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}
                            >
                              {/* Top Row: Info */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontSize: '28px' }}>{app.icon || (isFf ? '🔥' : '🔑')}</span>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                                        {app.name}
                                      </span>
                                      {isFf ? (
                                        <span style={{ ...styles.cyanMiniBadge, background: 'rgba(5, 223, 114, 0.15)', color: '#05df72', border: '1px solid rgba(5, 223, 114, 0.4)' }}>
                                          🔥 STREAMER REMOTE + KEYAUTH
                                        </span>
                                      ) : (
                                        <span style={{ ...styles.cyanMiniBadge, background: 'rgba(250, 204, 21, 0.15)', color: '#fde047', border: '1px solid rgba(250, 204, 21, 0.4)' }}>
                                          🔑 PURE KEYAUTH ONLY
                                        </span>
                                      )}
                                      <span style={{ fontSize: '11px', color: '#64748b', background: 'rgba(15, 23, 42, 0.9)', padding: '2px 8px', borderRadius: '4px' }}>
                                        {app.platform || 'Android Mobile'}
                                      </span>
                                    </div>
                                    {app.package_name && (
                                      <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                                        📦 Package: {app.package_name}
                                      </div>
                                    )}
                                    {app.description && (
                                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                        {app.description}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Key Counts */}
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#00d9ff' }}>
                                    {appKeys.length} {appKeys.length === 1 ? 'Key' : 'Keys'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#05df72' }}>
                                    {activeAppKeys} Active
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGenGame(app.name)
                                    setIsCustomAppMode(false)
                                    handleSelectTab('generate')
                                  }}
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #00d9ff 0%, #0284c7 100%)',
                                    color: '#07090e',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                  }}
                                >
                                  ⚡ Generate Key
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setKeyGameFilter(app.name)
                                    handleSelectTab('keys')
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: 'rgba(15, 23, 42, 0.8)',
                                    color: '#f8fafc',
                                    border: '1px solid rgba(51, 65, 85, 0.8)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                  }}
                                >
                                  🔑 View Keys ({appKeys.length})
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSnippetApp(app)
                                    showToast(`Viewing connect code for "${app.name}"`)
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: 'rgba(0, 217, 255, 0.1)',
                                    color: '#00d9ff',
                                    border: '1px solid rgba(0, 217, 255, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                  }}
                                >
                                  📋 Connect Code
                                </button>

                                {!isFf && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteApp(app)}
                                    disabled={appsLoading}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      color: '#ef4444',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      marginLeft: 'auto'
                                    }}
                                    title={`Delete ${app.name} from registered apps`}
                                  >
                                    🗑️ Remove App
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Register New Application & Rules */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Register New Application Card */}
                    <div className="sg-management-card" style={styles.managementCard}>
                      <div style={styles.cardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '22px' }}>➕</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                              Register New App / Game
                            </h3>
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                              Add any custom app name (Tool X, Private Mod, Custom App, etc.)
                            </div>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={handleAddNewApp} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>APPLICATION / GAME NAME *</label>
                          <input
                            type="text"
                            value={newAppName}
                            onChange={(e) => setNewAppName(e.target.value)}
                            placeholder="e.g. Tool X, Private Mod, Custom App..."
                            style={styles.keyInput}
                            required
                          />
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>PACKAGE IDENTIFIER (OPTIONAL)</label>
                          <input
                            type="text"
                            value={newAppPackage}
                            onChange={(e) => setNewAppPackage(e.target.value)}
                            placeholder="e.g. com.custom.mod or custom.tool.app"
                            style={styles.keyInput}
                          />
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>TARGET PLATFORM</label>
                          <select
                            value={newAppPlatform}
                            onChange={(e) => setNewAppPlatform(e.target.value)}
                            style={styles.selectInput}
                          >
                            <option value="Android Mobile (APK / SO)">Android Mobile (APK / SO)</option>
                            <option value="PC Windows x64 (EXE / DLL)">PC Windows x64 (EXE / DLL)</option>
                            <option value="iOS (IPA)">iOS (IPA)</option>
                            <option value="Cross-Platform / Script">Cross-Platform / Script</option>
                          </select>
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>APP ICON</label>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {['🔑', '🎮', '🎯', '🎖️', '⚡', '🛡️', '📦', '💻', '🔥'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => setNewAppIcon(emoji)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  fontSize: '18px',
                                  cursor: 'pointer',
                                  background: newAppIcon === emoji ? 'rgba(0, 217, 255, 0.25)' : 'rgba(15, 23, 42, 0.7)',
                                  border: newAppIcon === emoji ? '1px solid #00d9ff' : '1px solid rgba(51, 65, 85, 0.6)'
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>DESCRIPTION (OPTIONAL)</label>
                          <input
                            type="text"
                            value={newAppDesc}
                            onChange={(e) => setNewAppDesc(e.target.value)}
                            placeholder="e.g. Private Windows memory scanner & key gate"
                            style={styles.keyInput}
                          />
                        </div>

                        {appActionError && (
                          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', fontSize: '12px' }}>
                            ⚠️ {appActionError}
                          </div>
                        )}

                        {appActionSuccess && (
                          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(5, 223, 114, 0.15)', border: '1px solid #05df72', color: '#05df72', fontSize: '12px' }}>
                            ✅ {appActionSuccess}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={appsLoading}
                          style={{
                            ...styles.primaryActionBtn,
                            background: 'linear-gradient(135deg, #05df72 0%, #047857 100%)',
                            color: '#07090e',
                            fontWeight: 800,
                            padding: '12px 20px',
                            cursor: 'pointer'
                          }}
                        >
                          {appsLoading ? 'REGISTERING IN RYMON CLOUD...' : '➕ Register Application to Ecosystem'}
                        </button>
                      </form>
                    </div>

                    {/* Security & Isolation Summary Card */}
                    <div style={{ ...styles.managementCard, padding: '18px 20px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🛡️</span> Security &amp; Key Isolation Architecture
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.7' }}>
                        <p style={{ margin: '0 0 8px 0' }}>
                          • <strong>Strict Cross-App Isolation:</strong> If a key is issued for <strong>Free Fire MAX</strong>, any attempt to use it on <strong>Tool X</strong> or other apps will be rejected with an <em>App Mismatch</em> error.
                        </p>
                        <p style={{ margin: '0 0 8px 0' }}>
                          • <strong>Pure KeyAuth Architecture:</strong> Custom apps only perform license authentication, HWID lock, and expiration checks. Zero ESP, aimbot, or streamer remote overhead.
                        </p>
                        <p style={{ margin: '0' }}>
                          • <strong>Owner Role Restrictions:</strong> Owners can restrict whether Admins or Resellers are allowed to mint custom app keys, restrict maximum device bindings (anti-sharing), and control bulk batch limits.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Integration Code Generator Card */}
                <div className="sg-management-card" style={{ ...styles.managementCard, marginTop: '24px' }}>
                  <div style={styles.cardHeader}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                          Connect Gateway SDK &amp; Code Snippets
                        </h3>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                          Plug-and-play code snippets for <strong>{selectedSnippetApp?.name || 'Free Fire MAX'}</strong>. Drop into your project to authenticate keys in seconds.
                        </div>
                      </div>

                      {/* Language Tabs */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(['curl', 'java', 'cpp', 'csharp', 'python'] as const).map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setSnippetLanguage(lang)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              background: snippetLanguage === lang ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.8)',
                              border: snippetLanguage === lang ? '1px solid #00d9ff' : '1px solid rgba(51, 65, 85, 0.6)',
                              color: snippetLanguage === lang ? '#00d9ff' : '#94a3b8'
                            }}
                          >
                            {lang.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>
                        READY-TO-RUN CLIENT CODE ({snippetLanguage.toUpperCase()}):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const targetAppName = selectedSnippetApp?.name || 'Free Fire MAX'
                          let codeToCopy = ''
                          if (snippetLanguage === 'curl') {
                            codeToCopy = `curl -X POST https://greenvest.shop/connect \\\n  -H "Content-Type: application/json" \\\n  -d '{"user_key": "YOUR-LICENSE-KEY", "serial": "DEVICE-HWID", "app": "${targetAppName}"}'`
                          } else if (snippetLanguage === 'java') {
                            codeToCopy = `// Android Java KeyAuth snippet for ${targetAppName}\nJSONObject payload = new JSONObject();\npayload.put("user_key", licenseKey);\npayload.put("serial", deviceHwid);\npayload.put("app", "${targetAppName}");\n\nURL url = new URL("https://greenvest.shop/connect");\nHttpURLConnection conn = (HttpURLConnection) url.openConnection();\nconn.setRequestMethod("POST");\nconn.setRequestProperty("Content-Type", "application/json");\nconn.setDoOutput(true);\nconn.getOutputStream().write(payload.toString().getBytes("UTF-8"));\n\n// Read JSON response (status, success, data.EXP, data.status)`
                          } else if (snippetLanguage === 'cpp') {
                            codeToCopy = `// C++ Native libcurl snippet for ${targetAppName}\n#include <curl/curl.h>\n\nconst char* json = "{\\"user_key\\":\\"%s\\",\\"serial\\":\\"%s\\",\\"app\\":\\"${targetAppName}\\"}";\n// Send POST request to https://greenvest.shop/connect`
                          } else if (snippetLanguage === 'csharp') {
                            codeToCopy = `// C# Unity WebRequest for ${targetAppName}\nstring json = "{\\"user_key\\":\\"" + key + "\\",\\"serial\\":\\"" + hwid + "\\",\\"app\\":\\"${targetAppName}\\"}";\nUnityWebRequest req = UnityWebRequest.PostWwwForm("https://greenvest.shop/connect", json);\n// Check res.downloadHandler.text`
                          } else if (snippetLanguage === 'python') {
                            codeToCopy = `import requests\n\nres = requests.post("https://greenvest.shop/connect", json={\n    "user_key": "YOUR_KEY",\n    "serial": "DEVICE_HWID",\n    "app": "${targetAppName}"\n})\ndata = res.json()\nif data.get("success"):\n    print("Access Granted! Expiry:", data["data"]["EXP"])\nelse:\n    print("Access Denied:", data.get("reason"))`
                          }
                          navigator.clipboard.writeText(codeToCopy)
                          showToast(`Copied ${snippetLanguage.toUpperCase()} snippet for ${targetAppName}!`)
                        }}
                        style={{ ...styles.chipBtn, fontSize: '11px', padding: '4px 12px' }}
                      >
                        📋 Copy Code Snippet
                      </button>
                    </div>

                    <pre style={{
                      margin: 0,
                      padding: '16px',
                      background: '#04060a',
                      border: '1px solid rgba(0, 217, 255, 0.25)',
                      borderRadius: '8px',
                      fontFamily: 'Consolas, monospace',
                      fontSize: '12px',
                      color: '#00d9ff',
                      overflowX: 'auto',
                      lineHeight: '1.6'
                    }}>
                      {(() => {
                        const targetAppName = selectedSnippetApp?.name || 'Free Fire MAX'
                        if (snippetLanguage === 'curl') {
                          return `curl -X POST https://greenvest.shop/connect \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_key": "YOUR-LICENSE-KEY",
    "serial": "DEVICE-HWID",
    "app": "${targetAppName}"
  }'`
                        } else if (snippetLanguage === 'java') {
                          return `// ==============================================================
// Android Java KeyAuth Verification for "${targetAppName}"
// ==============================================================
JSONObject payload = new JSONObject();
payload.put("user_key", licenseKey);
payload.put("serial", androidId);
payload.put("app", "${targetAppName}");

URL url = new URL("https://greenvest.shop/connect");
HttpURLConnection conn = (HttpURLConnection) url.openConnection();
conn.setRequestMethod("POST");
conn.setRequestProperty("Content-Type", "application/json");
conn.setDoOutput(true);
conn.setConnectTimeout(8000);

try (OutputStream os = conn.getOutputStream()) {
    os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
}

// Read response JSON
BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
String res = br.readLine();
JSONObject json = new JSONObject(res);
if (json.optBoolean("success")) {
    String exp = json.getJSONObject("data").optString("EXP");
    // Access Granted! Pure KeyAuth Valid until: exp
} else {
    String reason = json.optString("reason", "License Invalid");
    // Access Denied: reason (e.g. App Mismatch or Expired)
}`
                        } else if (snippetLanguage === 'cpp') {
                          return `// ==============================================================
// C++ Native KeyAuth Verification for "${targetAppName}"
// ==============================================================
#include <string>
#include <curl/curl.h>

std::string payload = "{\\"user_key\\":\\"" + key + "\\",\\"serial\\":\\"" + hwid + "\\",\\"app\\":\\"${targetAppName}\\"}";

CURL* curl = curl_easy_init();
if (curl) {
    struct curl_slist* headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, "https://greenvest.shop/connect");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload.c_str());

    CURLcode res = curl_easy_perform(curl);
    // Parse JSON response: success, status, data.EXP
    curl_easy_cleanup(curl);
}`
                        } else if (snippetLanguage === 'csharp') {
                          return `// ==============================================================
// C# / Unity KeyAuth Verification for "${targetAppName}"
// ==============================================================
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

IEnumerator VerifyLicense(string key, string hwid) {
    string jsonPayload = "{\\"user_key\\":\\"" + key + "\\",\\"serial\\":\\"" + hwid + "\\",\\"app\\":\\"${targetAppName}\\"}";
    byte[] bodyRaw = System.Text.Encoding.UTF_8.GetBytes(jsonPayload);

    using (UnityWebRequest req = new UnityWebRequest("https://greenvest.shop/connect", "POST")) {
        req.uploadHandler = new UploadHandlerRaw(bodyRaw);
        req.downloadHandler = new DownloadHandlerBuffer();
        req.SetRequestHeader("Content-Type", "application/json");

        yield return req.SendWebRequest();
        if (req.result == UnityWebRequest.Result.Success) {
            Debug.Log("Response: " + req.downloadHandler.text);
        }
    }
}`
                        } else {
                          return `import requests

# Pure KeyAuth Check for ${targetAppName}
response = requests.post("https://greenvest.shop/connect", json={
    "user_key": "YOUR-LICENSE-KEY",
    "serial": "DEVICE-HWID-001",
    "app": "${targetAppName}"
})

data = response.json()
if data.get("success"):
    print("License Valid! Game:", data["data"]["app"], "Expires:", data["data"]["EXP"])
else:
    print("License Denied! Reason:", data.get("reason"))`
                        }
                      })()}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* 13. STREAMER REMOTE (TELEMETRY & HARDWARE CONTROLLER) */}
            {activeTab === 'remote' && (() => {
              const targetLic = currentKey ? keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase()) : null
              const isCurrentVip = Boolean(
                targetLic?.plan_duration?.includes('[VIP]') ||
                record?.streamer_name?.includes('VIP_REALTIME') ||
                record?.streamer_name?.startsWith('VIP|')
              )
              return (
              <div className="sg-view-container" style={styles.viewContainer}>
                {/* Compact Executive Action Header */}
                <div className="sg-banner-row" style={{ ...styles.bannerRow, marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ ...styles.pageTitle, margin: 0, fontSize: '20px' }}>Streamer Remote</h2>
                    <span
                      style={{
                        ...styles.greenPulseBadge,
                        padding: '5px 10px',
                        fontSize: '11px',
                        background: isStreamerKeyActivelyPlaying(record)
                          ? 'rgba(5, 223, 114, 0.18)'
                          : 'rgba(148, 163, 184, 0.12)',
                        color: isStreamerKeyActivelyPlaying(record) ? '#05df72' : '#cbd5e1',
                        border: isStreamerKeyActivelyPlaying(record)
                          ? '1px solid rgba(5, 223, 114, 0.45)'
                          : '1px solid rgba(148, 163, 184, 0.28)'
                      }}
                    >
                      {isStreamerKeyActivelyPlaying(record) ? '🟢 IN-GAME' : '⚪ IDLE'}
                    </span>

                    {/* Live Radar Telemetry Badge (Enemies / Bots) - VIP Only */}
                    {isCurrentVip && (() => {
                      const playing = isStreamerKeyActivelyPlaying(record)
                      const liveEnemies = playing ? Number(record?.streamer_name?.match(/E:(\d+)/)?.[1] || 0) : 0
                      const liveBots = playing ? Number(record?.streamer_name?.match(/B:(\d+)/)?.[1] || 0) : 0
                      const hasThreat = liveEnemies + liveBots > 0
                      return (
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '0.3px',
                            background: hasThreat
                              ? 'rgba(239, 68, 68, 0.18)'
                              : 'rgba(15, 23, 42, 0.75)',
                            border: hasThreat
                              ? '1px solid rgba(239, 68, 68, 0.5)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            color: hasThreat ? '#fca5a5' : '#94a3b8'
                          }}
                        >
                          🎯 {liveEnemies} ENEMIES • 🤖 {liveBots} BOTS
                        </span>
                      )
                    })()}

                    {/* Live Ping & VIP Bridge Latency Meter */}
                    {!isCurrentVip ? (
                      <span
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.3px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.45)',
                          color: '#38bdf8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>🔒</span>
                        <span>APK ONLY (IN-GAME)</span>
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.3px',
                          background: isLiveConnected ? 'rgba(5, 223, 114, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          border: isLiveConnected ? '1px solid rgba(5, 223, 114, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)',
                          color: isLiveConnected ? '#05df72' : '#facc15',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title="Realtime latency between Web Controller and Direct RYMON Mesh"
                      >
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: isLiveConnected ? '#05df72' : '#facc15',
                            boxShadow: isLiveConnected ? '0 0 8px #05df72' : '0 0 8px #facc15'
                          }}
                        />
                        {vipPingMs !== null ? (vipPingMs > 1200 ? '⚡ WARMING MESH...' : `${vipPingMs}ms VIP BRIDGE`) : isLiveConnected ? `${ping}ms VIP BRIDGE` : '🟡 VIP BRIDGE (CONNECTING...)'}
                      </span>
                    )}
                  </div>

                  <div className="sg-remote-actions" style={{ ...styles.badgeCluster, gap: '8px' }}>
                    {/* Hourly Web Control Limit / VIP Realtime Badge */}
                    {(() => {
                      if (isOwner) {
                        return (
                          <span
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: 'rgba(250, 204, 21, 0.15)',
                              border: '1px solid rgba(250, 204, 21, 0.45)',
                              color: '#fde047'
                            }}
                            title="Owner: Automatic VIP Realtime (<50ms Render RAM Bridge) • Unlimited Keys"
                          >
                            👑 OWNER (VIP REALTIME &bull; &lt;50ms)
                          </span>
                        )
                      }
                      if (currentUser?.role === 'admin' || currentUser?.role === 'reseller') {
                        return (
                          <span
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: 'rgba(0, 217, 255, 0.15)',
                              border: '1px solid rgba(0, 217, 255, 0.45)',
                              color: '#00d9ff'
                            }}
                            title="VIP Realtime: Direct RYMON Ultra-Low Latency Pipeline (<50ms Render RAM Bridge)"
                          >
                            ⚡ VIP REALTIME ({currentUser?.role === 'admin' ? 'ADMIN' : 'RESELLER'} &bull; &lt;50ms)
                          </span>
                        )
                      }
                      const isVipKey = Boolean(
                        keysList.find((k) => k.license_key.toUpperCase() === currentKey.toUpperCase())?.plan_duration?.includes('[VIP]') ||
                        record?.streamer_name?.includes('VIP_REALTIME') ||
                        record?.streamer_name?.startsWith('VIP|')
                      )
                      if (isVipKey) {
                        return (
                          <span
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: 'rgba(0, 217, 255, 0.15)',
                              border: '1px solid rgba(0, 217, 255, 0.45)',
                              color: '#00d9ff'
                            }}
                            title="VIP Realtime: Direct RYMON Ultra-Low Latency Pipeline (<50ms Render RAM Bridge)"
                          >
                            ⚡ VIP REALTIME (RENDER RAM &bull; &lt;50ms)
                          </span>
                        )
                      }
                      const recentKeys = getControlledKeysThisHour()
                      const count = recentKeys.length
                      return (
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: count >= 3 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(5, 223, 114, 0.15)',
                            border: count >= 3 ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(5, 223, 114, 0.4)',
                            color: count >= 3 ? '#ef4444' : '#05df72'
                          }}
                          title={`Standard accounts: max 3 keys per hour. Active: ${recentKeys.join(', ') || 'None'}`}
                        >
                          🕒 1-HR LIMIT: {count}/3 KEYS USED
                        </span>
                      )
                    })()}

                    {currentKey && isCurrentVip && (
                      <>
                        {/* 1-Click Remote Overlay vs Web-Only Switch */}
                        <button
                          onClick={handleToggleRemotePanelMode}
                          style={{
                            backgroundColor: record?.streamer_name?.includes('P:0')
                              ? 'rgba(168, 85, 247, 0.18)'
                              : 'rgba(0, 217, 255, 0.15)',
                            border: record?.streamer_name?.includes('P:0')
                              ? '1px solid #c084fc'
                              : '1px solid #00d9ff',
                            color: record?.streamer_name?.includes('P:0') ? '#e9d5ff' : '#00d9ff',
                            borderRadius: '8px',
                            padding: '6px 11px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                          title="Switch phone between Web + In-Game Overlay and Web-Only Stealth Mode"
                        >
                          {record?.streamer_name?.includes('P:0') ? '🕶️ WEB ONLY' : '👁️ OVERLAY ON'}
                        </button>

                        {/* 1-Click Stealth Freeze (Boss Key) */}
                        <button
                          onClick={handleToggleStealthFreeze}
                          style={{
                            backgroundColor: record?.is_paused
                              ? 'rgba(5, 223, 114, 0.18)'
                              : 'rgba(255, 183, 0, 0.16)',
                            border: record?.is_paused ? '1px solid #05df72' : '1px solid #ffb700',
                            color: record?.is_paused ? '#05df72' : '#ffb700',
                            borderRadius: '8px',
                            padding: '6px 11px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                          title="Instant Stealth Freeze / Resume without killing daemon"
                        >
                          {record?.is_paused ? '▶️ RESUME' : '❄️ FREEZE'}
                        </button>

                        {/* 1-Click HWID Reset */}
                        <button
                          onClick={() => handleCustomerSelfResetHwid(currentKey)}
                          disabled={selfResetBusy}
                          style={{
                            backgroundColor: 'rgba(5, 223, 114, 0.14)',
                            border: '1px solid rgba(5, 223, 114, 0.5)',
                            color: '#05df72',
                            borderRadius: '8px',
                            padding: '6px 11px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {selfResetBusy ? '...' : '🔄 HWID'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setShowPurgeModal(true)}
                      style={{ ...styles.emergencyPurgeBtn, padding: '6px 11px', fontSize: '11px' }}
                    >
                      🚨 PURGE
                    </button>
                  </div>
                </div>

                {/* Unified Single-Line Compact Telemetry Bar */}
                <div
                  className="sg-telemetry-bar"
                  style={{
                    background: 'rgba(13, 17, 26, 0.92)',
                    border: isStreamerKeyActivelyPlaying(record)
                      ? '1px solid rgba(5, 223, 114, 0.38)'
                      : '1px solid rgba(0, 217, 255, 0.22)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div className="sg-key-select-box" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: isStaff ? '1 1 280px' : '0 1 auto' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px' }}>
                      KEY:
                    </span>
                    {isStaff ? (
                      <select
                        value={currentKey}
                        onChange={(e) => handleSelectRemoteKey(e.target.value)}
                        style={{
                          ...styles.selectInput,
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#f8fafc',
                          maxWidth: '380px'
                        }}
                      >
                        <option value="">-- Select Target Key (Free Fire MAX Only) --</option>
                        {keysList
                          .filter(
                            (k) =>
                              !k.game ||
                              String(k.game || '').toLowerCase().includes('free fire')
                          )
                          .map((k) => {
                            const isKeyPlaying = onlineKeySet.has(k.license_key.toUpperCase())
                            const isVip = Boolean(k.plan_duration?.includes('[VIP]'))
                            const icon = isKeyPlaying ? '🟢 ' : isVip ? '👑 ' : '📱 '
                            const editionLabel = isVip ? 'VIP REMOTE' : 'APK ONLY'
                            return (
                              <option key={k.license_key} value={k.license_key}>
                                {icon}{k.license_key} [{editionLabel}] ({k.plan_duration?.replace(' [VIP]', '')} • @{k.creator_username})
                              </option>
                            )
                          })}
                      </select>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 800, color: '#00d9ff' }}>
                        {currentKey || 'NONE'}
                      </span>
                    )}
                  </div>

                  <div className="sg-telemetry-meta-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', fontSize: '11px' }}>
                    <div>
                      <span style={{ color: '#64748b', marginRight: '5px' }}>HWID:</span>
                      <strong style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>
                        {record?.device_hwid ? record.device_hwid.slice(0, 22) : 'Unbound'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', marginRight: '5px' }}>SLOTS:</span>
                      <strong style={{ color: '#38bdf8' }}>
                        {record?.devices_used || (record?.device_hwid ? 1 : 0)}/{record?.devices_max || 1}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', marginRight: '5px' }}>SYNC:</span>
                      <strong style={{ color: isStreamerKeyActivelyPlaying(record) ? '#05df72' : '#94a3b8' }}>
                        {record?.last_heartbeat
                          ? new Date(record.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : 'Idle'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', marginRight: '5px' }}>EXPIRY:</span>
                      <strong style={{ color: '#00d9ff', fontFamily: 'monospace' }}>{countdown}</strong>
                    </div>
                  </div>
                </div>

                {!currentKey ? (
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px dashed rgba(148, 163, 184, 0.25)',
                      borderRadius: '16px',
                      padding: '40px 20px',
                      textAlign: 'center',
                      marginTop: '8px'
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎯</div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                      No License Key Selected
                    </h3>
                    <p style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '420px', margin: '0 auto' }}>
                      Select a license key from the dropdown above to view device status.
                    </p>
                  </div>
                ) : !isCurrentVip ? (
                  /* Cyber-Glassmorphic Locked Screen for Standard Mobile APK */
                  <div
                    style={{
                      background: 'radial-gradient(ellipse at top, rgba(14, 165, 233, 0.12) 0%, rgba(10, 15, 29, 0.96) 70%)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '16px',
                      padding: '42px 24px',
                      textAlign: 'center',
                      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                      backdropFilter: 'blur(16px)',
                      marginTop: '8px'
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.5)',
                        borderRadius: '999px',
                        padding: '6px 16px',
                        marginBottom: '18px'
                      }}
                    >
                      <span style={{ fontSize: '13px' }}>🔒</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#38bdf8' }}>
                        STANDARD MOBILE APK EDITION
                      </span>
                    </div>

                    <h3
                      style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        color: '#f8fafc',
                        marginBottom: '8px'
                      }}
                    >
                      Standard Mobile APK Key
                    </h3>

                    <p
                      style={{
                        maxWidth: '520px',
                        margin: '0 auto 20px auto',
                        fontSize: '12.5px',
                        color: '#94a3b8'
                      }}
                    >
                      Key <code style={{ color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{currentKey}</code> operates directly via in-game floating menu. Web remote is exclusive to VIP edition.
                    </p>

                    {(isOwner || isAdmin) ? (
                      <button
                        onClick={() => handleToggleVipKey(currentKey, true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '12px 28px',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#000',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 0 24px rgba(245, 158, 11, 0.45)',
                          transition: 'transform 0.15s ease'
                        }}
                      >
                        <span>👑</span>
                        <span>UPGRADE THIS KEY TO VIP WEB REMOTE (+50%)</span>
                      </button>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                        Contact Owner or Administrator to upgrade this license key to VIP Web Remote.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Compact Freeze Indicator (Only when Paused) */}
                    {record?.is_paused && (
                      <div
                        style={{
                          background: 'rgba(255, 183, 0, 0.12)',
                          border: '1px solid rgba(255, 183, 0, 0.45)',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#ffb700'
                        }}
                      >
                        <span>❄️ STEALTH FREEZE ACTIVE — All in-game visuals &amp; memory hooks temporarily suspended</span>
                        <button
                          onClick={handleToggleStealthFreeze}
                          style={{
                            background: '#05df72',
                            color: '#07090e',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          ▶️ RESUME
                        </button>
                      </div>
                    )}

                    {/* 3 Telemetry Column Control Grid */}
                    <div className="sg-control-grid" style={styles.controlGrid3Col}>
                  {/* Column 1: Aim Matrix */}
                  <div className="sg-column-card" style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>🎯</span>
                      <h4>AIM ASSIST MATRIX</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Silent Aim</div>
                      <div
                        onClick={() => toggleFeature('aim_silent')}
                        style={{
                          ...styles.switchPill,
                          background: record?.aim_silent ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.aim_silent ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.sliderBlock}>
                      <div style={styles.sliderLabelRow}>
                        <span>Hit Rate Percentage</span>
                        <span style={styles.sliderValText}>{record?.hit_rate || 80}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={record?.hit_rate || 80}
                        onChange={(e) => handleSliderChange('hit_rate', parseInt(e.target.value))}
                        style={styles.sliderInput}
                      />
                    </div>

                    <div style={styles.sliderBlock}>
                      <div style={styles.sliderLabelRow}>
                        <span>Aim FOV Radius</span>
                        <span style={styles.sliderValText}>{record?.aim_fov || 90}°</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="360"
                        value={record?.aim_fov || 90}
                        onChange={(e) => handleSliderChange('aim_fov', parseInt(e.target.value))}
                        style={styles.sliderInput}
                      />
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>FOV Target Ring</div>
                      <div
                        onClick={() => toggleFeature('show_aim_fov')}
                        style={{
                          ...styles.switchPill,
                          background: record?.show_aim_fov ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.show_aim_fov ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Aim Snap Line</div>
                      <div
                        onClick={() => toggleFeature('show_aim_line')}
                        style={{
                          ...styles.switchPill,
                          background: record?.show_aim_line ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.show_aim_line ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Ignore Knocked</div>
                      <div
                        onClick={() => toggleFeature('ignore_knocked')}
                        style={{
                          ...styles.switchPill,
                          background: record?.ignore_knocked ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.ignore_knocked ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Column 2: ESP Visuals */}
                  <div className="sg-column-card" style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>👁️</span>
                      <h4>ESP VISUAL OVERLAY</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>3D Bounding Box</div>
                      <div
                        onClick={() => toggleFeature('esp_box')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_box ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_box ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Skeleton Bone Structure</div>
                      <div
                        onClick={() => toggleFeature('esp_skeleton')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_skeleton ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_skeleton ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Player Nicknames</div>
                      <div
                        onClick={() => toggleFeature('esp_name')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_name ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_name ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Tracer Snaplines</div>
                      <div
                        onClick={() => toggleFeature('esp_line')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_line ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_line ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Distance Indicator</div>
                      <div
                        onClick={() => toggleFeature('esp_distance')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_distance ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_distance ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Health Bar Visual</div>
                      <div
                        onClick={() => toggleFeature('esp_health')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_health ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_health ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Enemy Alert Count</div>
                      <div
                        onClick={() => toggleFeature('esp_count')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_count ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_count ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Tactical 360° Radar</div>
                      <div
                        onClick={() => toggleFeature('esp_radar')}
                        style={{
                          ...styles.switchPill,
                          background: record?.esp_radar ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.esp_radar ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Kinematics & Themes */}
                  <div className="sg-column-card" style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>⚡</span>
                      <h4>KINEMATICS & THEME</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Kinematic Speed Boost</div>
                      <div
                        onClick={() => toggleFeature('speed_hack')}
                        style={{
                          ...styles.switchPill,
                          background: record?.speed_hack ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.speed_hack ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.sliderBlock}>
                      <div style={styles.sliderLabelRow}>
                        <span>Speed Multiplier</span>
                        <span style={styles.sliderValText}>{record?.speed_multiplier || 1.5}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.1"
                        value={record?.speed_multiplier || 1.5}
                        onChange={(e) => handleSliderChange('speed_multiplier', parseFloat(e.target.value))}
                        style={styles.sliderInput}
                      />
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Ghost Mode (Desync)</div>
                      <div
                        onClick={() => toggleFeature('ghost_hack')}
                        style={{
                          ...styles.switchPill,
                          background: record?.ghost_hack ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.ghost_hack ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Instant No-Reload</div>
                      <div
                        onClick={() => toggleFeature('no_reload')}
                        style={{
                          ...styles.switchPill,
                          background: record?.no_reload ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.no_reload ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.toggleRow}>
                      <div style={styles.toggleTitle}>Recoil Suppression</div>
                      <div
                        onClick={() => toggleFeature('no_recoil')}
                        style={{
                          ...styles.switchPill,
                          background: record?.no_recoil ? '#00d9ff' : 'rgba(30,36,50,0.8)'
                        }}
                      >
                        <div
                          style={{
                            ...styles.switchKnob,
                            transform: record?.no_recoil ? 'translateX(20px)' : 'translateX(0)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, marginBottom: '10px' }}>
                        OVERLAY COLOR PALETTE
                      </div>
                      <div style={styles.themePaletteGrid}>
                        {THEME_NAMES.map((themeName, idx) => (
                          <button
                            key={themeName}
                            onClick={() => setThemePreset(idx)}
                            style={{
                              ...styles.themePillBtn,
                              ...(record?.theme_color_index === idx ? styles.themePillBtnActive : {})
                            }}
                          >
                            {themeName}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })()}
          </main>
        </div>
      )}

      {/* ── EMERGENCY REMOTE PURGE MODAL ────────────────────────────────────── */}
      {showPurgeModal && (
        <div className="sg-modal-overlay" style={styles.modalOverlay}>
          <div className="sg-modal-card" style={styles.modalCard}>
            <div style={styles.modalIcon}>🚨</div>
            <h3 style={styles.modalTitle}>Confirm Emergency Remote Wipe</h3>
            <p style={styles.modalText}>
              Are you sure you want to trigger a remote purge on target device running key <code>{currentKey}</code>?<br /><br />
              All background processes will be killed immediately, and <code>/data/local/tmp</code> will be wiped completely.
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => setShowPurgeModal(false)}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleEmergencyPurge}
                style={styles.modalConfirmPurgeBtn}
              >
                Yes, Wipe Device Now
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── RESET USER PASSWORD MODAL ───────────────────────────────────────── */}
      {pwdModalUser && (
        <div className="sg-modal-overlay" style={styles.modalOverlay} onClick={() => setPwdModalUser(null)}>
          <div
            className="sg-modal-card"
            style={{
              ...styles.modalCard,
              maxWidth: '480px',
              width: '92%',
              textAlign: 'left',
              padding: '26px',
              border: '1px solid rgba(5, 223, 114, 0.35)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(5, 223, 114, 0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🔑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                    Reset Password for @{pwdModalUser}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Instantly updates user credentials across RYMON Cloud
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPwdModalUser(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetUserPassword}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>NEW PASSWORD FOR @{String(pwdModalUser || '').toUpperCase()}</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={pwdNewValue}
                    onChange={(e) => setPwdNewValue(e.target.value)}
                    placeholder="Enter new password..."
                    style={{ ...styles.keyInput, flex: 1, fontFamily: 'monospace' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setPwdNewValue(`rymon@${Math.floor(1000 + Math.random() * 9000)}`)}
                    style={{
                      ...styles.chipBtn,
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      background: 'rgba(0, 217, 255, 0.15)',
                      border: '1px solid rgba(0, 217, 255, 0.35)',
                      color: '#00d9ff'
                    }}
                  >
                    🎲 Auto-Gen
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `⚡ Rymon Ghost Connect Login\nUsername: ${pwdModalUser}\nNew Password: ${pwdNewValue}\nPortal: https://greenvest.shop/`
                    )
                    showToast('📋 Copied login credentials to clipboard!')
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(148, 163, 184, 0.15)',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📋 Copy Credentials
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const msg = `⚡ *Rymon Ghost Connect Credentials Updated*\n👤 Username: *${pwdModalUser}*\n🔑 New Password: \`${pwdNewValue}\`\n🌐 Portal: https://greenvest.shop/`
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(34, 197, 94, 0.18)',
                    border: '1px solid #22c55e',
                    color: '#4ade80',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📲 Share on WhatsApp
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setPwdModalUser(null)}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  style={{
                    ...styles.submitBtn,
                    width: 'auto',
                    padding: '10px 20px',
                    background: '#05df72',
                    color: '#07090e',
                    fontWeight: 800
                  }}
                >
                  {pwdLoading ? 'SAVING...' : '🔑 SAVE NEW PASSWORD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── APP PERMISSIONS MODAL (Debajoyti Granular Permission Engine) ─────── */}
      {appPermModalUser && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '480px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                📱 App Permissions: @{appPermModalUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setAppPermModalUser(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAppPermissions} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>
                Configure which applications <strong>@{appPermModalUser.username}</strong> is permitted to generate keys for.
                Unpermitted apps will be completely invisible on their screen.
              </div>

              {/* Wildcard / All Custom Apps Toggle */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: appPermWildcard ? 'rgba(5, 223, 114, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                  border: appPermWildcard ? '1px solid rgba(5, 223, 114, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onClick={() => setAppPermWildcard(!appPermWildcard)}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: appPermWildcard ? '#05df72' : '#f8fafc' }}>
                    ✨ Allow All Custom Apps (Wildcard)
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    User can generate keys for every present and future custom app
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={appPermWildcard}
                  onChange={(e) => setAppPermWildcard(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#05df72' }}
                />
              </div>

              {/* Specific Apps Checklist */}
              {!appPermWildcard && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Or Grant Specific App Permissions:
                  </div>

                  {/* Free Fire MAX (Always Granted) */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(5, 223, 114, 0.08)',
                    border: '1px solid rgba(5, 223, 114, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 600 }}>
                      🔥 Free Fire MAX
                    </span>
                    <span style={{ fontSize: '10px', background: 'rgba(5, 223, 114, 0.2)', color: '#05df72', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                      DEFAULT (ACTIVE)
                    </span>
                  </div>

                  {/* Registered Custom Apps */}
                  {registeredApps
                    .filter((a) => a && a.name && a.name.trim().toLowerCase() !== 'free fire max')
                    .map((app) => {
                      const isChecked = appPermSelectedApps.some((a) => a.toLowerCase() === app.name.toLowerCase())
                      return (
                        <div
                          key={app.id || app.name}
                          onClick={() => {
                            if (isChecked) {
                              setAppPermSelectedApps(appPermSelectedApps.filter((a) => a.toLowerCase() !== app.name.toLowerCase()))
                            } else {
                              setAppPermSelectedApps([...appPermSelectedApps, app.name])
                            }
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: isChecked ? 'rgba(0, 217, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                            border: isChecked ? '1px solid rgba(0, 217, 255, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{ fontSize: '13px', color: isChecked ? '#00d9ff' : '#cbd5e1', fontWeight: 600 }}>
                            {app.icon || '🎮'} {app.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAppPermSelectedApps([...appPermSelectedApps, app.name])
                              } else {
                                setAppPermSelectedApps(appPermSelectedApps.filter((a) => a.toLowerCase() !== app.name.toLowerCase()))
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#00d9ff' }}
                          />
                        </div>
                      )
                    })}
                </div>
              )}

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setAppPermModalUser(null)}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={appPermLoading}
                  style={{ ...styles.submitBtn, width: 'auto' }}
                >
                  {appPermLoading ? 'SAVING...' : '💾 SAVE PERMISSIONS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM FLOATING QUICK ACCESS BAR ─────────────────────────── */}
      {isAuthenticated && (
        <nav className="sg-mobile-bottom-bar" aria-label="Mobile Navigation">
          {isStreamer ? (
            <>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${activeTab === 'remote' ? 'active' : ''}`}
                onClick={() => handleSelectTab('remote')}
              >
                <span style={{ fontSize: '18px' }}>⚡</span>
                <span>Remote</span>
              </button>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${mobileMenuOpen || ['referrals', 'users', 'add-balance', 'advance', 'apps', 'connect-api', 'delete', 'extend'].includes(activeTab) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span style={{ fontSize: '18px' }}>☰</span>
                <span>More</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${activeTab === 'remote' ? 'active' : ''}`}
                onClick={() => handleSelectTab('remote')}
              >
                <span style={{ fontSize: '18px' }}>⚡</span>
                <span>Remote</span>
              </button>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${activeTab === 'keys' ? 'active' : ''}`}
                onClick={() => handleSelectTab('keys')}
              >
                <span style={{ fontSize: '18px' }}>🔑</span>
                <span>Keys</span>
              </button>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${activeTab === 'generate' ? 'active' : ''}`}
                onClick={() => handleSelectTab('generate')}
              >
                <span style={{ fontSize: '18px' }}>➕</span>
                <span>Gen</span>
              </button>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => handleSelectTab('overview')}
              >
                <span style={{ fontSize: '18px' }}>📊</span>
                <span>Stats</span>
              </button>
              <button
                type="button"
                className={`sg-mobile-bottom-tab ${mobileMenuOpen || ['referrals', 'users', 'add-balance', 'advance', 'apps', 'connect-api', 'delete', 'extend'].includes(activeTab) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span style={{ fontSize: '18px' }}>☰</span>
                <span>Menu</span>
              </button>
            </>
          )}
        </nav>
      )}

    </div>
  )
}

// ── Phantom Amethyst Glassmorphism Scoped Design System ────────────────────────
const styles: Record<string, React.CSSProperties> = {
  appShell: {
    minHeight: '100vh',
    backgroundColor: '#08070e',
    color: '#f8fafc',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    position: 'relative',
    overflowX: 'hidden'
  },
  ambientGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `radial-gradient(rgba(168, 85, 247, 0.08) 1px, transparent 0), radial-gradient(rgba(244, 63, 94, 0.04) 1px, transparent 0)`,
    backgroundSize: '36px 36px, 72px 72px',
    backgroundPosition: '0 0, 18px 18px',
    pointerEvents: 'none',
    zIndex: 0
  },
  topHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    backgroundColor: 'rgba(11, 9, 20, 0.88)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.55)',
    position: 'sticky',
    top: 0,
    zIndex: 50
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  mobileMenuToggle: {
    display: 'none',
    background: 'transparent',
    border: 'none',
    color: '#f8fafc',
    fontSize: '20px',
    cursor: 'pointer'
  },
  brandCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoFrame: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(168, 85, 247, 0.55)',
    boxShadow: '0 0 14px rgba(168, 85, 247, 0.35)',
    flexShrink: 0
  },
  logoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  brandTitleText: {
    fontSize: '16px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#f8fafc'
  },
  brandVioletPill: {
    background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #f43f5e 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    fontWeight: 900,
    letterSpacing: '0.06em',
    filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.5))'
  },
  brandSubText: {
    fontSize: '10px',
    color: '#a78bfa',
    letterSpacing: '0.07em',
    fontWeight: 700
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  balancePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    backgroundColor: 'rgba(18, 14, 29, 0.9)',
    border: '1px solid rgba(168, 85, 247, 0.32)',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
  },
  balanceAmount: {
    color: '#c084fc'
  },
  telemetryPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: 'rgba(18, 14, 29, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600
  },
  pulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    boxShadow: '0 0 8px currentColor'
  },
  telemetryText: {
    color: '#cbd5e1'
  },
  pingText: {
    color: '#38bdf8',
    fontWeight: 700
  },
  userProfilePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 8px 4px 12px',
    backgroundColor: 'rgba(18, 14, 29, 0.9)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '20px'
  },
  userAvatarSquare: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: '#a855f7',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px rgba(168, 85, 247, 0.45)'
  },
  userNameBlock: {
    display: 'flex',
    flexDirection: 'column'
  },
  userNameText: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  userRoleTag: {
    fontSize: '9px',
    color: '#c084fc',
    fontWeight: 700,
    letterSpacing: '0.04em'
  },
  headerLogoutBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 6px',
    borderRadius: '6px',
    color: '#94a3b8'
  },
  quickLoginBtn: {
    padding: '7px 16px',
    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(168, 85, 247, 0.4)'
  },
  toastBanner: {
    backgroundColor: 'rgba(5, 223, 114, 0.15)',
    border: '1px solid rgba(5, 223, 114, 0.4)',
    color: '#05df72',
    padding: '10px 20px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
  },
  authGateBox: {
    maxWidth: '520px',
    margin: '60px auto',
    padding: '36px',
    backgroundColor: 'rgba(18, 14, 29, 0.88)',
    border: '1px solid rgba(168, 85, 247, 0.28)',
    borderRadius: '20px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.7), 0 0 35px rgba(168, 85, 247, 0.16)',
    backdropFilter: 'blur(20px)',
    position: 'relative',
    zIndex: 1
  },
  authBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: '12px',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    color: '#c084fc',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    marginBottom: '16px',
    border: '1px solid rgba(168, 85, 247, 0.3)'
  },
  authTabSelector: {
    display: 'flex',
    gap: '8px',
    backgroundColor: 'rgba(11, 9, 20, 0.75)',
    padding: '4px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: '1px solid rgba(168, 85, 247, 0.18)'
  },
  authTabBtn: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  authTabBtnActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    color: '#c084fc',
    fontWeight: 700,
    boxShadow: '0 0 12px rgba(168, 85, 247, 0.25)'
  },
  authHead: {
    fontSize: '22px',
    fontWeight: 800,
    marginBottom: '8px',
    color: '#f8fafc'
  },
  authDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.5,
    marginBottom: '24px'
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  formLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.04em'
  },
  keyInput: {
    padding: '12px 16px',
    backgroundColor: 'rgba(11, 9, 20, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },
  selectInput: {
    padding: '12px 16px',
    backgroundColor: 'rgba(11, 9, 20, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },
  chipBtn: {
    padding: '4px 10px',
    backgroundColor: 'rgba(28, 20, 44, 0.6)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '6px',
    color: '#c084fc',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  submitBtn: {
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 800,
    fontSize: '13px',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(168, 85, 247, 0.45)'
  },
  primaryActionBtn: {
    padding: '12px 24px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer'
  },
  errorBox: {
    padding: '10px 14px',
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    border: '1px solid rgba(244, 63, 94, 0.45)',
    borderRadius: '8px',
    color: '#f43f5e',
    fontSize: '12px',
    lineHeight: 1.4
  },
  mainLayout: {
    display: 'flex',
    minHeight: 'calc(100vh - 67px)',
    position: 'relative',
    zIndex: 1
  },
  sidebar: {
    width: '260px',
    backgroundColor: 'rgba(11, 9, 20, 0.82)',
    borderRight: '1px solid rgba(168, 85, 247, 0.18)',
    padding: '20px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flexShrink: 0
  },
  sidebarMobileOpen: {
    display: 'flex',
    position: 'fixed',
    top: '67px',
    left: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#0b0914'
  },
  sidebarUserCard: {
    padding: '12px',
    backgroundColor: 'rgba(18, 14, 29, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '12px',
    marginBottom: '10px'
  },
  sidebarUserRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  sidebarUserAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)'
  },
  sidebarUserName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  sidebarUserSub: {
    fontSize: '10px',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '2px'
  },
  activeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#05df72'
  },
  navStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  navCategoryHeader: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#6b7280',
    padding: '14px 10px 4px 10px'
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease'
  },
  navItemActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    color: '#c084fc',
    fontWeight: 700,
    borderLeft: '3px solid #a855f7',
    boxShadow: 'inset 0 0 16px rgba(168, 85, 247, 0.08)'
  },
  navIcon: {
    fontSize: '14px'
  },
  cyanMiniBadge: {
    marginLeft: 'auto',
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: '6px',
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    color: '#c084fc',
    fontWeight: 700
  },
  contentPane: {
    flex: 1,
    padding: '30px',
    overflowY: 'auto',
    position: 'relative',
    zIndex: 1
  },
  viewContainer: {
    maxWidth: '1240px',
    margin: '0 auto'
  },
  bannerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '18px',
    flexWrap: 'wrap',
    gap: '14px'
  },
  pageTitle: {
    fontSize: '21px',
    fontWeight: 800,
    margin: 0,
    color: '#f8fafc'
  },
  pageSubtitle: {
    display: 'none'
  },
  badgeCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  greenPulseBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '6px 12px',
    borderRadius: '12px',
    backgroundColor: 'rgba(5, 223, 114, 0.15)',
    color: '#05df72',
    border: '1px solid rgba(5, 223, 114, 0.3)'
  },
  timeTag: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '28px',
    position: 'relative',
    zIndex: 5
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: 'rgba(18, 14, 29, 0.78)',
    border: '1px solid rgba(168, 85, 247, 0.2)',
    borderRadius: '16px',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    userSelect: 'none',
    touchAction: 'manipulation'
  },
  statIconFrame: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    color: '#c084fc',
    border: '1px solid rgba(168, 85, 247, 0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px'
  },
  statNum: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#f8fafc'
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8'
  },
  dualGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: '24px'
  },
  cardBox: {
    padding: '24px',
    backgroundColor: 'rgba(18, 14, 29, 0.82)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '16px',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  quickActionCard: {
    padding: '16px',
    backgroundColor: 'rgba(11, 9, 20, 0.65)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    color: '#f8fafc',
    transition: 'all 0.2s ease'
  },
  quickActionIcon: {
    fontSize: '20px',
    marginBottom: '8px'
  },
  quickActionTitle: {
    fontSize: '13px',
    fontWeight: 700
  },
  quickActionSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px'
  },
  activityFeed: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  activityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    backgroundColor: 'rgba(11, 9, 20, 0.55)',
    borderRadius: '10px'
  },
  activityIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: 'rgba(5, 223, 114, 0.15)',
    color: '#05df72',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700
  },
  activityTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  activityDetails: {
    fontSize: '11px',
    color: '#94a3b8'
  },
  activityTime: {
    fontSize: '10px',
    color: '#64748b'
  },
  centerCardWrapper: {
    maxWidth: '680px',
    margin: '0 auto'
  },
  managementCard: {
    padding: '30px',
    backgroundColor: 'rgba(18, 14, 29, 0.88)',
    border: '1px solid rgba(168, 85, 247, 0.24)',
    borderRadius: '16px',
    boxShadow: '0 16px 44px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(16px)'
  },
  formGrid2Col: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  invoiceSummaryBox: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: 'rgba(11, 9, 20, 0.7)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  generatedKeyBox: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: 'rgba(5, 223, 114, 0.1)',
    border: '1px solid rgba(5, 223, 114, 0.3)',
    borderRadius: '12px'
  },
  generatedKeyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    gap: '12px'
  },
  keyCodeText: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#c084fc',
    letterSpacing: '0.04em'
  },
  copyKeyBtn: {
    padding: '8px 14px',
    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '11px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(168, 85, 247, 0.35)'
  },
  searchBox: {
    minWidth: '280px'
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'rgba(11, 9, 20, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  tableCard: {
    backgroundColor: 'rgba(18, 14, 29, 0.8)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)'
  },
  dataTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left'
  },
  th: {
    padding: '14px 18px',
    backgroundColor: 'rgba(11, 9, 20, 0.8)',
    color: '#a78bfa',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(168, 85, 247, 0.2)'
  },
  tr: {
    borderBottom: '1px solid rgba(168, 85, 247, 0.12)'
  },
  td: {
    padding: '14px 18px',
    verticalAlign: 'middle'
  },
  miniCopyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px'
  },
  deviceBarBack: {
    width: '90px',
    height: '4px',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: '2px',
    marginTop: '4px',
    overflow: 'hidden'
  },
  deviceBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #a855f7, #f43f5e)'
  },
  planBadge: {
    padding: '3px 8px',
    backgroundColor: 'rgba(28, 20, 44, 0.6)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#e2e8f0'
  },
  avatarTiny: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#a855f7',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    color: '#c084fc',
    fontSize: '13px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusPill: {
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 700,
    display: 'inline-block'
  },
  roleBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    color: '#c084fc',
    fontSize: '10px',
    fontWeight: 700
  },
  userBalanceGreen: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#05df72'
  },
  actionIconBtn: {
    background: 'rgba(28, 20, 44, 0.5)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: '6px 8px',
    fontSize: '12px',
    color: '#f8fafc'
  },
  actionIconCircle: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px'
  },
  settingDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: '0 0 16px 0'
  },
  settingToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 0',
    borderTop: '1px solid rgba(168, 85, 247, 0.18)'
  },
  settingTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  settingSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px'
  },
  switchPill: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    padding: '2px',
    cursor: 'pointer',
    transition: 'background 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease',
    boxSizing: 'border-box'
  },
  switchKnob: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
    transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)'
  },
  emergencyPurgeBtn: {
    padding: '8px 14px',
    background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.2), rgba(190, 18, 60, 0.25))',
    border: '1px solid rgba(244, 63, 94, 0.55)',
    color: '#f43f5e',
    fontSize: '11px',
    fontWeight: 800,
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(244, 63, 94, 0.25)'
  },
  controlGrid3Col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: '16px'
  },
  columnCard: {
    padding: '16px 18px',
    backgroundColor: 'rgba(18, 14, 29, 0.85)',
    border: '1px solid rgba(168, 85, 247, 0.22)',
    borderRadius: '14px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
  },
  columnHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(168, 85, 247, 0.2)'
  },
  columnIcon: {
    fontSize: '16px'
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 0',
    borderBottom: '1px solid rgba(168, 85, 247, 0.14)'
  },
  toggleTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  sliderBlock: {
    padding: '10px 0',
    borderBottom: '1px solid rgba(168, 85, 247, 0.14)'
  },
  sliderLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '8px',
    fontWeight: 600
  },
  sliderValText: {
    color: '#c084fc',
    fontWeight: 700
  },
  sliderInput: {
    width: '100%',
    accentColor: '#a855f7',
    cursor: 'pointer'
  },
  themePaletteGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '8px'
  },
  themePillBtn: {
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: 'rgba(11, 9, 20, 0.65)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  themePillBtnActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderColor: '#a855f7',
    color: '#c084fc',
    fontWeight: 700,
    boxShadow: '0 0 10px rgba(168, 85, 247, 0.3)'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200
  },
  modalCard: {
    maxWidth: '460px',
    width: '90%',
    padding: '30px',
    backgroundColor: '#0e0b17',
    border: '1px solid rgba(244, 63, 94, 0.5)',
    borderRadius: '16px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 35px rgba(244, 63, 94, 0.25)'
  },
  modalIcon: {
    fontSize: '40px',
    marginBottom: '12px'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 10px 0'
  },
  modalText: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: '0 0 24px 0'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center'
  },
  modalCancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    backgroundColor: 'rgba(28, 20, 44, 0.7)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    color: '#cbd5e1',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer'
  },
  modalConfirmPurgeBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
    border: 'none',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(244, 63, 94, 0.4)'
  }
}
