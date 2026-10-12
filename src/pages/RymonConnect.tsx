import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  type RymonAccount,
  type RymonLicense,
  type RymonActivity,
  type StreamerControlRecord,
  type RymonNotification,
  type TelegramConfig,
  loginWithCredentials,
  verifyLicenseKey,
  fetchAllLicenses,
  fetchAllAccounts,
  fetchAllActivities,
  generateLicenseKeyBackend,
  topUpUserBalanceBackend,
  resetHwidBackend,
  deleteLicenseBackend,
  bulkDeleteKeysBackend,
  toggleBanStatusBackend,
  extendLicenseBackend,
  checkSupabaseSchemaStatus,
  fetchNotifications,
  sendBroadcastBackend,
  deleteNotificationBackend,
  fetchTelegramConfigBackend,
  saveTelegramConfigBackend,
  dispatchTelegramMessage,
  type RymonReferral,
  SOVEREIGN_CONNECT_CONFIG,
  fetchReferralCodes,
  createReferralCode,
  registerWithReferral,
  deleteReferralCode,
  renewUserSubscriptionBackend,
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
  type SovereignSecurityPolicy,
  getSovereignSecurityPolicy,
  saveSovereignSecurityPolicy,
  syncSecurityPolicyFromSupabase,
  resetUserPasswordBackend
} from '../lib/rymonBackend'

type TabType =
  | 'overview'
  | 'remote'
  | 'generate'
  | 'keys'
  | 'telegram'
  | 'users'
  | 'referrals'
  | 'connect-api'
  | 'add-balance'
  | 'ban'
  | 'delete'
  | 'extend'
  | 'broadcast'
  | 'advance'
  | 'sql-setup'

const THEME_NAMES = ['Cyber Blue', 'Neon Pink', 'Emerald', 'Violet', 'Amber']

