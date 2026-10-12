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
  togglePauseLicenseBackend
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
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Live Database Collections
  const [keysList, setKeysList] = useState<RymonLicense[]>([])
  const [usersList, setUsersList] = useState<RymonAccount[]>([])
  const [activities, setActivities] = useState<RymonActivity[]>([])

  // Generate Key Form State
  const [genGame, setGenGame] = useState('Free Fire MAX')
  const [genDuration, setGenDuration] = useState('1 Day')
  const [genCustomPrefix, setGenCustomPrefix] = useState('')
  const [genDevicesMax, setGenDevicesMax] = useState(1)
  const [genLastCreated, setGenLastCreated] = useState<string | null>(null)
  const [genError, setGenError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Top Up Balance Form State
  const [topUpTargetUser, setTopUpTargetUser] = useState('')
  const [topUpAmount, setTopUpAmount] = useState<number | ''>('')
  const [topUpMode, setTopUpMode] = useState<'set' | 'add'>('set')
  const [topUpLoading, setTopUpLoading] = useState(false)

  // Search & Filter
  const [searchKeyQuery, setSearchKeyQuery] = useState('')
  const [searchUserQuery, setSearchUserQuery] = useState('')

  // Management Action State
  const [targetBanUser, setTargetBanUser] = useState('')
  const [banActionType, setBanActionType] = useState<'ban' | 'unban'>('ban')
  const [targetDeleteUser, setTargetDeleteUser] = useState('')
  const [deleteKeyType, setDeleteKeyType] = useState<'expired' | 'unused' | 'all'>('expired')
  const [targetExtendKey, setTargetExtendKey] = useState('')
  const [extendAmount, setExtendAmount] = useState(30)
  const [actionSuccessMsg, setActionSuccessMsg] = useState('')

  // Advanced System Toggles
  const [singleDeviceAdmin, setSingleDeviceAdmin] = useState(false)
  const [singleDeviceReseller, setSingleDeviceReseller] = useState(true)
  const [trialAdmin, setTrialAdmin] = useState(true)
  const [trialReseller, setTrialReseller] = useState(false)

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
  const [refInitialBal, setRefInitialBal] = useState<number | ''>('')
  const [refCustomCode, setRefCustomCode] = useState('')
  const [refMaxUses, setRefMaxUses] = useState(1)
  const [refCreating, setRefCreating] = useState(false)
  const [copiedRefCode, setCopiedRefCode] = useState<string | null>(null)

  // Sovereign Connect URL & APK Test Sandbox State
  const [testConnectKey, setTestConnectKey] = useState('RYMON-MASTER-KEY')
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
        if (savedKey) setCurrentKey(savedKey)
      } catch {}
    } else if (savedKey) {
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
      const [lcs, usrs, acts, notifs, tgCfg, refs] = await Promise.all([
        fetchAllLicenses(currentUser),
        fetchAllAccounts(currentUser),
        isStreamerRole ? Promise.resolve([]) : fetchAllActivities(),
        fetchNotifications(currentUser?.username),
        currentUser?.role === 'owner'
          ? fetchTelegramConfigBackend()
          : Promise.resolve({ bot_token: '', chat_id: '', channel_username: '@RymonGhostStreamer', is_active: false }),
        fetchReferralCodes(currentUser)
      ])

      if (isMounted) {
        setKeysList(lcs)
        setUsersList(usrs)
        setActivities(acts)
        setNotifications(notifs)
        setTelegramConfig(tgCfg)
        setReferralList(refs)

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
        if (supabase) supabase.removeChannel(channel)
      }
    }
  }, [isAuthenticated, currentUser])

  // 3. Telemetry Realtime Subscription for Current Key
  useEffect(() => {
    if (!isAuthenticated || !currentKey || !supabase) return

    let isMounted = true

    async function loadTelemetry() {
      if (!supabase) return
      try {
        const { data } = await supabase
          .from('rymon_streamer_controls')
          .select('*')
          .eq('license_key', currentKey)
          .maybeSingle()

        if (data && isMounted) {
          setRecord(data as StreamerControlRecord)
          setIsLiveConnected(true)
        } else if (isMounted) {
          // Initialize fresh local fallback record
          const initialRow: StreamerControlRecord = {
            license_key: currentKey,
            streamer_name: currentUser?.role === 'owner' ? 'Rymon Owner' : 'VIP Streamer',
            game_name: 'Free Fire MAX',
            is_online: true,
            is_active: true,
            aim_silent: false,
            hit_rate: 80,
            ignore_knocked: false,
            show_aim_line: false,
            show_aim_fov: false,
            aim_fov: 90,
            esp_box: true,
            esp_line: false,
            esp_skeleton: true,
            esp_name: true,
            esp_distance: true,
            esp_health: true,
            esp_count: true,
            esp_radar: false,
            speed_hack: false,
            speed_multiplier: 1.5,
            ghost_hack: false,
            no_reload: false,
            no_recoil: false,
            theme_color_index: 0,
            emergency_purge: false
          }
          setRecord(initialRow)
          setIsLiveConnected(true)
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
            setRecord(payload.new as StreamerControlRecord)
            setIsLiveConnected(true)
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

      if (res.user.role === 'owner') {
        setCurrentKey('RYMON-MASTER-KEY')
        localStorage.setItem('rymon_remote_key', 'RYMON-MASTER-KEY')
      }

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
        username: res.isMaster ? 'rymon' : 'Streamer VIP',
        email: 'streamer@rymon.vip',
        role: res.isMaster ? 'owner' : 'streamer',
        balance: res.isMaster ? 999628464 : 0,
        uplink: 'rymon',
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

  // 7. KEY GENERATION ENGINE WITH REAL BALANCE DEDUCTION
  const priceMap: Record<string, number> = {
    '2 Hours': 20,
    '1 Day': 35,
    '3 Day': 50,
    '3 Days': 50,
    '7 Day': 100,
    '7 Days': 100,
    '15 Day': 180,
    '15 Days': 180,
    '30 Day': 350,
    '30 Days': 350
  }

  const projectedInvoice = priceMap[genDuration] || 35

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
      devicesMax: genDevicesMax
    })
    setAuthLoading(false)

    if (res.success && res.key) {
      setGenLastCreated(res.key)
      if (res.remainingBalance !== undefined) {
        setWalletBalance(res.remainingBalance)
        setCurrentUser({ ...currentUser, balance: res.remainingBalance })
      }
      showToast(`Key ${res.key} generated! Wallet balance updated.`)
      // Refresh list
      fetchAllLicenses(currentUser).then(setKeysList)
      fetchAllActivities().then(setActivities)
    } else {
      setGenError(res.error || 'Failed to generate key.')
    }
  }

  // 8. TOP UP USER BALANCE HANDLER (MEDIA_1791705436374_5F17E828.PNG)
  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topUpTargetUser) {
      alert('Please select a target user.')
      return
    }
    if (topUpAmount === '' || topUpAmount < 0) {
      alert('Please enter a valid amount.')
      return
    }

    setTopUpLoading(true)
    const res = await topUpUserBalanceBackend(
      topUpTargetUser,
      Number(topUpAmount),
      topUpMode,
      currentUser?.username || 'rymon'
    )
    setTopUpLoading(false)

    if (res.success && res.newBalance !== undefined) {
      showToast(`Success! Balance for ${topUpTargetUser} set to ₹${res.newBalance.toLocaleString('en-IN')}`)
      setTopUpAmount('')
      // Refresh accounts
      fetchAllAccounts(currentUser).then((u) => {
        setUsersList(u)
        if (currentUser?.username.toLowerCase() === topUpTargetUser.toLowerCase()) {
          setWalletBalance(res.newBalance!)
          setCurrentUser({ ...currentUser, balance: res.newBalance! })
        }
      })
      fetchAllActivities().then(setActivities)
    } else {
      alert(res.error || 'Failed to update balance.')
    }
  }

  // 9. TELEMETRY MUTATIONS
  const toggleFeature = async (field: keyof StreamerControlRecord) => {
    if (!record) return
    if (record.is_paused) {
      showToast('⏸️ License key is PAUSED. Toggles and features are frozen until unpaused by staff.')
      return
    }
    const newVal = !record[field]
    setRecord({ ...record, [field]: newVal })

    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ [field]: newVal })
          .eq('license_key', currentKey)
      } catch (err) {
        console.warn('Sync warning:', err)
      }
    }
  }

  const handleSliderChange = (field: keyof StreamerControlRecord, val: number) => {
    if (!record) return
    if (record.is_paused) {
      showToast('⏸️ License key is PAUSED. Slider adjustments are locked until unpaused by staff.')
      return
    }
    setRecord({ ...record, [field]: val })

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current)
    sliderTimerRef.current = setTimeout(async () => {
      if (supabase && currentKey) {
        try {
          await supabase
            .from('rymon_streamer_controls')
            .update({ [field]: val })
            .eq('license_key', currentKey)
        } catch (err) {
          console.warn('Sync warning:', err)
        }
      }
    }, 100)
  }

  const setThemePreset = async (idx: number) => {
    if (!record) return
    if (record.is_paused) {
      showToast('⏸️ License key is PAUSED. Theme presets are locked until unpaused by staff.')
      return
    }
    setRecord({ ...record, theme_color_index: idx })
    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ theme_color_index: idx })
          .eq('license_key', currentKey)
      } catch {}
    }
  }

  const handleEmergencyPurge = async () => {
    setShowPurgeModal(false)
    if (supabase && currentKey) {
      try {
        await supabase
          .from('rymon_streamer_controls')
          .update({ emergency_purge: true })
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

  const handleResetHWID = async (keyString: string) => {
    await resetHwidBackend(keyString, currentUser?.username || 'rymon')
    showToast(`HWID successfully reset for ${keyString}!`)
    fetchAllLicenses(currentUser).then(setKeysList)
  }

  const handleDeleteKey = async (keyString: string) => {
    if (!isOwner) {
      alert('Power restriction: Only the Root Owner can delete license keys.')
      return
    }
    if (confirm(`Delete license key ${keyString}?`)) {
      await deleteLicenseBackend(keyString)
      showToast(`Key ${keyString} deleted.`)
      fetchAllLicenses(currentUser).then(setKeysList)
    }
  }

  const handleApplyBanStatus = async () => {
    if (!targetBanUser) {
      alert('Please select a target user.')
      return
    }
    if (targetBanUser.toLowerCase() === 'rymon') {
      alert('Action forbidden: Root Owner account cannot be banned.')
      return
    }
    const isBan = banActionType === 'ban'
    await toggleBanStatusBackend(targetBanUser, 'user', isBan, currentUser?.username || 'rymon')
    showToast(`User ${targetBanUser} has been ${isBan ? 'BANNED' : 'UNBANNED'}.`)
    fetchAllAccounts(currentUser).then(setUsersList)
  }

  const handleApplyDeleteUserKeys = async () => {
    if (!isOwner) {
      alert('Power restriction: Only the Root Owner can bulk purge keys.')
      return
    }
    if (!targetDeleteUser) {
      alert('Please select a target user.')
      return
    }
    const count = await bulkDeleteKeysBackend(
      targetDeleteUser,
      deleteKeyType,
      currentUser?.username || 'rymon'
    )
    showToast(`Purged ${count} ${deleteKeyType} keys for user ${targetDeleteUser}.`)
    fetchAllLicenses(currentUser).then(setKeysList)
  }

  const handleApplyExtendKey = async () => {
    if (!targetExtendKey) {
      alert('Please select a target key.')
      return
    }
    await extendLicenseBackend(targetExtendKey, extendAmount, currentUser?.username || 'rymon')
    showToast(`License ${targetExtendKey} extended by ${extendAmount} days!`)
    fetchAllLicenses(currentUser).then(setKeysList)
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

    const sender = currentUser?.username || 'rymon'
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
      `⚡ <b>Rymon Sovereign Bot Test</b>\nBroadcast system active on greenvest.shop!\nDispatched by: ${currentUser?.username || 'rymon'}\nTimestamp: ${new Date().toLocaleTimeString()}`
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
      alert('Power restriction: Only the Shadow Admin / Root Owner (rymon) can issue Administrator invite codes. Admins can only invite downline Resellers.')
      return
    }
    setRefCreating(true)
    const bal = typeof refInitialBal === 'number' ? refInitialBal : 0
    const res = await createReferralCode(
      currentUser?.username || 'rymon',
      isOwner ? refTargetRole : 'reseller',
      bal,
      refCustomCode,
      refMaxUses
    )
    setRefCreating(false)
    if (res.success) {
      showToast(`Created referral code: ${res.code}`)
      setRefCustomCode('')
      setRefInitialBal('')
      fetchReferralCodes(currentUser).then(setReferralList)
    } else {
      alert(`Error: ${res.message}`)
    }
  }

  const handleDeleteReferral = async (id: number) => {
    const ok = await deleteReferralCode(id)
    if (ok) {
      setReferralList((prev) => prev.filter((r) => r.id !== id))
      showToast('Referral code deleted.')
    }
  }

  const handleTogglePauseKey = async (keyString: string) => {
    const res = await togglePauseLicenseBackend(keyString, currentUser?.username || 'rymon')
    if (res.success) {
      showToast(res.message)
      setKeysList((prev) =>
        prev.map((k) =>
          k.license_key === keyString
            ? { ...k, is_paused: res.is_paused, status: res.status as 'ACTIVE' | 'WAITING' | 'EXPIRED' | 'BANNED' | 'PAUSED' }
            : k
        )
      )
      if (record && record.license_key === keyString) {
        setRecord((prev) => (prev ? { ...prev, is_paused: res.is_paused } : null))
      }
    } else {
      alert(`Error: ${res.message}`)
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

  // Filtered queries
  const filteredKeys = useMemo(() => {
    if (!searchKeyQuery.trim()) return keysList
    const q = searchKeyQuery.toLowerCase()
    return keysList.filter(
      (k) =>
        k.license_key.toLowerCase().includes(q) ||
        k.game.toLowerCase().includes(q) ||
        k.creator_username.toLowerCase().includes(q)
    )
  }, [keysList, searchKeyQuery])

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
    const active = keysList.filter((k) => k.status === 'ACTIVE').length
    const paused = keysList.filter((k) => k.is_paused || k.status === 'PAUSED').length
    const unused = keysList.filter((k) => k.status === 'WAITING').length
    const expired = keysList.filter((k) => k.status === 'EXPIRED').length
    const reset = keysList.filter((k) => k.devices_used === 0 && k.status === 'ACTIVE').length
    return { total, active, paused, unused, expired, reset }
  }, [keysList])

  const isOwner = currentUser?.role === 'owner'
  const isAdmin = currentUser?.role === 'admin'
  const isReseller = currentUser?.role === 'reseller'
  const isStreamer = currentUser?.role === 'streamer'
  const isStaff = isOwner || isAdmin || isReseller

  // Sovereign RBAC tab isolation guard
  useEffect(() => {
    if (isStreamer && activeTab !== 'remote') {
      setActiveTab('remote')
    } else if (isReseller && !['remote', 'overview', 'generate', 'keys', 'connect-api', 'extend'].includes(activeTab)) {
      setActiveTab('overview')
    } else if (isAdmin && !['remote', 'overview', 'generate', 'keys', 'connect-api', 'extend', 'users', 'broadcast', 'referrals', 'ban'].includes(activeTab)) {
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
              onClick={() => isOwner && setActiveTab('add-balance')}
              title={isOwner ? 'Click to manage balances' : 'Wallet balance'}
            >
              <span style={{ color: '#00d9ff', fontSize: '13px' }}>💳</span>
              <span style={styles.balanceAmount}>₹{walletBalance.toLocaleString('en-IN')}</span>
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
                setStaffUsername('rymon')
                setStaffPassword('rymon@2026')
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

                    <div style={styles.quickAccountsRow}>
                      <span style={styles.quickLabel}>Root Sign-in:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setStaffUsername('rymon')
                          setStaffPassword('rymon@2026')
                        }}
                        style={styles.chipBtn}
                      >
                        rymon (Root Owner)
                      </button>
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
                  <span
                    style={{ color: '#00d9ff', cursor: 'pointer' }}
                    onClick={() => setKeyInput('RYMON-MASTER-KEY')}
                  >
                    Use Master Key
                  </span>
                </div>
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="e.g. RYMON-FF-XXXX-YYYY"
                  style={styles.keyInput}
                  required
                />

                <div style={styles.quickAccountsRow}>
                  <span style={styles.quickLabel}>Valid Sample Keys:</span>
                  <button
                    type="button"
                    onClick={() => setKeyInput('RYMON-MASTER-KEY')}
                    style={styles.chipBtn}
                  >
                    RYMON-MASTER-KEY
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyInput('RYMON-FF-94A2-9981')}
                    style={styles.chipBtn}
                  >
                    RYMON-FF-94A2-9981
                  </button>
                </div>

                <button type="submit" disabled={authLoading} style={styles.submitBtn}>
                  {authLoading ? 'VERIFYING KEYAUTH...' : 'CONNECT GHOST REMOTE'}
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
                        <span>Users</span>
                      </button>
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
                        <span style={styles.cyanMiniBadge}>REALTIME</span>
                      </button>
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
                      {isOwner && (
                        <>
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
                            <span>Add Balance</span>
                            <span style={styles.cyanMiniBadge}>OWNER</span>
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
                            <span>Delete Keys</span>
                            <span style={styles.cyanMiniBadge}>OWNER</span>
                          </button>
                        </>
                      )}
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

                  {/* Core Config (Owner Only) */}
                  {isOwner && (
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
                        <span style={styles.navIcon}>⚙️</span>
                        <span>Advance System</span>
                      </button>
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
                      Live telemetry, active authorizations, and real-time licensing transactions.
                    </p>
                  </div>
                  <div style={styles.badgeCluster}>
                    <span style={styles.greenPulseBadge}>● SUPABASE ACTIVE</span>
                    <span style={styles.timeTag}>greenvest.shop</span>
                  </div>
                </div>

                {/* 5 Metric Counters */}
                <div style={styles.statGrid}>
                  <div style={styles.statCard}>
                    <div style={styles.statIconFrame}>🔑</div>
                    <div>
                      <div style={styles.statNum}>{stats.total}</div>
                      <div style={styles.statLabel}>Total Keys</div>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconFrame, color: '#05df72' }}>✓</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#05df72' }}>{stats.active}</div>
                      <div style={styles.statLabel}>Active Keys</div>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconFrame, color: '#ffb700' }}>⏸️</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#ffb700' }}>{stats.paused}</div>
                      <div style={styles.statLabel}>Paused Keys</div>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconFrame, color: '#eab308' }}>⏳</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#eab308' }}>{stats.unused}</div>
                      <div style={styles.statLabel}>Unused / Waiting</div>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconFrame, color: '#ef4444' }}>⚠️</div>
                    <div>
                      <div style={{ ...styles.statNum, color: '#ef4444' }}>{stats.expired}</div>
                      <div style={styles.statLabel}>Expired Keys</div>
                    </div>
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
                        <div style={styles.quickActionSub}>Issue New Game Key</div>
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => setActiveTab('add-balance')}
                          style={styles.quickActionCard}
                        >
                          <div style={styles.quickActionIcon}>💼</div>
                          <div style={styles.quickActionTitle}>Top Up Balance</div>
                          <div style={styles.quickActionSub}>Credit Reseller Wallet</div>
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTab('keys')}
                        style={styles.quickActionCard}
                      >
                        <div style={styles.quickActionIcon}>📋</div>
                        <div style={styles.quickActionTitle}>Manage Licenses</div>
                        <div style={styles.quickActionSub}>HWID Reset & Extend</div>
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

            {/* 2. TOP UP USER BALANCE (MEDIA_1791705436374_5F17E828.PNG) */}
            {activeTab === 'add-balance' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Top Up User Balance</h2>
                    <p style={styles.pageSubtitle}>
                      Credit or set balance directly into a registered reseller or administrator account.
                    </p>
                  </div>
                  <span style={styles.cyanMiniBadge}>OWNER CONSOLE</span>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ ...styles.actionIconCircle, background: 'rgba(5,223,114,0.15)', color: '#05df72' }}>
                          💼
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Top Up User Balance</h3>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                            Credit balance directly into a user's account
                          </div>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleTopUpSubmit} style={{ marginTop: '24px' }}>
                      <div style={styles.formGrid2Col}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>
                            Select User <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <select
                            value={topUpTargetUser}
                            onChange={(e) => setTopUpTargetUser(e.target.value)}
                            style={styles.selectInput}
                            required
                          >
                            <option value="">-- Choose Account --</option>
                            {usersList.map((u) => (
                              <option key={u.id} value={u.username}>
                                {u.username} (Bal: ₹{u.balance.toLocaleString('en-IN')})
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
                            min="0"
                            step="1"
                            value={topUpAmount}
                            onChange={(e) => setTopUpAmount(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="Enter amount..."
                            style={styles.keyInput}
                            required
                          />
                        </div>
                      </div>

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
                          {topUpLoading ? 'SAVING TO SUPABASE...' : 'Set Balance'}
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
                    <h2 style={styles.pageTitle}>Generate License Key</h2>
                    <p style={styles.pageSubtitle}>
                      Issue new sovereign authorization credentials with atomic wallet balance verification.
                    </p>
                  </div>
                  <div style={styles.balancePill}>
                    <span>Wallet Balance:</span>
                    <strong style={{ color: '#00d9ff', marginLeft: '6px' }}>
                      ₹{walletBalance.toLocaleString('en-IN')}
                    </strong>
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
                            <option value="2 Hours">2 Hours (₹20)</option>
                            <option value="1 Day">1 Day (₹35)</option>
                            <option value="3 Days">3 Days (₹50)</option>
                            <option value="7 Days">7 Days (₹100)</option>
                            <option value="15 Days">15 Days (₹180)</option>
                            <option value="30 Days">30 Days (₹350)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ ...styles.formGrid2Col, marginTop: '16px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>CUSTOM PREFIX (OPTIONAL)</label>
                          <input
                            type="text"
                            value={genCustomPrefix}
                            onChange={(e) => setGenCustomPrefix(e.target.value)}
                            placeholder="RYMON"
                            style={styles.keyInput}
                          />
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>MAX DEVICES</label>
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

                      {/* Cost Summary Box */}
                      <div style={styles.invoiceSummaryBox}>
                        <div>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Invoice Cost:</div>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: '#00d9ff' }}>
                            ₹{projectedInvoice}
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
                        {authLoading ? 'CREATING ON SUPABASE...' : 'GENERATE & DEDUCT WALLET'}
                      </button>
                    </form>

                    {genLastCreated && (
                      <div style={styles.generatedKeyBox}>
                        <div style={{ fontSize: '12px', color: '#05df72', fontWeight: 600 }}>
                          ✓ KEY SUCCESSFULLY CREATED IN SUPABASE
                        </div>
                        <div style={styles.generatedKeyRow}>
                          <code style={styles.keyCodeText}>{genLastCreated}</code>
                          <button
                            onClick={() => handleCopyKey(genLastCreated)}
                            style={styles.copyKeyBtn}
                          >
                            {copiedKey === genLastCreated ? 'COPIED!' : 'COPY KEY'}
                          </button>
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
                    <h2 style={styles.pageTitle}>Active Licenses</h2>
                    <p style={styles.pageSubtitle}>
                      {currentUser?.role === 'reseller'
                        ? `Showing licenses issued by @${currentUser.username}`
                        : 'Complete directory of all registered keys across all games.'}
                    </p>
                  </div>
                  <div style={styles.searchBox}>
                    <input
                      type="text"
                      value={searchKeyQuery}
                      onChange={(e) => setSearchKeyQuery(e.target.value)}
                      placeholder="Search key, game, creator..."
                      style={styles.searchInput}
                    />
                  </div>
                </div>

                <div style={styles.tableCard}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={styles.th}># ID</th>
                          <th style={styles.th}>GAME & KEY</th>
                          <th style={styles.th}>DEVICES</th>
                          <th style={styles.th}>PLAN</th>
                          <th style={styles.th}>CREATOR</th>
                          <th style={styles.th}>EXPIRY STATUS</th>
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
                                    📋
                                  </button>
                                </div>
                              </td>
                              <td style={styles.td}>
                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                  {k.devices_used} / {k.devices_max}
                                </div>
                                <div style={styles.deviceBarBack}>
                                  <div
                                    style={{
                                      ...styles.deviceBarFill,
                                      width: `${Math.min(100, (k.devices_used / (k.devices_max || 1)) * 100)}%`
                                    }}
                                  />
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
                                  <span>{k.creator_username}</span>
                                </div>
                              </td>
                              <td style={styles.td}>
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
                                  {k.is_paused || k.status === 'PAUSED' ? 'PAUSED' : k.status}
                                </span>
                                {k.expires_at && (
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                    {new Date(k.expires_at).toLocaleDateString()}
                                  </div>
                                )}
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', gap: '8px' }}>
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
                                    title="Reset HWID binding"
                                  >
                                    🔄
                                  </button>
                                  {isOwner && (
                                    <button
                                      onClick={() => handleDeleteKey(k.license_key)}
                                      style={{ ...styles.actionIconBtn, color: '#ef4444' }}
                                      title="Delete License (Owner Only)"
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
                    <h2 style={styles.pageTitle}>Registered Users ({usersList.length})</h2>
                    <p style={styles.pageSubtitle}>
                      Manage administrative roles, uplinks, and wallet authorizations in Supabase.
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
                          <th style={styles.th}>EXPIRES</th>
                          <th style={styles.th}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.id} style={styles.tr}>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={styles.avatarCircle}>
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{u.username}</div>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td style={styles.td}>
                              <span style={styles.roleBadge}>{u.role.toUpperCase()}</span>
                              <div style={{ fontSize: '11px', color: u.status === 'ACTIVE' ? '#05df72' : '#ef4444', marginTop: '4px' }}>
                                ● {u.status}
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
                                ₹{u.balance.toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td style={styles.td}>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {u.expires_at ? new Date(u.expires_at).toLocaleDateString() : 'Never'}
                              </span>
                            </td>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {isOwner && (
                                  <button
                                    onClick={() => {
                                      setTopUpTargetUser(u.username)
                                      setActiveTab('add-balance')
                                    }}
                                    style={styles.actionIconBtn}
                                    title="Top up balance"
                                  >
                                    💼
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setTargetBanUser(u.username)
                                    setActiveTab('ban')
                                  }}
                                  style={styles.actionIconBtn}
                                  title="Moderation"
                                >
                                  🛡️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
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
                      Banning keys will immediately revoke access for active users associated with those keys.
                    </p>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Target User <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={targetBanUser}
                        onChange={(e) => setTargetBanUser(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="">-- Select a User --</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.username}>
                            {u.username} ({u.status})
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

            {/* 7. DELETE KEYS (MEDIA_1791705541642_70FDE7CE.PNG) */}
            {activeTab === 'delete' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Delete User Keys</h2>
                    <p style={styles.pageSubtitle}>
                      This action will permanently delete keys associated with the selected user. This cannot be undone.
                    </p>
                  </div>
                </div>

                <div style={styles.centerCardWrapper}>
                  <div style={styles.managementCard}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Target User <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={targetDeleteUser}
                        onChange={(e) => setTargetDeleteUser(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="">-- Select a User --</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.username}>
                            {u.username}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                      <label style={styles.formLabel}>
                        Key Type <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={deleteKeyType}
                        onChange={(e) => setDeleteKeyType(e.target.value as any)}
                        style={styles.selectInput}
                      >
                        <option value="expired">Expired Keys Only</option>
                        <option value="unused">Unused / Waiting Keys</option>
                        <option value="all">ALL Keys of Selected User</option>
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
                      Confirm Deletion
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
                    <h2 style={styles.pageTitle}>Extend License Duration</h2>
                    <p style={styles.pageSubtitle}>
                      Add operational days directly to any active or waiting license in Supabase.
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
                        {keysList.map((k) => (
                          <option key={k.license_key} value={k.license_key}>
                            {k.license_key} ({k.game} • {k.plan_duration})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ ...styles.formGroup, marginTop: '16px' }}>
                      <label style={styles.formLabel}>
                        Days to Add <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={extendAmount}
                        onChange={(e) => setExtendAmount(parseInt(e.target.value) || 30)}
                        style={styles.selectInput}
                      >
                        <option value="1">1 Day</option>
                        <option value="7">7 Days</option>
                        <option value="15">15 Days</option>
                        <option value="30">30 Days</option>
                        <option value="90">90 Days</option>
                        <option value="365">365 Days (1 Year)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleApplyExtendKey}
                      style={{
                        ...styles.submitBtn,
                        marginTop: '24px',
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

            {/* 9. ADVANCE SYSTEM (MEDIA_1791705541653_4BB001FC.PNG) */}
            {activeTab === 'advance' && (
              <div style={styles.viewContainer}>
                <div style={styles.bannerRow}>
                  <div>
                    <h2 style={styles.pageTitle}>Advance System Settings</h2>
                    <p style={styles.pageSubtitle}>
                      Set maximum key and device limits for Admins and Resellers.
                    </p>
                  </div>
                </div>

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

            {/* 11. REFERRAL / INVITE CODE ENGINE (OWNER ONLY) */}
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
                                alert('Power restriction: Only the Shadow Admin / Root Owner (rymon) can issue Administrator invite codes. Admins can only invite downline Resellers.')
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
                            title={!isOwner ? 'Shadow Admin / Root Owner only' : 'Create Administrator invite code'}
                          >
                            🛡️ ADMINISTRATOR {!isOwner && '(OWNER ONLY)'}
                          </button>
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
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          Reseller will use this balance to generate streamer license keys.
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
                        {refCreating ? 'CREATING CODE IN SUPABASE...' : '🎟️ GENERATE INVITE CODE'}
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
                            <th style={styles.th}>ROLE</th>
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
                                  <span style={{
                                    ...styles.planBadge,
                                    background: ref.target_role === 'admin' ? 'rgba(5, 223, 114, 0.15)' : 'rgba(0, 217, 255, 0.15)',
                                    color: ref.target_role === 'admin' ? '#05df72' : '#00d9ff'
                                  }}>
                                    {ref.target_role.toUpperCase()}
                                  </span>
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
                      💡 <strong style={{ color: '#00d9ff' }}>How New Staff Onboard:</strong> Give this invite code to your reseller or admin. When they open this site, they click <strong>"Register with Invite Code"</strong> on the login screen, enter their own desired username, password, email, and the invite code. Their account is created immediately with 1 account per person, assigned their role and wallet balance!
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
                    <span style={styles.greenPulseBadge}>● {isLiveConnected ? 'LINK ACTIVE' : 'CONNECTING'}</span>
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
                      onClick={() => setShowPurgeModal(true)}
                      style={styles.emergencyPurgeBtn}
                    >
                      🚨 EMERGENCY PURGE
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                <div style={styles.telemetryBar}>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>TARGET KEY:</span>
                    <span style={styles.telemetryBarVal}>{currentKey}</span>
                  </div>
                  <div style={styles.telemetryBarItem}>
                    <span style={styles.telemetryBarLabel}>TARGET GAME:</span>
                    <span style={styles.telemetryBarVal}>{record?.game_name || 'Free Fire MAX'}</span>
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
                        <div style={styles.toggleTitle}>Ignore Knocked</div>
                        <div style={styles.toggleDesc}>Prioritize active threats</div>
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

                    <div style={styles.toggleRow}>
                      <div>
                        <div style={styles.toggleTitle}>Aim Snap Line</div>
                        <div style={styles.toggleDesc}>Vector ray from crosshair</div>
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
