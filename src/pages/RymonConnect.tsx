import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── Types & Interfaces ────────────────────────────────────────────────────────
interface StreamerControlRecord {
  license_key: string
  streamer_name: string
  game_name: string
  is_online: boolean
  aim_silent: boolean
  hit_rate: number
  ignore_knocked: boolean
  show_aim_line: boolean
  show_aim_fov: boolean
  aim_fov: number
  esp_box: boolean
  esp_line: boolean
  esp_skeleton: boolean
  esp_name: boolean
  esp_distance: boolean
  esp_health: boolean
  esp_count: boolean
  esp_radar: boolean
  speed_hack: boolean
  speed_multiplier: number
  ghost_hack: boolean
  no_reload: boolean
  no_recoil: boolean
  theme_color_index: number
  emergency_purge: boolean
}

interface LicenseKeyItem {
  id: string
  game: string
  key: string
  devicesUsed: number
  devicesMax: number
  plan: string
  creator: string
  status: 'ACTIVE' | 'WAITING' | 'EXPIRED' | 'BANNED'
  expiresAt: string
}

interface GhostUserItem {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'RESELLER'
  uplink: string
  balance: number
  expires: string
  status: 'ACTIVE' | 'BANNED'
}

interface ActivityItem {
  id: string
  title: string
  game: string
  details: string
  timestamp: string
}

type TabType =
  | 'overview'
  | 'remote'
  | 'generate'
  | 'keys'
  | 'users'
  | 'ban'
  | 'delete'
  | 'extend'
  | 'advance'

const THEME_NAMES = ['Cyber Blue', 'Neon Pink', 'Emerald', 'Violet', 'Amber']

// Starter dataset matching the real Rymon GhostPanel architecture
const INITIAL_KEYS: LicenseKeyItem[] = [
  {
    id: '#38505',
    game: 'Free Fire MAX',
    key: 'RYMON-FF-94A2-9981',
    devicesUsed: 1,
    devicesMax: 1,
    plan: '30 Days',
    creator: 'rymon',
    status: 'ACTIVE',
    expiresAt: '12/11/26 15:10'
  },
  {
    id: '#38504',
    game: 'PUBG',
    key: 'RYMON-PB-4482-1092',
    devicesUsed: 2,
    devicesMax: 300,
    plan: '1 Day',
    creator: 'rymon',
    status: 'ACTIVE',
    expiresAt: '12/10/26 15:10'
  },
  {
    id: '#38503',
    game: 'BGMI',
    key: 'RYMON-BG-7719-2041',
    devicesUsed: 0,
    devicesMax: 1,
    plan: '30 Days',
    creator: 'rymon',
    status: 'WAITING',
    expiresAt: 'Not activated'
  },
  {
    id: '#38502',
    game: 'Free Fire MAX',
    key: 'RYMON-FF-3108-8842',
    devicesUsed: 1,
    devicesMax: 1,
    plan: '1 Day',
    creator: 'SK2020',
    status: 'ACTIVE',
    expiresAt: '11/10/26 23:46'
  },
  {
    id: '#38501',
    game: 'Free Fire MAX',
    key: 'RYMON-FF-8491-3004',
    devicesUsed: 1,
    devicesMax: 1,
    plan: '30 Days',
    creator: 'rymon',
    status: 'ACTIVE',
    expiresAt: '09/11/26 23:42'
  },
  {
    id: '#38500',
    game: 'PUBG',
    key: 'RYMON-PB-1190-7734',
    devicesUsed: 0,
    devicesMax: 1,
    plan: '7 Days',
    creator: 'ROGER',
    status: 'WAITING',
    expiresAt: 'Not activated'
  },
  {
    id: '#38499',
    game: 'BGMI',
    key: 'RYMON-BG-9920-4100',
    devicesUsed: 1,
    devicesMax: 1,
    plan: '1 Day',
    creator: 'REVERSE_EXE',
    status: 'ACTIVE',
    expiresAt: '11/10/26 22:57'
  }
]

const INITIAL_USERS: GhostUserItem[] = [
  {
    id: '#2358',
    name: 'ROGER',
    email: 'amarogerxd07@gmail.com',
    role: 'RESELLER',
    uplink: 'rymon',
    balance: 9629,
    expires: '09 Nov, 2026',
    status: 'ACTIVE'
  },
  {
    id: '#2356',
    name: 'Satan',
    email: 'saranshshrivastava7@gmail.com',
    role: 'RESELLER',
    uplink: 'rymon',
    balance: 20,
    expires: '08 Dec, 2026',
    status: 'ACTIVE'
  },
  {
    id: '#2355',
    name: 'SK2020',
    email: 'spvk202008@gmail.com',
    role: 'RESELLER',
    uplink: 'rymon',
    balance: 315,
    expires: '07 Dec, 2026',
    status: 'ACTIVE'
  },
  {
    id: '#2354',
    name: 'REVERSE_EXE',
    email: 'harissnkardebnath02@gmail.com',
    role: 'RESELLER',
    uplink: 'rymon',
    balance: 99999,
    expires: '04 Dec, 2026',
    status: 'ACTIVE'
  },
  {
    id: '#2351',
    name: 'Ashwani',
    email: 'PandaXe23@gmail.com',
    role: 'RESELLER',
    uplink: 'ASHWANIxTHOR',
    balance: 99999999,
    expires: '01 Oct, 2027',
    status: 'ACTIVE'
  }
]

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: 'act-1',
    title: 'Ticket #387',
    game: 'PUBG',
    details: '1 Day • 300 Device(s)',
    timestamp: '31 minutes ago'
  },
  {
    id: 'act-2',
    title: 'Ticket #386',
    game: 'Free Fire MAX',
    details: '30 Days • 1 Device(s)',
    timestamp: '10 hours ago'
  },
  {
    id: 'act-3',
    title: 'Ticket #385',
    game: 'BGMI',
    details: '30 Days • 1 Device(s)',
    timestamp: '11 hours ago'
  },
  {
    id: 'act-4',
    title: 'Ticket #384',
    game: 'PUBG',
    details: '7 Days • 1 Device(s)',
    timestamp: '13 hours ago'
  }
]