export default function RymonConnect() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Auth Gateway State (Dual Mode: Staff Username/Password vs Streamer Key)
  const [authMode, setAuthMode] = useState<'staff' | 'key'>('staff')
  const [staffUsername, setStaffUsername] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Authenticated Session State
  const [currentUser, setCurrentUser] = useState<RymonAccount | null>(null)
  const [currentKey, setCurrentKey] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)

  // Database Health & Sync
  const [dbStatus, setDbStatus] = useState<{ isOnline: boolean; tablesCreated: boolean; errorMsg?: string }>({
    isOnline: true,
    tablesCreated: true
  })
  const [copiedSql, setCopiedSql] = useState(false)

  // Streamer Telemetry State
  const [record, setRecord] = useState<StreamerControlRecord | null>(null)
  const [expiryDate, setExpiryDate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState('--d --h --m --s')
  const [ping, setPing] = useState(28)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Live Database Collections
  const [keysList, setKeysList] = useState<RymonLicense[]>([])
  const [usersList, setUsersList] = useState<RymonAccount[]>([])
  const [activities, setActivities] = useState<RymonActivity[]>([])
  const [streamerControls, setStreamerControls] = useState<StreamerControlRecord[]>([])

  // Dynamic Pricing Management State (Owner)
  const [globalPrices, setGlobalPrices] = useState<Record<string, number>>(() => getGlobalPriceMap())
  const [targetPriceUser, setTargetPriceUser] = useState<string>('')
  const [customUserPrices, setCustomUserPrices] = useState<Record<string, number>>(() => getGlobalPriceMap())
  const [allCustomUserMaps, setAllCustomUserMaps] = useState<Record<string, Record<string, number>>>(() =>
    getAllUserCustomPriceMaps()
  )

  // Generate Key Form State
  const [genGame, setGenGame] = useState('Free Fire MAX')
  const [genDuration, setGenDuration] = useState('1 Day')
  const [genCustomPrefix, setGenCustomPrefix] = useState('')
  const [genDevicesMax, setGenDevicesMax] = useState(1)
  const [genQuantity, setGenQuantity] = useState(1)
  const [genCreatedKeysList, setGenCreatedKeysList] = useState<string[]>([])
  const [genError, setGenError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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
  const [keyGameFilter, setKeyGameFilter] = useState<string>('ALL')
  const [keyCreatorFilter, setKeyCreatorFilter] = useState<string>('ALL')
  const [searchUserQuery, setSearchUserQuery] = useState('')

  // Management Action State
  const [targetBanUser, setTargetBanUser] = useState('')
  const [banActionType, setBanActionType] = useState<'ban' | 'unban'>('ban')
  const [targetDeleteUser, setTargetDeleteUser] = useState('__ALL__')
  const [deleteKeyType, setDeleteKeyType] = useState<'expired' | 'unused' | 'all'>('expired')
  const [targetExtendKey, setTargetExtendKey] = useState('')
  const [extendAmount, setExtendAmount] = useState(30)
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

  // Communication & Messaging Engine State
  const [notifications, setNotifications] = useState<RymonNotification[]>([])
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false)
  const [notifFilter, setNotifFilter] = useState<'all' | 'broadcasts' | 'direct'>('all')
  const [isAnnouncementDismissed, setIsAnnouncementDismissed] = useState(false)
  const [broadcastTarget, setBroadcastTarget] = useState('ALL')
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastType, setBroadcastType] = useState<'INFO' | 'WARNING' | 'ALERT' | 'UPDATE'>('INFO')
  const [broadcastPin, setBroadcastPin] = useState(true)
  const [broadcastSendTelegram, setBroadcastSendTelegram] = useState(false)
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastSuccessMsg, setBroadcastSuccessMsg] = useState('')

  // Telegram Bot Integration State
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    bot_token: '',
    chat_id: '',
    channel_username: '@RymonGhostStreamer',
    is_active: true
  })
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [telegramTestMsg, setTelegramTestMsg] = useState('')
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramStatusMsg, setTelegramStatusMsg] = useState('')

  // Derived Notification computations
  const pinnedAnnouncement = useMemo(() => {
    return notifications.find((n) => n.is_pinned) || notifications[0] || null
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    if (notifFilter === 'broadcasts') {
      return notifications.filter((n) => n.recipient === 'ALL')
    }
    if (notifFilter === 'direct') {
      return notifications.filter((n) => n.recipient !== 'ALL')
    }
    return notifications
  }, [notifications, notifFilter])

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

  // 1. Initial Session & Database Verification on Mount
  useEffect(() => {
    // Check Supabase Database health
    checkSupabaseSchemaStatus().then(setDbStatus)

    // Restore saved session
    const savedUserJson = localStorage.getItem('rymon_session_user')
    const savedKey = localStorage.getItem('rymon_remote_key')
    const savedExp = localStorage.getItem('rymon_remote_expiry')

    if (savedUserJson) {
      try {
        const u = JSON.parse(savedUserJson) as RymonAccount
        setCurrentUser(u)
        setWalletBalance(u.balance || 0)
        setIsAuthenticated(true)
        if (savedKey && savedKey !== 'RYMON-MASTER-KEY') setCurrentKey(savedKey)
      } catch {}
    } else if (savedKey && savedKey !== 'RYMON-MASTER-KEY') {
      setCurrentKey(savedKey)
      setIsAuthenticated(true)
      const exp = savedExp ? new Date(savedExp) : new Date(Date.now() + 30 * 86400000)
      setExpiryDate(exp)
      setCurrentUser({
        id: 'usr-streamer',
        username: 'Streamer VIP',
        email: 'streamer@rymon.vip',
        role: 'streamer',
        balance: 0,
        uplink: 'rymon',
        status: 'ACTIVE'
      })
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
      const [lcs, usrs, acts, notifs, tgCfg, refs, ctrls] = await Promise.all([
        fetchAllLicenses(currentUser),
        fetchAllAccounts(currentUser),
        isStreamerRole ? Promise.resolve([]) : fetchAllActivities(),
        fetchNotifications(currentUser?.username),
        currentUser?.role === 'owner'
          ? fetchTelegramConfigBackend()
          : Promise.resolve({ bot_token: '', chat_id: '', channel_username: '@RymonGhostStreamer', is_active: false }),
        fetchReferralCodes(currentUser),
        fetchAllStreamerControls(currentUser)
      ])

      if (isMounted) {
        setGlobalPrices(getGlobalPriceMap())
        setAllCustomUserMaps(getAllUserCustomPriceMaps())
        setSecurityPolicy(getSovereignSecurityPolicy())
        setKeysList(lcs)
        setUsersList(usrs)
        setActivities(acts)
        setNotifications(notifs)
        setTelegramConfig(tgCfg)
        setReferralList(refs)
        setStreamerControls(ctrls)

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

        // Sync fresh balance if currentUser in list
        if (currentUser) {
          const freshMe = usrs.find(
            (u) => u.username.toLowerCase() === currentUser.username.toLowerCase()
          )
          if (freshMe) {
            setWalletBalance(freshMe.balance)
            setCurrentUser(freshMe)
            localStorage.setItem('rymon_session_user', JSON.stringify(freshMe))
          }
        }
      }
    }

    loadLiveData()

    // Periodic 10-second heartbeat & playing-status sweep so stale sessions transition to OFFLINE automatically
    const statusPollTimer = setInterval(() => {
      if (!isMounted) return
      fetchAllStreamerControls(currentUser).then((c) => isMounted && setStreamerControls(c))
      fetchAllLicenses(currentUser).then((l) => isMounted && setKeysList(l))
    }, 10000)

    // Setup Realtime Phoenix Subscriptions
    if (supabase) {
      const channel = supabase
        .channel('rymon-global-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_licenses' },
          () => {
            fetchAllLicenses(currentUser).then((l) => isMounted && setKeysList(l))
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_streamer_controls' },
          () => {
            fetchAllStreamerControls(currentUser).then((c) => isMounted && setStreamerControls(c))
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_accounts' },
          () => {
            fetchAllAccounts(currentUser).then((u) => {
              if (isMounted) {
                setUsersList(u)
                if (currentUser) {
                  const me = u.find(
                    (x) => x.username.toLowerCase() === currentUser.username.toLowerCase()
                  )
                  if (me) {
                    setWalletBalance(me.balance)
                    setCurrentUser(me)
                  }
                }
              }
            })
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_activities' },
          () => {
            fetchAllActivities().then((a) => isMounted && setActivities(a))
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_notifications' },
          () => {
            fetchNotifications(currentUser?.username).then((n) => isMounted && setNotifications(n))
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rymon_referrals' },
          () => {
            fetchReferralCodes(currentUser).then((r) => isMounted && setReferralList(r))
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
  }, [isAuthenticated, currentUser])

  // 3. Telemetry Realtime Subscription for Current Key
  useEffect(() => {
    if (!isAuthenticated || !currentKey || !supabase) return

    let isMounted = true

    async function loadTelemetry() {
      if (!supabase) return
      try {
        const [{ data: ctrlData }, { data: licData }] = await Promise.all([
          supabase
            .from('rymon_streamer_controls')
            .select('*')
            .eq('license_key', currentKey)
            .maybeSingle(),
          supabase
            .from('rymon_licenses')
            .select('device_hwid, devices_used, devices_max, last_heartbeat, status, is_paused, expires_at, game')
            .eq('license_key', currentKey)
            .maybeSingle()
        ])

        if (licData?.expires_at && isMounted) {
          setExpiryDate(new Date(licData.expires_at))
        } else if (isMounted && licData?.status === 'WAITING') {
          setExpiryDate(null)
          setCountdown('Starts on 1st Login')
        }

        const defaults = buildDefaultStreamerControlPayload({
          license_key: currentKey,
          streamer_name: currentUser?.role === 'owner' ? 'Owner Console' : 'VIP Streamer',
          game_name: licData?.game || 'Free Fire MAX',
          is_online: false,
          is_active: licData?.status !== 'BANNED' && licData?.status !== 'EXPIRED',
          is_paused: licData?.is_paused ?? false,
          device_hwid: licData?.device_hwid || '',
          devices_used: licData?.devices_used ?? 0,
          devices_max: licData?.devices_max ?? 1
        })

        if (ctrlData && isMounted) {
          const rawMerged: StreamerControlRecord = {
            ...defaults,
            ...(ctrlData as StreamerControlRecord),
            aim_silent: Boolean(ctrlData.aim_silent ?? defaults.aim_silent),
            hit_rate: Number(ctrlData.hit_rate ?? defaults.hit_rate),
            ignore_knocked: Boolean(ctrlData.ignore_knocked ?? defaults.ignore_knocked),
            show_aim_line: Boolean(ctrlData.show_aim_line ?? defaults.show_aim_line),
            show_aim_fov: Boolean(ctrlData.show_aim_fov ?? defaults.show_aim_fov),
            aim_fov: Number(ctrlData.aim_fov ?? defaults.aim_fov),
            esp_box: Boolean(ctrlData.esp_box ?? defaults.esp_box),
            esp_line: Boolean(ctrlData.esp_line ?? defaults.esp_line),
            esp_skeleton: Boolean(ctrlData.esp_skeleton ?? defaults.esp_skeleton),
            esp_name: Boolean(ctrlData.esp_name ?? defaults.esp_name),
            esp_distance: Boolean(ctrlData.esp_distance ?? defaults.esp_distance),
            esp_health: Boolean(ctrlData.esp_health ?? defaults.esp_health),
            esp_count: Boolean(ctrlData.esp_count ?? defaults.esp_count),
            esp_radar: Boolean(ctrlData.esp_radar ?? defaults.esp_radar),
            speed_hack: Boolean(ctrlData.speed_hack ?? defaults.speed_hack),
            speed_multiplier: Number(ctrlData.speed_multiplier ?? defaults.speed_multiplier),
            ghost_hack: Boolean(ctrlData.ghost_hack ?? defaults.ghost_hack),
            no_reload: Boolean(ctrlData.no_reload ?? defaults.no_reload),
            no_recoil: Boolean(ctrlData.no_recoil ?? defaults.no_recoil),
            theme_color_index: Number(ctrlData.theme_color_index ?? defaults.theme_color_index),
            emergency_purge: Boolean(ctrlData.emergency_purge ?? defaults.emergency_purge),
            device_hwid: licData?.device_hwid || ctrlData.device_hwid || '',
            devices_used: licData?.devices_used ?? ctrlData.devices_used ?? 0,
            devices_max: licData?.devices_max ?? ctrlData.devices_max ?? 1,
            last_heartbeat: ctrlData.last_heartbeat || licData?.last_heartbeat,
            is_paused: licData?.is_paused ?? ctrlData.is_paused ?? false
          }
          const activelyPlaying = isStreamerKeyActivelyPlaying(rawMerged)
          setRecord({ ...rawMerged, is_online: activelyPlaying })
          setIsLiveConnected(true)

          // If DB had stale is_online=true or null columns, normalize row in background
          if ((ctrlData.is_online && !activelyPlaying) || ctrlData.esp_box === null || ctrlData.aim_silent === null) {
            supabase
              .from('rymon_streamer_controls')
              .update({
                ...rawMerged,
                is_online: activelyPlaying,
                updated_at: new Date().toISOString()
              })
              .eq('license_key', currentKey)
              .then(() => {})
          }
        } else if (isMounted) {
          setRecord(defaults)
          setIsLiveConnected(true)
          try {
            await supabase
              .from('rymon_streamer_controls')
              .upsert(
                { ...defaults, updated_at: new Date().toISOString() },
                { onConflict: 'license_key' }
              )
          } catch {}
        }
      } catch {
        // Fallback
      }
    }

    loadTelemetry()

    const channel = supabase
      .channel(`streamer-remote-${currentKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rymon_streamer_controls',
          filter: `license_key=eq.${currentKey}`
        },
        (payload) => {
          if (payload.new && isMounted) {
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
        if (status === 'SUBSCRIBED' && isMounted) {
          setIsLiveConnected(true)
        }
      })

    return () => {
      isMounted = false
      if (supabase) supabase.removeChannel(channel)
    }
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

  // 5. Dynamic Ping Telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setPing(Math.floor(22 + Math.random() * 14))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // 6. REAL AUTHENTICATION HANDLERS
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    const res = await loginWithCredentials(staffUsername, staffPassword)
    setAuthLoading(false)

    if (res.success && res.user) {
      setCurrentUser(res.user)
      setWalletBalance(res.user.balance)
      setIsAuthenticated(true)
      localStorage.setItem('rymon_session_user', JSON.stringify(res.user))

      showToast(`Welcome back, ${res.user.username} (${res.user.role.toUpperCase()})!`)
      setActiveTab('overview')
    } else {
      setAuthError(res.error || 'Authentication failed. Please verify credentials.')
    }
  }

  const handleKeyAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    const res = await verifyLicenseKey(keyInput)
    setAuthLoading(false)

    if (res.valid && res.key) {
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
      setAuthError(res.error || 'Invalid license key.')
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

  // 7. KEY GENERATION ENGINE WITH DYNAMIC DEFAULT + INDIVIDUAL USER PRICING
  const effectiveUserPrices = useMemo(() => {
    return getEffectivePriceMap(currentUser?.username)
  }, [currentUser?.username, globalPrices, allCustomUserMaps])

  const hasCustomPricingForCurrentUser = useMemo(() => {
    if (!currentUser?.username) return false
    return Boolean(getUserCustomPriceMap(currentUser.username))
  }, [currentUser?.username, allCustomUserMaps])

  const unitPlanPrice = effectiveUserPrices[genDuration] ?? 35
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
    if (targetPriceUser.toLowerCase() === username.toLowerCase()) {
      setCustomUserPrices({ ...globalPrices })
    }
    showToast(`Reverted @${username} to global default key prices.`)
  }

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    setGenError('')

    setAuthLoading(true)
    const res = await generateLicenseKeyBackend({
      creator: currentUser,
      game: genGame,
      duration: genDuration,
      customPrefix: genCustomPrefix,
      devicesMax: genDevicesMax,
      quantity: genQuantity
    })
    setAuthLoading(false)

    if (res.success && res.key) {
      setGenCreatedKeysList(res.keys && res.keys.length > 0 ? res.keys : [res.key])
      if (res.remainingBalance !== undefined) {
        setWalletBalance(res.remainingBalance)
        const updatedUser = { ...currentUser, balance: res.remainingBalance }
        setCurrentUser(updatedUser)
        localStorage.setItem('rymon_session_user', JSON.stringify(updatedUser))
      }
      const createdCount = res.keys?.length || 1
      showToast(
        createdCount > 1
          ? `⚡ Generated ${createdCount} keys (${genDuration})! Wallet updated.`
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
        if (currentUser?.username.toLowerCase() === topUpTargetUser.toLowerCase()) {
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
  const toggleFeature = async (field: keyof StreamerControlRecord) => {
    if (!currentKey) {
      showToast('⚠️ Please select a Target License Key above to control.')
      return
    }
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
    const newVal = !Boolean(baseRecord[field])
    const nowIso = new Date().toISOString()
    const nextRecord: StreamerControlRecord = {
      ...baseRecord,
      license_key: currentKey,
      [field]: newVal,
      updated_at: nowIso
    }
    setRecord(nextRecord)
    setStreamerControls((prev) => {
      const exists = prev.some((c) => c.license_key === currentKey)
      if (!exists) return [nextRecord, ...prev]
      return prev.map((c) => (c.license_key === currentKey ? { ...c, [field]: newVal, updated_at: nowIso } : c))
    })

    if (supabase) {
      try {
        const { error } = await supabase
          .from('rymon_streamer_controls')
          .upsert(
            {
              ...nextRecord,
              updated_at: nowIso
            },
            { onConflict: 'license_key' }
          )
        if (error) {
          await supabase
            .from('rymon_streamer_controls')
            .update({ [field]: newVal, updated_at: nowIso })
            .eq('license_key', currentKey)
        }
      } catch (err) {
        console.warn('Sync warning:', err)
      }
    }
  }

  const handleSliderChange = (field: keyof StreamerControlRecord, val: number) => {
    if (!currentKey) return
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

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current)
    sliderTimerRef.current = setTimeout(async () => {
      if (supabase && currentKey) {
        try {
          const ts = new Date().toISOString()
          const { error } = await supabase
            .from('rymon_streamer_controls')
            .upsert({ ...nextRecord, [field]: val, updated_at: ts }, { onConflict: 'license_key' })
          if (error) {
            await supabase
              .from('rymon_streamer_controls')
              .update({ [field]: val, updated_at: ts })
              .eq('license_key', currentKey)
          }
        } catch (err) {
          console.warn('Sync warning:', err)
        }
      }
    }, 80)
  }

  const setThemePreset = async (idx: number) => {
    if (!currentKey) return
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
    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .upsert(nextRecord, { onConflict: 'license_key' })
      } catch {}
    }
  }

  const handleEmergencyPurge = async () => {
    setShowPurgeModal(false)
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

  // 10. MANAGEMENT ACTION HANDLERS
  const handleCopyKey = (keyString: string) => {
    navigator.clipboard.writeText(keyString)
    setCopiedKey(keyString)
    setTimeout(() => setCopiedKey(null), 2000)
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
      `Issued By    : @${currentUser?.username || 'rymon'}`,
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
      `👤 Seller: *@${currentUser?.username || 'rymon'}*`,
      `📦 Total Keys: *${keys.length}*`,
      `⏳ Status: *Starts on 1st APK Login*`,
      '',
      ...keys.map((k, idx) => `${idx + 1}. \`${k}\``),
      '',
      `🌐 Portal & APK Download: https://greenvest.shop/`
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  const handleShareKeysTelegram = (keys: string[], label: string) => {
    if (!keys.length) {
      showToast(`No ${label} keys available to share.`)
      return
    }
    const msg = [
      `⚡ RYMON GHOST STREAMER VIP KEYS (${label.toUpperCase()})`,
      `👤 Seller: @${currentUser?.username || 'rymon'}`,
      `📦 Total Keys: ${keys.length}`,
      '',
      ...keys.map((k, idx) => `${idx + 1}. ${k}`)
    ].join('\n')
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent('https://greenvest.shop/')}&text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    )
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
      await deleteLicenseBackend(keyString)
      showToast(`🗑️ Key ${keyString} deleted.`)
      fetchAllLicenses(currentUser).then(setKeysList)
      fetchAllActivities(currentUser).then(setActivities)
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
    if (keyType === 'all' && !isOwner) {
      alert('Power restriction: Only the Root Owner can wipe ALL active keys.')
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

  const handleApplyBanStatus = async () => {
    if (!targetBanUser) {
      alert('Please select a target user.')
      return
    }
    if (targetBanUser.toLowerCase() === 'debajoyti' || targetBanUser.toLowerCase() === 'rymon') {
      alert('Action forbidden: Root Owner account cannot be banned.')
      return
    }
    const isBan = banActionType === 'ban'
    const res = await toggleBanStatusBackend(
      targetBanUser,
      'user',
      isBan,
      currentUser?.username || 'debajoyti'
    )
    if (res.success) {
      showToast(res.message)
      fetchAllAccounts(currentUser).then(setUsersList)
    } else {
      alert(res.message)
    }
  }

  const handleApplyDeleteUserKeys = async () => {
    if (!targetDeleteUser) {
      alert('Please select a target scope or user.')
      return
    }
    if (!isOwner && deleteKeyType === 'all') {
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
    if (targetExtendKey === '__ALL__') {
      await handleBulkExtendAllKeys(extendAmount)
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

  // 11. COMMUNICATION & BROADCAST HANDLERS
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      alert('Please enter both title and message.')
      return
    }

    setBroadcastLoading(true)
    setBroadcastSuccessMsg('')

    const sender = currentUser?.username || 'debajoyti'
    const res = await sendBroadcastBackend(
      sender,
      broadcastTarget,
      broadcastTitle,
      broadcastMessage,
      broadcastType,
      broadcastPin
    )

    if (broadcastSendTelegram && telegramConfig.bot_token && telegramConfig.chat_id) {
      const tgText = `<b>[${broadcastType}] ${broadcastTitle}</b>\n\n${broadcastMessage}\n\n<i>From: ${sender} via greenvest.shop</i>`
      await dispatchTelegramMessage(telegramConfig.bot_token, telegramConfig.chat_id, tgText)
    }

    setBroadcastLoading(false)
    if (res.success) {
      setBroadcastSuccessMsg(res.message)
      showToast(`Broadcast dispatched to ${broadcastTarget}!`)
      setBroadcastTitle('')
      setBroadcastMessage('')
      setIsAnnouncementDismissed(false)
      const fresh = await fetchNotifications(currentUser?.username)
      setNotifications(fresh)
    } else {
      setBroadcastSuccessMsg(`Error: ${res.message}`)
    }
  }

  const handleDeleteNotification = async (id: number) => {
    const ok = await deleteNotificationBackend(id)
    if (ok) {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      showToast('Notification removed.')
    }
  }

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault()
    setTelegramSaving(true)
    setTelegramStatusMsg('')
    const ok = await saveTelegramConfigBackend(telegramConfig)
    setTelegramSaving(false)
    if (ok) {
      setTelegramStatusMsg('Telegram Bot configuration saved to Supabase!')
      showToast('Telegram settings updated!')
    } else {
      setTelegramStatusMsg('Failed to save Telegram settings.')
    }
  }

  const handleTestTelegram = async () => {
    if (!telegramConfig.bot_token || !telegramConfig.chat_id) {
      setTelegramStatusMsg('Please enter both Bot Token and Chat/Channel ID first!')
      return
    }
    setTelegramTesting(true)
    setTelegramStatusMsg('')
    const txt =
      telegramTestMsg.trim() ||
      `⚡ <b>Rymon Sovereign Bot Test</b>\nBroadcast system active on greenvest.shop!\nDispatched by: ${currentUser?.username || 'debajoyti'}\nTimestamp: ${new Date().toLocaleTimeString()}`
    const res = await dispatchTelegramMessage(telegramConfig.bot_token, telegramConfig.chat_id, txt)
    setTelegramTesting(false)
    setTelegramStatusMsg(res.message)
    if (res.success) {
      showToast('Telegram message sent successfully!')
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
      alert('Power restriction: Only the Root Owner (debajoyti) can issue Administrator invite codes. Admins can only invite downline Resellers.')
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
      fetchReferralCodes(currentUser).then(setReferralList)
    } else {
      alert(`Error: ${res.message}`)
    }
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
    showToast('🛡️ Sovereign Enterprise Security Policy saved!')
  }

  const handleDeleteReferral = async (id: number) => {
    const ok = await deleteReferralCode(id)
    if (ok) {
      setReferralList((prev) => prev.filter((r) => r.id !== id))
      showToast('Referral code deleted.')
    }
  }

  const handleTogglePauseKey = async (keyString: string) => {
    const res = await togglePauseLicenseBackend(keyString, currentUser?.username || 'debajoyti')
    if (res.success) {
      showToast(res.message)
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
    const creatorFilter = currentUser?.role === 'reseller' ? currentUser.username : undefined
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
    try {
      const res = await fetch(SOVEREIGN_CONNECT_CONFIG.endpoint_url, {
        method: 'POST',
        headers: {
          'apikey': SOVEREIGN_CONNECT_CONFIG.anon_key,
          'Authorization': `Bearer ${SOVEREIGN_CONNECT_CONFIG.anon_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_license_key: testConnectKey.trim(),
          p_hwid: testConnectHwid.trim()
        })
      })
      const json = await res.json()
      setTestConnectResult(JSON.stringify(json, null, 2))
      showToast('Connect API verified successfully!')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network connection error'
      setTestConnectResult(JSON.stringify({ error: errMsg }, null, 2))
    } finally {
      setTestConnectLoading(false)
    }
  }

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
      if (
        keyStatusFilter === 'PLAYING' &&
        !(!k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(k.license_key.toUpperCase()))
      ) {
        return false
      }
      if (keyStatusFilter === 'PAUSED' && !(k.is_paused || k.status === 'PAUSED')) return false
      if (keyStatusFilter === 'ACTIVE' && (k.is_paused || k.status !== 'ACTIVE')) return false
      if (keyStatusFilter === 'WAITING' && k.status !== 'WAITING') return false
      if (keyStatusFilter === 'EXPIRED' && k.status !== 'EXPIRED') return false
      if (keyStatusFilter === 'BANNED' && k.status !== 'BANNED') return false
      if (keyGameFilter !== 'ALL' && k.game !== keyGameFilter) return false
      if (
        keyCreatorFilter !== 'ALL' &&
        k.creator_username.toLowerCase() !== keyCreatorFilter.toLowerCase()
      ) {
        return false
      }
      if (!searchKeyQuery.trim()) return true
      const q = searchKeyQuery.toLowerCase()
      return (
        k.license_key.toLowerCase().includes(q) ||
        k.game.toLowerCase().includes(q) ||
        k.creator_username.toLowerCase().includes(q) ||
        (k.device_hwid && k.device_hwid.toLowerCase().includes(q))
      )
    })
  }, [keysList, searchKeyQuery, keyStatusFilter, keyGameFilter, keyCreatorFilter, onlineKeySet])

  const filteredUsers = useMemo(() => {
    if (!searchUserQuery.trim()) return usersList
    const q = searchUserQuery.toLowerCase()
    return usersList.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.uplink.toLowerCase().includes(q)
    )
  }, [usersList, searchUserQuery])

  // Overview Counts
  const stats = useMemo(() => {
    const total = keysList.length
    const active = keysList.filter((k) => k.status === 'ACTIVE' && !k.is_paused).length
    const paused = keysList.filter((k) => k.is_paused || k.status === 'PAUSED').length
    const unused = keysList.filter((k) => k.status === 'WAITING').length
    const expired = keysList.filter((k) => k.status === 'EXPIRED').length
    const banned = keysList.filter((k) => k.status === 'BANNED').length
    const reset = keysList.filter((k) => k.devices_used === 0 && k.status === 'ACTIVE').length
    const playingNow = keysList.filter(
      (k) => !k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(k.license_key.toUpperCase())
    ).length
    const notPlaying = Math.max(0, total - playingNow)
    return { total, active, paused, unused, expired, banned, reset, playingNow, notPlaying }
  }, [keysList, onlineKeySet])

  const isOwner = currentUser?.role === 'owner'
  const isAdmin = currentUser?.role === 'admin'
  const isReseller = currentUser?.role === 'reseller'
  const isStreamer = currentUser?.role === 'streamer'
  const isStaff = isOwner || isAdmin || isReseller

  // Sovereign RBAC tab isolation guard
  useEffect(() => {
    const streamerAllowed = ['remote']
    if (isStreamer && !streamerAllowed.includes(activeTab)) {
      setActiveTab('remote')
    } else if (
      isReseller &&
      !['remote', 'overview', 'generate', 'keys', 'connect-api', 'extend', 'delete'].includes(activeTab)
    ) {
      setActiveTab('overview')
    } else if (
      isAdmin &&
      ![
        'remote',
        'overview',
        'generate',
        'keys',
        'connect-api',
        'extend',
        'users',
        'referrals',
        'add-balance',
        'ban',
        'delete',
        'advance'
      ].includes(activeTab)
    ) {
      setActiveTab('overview')
    }
  }, [isStreamer, isReseller, isAdmin, activeTab])

  return (
    <div style={styles.appShell}>
      {/* Background Cyber Ambient */}
      <div style={styles.ambientGrid} />

      {/* ── TOP NAV HEADER ─────────────────────────────────────────────────── */}
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={styles.mobileMenuToggle}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <div style={styles.brandCluster}>
            <div style={styles.logoFrame}>
              <img
                src="/rymon_logo.jpg"
                alt="Rymon"
                style={styles.logoImage}
                onError={(e) => {
                  ;(e.target as any).src = 'https://placehold.co/80x80/07090e/00d9ff?text=RM'
                }}
              />
            </div>
            <div>
              <div style={styles.brandTitleText}>
                RYMON <span style={styles.brandCyanPill}>GHOST CONNECT</span>
              </div>
              <div style={styles.brandSubText}>SOVEREIGN KEYAUTH & TELEMETRY REMOTE</div>
            </div>
          </div>
        </div>

        <div style={styles.headerRight}>
          {/* Wallet Balance Pill */}
          {isAuthenticated && currentUser?.role !== 'streamer' && (
            <div
              style={styles.balancePill}
              onClick={() => (isOwner || isAdmin) && setActiveTab('add-balance')}
              title={isOwner || isAdmin ? 'Click to manage balances' : 'Wallet balance'}
            >
              <span style={{ color: '#00d9ff', fontSize: '13px' }}>💳</span>
              <span style={styles.balanceAmount}>
                {isOwner ? '∞ FREE (OWNER)' : `₹${walletBalance.toLocaleString('en-IN')}`}
              </span>
            </div>
          )}

          {/* Database & WebSocket Link Status */}
          <div style={styles.telemetryPill}>
            <span
              style={{
                ...styles.pulseDot,
                background: isLiveConnected ? '#05df72' : '#64748b'
              }}
            />
            <span style={styles.telemetryText}>
              {isLiveConnected ? 'LIVE SUPABASE' : 'STANDBY'}
            </span>
            <span style={styles.pingText}>{ping}ms</span>
          </div>

          {/* Notification Bell with Badge */}
          {isAuthenticated && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsNotifDrawerOpen(!isNotifDrawerOpen)}
                style={{
                  background: isNotifDrawerOpen ? 'rgba(0, 217, 255, 0.25)' : 'rgba(15, 23, 42, 0.85)',
                  border: isNotifDrawerOpen ? '1px solid #00d9ff' : '1px solid rgba(0, 217, 255, 0.35)',
                  borderRadius: '10px',
                  padding: '7px 12px',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                title="System Broadcasts & User Messages"
              >
                <span style={{ fontSize: '15px' }}>🔔</span>
                {notifications.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: '#ff3366',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 800,
                      borderRadius: '999px',
                      padding: '1px 6px',
                      boxShadow: '0 0 10px rgba(255, 51, 102, 0.8)'
                    }}
                  >
                    {notifications.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* User Profile Pill */}
          {isAuthenticated ? (
            <div style={styles.userProfilePill}>
              <div style={styles.userAvatarSquare}>
                {currentUser?.username.charAt(0).toUpperCase() || 'U'}
              </div>
              <div style={styles.userNameBlock}>
                <span style={styles.userNameText}>
                  {currentUser?.username || 'VIP Streamer'}
                </span>
                <span style={styles.userRoleTag}>
                  {currentUser?.role.toUpperCase() || 'VIP'}
                </span>
              </div>
              <button onClick={handleLogout} style={styles.headerLogoutBtn} title="Logout">
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

      {/* ── GLOBAL ANNOUNCEMENT / BROADCAST MARQUEE ────────────────────────────── */}
      {pinnedAnnouncement && !isAnnouncementDismissed && (
        <div
          style={{
            background:
              pinnedAnnouncement.type === 'ALERT'
                ? 'linear-gradient(90deg, rgba(255, 51, 102, 0.25) 0%, rgba(15, 23, 42, 0.98) 50%, rgba(255, 51, 102, 0.25) 100%)'
                : pinnedAnnouncement.type === 'WARNING'
                ? 'linear-gradient(90deg, rgba(255, 183, 0, 0.25) 0%, rgba(15, 23, 42, 0.98) 50%, rgba(255, 183, 0, 0.25) 100%)'
                : 'linear-gradient(90deg, rgba(0, 217, 255, 0.2) 0%, rgba(15, 23, 42, 0.98) 50%, rgba(0, 217, 255, 0.2) 100%)',
            borderBottom:
              pinnedAnnouncement.type === 'ALERT'
                ? '1px solid rgba(255, 51, 102, 0.5)'
                : pinnedAnnouncement.type === 'WARNING'
                ? '1px solid rgba(255, 183, 0, 0.5)'
                : '1px solid rgba(0, 217, 255, 0.4)',
            padding: '9px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            fontSize: '13px',
            color: '#e2e8f0',
            position: 'relative',
            zIndex: 45
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <span
              style={{
                background:
                  pinnedAnnouncement.type === 'ALERT'
                    ? 'rgba(255, 51, 102, 0.25)'
                    : pinnedAnnouncement.type === 'WARNING'
                    ? 'rgba(255, 183, 0, 0.25)'
                    : 'rgba(0, 217, 255, 0.25)',
                color:
                  pinnedAnnouncement.type === 'ALERT'
                    ? '#ff3366'
                    : pinnedAnnouncement.type === 'WARNING'
                    ? '#ffb700'
                    : '#00d9ff',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 800,
                fontSize: '10px',
                letterSpacing: '0.6px',
                whiteSpace: 'nowrap'
              }}
            >
              📢 {pinnedAnnouncement.type}
            </span>
            <span style={{ fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>
              {pinnedAnnouncement.title}:
            </span>
            <span
              style={{
                color: '#cbd5e1',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1
              }}
            >
              {pinnedAnnouncement.message}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              onClick={() => setIsNotifDrawerOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#00d9ff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              View All
            </button>
            <button
              onClick={() => setIsAnnouncementDismissed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0 4px',
                lineHeight: 1
              }}
              title="Dismiss announcement banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── NOTIFICATION TOAST ──────────────────────────────────────────────── */}
      {actionSuccessMsg && (
        <div style={styles.toastBanner}>
          <span>✓ {actionSuccessMsg}</span>
        </div>
      )}

      {/* ── CONDITIONAL VIEW: AUTH GATEWAY VS MAIN WORKSPACE ────────────────── */}
      {!isAuthenticated ? (
        <div style={styles.authGateBox}>
          <div style={styles.authBadge}>
            <span style={{ fontSize: '10px', marginRight: '6px' }}>🔒</span> SECURE RYMON SOVEREIGN GATEWAY
          </div>

          {/* Dual Gateway Tabs: Staff Portal vs Streamer Key */}
          <div style={styles.authTabSelector}>
            <button
              onClick={() => {
                setAuthMode('staff')
                setAuthError('')
              }}
              style={{
                ...styles.authTabBtn,
                ...(authMode === 'staff' ? styles.authTabBtnActive : {})
              }}
            >
              👤 Staff Portal (Owner / Reseller)
            </button>
            <button
              onClick={() => {
                setAuthMode('key')
                setAuthError('')
              }}
              style={{
                ...styles.authTabBtn,
                ...(authMode === 'key' ? styles.authTabBtnActive : {})
              }}
            >
              ⚡ Streamer Remote (License Key)
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
                  <h2 style={styles.authHead}>Staff Control Login</h2>
                  <p style={styles.authDesc}>
                    Authenticate with your sovereign account to manage licenses, generate keys, and oversee user balances.
                  </p>

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

                    <button type="submit" disabled={authLoading} style={styles.submitBtn}>
                      {authLoading ? 'AUTHENTICATING SUPABASE...' : 'SIGN IN TO DASHBOARD'}
                    </button>

                    {authError && <div style={styles.errorBox}>{authError}</div>}
                  </form>
                </div>
              ) : (
                <div>
                  <h2 style={styles.authHead}>Register with Referral Code</h2>
                  <p style={styles.authDesc}>
                    Enter an invitation code issued by the owner to create your genuine sovereign Reseller or Admin account.
                  </p>

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
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Each code automatically assigns your role and pre-loaded wallet credit.
                      </span>
                    </div>

                    <button type="submit" disabled={regLoading} style={styles.submitBtn}>
                      {regLoading ? 'VERIFYING REFERRAL CODE...' : '⚡ CREATE SOVEREIGN ACCOUNT'}
                    </button>

                    {regError && <div style={styles.errorBox}>{regError}</div>}
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 style={styles.authHead}>Connect Streamer Remote</h2>
              <p style={styles.authDesc}>
                Enter your registered Rymon license key to synchronize hardware telemetry and aim assistance in real-time.
              </p>

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

                <button type="submit" disabled={authLoading} style={styles.submitBtn}>
                  {authLoading ? 'VERIFYING KEYAUTH...' : 'CONNECT GHOST REMOTE'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDownloadModal(true)}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(0, 217, 255, 0.12)',
                    border: '1px solid rgba(0, 217, 255, 0.35)',
                    color: '#00d9ff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>📥</span> DOWNLOAD RYMON STREAMER APK
                </button>

                {authError && <div style={styles.errorBox}>{authError}</div>}
              </form>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.mainLayout}>
          {/* LEFT SIDEBAR NAVIGATION */}
          <aside
            style={{
              ...styles.sidebar,
              ...(mobileMenuOpen ? styles.sidebarMobileOpen : {})
            }}
          >
            {/* User mini status */}
            <div style={styles.sidebarUserCard}>
              <div style={styles.sidebarUserRow}>
                <div style={styles.sidebarUserAvatar}>
                  {currentUser?.username.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div style={styles.sidebarUserName}>
                    {currentUser?.username || 'VIP Streamer'}
                  </div>
                  <div style={styles.sidebarUserSub}>
                    <span style={styles.activeDot} /> {currentUser?.role.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>

            {/* Nav Categories */}
            <nav style={styles.navStack}>
              {/* Telemetry Remote */}
              <div style={styles.navCategoryHeader}>TELEMETRY & HARDWARE</div>
              <button
                onClick={() => {
                  setActiveTab('remote')
                  setMobileMenuOpen(false)
                }}
                style={{
                  ...styles.navItem,
                  ...(activeTab === 'remote' ? styles.navItemActive : {})
                }}
              >
                <span style={styles.navIcon}>⚡</span>
                <span>Streamer Remote</span>
                <span style={styles.cyanMiniBadge}>LIVE</span>
              </button>

              <button
                onClick={() => {
                  setShowDownloadModal(true)
                  setMobileMenuOpen(false)
                }}
                style={{
                  ...styles.navItem,
                  color: '#00d9ff'
                }}
              >
                <span style={styles.navIcon}>📥</span>
                <span>Download APK</span>
                <span style={{ ...styles.cyanMiniBadge, background: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff', border: '1px solid rgba(0, 217, 255, 0.4)' }}>BUILDS</span>
              </button>

              {/* Staff-Only Navigation Sections (Hidden from key-login Streamers) */}
              {!isStreamer && (
                <>
                  {/* Dashboards */}
                  <div style={styles.navCategoryHeader}>DASHBOARDS</div>
                  <button
                    onClick={() => {
                      setActiveTab('overview')
                      setMobileMenuOpen(false)
                    }}
                    style={{
                      ...styles.navItem,
                      ...(activeTab === 'overview' ? styles.navItemActive : {})
                    }}
                  >
                    <span style={styles.navIcon}>📊</span>
                    <span>Overview</span>
                  </button>

                  {/* User System */}
                  {isStaff && (
                    <>
                      <div style={styles.navCategoryHeader}>USER SYSTEM</div>
                      <button
                        onClick={() => {
                          setActiveTab('generate')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'generate' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>⚡</span>
                        <span>Generate Key</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('keys')
                          setMobileMenuOpen(false)
                        }}
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
                          onClick={() => {
                            setActiveTab('telegram')
                            setMobileMenuOpen(false)
                          }}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'telegram' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>✈️</span>
                          <span>Telegram Bot</span>
                          <span style={styles.cyanMiniBadge}>OWNER</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActiveTab('connect-api')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'connect-api' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🔗</span>
                        <span>Connect URL & APK</span>
                        <span style={styles.cyanMiniBadge}>SOVEREIGN</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('extend')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'extend' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>📅</span>
                        <span>Extend Keys</span>
                      </button>
                      {isReseller && (
                        <button
                          onClick={() => {
                            setActiveTab('delete')
                            setMobileMenuOpen(false)
                          }}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'delete' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>🗑️</span>
                          <span>Clean Expired / Unused</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Management (Owner & Admin) */}
                  {(isOwner || isAdmin) && (
                    <>
                      <div style={styles.navCategoryHeader}>MANAGEMENT</div>
                      <button
                        onClick={() => {
                          setActiveTab('users')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'users' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>👥</span>
                        <span>{isOwner ? 'Users (All)' : 'My Resellers'}</span>
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => {
                            setActiveTab('broadcast')
                            setMobileMenuOpen(false)
                          }}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'broadcast' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>📢</span>
                          <span>Talk to Users / Broadcast</span>
                          <span style={styles.cyanMiniBadge}>OWNER</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActiveTab('referrals')
                          setMobileMenuOpen(false)
                        }}
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
                        onClick={() => {
                          setActiveTab('add-balance')
                          setMobileMenuOpen(false)
                        }}
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
                        onClick={() => {
                          setActiveTab('delete')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'delete' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🗑️</span>
                        <span>{isOwner ? 'Delete Keys' : 'Clean Expired Keys'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('ban')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'ban' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>🛡️</span>
                        <span>Ban / Unban</span>
                      </button>
                    </>
                  )}

                  {/* Core Config (Owner & Admin Pricing) */}
                  {(isOwner || isAdmin) && (
                    <>
                      <div style={styles.navCategoryHeader}>CORE CONFIG</div>
                      <button
                        onClick={() => {
                          setActiveTab('advance')
                          setMobileMenuOpen(false)
                        }}
                        style={{
                          ...styles.navItem,
                          ...(activeTab === 'advance' ? styles.navItemActive : {})
                        }}
                      >
                        <span style={styles.navIcon}>💰</span>
                        <span>{isOwner ? 'Pricing & Advance' : 'Reseller Pricing'}</span>
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => {
                            setActiveTab('sql-setup')
                            setMobileMenuOpen(false)
                          }}
                          style={{
                            ...styles.navItem,
                            ...(activeTab === 'sql-setup' ? styles.navItemActive : {})
                          }}
                        >
                          <span style={styles.navIcon}>🗄️</span>
                          <span>Database SQL</span>
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </nav>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main style={styles.contentPane}>
            {/* 1. OVERVIEW DASHBOARD */}
            {activeTab === 'overview' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Operational Matrix</h2>
                    <p style={styles.pageSubtitle}>
                      Live telemetry, active authorizations, and real-time licensing transactions. Click any counter to filter keys.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● SUPABASE ACTIVE</span>
                    <span style={styles.timeTag}>greenvest.shop</span>
                  </div>
                </div>

                {/* Metric Counters (Clickable to filter License Keys) */}
                <div style={styles.statGrid}>
                  <div
                    onClick={() => {
                      setKeyStatusFilter('PLAYING')
                      setActiveTab('keys')
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
                      setActiveTab('keys')
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
                      setActiveTab('keys')
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
                      setActiveTab('keys')
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
                      setActiveTab('keys')
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
                      setActiveTab('keys')
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
                      <span>⚪ NOT PLAYING / OFFLINE: {stats.notPlaying}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {stats.playingNow > 0
                        ? `Live in-game daemon connected (${stats.playingNow} active match session${stats.playingNow > 1 ? 's' : ''})`
                        : 'All licensed devices are currently offline / not in a match'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {keysList
                      .filter((k) => !k.is_paused && k.status === 'ACTIVE' && onlineKeySet.has(k.license_key.toUpperCase()))
                      .slice(0, 4)
                      .map((k) => (
                        <button
                          key={k.license_key}
                          onClick={() => {
                            setCurrentKey(k.license_key)
                            setActiveTab('remote')
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
                <div style={styles.dualGrid}>
                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>⚡ Fast Actions</h4>
                      <span style={styles.cyanMiniBadge}>SOVEREIGN</span>
                    </div>
                    <div style={styles.quickGrid}>
                      <button
                        onClick={() => setActiveTab('remote')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>⚡</div>
                        <div style={styles.quickActionTitle}>Streamer Remote</div>
                        <div style={styles.quickActionSub}>Direct Android Controller</div>
                      </button>
                      <button
                        onClick={() => setActiveTab('generate')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>🔑</div>
                        <div style={styles.quickActionTitle}>Generate License</div>
                        <div style={styles.quickActionSub}>Single or Bulk Keys (1–50)</div>
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
                        <div style={styles.quickActionSub}>1-Click Copy Waiting Keys</div>
                      </button>
                      <button
                        onClick={() => handleQuickBulkDelete('expired')}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <div style={styles.quickActionIcon}>🧹</div>
                        <div style={{ ...styles.quickActionTitle, color: '#ef4444' }}>
                          Purge Expired ({stats.expired})
                        </div>
                        <div style={styles.quickActionSub}>1-Click Delete Expired Keys</div>
                      </button>
                      <button
                        onClick={handleBulkResetAllHwid}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(0, 217, 255, 0.4)' }}
                      >
                        <div style={styles.quickActionIcon}>🔄</div>
                        <div style={{ ...styles.quickActionTitle, color: '#00d9ff' }}>Reset All HWID</div>
                        <div style={styles.quickActionSub}>Unbind All Devices Instantly</div>
                      </button>
                      <button
                        onClick={() => setActiveTab('keys')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>🗂️</div>
                        <div style={styles.quickActionTitle}>Manage All Keys</div>
                        <div style={styles.quickActionSub}>Filter, Pause, Delete, Extend</div>
                      </button>
                      <button
                        onClick={() => handleBulkPauseAllKeys(true)}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(255, 183, 0, 0.35)' }}
                      >
                        <div style={styles.quickActionIcon}>⏸️</div>
                        <div style={{ ...styles.quickActionTitle, color: '#ffb700' }}>Pause All Keys</div>
                        <div style={styles.quickActionSub}>Global Maintenance Freeze</div>
                      </button>
                      <button
                        onClick={() => handleBulkPauseAllKeys(false)}
                        style={{ ...styles.quickActionCard, borderColor: 'rgba(5, 223, 114, 0.35)' }}
                      >
                        <div style={styles.quickActionIcon}>▶️</div>
                        <div style={{ ...styles.quickActionTitle, color: '#05df72' }}>Resume All Keys</div>
                        <div style={styles.quickActionSub}>Unfreeze All Licenses</div>
                      </button>
                    </div>
                  </div>

                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>📋 Real-time Activity Log</h4>
                      <span style={styles.cyanMiniBadge}>AUDIT</span>
                    </div>
                    <div style={styles.activityFeed}>
                      {activities.slice(0, 5).map((act) => (
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
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. TOP UP / TRANSFER USER BALANCE */}
            {activeTab === 'add-balance' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? 'Top Up User Balance (Free Owner Mint)' : 'Transfer Balance to Reseller'}
                    </h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Create and credit unlimited balance into any Admin or Reseller account for ₹0 cost.'
                        : 'Transfer balance from your own Admin wallet directly to your invited Resellers.'}
                    </p>
                  </div>
                  <span style={styles.cyanMiniBadge}>
                    {isOwner ? '👑 OWNER FREE MINT' : `🛡️ ADMIN WALLET: ₹${walletBalance.toLocaleString('en-IN')}`}
                  </span>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(5,223,114,0.15)', color: '#05df72' }}>
                          💼
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                            {isOwner ? 'Top Up User Balance' : 'Transfer Wallet Balance to Reseller'}
                          </h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                            {isOwner
                              ? 'Set or add balance to any Admin or Reseller'
                              : 'Amount transferred is deducted directly from your Admin wallet'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleTopUpSubmit} style={{ marginTop: '24px' }}>
                      <div style={styles.formGrid2Col}>
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
                                    u.username.toLowerCase() !== currentUser?.username.toLowerCase()
                              )
                              .map((u) => (
                                <option key={u.id} value={u.username}>
                                  @{u.username} ({u.role.toUpperCase()} • Bal: ₹{u.balance.toLocaleString('en-IN')})
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
                            ? 'PROCESSING ON SUPABASE...'
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
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Generate License Key (Single & Bulk)</h2>
                    <p style={styles.pageSubtitle}>
                      Seller username <strong>@{currentUser?.username}</strong> will be displayed as a glowing VIP badge inside the APK. New keys start in <strong>WAITING (Unused)</strong> status and only begin their countdown on 1st APK login.
                    </p>
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
                    <div style={styles.balancePill}>
                      <span>Wallet Balance:</span>
                      <strong style={{ color: '#00d9ff', marginLeft: '6px' }}>
                        {isOwner ? '∞ FREE (OWNER)' : `₹${walletBalance.toLocaleString('en-IN')}`}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <form onSubmit={handleGenerateKey}>
                      <div style={styles.formGrid2Col}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>SELECT TARGET GAME</label>
                          <select
                            value={genGame}
                            onChange={(e) => setGenGame(e.target.value)}
                            style={styles.selectInput}
                          >
                            <option value="Free Fire MAX">Free Fire MAX</option>
                            <option value="BGMI">BGMI</option>
                            <option value="PUBG">PUBG Mobile</option>
                          </select>
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

                      <div style={{ ...styles.formGrid2Col, marginTop: '16px' }}>
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

                      {/* Cost Summary Box */}
                      <div style={styles.invoiceSummaryBox}>
                        <div>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                            Invoice Cost ({genQuantity} Key{genQuantity > 1 ? 's' : ''} × {genDevicesMax} Device{genDevicesMax > 1 ? 's' : ''} × ₹{unitPlanPrice}):
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: '#00d9ff' }}>
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
                          ? 'CREATING ON SUPABASE...'
                          : genQuantity > 1
                          ? `⚡ GENERATE ${genQuantity} KEYS NOW`
                          : 'GENERATE & DEDUCT WALLET'}
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
                              onClick={() => handleDownloadKeysTxt(genCreatedKeysList, `${genDuration}_${genGame}`)}
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
                              onClick={() => handleShareKeysWhatsApp(genCreatedKeysList, `${genDuration} (${genGame})`)}
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
                            <button
                              type="button"
                              onClick={() => handleShareKeysTelegram(genCreatedKeysList, `${genDuration} (${genGame})`)}
                              style={{
                                ...styles.copyKeyBtn,
                                background: 'rgba(56, 189, 248, 0.2)',
                                border: '1px solid #38bdf8',
                                color: '#38bdf8',
                                fontWeight: 800
                              }}
                            >
                              ✈️ TELEGRAM
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
                              <button
                                type="button"
                                onClick={() => handleCopyKey(kStr)}
                                style={styles.copyKeyBtn}
                              >
                                {copiedKey === kStr ? 'COPIED!' : 'COPY'}
                              </button>
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
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      License Keys Command Center ({filteredKeys.length} / {stats.total})
                    </h2>
                    <p style={styles.pageSubtitle}>
                      {currentUser?.role === 'reseller'
                        ? `Showing licenses issued by @${currentUser.username} • Auto-detects Expired & Unused keys in real time.`
                        : 'Complete directory of all registered keys across all games with 1-click bulk operations.'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={keyGameFilter}
                      onChange={(e) => setKeyGameFilter(e.target.value)}
                      style={{
                        ...styles.selectInput,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: '12px'
                      }}
                    >
                      <option value="ALL">🎮 All Games</option>
                      <option value="Free Fire MAX">Free Fire MAX</option>
                      <option value="BGMI">BGMI</option>
                      <option value="PUBG">PUBG Mobile</option>
                    </select>
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
                    <div style={styles.searchBox}>
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
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
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

                  {/* Row 2: Senior Dev 1-Click Bulk Operations Toolbar */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
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
                      onClick={() => handleBulkExtendAllKeys(1)}
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
                      <span>➕</span> +1 DAY ALL
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
                    {isOwner && (
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

                <div style={styles.tableCard}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.dataTable}>
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
                                <span style={styles.planBadge}>{k.plan_duration}</span>
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={styles.avatarTiny}>
                                    {k.creator_username.charAt(0).toUpperCase()}
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
                                      setCurrentKey(k.license_key)
                                      setActiveTab('remote')
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
                                      setActiveTab('extend')
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
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? `Registered Users (${usersList.length})` : `My Downline Resellers & Team (${usersList.length})`}
                    </h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Manage all administrative roles, uplinks, and global wallet authorizations in Supabase.'
                        : 'Manage your invited downline Resellers, transfer wallet balance, and set custom Reseller key prices.'}
                    </p>
                  </div>
                  <div style={styles.searchBox}>
                    <input
                      type="text"
                      value={searchUserQuery}
                      onChange={(e) => setSearchUserQuery(e.target.value)}
                      placeholder="Search username, email, uplink..."
                      style={styles.searchInput}
                    />
                  </div>
                </div>

                <div style={styles.tableCard}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.dataTable}>
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
                          const isSelfRow = u.username.toLowerCase() === currentUser?.username.toLowerCase()
                          const canManageRow = isOwner ? u.role !== 'owner' : !isSelfRow && u.role === 'reseller'
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
                                    {u.username.charAt(0).toUpperCase()}
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
                                <span style={styles.roleBadge}>{u.role.toUpperCase()}</span>
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
                                    👑 ROOT OWNER
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
                                        setActiveTab('add-balance')
                                      }}
                                      style={styles.actionIconBtn}
                                      title={isOwner ? 'Top up balance (Free Mint)' : 'Transfer balance from your wallet'}
                                    >
                                      💼
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleSelectTargetPriceUser(u.username)
                                        setActiveTab('advance')
                                      }}
                                      style={{ ...styles.actionIconBtn, color: '#fde047' }}
                                      title="Set Individual Key Prices for this User"
                                    >
                                      💰
                                    </button>
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
                                      onClick={() => {
                                        setTargetBanUser(u.username)
                                        setActiveTab('ban')
                                      }}
                                      style={styles.actionIconBtn}
                                      title="Ban / Unban User"
                                    >
                                      🛡️
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>Protected</span>
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

            {/* 6. BULK BAN / UNBAN (MEDIA_1791705541648_1FDBB7B4.PNG) */}
            {activeTab === 'ban' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Bulk Ban / Unban Facility</h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Banning an Admin or Reseller immediately revokes access for their account.'
                        : 'Suspend or restore access for any Reseller in your downline team.'}
                    </p>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Target {isOwner ? 'User (Admin / Reseller)' : 'Downline Reseller'} <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={targetBanUser}
                        onChange={(e) => setTargetBanUser(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="">-- Select a User --</option>
                        {usersList
                          .filter((u) =>
                            isOwner
                              ? u.role !== 'owner'
                              : u.role === 'reseller' && u.username.toLowerCase() !== currentUser?.username.toLowerCase()
                          )
                          .map((u) => (
                            <option key={u.id} value={u.username}>
                              {u.username} ({u.role.toUpperCase()} • {u.status})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                      <label style={styles.formLabel}>
                        Action to Perform <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={banActionType}
                        onChange={(e) => setBanActionType(e.target.value as any)}
                        style={styles.selectInput}
                      >
                        <option value="ban">Ban User (Revoke Access)</option>
                        <option value="unban">Unban User (Restore Access)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleApplyBanStatus}
                      style={{
                        ...styles.submitBtn,
                        marginTop: '24px',
                        background: banActionType === 'ban' ? '#ef4444' : '#05df72',
                        color: banActionType === 'ban' ? '#fff' : '#07090e'
                      }}
                    >
                      Apply Status Change
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 7. DELETE KEYS */}
            {activeTab === 'delete' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner
                        ? 'Delete & Purge License Keys'
                        : isAdmin
                        ? 'Clean Team Expired & Unused Keys'
                        : 'Clean My Expired & Unused Keys'}
                    </h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? '1-click global purge or targeted deletion of Expired, Unused (Waiting), or ALL keys across the platform.'
                        : '1-click cleanup of Expired or Unused (Waiting) keys across your account and downline.'}
                    </p>
                  </div>
                </div>

                {/* 1-Click Quick Purge Bar */}
                <div style={{ ...styles.statGrid, marginBottom: '24px' }}>
                  <div
                    onClick={() => handleQuickBulkDelete('expired')}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(239, 68, 68, 0.45)',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(13, 17, 26, 0.92) 100%)'
                    }}
                  >
                    <div style={{ ...styles.statIconFrame, color: '#ef4444' }}>🧹</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#ef4444' }}>{stats.expired}</div>
                      <div style={{ ...styles.statLabel, color: '#fca5a5', fontWeight: 700 }}>
                        1-Click Purge Expired Keys
                      </div>
                    </div>
                  </div>
                  <div
                    onClick={() => handleQuickBulkDelete('unused')}
                    style={{
                      ...styles.statCard,
                      cursor: 'pointer',
                      borderColor: 'rgba(234, 179, 8, 0.45)',
                      background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(13, 17, 26, 0.92) 100%)'
                    }}
                  >
                    <div style={{ ...styles.statIconFrame, color: '#eab308' }}>🗑️</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#eab308' }}>{stats.unused}</div>
                      <div style={{ ...styles.statLabel, color: '#fde047', fontWeight: 700 }}>
                        1-Click Purge Unused Keys
                      </div>
                    </div>
                  </div>
                  {isOwner && (
                    <div
                      onClick={() => handleQuickBulkDelete('all')}
                      style={{
                        ...styles.statCard,
                        cursor: 'pointer',
                        borderColor: 'rgba(220, 38, 38, 0.6)',
                        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.22) 0%, rgba(13, 17, 26, 0.95) 100%)'
                      }}
                    >
                      <div style={{ ...styles.statIconFrame, color: '#ffffff' }}>💥</div>
                      <div>
                        <div style={{ ...styles.statNum, color: '#ffffff' }}>{stats.total}</div>
                        <div style={{ ...styles.statLabel, color: '#fecaca', fontWeight: 800 }}>
                          1-Click Wipe ALL Keys (Owner)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
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
                              @{u.username} ({u.role.toUpperCase()})
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
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Extend License Duration (Max 30 Days)</h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Add operational days to any key or all active keys globally (capped at 30 days max validity).'
                        : 'Extend your keys by adding days (max 30 days validity). Extension cost is deducted from your wallet.'}
                    </p>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
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
                        onChange={(e) => setExtendAmount(Math.min(30, parseInt(e.target.value) || 30))}
                        style={styles.selectInput}
                      >
                        <option value="1">1 Day</option>
                        <option value="3">3 Days</option>
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
                      const actorWallet = currentUser?.balance ?? 0

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
                              color: isOwner ? '#fde047' : finalCost > actorWallet ? '#ef4444' : '#05df72'
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

            {/* 8B. TALK TO USERS & BROADCAST SYSTEM */}
            {activeTab === 'broadcast' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Talk to Users & Broadcast System</h2>
                    <p style={styles.pageSubtitle}>
                      Send live announcements, maintenance alerts, and private notices to all registered users or specific accounts in real-time.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● SUPABASE REALTIME LIVE</span>
                    <span style={styles.cyanMiniBadge}>ZERO LATENCY</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                  {/* Left Column: Compose Message */}
                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>📢 Compose Real-Time Broadcast</h4>
                      <span style={styles.cyanMiniBadge}>DISPATCH GATEWAY</span>
                    </div>

                    <form onSubmit={handleSendBroadcast} style={{ marginTop: '16px' }}>
                      {/* Recipient */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          TARGET AUDIENCE / RECIPIENT <span style={{ color: '#00d9ff' }}>*</span>
                        </label>
                        <select
                          value={broadcastTarget}
                          onChange={(e) => setBroadcastTarget(e.target.value)}
                          style={styles.selectInput}
                        >
                          <option value="ALL">📢 ALL USERS (Global Announcement - Everyone Sees)</option>
                          <optgroup label="Specific Registered Users">
                            {usersList.map((u) => (
                              <option key={u.id} value={u.username}>
                                👤 {u.username} ({u.role.toUpperCase()} • ₹{u.balance.toLocaleString('en-IN')})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {/* Message Severity/Type */}
                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>MESSAGE CATEGORY & SEVERITY</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                          {(['INFO', 'UPDATE', 'WARNING', 'ALERT'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setBroadcastType(t)}
                              style={{
                                padding: '8px 4px',
                                borderRadius: '8px',
                                border: broadcastType === t ? '1px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                                background:
                                  broadcastType === t
                                    ? t === 'ALERT'
                                      ? 'rgba(255,51,102,0.25)'
                                      : t === 'WARNING'
                                      ? 'rgba(255,183,0,0.25)'
                                      : t === 'UPDATE'
                                      ? 'rgba(5,223,114,0.25)'
                                      : 'rgba(0,217,255,0.25)'
                                    : 'rgba(15,23,42,0.6)',
                                color:
                                  t === 'ALERT'
                                    ? '#ff3366'
                                    : t === 'WARNING'
                                    ? '#ffb700'
                                    : t === 'UPDATE'
                                    ? '#05df72'
                                    : '#00d9ff',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              {t === 'ALERT' ? '🚨 ALERT' : t === 'WARNING' ? '⚠️ WARN' : t === 'UPDATE' ? '⚡ UPDATE' : 'ℹ️ INFO'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Title */}
                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>
                          NOTICE TITLE <span style={{ color: '#00d9ff' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={broadcastTitle}
                          onChange={(e) => setBroadcastTitle(e.target.value)}
                          placeholder="e.g. PUBG Mobile 3.7 Injection Bypass Released"
                          style={styles.keyInput}
                          required
                        />
                      </div>

                      {/* Message Body */}
                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>
                          MESSAGE CONTENT <span style={{ color: '#00d9ff' }}>*</span>
                        </label>
                        <textarea
                          rows={4}
                          value={broadcastMessage}
                          onChange={(e) => setBroadcastMessage(e.target.value)}
                          placeholder="Write your announcement or direct instructions here..."
                          style={{
                            ...styles.keyInput,
                            height: 'auto',
                            resize: 'vertical',
                            lineHeight: 1.5,
                            fontFamily: 'inherit'
                          }}
                          required
                        />
                      </div>

                      {/* Quick Presets */}
                      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>Presets:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setBroadcastType('UPDATE')
                            setBroadcastTitle('⚡ PUBG 3.7 & FreeFire V42 Update Released')
                            setBroadcastMessage('All memory tables, safe ESP overlays, and bypass drivers updated. Streamers can resume live games safely.')
                            setBroadcastPin(true)
                          }}
                          style={styles.chipBtn}
                        >
                          Game Update
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBroadcastType('WARNING')
                            setBroadcastTitle('⚠️ Scheduled 15-Minute Cloud Maintenance')
                            setBroadcastMessage('Database synchronization will undergo brief maintenance at 12:00 AM UTC. Active keys remain valid.')
                            setBroadcastPin(true)
                          }}
                          style={styles.chipBtn}
                        >
                          Maintenance
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBroadcastType('INFO')
                            setBroadcastTitle('💼 Reseller Balance Top-Up Bonus')
                            setBroadcastMessage('Special wallet credit promotion active today for all certified distributors. Contact owner on Telegram.')
                            setBroadcastPin(false)
                          }}
                          style={styles.chipBtn}
                        >
                          Balance Promo
                        </button>
                      </div>

                      {/* Options */}
                      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={broadcastPin}
                            onChange={(e) => setBroadcastPin(e.target.checked)}
                            style={{ accentColor: '#00d9ff' }}
                          />
                          <span>📌 Pin as Top Marquee Banner across all user dashboards</span>
                        </label>

                        {telegramConfig.bot_token && telegramConfig.chat_id && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={broadcastSendTelegram}
                              onChange={(e) => setBroadcastSendTelegram(e.target.checked)}
                              style={{ accentColor: '#00d9ff' }}
                            />
                            <span>✈️ Also dispatch to Telegram channel ({telegramConfig.channel_username || telegramConfig.chat_id})</span>
                          </label>
                        )}
                      </div>

                      {broadcastSuccessMsg && (
                        <div style={{ marginTop: '14px', fontSize: '12px', color: '#05df72', fontWeight: 600 }}>
                          ✓ {broadcastSuccessMsg}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={broadcastLoading}
                        style={{
                          ...styles.submitBtn,
                          marginTop: '20px',
                          background: 'linear-gradient(135deg, #00d9ff 0%, #0284c7 100%)',
                          color: '#07090e',
                          fontWeight: 800
                        }}
                      >
                        {broadcastLoading ? 'DISPATCHING ACROSS SUPABASE REALTIME...' : '📢 DISPATCH BROADCAST IN REAL-TIME'}
                      </button>
                    </form>
                  </div>

                  {/* Right Column: Live Feed & History */}
                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>📋 Active Broadcasts & Message Log ({notifications.length})</h4>
                      <span style={styles.cyanMiniBadge}>LIVE AUDIT FEED</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
                      <button
                        onClick={() => setNotifFilter('all')}
                        style={{
                          ...styles.chipBtn,
                          background: notifFilter === 'all' ? 'rgba(0,217,255,0.2)' : 'rgba(15,23,42,0.6)',
                          color: notifFilter === 'all' ? '#00d9ff' : '#94a3b8'
                        }}
                      >
                        All ({notifications.length})
                      </button>
                      <button
                        onClick={() => setNotifFilter('broadcasts')}
                        style={{
                          ...styles.chipBtn,
                          background: notifFilter === 'broadcasts' ? 'rgba(0,217,255,0.2)' : 'rgba(15,23,42,0.6)',
                          color: notifFilter === 'broadcasts' ? '#00d9ff' : '#94a3b8'
                        }}
                      >
                        Broadcasts ({notifications.filter((n) => n.recipient === 'ALL').length})
                      </button>
                      <button
                        onClick={() => setNotifFilter('direct')}
                        style={{
                          ...styles.chipBtn,
                          background: notifFilter === 'direct' ? 'rgba(0,217,255,0.2)' : 'rgba(15,23,42,0.6)',
                          color: notifFilter === 'direct' ? '#00d9ff' : '#94a3b8'
                        }}
                      >
                        Direct ({notifications.filter((n) => n.recipient !== 'ALL').length})
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
                      {filteredNotifications.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                          No messages found. Dispatch your first broadcast above!
                        </div>
                      ) : (
                        filteredNotifications.map((n) => (
                          <div
                            key={n.id}
                            style={{
                              background: 'rgba(15, 23, 42, 0.7)',
                              border: '1px solid rgba(30, 41, 59, 0.7)',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background:
                                      n.type === 'ALERT'
                                        ? 'rgba(255,51,102,0.2)'
                                        : n.type === 'WARNING'
                                        ? 'rgba(255,183,0,0.2)'
                                        : n.type === 'UPDATE'
                                        ? 'rgba(5,223,114,0.2)'
                                        : 'rgba(0,217,255,0.2)',
                                    color:
                                      n.type === 'ALERT'
                                        ? '#ff3366'
                                        : n.type === 'WARNING'
                                        ? '#ffb700'
                                        : n.type === 'UPDATE'
                                        ? '#05df72'
                                        : '#00d9ff'
                                  }}
                                >
                                  {n.type}
                                </span>
                                <span style={{ fontSize: '11px', color: n.recipient === 'ALL' ? '#00d9ff' : '#a855f7', fontWeight: 700 }}>
                                  {n.recipient === 'ALL' ? '📢 To: ALL USERS' : `👤 To: @${n.recipient}`}
                                </span>
                                {n.is_pinned && (
                                  <span style={{ fontSize: '10px', color: '#eab308' }} title="Pinned as Marquee Banner">
                                    📌 PINNED
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {(isOwner || isAdmin) && (
                                  <button
                                    onClick={() => handleDeleteNotification(n.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      padding: '2px 4px'
                                    }}
                                    title="Delete notification"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: '10px', color: '#475569' }}>
                              Dispatched by <strong>{n.sender}</strong>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 8C. TELEGRAM BOT DISPATCH GATEWAY */}
            {activeTab === 'telegram' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Telegram Bot Automation</h2>
                    <p style={styles.pageSubtitle}>
                      Deliver live key deliveries, reseller balance credits, and server broadcasts straight to your Telegram channel and subscribers.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● TELEGRAM API ACTIVE</span>
                    <span style={styles.timeTag}>@RymonGhostStreamer</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                  {/* Configuration Card */}
                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>🤖 Bot Credentials & Channel Binding</h4>
                      <span style={styles.cyanMiniBadge}>GATEWAY CONFIG</span>
                    </div>

                    <form onSubmit={handleSaveTelegram} style={{ marginTop: '16px' }}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          BOT TOKEN (FROM @BOTFATHER) <span style={{ color: '#00d9ff' }}>*</span>
                        </label>
                        <input
                          type="password"
                          value={telegramConfig.bot_token}
                          onChange={(e) => setTelegramConfig({ ...telegramConfig, bot_token: e.target.value })}
                          placeholder="e.g. 7123456789:AAHk2..."
                          style={styles.keyInput}
                        />
                        <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          Create your bot via @BotFather and copy the HTTP API token.
                        </span>
                      </div>

                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>
                          CHANNEL OR CHAT ID <span style={{ color: '#00d9ff' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={telegramConfig.chat_id}
                          onChange={(e) => setTelegramConfig({ ...telegramConfig, chat_id: e.target.value })}
                          placeholder="e.g. @RymonGhostStreamer or -1001234567890"
                          style={styles.keyInput}
                        />
                        <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          Your public channel username (e.g. @MyChannel) or private group chat ID.
                        </span>
                      </div>

                      <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                        <label style={styles.formLabel}>DISPLAY CHANNEL USERNAME</label>
                        <input
                          type="text"
                          value={telegramConfig.channel_username}
                          onChange={(e) => setTelegramConfig({ ...telegramConfig, channel_username: e.target.value })}
                          placeholder="e.g. @RymonGhostStreamer"
                          style={styles.keyInput}
                        />
                      </div>

                      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          id="tgActive"
                          checked={telegramConfig.is_active}
                          onChange={(e) => setTelegramConfig({ ...telegramConfig, is_active: e.target.checked })}
                          style={{ accentColor: '#00d9ff' }}
                        />
                        <label htmlFor="tgActive" style={{ fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                          Enable automatic Telegram bot dispatching
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={telegramSaving}
                        style={{
                          ...styles.submitBtn,
                          marginTop: '20px',
                          background: '#00d9ff',
                          color: '#07090e'
                        }}
                      >
                        {telegramSaving ? 'SAVING CONFIGURATION...' : '💾 SAVE TELEGRAM CONFIGURATION'}
                      </button>
                    </form>
                  </div>

                  {/* Dispatcher & Setup Instructions */}
                  <div style={styles.cardBox}>
                    <div style={styles.cardHeader}>
                      <h4>✈️ Instant Telegram Dispatcher</h4>
                      <span style={styles.cyanMiniBadge}>TEST MESSAGE</span>
                    </div>

                    <p style={styles.settingDesc}>
                      Test your live bot link by sending a broadcast directly to your connected Telegram channel:
                    </p>

                    <div style={{ ...styles.formGroup, marginTop: '12px' }}>
                      <label style={styles.formLabel}>TEST MESSAGE / ANNOUNCEMENT</label>
                      <textarea
                        rows={3}
                        value={telegramTestMsg}
                        onChange={(e) => setTelegramTestMsg(e.target.value)}
                        placeholder="Write message to dispatch to Telegram channel..."
                        style={{
                          ...styles.keyInput,
                          height: 'auto',
                          resize: 'vertical',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>

                    <button
                      onClick={handleTestTelegram}
                      disabled={telegramTesting}
                      style={{
                        ...styles.submitBtn,
                        marginTop: '14px',
                        background: 'rgba(0, 217, 255, 0.15)',
                        border: '1px solid #00d9ff',
                        color: '#00d9ff'
                      }}
                    >
                      {telegramTesting ? 'DISPATCHING TO TELEGRAM...' : '✈️ TEST DISPATCH TO TELEGRAM'}
                    </button>

                    {telegramStatusMsg && (
                      <div
                        style={{
                          marginTop: '14px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid rgba(0, 217, 255, 0.3)',
                          fontSize: '12px',
                          color: '#e2e8f0'
                        }}
                      >
                        {telegramStatusMsg}
                      </div>
                    )}

                    <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                      <h5 style={{ fontSize: '13px', color: '#f8fafc', marginBottom: '8px', fontWeight: 700 }}>
                        📖 4-Step Quick Setup Guide
                      </h5>
                      <ol style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
                        <li>Open Telegram, search for <strong>@BotFather</strong> and send <code>/newbot</code>.</li>
                        <li>Give your bot a name and username, then copy the <strong>HTTP API Token</strong>.</li>
                        <li>Create or open your Telegram channel, tap <strong>Administrators ➔ Add Admin</strong>, and add your bot.</li>
                        <li>Paste your token and channel username above, click <strong>Save</strong>, then test!</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 9. PRICING & ADVANCE SYSTEM */}
            {activeTab === 'advance' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>
                      {isOwner ? 'Key Pricing & Advance System' : 'Downline Reseller Custom Pricing'}
                    </h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Update default key prices for all users or set custom discounted rates for specific Admins & Resellers.'
                        : 'Assign custom key generation rates for your invited downline Resellers.'}
                    </p>
                  </div>
                  <span style={styles.cyanMiniBadge}>{isOwner ? 'OWNER PRICING ENGINE' : 'ADMIN RESELLER PRICING'}</span>
                </div>

                {/* Pricing Grid: Global Default (Owner) / Wholesale Rates (Admin) vs Target Individual */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                  {isOwner ? (
                    /* Card 1 (Owner): Global Default Key Prices */
                    <div style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>🌐 Default Key Prices (All Users)</h4>
                        <span style={styles.cyanMiniBadge}>GLOBAL RATE</span>
                      </div>
                      <p style={styles.settingDesc}>
                        Applies to all Admins and Resellers unless they have an individual custom rate on the right.
                      </p>

                      <form onSubmit={handleSaveGlobalDefaultPrices} style={{ marginTop: '14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
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
                    /* Card 1 (Admin): Read-only view of Admin's own Wholesale Rates */
                    <div style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>🛡️ Your Admin Wholesale Key Rates</h4>
                        <span style={styles.cyanMiniBadge}>YOUR BASE COST</span>
                      </div>
                      <p style={styles.settingDesc}>
                        These are your current key generation rates set by the Owner. You can assign custom rates for your downline Resellers on the right.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '14px' }}>
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

                  {/* Card 2: Target Individual Custom Price Override */}
                  <div style={styles.cardBox}>
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
                    <p style={styles.settingDesc}>
                      {isOwner
                        ? 'Assign custom key prices for a specific Reseller or Admin account.'
                        : 'Assign custom key prices for any Reseller in your downline team.'}
                    </p>

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
                                : u.role === 'reseller' && u.username.toLowerCase() !== currentUser?.username.toLowerCase()
                            )
                            .map((u) => {
                              const hasCustom = Boolean(getUserCustomPriceMap(u.username))
                              return (
                                <option key={u.id} value={u.username}>
                                  @{u.username} ({u.role.toUpperCase()}) {hasCustom ? '★ CUSTOM RATE' : '• Default'}
                                </option>
                              )
                            })}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '12px' }}>
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
                                  u.username.toLowerCase() === uname.toLowerCase() &&
                                  u.role === 'reseller' &&
                                  u.username.toLowerCase() !== currentUser?.username.toLowerCase()
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
                </div>

                {isOwner && (
                  <>
                    <div style={styles.cardBox}>
                      <div style={styles.cardHeader}>
                        <h4>📱 Single Device Login</h4>
                        <span style={styles.cyanMiniBadge}>SECURITY POLICY</span>
                      </div>
                      <p style={styles.settingDesc}>
                        When enabled, keys generated by that role will only allow 1 device at a time, regardless of the max_devices setting.
                      </p>

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
                      <p style={styles.settingDesc}>
                        Control which administrative tiers are allowed to generate temporary trial keys.
                      </p>

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

                    {/* Sovereign Anti-Sharing, Reseller Expiry & APK Force-Update Policy */}
                    <div style={{ ...styles.cardBox, marginTop: '20px' }}>
                      <div style={styles.cardHeader}>
                        <h4>🛡️ Sovereign Anti-Sharing, Reseller Expiry &amp; APK Force-Update</h4>
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
                      <p style={styles.settingDesc}>
                        Configure daily HWID reset limits for Resellers (anti-sharing protection), automatic customer key pause when a Reseller&apos;s 30D/60D subscription expires, Admin renewal fees, and APK force-update requirements.
                      </p>

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

            {/* 10. DATABASE SQL SETUP HELPER */}
            {activeTab === 'sql-setup' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Database SQL & Schema Engine</h2>
                    <p style={styles.pageSubtitle}>
                      Manage your live PostgreSQL schema on Supabase (zvjqpigduyvczidzafus).
                    </p>
                  </div>
                </div>

                <div style={styles.cardBox}>
                  <div style={styles.cardHeader}>
                    <h4>⚡ Sovereign Schema Status</h4>
                    <span
                      style={{
                        ...styles.cyanMiniBadge,
                        background: dbStatus.tablesCreated ? 'rgba(5,223,114,0.15)' : 'rgba(234,179,8,0.15)',
                        color: dbStatus.tablesCreated ? '#05df72' : '#eab308'
                      }}
                    >
                      {dbStatus.tablesCreated ? 'ONLINE & SYNCED' : 'PENDING SQL RUN'}
                    </span>
                  </div>

                  <p style={styles.settingDesc}>
                    To activate or update all Sovereign RPCs, accounts, licenses, and Realtime publications in Supabase:
                    <br />
                    1. Open your <strong>Supabase Project Dashboard</strong> (<code>zvjqpigduyvczidzafus</code>).
                    <br />
                    2. Go to <strong>SQL Editor</strong> ➔ <strong>New Query</strong>.
                    <br />
                    3. Copy and paste <code>MASTER_RYMON_SOVEREIGN_BACKEND.sql</code> and click <strong>Run</strong>.
                  </p>

                  <div style={{ marginTop: '20px' }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `-- View supabase/sql/MASTER_RYMON_SOVEREIGN_BACKEND.sql in repo`
                        )
                        setCopiedSql(true)
                        setTimeout(() => setCopiedSql(false), 2500)
                      }}
                      style={styles.submitBtn}
                    >
                      {copiedSql ? '✓ COPIED SQL PATH TO CLIPBOARD' : '📋 MASTER_RYMON_SOVEREIGN_BACKEND.SQL READY'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 11. REFERRAL / INVITE CODE ENGINE (OWNER & ADMIN) */}
            {activeTab === 'referrals' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Role Invite Codes Engine</h2>
                    <p style={styles.pageSubtitle}>
                      {isOwner
                        ? 'Generate role-bound invitation codes for prospective Resellers and Admins. Users self-register with their own username and password.'
                        : 'Generate role-bound invitation codes for prospective downline Resellers. Users self-register with their own username and password.'}
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.cyanMiniBadge}>{isOwner ? 'OWNER CONSOLE' : 'ADMIN CONSOLE'}</span>
                    <span style={styles.greenPulseBadge}>● SOVEREIGN PROTOCOL</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '24px', alignItems: 'start' }}>
                  {/* Card 1: Generate Code */}
                  <div style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff' }}>
                          🎟️
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Create Role Invite Code</h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                            Binds role & initial balance atomically upon user registration
                          </div>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleCreateReferral} style={{ marginTop: '20px' }}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>TARGET USER ROLE</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setRefTargetRole('reseller')}
                            style={{
                              flex: 1,
                              padding: '10px',
                              borderRadius: '8px',
                              border: refTargetRole === 'reseller' ? '1px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                              background: refTargetRole === 'reseller' ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refTargetRole === 'reseller' ? '#00d9ff' : '#94a3b8',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            💼 RESELLER
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isOwner) {
                                alert('Power restriction: Only the Supreme Owner (debajoyti) can issue Administrator invite codes. Admins can only invite downline Resellers.')
                                return
                              }
                              setRefTargetRole('admin')
                            }}
                            disabled={!isOwner}
                            style={{
                              flex: 1,
                              padding: '10px',
                              borderRadius: '8px',
                              border: refTargetRole === 'admin' ? '1px solid #05df72' : '1px solid rgba(255,255,255,0.08)',
                              background: refTargetRole === 'admin' ? 'rgba(5, 223, 114, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: !isOwner ? '#475569' : refTargetRole === 'admin' ? '#05df72' : '#94a3b8',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: !isOwner ? 'not-allowed' : 'pointer',
                              opacity: !isOwner ? 0.5 : 1
                            }}
                            title={!isOwner ? 'Supreme Owner only' : 'Create Administrator invite code'}
                          >
                            🛡️ ADMINISTRATOR {!isOwner && '(OWNER ONLY)'}
                          </button>
                        </div>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>RESELLER / ROLE SUBSCRIPTION VALIDITY (NO LIFETIME)</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setRefSubDays(30)}
                            style={{
                              flex: 1,
                              padding: '10px',
                              borderRadius: '8px',
                              border: refSubDays === 30 ? '1px solid #00d9ff' : '1px solid rgba(255,255,255,0.08)',
                              background: refSubDays === 30 ? 'rgba(0, 217, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refSubDays === 30 ? '#00d9ff' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            ⏳ 30 DAYS SUBSCRIPTION
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefSubDays(60)}
                            style={{
                              flex: 1,
                              padding: '10px',
                              borderRadius: '8px',
                              border: refSubDays === 60 ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                              background: refSubDays === 60 ? 'rgba(168, 85, 247, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                              color: refSubDays === 60 ? '#c084fc' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            💎 60 DAYS SUBSCRIPTION
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          Reseller account expires automatically after {refSubDays} days unless renewed by Owner/Admin.
                        </div>
                      </div>

                      <div style={styles.formGroup}>
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

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>CUSTOM CODE (OPTIONAL)</label>
                        <input
                          type="text"
                          value={refCustomCode}
                          onChange={(e) => setRefCustomCode(e.target.value.toUpperCase())}
                          placeholder="e.g. RYMON-RESELLER-VIP (Blank for auto)"
                          style={styles.keyInput}
                        />
                      </div>

                      <div style={styles.formGroup}>
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
                        {refCreating ? 'CREATING CODE IN SUPABASE...' : `🎟️ GENERATE ${refSubDays}D INVITE CODE`}
                      </button>
                    </form>
                  </div>

                  {/* Card 2: Active Codes Table */}
                  <div style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Active Referral Codes ({referralList.length})</h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                            Real codes stored in Supabase <code>public.rymon_referrals</code>
                          </div>
                        </div>
                        <button
                          onClick={() => fetchReferralCodes(currentUser).then(setReferralList)}
                          style={{ ...styles.chipBtn, fontSize: '11px' }}
                        >
                          🔄 Refresh
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                      <table style={styles.dataTable}>
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
                                      onClick={() => {
                                        navigator.clipboard.writeText(ref.code)
                                        setCopiedRefCode(ref.code)
                                        setTimeout(() => setCopiedRefCode(null), 2000)
                                      }}
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
                                    onClick={() => handleDeleteReferral(ref.id)}
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

            {/* 12. SOVEREIGN CONNECT URL & APK ENGINE */}
            {activeTab === 'connect-api' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Sovereign Connect URL & APK Engine</h2>
                    <p style={styles.pageSubtitle}>
                      Direct sovereign key verification and hardware binding endpoint for the Safe Streamer Android APK (Free Fire MAX). Zero third-party ghostpanel reliance.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● 100% SOVEREIGN</span>
                    <span style={styles.cyanMiniBadge}>ANDROID APK READY</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
                  {/* Left Column: Endpoints & APK Config */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Endpoint Overview Card */}
                    <div style={styles.managementCard}>
                      <div style={styles.cardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ ...styles.actionIconCircle, background: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff' }}>
                            🔗
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Live Connect Endpoints</h3>
                            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                              Primary RPC endpoint & Web Gateway
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>
                            PRIMARY DIRECT SUPABASE RPC ENDPOINT:
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(7, 9, 14, 0.8)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(0, 217, 255, 0.25)' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00d9ff', flex: 1, wordBreak: 'break-all' }}>
                              {SOVEREIGN_CONNECT_CONFIG.endpoint_url}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(SOVEREIGN_CONNECT_CONFIG.endpoint_url)
                                showToast('Copied endpoint URL')
                              }}
                              style={styles.miniCopyBtn}
                              title="Copy URL"
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>
                            WEB PORTAL GATEWAY CONNECT URL:
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(7, 9, 14, 0.8)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#05df72', flex: 1 }}>
                              https://greenvest.shop/connect
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText('https://greenvest.shop/connect')
                                showToast('Copied portal URL')
                              }}
                              style={styles.miniCopyBtn}
                              title="Copy URL"
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '12px' }}>
                          <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: '6px' }}>Request Specifications:</div>
                          <div style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                            • <strong>Method:</strong> <code>POST</code><br />
                            • <strong>Header <code>apikey</code>:</strong> <code>{SOVEREIGN_CONNECT_CONFIG.anon_key.substring(0, 20)}...</code><br />
                            • <strong>Header <code>Content-Type</code>:</strong> <code>application/json</code><br />
                            • <strong>JSON Payload:</strong> <code>{`{"p_license_key": "YOUR_KEY", "p_hwid": "YOUR_DEVICE_HWID"}`}</code>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ServerConfig.java APK Integration Card */}
                    <div style={styles.managementCard}>
                      <div style={styles.cardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ ...styles.actionIconCircle, background: 'rgba(5, 223, 114, 0.15)', color: '#05df72' }}>
                            📱
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Android APK Configuration</h3>
                            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                              In <code>c:\SAFE STREAMER\app\src\main\java\com\rymon\external\ServerConfig.java</code>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px' }}>
                        <pre style={{
                          background: '#07090e',
                          border: '1px solid rgba(30, 41, 59, 0.8)',
                          borderRadius: '10px',
                          padding: '16px',
                          fontSize: '11px',
                          fontFamily: 'Consolas, monospace',
                          color: '#cbd5e1',
                          overflowX: 'auto',
                          lineHeight: '1.5'
                        }}>
{`// Sovereign Server Configuration for Safe Streamer
package com.rymon.external;

public class ServerConfig {
    public static final String SUPABASE_REST_URL = 
        "https://zvjqpigduyvczidzafus.supabase.co/rest/v1/rymon_streamer_controls";
    public static final String CONNECT_URL = 
        "https://greenvest.shop/";
    public static final String VERIFY_LICENSE_RPC = 
        "https://zvjqpigduyvczidzafus.supabase.co/rest/v1/rpc/rpc_rymon_verify_license";
    public static final String SUPABASE_KEY = 
        "${SOVEREIGN_CONNECT_CONFIG.anon_key}";
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Live Test Sandbox */}
                  <div style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(255, 183, 0, 0.15)', color: '#ffb700' }}>
                          🧪
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Live Verification Test Sandbox</h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                            Simulate Android APK key verification against live Supabase RPC
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>LICENSE KEY TO TEST</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            value={testConnectKey}
                            onChange={(e) => setTestConnectKey(e.target.value.toUpperCase())}
                            placeholder="Enter key e.g. RYMON-XXXX-XXXX"
                            style={{ ...styles.keyInput, flex: 1 }}
                          />
                          {keysList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setTestConnectKey(keysList[0].license_key)}
                              style={{ ...styles.chipBtn, fontSize: '11px', whiteSpace: 'nowrap' }}
                              title="Pick first active key from database"
                            >
                              Pick Key ({keysList[0].license_key.substring(0, 10)}...)
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>DEVICE HARDWARE ID (HWID)</label>
                        <input
                          type="text"
                          value={testConnectHwid}
                          onChange={(e) => setTestConnectHwid(e.target.value)}
                          placeholder="e.g. DEVICE-SIM-ANDROID-9981"
                          style={styles.keyInput}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleTestConnectApi}
                        disabled={testConnectLoading}
                        style={{ ...styles.submitBtn, marginTop: '8px' }}
                      >
                        {testConnectLoading ? 'CONNECTING & VERIFYING...' : '🚀 TEST KEY VERIFICATION NOW'}
                      </button>

                      <div style={{ marginTop: '20px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '6px' }}>
                          LIVE RPC RESPONSE TERMINAL:
                        </div>
                        <div style={{
                          background: '#04060a',
                          border: '1px solid rgba(0, 217, 255, 0.3)',
                          borderRadius: '8px',
                          padding: '14px',
                          fontFamily: 'Consolas, monospace',
                          fontSize: '11px',
                          color: '#00d9ff',
                          minHeight: '140px',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {testConnectResult || '// Click "TEST KEY VERIFICATION NOW" to dispatch live RPC call...'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 13. STREAMER REMOTE (TELEMETRY & HARDWARE CONTROLLER) */}
            {activeTab === 'remote' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Streamer Remote Control</h2>
                    <p style={styles.pageSubtitle}>
                      Live hardware telemetry synchronization with target Android device running Stranger daemon.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span
                      style={{
                        ...styles.greenPulseBadge,
                        background: isStreamerKeyActivelyPlaying(record)
                          ? 'rgba(5, 223, 114, 0.2)'
                          : 'rgba(148, 163, 184, 0.15)',
                        color: isStreamerKeyActivelyPlaying(record) ? '#05df72' : '#cbd5e1',
                        border: isStreamerKeyActivelyPlaying(record)
                          ? '1px solid rgba(5, 223, 114, 0.5)'
                          : '1px solid rgba(148, 163, 184, 0.3)'
                      }}
                    >
                      {isStreamerKeyActivelyPlaying(record) ? '🟢 PLAYING NOW (IN-GAME)' : '⚪ NOT PLAYING (IDLE)'}
                    </span>
                    {isStaff && currentKey && (
                      <button
                        onClick={() => handleTogglePauseKey(currentKey)}
                        style={{
                          ...styles.emergencyPurgeBtn,
                          background: record?.is_paused ? 'rgba(5, 223, 114, 0.2)' : 'rgba(255, 183, 0, 0.2)',
                          border: record?.is_paused ? '1px solid #05df72' : '1px solid #ffb700',
                          color: record?.is_paused ? '#05df72' : '#ffb700'
                        }}
                      >
                        {record?.is_paused ? '▶️ RESUME KEY' : '⏸️ PAUSE KEY'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowDownloadModal(true)}
                      style={{
                        backgroundColor: 'rgba(0, 217, 255, 0.15)',
                        border: '1px solid #00d9ff',
                        color: '#00d9ff',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>📥</span> DOWNLOAD APK
                    </button>
                    <button
                      onClick={() => setShowPurgeModal(true)}
                      style={styles.emergencyPurgeBtn}
                    >
                      🚨 EMERGENCY PURGE
                    </button>
                  </div>
                </div>

                {/* Staff Target Key Selector Bar */}
                {isStaff && (
                  <div
                    style={{
                      background: 'rgba(13, 17, 26, 0.92)',
                      border: '1px solid rgba(0, 217, 255, 0.3)',
                      borderRadius: '12px',
                      padding: '12px 18px',
                      marginBottom: '16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>🎮</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#00d9ff', letterSpacing: '0.5px' }}>
                          SELECT TARGET LICENSE KEY TO CONTROL REMOTELY
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Any toggle or slider you change here immediately syncs to the selected key&apos;s Android APK
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px', maxWidth: '520px' }}>
                      <select
                        value={currentKey}
                        onChange={(e) => setCurrentKey(e.target.value)}
                        style={{ ...styles.selectInput, flex: 1, fontWeight: 700, color: '#f8fafc' }}
                      >
                        <option value="">-- Choose License Key to Control --</option>
                        {keysList.map((k) => {
                          const isKeyPlaying = onlineKeySet.has(k.license_key.toUpperCase())
                          return (
                            <option key={k.license_key} value={k.license_key}>
                              {isKeyPlaying ? '🟢 [PLAYING NOW] ' : k.device_hwid ? '📱 [BOUND] ' : '🟡 [UNUSED] '}
                              {k.license_key} ({k.game} • {k.plan_duration} • @{k.creator_username})
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* Status Bar */}
                <div style={styles.telemetryBar}>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>TARGET KEY:</span>
                    <span style={styles.telemetryBarVal}>{currentKey || 'NONE SELECTED'}</span>
                  </div>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>GAME SESSION:</span>
                    <span
                      style={{
                        ...styles.telemetryBarVal,
                        color: isStreamerKeyActivelyPlaying(record) ? '#05df72' : '#94a3b8'
                      }}
                    >
                      {isStreamerKeyActivelyPlaying(record) ? '🟢 PLAYING NOW' : '⚪ NOT PLAYING'}
                    </span>
                  </div>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>KEY STATE:</span>
                    <span style={{ ...styles.telemetryBarVal, color: record?.is_paused ? '#ffb700' : '#05df72' }}>
                      {record?.is_paused ? '⏸️ PAUSED / FROZEN' : '● ACTIVE'}
                    </span>
                  </div>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>EXPIRES IN:</span>
                    <span style={{ ...styles.telemetryBarVal, color: '#00d9ff' }}>{countdown}</span>
                  </div>
                </div>

                {/* Real Hardware & Daemon Binding HUD Card */}
                <div
                  style={{
                    background: isStreamerKeyActivelyPlaying(record)
                      ? 'linear-gradient(90deg, rgba(5, 223, 114, 0.14) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(5, 223, 114, 0.08) 100%)'
                      : record?.device_hwid
                      ? 'linear-gradient(90deg, rgba(0, 217, 255, 0.1) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(0, 217, 255, 0.06) 100%)'
                      : 'linear-gradient(90deg, rgba(255, 183, 0, 0.12) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(255, 183, 0, 0.08) 100%)',
                    border: isStreamerKeyActivelyPlaying(record)
                      ? '1px solid rgba(5, 223, 114, 0.45)'
                      : record?.device_hwid
                      ? '1px solid rgba(0, 217, 255, 0.35)'
                      : '1px solid rgba(255, 183, 0, 0.4)',
                    borderRadius: '12px',
                    padding: '14px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '26px' }}>
                      {isStreamerKeyActivelyPlaying(record) ? '🎮' : record?.device_hwid ? '📱' : '⏳'}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '13px',
                            letterSpacing: '0.5px',
                            color: isStreamerKeyActivelyPlaying(record)
                              ? '#05df72'
                              : record?.device_hwid
                              ? '#00d9ff'
                              : '#ffb700'
                          }}
                        >
                          {isStreamerKeyActivelyPlaying(record)
                            ? '● PLAYER IS IN-GAME & PLAYING NOW'
                            : record?.device_hwid
                            ? '● DEVICE BOUND (CURRENTLY NOT PLAYING / OFFLINE)'
                            : '○ AWAITING 1ST PHONE APK LOGIN'}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            background: isStreamerKeyActivelyPlaying(record)
                              ? 'rgba(5, 223, 114, 0.2)'
                              : record?.device_hwid
                              ? 'rgba(0, 217, 255, 0.15)'
                              : 'rgba(255, 183, 0, 0.2)',
                            color: isStreamerKeyActivelyPlaying(record)
                              ? '#05df72'
                              : record?.device_hwid
                              ? '#00d9ff'
                              : '#ffb700',
                            border: isStreamerKeyActivelyPlaying(record)
                              ? '1px solid #05df72'
                              : record?.device_hwid
                              ? '1px solid #00d9ff'
                              : '1px solid #ffb700'
                          }}
                        >
                          {isStreamerKeyActivelyPlaying(record)
                            ? 'LIVE IN-GAME'
                            : record?.device_hwid
                            ? 'IDLE / OFFLINE'
                            : 'UNBOUND'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px', fontFamily: 'monospace' }}>
                        HWID: <strong style={{ color: '#f8fafc' }}>{record?.device_hwid || 'None (Open APK on phone & tap INITIALIZE STREAMER)'}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', fontSize: '12px', color: '#94a3b8' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>DEVICE SLOTS:</span>
                      <strong style={{ color: '#38bdf8' }}>{record?.devices_used || (record?.device_hwid ? 1 : 0)} / {record?.devices_max || 1} Used</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>LAST HEARTBEAT:</span>
                      <strong style={{ color: isStreamerKeyActivelyPlaying(record) ? '#05df72' : '#94a3b8' }}>
                        {record?.last_heartbeat
                          ? `${new Date(record.last_heartbeat).toLocaleTimeString()} (${isStreamerKeyActivelyPlaying(record) ? 'Live' : 'Offline'})`
                          : 'No Game Session Yet'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>ENGINE TARGET:</span>
                      <strong style={{ color: '#05df72' }}>Stranger (ARM64)</strong>
                    </div>
                  </div>
                </div>

                {/* Paused Warning Banner */}
                {record?.is_paused && (
                  <div
                    style={{
                      background: 'linear-gradient(90deg, rgba(255, 183, 0, 0.2) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(255, 183, 0, 0.2) 100%)',
                      border: '1px solid rgba(255, 183, 0, 0.5)',
                      borderRadius: '12px',
                      padding: '14px 20px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      color: '#ffb700'
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>⏸️</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '0.5px' }}>
                        THIS LICENSE KEY IS CURRENTLY PAUSED BY STAFF
                      </div>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                        In-game Stranger daemon hook and telemetry adjustments are frozen until resumed by an authorized reseller or admin.
                      </div>
                    </div>
                  </div>
                )}

                {/* 3 Telemetry Column Control Grid */}
                <div style={styles.controlGrid3Col}>
                  {/* Column 1: Aim Matrix */}
                  <div style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>🎯</span>
                      <h4>AIM ASSIST MATRIX</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div>
                        <div style={styles.toggleTitle}>Silent Aim</div>
                        <div style={styles.toggleDesc}>Direct vector redirection</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>FOV Target Ring</div>
                        <div style={styles.toggleDesc}>Dynamic screen radius indicator</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Aim Snap Line</div>
                        <div style={styles.toggleDesc}>Vector ray from crosshair to target</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Ignore Knocked</div>
                        <div style={styles.toggleDesc}>Prioritize active standing threats</div>
                      </div>
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
                  <div style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>👁️</span>
                      <h4>ESP VISUAL OVERLAY</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div>
                        <div style={styles.toggleTitle}>3D Bounding Box</div>
                        <div style={styles.toggleDesc}>Entity corner alignment</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Skeleton Bone Structure</div>
                        <div style={styles.toggleDesc}>14-point joint tracking</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Player Nicknames</div>
                        <div style={styles.toggleDesc}>In-game enemy name labels</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Tracer Snaplines</div>
                        <div style={styles.toggleDesc}>Origin vector lines to targets</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Distance Indicator</div>
                        <div style={styles.toggleDesc}>Proximity range in meters</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Health Bar Visual</div>
                        <div style={styles.toggleDesc}>Real-time HP gauge</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Enemy Alert Count</div>
                        <div style={styles.toggleDesc}>Surrounding threat badge</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Tactical 360° Radar</div>
                        <div style={styles.toggleDesc}>Top-down minimap threat proximity</div>
                      </div>
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
                  <div style={styles.columnCard}>
                    <div style={styles.columnHead}>
                      <span style={styles.columnIcon}>⚡</span>
                      <h4>KINEMATICS & THEME</h4>
                    </div>

                    <div style={styles.toggleRow}>
                      <div>
                        <div style={styles.toggleTitle}>Kinematic Speed Boost</div>
                        <div style={styles.toggleDesc}>Velocity vector scaling</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Ghost Mode (Desync)</div>
                        <div style={styles.toggleDesc}>Detached client body positioning</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Instant No-Reload</div>
                        <div style={styles.toggleDesc}>Zero magazine reload delay</div>
                      </div>
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
                      <div>
                        <div style={styles.toggleTitle}>Recoil Suppression</div>
                        <div style={styles.toggleDesc}>Zero crosshair displacement</div>
                      </div>
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
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── EMERGENCY REMOTE PURGE MODAL ────────────────────────────────────── */}
      {showPurgeModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
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

      {/* ── APK DOWNLOAD MODAL ──────────────────────────────────────────────── */}
      {showDownloadModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDownloadModal(false)}>
          <div
            style={{
              ...styles.modalCard,
              maxWidth: '640px',
              width: '90%',
              textAlign: 'left',
              padding: '28px',
              border: '1px solid rgba(0, 217, 255, 0.3)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 217, 255, 0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '26px' }}>📥</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.5px' }}>
                    RYMON STREAMER OFFICIAL APK
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Unified Android ARM64 Client • Web Control + In-Game Panel
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  background: 'rgba(13, 17, 26, 0.9)',
                  border: '1px solid rgba(0, 217, 255, 0.35)',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#00d9ff' }}>
                      ⚡ RYMON STREAMER (All-in-One)
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        background: 'rgba(5, 223, 114, 0.2)',
                        color: '#05df72',
                        border: '1px solid rgba(5, 223, 114, 0.4)'
                      }}
                    >
                      WEB + IN-GAME PANEL
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4', marginBottom: '8px' }}>
                    Includes both <strong>Web Control</strong> &amp; <strong>In-Game Panel</strong> by default, or switch to <strong>Web Control Only</strong> directly inside the APK.
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <span>⚙️ Arch: <strong>ARM64-v8a</strong></span>
                    <span>🔄 Modes: <strong>Web + In-Game / Web Only</strong></span>
                  </div>
                </div>

                <a
                  href="/download/RYMON_STREAMER_LATEST.apk"
                  download="RYMON_STREAMER.apk"
                  style={{
                    backgroundColor: '#00d9ff',
                    color: '#07090e',
                    padding: '11px 20px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>⬇️</span> Download APK
                </a>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDownloadModal(false)}
                style={{
                  ...styles.modalCancelBtn,
                  padding: '8px 20px',
                  fontSize: '12px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET USER PASSWORD MODAL ───────────────────────────────────────── */}
      {pwdModalUser && (
        <div style={styles.modalOverlay} onClick={() => setPwdModalUser(null)}>
          <div
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
                    Instantly updates user credentials on Supabase
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
                <label style={styles.formLabel}>NEW PASSWORD FOR @{pwdModalUser.toUpperCase()}</label>
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

      {/* ── NOTIFICATION DRAWER / NOTIFICATION CENTER ───────────────────────── */}
      {isNotifDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            right: '24px',
            width: '430px',
            maxWidth: '92vw',
            maxHeight: '85vh',
            backgroundColor: 'rgba(10, 13, 22, 0.96)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 217, 255, 0.35)',
            borderRadius: '16px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 217, 255, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(30, 41, 59, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(15, 23, 42, 0.8)'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔔 NOTIFICATIONS & BROADCASTS</span>
                <span style={styles.cyanMiniBadge}>{notifications.length}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Real-time messages for {currentUser?.username || 'user'}
              </div>
            </div>
            <button
              onClick={() => setIsNotifDrawerOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Close drawer"
            >
              ✕
            </button>
          </div>

          {/* Drawer Filters */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              gap: '6px',
              background: 'rgba(10, 13, 20, 0.6)'
            }}
          >
            <button
              onClick={() => setNotifFilter('all')}
              style={{
                ...styles.chipBtn,
                background: notifFilter === 'all' ? 'rgba(0, 217, 255, 0.2)' : 'transparent',
                color: notifFilter === 'all' ? '#00d9ff' : '#94a3b8',
                fontSize: '11px'
              }}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setNotifFilter('broadcasts')}
              style={{
                ...styles.chipBtn,
                background: notifFilter === 'broadcasts' ? 'rgba(0, 217, 255, 0.2)' : 'transparent',
                color: notifFilter === 'broadcasts' ? '#00d9ff' : '#94a3b8',
                fontSize: '11px'
              }}
            >
              📢 Broadcasts ({notifications.filter((n) => n.recipient === 'ALL').length})
            </button>
            <button
              onClick={() => setNotifFilter('direct')}
              style={{
                ...styles.chipBtn,
                background: notifFilter === 'direct' ? 'rgba(0, 217, 255, 0.2)' : 'transparent',
                color: notifFilter === 'direct' ? '#00d9ff' : '#94a3b8',
                fontSize: '11px'
              }}
            >
              👤 Direct ({notifications.filter((n) => n.recipient !== 'ALL').length})
            </button>
          </div>

          {/* Messages list */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {filteredNotifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b', fontSize: '13px' }}>
                🎉 All caught up! No notifications right now.
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(30, 41, 59, 0.8)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background:
                            n.type === 'ALERT'
                              ? 'rgba(255, 51, 102, 0.2)'
                              : n.type === 'WARNING'
                              ? 'rgba(255, 183, 0, 0.2)'
                              : n.type === 'UPDATE'
                              ? 'rgba(5, 223, 114, 0.2)'
                              : 'rgba(0, 217, 255, 0.2)',
                          color:
                            n.type === 'ALERT'
                              ? '#ff3366'
                              : n.type === 'WARNING'
                              ? '#ffb700'
                              : n.type === 'UPDATE'
                              ? '#05df72'
                              : '#00d9ff'
                        }}
                      >
                        {n.type}
                      </span>
                      <span style={{ fontSize: '10px', color: n.recipient === 'ALL' ? '#00d9ff' : '#a855f7', fontWeight: 700 }}>
                        {n.recipient === 'ALL' ? '📢 GLOBAL' : `@${n.recipient}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {(isOwner || isAdmin) && (
                        <button
                          onClick={() => handleDeleteNotification(n.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                          title="Delete message"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Drawer Footer */}
          {(isOwner || isAdmin) && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(30, 41, 59, 0.8)',
                background: 'rgba(15, 23, 42, 0.95)'
              }}
            >
              <button
                onClick={() => {
                  setIsNotifDrawerOpen(false)
                  setActiveTab('broadcast')
                }}
                style={{
                  ...styles.submitBtn,
                  padding: '8px 16px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #00d9ff 0%, #0284c7 100%)',
                  color: '#07090e'
                }}
              >
                📢 Compose Broadcast / Message Users
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Obsidian Cyber Glassmorphism Scoped Design System ────────────────────────
const styles: Record<string, React.CSSProperties> = {
  appShell: {
    minHeight: '100vh',
    backgroundColor: '#07090e',
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
    backgroundImage: `radial-gradient(rgba(0, 217, 255, 0.05) 1px, transparent 0), radial-gradient(rgba(147, 51, 234, 0.03) 1px, transparent 0)`,
    backgroundSize: '40px 40px, 80px 80px',
    backgroundPosition: '0 0, 20px 20px',
    pointerEvents: 'none',
    zIndex: 0
  },
  topHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    backgroundColor: 'rgba(10, 13, 20, 0.85)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(30, 41, 59, 0.6)',
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
    border: '1px solid rgba(0, 217, 255, 0.4)',
    boxShadow: '0 0 12px rgba(0, 217, 255, 0.25)',
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
  brandCyanPill: {
    color: '#00d9ff',
    textShadow: '0 0 10px rgba(0, 217, 255, 0.5)'
  },
  brandSubText: {
    fontSize: '10px',
    color: '#64748b',
    letterSpacing: '0.06em',
    fontWeight: 600
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
    backgroundColor: 'rgba(13, 17, 26, 0.9)',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  balanceAmount: {
    color: '#00d9ff'
  },
  telemetryPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: 'rgba(13, 17, 26, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
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
    color: '#00d9ff',
    fontWeight: 700
  },
  userProfilePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 8px 4px 12px',
    backgroundColor: 'rgba(13, 17, 26, 0.9)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '20px'
  },
  userAvatarSquare: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
    color: '#00d9ff',
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
    backgroundColor: '#00d9ff',
    color: '#07090e',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '12px',
    cursor: 'pointer'
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
    backgroundColor: 'rgba(13, 17, 26, 0.85)',
    border: '1px solid rgba(0, 217, 255, 0.25)',
    borderRadius: '20px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(0, 217, 255, 0.1)',
    backdropFilter: 'blur(20px)',
    position: 'relative',
    zIndex: 1
  },
  authBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: '12px',
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    color: '#00d9ff',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    marginBottom: '16px'
  },
  authTabSelector: {
    display: 'flex',
    gap: '8px',
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    padding: '4px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: '1px solid rgba(30, 41, 59, 0.5)'
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
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    color: '#00d9ff',
    fontWeight: 700,
    boxShadow: '0 0 10px rgba(0, 217, 255, 0.15)'
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
    backgroundColor: 'rgba(7, 9, 14, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.8)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },
  selectInput: {
    padding: '12px 16px',
    backgroundColor: 'rgba(7, 9, 14, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.8)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },
  quickAccountsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '4px'
  },
  quickLabel: {
    fontSize: '11px',
    color: '#64748b'
  },
  chipBtn: {
    padding: '4px 10px',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(0, 217, 255, 0.2)',
    borderRadius: '6px',
    color: '#00d9ff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  submitBtn: {
    padding: '14px 20px',
    backgroundColor: '#00d9ff',
    color: '#07090e',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 800,
    fontSize: '13px',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0, 217, 255, 0.35)'
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
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '8px',
    color: '#ef4444',
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
    backgroundColor: 'rgba(10, 13, 20, 0.75)',
    borderRight: '1px solid rgba(30, 41, 59, 0.5)',
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
    backgroundColor: '#0a0d14'
  },
  sidebarUserCard: {
    padding: '12px',
    backgroundColor: 'rgba(13, 17, 26, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.5)',
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
    backgroundColor: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
    color: '#475569',
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
    backgroundColor: 'rgba(0, 217, 255, 0.12)',
    color: '#00d9ff',
    fontWeight: 700,
    borderLeft: '3px solid #00d9ff'
  },
  navIcon: {
    fontSize: '14px'
  },
  cyanMiniBadge: {
    marginLeft: 'auto',
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: '6px',
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    color: '#00d9ff',
    fontWeight: 700
  },
  contentPane: {
    flex: 1,
    padding: '30px',
    overflowY: 'auto'
  },
  viewContainer: {
    maxWidth: '1240px',
    margin: '0 auto'
  },
  bannerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '28px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 800,
    margin: 0,
    color: '#f8fafc'
  },
  pageSubtitle: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '4px 0 0 0'
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
    marginBottom: '28px'
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: 'rgba(13, 17, 26, 0.7)',
    border: '1px solid rgba(30, 41, 59, 0.5)',
    borderRadius: '16px',
    backdropFilter: 'blur(10px)'
  },
  statIconFrame: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    color: '#00d9ff',
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
    backgroundColor: 'rgba(13, 17, 26, 0.75)',
    border: '1px solid rgba(30, 41, 59, 0.5)',
    borderRadius: '16px',
    backdropFilter: 'blur(10px)'
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
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    color: '#f8fafc',
    transition: 'all 0.15s ease'
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
    backgroundColor: 'rgba(7, 9, 14, 0.5)',
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
    backgroundColor: 'rgba(13, 17, 26, 0.85)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '16px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
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
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    border: '1px solid rgba(0, 217, 255, 0.2)',
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
    color: '#00d9ff',
    letterSpacing: '0.04em'
  },
  copyKeyBtn: {
    padding: '8px 14px',
    backgroundColor: '#00d9ff',
    color: '#07090e',
    fontWeight: 700,
    fontSize: '11px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  searchBox: {
    minWidth: '280px'
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'rgba(13, 17, 26, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  tableCard: {
    backgroundColor: 'rgba(13, 17, 26, 0.75)',
    border: '1px solid rgba(30, 41, 59, 0.5)',
    borderRadius: '16px',
    overflow: 'hidden'
  },
  dataTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left'
  },
  th: {
    padding: '14px 18px',
    backgroundColor: 'rgba(7, 9, 14, 0.7)',
    color: '#64748b',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(30, 41, 59, 0.5)'
  },
  tr: {
    borderBottom: '1px solid rgba(30, 41, 59, 0.3)'
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
    backgroundColor: '#00d9ff'
  },
  planBadge: {
    padding: '3px 8px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#cbd5e1'
  },
  avatarTiny: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#00d9ff',
    color: '#07090e',
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
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    color: '#00d9ff',
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
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    color: '#00d9ff',
    fontSize: '10px',
    fontWeight: 700
  },
  userBalanceGreen: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#05df72'
  },
  actionIconBtn: {
    background: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
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
    borderTop: '1px solid rgba(30, 41, 59, 0.4)'
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
    transition: 'background 0.2s ease',
    boxSizing: 'border-box'
  },
  switchKnob: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s ease'
  },
  emergencyPurgeBtn: {
    padding: '8px 14px',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#ef4444',
    fontSize: '11px',
    fontWeight: 700,
    borderRadius: '8px',
    cursor: 'pointer'
  },
  telemetryBar: {
    display: 'flex',
    gap: '24px',
    padding: '12px 18px',
    backgroundColor: 'rgba(13, 17, 26, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  telemetryBarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px'
  },
  telemetryBarLabel: {
    color: '#64748b',
    fontWeight: 700
  },
  telemetryBarVal: {
    color: '#f8fafc',
    fontWeight: 700
  },
  controlGrid3Col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '20px'
  },
  columnCard: {
    padding: '20px',
    backgroundColor: 'rgba(13, 17, 26, 0.8)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    borderRadius: '16px',
    backdropFilter: 'blur(10px)'
  },
  columnHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(30, 41, 59, 0.5)'
  },
  columnIcon: {
    fontSize: '18px'
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(30, 41, 59, 0.3)'
  },
  toggleTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  toggleDesc: {
    fontSize: '11px',
    color: '#64748b'
  },
  sliderBlock: {
    padding: '14px 0',
    borderBottom: '1px solid rgba(30, 41, 59, 0.3)'
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
    color: '#00d9ff',
    fontWeight: 700
  },
  sliderInput: {
    width: '100%',
    accentColor: '#00d9ff',
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
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    border: '1px solid rgba(30, 41, 59, 0.6)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  themePillBtnActive: {
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    borderColor: '#00d9ff',
    color: '#00d9ff',
    fontWeight: 700
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999
  },
  modalCard: {
    maxWidth: '460px',
    width: '90%',
    padding: '30px',
    backgroundColor: '#0a0d14',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '16px',
    textAlign: 'center',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(239, 68, 68, 0.2)'
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
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    border: 'none',
    color: '#cbd5e1',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer'
  },
  modalConfirmPurgeBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    backgroundColor: '#ef4444',
    border: 'none',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer'
  }
}
