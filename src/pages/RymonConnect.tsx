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
  bulkDeleteKeysBackend,
  toggleBanStatusBackend,
  extendLicenseBackend,
  checkSupabaseSchemaStatus
} from '../lib/rymonBackend'

type TabType =
  | 'overview'
  | 'remote'
  | 'generate'
  | 'keys'
  | 'users'
  | 'add-balance'
  | 'ban'
  | 'delete'
  | 'extend'
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
      const [lcs, usrs, acts] = await Promise.all([
        fetchAllLicenses(currentUser),
        fetchAllAccounts(),
        fetchAllActivities()
      ])

      if (isMounted) {
        setKeysList(lcs)
        setUsersList(usrs)
        setActivities(acts)

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
            fetchAllAccounts().then((u) => {
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
        .subscribe()

      return () => {
        isMounted = false
        if (supabase) supabase.removeChannel(channel)
      }
    }
  }, [isAuthenticated, currentUser?.username, currentUser?.role])

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
      fetchAllAccounts().then((u) => {
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
    const isBan = banActionType === 'ban'
    await toggleBanStatusBackend(targetBanUser, 'user', isBan, currentUser?.username || 'rymon')
    showToast(`User ${targetBanUser} has been ${isBan ? 'BANNED' : 'UNBANNED'}.`)
    fetchAllAccounts().then(setUsersList)
  }

  const handleApplyDeleteUserKeys = async () => {
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
    const unused = keysList.filter((k) => k.status === 'WAITING').length
    const expired = keysList.filter((k) => k.status === 'EXPIRED').length
    const reset = keysList.filter((k) => k.devices_used === 0 && k.status === 'ACTIVE').length
    return { total, active, unused, expired, reset }
  }, [keysList])

  const isOwner = currentUser?.role === 'owner'
  const isAdmin = currentUser?.role === 'admin'
  const isStaff = isOwner || isAdmin || currentUser?.role === 'reseller'

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
                    placeholder="e.g. rymon, ROGER, SK2020"
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
                  <span style={styles.quickLabel}>Quick Sign-in:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffUsername('rymon')
                      setStaffPassword('rymon@2026')
                    }}
                    style={styles.chipBtn}
                  >
                    rymon (Owner)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffUsername('ROGER')
                      setStaffPassword('roger')
                    }}
                    style={styles.chipBtn}
                  >
                    ROGER (Reseller)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffUsername('SK2020')
                      setStaffPassword('sk2020')
                    }}
                    style={styles.chipBtn}
                  >
                    SK2020 (Reseller)
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
                  {isOwner && (
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

              {/* Core Config */}
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

                {/* 4 Metric Counters */}
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
                                      k.status === 'ACTIVE'
                                        ? 'rgba(5,223,114,0.15)'
                                        : k.status === 'WAITING'
                                        ? 'rgba(234,179,8,0.15)'
                                        : 'rgba(239,68,68,0.15)',
                                    color:
                                      k.status === 'ACTIVE'
                                        ? '#05df72'
                                        : k.status === 'WAITING'
                                        ? '#eab308'
                                        : '#ef4444'
                                  }}
                                >
                                  {k.status}
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
                                    onClick={() => handleResetHWID(k.license_key)}
                                    style={styles.actionIconBtn}
                                    title="Reset HWID binding"
                                  >
                                    🔄
                                  </button>
                                  {(isOwner || isAdmin) && (
                                    <button
                                      onClick={() => handleDeleteKey(k.license_key)}
                                      style={{ ...styles.actionIconBtn, color: '#ef4444' }}
                                      title="Delete License"
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

            {/* 11. STREAMER REMOTE (TELEMETRY & HARDWARE CONTROLLER) */}
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
                    <span style={styles.telemetryBarLabel}>EXPIRES IN:</span>
                    <span style={{ ...styles.telemetryBarVal, color: '#00d9ff' }}>{countdown}</span>
                  </div>
                </div>

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