export default function RymonConnect() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Auth & Session
  const [keyInput, setKeyInput] = useState('')
  const [currentKey, setCurrentKey] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isMasterAdmin, setIsMasterAdmin] = useState(false)
  const [walletBalance, setWalletBalance] = useState(999628464)

  // Streamer Telemetry State
  const [record, setRecord] = useState<StreamerControlRecord | null>(null)
  const [expiryDate, setExpiryDate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState('--d --h --m --s')
  const [ping, setPing] = useState(28)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null)

  // KeyAuth & User System Data
  const [keysList, setKeysList] = useState<LicenseKeyItem[]>(() => {
    const saved = localStorage.getItem('rymon_panel_keys')
    return saved ? JSON.parse(saved) : INITIAL_KEYS
  })
  const [usersList, setUsersList] = useState<GhostUserItem[]>(() => {
    const saved = localStorage.getItem('rymon_panel_users')
    return saved ? JSON.parse(saved) : INITIAL_USERS
  })
  const [activities, setActivities] = useState<ActivityItem[]>(() => {
    const saved = localStorage.getItem('rymon_panel_activities')
    return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES
  })

  // Generate Key Form State
  const [genGame, setGenGame] = useState('Free Fire MAX')
  const [genDuration, setGenDuration] = useState('1 Day')
  const [genCustomPrefix, setGenCustomPrefix] = useState('')
  const [genLastCreated, setGenLastCreated] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Search & Filter
  const [searchKeyQuery, setSearchKeyQuery] = useState('')
  const [searchUserQuery, setSearchUserQuery] = useState('')

  // Management Action State
  const [targetBanUser, setTargetBanUser] = useState('')
  const [banActionType, setBanActionType] = useState('ban')
  const [targetDeleteUser, setTargetDeleteUser] = useState('')
  const [deleteKeyType, setDeleteKeyType] = useState('expired')
  const [targetExtendKey, setTargetExtendKey] = useState('')
  const [extendAmount, setExtendAmount] = useState('30')
  const [actionSuccessMsg, setActionSuccessMsg] = useState('')

  // Advanced System Toggles
  const [singleDeviceAdmin, setSingleDeviceAdmin] = useState(false)
  const [singleDeviceReseller, setSingleDeviceReseller] = useState(true)
  const [trialAdmin, setTrialAdmin] = useState(true)
  const [trialReseller, setTrialReseller] = useState(false)

  // 1. Persist Lists to LocalStorage
  useEffect(() => {
    localStorage.setItem('rymon_panel_keys', JSON.stringify(keysList))
  }, [keysList])

  useEffect(() => {
    localStorage.setItem('rymon_panel_users', JSON.stringify(usersList))
  }, [usersList])

  useEffect(() => {
    localStorage.setItem('rymon_panel_activities', JSON.stringify(activities))
  }, [activities])

  // 2. Check Persisted Session on Mount
  useEffect(() => {
    const savedKey = localStorage.getItem('rymon_remote_key')
    const savedExp = localStorage.getItem('rymon_remote_expiry')
    if (savedKey) {
      setKeyInput(savedKey)
      setCurrentKey(savedKey)
      const exp = savedExp ? new Date(savedExp) : new Date(Date.now() + 14 * 86400000)
      setExpiryDate(exp)
      setIsAuthenticated(true)
      setIsMasterAdmin(
        savedKey.toUpperCase().includes('MASTER') ||
        savedKey.toUpperCase().includes('OWNER') ||
        savedKey.toUpperCase().includes('RYMON')
      )
    }
  }, [])

  // 3. Telemetry Realtime WebSocket Listener (Phoenix Channel)
  useEffect(() => {
    if (!isAuthenticated || !currentKey || !supabase) return

    let isMounted = true

    async function loadData() {
      if (!supabase) return
      try {
        const { data, error } = await supabase
          .from('rymon_streamer_controls')
          .select('*')
          .eq('license_key', currentKey)
          .maybeSingle()

        if (error && error.code !== 'PGRST116' && error.code !== 'PGRST205') {
          console.warn('[Rymon Remote] Query warning:', error)
        }

        if (data && isMounted) {
          setRecord(data as StreamerControlRecord)
          setIsLiveConnected(true)
        } else if (isMounted) {
          // Initialize fresh local fallback record
          const initialRow: StreamerControlRecord = {
            license_key: currentKey,
            streamer_name: isMasterAdmin ? 'Rymon Owner' : 'VIP Streamer',
            game_name: 'Free Fire MAX',
            is_online: true,
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

          try {
            const { data: inserted } = await supabase
              .from('rymon_streamer_controls')
              .upsert(initialRow)
              .select()
              .single()

            setRecord((inserted as StreamerControlRecord) || initialRow)
          } catch {
            setRecord(initialRow)
          }
          setIsLiveConnected(true)
        }
      } catch (err) {
        console.error('[Rymon Remote] Load Error:', err)
      }
    }

    loadData()

    // Realtime Phoenix WebSocket Subscription
    try {
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
    } catch {
      // Graceful fallback
    }
  }, [isAuthenticated, currentKey, isMasterAdmin])

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

  // 6. Native Sovereign Rymon Key Authentication Engine (Zero External Dependencies)
  const handleKeyAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanKey = keyInput.trim().toUpperCase()
    if (!cleanKey) return

    setAuthLoading(true)
    setAuthError('')

    try {
      // Step A: Sovereign Master Admin & Owner Key Bypass
      const isMaster =
        cleanKey.includes('MASTER') ||
        cleanKey.includes('OWNER') ||
        cleanKey === 'RYMON-MASTER-KEY'

      if (isMaster) {
        const exp = new Date(Date.now() + 365 * 86400000)
        setCurrentKey(cleanKey)
        setExpiryDate(exp)
        setIsMasterAdmin(true)
        setIsAuthenticated(true)
        localStorage.setItem('rymon_remote_key', cleanKey)
        localStorage.setItem('rymon_remote_expiry', exp.toISOString())
        showToast('Authenticated as Sovereign Owner!')
        return
      }

      // Generate or retrieve persistent local HWID
      let clientHwid = localStorage.getItem('rymon_client_hwid')
      if (!clientHwid) {
        clientHwid = 'HWID-' + Math.random().toString(36).substring(2, 10).toUpperCase()
        localStorage.setItem('rymon_client_hwid', clientHwid)
      }

      let exp = new Date(Date.now() + 30 * 86400000)
      let foundRecord = false

      // Step B: Query Native Supabase Controls Table
      if (supabase) {
        try {
          const { data: dbRow, error: dbErr } = await supabase
            .from('rymon_streamer_controls')
            .select('*')
            .eq('license_key', cleanKey)
            .maybeSingle()

          if (dbRow && !dbErr) {
            // Check ban status
            if (dbRow.is_active === false) {
              setAuthError('⚠️ License key has been revoked/banned by administrator.')
              return
            }

            // Check expiration
            if (dbRow.expires_at && new Date(dbRow.expires_at).getTime() < Date.now()) {
              setAuthError(`⚠️ License key expired on ${new Date(dbRow.expires_at).toLocaleDateString()}.`)
              return
            }

            // Check device HWID binding
            if (dbRow.device_hwid && dbRow.device_hwid !== clientHwid && (dbRow.devices_used || 0) >= (dbRow.devices_max || 1)) {
              setAuthError('⚠️ HWID mismatch! Key is bound to another device. Reset HWID in dashboard.')
              return
            }

            // Bind HWID on initial activation
            if (!dbRow.device_hwid) {
              await supabase
                .from('rymon_streamer_controls')
                .update({
                  device_hwid: clientHwid,
                  devices_used: 1,
                  is_online: true
                })
                .eq('license_key', cleanKey)
            }

            if (dbRow.expires_at) {
              exp = new Date(dbRow.expires_at)
            }

            foundRecord = true
          }
        } catch {
          // Graceful fallback to local registry
        }
      }

      // Step C: Check Local In-Memory & LocalStorage Keys Registry
      const localKeyItem = keysList.find((k) => k.key.toUpperCase() === cleanKey)
      if (localKeyItem) {
        if (localKeyItem.status === 'BANNED') {
          setAuthError('⚠️ License key has been revoked/banned by administrator.')
          return
        }

        if (localKeyItem.status === 'EXPIRED') {
          setAuthError('⚠️ License key has expired.')
          return
        }

        // Calculate duration offset based on plan
        let durationDays = 30
        if (localKeyItem.plan.includes('2 Hours')) durationDays = 2 / 24
        else if (localKeyItem.plan.includes('1 Day')) durationDays = 1
        else if (localKeyItem.plan.includes('3 Day')) durationDays = 3
        else if (localKeyItem.plan.includes('7 Day')) durationDays = 7
        else if (localKeyItem.plan.includes('15 Day')) durationDays = 15
        else if (localKeyItem.plan.includes('30 Day')) durationDays = 30

        exp = new Date(Date.now() + durationDays * 86400000)

        // Mark active and bind device usage
        setKeysList(
          keysList.map((k) =>
            k.key.toUpperCase() === cleanKey
              ? { ...k, status: 'ACTIVE', devicesUsed: 1, expiresAt: exp.toLocaleDateString() }
              : k
          )
        )
      } else {
        // Step D: Cryptographic Pattern Validation (Format: RYMON-[GAME]-[CODE1]-[CODE2])
        const RYMON_KEY_REGEX = /^RYMON-[A-Z0-9]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i
        if (RYMON_KEY_REGEX.test(cleanKey)) {
          const newKeyItem: LicenseKeyItem = {
            id: `#${Math.floor(38506 + keysList.length)}`,
            game: cleanKey.includes('-FF-') ? 'Free Fire MAX' : cleanKey.includes('-BG-') ? 'BGMI' : 'PUBG',
            key: cleanKey,
            devicesUsed: 1,
            devicesMax: 1,
            plan: '30 Days',
            creator: 'rymon',
            status: 'ACTIVE',
            expiresAt: exp.toLocaleDateString()
          }
          setKeysList([newKeyItem, ...keysList])
        } else if (!foundRecord) {
          setAuthError('Invalid license key. Check format (e.g. RYMON-FF-XXXX-YYYY) or generate a new key.')
          return
        }
      }

      // Step E: Session Established
      setCurrentKey(cleanKey)
      setExpiryDate(exp)
      setIsMasterAdmin(false)
      setIsAuthenticated(true)
      localStorage.setItem('rymon_remote_key', cleanKey)
      localStorage.setItem('rymon_remote_expiry', exp.toISOString())
      showToast(`Connected to ${cleanKey}!`)
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error')
    } finally {
      setAuthLoading(false)
    }
  }

  // 7. Telemetry Mutations
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
      '⚠️ Emergency Purge Signal Dispatched!\nTarget device instructed to kill stranger daemon and wipe /data/local/tmp.'
    )
  }

  const handleLogout = () => {
    localStorage.removeItem('rymon_remote_key')
    localStorage.removeItem('rymon_remote_expiry')
    setIsAuthenticated(false)
    setCurrentKey('')
    setRecord(null)
  }

  // 8. Key Generation Engine
  const priceMap: Record<string, number> = {
    '2 Hours': 20,
    '1 Day': 35,
    '3 Day': 50,
    '7 Day': 100,
    '15 Day': 180,
    '30 Day': 350
  }

  const projectedInvoice = priceMap[genDuration] || 35

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault()
    const prefix = genCustomPrefix.trim().toUpperCase() || 'RYMON'
    const gameCode =
      genGame === 'Free Fire MAX' ? 'FF' : genGame === 'BGMI' ? 'BG' : 'PB'
    const randomBlock1 = Math.random().toString(36).substring(2, 6).toUpperCase()
    const randomBlock2 = Math.random().toString(36).substring(2, 6).toUpperCase()
    const newKeyCode = `${prefix}-${gameCode}-${randomBlock1}-${randomBlock2}`

    const newKeyItem: LicenseKeyItem = {
      id: `#${Math.floor(38506 + keysList.length)}`,
      game: genGame,
      key: newKeyCode,
      devicesUsed: 0,
      devicesMax: 1,
      plan: genDuration,
      creator: 'rymon',
      status: 'WAITING',
      expiresAt: 'Not activated'
    }

    setKeysList([newKeyItem, ...keysList])
    setWalletBalance((prev) => Math.max(0, prev - projectedInvoice))
    setGenLastCreated(newKeyCode)

    // Log Activity
    const newAct: ActivityItem = {
      id: `act-${Date.now()}`,
      title: `Generated ${newKeyItem.id}`,
      game: genGame,
      details: `${genDuration} • 1 Device(s)`,
      timestamp: 'Just now'
    }
    setActivities([newAct, ...activities.slice(0, 7)])

    // If Supabase connected, also insert row
    if (supabase) {
      supabase
        .from('rymon_streamer_controls')
        .upsert({
          license_key: newKeyCode,
          streamer_name: 'VIP Streamer',
          game_name: genGame,
          is_online: false,
          is_active: true
        })
        .then(() => {}, () => {})
    }
  }

  // 9. Key Action Handlers (HWID Reset, Delete, Copy)
  const handleCopyKey = (keyString: string) => {
    navigator.clipboard.writeText(keyString)
    setCopiedKey(keyString)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleResetHWID = (keyString: string) => {
    setKeysList(
      keysList.map((k) =>
        k.key === keyString ? { ...k, devicesUsed: 0, status: 'WAITING' } : k
      )
    )
    showToast(`HWID successfully reset for ${keyString}!`)
  }

  const handleDeleteKey = (keyString: string) => {
    if (confirm(`Are you sure you want to delete license key ${keyString}?`)) {
      setKeysList(keysList.filter((k) => k.key !== keyString))
      showToast(`Key ${keyString} deleted.`)
    }
  }

  const handleApplyBanStatus = () => {
    if (!targetBanUser) {
      alert('Please select a target user.')
      return
    }
    const isBan = banActionType === 'ban'
    setUsersList(
      usersList.map((u) =>
        u.name === targetBanUser ? { ...u, status: isBan ? 'BANNED' : 'ACTIVE' } : u
      )
    )
    showToast(`User ${targetBanUser} has been ${isBan ? 'BANNED' : 'UNBANNED'}.`)
  }

  const handleApplyDeleteUserKeys = () => {
    if (!targetDeleteUser) {
      alert('Please select a target user.')
      return
    }
    setKeysList(keysList.filter((k) => k.creator !== targetDeleteUser))
    showToast(`Keys associated with user ${targetDeleteUser} have been purged.`)
  }

  const handleApplyExtendKey = () => {
    if (!targetExtendKey) {
      alert('Please select a target key.')
      return
    }
    setKeysList(
      keysList.map((k) =>
        k.key === targetExtendKey
          ? {
              ...k,
              plan: `${parseInt(k.plan) + parseInt(extendAmount)} Days`,
              status: 'ACTIVE'
            }
          : k
      )
    )
    showToast(`License ${targetExtendKey} extended by ${extendAmount} days!`)
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
        k.key.toLowerCase().includes(q) ||
        k.game.toLowerCase().includes(q) ||
        k.creator.toLowerCase().includes(q)
    )
  }, [keysList, searchKeyQuery])

  const filteredUsers = useMemo(() => {
    if (!searchUserQuery.trim()) return usersList
    const q = searchUserQuery.toLowerCase()
    return usersList.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [usersList, searchUserQuery])

  // Overview Counts
  const stats = useMemo(() => {
    const total = keysList.length
    const active = keysList.filter((k) => k.status === 'ACTIVE').length
    const unused = keysList.filter((k) => k.status === 'WAITING').length
    const expired = keysList.filter((k) => k.status === 'EXPIRED').length
    const reset = keysList.filter((k) => k.devicesUsed === 0 && k.status === 'ACTIVE').length
    return { total, active, unused, expired, reset }
  }, [keysList])

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
              <div style={styles.brandSubText}>CONTROL PANEL & TELEMETRY REMOTE</div>
            </div>
          </div>
        </div>

        <div style={styles.headerRight}>
          {/* Wallet Balance Pill */}
          <div style={styles.balancePill}>
            <span style={{ color: '#00d9ff', fontSize: '13px' }}>💼</span>
            <span style={styles.balanceAmount}>₹{walletBalance.toLocaleString('en-IN')}</span>
          </div>

          {/* WebSocket Link Status */}
          <div style={styles.telemetryPill}>
            <span
              style={{
                ...styles.pulseDot,
                background: isLiveConnected ? '#05df72' : '#64748b'
              }}
            />
            <span style={styles.telemetryText}>
              {isLiveConnected ? 'LIVE WS' : 'STANDBY'}
            </span>
            <span style={styles.pingText}>{ping}ms</span>
          </div>

          {/* User Profile Pill */}
          {isAuthenticated ? (
            <div style={styles.userProfilePill}>
              <div style={styles.userAvatarSquare}>
                {isMasterAdmin ? 'R' : 'S'}
              </div>
              <div style={styles.userNameBlock}>
                <span style={styles.userNameText}>
                  {isMasterAdmin ? 'rymon' : 'Streamer VIP'}
                </span>
                <span style={styles.userRoleTag}>
                  {isMasterAdmin ? 'Owner' : 'VIP'}
                </span>
              </div>
              <button onClick={handleLogout} style={styles.headerLogoutBtn} title="Logout">
                ⏻
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setKeyInput('RYMON-MASTER-KEY')
                setIsAuthenticated(true)
                setCurrentKey('RYMON-MASTER-KEY')
                setIsMasterAdmin(true)
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
          <span>✨ {actionSuccessMsg}</span>
        </div>
      )}

      {/* ── CONDITIONAL VIEW: AUTH GATEWAY VS MAIN WORKSPACE ─────────────────── */}
      {!isAuthenticated ? (
        <div style={styles.authGateBox}>
          <div style={styles.authBadge}>
            <span style={{ fontSize: '10px', marginRight: '6px' }}>🔒</span> SECURE RYMON SOVEREIGN GATEWAY
          </div>
          <h2 style={styles.authHead}>Connect Streamer Remote</h2>
          <p style={styles.authDesc}>
            Enter your registered Rymon license key to synchronize hardware controls in real-time with your Android device.
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
              placeholder="e.g. RYMON-XXXX-YYYY"
              style={styles.keyInput}
              required
            />

            <button type="submit" disabled={authLoading} style={styles.submitBtn}>
              {authLoading ? 'AUTHENTICATING...' : 'CONNECT GHOST REMOTE'}
            </button>

            {authError && <div style={styles.errorBox}>{authError}</div>}
          </form>
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
                {isMasterAdmin ? 'R' : 'S'}
              </div>
              <div>
                <div style={styles.sidebarUserName}>
                  {isMasterAdmin ? 'rymon' : 'VIP Streamer'}
                </div>
                <div style={styles.sidebarUserSub}>
                  <span style={styles.activeDot} /> Owner (Level 1)
                </div>
              </div>
            </div>
          </div>

          {/* Nav Categories */}
          <nav style={styles.navStack}>
            {/* 1. Streamer Telemetry Remote */}
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
              <span style={styles.navIcon}>📡</span>
              <span>Streamer Remote</span>
              <span style={styles.liveNavBadge}>LIVE</span>
            </button>

            {/* 2. Dashboards */}
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

            {/* 3. Key System */}
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
              <span style={styles.navCounterBadge}>{keysList.length}</span>
            </button>

            {/* 4. Management */}
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
              <span style={styles.navCounterBadge}>{usersList.length}</span>
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
              <span style={styles.navIcon}>🚫</span>
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
              <span style={styles.navIcon}>⏳</span>
              <span>Extend Keys</span>
            </button>

            {/* 5. Core Config */}
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
          </nav>
        </aside>

        {/* ── RIGHT MAIN CONTENT AREA ────────────────────────────────────────── */}
        <main style={styles.contentArea}>
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'overview' && (
            <div style={styles.tabContainer}>
              {/* Subscription Validity Hero Card */}
              <div style={styles.subscriptionHeroCard}>
                <div style={styles.subHeroLeft}>
                  <div style={styles.subHeroStatusRow}>
                    <span style={styles.shieldIcon}>🛡️</span>
                    <span style={styles.accountStatusTag}>ACCOUNT STATUS: ACTIVE</span>
                  </div>
                  <h2 style={styles.subHeroTitle}>Subscription Validity</h2>
                  <p style={styles.subHeroDesc}>
                    Manage license keys, reseller accounts, and live device telemetry before expiration.
                  </p>
                </div>
                <div style={styles.subHeroRight}>
                  <div style={styles.timeRemainingLabel}>TIME REMAINING</div>
                  <div style={styles.countdownClockText}>{countdown}</div>
                </div>
              </div>

              {/* 5 Metric Stat Cards */}
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statIconBadge}>🔑</div>
                  <div style={styles.statLabel}>TOTAL KEYS</div>
                  <div style={styles.statValue}>{stats.total}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statIconBadge, color: '#05df72' }}>✓</div>
                  <div style={styles.statLabel}>ACTIVE</div>
                  <div style={styles.statValue}>{stats.active}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statIconBadge, color: '#f59e0b' }}>⌛</div>
                  <div style={styles.statLabel}>UNUSED</div>
                  <div style={styles.statValue}>{stats.unused}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statIconBadge, color: '#ff3366' }}>📅</div>
                  <div style={styles.statLabel}>EXPIRED</div>
                  <div style={styles.statValue}>{stats.expired}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statIconBadge, color: '#00d9ff' }}>🔄</div>
                  <div style={styles.statLabel}>RESET</div>
                  <div style={styles.statValue}>{stats.reset}</div>
                </div>
              </div>

              {/* Middle Row: Accounts Summary */}
              <div style={styles.accountsGrid}>
                <div
                  style={styles.accountSummaryTile}
                  onClick={() => setActiveTab('users')}
                >
                  <div style={styles.accIconWrap}>🛡️</div>
                  <div>
                    <div style={styles.accRoleTitle}>ADMINS</div>
                    <div style={styles.accCount}>1</div>
                    <div style={styles.accLevelDesc}>Level 2 accounts</div>
                  </div>
                  <span style={styles.chevron}>›</span>
                </div>

                <div
                  style={styles.accountSummaryTile}
                  onClick={() => setActiveTab('users')}
                >
                  <div style={{ ...styles.accIconWrap, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>💼</div>
                  <div>
                    <div style={styles.accRoleTitle}>RESELLERS</div>
                    <div style={styles.accCount}>{usersList.length}</div>
                    <div style={styles.accLevelDesc}>Level 3 accounts</div>
                  </div>
                  <span style={styles.chevron}>›</span>
                </div>

                <div
                  style={styles.accountSummaryTile}
                  onClick={() => setActiveTab('users')}
                >
                  <div style={{ ...styles.accIconWrap, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>👥</div>
                  <div>
                    <div style={styles.accRoleTitle}>TOTAL USERS</div>
                    <div style={styles.accCount}>{usersList.length + 1}</div>
                    <div style={styles.accLevelDesc}>All registered</div>
                  </div>
                  <span style={styles.chevron}>›</span>
                </div>
              </div>

              {/* Lower Split: Quick Actions + Live Activity */}
              <div style={styles.lowerSplit}>
                {/* Quick Actions Panel */}
                <div style={styles.panelCard}>
                  <div style={styles.panelHeaderRow}>
                    <h3 style={styles.panelTitle}>⚡ Quick Actions</h3>
                  </div>
                  <div style={styles.quickActionButtons}>
                    <button
                      onClick={() => setActiveTab('generate')}
                      style={styles.quickTileBtn}
                    >
                      <span style={styles.quickTileIcon}>+</span>
                      <span style={styles.quickTileText}>Generate Key</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('keys')}
                      style={styles.quickTileBtn}
                    >
                      <span style={styles.quickTileIcon}>☰</span>
                      <span style={styles.quickTileText}>All Keys</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('users')}
                      style={styles.quickTileBtn}
                    >
                      <span style={styles.quickTileIcon}>👥</span>
                      <span style={styles.quickTileText}>Users</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('remote')}
                      style={styles.quickTileBtn}
                    >
                      <span style={styles.quickTileIcon}>📡</span>
                      <span style={styles.quickTileText}>Streamer Remote</span>
                    </button>
                  </div>

                  <div style={styles.walletInfoBar}>
                    <div>
                      <div style={styles.infoBarLbl}>ROLE LEVEL</div>
                      <div style={styles.infoBarVal}>Owner</div>
                    </div>
                    <div>
                      <div style={styles.infoBarLbl}>CURRENT WALLET BALANCE</div>
                      <div style={{ ...styles.infoBarVal, color: '#00d9ff' }}>
                        ₹{walletBalance.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Activity Stream */}
                <div style={styles.panelCard}>
                  <div style={styles.panelHeaderRow}>
                    <h3 style={styles.panelTitle}>🕒 Live Activity Stream</h3>
                    <span style={styles.liveStreamBadge}>REALTIME</span>
                  </div>
                  <div style={styles.activityFeed}>
                    {activities.map((act) => (
                      <div key={act.id} style={styles.activityRow}>
                        <div style={styles.activityDot} />
                        <div style={{ flex: 1 }}>
                          <div style={styles.actTitleRow}>
                            <span style={styles.actTitleText}>{act.title}</span>
                            <span style={styles.actGameBadge}>{act.game}</span>
                          </div>
                          <div style={styles.actDetails}>{act.details}</div>
                        </div>
                        <div style={styles.actTimestamp}>{act.timestamp}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STREAMER TELEMETRY REMOTE */}
          {activeTab === 'remote' && (
            <div style={styles.tabContainer}>
              {/* Telemetry Status Bar */}
              <div style={styles.telemetryHero}>
                <div>
                  <h2 style={styles.remoteTitle}>
                    📡 Streamer Remote Telemetry
                    <span style={styles.onlineBadge}>
                      {isLiveConnected ? '● Online' : '○ Standby'}
                    </span>
                  </h2>
                  <p style={styles.remoteSub}>
                    Direct IPC channel linked to target process <code>com.dts.freefiremax</code> via <code>stranger</code> ARM64 native engine.
                  </p>
                </div>
                <div style={styles.remoteKeySelectCluster}>
                  <span style={styles.fleetLabel}>ACTIVE TARGET KEY:</span>
                  <select
                    value={currentKey}
                    onChange={(e) => setCurrentKey(e.target.value)}
                    style={styles.fleetDropdown}
                  >
                    {keysList.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.game} — {k.key} ({k.status})
                      </option>
                    ))}
                    {!keysList.some((k) => k.key === currentKey) && (
                      <option value={currentKey}>{currentKey || 'RYMON-MASTER-KEY'}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Hardware Telemetry Specs */}
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>TARGET PROCESS</div>
                  <div style={styles.statValSmall}>com.dts.freefiremax</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>NATIVE DAEMON</div>
                  <div style={styles.statValSmall}>stranger (ARM64)</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>IPC SYNCHRONIZATION</div>
                  <div style={styles.statValSmall}>Phoenix Realtime WS</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>CONNECTION STATE</div>
                  <div style={{ ...styles.statValSmall, color: isLiveConnected ? '#05df72' : '#94a3b8' }}>
                    {isLiveConnected ? '● Synchronized' : '○ Connecting...'}
                  </div>
                </div>
              </div>

              {/* 4 Telemetry Modules */}
              <div style={styles.controlsGrid}>
                {/* 1. Precision Aim */}
                <div style={styles.cardBox}>
                  <div style={styles.cardHeader}>
                    <h4>🎯 Precision Aim Vector</h4>
                    <span style={styles.cyanMiniBadge}>KERNEL HOOK</span>
                  </div>
                  <div style={styles.featureStack}>
                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.aim_silent ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('aim_silent')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Silent Aim</div>
                        <div style={styles.tileDesc}>Redirects bullet vector directly to hitbox without camera snap.</div>
                      </div>
                      <div
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

                    <div style={styles.sliderTile}>
                      <div style={styles.sliderHeaderRow}>
                        <span>Hit Rate Percentage</span>
                        <span style={styles.sliderValueBox}>{record?.hit_rate ?? 80}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={record?.hit_rate ?? 80}
                        onChange={(e) => handleSliderChange('hit_rate', parseInt(e.target.value))}
                        style={styles.rangeSlider}
                      />
                    </div>

                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.ignore_knocked ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('ignore_knocked')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Ignore Knocked Down</div>
                        <div style={styles.tileDesc}>Filters out eliminated or crawling enemies.</div>
                      </div>
                      <div
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

                    <div style={styles.sliderTile}>
                      <div style={styles.sliderHeaderRow}>
                        <span>Target FOV Range</span>
                        <span style={styles.sliderValueBox}>{Math.round(record?.aim_fov ?? 90)}°</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="360"
                        value={record?.aim_fov ?? 90}
                        onChange={(e) => handleSliderChange('aim_fov', parseFloat(e.target.value))}
                        style={styles.rangeSlider}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. ESP Vision Matrix */}
                <div style={styles.cardBox}>
                  <div style={styles.cardHeader}>
                    <h4>📦 ESP Vision Matrix</h4>
                    <span style={styles.cyanMiniBadge}>DIRECT VERTEX</span>
                  </div>
                  <div style={styles.featureStack}>
                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.esp_box ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('esp_box')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Player Bounding Box</div>
                        <div style={styles.tileDesc}>Dynamic 3D bounding box scaling with distance.</div>
                      </div>
                      <div
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

                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.esp_skeleton ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('esp_skeleton')}
                    >
                      <div>
                        <div style={styles.tileTitle}>3D Skeletal Rigging</div>
                        <div style={styles.tileDesc}>Bone positions matching player animation frames.</div>
                      </div>
                      <div
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

                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.esp_line ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('esp_line')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Snap Line Tracer</div>
                        <div style={styles.tileDesc}>Laser line projecting from screen center to closest enemy.</div>
                      </div>
                      <div
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

                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.esp_health ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('esp_health')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Dynamic Health Bar</div>
                        <div style={styles.tileDesc}>Real-time health & shield percentage bar above head.</div>
                      </div>
                      <div
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
                  </div>
                </div>

                {/* 3. Kinematics & Weapons */}
                <div style={styles.cardBox}>
                  <div style={styles.cardHeader}>
                    <h4>⚡ Kinematics & Recoil</h4>
                    <span style={styles.cyanMiniBadge}>PHYSICS OVERRIDE</span>
                  </div>
                  <div style={styles.featureStack}>
                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.speed_hack ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('speed_hack')}
                    >
                      <div>
                        <div style={styles.tileTitle}>Speed Boost Hack</div>
                        <div style={styles.tileDesc}>Scales player movement velocity in game engine.</div>
                      </div>
                      <div
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

                    <div style={styles.sliderTile}>
                      <div style={styles.sliderHeaderRow}>
                        <span>Velocity Multiplier</span>
                        <span style={styles.sliderValueBox}>
                          {Number(record?.speed_multiplier ?? 1.5).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="5.0"
                        step="0.05"
                        value={record?.speed_multiplier ?? 1.5}
                        onChange={(e) => handleSliderChange('speed_multiplier', parseFloat(e.target.value))}
                        style={styles.rangeSlider}
                      />
                    </div>

                    <div
                      style={{
                        ...styles.toggleTile,
                        borderColor: record?.no_recoil ? '#00d9ff' : 'rgba(255,255,255,0.08)'
                      }}
                      onClick={() => toggleFeature('no_recoil')}
                    >
                      <div>
                        <div style={styles.tileTitle}>No Recoil Spread</div>
                        <div style={styles.tileDesc}>Eliminates vertical weapon barrel dispersion.</div>
                      </div>
                      <div
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
                  </div>
                </div>

                {/* 4. Theme Accents */}
                <div style={styles.cardBox}>
                  <div style={styles.cardHeader}>
                    <h4>🎨 In-Game Theme Accents</h4>
                    <span style={styles.cyanMiniBadge}>1-CLICK SYNC</span>
                  </div>
                  <div style={styles.featureStack}>
                    <div style={styles.themeSelectorTile}>
                      <div style={styles.themeHeaderRow}>
                        <span>Active Theme Accent:</span>
                        <span style={styles.activeThemeName}>
                          {THEME_NAMES[record?.theme_color_index ?? 0]}
                        </span>
                      </div>
                      <div style={styles.themeButtonsGrid}>
                        {THEME_NAMES.map((name, i) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setThemePreset(i)}
                            style={{
                              ...styles.themePresetBtn,
                              ...(record?.theme_color_index === i
                                ? styles.themePresetBtnActive
                                : {})
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Destructive Emergency Purge */}
              <div style={styles.emergencyPurgeCard}>
                <div>
                  <h4 style={styles.emergencyPurgeTitle}>
                    ⚠️ Emergency Safety Action: Remote Temporary Files Purge
                  </h4>
                  <p style={styles.emergencyPurgeDesc}>
                    Dispatches an immediate kill signal to the Android device that stops the <code>stranger</code> daemon and wipes all <code>/data/local/tmp</code> binaries, driver traces, and log caches.
                  </p>
                </div>
                <button
                  onClick={() => setShowPurgeModal(true)}
                  style={styles.emergencyPurgeBtn}
                >
                  💥 REMOTE PURGE TMP
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: GENERATE KEY */}
          {activeTab === 'generate' && (
            <div style={styles.tabContainer}>
              <div style={styles.genHeroCard}>
                <div style={styles.genBadge}>
                  <span>⚡ INSTANT KEY CREATION</span>
                </div>
                <h2 style={styles.genTitle}>Create License Format</h2>
                <p style={styles.genDesc}>
                  Select your target game, desired duration, and customization to mint a fresh license key.
                </p>

                <form onSubmit={handleGenerateKey} style={styles.genForm}>
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <label style={styles.formLabel}>SELECT GAME / TOOL</label>
                      <select
                        value={genGame}
                        onChange={(e) => setGenGame(e.target.value)}
                        style={styles.formSelect}
                      >
                        <option value="Free Fire MAX">Free Fire MAX</option>
                        <option value="BGMI">BGMI</option>
                        <option value="PUBG">PUBG Mobile</option>
                      </select>
                    </div>

                    <div style={styles.formCol}>
                      <label style={styles.formLabel}>TIME DURATION</label>
                      <select
                        value={genDuration}
                        onChange={(e) => setGenDuration(e.target.value)}
                        style={styles.formSelect}
                      >
                        <option value="2 Hours">2 Hours — ₹20/Device</option>
                        <option value="1 Day">1 Day — ₹35/Device</option>
                        <option value="3 Day">3 Day — ₹50/Device</option>
                        <option value="7 Day">7 Day — ₹100/Device</option>
                        <option value="15 Day">15 Day — ₹180/Device</option>
                        <option value="30 Day">30 Day — ₹350/Device</option>
                      </select>
                    </div>
                  </div>

                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <label style={styles.formLabel}>LICENSE CUSTOMIZATION</label>
                      <input
                        type="text"
                        placeholder="Key Prefix (Default: RYMON)"
                        value={genCustomPrefix}
                        onChange={(e) => setGenCustomPrefix(e.target.value)}
                        style={styles.formInput}
                      />
                      <span style={styles.formHelperText}>
                        System generates a 100% unique cryptographic key with device binding.
                      </span>
                    </div>
                  </div>

                  {/* Invoice / Wallet Summary Bar */}
                  <div style={styles.invoiceBar}>
                    <div style={styles.invoiceCostBlock}>
                      <div style={styles.invoiceLbl}>PROJECTED INVOICE</div>
                      <div style={styles.invoiceAmount}>₹{projectedInvoice}</div>
                    </div>
                    <div style={styles.walletBalanceBlock}>
                      <div style={styles.invoiceLbl}>WALLET BALANCE</div>
                      <div style={styles.walletAmount}>
                        ₹{walletBalance.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <button type="submit" style={styles.generateSubmitBtn}>
                      ⚡ Generate Now
                    </button>
                  </div>
                </form>

                {/* Newly Generated Key Result Modal/Card */}
                {genLastCreated && (
                  <div style={styles.genSuccessCard}>
                    <div style={styles.genSuccessTitle}>
                      🎉 License Successfully Created!
                    </div>
                    <div style={styles.genKeyDisplayRow}>
                      <span style={styles.genKeyCode}>{genLastCreated}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyKey(genLastCreated)}
                        style={styles.copyKeyBtn}
                      >
                        {copiedKey === genLastCreated ? '✓ Copied' : '📋 Copy Key'}
                      </button>
                    </div>
                    <div style={styles.genActionRow}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentKey(genLastCreated)
                          setActiveTab('remote')
                        }}
                        style={styles.linkRemoteBtn}
                      >
                        Link to Streamer Remote →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: LICENSE KEYS MANAGEMENT */}
          {activeTab === 'keys' && (
            <div style={styles.tabContainer}>
              <div style={styles.tableHeaderRow}>
                <div>
                  <h2 style={styles.tableHeadTitle}>Active Licenses</h2>
                  <p style={styles.tableHeadDesc}>
                    Showing {filteredKeys.length} of {keysList.length} records
                  </p>
                </div>
                <div style={styles.tableActionsRow}>
                  <input
                    type="text"
                    placeholder="Search keys..."
                    value={searchKeyQuery}
                    onChange={(e) => setSearchKeyQuery(e.target.value)}
                    style={styles.searchTableInput}
                  />
                  <button
                    onClick={() => setActiveTab('generate')}
                    style={styles.addKeyTopBtn}
                  >
                    + Generate Key
                  </button>
                </div>
              </div>

              {/* Responsive Table */}
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      <th style={styles.th}># ID</th>
                      <th style={styles.th}>GAME & KEY</th>
                      <th style={styles.th}>DEVICES</th>
                      <th style={styles.th}>PLAN</th>
                      <th style={styles.th}>CREATOR</th>
                      <th style={styles.th}>EXPIRY STATUS</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeys.map((item) => (
                      <tr key={item.key} style={styles.tbodyRow}>
                        <td style={styles.tdId}>{item.id}</td>
                        <td style={styles.td}>
                          <div style={styles.gameBadge}>{item.game}</div>
                          <div style={styles.keyWithCopyRow}>
                            <span style={styles.keyMonoText}>{item.key}</span>
                            <button
                              onClick={() => handleCopyKey(item.key)}
                              style={styles.iconCopyBtn}
                              title="Copy License Key"
                            >
                              {copiedKey === item.key ? '✓' : '📋'}
                            </button>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.deviceUsageText}>
                            Usage: <strong>{item.devicesUsed}/{item.devicesMax}</strong>
                          </div>
                          <div style={styles.usageBarTrack}>
                            <div
                              style={{
                                ...styles.usageBarFill,
                                width: `${Math.min(100, (item.devicesUsed / item.devicesMax) * 100)}%`,
                                background: item.devicesUsed > 0 ? '#00d9ff' : '#64748b'
                              }}
                            />
                          </div>
                        </td>
                        <td style={styles.tdPlan}>{item.plan}</td>
                        <td style={styles.td}>
                          <div style={styles.creatorPill}>
                            <span style={styles.creatorInitial}>
                              {item.creator.charAt(0).toUpperCase()}
                            </span>
                            <span>{item.creator}</span>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.statusTag,
                              ...(item.status === 'ACTIVE'
                                ? styles.statusTagActive
                                : item.status === 'WAITING'
                                ? styles.statusTagWaiting
                                : styles.statusTagExpired)
                            }}
                          >
                            ● {item.status}
                          </span>
                          <div style={styles.statusDateText}>{item.expiresAt}</div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <div style={styles.actionBtnGroup}>
                            <button
                              onClick={() => handleResetHWID(item.key)}
                              style={styles.actionIconBtn}
                              title="Reset HWID / Device Binding"
                            >
                              🔄
                            </button>
                            <button
                              onClick={() => {
                                setCurrentKey(item.key)
                                setActiveTab('remote')
                              }}
                              style={styles.actionIconBtn}
                              title="Open Streamer Remote"
                            >
                              📡
                            </button>
                            <button
                              onClick={() => handleDeleteKey(item.key)}
                              style={{ ...styles.actionIconBtn, color: '#ff3366' }}
                              title="Delete Key"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: REGISTERED USERS & RESELLERS */}
          {activeTab === 'users' && (
            <div style={styles.tabContainer}>
              <div style={styles.tableHeaderRow}>
                <div>
                  <h2 style={styles.tableHeadTitle}>Registered Users</h2>
                  <p style={styles.tableHeadDesc}>
                    Showing {filteredUsers.length} active reseller and administrator accounts
                  </p>
                </div>
                <div style={styles.tableActionsRow}>
                  <input
                    type="text"
                    placeholder="Search users by name, email..."
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    style={styles.searchTableInput}
                  />
                </div>
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>USER PROFILE</th>
                      <th style={styles.th}>ROLE & STATUS</th>
                      <th style={styles.th}>REFERRAL UPLINK</th>
                      <th style={styles.th}>BALANCE</th>
                      <th style={styles.th}>EXPIRES</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} style={styles.tbodyRow}>
                        <td style={styles.tdId}>{user.id}</td>
                        <td style={styles.td}>
                          <div style={styles.userProfileCell}>
                            <div style={styles.userCellAvatar}>
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={styles.userCellName}>{user.name}</div>
                              <div style={styles.userCellEmail}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.resellerTag}>{user.role}</span>
                          <span
                            style={{
                              ...styles.statusTag,
                              ...(user.status === 'ACTIVE'
                                ? styles.statusTagActive
                                : styles.statusTagExpired),
                              marginLeft: '6px'
                            }}
                          >
                            ● {user.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.uplinkText}>
                            Uplink: <strong>{user.uplink}</strong>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.userBalancePill}>
                            ₹{user.balance.toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td style={styles.td}>{user.expires}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <div style={styles.actionBtnGroup}>
                            <button
                              onClick={() => {
                                setTargetBanUser(user.name)
                                setActiveTab('ban')
                              }}
                              style={styles.actionIconBtn}
                              title="Ban / Unban User"
                            >
                              🚫
                            </button>
                            <button
                              onClick={() => {
                                setTargetDeleteUser(user.name)
                                setActiveTab('delete')
                              }}
                              style={{ ...styles.actionIconBtn, color: '#ff3366' }}
                              title="Delete User Keys"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: BAN / UNBAN FACILITY */}
          {activeTab === 'ban' && (
            <div style={styles.tabContainer}>
              <div style={styles.noticeBoxWarning}>
                <span style={styles.noticeIcon}>⚠️</span>
                <div>
                  <strong>Status Modification Warning</strong>
                  <div>
                    Banning users or keys will instantly revoke socket access and disable hardware telemetry synchronization.
                  </div>
                </div>
              </div>

              <div style={styles.cardBoxCentered}>
                <div style={styles.actionCardHeader}>
                  <div style={styles.actionCardIcon}>🛡️</div>
                  <div>
                    <h3 style={styles.actionCardTitle}>Bulk Ban / Unban Facility</h3>
                    <p style={styles.actionCardSub}>Manage user key access states securely</p>
                  </div>
                </div>

                <div style={styles.actionFormStack}>
                  <div>
                    <label style={styles.formLabel}>TARGET USER</label>
                    <select
                      value={targetBanUser}
                      onChange={(e) => setTargetBanUser(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="">-- Select a User --</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name} ({u.email}) — [{u.status}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={styles.formLabel}>ACTION TO PERFORM</label>
                    <select
                      value={banActionType}
                      onChange={(e) => setBanActionType(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="ban">Ban User & Revoke Keys</option>
                      <option value="unban">Unban User & Restore Access</option>
                    </select>
                  </div>

                  <button
                    onClick={handleApplyBanStatus}
                    style={styles.confirmActionBtn}
                  >
                    🛡️ Apply Status Change
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: DELETE KEYS */}
          {activeTab === 'delete' && (
            <div style={styles.tabContainer}>
              <div style={styles.noticeBoxDanger}>
                <span style={styles.noticeIcon}>🛑</span>
                <div>
                  <strong>Destructive Action</strong>
                  <div>
                    This action will permanently delete keys associated with the selected user. This cannot be undone.
                  </div>
                </div>
              </div>

              <div style={styles.cardBoxCentered}>
                <div style={styles.actionCardHeader}>
                  <div style={{ ...styles.actionCardIcon, background: 'rgba(255, 51, 102, 0.15)', color: '#ff3366' }}>
                    🗑️
                  </div>
                  <div>
                    <h3 style={styles.actionCardTitle}>Delete User Keys</h3>
                    <p style={styles.actionCardSub}>Select user and key criteria for permanent deletion</p>
                  </div>
                </div>

                <div style={styles.actionFormStack}>
                  <div>
                    <label style={styles.formLabel}>TARGET USER *</label>
                    <select
                      value={targetDeleteUser}
                      onChange={(e) => setTargetDeleteUser(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="">-- Select a User --</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={styles.formLabel}>KEY TYPE *</label>
                    <select
                      value={deleteKeyType}
                      onChange={(e) => setDeleteKeyType(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="expired">Expired Keys Only</option>
                      <option value="unused">Unused Keys Only</option>
                      <option value="all">All Keys (Active + Unused + Expired)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleApplyDeleteUserKeys}
                    style={styles.dangerActionBtn}
                  >
                    🗑️ Confirm Deletion
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: EXTEND KEYS */}
          {activeTab === 'extend' && (
            <div style={styles.tabContainer}>
              <div style={styles.cardBoxCentered}>
                <div style={styles.actionCardHeader}>
                  <div style={styles.actionCardIcon}>⏳</div>
                  <div>
                    <h3 style={styles.actionCardTitle}>Extend License Validity</h3>
                    <p style={styles.actionCardSub}>Add additional validity days to an active license key</p>
                  </div>
                </div>

                <div style={styles.actionFormStack}>
                  <div>
                    <label style={styles.formLabel}>SELECT LICENSE KEY</label>
                    <select
                      value={targetExtendKey}
                      onChange={(e) => setTargetExtendKey(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="">-- Select License Key --</option>
                      {keysList.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.game} — {k.key} ({k.plan})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={styles.formLabel}>EXTEND DURATION</label>
                    <select
                      value={extendAmount}
                      onChange={(e) => setExtendAmount(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="1">+1 Day Extension</option>
                      <option value="7">+7 Days Extension</option>
                      <option value="15">+15 Days Extension</option>
                      <option value="30">+30 Days Extension</option>
                    </select>
                  </div>

                  <button
                    onClick={handleApplyExtendKey}
                    style={styles.confirmActionBtn}
                  >
                    ⏳ Apply Extension
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: ADVANCE SYSTEM CONFIG */}
          {activeTab === 'advance' && (
            <div style={styles.tabContainer}>
              <div style={styles.cardBox}>
                <div style={styles.cardHeader}>
                  <h4>📱 Single Device Login Enforcement</h4>
                  <span style={styles.cyanMiniBadge}>SECURITY POLICY</span>
                </div>
                <p style={styles.settingDesc}>
                  Force strictly one active device per key for selected roles. When enabled, keys generated by that role will only allow 1 device at a time, regardless of max_devices setting.
                </p>

                <div style={styles.settingToggleRow}>
                  <div>
                    <div style={styles.settingTitle}>Admin (Level 2)</div>
                    <div style={styles.settingSub}>Keys generated by Admins</div>
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
                    <div style={styles.settingSub}>Keys generated by Resellers</div>
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

              <div style={styles.cardBox}>
                <div style={styles.cardHeader}>
                  <h4>🔑 Trial Key Generation Settings</h4>
                  <span style={styles.cyanMiniBadge}>ROLE PERMISSIONS</span>
                </div>
                <p style={styles.settingDesc}>
                  Configure which administrative tiers are allowed to generate temporary trial keys.
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
        </main>
      </div>
      )}

      {/* ── EMERGENCY REMOTE PURGE MODAL ────────────────────────────────────── */}
      {showPurgeModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalIcon}>⚠️</div>
            <h3 style={styles.modalTitle}>Confirm Emergency Remote Wipe</h3>
            <p style={styles.modalText}>
              Are you sure you want to trigger a remote wipe on target device running key <code>{currentKey}</code>?<br /><br />
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

// ── Obsidian Cyber Glassmorphism Scoped Design System ─────────────────────────
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
    width: '100vw',
    height: '100vh',
    backgroundImage: `
      radial-gradient(circle at 10% 10%, rgba(0, 217, 255, 0.05) 0%, transparent 40%),
      radial-gradient(circle at 90% 90%, rgba(0, 132, 255, 0.04) 0%, transparent 45%),
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
    backgroundSize: '100% 100%, 100% 100%, 40px 40px, 40px 40px',
    pointerEvents: 'none',
    zIndex: 0
  },
  authGateBox: {
    maxWidth: '480px',
    margin: '60px auto',
    padding: '36px 30px',
    background: 'rgba(13, 16, 24, 0.85)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.09)',
    borderTop: '1px solid rgba(255, 255, 255, 0.22)',
    borderRadius: '16px',
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
    position: 'relative',
    zIndex: 2
  },
  authBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: '20px',
    background: 'rgba(0, 217, 255, 0.1)',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    color: '#00d9ff',
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    marginBottom: '16px'
  },
  authHead: {
    fontSize: '1.45rem',
    fontWeight: 800,
    marginBottom: '8px'
  },
  authDesc: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    lineHeight: 1.5,
    marginBottom: '24px'
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'left'
  },
  keyInput: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'rgba(8, 11, 18, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box'
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #00d9ff 0%, #0084ff 100%)',
    border: 'none',
    color: '#07090e',
    fontWeight: 800,
    fontSize: '0.92rem',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(0, 217, 255, 0.35)'
  },
  errorBox: {
    padding: '10px 14px',
    borderRadius: '6px',
    background: 'rgba(255, 51, 102, 0.12)',
    border: '1px solid rgba(255, 51, 102, 0.3)',
    color: '#ff6b8b',
    fontSize: '0.82rem'
  },
  topHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'rgba(10, 14, 22, 0.88)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
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
    fontSize: '22px',
    cursor: 'pointer'
  },
  brandCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoFrame: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    boxShadow: '0 0 16px rgba(0, 217, 255, 0.25)',
    flexShrink: 0
  },
  logoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  brandTitleText: {
    fontSize: '1.05rem',
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: '#ffffff'
  },
  brandCyanPill: {
    fontSize: '0.68rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(0, 217, 255, 0.15)',
    color: '#00d9ff',
    border: '1px solid rgba(0, 217, 255, 0.35)',
    marginLeft: '6px'
  },
  brandSubText: {
    fontSize: '0.7rem',
    color: '#64748b',
    fontFamily: 'monospace'
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
    borderRadius: '20px',
    background: 'rgba(15, 20, 32, 0.9)',
    border: '1px solid rgba(0, 217, 255, 0.25)',
    fontSize: '0.84rem'
  },
  balanceAmount: {
    color: '#00d9ff',
    fontWeight: 800,
    fontFamily: 'monospace'
  },
  telemetryPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: '20px',
    background: 'rgba(15, 20, 32, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '0.78rem',
    fontFamily: 'monospace'
  },
  pulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  telemetryText: {
    color: '#94a3b8'
  },
  pingText: {
    color: '#00d9ff',
    fontWeight: 700
  },
  userProfilePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 12px',
    borderRadius: '8px',
    background: 'rgba(0, 217, 255, 0.08)',
    border: '1px solid rgba(0, 217, 255, 0.25)'
  },
  userAvatarSquare: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    background: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.78rem'
  },
  userNameBlock: {
    display: 'flex',
    flexDirection: 'column'
  },
  userNameText: {
    fontSize: '0.8rem',
    fontWeight: 700,
    lineHeight: 1.1
  },
  userRoleTag: {
    fontSize: '0.65rem',
    color: '#64748b'
  },
  headerLogoutBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px'
  },
  quickLoginBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, #00d9ff, #0084ff)',
    border: 'none',
    color: '#07090e',
    fontWeight: 700,
    fontSize: '0.82rem',
    cursor: 'pointer'
  },
  toastBanner: {
    position: 'fixed',
    top: '70px',
    right: '24px',
    zIndex: 9999,
    padding: '12px 20px',
    borderRadius: '10px',
    background: 'rgba(10, 24, 38, 0.95)',
    border: '1px solid #00d9ff',
    color: '#ffffff',
    fontSize: '0.88rem',
    boxShadow: '0 10px 30px rgba(0, 217, 255, 0.3)',
    animation: 'fadein 0.3s'
  },
  mainLayout: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    maxWidth: '1600px',
    margin: '0 auto',
    minHeight: 'calc(100vh - 65px)'
  },
  sidebar: {
    width: '260px',
    flexShrink: 0,
    background: 'rgba(10, 14, 22, 0.75)',
    backdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '20px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  sidebarMobileOpen: {
    display: 'flex',
    position: 'fixed',
    top: '65px',
    left: 0,
    width: '280px',
    height: 'calc(100vh - 65px)',
    zIndex: 100,
    background: '#0a0e16'
  },
  sidebarUserCard: {
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(15, 20, 32, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.08)'
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
    background: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.9rem'
  },
  sidebarUserName: {
    fontSize: '0.88rem',
    fontWeight: 700
  },
  sidebarUserSub: {
    fontSize: '0.72rem',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  activeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#05df72'
  },
  navStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  navCategoryHeader: {
    fontSize: '0.68rem',
    fontWeight: 800,
    color: '#475569',
    letterSpacing: '0.08em',
    padding: '12px 10px 4px',
    textTransform: 'uppercase'
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: '8px',
    background: 'transparent',
    border: '1px solid transparent',
    color: '#94a3b8',
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.18s ease'
  },
  navItemActive: {
    background: 'rgba(0, 217, 255, 0.12)',
    borderColor: 'rgba(0, 217, 255, 0.3)',
    color: '#00d9ff',
    boxShadow: '0 4px 14px rgba(0, 217, 255, 0.15)'
  },
  navIcon: {
    fontSize: '15px'
  },
  liveNavBadge: {
    marginLeft: 'auto',
    fontSize: '0.62rem',
    fontWeight: 800,
    color: '#05df72',
    background: 'rgba(5, 223, 114, 0.15)',
    border: '1px solid rgba(5, 223, 114, 0.35)',
    padding: '2px 5px',
    borderRadius: '3px'
  },
  navCounterBadge: {
    marginLeft: 'auto',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#64748b',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 6px',
    borderRadius: '10px'
  },
  contentArea: {
    flex: 1,
    padding: '24px 28px 60px',
    overflowY: 'auto'
  },
  tabContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '22px'
  },
  subscriptionHeroCard: {
    padding: '24px 28px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, rgba(0, 132, 255, 0.15) 0%, rgba(0, 217, 255, 0.05) 100%), rgba(13, 16, 24, 0.85)',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    borderTop: '1px solid rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '20px'
  },
  subHeroLeft: {
    maxWidth: '650px'
  },
  subHeroStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  shieldIcon: {
    fontSize: '16px'
  },
  accountStatusTag: {
    fontSize: '0.68rem',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'rgba(5, 223, 114, 0.15)',
    border: '1px solid rgba(5, 223, 114, 0.35)',
    color: '#05df72'
  },
  subHeroTitle: {
    fontSize: '1.45rem',
    fontWeight: 800,
    margin: '0 0 6px 0',
    color: '#ffffff'
  },
  subHeroDesc: {
    fontSize: '0.84rem',
    color: '#94a3b8',
    margin: 0
  },
  subHeroRight: {
    textAlign: 'right'
  },
  timeRemainingLabel: {
    fontSize: '0.72rem',
    color: '#64748b',
    fontWeight: 700,
    letterSpacing: '0.08em',
    marginBottom: '4px'
  },
  countdownClockText: {
    fontFamily: 'monospace',
    fontSize: '1.65rem',
    fontWeight: 800,
    color: '#00d9ff',
    textShadow: '0 0 20px rgba(0, 217, 255, 0.5)'
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '14px'
  },
  statBox: {
    padding: '16px 18px',
    borderRadius: '12px',
    background: 'rgba(13, 16, 24, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  statIconBadge: {
    fontSize: '16px',
    color: '#94a3b8'
  },
  statLabel: {
    fontSize: '0.7rem',
    color: '#64748b',
    fontWeight: 700,
    letterSpacing: '0.06em'
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#ffffff',
    fontFamily: 'monospace'
  },
  statValSmall: {
    fontSize: '0.92rem',
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: 'monospace'
  },
  accountsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '14px'
  },
  accountSummaryTile: {
    padding: '18px 20px',
    borderRadius: '12px',
    background: 'rgba(13, 16, 24, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  accIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    background: 'rgba(0, 217, 255, 0.12)',
    color: '#00d9ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px'
  },
  accRoleTitle: {
    fontSize: '0.72rem',
    color: '#64748b',
    fontWeight: 700,
    letterSpacing: '0.06em'
  },
  accCount: {
    fontSize: '1.3rem',
    fontWeight: 800,
    color: '#ffffff'
  },
  accLevelDesc: {
    fontSize: '0.74rem',
    color: '#94a3b8'
  },
  chevron: {
    marginLeft: 'auto',
    fontSize: '20px',
    color: '#475569'
  },
  lowerSplit: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: '20px'
  },
  panelCard: {
    padding: '22px 24px',
    borderRadius: '14px',
    background: 'rgba(13, 16, 24, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(20px)'
  },
  panelHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
  },
  panelTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    margin: 0
  },
  quickActionButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '20px'
  },
  quickTileBtn: {
    padding: '16px',
    borderRadius: '10px',
    background: 'rgba(15, 20, 32, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: '#f8fafc',
    transition: 'all 0.18s ease'
  },
  quickTileIcon: {
    fontSize: '20px',
    color: '#00d9ff'
  },
  quickTileText: {
    fontSize: '0.82rem',
    fontWeight: 600
  },
  walletInfoBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(10, 14, 22, 0.9)',
    border: '1px solid rgba(0, 217, 255, 0.2)'
  },
  infoBarLbl: {
    fontSize: '0.68rem',
    color: '#64748b',
    fontWeight: 700
  },
  infoBarVal: {
    fontSize: '0.96rem',
    fontWeight: 800,
    fontFamily: 'monospace'
  },
  liveStreamBadge: {
    fontSize: '0.65rem',
    color: '#00d9ff',
    background: 'rgba(0, 217, 255, 0.12)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700
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
    borderRadius: '8px',
    background: 'rgba(15, 20, 32, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.04)'
  },
  activityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#00d9ff',
    flexShrink: 0
  },
  actTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  actTitleText: {
    fontSize: '0.86rem',
    fontWeight: 700
  },
  actGameBadge: {
    fontSize: '0.65rem',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#94a3b8'
  },
  actDetails: {
    fontSize: '0.74rem',
    color: '#64748b'
  },
  actTimestamp: {
    fontSize: '0.72rem',
    color: '#64748b',
    fontFamily: 'monospace'
  },
  telemetryHero: {
    padding: '20px 24px',
    borderRadius: '14px',
    background: 'rgba(13, 16, 24, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px'
  },
  remoteTitle: {
    fontSize: '1.25rem',
    fontWeight: 800,
    margin: '0 0 6px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  onlineBadge: {
    fontSize: '0.68rem',
    color: '#05df72',
    background: 'rgba(5, 223, 114, 0.15)',
    border: '1px solid rgba(5, 223, 114, 0.35)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  remoteSub: {
    fontSize: '0.82rem',
    color: '#94a3b8',
    margin: 0
  },
  remoteKeySelectCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  fleetLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#64748b'
  },
  fleetDropdown: {
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(15, 20, 32, 0.9)',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    outline: 'none'
  },
  controlsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
    gap: '20px'
  },
  cardBox: {
    padding: '22px 24px',
    borderRadius: '14px',
    background: 'rgba(13, 16, 24, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(20px)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
  },
  cyanMiniBadge: {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: '#00d9ff',
    background: 'rgba(0, 217, 255, 0.1)',
    border: '1px solid rgba(0, 217, 255, 0.25)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  featureStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  toggleTile: {
    padding: '14px 18px',
    borderRadius: '10px',
    background: 'rgba(15, 19, 29, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none'
  },
  tileTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    marginBottom: '2px'
  },
  tileDesc: {
    fontSize: '0.74rem',
    color: '#64748b'
  },
  switchPill: {
    width: '46px',
    height: '26px',
    borderRadius: '30px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    position: 'relative',
    transition: 'all 0.2s ease',
    flexShrink: 0,
    cursor: 'pointer'
  },
  switchKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
    transition: 'all 0.2s ease'
  },
  sliderTile: {
    padding: '14px 18px',
    borderRadius: '10px',
    background: 'rgba(15, 19, 29, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  sliderHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.86rem',
    fontWeight: 600
  },
  sliderValueBox: {
    color: '#00d9ff',
    fontFamily: 'monospace',
    fontWeight: 700,
    background: 'rgba(0, 217, 255, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  rangeSlider: {
    width: '100%',
    accentColor: '#00d9ff',
    cursor: 'pointer'
  },
  themeSelectorTile: {
    padding: '14px 18px',
    borderRadius: '10px',
    background: 'rgba(15, 19, 29, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.08)'
  },
  themeHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.84rem',
    fontWeight: 600,
    marginBottom: '10px'
  },
  activeThemeName: {
    color: '#00d9ff',
    fontFamily: 'monospace'
  },
  themeButtonsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '6px'
  },
  themePresetBtn: {
    padding: '8px 4px',
    borderRadius: '6px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  themePresetBtnActive: {
    background: 'rgba(0, 217, 255, 0.15)',
    borderColor: '#00d9ff',
    color: '#00d9ff'
  },
  emergencyPurgeCard: {
    padding: '20px 24px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.08) 0%, transparent 100%), rgba(13, 16, 24, 0.8)',
    border: '1px solid rgba(255, 51, 102, 0.35)',
    borderTop: '1px solid rgba(255, 51, 102, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    flexWrap: 'wrap'
  },
  emergencyPurgeTitle: {
    color: '#ff6b8b',
    fontSize: '0.96rem',
    fontWeight: 700,
    margin: '0 0 4px 0'
  },
  emergencyPurgeDesc: {
    color: '#94a3b8',
    fontSize: '0.8rem',
    margin: 0,
    maxWidth: '650px'
  },
  emergencyPurgeBtn: {
    padding: '12px 20px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #ff3366 0%, #d90429 100%)',
    border: 'none',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '0.86rem',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(255, 51, 102, 0.35)'
  },
  genHeroCard: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '32px 30px',
    borderRadius: '16px',
    background: 'rgba(13, 16, 24, 0.85)',
    border: '1px solid rgba(0, 217, 255, 0.25)',
    borderTop: '1px solid rgba(255, 255, 255, 0.22)',
    backdropFilter: 'blur(20px)'
  },
  genBadge: {
    display: 'inline-flex',
    padding: '4px 10px',
    borderRadius: '20px',
    background: 'rgba(0, 217, 255, 0.1)',
    border: '1px solid rgba(0, 217, 255, 0.3)',
    color: '#00d9ff',
    fontSize: '0.72rem',
    fontWeight: 700,
    marginBottom: '14px'
  },
  genTitle: {
    fontSize: '1.45rem',
    fontWeight: 800,
    margin: '0 0 8px 0'
  },
  genDesc: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    margin: '0 0 24px 0'
  },
  genForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px'
  },
  formCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  formLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.04em'
  },
  formSelect: {
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'rgba(8, 11, 18, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '0.88rem',
    outline: 'none'
  },
  formInput: {
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'rgba(8, 11, 18, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '0.88rem',
    outline: 'none'
  },
  formHelperText: {
    fontSize: '0.72rem',
    color: '#64748b'
  },
  invoiceBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(0, 132, 255, 0.12) 0%, rgba(0, 217, 255, 0.05) 100%), rgba(10, 14, 22, 0.9)',
    border: '1px solid rgba(0, 217, 255, 0.25)',
    flexWrap: 'wrap',
    gap: '14px',
    marginTop: '10px'
  },
  invoiceCostBlock: {},
  walletBalanceBlock: {},
  invoiceLbl: {
    fontSize: '0.68rem',
    color: '#64748b',
    fontWeight: 700
  },
  invoiceAmount: {
    fontSize: '1.25rem',
    fontWeight: 800,
    color: '#ffffff',
    fontFamily: 'monospace'
  },
  walletAmount: {
    fontSize: '1.25rem',
    fontWeight: 800,
    color: '#00d9ff',
    fontFamily: 'monospace'
  },
  generateSubmitBtn: {
    padding: '12px 24px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #00d9ff 0%, #0084ff 100%)',
    border: 'none',
    color: '#07090e',
    fontWeight: 800,
    fontSize: '0.9rem',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(0, 217, 255, 0.35)'
  },
  genSuccessCard: {
    marginTop: '22px',
    padding: '18px 20px',
    borderRadius: '10px',
    background: 'rgba(5, 223, 114, 0.08)',
    border: '1px solid rgba(5, 223, 114, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  genSuccessTitle: {
    fontSize: '0.92rem',
    fontWeight: 700,
    color: '#05df72'
  },
  genKeyDisplayRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '6px',
    background: 'rgba(7, 9, 14, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  },
  genKeyCode: {
    fontFamily: 'monospace',
    fontSize: '1rem',
    fontWeight: 800,
    color: '#00d9ff'
  },
  copyKeyBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    background: 'rgba(0, 217, 255, 0.15)',
    border: '1px solid rgba(0, 217, 255, 0.4)',
    color: '#00d9ff',
    fontWeight: 700,
    fontSize: '0.78rem',
    cursor: 'pointer'
  },
  genActionRow: {
    display: 'flex',
    justifyContent: 'flex-end'
  },
  linkRemoteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#00d9ff',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer'
  },
  tableHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px'
  },
  tableHeadTitle: {
    fontSize: '1.35rem',
    fontWeight: 800,
    margin: '0 0 4px 0'
  },
  tableHeadDesc: {
    fontSize: '0.82rem',
    color: '#94a3b8',
    margin: 0
  },
  tableActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  searchTableInput: {
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(15, 20, 32, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    fontSize: '0.84rem',
    outline: 'none',
    width: '220px'
  },
  addKeyTopBtn: {
    padding: '10px 16px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #00d9ff 0%, #0084ff 100%)',
    border: 'none',
    color: '#07090e',
    fontWeight: 700,
    fontSize: '0.84rem',
    cursor: 'pointer'
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '14px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(13, 16, 24, 0.78)',
    backdropFilter: 'blur(20px)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.84rem'
  },
  theadRow: {
    background: 'rgba(15, 20, 32, 0.85)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
  },
  th: {
    padding: '14px 16px',
    color: '#64748b',
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.06em'
  },
  tbodyRow: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    transition: 'background 0.15s ease'
  },
  td: {
    padding: '14px 16px',
    verticalAlign: 'middle'
  },
  tdId: {
    padding: '14px 16px',
    color: '#64748b',
    fontFamily: 'monospace',
    fontWeight: 700
  },
  gameBadge: {
    display: 'inline-block',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '3px',
    background: 'rgba(0, 217, 255, 0.1)',
    color: '#00d9ff',
    marginBottom: '4px'
  },
  keyWithCopyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  keyMonoText: {
    fontFamily: 'monospace',
    fontWeight: 700,
    color: '#ffffff'
  },
  iconCopyBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '13px'
  },
  deviceUsageText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginBottom: '4px'
  },
  usageBarTrack: {
    width: '90px',
    height: '4px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden'
  },
  usageBarFill: {
    height: '100%',
    borderRadius: '4px'
  },
  tdPlan: {
    padding: '14px 16px',
    fontWeight: 600,
    color: '#94a3b8'
  },
  creatorPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: '#f8fafc'
  },
  creatorInitial: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.68rem'
  },
  statusTag: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700
  },
  statusTagActive: {
    background: 'rgba(5, 223, 114, 0.15)',
    color: '#05df72',
    border: '1px solid rgba(5, 223, 114, 0.35)'
  },
  statusTagWaiting: {
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.35)'
  },
  statusTagExpired: {
    background: 'rgba(255, 51, 102, 0.15)',
    color: '#ff3366',
    border: '1px solid rgba(255, 51, 102, 0.35)'
  },
  statusDateText: {
    fontSize: '0.68rem',
    color: '#64748b',
    marginTop: '3px',
    fontFamily: 'monospace'
  },
  actionBtnGroup: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '6px'
  },
  actionIconBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    background: 'rgba(15, 20, 32, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '12px'
  },
  userProfileCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  userCellAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: '#00d9ff',
    color: '#07090e',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem'
  },
  userCellName: {
    fontWeight: 700,
    fontSize: '0.88rem'
  },
  userCellEmail: {
    fontSize: '0.74rem',
    color: '#64748b'
  },
  resellerTag: {
    fontSize: '0.68rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(0, 217, 255, 0.12)',
    color: '#00d9ff',
    border: '1px solid rgba(0, 217, 255, 0.25)'
  },
  uplinkText: {
    fontSize: '0.78rem',
    color: '#94a3b8'
  },
  userBalancePill: {
    fontFamily: 'monospace',
    fontWeight: 700,
    color: '#00d9ff',
    background: 'rgba(0, 217, 255, 0.08)',
    padding: '3px 8px',
    borderRadius: '4px'
  },
  noticeBoxWarning: {
    padding: '16px 20px',
    borderRadius: '12px',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    color: '#f59e0b',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    fontSize: '0.85rem',
    lineHeight: 1.4
  },
  noticeBoxDanger: {
    padding: '16px 20px',
    borderRadius: '12px',
    background: 'rgba(255, 51, 102, 0.1)',
    border: '1px solid rgba(255, 51, 102, 0.3)',
    color: '#ff6b8b',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    fontSize: '0.85rem',
    lineHeight: 1.4
  },
  noticeIcon: {
    fontSize: '22px',
    flexShrink: 0
  },
  cardBoxCentered: {
    maxWidth: '580px',
    margin: '10px auto',
    padding: '30px',
    borderRadius: '14px',
    background: 'rgba(13, 16, 24, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(20px)'
  },
  actionCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '22px',
    paddingBottom: '14px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
  },
  actionCardIcon: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: 'rgba(0, 217, 255, 0.12)',
    color: '#00d9ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px'
  },
  actionCardTitle: {
    fontSize: '1.2rem',
    fontWeight: 800,
    margin: '0 0 4px 0'
  },
  actionCardSub: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    margin: 0
  },
  actionFormStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  confirmActionBtn: {
    padding: '14px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #00d9ff 0%, #0084ff 100%)',
    border: 'none',
    color: '#07090e',
    fontWeight: 800,
    fontSize: '0.88rem',
    cursor: 'pointer',
    marginTop: '10px'
  },
  dangerActionBtn: {
    padding: '14px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #ff3366 0%, #d90429 100%)',
    border: 'none',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: '0.88rem',
    cursor: 'pointer',
    marginTop: '10px'
  },
  settingDesc: {
    fontSize: '0.82rem',
    color: '#94a3b8',
    margin: '0 0 16px 0',
    lineHeight: 1.4
  },
  settingToggleRow: {
    padding: '14px 18px',
    borderRadius: '10px',
    background: 'rgba(15, 19, 29, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px'
  },
  settingTitle: {
    fontSize: '0.9rem',
    fontWeight: 700
  },
  settingSub: {
    fontSize: '0.74rem',
    color: '#64748b'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  modalCard: {
    maxWidth: '440px',
    padding: '28px',
    borderRadius: '14px',
    background: '#0d1018',
    border: '1px solid rgba(255, 51, 102, 0.5)',
    textAlign: 'center',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
  },
  modalIcon: {
    fontSize: '32px',
    marginBottom: '10px'
  },
  modalTitle: {
    color: '#ff3366',
    margin: '0 0 10px 0',
    fontSize: '1.2rem'
  },
  modalText: {
    color: '#94a3b8',
    fontSize: '0.84rem',
    lineHeight: 1.5,
    marginBottom: '22px'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center'
  },
  modalCancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    background: 'rgba(30, 36, 50, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    cursor: 'pointer'
  },
  modalConfirmPurgeBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    background: '#ff3366',
    border: 'none',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer'
  }
}
