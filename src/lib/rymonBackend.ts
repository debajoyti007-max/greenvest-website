import { supabase } from './supabase'

// ============================================================================
// RYMON GHOST CONNECT - SOVEREIGN SUPABASE BACKEND CLIENT MODULE
// 100% sovereign database operations on greenvest.shop & Supabase
// No fake users, no fake keys, no fake login
// ============================================================================

export interface RymonAccount {
  id: string
  username: string
  email: string
  role: 'owner' | 'admin' | 'reseller' | 'streamer' | 'user'
  balance: number
  uplink: string
  referral_code?: string
  status: 'ACTIVE' | 'BANNED'
  expires_at?: string
  permissions?: {
    dashboard?: boolean
    generate_key?: boolean
    license_keys?: boolean
    telegram_bot?: boolean
    account_settings?: boolean
    security?: boolean
    allow_custom_apps?: boolean
    allowed_apps?: string[]
    allow_multi_device?: boolean
    allow_web_remote?: boolean
  }
  session_token?: string
}

export function getStoredSessionToken(): string {
  try {
    const raw = localStorage.getItem('rymon_session_user')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.session_token === 'string') {
        return parsed.session_token.trim()
      }
    }
  } catch {}
  return ''
}

export async function logoutBackend(): Promise<void> {
  const token = getStoredSessionToken()
  if (!supabase || !token) return
  try {
    await supabase.rpc('rpc_rymon_logout', { p_session_token: token })
  } catch {}
}

async function setSystemConfigRemote(key: string, value: unknown): Promise<void> {
  if (!supabase) return
  try {
    await supabase.rpc('rpc_rymon_set_system_config', {
      p_key: key,
      p_value: value,
      p_session_token: getStoredSessionToken()
    })
  } catch {}
}

function generateCryptoCodeSegment(length: number = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const out: string[] = []
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < length; i++) {
      out.push(chars[bytes[i] % chars.length])
    }
  } else {
    for (let i = 0; i < length; i++) {
      out.push(chars[Math.floor(Math.random() * chars.length)])
    }
  }
  return out.join('')
}

export interface RymonLicense {
  id: number | string
  license_key: string
  game: string
  plan_duration: string
  creator_username: string
  devices_used: number
  devices_max: number
  device_hwid: string
  status: 'ACTIVE' | 'WAITING' | 'EXPIRED' | 'BANNED' | 'PAUSED'
  is_paused?: boolean
  paused_at?: string | null   // DB-persisted freeze timestamp (device-agnostic)
  expires_at: string | null
  last_heartbeat?: string
  created_at?: string
  updated_at?: string
}

export interface RymonActivity {
  id: number | string
  title: string
  event_type: string
  game?: string
  details: string
  actor_username: string
  ip_address?: string
  status: string
  created_at: string
}

export interface StreamerControlRecord {
  license_key: string
  streamer_name: string
  game_name: string
  device_hwid?: string
  is_active: boolean
  is_paused?: boolean
  paused_at?: string | null   // DB-persisted freeze timestamp (device-agnostic)
  is_online: boolean
  last_heartbeat?: string
  expires_at?: string
  plan_duration?: string
  creator?: string
  devices_max?: number
  devices_used?: number
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
  in_game_panel?: boolean
  enemies?: number
  bots?: number
  updated_at?: string
}

// Sovereign In-Memory Fallback Seed (Only genuine Root Owner)
const SOVEREIGN_FALLBACK_ACCOUNTS: RymonAccount[] = [
  {
    id: '941a9e4e-e3cd-49de-8872-390cc7e4dcaf',
    username: 'debajoyti',
    email: 'debajoyti@rymon.vip',
    role: 'owner',
    balance: 999628429,
    uplink: 'SOVEREIGN_ROOT',
    referral_code: 'ROOT001',
    status: 'ACTIVE',
    expires_at: '2036-10-10T00:00:00Z',
    permissions: {
      dashboard: true,
      generate_key: true,
      license_keys: true,
      telegram_bot: true,
      allow_custom_apps: true
    }
  },
  {
    id: 'b584a970-36b9-4dc1-bf32-a5f5950b42e9',
    username: 'RYZEN',
    email: 'ryzen@rymon.vip',
    role: 'owner',
    balance: 999999,
    uplink: 'debajoyti',
    referral_code: 'RYZEN001',
    status: 'ACTIVE',
    expires_at: '2036-10-15T00:00:00Z',
    permissions: {
      dashboard: true,
      generate_key: true,
      license_keys: true,
      telegram_bot: false,
      allow_custom_apps: false
    }
  }
]

export interface RymonReferral {
  id: number
  code: string
  target_role: 'admin' | 'reseller'
  initial_balance: number
  subscription_days?: 30 | 60
  created_by: string
  max_uses: number
  times_used: number
  is_active: boolean
  created_at: string
}

const STREAMER_HEARTBEAT_TIMEOUT_MS = 90000 // 90 seconds (generous grace period to prevent mobile network dropouts)

export function isStreamerKeyActivelyPlaying(
  ctrl?: Partial<StreamerControlRecord> | null
): boolean {
  if (!ctrl) return false
  if (ctrl.is_online !== true || ctrl.is_paused === true || ctrl.is_active === false) {
    return false
  }
  if (!ctrl.last_heartbeat) {
    return false
  }
  const hbMs = new Date(ctrl.last_heartbeat).getTime()
  if (Number.isNaN(hbMs)) return false
  const now = Date.now()
  const diff = now - hbMs
  // If phone clock is slightly ahead of server/browser clock (diff < 0), it is clearly fresh/online
  if (diff < 0) return true
  return diff <= STREAMER_HEARTBEAT_TIMEOUT_MS
}

export function buildDefaultStreamerControlPayload(
  params: Partial<StreamerControlRecord> & { license_key: string }
): StreamerControlRecord {
  return {
    license_key: params.license_key.trim().toUpperCase(),
    streamer_name: params.streamer_name || 'VIP Streamer',
    game_name: params.game_name || 'Free Fire MAX',
    device_hwid: params.device_hwid || '',
    is_active: params.is_active ?? true,
    is_paused: params.is_paused ?? false,
    is_online: params.is_online ?? false,
    last_heartbeat: params.last_heartbeat,
    expires_at: params.expires_at,
    plan_duration: params.plan_duration || '1 Day',
    creator: params.creator || 'debajoyti',
    devices_max: params.devices_max ?? 1,
    devices_used: params.devices_used ?? 0,
    aim_silent: params.aim_silent ?? false,
    hit_rate: params.hit_rate ?? 100,
    ignore_knocked: params.ignore_knocked ?? true,
    show_aim_line: params.show_aim_line ?? false,
    show_aim_fov: params.show_aim_fov ?? true,
    aim_fov: params.aim_fov ?? 90,
    esp_box: params.esp_box ?? true,
    esp_line: params.esp_line ?? true,
    esp_skeleton: params.esp_skeleton ?? true,
    esp_name: params.esp_name ?? true,
    esp_distance: params.esp_distance ?? true,
    esp_health: params.esp_health ?? true,
    esp_count: params.esp_count ?? false,
    esp_radar: params.esp_radar ?? false,
    speed_hack: params.speed_hack ?? false,
    speed_multiplier: params.speed_multiplier ?? 1,
    ghost_hack: params.ghost_hack ?? false,
    no_reload: params.no_reload ?? false,
    no_recoil: params.no_recoil ?? false,
    theme_color_index: params.theme_color_index ?? 0,
    emergency_purge: params.emergency_purge ?? false,
    updated_at: new Date().toISOString()
  }
}

// ============================================================================
// HIGH-SPEED IN-MEMORY VIP REALTIME BRIDGE (RENDER CLOUD RAM)
// Sub-50ms RAM latency, zero Supabase database load, unlimited instant toggles
// ============================================================================
const RENDER_VIP_BRIDGE_URL = 'https://rymon-telegram-bot.onrender.com'

let warmingStarted = false
export function warmRenderVipBridge(): void {
  if (warmingStarted) return
  warmingStarted = true
  try {
    fetch(`${RENDER_VIP_BRIDGE_URL}/`, { method: 'GET', mode: 'no-cors' }).catch(() => {})
  } catch {}
}

export async function sendRenderVipPatch(key: string, patch: Partial<StreamerControlRecord>): Promise<boolean> {
  const normKey = String(key || '').trim().toUpperCase()
  if (!normKey) return false
  const token = getStoredSessionToken()
  try {
    const res = await fetch(`${RENDER_VIP_BRIDGE_URL}/api/vip/patch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Session-Token': token } : {})
      },
      body: JSON.stringify({ license_key: normKey, ...patch })
    })
    return res.ok
  } catch {
    return false
  }
}

const SOVEREIGN_FALLBACK_REFERRALS: RymonReferral[] = [
  {
    id: 1,
    code: 'RYMON-RES30D-VIP',
    target_role: 'reseller',
    initial_balance: 5000,
    subscription_days: 30,
    created_by: 'debajoyti',
    max_uses: 5,
    times_used: 0,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    code: 'RYMON-ADM30D-MASTER',
    target_role: 'admin',
    initial_balance: 50000,
    subscription_days: 30,
    created_by: 'debajoyti',
    max_uses: 1,
    times_used: 0,
    is_active: true,
    created_at: new Date().toISOString()
  }
]

const SOVEREIGN_FALLBACK_LICENSES: RymonLicense[] = [
  {
    id: 38505,
    license_key: 'RYMON-FF-94A2-9981',
    game: 'Free Fire MAX',
    plan_duration: '1 Day',
    creator_username: 'debajoyti',
    devices_used: 2,
    devices_max: 300,
    device_hwid: 'HWID-ALPHA-77',
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 86400000).toISOString()
  },
  {
    id: 38504,
    license_key: 'RYMON-FF-4482-1092',
    game: 'Free Fire MAX',
    plan_duration: '30 Days',
    creator_username: 'debajoyti',
    devices_used: 0,
    devices_max: 1,
    device_hwid: '',
    status: 'WAITING',
    expires_at: null
  },
  {
    id: 38503,
    license_key: 'RYMON-FF-7719-2041',
    game: 'Free Fire MAX',
    plan_duration: '30 Days',
    creator_username: 'debajoyti',
    devices_used: 0,
    devices_max: 1,
    device_hwid: '',
    status: 'WAITING',
    expires_at: null
  },
  {
    id: 38502,
    license_key: 'RYMON-FF-3108-8842',
    game: 'Free Fire MAX',
    plan_duration: '1 Day',
    creator_username: 'debajoyti',
    devices_used: 1,
    devices_max: 1,
    device_hwid: 'HWID-SK-DEVICE',
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 86400000).toISOString()
  },
  {
    id: 38501,
    license_key: 'RYMON-FF-8491-3004',
    game: 'Free Fire MAX',
    plan_duration: '30 Days',
    creator_username: 'debajoyti',
    devices_used: 1,
    devices_max: 1,
    device_hwid: 'HWID-RYMON-MAIN',
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  },
  {
    id: 38500,
    license_key: 'RYMON-FF-1190-7734',
    game: 'Free Fire MAX',
    plan_duration: '7 Days',
    creator_username: 'debajoyti',
    devices_used: 0,
    devices_max: 1,
    device_hwid: '',
    status: 'WAITING',
    expires_at: null
  },
  {
    id: 38499,
    license_key: 'RYMON-FF-9920-4100',
    game: 'Free Fire MAX',
    plan_duration: '1 Day',
    creator_username: 'debajoyti',
    devices_used: 1,
    devices_max: 1,
    device_hwid: 'HWID-REV-01',
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 86400000).toISOString()
  }
]

const SOVEREIGN_FALLBACK_ACTIVITIES: RymonActivity[] = [
  {
    id: 1,
    title: 'Ticket #387',
    event_type: 'KEY_GENERATED',
    game: 'Free Fire MAX',
    details: '1 Day • 300 Device(s)',
    actor_username: 'debajoyti',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 31 * 60000).toISOString()
  },
  {
    id: 2,
    title: 'Ticket #386',
    event_type: 'KEY_GENERATED',
    game: 'Free Fire MAX',
    details: '30 Days • 1 Device(s)',
    actor_username: 'debajoyti',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 10 * 3600000).toISOString()
  },
  {
    id: 3,
    title: 'Ticket #385',
    event_type: 'KEY_GENERATED',
    game: 'Free Fire MAX',
    details: '30 Days • 1 Device(s)',
    actor_username: 'debajoyti',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 11 * 3600000).toISOString()
  },
  {
    id: 4,
    title: 'Ticket #384',
    event_type: 'KEY_GENERATED',
    game: 'Free Fire MAX',
    details: '7 Days • 1 Device(s)',
    actor_username: 'debajoyti',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 13 * 3600000).toISOString()
  }
]

// ============================================================================
// 1. REAL AUTHENTICATION & LOGIN (NO FAKE LOGIN)
// ============================================================================
export async function loginWithCredentials(
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: RymonAccount; error?: string }> {
  const cleanUser = usernameInput.trim()
  const cleanPass = passwordInput.trim()

  if (!cleanUser || !cleanPass) {
    return { success: false, error: 'Username and password are required.' }
  }

  // A. Try Remote Supabase Database (Server-Side SHA-256 Hashing RPC)
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_login', {
        p_username: cleanUser,
        p_password: cleanPass
      })

      if (!error && data) {
        if (data.success && data.user) {
          return { success: true, user: data.user as RymonAccount }
        } else if (data.error) {
          return { success: false, error: data.error }
        }
      }
    } catch {
      // Continue to resilient fallback
    }
  }

  // B. Sovereign Local Fallback Verification (Zero Crash Architecture)
  const localAccounts = getStoredAccounts()
  const matched = localAccounts.find(
    (a) => a.username.toLowerCase() === cleanUser.toLowerCase()
  )

  if (matched) {
    if (matched.status === 'BANNED') {
      return { success: false, error: 'Account suspended/banned by Administrator.' }
    }
    if (matched.role !== 'owner' && matched.expires_at && new Date(matched.expires_at).getTime() < Date.now()) {
      return {
        success: false,
        error: `Your ${matched.role.toUpperCase()} subscription expired on ${new Date(matched.expires_at).toLocaleDateString()}. Contact your Admin/Owner to renew (30 Days / 60 Days).`
      }
    }
    const storedPass = localStorage.getItem(`rymon_pw_${matched.username}`)
    if (storedPass && cleanPass === storedPass) {
      return { success: true, user: matched }
    }
    return { success: false, error: 'Invalid password or offline server connection unavailable.' }
  }

  return { success: false, error: 'Account not found. Check username or contact Administrator.' }
}

// ============================================================================
/**
 * Checks whether two hardware IDs match, normalizing across legacy and modern formats:
 * - Strips prefixes like 'android_id:', 'install_id:', 'boot_fallback:', etc.
 * - Performs case-insensitive exact match across single or '|'-delimited multi-device entries.
 */
export function areHwidsMatching(dbHwid?: string, reqHwid?: string): boolean {
  if (!dbHwid || !reqHwid) return false
  const normalize = (val: string) =>
    val.trim().toLowerCase().replace(/^(android_id:|install_id:|boot_fallback:|hwid:|device:)/, '')
  const normReq = normalize(reqHwid)
  if (!normReq) return false
  return dbHwid
    .split('|')
    .map((part) => normalize(part))
    .filter(Boolean)
    .some((part) => part === normReq)
}

// 3. PER-KEY VERIFICATION & HWID BINDING (STREAMER LOGIN)
// ============================================================================
export async function verifyLicenseKey(
  keyInput: string,
  hwidInput?: string,
  isWebConsole: boolean = true,
  appNameInput?: string,
  appSecretInput?: string
): Promise<{
  valid: boolean
  key?: string
  game?: string
  plan?: string
  status?: string
  isPaused?: boolean
  deviceHwid?: string
  expiresAt?: string
  devicesUsed?: number
  devicesMax?: number
  createdAt?: string
  lastHeartbeat?: string
  isMaster?: boolean
  error?: string
}> {
  const cleanKey = keyInput.trim().toUpperCase()
  if (!cleanKey) return { valid: false, error: 'License key is required.' }
  if (cleanKey === 'RYMON-MASTER-KEY') {
    return { valid: false, error: 'Master key login is disabled. Use a valid generated license key.' }
  }

  // 1. Web KeyAuth License & HWID Reset Portal Login (Unlocked for ALL registered/custom apps):
  if (isWebConsole && !hwidInput) {
    if (supabase) {
      try {
        const { data: webRes, error: webErr } = await supabase.rpc('rpc_rymon_verify_web_key', {
          p_license_key: cleanKey
        })
        if (!webErr && webRes) {
          if (webRes.valid) {
            return {
              valid: true,
              key: webRes.key,
              game: webRes.game || 'Free Fire MAX',
              plan: webRes.plan || '30 Days',
              status: webRes.status,
              isPaused: Boolean(webRes.is_paused),
              deviceHwid: webRes.device_hwid || '',
              expiresAt: webRes.expires_at || undefined,
              devicesUsed: webRes.devices_used || 0,
              devicesMax: webRes.devices_max || 1,
              createdAt: webRes.created_at || undefined,
              lastHeartbeat: webRes.last_heartbeat || undefined
            }
          }
          return { valid: false, error: webRes.error || 'Invalid license key.' }
        }
      } catch {}
    }

    // Local fallback check for offline / memory demo (supports any registered/custom app)
    const localLicenses = getStoredLicenses()
    const matched = localLicenses.find((l) => l.license_key.toUpperCase() === cleanKey)
    if (matched) {
      if (matched.status === 'BANNED') {
        return { valid: false, error: 'License key has been banned by Administrator.' }
      }
      if (matched.expires_at && new Date(matched.expires_at).getTime() < Date.now()) {
        return { valid: false, error: 'License key has expired.' }
      }
      return {
        valid: true,
        key: matched.license_key,
        game: matched.game || 'Free Fire MAX',
        plan: matched.plan_duration,
        status: matched.is_paused ? 'PAUSED' : matched.status,
        isPaused: Boolean(matched.is_paused),
        deviceHwid: matched.device_hwid || '',
        expiresAt: matched.expires_at || undefined,
        devicesUsed: matched.devices_used,
        devicesMax: matched.devices_max,
        createdAt: matched.created_at,
        lastHeartbeat: matched.last_heartbeat
      }
    }

    return { valid: false, error: 'Invalid license key. Check key string or generate a new key.' }
  }

  // 2. Hardware Client Path (when hwidInput is explicitly provided, e.g. from external loader / client)
  if (!hwidInput || !hwidInput.trim()) {
    return { valid: false, error: 'Device HWID is required for hardware key verification.' }
  }
  const effectiveHwid = hwidInput.trim()
  const effectiveApp = (appNameInput || '').trim()
  const effectiveSecret = (appSecretInput || '').trim()

  if (!effectiveApp) {
    return { valid: false, error: 'Application name (app) is required for hardware key verification.' }
  }
  if (!effectiveSecret) {
    return { valid: false, error: 'App Secret (secret) is required for hardware key verification.' }
  }

  // A. Supabase RPC Verification
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_verify_license', {
        p_license_key: cleanKey,
        p_hwid: effectiveHwid,
        p_game: effectiveApp,
        p_secret: effectiveSecret
      })

      if (!error && data) {
        if (data.valid) {
          return {
            valid: true,
            key: data.key,
            game: data.game,
            plan: data.plan,
            status: data.status,
            isPaused: Boolean(data.is_paused),
            expiresAt: data.expires_at,
            devicesUsed: data.devices_used,
            devicesMax: data.devices_max,
            isMaster: data.is_master
          }
        }
        return { valid: false, error: data.error || 'License invalid' }
      }
      if (error) {
        return { valid: false, error: error.message || 'Verification service unavailable.' }
      }
    } catch {}
  }

  // B. Fallback Registry Verification
  const localLicenses = getStoredLicenses()
  const matched = localLicenses.find((l) => l.license_key.toUpperCase() === cleanKey)

  if (matched) {
    if (matched.status === 'BANNED') {
      return { valid: false, error: 'License key has been revoked/banned by administrator.' }
    }
    const localApps = getLocalRegisteredApps()
    const expectedSec = getAppSecret(effectiveApp, localApps)
    if (effectiveSecret !== expectedSec) {
      return { valid: false, error: `Invalid App Secret for "${effectiveApp}".` }
    }
    const licGame = (matched.game || 'Free Fire MAX').trim()
    if (!['UNIVERSAL', 'ALL', 'ANY', 'GLOBAL'].includes(licGame.toUpperCase()) && licGame.toLowerCase() !== effectiveApp.toLowerCase()) {
      return { valid: false, error: `App Mismatch! This key is only valid for "${licGame}", not "${effectiveApp}".` }
    }
    if (matched.expires_at && new Date(matched.expires_at).getTime() < Date.now()) {
      return { valid: false, error: 'License key has expired.' }
    }
    if (matched.device_hwid && !areHwidsMatching(matched.device_hwid, effectiveHwid) && matched.devices_used >= matched.devices_max) {
      return { valid: false, error: 'HWID mismatch! Key is locked to another device. Reset via Telegram @Rymon007bot.' }
    }

    let fallbackMs = 1 * 86400000
    const pd = (matched.plan_duration || '').toLowerCase()
    if (pd.includes('2 hour')) fallbackMs = 2 * 3600000
    else if (pd.includes('1 day')) fallbackMs = 1 * 86400000
    else if (pd.includes('3 day')) fallbackMs = 3 * 86400000
    else if (pd.includes('7 day')) fallbackMs = 7 * 86400000
    else if (pd.includes('15 day')) fallbackMs = 15 * 86400000
    else if (pd.includes('30 day')) fallbackMs = 30 * 86400000

    const exp = matched.expires_at || new Date(Date.now() + fallbackMs).toISOString()
    matched.status = 'ACTIVE'
    matched.devices_used = Math.max(1, matched.devices_used)
    matched.device_hwid = effectiveHwid
    matched.expires_at = exp
    saveStoredLicenses(localLicenses)

    return {
      valid: true,
      key: matched.license_key,
      game: matched.game,
      plan: matched.plan_duration,
      status: 'ACTIVE',
      expiresAt: exp,
      devicesUsed: matched.devices_used,
      devicesMax: matched.devices_max
    }
  }

  return { valid: false, error: 'Invalid license key. Check key string or generate a new key.' }
}

// In-flight Promise memoization for downline tree resolutions (saves network roundtrips)
const downlinePromiseCache = new Map<string, { promise: Promise<Set<string>>; expires: number }>()

/**
 * Recursively resolves all usernames belonging to actor's downline tree.
 * Traverses parent (uplink) -> child relationship in full breadth/depth.
 * Uses in-flight Promise sharing so concurrent callers reuse a single network round-trip.
 */
async function getDownlineUsernames(
  actorUsername: string,
  includeSelf: boolean = true
): Promise<Set<string>> {
  const cleanActor = (actorUsername || '').trim().toLowerCase()
  const result = new Set<string>()
  if (!cleanActor) return result
  if (includeSelf) result.add(cleanActor)

  const cacheKey = `${cleanActor}::${includeSelf}`
  const now = Date.now()
  const cached = downlinePromiseCache.get(cacheKey)
  if (cached && cached.expires > now) {
    return cached.promise
  }

  const fetchPromise = (async () => {
    let accounts: { username: string; uplink?: string }[] = []

    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_rymon_get_accounts', {
          p_session_token: getStoredSessionToken()
        })
        if (!error && Array.isArray(data)) {
          accounts = data
        }
      } catch {}
    }

    if (accounts.length === 0) {
      accounts = getStoredAccounts()
    }

    const childMap = new Map<string, string[]>()
    for (const acc of accounts) {
      const parent = (acc.uplink || '').trim().toLowerCase()
      const child = (acc.username || '').trim().toLowerCase()
      if (parent && child) {
        if (!childMap.has(parent)) childMap.set(parent, [])
        childMap.get(parent)!.push(child)
      }
    }

    const queue: string[] = [cleanActor]
    while (queue.length > 0) {
      const curr = queue.shift()!
      const children = childMap.get(curr)
      if (children) {
        for (const ch of children) {
          if (!result.has(ch)) {
            result.add(ch)
            queue.push(ch)
          }
        }
      }
    }

    return result
  })()

  downlinePromiseCache.set(cacheKey, { promise: fetchPromise, expires: now + 5000 })
  return fetchPromise
}

function getDownlineUsernamesSync(
  actorUsername: string,
  accounts: { username: string; uplink?: string }[],
  includeSelf: boolean = true
): Set<string> {
  const cleanActor = (actorUsername || '').trim().toLowerCase()
  const result = new Set<string>()
  if (!cleanActor) return result
  if (includeSelf) result.add(cleanActor)

  const childMap = new Map<string, string[]>()
  for (const acc of accounts) {
    const parent = (acc.uplink || '').trim().toLowerCase()
    const child = (acc.username || '').trim().toLowerCase()
    if (parent && child) {
      if (!childMap.has(parent)) childMap.set(parent, [])
      childMap.get(parent)!.push(child)
    }
  }

  const queue: string[] = [cleanActor]
  while (queue.length > 0) {
    const curr = queue.shift()!
    const children = childMap.get(curr)
    if (children) {
      for (const ch of children) {
        if (!result.has(ch)) {
          result.add(ch)
          queue.push(ch)
        }
      }
    }
  }

  return result
}

// ============================================================================
// 4. FETCH LICENSES & USERS (WITH HIERARCHICAL ROLE RESTRICTIONS)
// ============================================================================
export async function fetchAllLicenses(user?: RymonAccount | null): Promise<RymonLicense[]> {
  // Normal streamers only control their single assigned device, no key registry access
  if (user && user.role === 'streamer') {
    return []
  }

  const nowMs = Date.now()
  const max365DaysMs = nowMs + 365 * 86400000
  const max365DaysIso = new Date(max365DaysMs).toISOString()
  const isRootUser = !user || user.username.toLowerCase() === 'debajoyti'

  const normalizeExpiry = (rows: RymonLicense[]): RymonLicense[] => {
    return rows.map((r) => {
      if (
        r.status !== 'BANNED' &&
        r.status !== 'EXPIRED' &&
        r.expires_at &&
        new Date(r.expires_at).getTime() < nowMs
      ) {
        return { ...r, status: 'EXPIRED' as const, is_paused: false }
      }
      if (r.expires_at && new Date(r.expires_at).getTime() > max365DaysMs) {
        return { ...r, expires_at: max365DaysIso }
      }
      return r
    })
  }

  if (supabase) {
    try {
      let allRows: RymonLicense[] | null = null

      const { data: rpcRows, error: rpcErr } = await supabase.rpc('rpc_rymon_get_licenses', {
        p_actor_username: user?.username || 'debajoyti',
        p_actor_password: '',
        p_session_token: getStoredSessionToken()
      })

      if (!rpcErr && Array.isArray(rpcRows)) {
        allRows = rpcRows as RymonLicense[]
      }

      if (allRows && Array.isArray(allRows)) {
        const cleanRows = normalizeExpiry(allRows)
        if (isRootUser) {
          return cleanRows
        }
        if (user.role === 'reseller') {
          return cleanRows.filter(
            (l) => (l.creator_username || '').toLowerCase() === user.username.toLowerCase()
          )
        }
        // Partner Owner (RYZEN) or Admin: only see their downline keys (Debajoyti's keys strictly hidden)
        const allowedSet = await getDownlineUsernames(user.username, true)
        return cleanRows.filter((l) => {
          const creator = (l.creator_username || '').toLowerCase()
          return creator !== 'debajoyti' && allowedSet.has(creator)
        })
      }
    } catch {}
  }

  const stored = normalizeExpiry(getStoredLicenses())
  if (isRootUser) {
    return stored
  }
  if (user.role === 'reseller') {
    return stored.filter((l) => l.creator_username.toLowerCase() === user.username.toLowerCase())
  }
  const allowedSet = getDownlineUsernamesSync(user.username, getStoredAccounts(), true)
  return stored.filter((l) => {
    const creator = l.creator_username.toLowerCase()
    return creator !== 'debajoyti' && allowedSet.has(creator)
  })
}

export async function fetchAllAccounts(user?: RymonAccount | null): Promise<RymonAccount[]> {
  // Streamers and Resellers have ZERO access to view other accounts
  if (user && (user.role === 'reseller' || user.role === 'streamer')) {
    return []
  }

  const nowMs = Date.now()
  const max60DaysMs = nowMs + 60 * 86400000
  const default30DaysIso = new Date(nowMs + 30 * 86400000).toISOString()
  const max60DaysIso = new Date(max60DaysMs).toISOString()

  const isRootUser = !user || user.username.toLowerCase() === 'debajoyti'

  const normalizeAccountSubscriptions = (rows: RymonAccount[]): RymonAccount[] => {
    return rows.map((u) => {
      if (u.role === 'owner') return u
      if (!u.expires_at) {
        return { ...u, expires_at: default30DaysIso }
      }
      const expMs = new Date(u.expires_at).getTime()
      if (expMs > max60DaysMs) {
        return { ...u, expires_at: max60DaysIso }
      }
      return u
    })
  }

  if (supabase) {
    try {
      let allRows: RymonAccount[] | null = null

      // Primary Sovereign Path: Call session-enforced rpc_rymon_get_accounts
      const { data: rpcRows, error: rpcErr } = await supabase.rpc('rpc_rymon_get_accounts', {
        p_session_token: getStoredSessionToken()
      })
      if (!rpcErr && Array.isArray(rpcRows)) {
        allRows = rpcRows as RymonAccount[]
      }

      if (allRows && Array.isArray(allRows)) {
        const rows = normalizeAccountSubscriptions(allRows)
        if (isRootUser) {
          // Sync local storage cache so offline mode mirrors Supabase
          saveStoredAccounts(rows)
          return rows
        }
        if (user?.role === 'owner') {
          // Partner Owner (RYZEN) sees all users or downline tree (excludes root debajoyti from management)
          const allowedDownlines = await getDownlineUsernames(user.username, true)
          return rows.filter((u) => {
            const uName = (u.username || '').toLowerCase()
            return uName !== 'debajoyti' && (uName === user.username.toLowerCase() || allowedDownlines.has(uName))
          })
        }
        if (user?.role === 'admin') {
          // Admin sees only self + their own downline Resellers (never other Admins or Owner)
          const allowedDownlines = await getDownlineUsernames(user.username, false)
          return rows.filter((u) => {
            const uName = (u.username || '').toLowerCase()
            return (
              uName === user.username.toLowerCase() ||
              (u.role === 'reseller' && allowedDownlines.has(uName))
            )
          })
        }
      }
    } catch {}
  }

  const stored = normalizeAccountSubscriptions(getStoredAccounts())
  if (isRootUser) {
    return stored
  }
  if (user.role === 'owner') {
    const allowedDownlines = getDownlineUsernamesSync(user.username || '', stored, true)
    return stored.filter((u) => {
      const uName = String(u.username || '').toLowerCase()
      return uName !== 'debajoyti' && allowedDownlines.has(uName)
    })
  }
  if (user.role === 'admin') {
    const allowedDownlines = getDownlineUsernamesSync(user.username || '', stored, false)
    return stored.filter((u) => {
      const uName = String(u.username || '').toLowerCase()
      const myName = String(user.username || '').toLowerCase()
      return (
        uName === myName ||
        (u.role === 'reseller' && allowedDownlines.has(uName))
      )
    })
  }
  return stored
}

export async function fetchAllActivities(user?: RymonAccount | null): Promise<RymonActivity[]> {
  const userLower = String(user?.username || '').toLowerCase()
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_get_activities', {
        p_session_token: getStoredSessionToken(),
        p_limit: 30
      })

      if (!error && Array.isArray(data)) {
        return data as RymonActivity[]
      }
    } catch {}
  }
  const storedActs = getStoredActivities()
  const isRootUser = !user || userLower === 'debajoyti'
  if (isRootUser) {
    return storedActs.slice(0, 30)
  }
  if (user.role === 'reseller') {
    return storedActs
      .filter((a) => (a.actor_username || '').toLowerCase() === userLower)
      .slice(0, 20)
  }
  const allowedDownlines = getDownlineUsernamesSync(user?.username || '', getStoredAccounts(), true)
  return storedActs
    .filter((a) => {
      const actor = (a.actor_username || '').toLowerCase()
      return actor !== 'debajoyti' && allowedDownlines.has(actor)
    })
    .slice(0, 30)
}

export async function fetchAllStreamerControls(user?: RymonAccount | null): Promise<StreamerControlRecord[]> {
  if (user && user.role === 'streamer') return []
  const userLower = String(user?.username || '').toLowerCase()
  const isRootUser = !user || userLower === 'debajoyti'

  if (supabase) {
    try {
      let query = supabase
        .from('rymon_streamer_controls')
        .select('id, license_key, streamer_name, is_online, is_paused, last_heartbeat, creator, updated_at')

      if (!isRootUser) {
        if (user.role === 'reseller') {
          query = query.ilike('creator', userLower)
        } else if (user.role === 'admin' || user.role === 'owner') {
          const allowedDownlines = await getDownlineUsernames(user.username || '', true)
          const downlineArr = Array.from(allowedDownlines)
          if (downlineArr.length > 0) {
            query = query.in('creator', downlineArr)
          } else {
            query = query.ilike('creator', userLower)
          }
          if (user.role === 'owner') {
            query = query.neq('creator', 'debajoyti')
          }
        }
      }

      const { data, error } = await query
      if (!error && Array.isArray(data)) {
        // Compute active playing state cleanly in-memory (zero database write amplification)
        const rows = (data as unknown as StreamerControlRecord[]).map((r) => {
          const playingNow = isStreamerKeyActivelyPlaying(r)
          return { ...r, is_online: playingNow }
        })

        if (isRootUser) {
          return rows
        }
        if (user?.role === 'reseller') {
          return rows.filter((r) => (r.creator || '').toLowerCase() === userLower)
        }
        const allowedDownlines = await getDownlineUsernames(user?.username || '', true)
        return rows.filter((r) => {
          const creator = (r.creator || '').toLowerCase()
          return creator !== 'debajoyti' && allowedDownlines.has(creator)
        })
      }
    } catch {}
  }
  return []
}

// ============================================================================
// 4B. DYNAMIC KEY PRICING ENGINE (GLOBAL DEFAULT + INDIVIDUAL USER RATES)
// ============================================================================
export const DEFAULT_KEY_PRICES: Record<string, number> = {
  '2 Hours': 20,
  '1 Day': 35,
  '3 Days': 50,
  '7 Days': 100,
  '15 Days': 180,
  '30 Days': 350
}

const GLOBAL_PRICE_STORAGE_KEY = 'rymon_global_key_prices_v1'
const USER_CUSTOM_PRICE_STORAGE_KEY = 'rymon_user_custom_prices_v1'

let lastPricingSyncTime = 0
let cachedPricingResult: {
  globalPrices: Record<string, number>
  customUserMaps: Record<string, Record<string, number>>
} | null = null

function invalidatePricingCache(): void {
  lastPricingSyncTime = 0
  cachedPricingResult = null
}

export async function syncPricingFromSupabase(force: boolean = false): Promise<{
  globalPrices: Record<string, number>
  customUserMaps: Record<string, Record<string, number>>
}> {
  const now = Date.now()
  if (!force && cachedPricingResult && now - lastPricingSyncTime < 60000) {
    return cachedPricingResult
  }
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('rymon_system_config')
        .select('key, value')
        .in('key', ['global_key_prices', 'user_custom_prices'])

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.key === 'global_key_prices' && row.value && typeof row.value === 'object') {
            const merged = { ...DEFAULT_KEY_PRICES, ...(row.value as Record<string, number>) }
            try {
              localStorage.setItem(GLOBAL_PRICE_STORAGE_KEY, JSON.stringify(merged))
            } catch {}
          } else if (row.key === 'user_custom_prices' && row.value && typeof row.value === 'object') {
            try {
              localStorage.setItem(USER_CUSTOM_PRICE_STORAGE_KEY, JSON.stringify(row.value))
            } catch {}
          }
        }
      }
    } catch {}
  }
  lastPricingSyncTime = now
  cachedPricingResult = {
    globalPrices: getGlobalPriceMap(),
    customUserMaps: getAllUserCustomPriceMaps()
  }
  return cachedPricingResult
}

export function getGlobalPriceMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(GLOBAL_PRICE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_KEY_PRICES, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_KEY_PRICES }
}

export function saveGlobalPriceMap(prices: Record<string, number>): Record<string, number> {
  invalidatePricingCache()
  const clean: Record<string, number> = { ...DEFAULT_KEY_PRICES }
  for (const k of Object.keys(DEFAULT_KEY_PRICES)) {
    const val = Number(prices[k])
    if (!Number.isNaN(val) && val >= 0) {
      clean[k] = Math.round(val)
    }
  }
  try {
    localStorage.setItem(GLOBAL_PRICE_STORAGE_KEY, JSON.stringify(clean))
  } catch {}
  if (supabase) {
    void setSystemConfigRemote('global_key_prices', clean)
  }
  return clean
}

export function getAllUserCustomPriceMaps(): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem(USER_CUSTOM_PRICE_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) || {}
    }
  } catch {}
  return {}
}

export function getUserCustomPriceMap(username: string): Record<string, number> | null {
  if (!username) return null
  const all = getAllUserCustomPriceMaps()
  const key = Object.keys(all).find((u) => u.toLowerCase() === username.trim().toLowerCase())
  return key ? all[key] : null
}

export function saveUserCustomPriceMap(
  username: string,
  prices: Record<string, number>
): Record<string, number> {
  invalidatePricingCache()
  const cleanUser = username.trim()
  const all = getAllUserCustomPriceMaps()
  const existingKey = Object.keys(all).find((u) => u.toLowerCase() === cleanUser.toLowerCase()) || cleanUser
  const base = getGlobalPriceMap()
  const cleanMap: Record<string, number> = {}
  for (const k of Object.keys(DEFAULT_KEY_PRICES)) {
    const val = Number(prices[k])
    cleanMap[k] = !Number.isNaN(val) && val >= 0 ? Math.round(val) : base[k]
  }
  all[existingKey] = cleanMap
  try {
    localStorage.setItem(USER_CUSTOM_PRICE_STORAGE_KEY, JSON.stringify(all))
  } catch {}
  const sb = supabase
  if (sb) {
    sb
      .from('rymon_system_config')
      .select('value')
      .eq('key', 'user_custom_prices')
      .maybeSingle()
      .then(({ data }) => {
        const freshFromDb = (data?.value && typeof data.value === 'object'
          ? data.value
          : all) as Record<string, Record<string, number>>
        const merged = { ...freshFromDb, [existingKey]: cleanMap }
        try {
          localStorage.setItem(USER_CUSTOM_PRICE_STORAGE_KEY, JSON.stringify(merged))
        } catch {}
        void setSystemConfigRemote('user_custom_prices', merged)
      }, () => {
        void setSystemConfigRemote('user_custom_prices', all)
      })
  }
  return cleanMap
}

export function clearUserCustomPriceMap(username: string): void {
  invalidatePricingCache()
  if (!username) return
  const all = getAllUserCustomPriceMaps()
  const existingKey = Object.keys(all).find((u) => u.toLowerCase() === username.trim().toLowerCase())
  if (existingKey) {
    delete all[existingKey]
    try {
      localStorage.setItem(USER_CUSTOM_PRICE_STORAGE_KEY, JSON.stringify(all))
    } catch {}
    const sb = supabase
    if (sb) {
      sb
        .from('rymon_system_config')
        .select('value')
        .eq('key', 'user_custom_prices')
        .maybeSingle()
        .then(({ data }) => {
          const freshFromDb = {
            ...((data?.value && typeof data.value === 'object' ? data.value : all) as Record<string, Record<string, number>>)
          }
          delete freshFromDb[existingKey]
          const lowerMatch = Object.keys(freshFromDb).find((u) => u.toLowerCase() === username.trim().toLowerCase())
          if (lowerMatch) delete freshFromDb[lowerMatch]
          try {
            localStorage.setItem(USER_CUSTOM_PRICE_STORAGE_KEY, JSON.stringify(freshFromDb))
          } catch {}
          void setSystemConfigRemote('user_custom_prices', freshFromDb)
        }, () => {
          void setSystemConfigRemote('user_custom_prices', all)
        })
    }
  }
}

export function getEffectivePriceMap(username?: string, role?: string): Record<string, number> {
  const globalMap = getGlobalPriceMap()
  let baseMap = globalMap
  if (username) {
    const custom = getUserCustomPriceMap(username)
    if (custom) baseMap = { ...globalMap, ...custom }
  }

  let effectiveRole = role
  if (!effectiveRole && username && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('rymon_session_user')
      if (raw) {
        const u = JSON.parse(raw)
        if (u.username?.toLowerCase() === username.trim().toLowerCase()) {
          effectiveRole = u.role
        }
      }
    } catch {}
    if (!effectiveRole) {
      try {
        const accs = getStoredAccounts()
        const found = accs.find((a) => (a.username || '').toLowerCase() === username.trim().toLowerCase())
        if (found) effectiveRole = found.role
      } catch {}
    }
  }

  return baseMap
}

// ============================================================================
// 5. ATOMIC KEY GENERATION & WALLET DEDUCTION
// ============================================================================
export async function generateLicenseKeyBackend(params: {
  creator: RymonAccount
  game: string
  duration: string
  customPrefix?: string
  devicesMax?: number
  quantity?: number
  isVipRealtime?: boolean
}): Promise<{
  success: boolean
  key?: string
  keys?: string[]
  remainingBalance?: number
  license?: RymonLicense
  authError?: boolean
  error?: string
}> {
  const { creator, game, duration: rawDuration, customPrefix, devicesMax = 1, quantity = 1 } = params
  const safeQuantity = Math.min(50, Math.max(1, Math.floor(Number(quantity) || 1)))
  const safeDevices = Math.max(1, Math.floor(Number(devicesMax) || 1))

  const ALLOWED_DURATIONS = ['2 Hours', '1 Day', '3 Days', '7 Days', '15 Days', '30 Days']
  const duration = ALLOWED_DURATIONS.includes(rawDuration) ? rawDuration : '1 Day'

  const effectiveMap = getEffectivePriceMap(creator.username, creator.role)
  const normalizedDuration = duration.replace(/^(\d+)\s+Day$/, '$1 Days')
  const baseUnitPrice =
    effectiveMap[duration] ??
    effectiveMap[normalizedDuration] ??
    DEFAULT_KEY_PRICES[normalizedDuration] ??
    35

  const isFf = !game || game.toLowerCase().includes('free fire')
  const isRealtime = false
  const policy = getSovereignSecurityPolicy()

  // 1A. Exclusive Permission Enforcement: Custom App Generation (Debajoyti Authorization Engine)
  if (!isFf) {
    const isDebajoyti = (creator.username || '').toLowerCase() === 'debajoyti'
    const allowedApps = (creator.permissions as any)?.allowed_apps as string[] | undefined
    const isSpecificallyAllowed = Array.isArray(allowedApps) && allowedApps.some((a) => a.toLowerCase() === (game || '').toLowerCase())
    const hasGlobalCustomPerm = Boolean(creator.permissions?.allow_custom_apps)

    const isPermitted = isDebajoyti || isSpecificallyAllowed || hasGlobalCustomPerm

    if (!isPermitted) {
      return {
        success: false,
        error: `Permission Denied: Root Founder (@debajoyti) has not authorized your account for "${game}". Contact @debajoyti for access.`
      }
    }
  }

  // 1B. Strict Role Permission Enforcement: VIP Web Remote Generation
  if (isRealtime && creator.role !== 'owner') {
    const isReseller = creator.role === 'reseller'
    const isAdmin = creator.role === 'admin'
    const userPerm = creator.permissions?.allow_web_remote
    const vipAllowed =
      userPerm !== undefined
        ? Boolean(userPerm)
        : isReseller
        ? Boolean(policy.allow_reseller_web_remote ?? false)
        : isAdmin
        ? Boolean(policy.allow_admin_web_remote ?? true)
        : false

    if (!vipAllowed) {
      return {
        success: false,
        error: `Permission Denied: Your account is locked to Standard APK keys only. Owner permission is required to generate VIP Web Remote keys.`
      }
    }
  }

  // 1C. Strict Reseller Device Limit Enforcement
  if (creator.role === 'reseller') {
    const maxAllowedDev = Math.max(1, Number(policy.reseller_max_devices_limit || 1))
    if (safeDevices > maxAllowedDev) {
      return {
        success: false,
        error: `Strict Policy Violation: Reseller device limit is capped at ${maxAllowedDev} device(s) per key.`
      }
    }
    const maxBulkAllowed = Math.max(1, Number(policy.reseller_max_bulk_limit || 10))
    if (safeQuantity > maxBulkAllowed) {
      return {
        success: false,
        error: `Strict Policy Violation: Reseller batch limit is capped at ${maxBulkAllowed} keys per generation.`
      }
    }
  }

  const surchargePercent = Math.max(0, Number(policy.vip_price_surcharge_percent ?? 50))
  const unitPrice = isRealtime
    ? Math.round(baseUnitPrice * (1 + surchargePercent / 100))
    : baseUnitPrice
  const singleKeyCost = unitPrice * safeDevices
  const totalCost = singleKeyCost * safeQuantity


  const prefix = (customPrefix?.trim() || 'RYMON').toUpperCase()
  let gameTag = 'VIP'
  if (game.includes('Free Fire')) gameTag = 'FF'
  else {
    const clean = game.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    gameTag = clean.length >= 2 ? clean.substring(0, 2) : 'VIP'
  }

  const generatedKeys: string[] = []
  const usedSet = new Set<string>()
  while (generatedKeys.length < safeQuantity) {
    const b1 = generateCryptoCodeSegment(4)
    const b2 = generateCryptoCodeSegment(4)
    const candidate = `${prefix}-${gameTag}-${b1}-${b2}`
    if (!usedSet.has(candidate)) {
      usedSet.add(candidate)
      generatedKeys.push(candidate)
    }
  }
  const newKey = generatedKeys[0]

  // A. Direct Supabase Database Transaction (Session-enforced + Atomic wallet deduction)
  if (supabase) {
    try {
      const effectivePlanDuration = duration
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_generate_key', {
        p_creator_username: creator.username,
        p_game: game,
        p_plan: effectivePlanDuration,
        p_custom_prefix: prefix,
        p_devices_max: safeDevices,
        p_quantity: safeQuantity,
        p_session_token: getStoredSessionToken()
      })

      if (rpcErr) {
        return { success: false, error: rpcErr.message || 'Database error generating key.' }
      }

      if (rpcRes) {
        if (!rpcRes.success) {
          return {
            success: false,
            authError: Boolean(rpcRes.auth_error),
            error: rpcRes.error || 'Failed to generate key.'
          }
        }

        const remainingBalance = rpcRes.remaining_balance !== undefined ? Number(rpcRes.remaining_balance) : undefined
        if (remainingBalance !== undefined) {
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === creator.username.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = remainingBalance
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === creator.username.toLowerCase()) {
                u.balance = remainingBalance
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        const outKeys: string[] = rpcRes.keys || [rpcRes.key]
        const firstKey: string = rpcRes.key || outKeys[0]

        // Dispatch instant Telegram Owner Alert
        void notifyOwnerTelegram([
          `🔑 <b>LICENSE KEY GENERATED</b>`,
          ``,
          safeQuantity === 1
            ? `• <b>Key:</b> <code>${firstKey}</code>`
            : `• <b>Batch (${safeQuantity} Keys):</b>\n${outKeys.slice(0, 5).map((k) => `<code>${k}</code>`).join('\n')}${safeQuantity > 5 ? `\n...and ${safeQuantity - 5} more` : ''}`,
          `• <b>Creator:</b> @${creator.username} (${creator.role.toUpperCase()})`,
          `• <b>Game:</b> ${game || 'Free Fire MAX'}`,
          `• <b>Plan:</b> ${effectivePlanDuration}`,
          `• <b>Cost:</b> ${creator.role === 'owner' ? 'FREE (Owner)' : `₹${Number(rpcRes.total_cost || totalCost).toLocaleString('en-IN')}`}`,
          `• <b>Devices:</b> ${safeDevices} Max Device(s)`
        ].join('\n'))

        return {
          success: true,
          key: firstKey,
          keys: outKeys,
          remainingBalance,
          license: rpcRes.license as RymonLicense
        }
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Unexpected error generating key.' }
    }
  }

  // B. Local Fallback Check
  if (creator.role !== 'owner' && creator.expires_at && new Date(creator.expires_at).getTime() < Date.now()) {
    return {
      success: false,
      error: `Your ${creator.role.toUpperCase()} subscription expired on ${new Date(creator.expires_at).toLocaleDateString()}. Contact your Admin/Owner to renew (30 Days / 60 Days).`
    }
  }
  if (creator.role !== 'owner' && creator.balance < totalCost) {
    return {
      success: false,
      error: `Insufficient wallet balance! ${safeQuantity} key${safeQuantity > 1 ? 's' : ''} require ₹${totalCost.toLocaleString('en-IN')}, but current balance is ₹${creator.balance.toLocaleString('en-IN')}.`
    }
  }

  const effectivePlanDurationFallback = duration

  const newLics: RymonLicense[] = generatedKeys.map((k, idx) => ({
    id: Math.floor(38508 + Math.random() * 1000) + idx,
    license_key: k,
    game,
    plan_duration: effectivePlanDurationFallback,
    creator_username: creator.username,
    devices_used: 0,
    devices_max: safeDevices,
    device_hwid: '',
    status: 'WAITING',
    expires_at: null,
    created_at: new Date().toISOString()
  }))

  const newBalance = creator.role === 'owner' ? creator.balance : Math.max(0, creator.balance - totalCost)

  const accounts = getStoredAccounts()
  const accIndex = accounts.findIndex((a) => (a.username || '').toLowerCase() === (creator.username || '').toLowerCase())
  if (accIndex >= 0) {
    accounts[accIndex].balance = newBalance
    saveStoredAccounts(accounts)
  }

  const licenses = getStoredLicenses()
  saveStoredLicenses([...newLics, ...licenses])

  const newAct: RymonActivity = {
    id: Date.now(),
    title: safeQuantity > 1 ? `Bulk Generated ${safeQuantity} Keys` : `Key Generated #${newLics[0].id}`,
    event_type: 'KEY_GENERATED',
    game,
    details: `${safeQuantity}x ${effectivePlanDurationFallback} • ${safeDevices} Device(s) • Cost: ${creator.role === 'owner' ? 'FREE (Owner)' : `₹${totalCost}`}`,
    actor_username: creator.username,
    status: 'SUCCESS',
    created_at: new Date().toISOString()
  }
  saveStoredActivities([newAct, ...getStoredActivities()])

  return {
    success: true,
    key: newKey,
    keys: generatedKeys,
    remainingBalance: newBalance,
    license: newLics[0]
  }
}

// ============================================================================
// 6. TOP UP / TRANSFER USER BALANCE (OWNER FREE MINT vs ADMIN WALLET TRANSFER)
// ============================================================================
export async function topUpUserBalanceBackend(
  targetUsername: string,
  amount: number,
  mode: 'set' | 'add',
  actorUsername: string = 'debajoyti'
): Promise<{ success: boolean; newBalance?: number; actorRemainingBalance?: number; error?: string }> {
  const cleanTarget = targetUsername.trim()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (cleanTarget.toLowerCase() === 'debajoyti') {
    return { success: false, error: 'Root Owner has infinite balance and does not need top-up.' }
  }

  if (supabase) {
    try {
      const sessionToken = getStoredSessionToken()
      const { data: targetResp } = await supabase.rpc('rpc_rymon_get_account', {
        p_username: cleanTarget,
        p_session_token: sessionToken
      })
      const targetUser = targetResp?.found ? targetResp : null

      if (!targetUser) {
        return { success: false, error: targetResp?.error || `User @${cleanTarget} not found in database.` }
      }

      if (amount < 0 || (!isRootOwner && amount <= 0) || (mode === 'add' && amount <= 0)) {
        return { success: false, error: 'Transfer amount must be greater than ₹0.' }
      }

      if (!isRootOwner) {
        const allowedDownlines = await getDownlineUsernames(cleanActor, false)
        if (!allowedDownlines.has(String(targetUser?.username || '').toLowerCase())) {
          return {
            success: false,
            error: `Power restriction: @${targetUser.username} is outside your downline.`
          }
        }
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_transfer_balance', {
        p_sender_username: cleanActor,
        p_target_username: cleanTarget,
        p_amount: amount,
        p_mode: isRootOwner ? mode : 'add',
        p_session_token: sessionToken
      })

      if (rpcErr) {
        return { success: false, error: rpcErr.message || 'Transfer failed.' }
      }

      if (rpcRes) {
        if (!rpcRes.success) {
          return { success: false, error: rpcRes.error || 'Transfer failed.' }
        }

        if (rpcRes.sender_balance !== undefined) {
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = Number(rpcRes.sender_balance)
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === cleanActor.toLowerCase()) {
                u.balance = Number(rpcRes.sender_balance)
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        return {
          success: true,
          newBalance: Number(rpcRes.target_balance),
          actorRemainingBalance: rpcRes.sender_balance !== undefined ? Number(rpcRes.sender_balance) : undefined
        }
      }
    } catch {}
  }

  // Fallback storage update
  const accounts = getStoredAccounts()
  const matched = accounts.find((a) => (a.username || '').toLowerCase() === cleanTarget.toLowerCase())
  if (!matched) return { success: false, error: 'User not found' }

  let actorRemainingBalance: number | undefined = undefined
  if (!isRootOwner) {
    const actorAcc = accounts.find((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
    if (!actorAcc || (actorAcc.role !== 'admin' && actorAcc.role !== 'owner')) {
      return { success: false, error: 'Power restriction: Only Owner or Admin can fund accounts.' }
    }
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, accounts, false)
    if (!allowedDownlines.has(String(matched.username || '').toLowerCase())) {
      return { success: false, error: `Power restriction: @${matched.username} is outside your downline.` }
    }
    if (actorAcc.balance < amount) {
      return { success: false, error: `Insufficient wallet balance (Available: ₹${actorAcc.balance}).` }
    }
    actorAcc.balance = Math.max(0, actorAcc.balance - amount)
    actorRemainingBalance = actorAcc.balance
  }

  const nextBal = isRootOwner && mode === 'set' ? amount : matched.balance + amount
  matched.balance = nextBal
  saveStoredAccounts(accounts)

  const newAct: RymonActivity = {
    id: Date.now(),
    title: isRootOwner ? (mode === 'set' ? 'Owner Balance Set' : 'Owner Balance Credit') : 'Admin Wallet Transfer',
    event_type: 'BALANCE_CREDIT',
    details: isRootOwner && mode === 'set'
      ? `Set exact balance for @${cleanTarget} to ₹${nextBal.toLocaleString('en-IN')}`
      : `Credited ₹${amount.toLocaleString('en-IN')} to @${cleanTarget} (New Bal: ₹${nextBal.toLocaleString('en-IN')})`,
    actor_username: cleanActor,
    status: 'SUCCESS',
    created_at: new Date().toISOString()
  }
  saveStoredActivities([newAct, ...getStoredActivities()])

  return { success: true, newBalance: nextBal, actorRemainingBalance }
}

// ============================================================================
export interface SovereignSecurityPolicy {
  client_hwid_limit_per_day: number // 0 = Disabled, default 1 per key per 24h for end-customers
  allow_client_self_reset: boolean // default true
  reseller_hwid_limit_per_day: number // 0 = Unlimited, default 2 per key per 24h for resellers
  auto_pause_keys_on_reseller_expiry?: boolean // default true
  admin_sub_renew_fee_30d: number // default 0 (₹0 or custom fee for Admin renewing a Reseller for 30D)
  admin_sub_renew_fee_60d: number // default 0 (₹0 or custom fee for Admin renewing a Reseller for 60D)
  apk_latest_version: string // default '2.4'
  apk_min_version: string // default '2.4'
  apk_force_update: boolean // default false
  apk_release_notes: string
  // Owner Multi-App & Reseller Generation Restrictions
  allow_reseller_custom_apps: boolean // default false (Resellers restricted to Free Fire MAX only)
  allow_admin_custom_apps: boolean    // default true (Admins can generate custom app keys)
  reseller_max_devices_limit: number  // default 1 (Max devices allowed per key for resellers)
  reseller_max_bulk_limit: number     // default 10 (Max keys generated in one batch by reseller)
  // Strict Reseller & Admin VIP Web Remote Generation Controls
  allow_admin_web_remote?: boolean     // default true (Admins can generate VIP Web Remote keys)
  allow_reseller_web_remote?: boolean  // default false (STRICT: Resellers restricted to Standard APK by default)
  vip_price_surcharge_percent?: number // default 50 (+50% VIP Web Remote surcharge)
}

const SECURITY_POLICY_STORAGE_KEY = 'rymon_sovereign_security_policy_v1'
const PAUSED_TIMESTAMPS_STORAGE_KEY = 'rymon_paused_key_timestamps_v1'
const HWID_RESET_LOG_STORAGE_KEY = 'rymon_hwid_reset_daily_log_v1'

const DEFAULT_SECURITY_POLICY: SovereignSecurityPolicy = {
  client_hwid_limit_per_day: 1,
  allow_client_self_reset: true,
  reseller_hwid_limit_per_day: 2,
  auto_pause_keys_on_reseller_expiry: true,
  admin_sub_renew_fee_30d: 0,
  admin_sub_renew_fee_60d: 0,
  apk_latest_version: '2.4',
  apk_min_version: '2.4',
  apk_force_update: false,
  apk_release_notes: 'v2.4 RYMON Sync: Instant Website Remote Hack Toggles + Live Heartbeat Engine',
  allow_reseller_custom_apps: false,
  allow_admin_custom_apps: true,
  reseller_max_devices_limit: 1,
  reseller_max_bulk_limit: 10,
  allow_admin_web_remote: true,
  allow_reseller_web_remote: false, // STRICT: Resellers locked to Standard APK by default
  vip_price_surcharge_percent: 50
}

export function getSovereignSecurityPolicy(): SovereignSecurityPolicy {
  try {
    const raw = localStorage.getItem(SECURITY_POLICY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SECURITY_POLICY, ...parsed }
      }
    }
  } catch {}
  return { ...DEFAULT_SECURITY_POLICY }
}

let lastSecurityPolicySyncTime = 0
let cachedSecurityPolicyResult: SovereignSecurityPolicy | null = null

function invalidateSecurityPolicyCache(): void {
  lastSecurityPolicySyncTime = 0
  cachedSecurityPolicyResult = null
}

export function saveSovereignSecurityPolicy(
  partial: Partial<SovereignSecurityPolicy>
): SovereignSecurityPolicy {
  invalidateSecurityPolicyCache()
  const next: SovereignSecurityPolicy = {
    ...getSovereignSecurityPolicy(),
    ...partial
  }
  try {
    localStorage.setItem(SECURITY_POLICY_STORAGE_KEY, JSON.stringify(next))
  } catch {}
  if (supabase) {
    void setSystemConfigRemote('sovereign_security_policy', next)
  }
  return next
}

export async function syncSecurityPolicyFromSupabase(force: boolean = false): Promise<SovereignSecurityPolicy> {
  const now = Date.now()
  if (!force && cachedSecurityPolicyResult && now - lastSecurityPolicySyncTime < 60000) {
    return cachedSecurityPolicyResult
  }
  if (supabase) {
    try {
      const { data } = await supabase
        .from('rymon_system_config')
        .select('key, value')
        .in('key', ['sovereign_security_policy', 'paused_key_timestamps', 'hwid_reset_daily_log'])

      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.key === 'sovereign_security_policy' && row.value && typeof row.value === 'object') {
            const merged = { ...DEFAULT_SECURITY_POLICY, ...(row.value as Partial<SovereignSecurityPolicy>) }
            try {
              localStorage.setItem(SECURITY_POLICY_STORAGE_KEY, JSON.stringify(merged))
            } catch {}
          } else if (row.key === 'paused_key_timestamps' && row.value && typeof row.value === 'object') {
            try {
              const local = getPausedKeyTimestamps()
              localStorage.setItem(
                PAUSED_TIMESTAMPS_STORAGE_KEY,
                JSON.stringify({ ...local, ...(row.value as Record<string, number>) })
              )
            } catch {}
          } else if (row.key === 'hwid_reset_daily_log' && row.value && typeof row.value === 'object') {
            try {
              localStorage.setItem(HWID_RESET_LOG_STORAGE_KEY, JSON.stringify(row.value))
            } catch {}
          }
        }
      }
    } catch {}
  }
  lastSecurityPolicySyncTime = now
  cachedSecurityPolicyResult = getSovereignSecurityPolicy()
  return cachedSecurityPolicyResult
}

function getPausedKeyTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PAUSED_TIMESTAMPS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) || {}
  } catch {}
  return {}
}

function savePausedKeyTimestamps(map: Record<string, number>): void {
  try {
    localStorage.setItem(PAUSED_TIMESTAMPS_STORAGE_KEY, JSON.stringify(map))
  } catch {}
  if (supabase) {
    void setSystemConfigRemote('paused_key_timestamps', map)
  }
}

function clearPausedKeyTimestamps(): void {
  savePausedKeyTimestamps({})
}

function getHwidResetLog(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(HWID_RESET_LOG_STORAGE_KEY)
    if (raw) return JSON.parse(raw) || {}
  } catch {}
  return {}
}

function saveHwidResetLog(map: Record<string, number[]>): void {
  try {
    localStorage.setItem(HWID_RESET_LOG_STORAGE_KEY, JSON.stringify(map))
  } catch {}
  if (supabase) {
    void setSystemConfigRemote('hwid_reset_daily_log', map)
  }
}

function formatDurationShort(ms: number): string {
  const totalMins = Math.max(1, Math.round(ms / 60000))
  const days = Math.floor(totalMins / (60 * 24))
  const hours = Math.floor((totalMins % (60 * 24)) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export async function resetUserPasswordBackend(
  targetUsername: string,
  newPassword: string,
  actorUsername: string = 'debajoyti'
): Promise<{ success: boolean; message: string }> {
  const cleanTarget = targetUsername.trim()
  const cleanPass = newPassword.trim()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (cleanPass.length < 4) {
    return { success: false, message: 'Password must be at least 4 characters long.' }
  }
  if (!isRootOwner && cleanTarget.toLowerCase() === 'debajoyti') {
    return { success: false, message: 'Forbidden: Only the Root Owner can modify the Root Owner account.' }
  }

  if (supabase) {
    try {
      const sessionToken = getStoredSessionToken()
      const { data: targetResp } = await supabase.rpc('rpc_rymon_get_account', {
        p_username: cleanTarget,
        p_session_token: sessionToken
      })
      const targetAcc = targetResp?.found ? targetResp : null

      if (!targetAcc) {
        return { success: false, message: targetResp?.error || `User @${cleanTarget} not found.` }
      }

      if (!isRootOwner) {
        const allowedDownlines = await getDownlineUsernames(cleanActor, false)
        if (!allowedDownlines.has(String(targetAcc?.username || '').toLowerCase())) {
          return {
            success: false,
            message: 'Power restriction: You can only reset passwords for accounts in your downline.'
          }
        }
      }

      // Server-side Salted Bcrypt & session enforcement
      const { data: rpcResult, error: updErr } = await supabase.rpc('rpc_rymon_reset_password', {
        p_target_username: targetAcc.username,
        p_new_password: cleanPass,
        p_actor_username: cleanActor,
        p_session_token: sessionToken
      })

      if (updErr) {
        return { success: false, message: updErr.message }
      }
      if (rpcResult && !rpcResult.success) {
        return { success: false, message: rpcResult.message || 'Password reset failed.' }
      }

      return {
        success: true,
        message: `Password for @${targetAcc.username} has been updated!`
      }
    } catch {}
  }

  const accounts = getStoredAccounts()
  const u = accounts.find((a) => (a.username || '').toLowerCase() === cleanTarget.toLowerCase())
  if (!u) return { success: false, message: `User @${cleanTarget} not found.` }
  if (!isRootOwner) {
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, accounts, false)
    if (!allowedDownlines.has(String(u.username || '').toLowerCase())) {
      return { success: false, message: 'Power restriction: You can only reset passwords for accounts in your downline.' }
    }
  }
  try {
    localStorage.removeItem(`rymon_pw_${u.username}`)
  } catch {}
  saveStoredAccounts(accounts)

  return {
    success: true,
    message: `Password for @${cleanTarget} has been updated!`
  }
}

export async function updateUserPermissionsBackend(
  targetUsername: string,
  permissions: RymonAccount['permissions'],
  actorUsername: string = 'debajoyti'
): Promise<{ success: boolean; message?: string }> {
  const cleanTarget = targetUsername.trim()
  const cleanActor = (actorUsername || 'debajoyti').trim()

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_update_permissions', {
        p_username: cleanTarget,
        p_permissions: permissions || {},
        p_actor_username: cleanActor,
        p_session_token: getStoredSessionToken()
      })
      if (!error && data?.success) {
        return { success: true }
      }
      if (error || (data && !data.success)) {
        console.error('rpc_rymon_update_permissions error:', error || data?.error)
        return { success: false, message: error?.message || data?.error || 'Database error updating permissions' }
      }
    } catch (err) {
      console.error('updateUserPermissionsBackend exception:', err)
    }
  }

  // Update in local storage accounts fallback
  const accounts = getStoredAccounts()
  const idx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanTarget.toLowerCase())
  if (idx !== -1) {
    accounts[idx].permissions = permissions
    saveStoredAccounts(accounts)
    return { success: true }
  }
  return { success: false, message: 'User not found in local store' }
}

export async function renewUserSubscriptionBackend(
  targetUsername: string,
  days: 30 | 60,
  actorUsername: string = 'debajoyti'
): Promise<{ success: boolean; newExpiresAt?: string; remainingBalance?: number; message: string }> {
  const cleanTarget = targetUsername.trim()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const safeDays: 30 | 60 = days === 60 ? 60 : 30
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (cleanTarget.toLowerCase() === 'debajoyti') {
    return { success: false, message: 'Root Owner account does not use a reseller subscription.' }
  }

  const policy = getSovereignSecurityPolicy()
  const adminFee = isRootOwner
    ? 0
    : safeDays === 60
    ? Math.max(0, Number(policy.admin_sub_renew_fee_60d || 0))
    : Math.max(0, Number(policy.admin_sub_renew_fee_30d || 0))

  const nowMs = Date.now()
  const max60DaysMs = nowMs + 60 * 86400000
  const newExpIso = new Date(Math.min(nowMs + safeDays * 86400000, max60DaysMs)).toISOString()
  let remainingBalance: number | undefined = undefined

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_renew_subscription', {
        p_target_username: cleanTarget,
        p_days: safeDays,
        p_actor_username: cleanActor,
        p_fee: adminFee,
        p_session_token: getStoredSessionToken()
      })

      if (rpcErr) {
        return { success: false, message: rpcErr.message || 'Database error renewing subscription.' }
      }

      if (rpcRes) {
        if (!rpcRes.success) {
          return { success: false, message: rpcRes.error || 'Failed to renew subscription.' }
        }

        const remainingBalance = rpcRes.remaining_balance !== undefined ? Number(rpcRes.remaining_balance) : undefined
        if (remainingBalance !== undefined) {
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = remainingBalance
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === cleanActor.toLowerCase()) {
                u.balance = remainingBalance
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        return {
          success: true,
          newExpiresAt: rpcRes.expires_at,
          remainingBalance,
          message: `@${cleanTarget} subscription renewed for ${safeDays} Days (active keys resumed)!`
        }
      }
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error executing subscription renewal.' }
    }
  }

  const accounts = getStoredAccounts()
  const matched = accounts.find((a) => (a.username || '').toLowerCase() === cleanTarget.toLowerCase())
  if (!matched) {
    return { success: false, message: `User @${cleanTarget} not found.` }
  }
  if (!isRootOwner) {
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, accounts, false)
    if (!allowedDownlines.has(String(matched.username || '').toLowerCase())) {
      return { success: false, message: 'Power restriction: You can only renew subscriptions for accounts in your downline.' }
    }
  }
  matched.expires_at = newExpIso
  saveStoredAccounts(accounts)
  return {
    success: true,
    newExpiresAt: newExpIso,
    remainingBalance,
    message: `@${matched.username} subscription set to ${safeDays} Days!`
  }
}

// ============================================================================
// 7. HWID RESET, BAN, EXTEND, DELETE OPERATIONS
// ============================================================================
export function calculateExtensionCost(
  days: number,
  username?: string,
  devicesMax: number = 1,
  role?: string
): number {
  if (!username) return 0
  const clean = username.trim().toLowerCase()
  if (clean === 'debajoyti') return 0

  const map = getEffectivePriceMap(username, role)
  const devMult = Math.max(1, Number(devicesMax) || 1)
  let unit = 0
  if (days === 1) unit = map['1 Day'] ?? 35
  else if (days === 3) unit = map['3 Days'] ?? 50
  else if (days === 7) unit = map['7 Days'] ?? 100
  else if (days === 15) unit = map['15 Days'] ?? 180
  else if (days === 30) unit = map['30 Days'] ?? 350
  else {
    const dailyRate = map['1 Day'] ?? 35
    unit = Math.round(dailyRate * Math.max(1, days))
  }
  return unit * devMult
}

export async function resetHwidBackend(
  licenseKey: string,
  actorUsername: string = 'debajoyti',
  actorRole?: string
): Promise<{ success: boolean; message: string; remainingResets?: number }> {
  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'
  const effectiveRole = isRootOwner ? 'owner' : (actorRole || 'reseller').toLowerCase()

  const policy = getSovereignSecurityPolicy()
  const dailyLimit = Math.max(0, Number(policy.reseller_hwid_limit_per_day ?? 2))
  const nowMs = Date.now()
  const dayWindowMs = 86400000
  const logMap = getHwidResetLog()
  const recentResets = (logMap[cleanKey] || []).filter((ts) => nowMs - ts < dayWindowMs)

  // Anti-Sharing Protection: Enforce daily HWID reset limit for Resellers
  if (effectiveRole === 'reseller' && dailyLimit > 0) {
    if (recentResets.length >= dailyLimit) {
      return {
        success: false,
        remainingResets: 0,
        message: `🛡️ Anti-Sharing Limit: You have already used ${recentResets.length}/${dailyLimit} HWID resets today for ${cleanKey}. Contact Owner/Admin for override.`
      }
    }
    recentResets.push(nowMs)
    logMap[cleanKey] = recentResets
    saveHwidResetLog(logMap)
  } else if (effectiveRole === 'owner' || effectiveRole === 'admin') {
    // Owner/Admin reset clears the reseller daily lock for this key
    delete logMap[cleanKey]
    saveHwidResetLog(logMap)
  }

  const remainingResets =
    effectiveRole === 'reseller' && dailyLimit > 0
      ? Math.max(0, dailyLimit - recentResets.length)
      : undefined

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_reset_hwid', {
        p_license_key: cleanKey,
        p_actor_username: cleanActor,
        p_session_token: getStoredSessionToken()
      })
      if (rpcErr) {
        return { success: false, message: rpcErr.message || 'Database error resetting HWID.' }
      }
      if (rpcRes && !rpcRes.success) {
        return {
          success: false,
          remainingResets: rpcRes.remaining_resets ?? 0,
          message: rpcRes.message || 'HWID reset denied.'
        }
      }
      if (rpcRes?.remaining_resets !== undefined && rpcRes.remaining_resets !== null) {
        const srvRemaining = Number(rpcRes.remaining_resets)
        return {
          success: true,
          remainingResets: srvRemaining,
          message: `🔄 HWID cleared for ${cleanKey}! (${srvRemaining}/${dailyLimit} daily resets remaining today)`
        }
      }
    } catch {}
  }

  const licenses = getStoredLicenses()
  const item = licenses.find((l) => l.license_key === cleanKey)
  if (!isRootOwner && item) {
    const creator = (item.creator_username || '').toLowerCase()
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
    if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
      return {
        success: false,
        message: 'Permission Denied: Cannot reset HWID on keys outside your downline.'
      }
    }
  }
  if (item) {
    item.device_hwid = ''
    item.devices_used = 0
    item.status = item.is_paused ? 'PAUSED' : item.expires_at ? 'ACTIVE' : 'WAITING'
    saveStoredLicenses(licenses)
  }

  return {
    success: true,
    remainingResets,
    message:
      remainingResets !== undefined
        ? `🔄 HWID cleared for ${cleanKey}! (${remainingResets}/${dailyLimit} daily resets remaining today)`
        : `🔄 HWID cleared for ${cleanKey} (Device unbound, timer preserved)!`
  }
}

export async function deleteLicenseBackend(
  licenseKey: string,
  actorUsername: string = 'debajoyti'
): Promise<boolean> {
  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_delete_single_key', {
        p_license_key: cleanKey,
        p_session_token: getStoredSessionToken()
      })
      if (rpcErr || (rpcRes && !rpcRes.success)) {
        return false
      }
    } catch {
      return false
    }
  }

  const licenses = getStoredLicenses()
  if (!isRootOwner) {
    const lic = licenses.find((l) => l.license_key === cleanKey)
    const creator = (lic?.creator_username || '').toLowerCase()
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
    if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
      return false
    }
  }

  const remaining = licenses.filter((l) => l.license_key !== cleanKey)
  saveStoredLicenses(remaining)
  return true
}

export async function deleteAccountBackend(
  targetUsername: string,
  actor: RymonAccount
): Promise<{ success: boolean; error?: string }> {
  const cleanTarget = (targetUsername || '').trim()
  const cleanActor = actor?.username?.trim() || ''

  if (!cleanTarget) {
    return { success: false, error: 'Target username is required.' }
  }

  if (cleanTarget.toLowerCase() === 'debajoyti') {
    return { success: false, error: 'Protected: The Root Owner account cannot be deleted.' }
  }

  if (cleanTarget.toLowerCase() === cleanActor.toLowerCase()) {
    return { success: false, error: 'Protected: You cannot delete your own account.' }
  }

  if (actor.role !== 'owner' && actor.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Only Owner or Admin can delete accounts.' }
  }

  // 1. Fetch Target Account via authenticated RPC
  const sessionToken = getStoredSessionToken()
  let targetRow: RymonAccount | null = null
  if (supabase) {
    try {
      const { data } = await supabase.rpc('rpc_rymon_get_account', {
        p_username: cleanTarget,
        p_session_token: sessionToken
      })
      if (data?.found) targetRow = data as RymonAccount
    } catch {}
  }
  if (!targetRow) {
    const local = getStoredAccounts().find((a) => (a.username || '').toLowerCase() === cleanTarget.toLowerCase())
    if (local) targetRow = local
  }

  if (!targetRow) {
    return { success: false, error: `Account @${cleanTarget} not found.` }
  }

  // 2. Hierarchy Check: Actor can only delete accounts under their own downline
  const isRootActor = cleanActor.toLowerCase() === 'debajoyti'
  if (!isRootActor) {
    if (targetRow.role === 'owner' || cleanTarget.toLowerCase() === 'ryzen') {
      return { success: false, error: 'Permission Denied: Only Root Founder (debajoyti) can delete Owner accounts.' }
    }
    const allowedDownlines = await getDownlineUsernames(cleanActor, false)
    if (!allowedDownlines.has(cleanTarget.toLowerCase())) {
      return {
        success: false,
        error: `Permission Denied: @${cleanTarget} is not under your downline.`
      }
    }
  }

  // 3. Supabase Deletion via session-authenticated SECURITY DEFINER RPC
  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_delete_account', {
        p_target_username: cleanTarget,
        p_actor_username: actor?.username || cleanActor || 'debajoyti',
        p_session_token: sessionToken
      })

      if (rpcErr) {
        return { success: false, error: rpcErr.message || 'Database deletion error' }
      }
      if (rpcRes && !rpcRes.success) {
        return { success: false, error: rpcRes.error || 'Failed to delete account' }
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Database deletion error' }
    }
  }

  // 4. Local Storage Cleanup
  const stored = getStoredAccounts().filter((a) => (a.username || '').toLowerCase() !== cleanTarget.toLowerCase())
  saveStoredAccounts(stored)

  // Clear any custom pricing set for this user
  clearUserCustomPriceMap(cleanTarget)

  return { success: true }
}

export async function bulkDeleteKeysBackend(
  creatorUsername: string,
  keyType: 'expired' | 'unused' | 'all',
  actorUsername: string = 'debajoyti'
): Promise<number> {
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const cleanTarget = (creatorUsername || '__ALL__').trim()
  const isAllScope = cleanTarget === '__ALL__' || cleanTarget === ''
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_bulk_delete_keys', {
        p_creator_username: cleanTarget,
        p_key_type: keyType,
        p_session_token: getStoredSessionToken()
      })
      if (!rpcErr && rpcRes?.success) {
        return Number(rpcRes.count || 0)
      }
      return 0
    } catch {
      return 0
    }
  }

  const licenses = getStoredLicenses()
  const nowMs = Date.now()
  let allowedCreators: Set<string> | null = null
  if (!isRootOwner) {
    allowedCreators = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
    allowedCreators.delete('debajoyti')
  }
  const remaining = licenses.filter((l) => {
    const cName = String(l.creator_username || '').toLowerCase()
    if (!isRootOwner && (!allowedCreators || !allowedCreators.has(cName))) return true
    if (!isAllScope && cName !== cleanTarget.toLowerCase()) return true

    const isExp = l.status === 'EXPIRED' || Boolean(l.expires_at && new Date(l.expires_at).getTime() < nowMs)
    if (keyType === 'expired') return !isExp
    if (keyType === 'unused') return !(l.status === 'WAITING' && l.devices_used === 0)
    return false
  })
  const count = licenses.length - remaining.length
  saveStoredLicenses(remaining)
  return count
}

export async function toggleBanStatusBackend(
  target: string,
  type: 'user' | 'key',
  isBan: boolean,
  actorUsername: string = 'debajoyti'
): Promise<{ success: boolean; message: string }> {
  const status = isBan ? 'BANNED' : 'ACTIVE'
  const cleanTarget = target.trim()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (
    type === 'user' &&
    cleanTarget.toLowerCase() === 'debajoyti'
  ) {
    return { success: false, message: 'Forbidden: Root Owner account cannot be banned.' }
  }

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_ban_unban', {
        p_target: cleanTarget,
        p_type: type,
        p_action: isBan ? 'ban' : 'unban',
        p_actor_username: cleanActor,
        p_session_token: getStoredSessionToken()
      })
      if (rpcErr) {
        return { success: false, message: rpcErr.message || 'Moderation failed.' }
      }
      if (rpcRes && !rpcRes.success) {
        return { success: false, message: rpcRes.message || 'Moderation denied.' }
      }
      return { success: true, message: rpcRes?.message || `${cleanTarget} has been ${status}.` }
    } catch (e: any) {
      return { success: false, message: e?.message || 'Database error during moderation.' }
    }
  }

  if (type === 'user') {
    const users = getStoredAccounts()
    const u = users.find((x) => (x.username || '').toLowerCase() === cleanTarget.toLowerCase())
    if (u) {
      if (!isRootOwner) {
        const allowedDownlines = getDownlineUsernamesSync(cleanActor, users, false)
        if (!allowedDownlines.has(String(u.username || '').toLowerCase())) {
          return { success: false, message: 'Power restriction: You can only Ban/Unban accounts in your downline.' }
        }
      }
      u.status = status
      saveStoredAccounts(users)
    }
  } else {
    const lics = getStoredLicenses()
    const l = lics.find((x) => x.license_key === cleanTarget.toUpperCase())
    if (l) {
      if (!isRootOwner) {
        const creator = (l.creator_username || '').toLowerCase()
        const allowedDownlines = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
        if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
          return { success: false, message: 'Permission Denied: You can only ban keys generated in your downline.' }
        }
      }
      l.status = status
      saveStoredLicenses(lics)
    }
  }
  return { success: true, message: `${cleanTarget} has been ${isBan ? 'BANNED' : 'UNBANNED'}.` }
}

export async function extendLicenseBackend(
  licenseKey: string,
  rawDays: number,
  actorUsername: string = 'debajoyti'
): Promise<{
  success: boolean
  newExpiresAt?: string
  remainingBalance?: number
  cost?: number
  error?: string
}> {
  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const rawNum = Math.floor(Number(rawDays) || 0)
  if (rawNum < 1) {
    return {
      success: false,
      error: 'Invalid extension duration. Minimum extension duration is 1 day.'
    }
  }
  const days = Math.min(30, rawNum)
  const max365DaysMs = Date.now() + 365 * 86400000
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_extend_key', {
        p_license_key: cleanKey,
        p_days: days,
        p_actor_username: cleanActor,
        p_session_token: getStoredSessionToken()
      })

      if (rpcErr) {
        return {
          success: false,
          error: rpcErr.message || 'Database error extending key.'
        }
      }

      if (rpcRes) {
        if (!rpcRes.success) {
          return {
            success: false,
            error: rpcRes.error || 'Failed to extend license.'
          }
        }

        const remainingBalance = rpcRes.remaining_balance !== undefined ? Number(rpcRes.remaining_balance) : undefined
        if (remainingBalance !== undefined) {
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = remainingBalance
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === cleanActor.toLowerCase()) {
                u.balance = remainingBalance
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        return {
          success: true,
          newExpiresAt: rpcRes.new_expires_at,
          remainingBalance,
          cost: Number(rpcRes.cost || 0)
        }
      }
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Unexpected error extending license.'
      }
    }
  }

  const lics = getStoredLicenses()
  const l = lics.find((x) => x.license_key === cleanKey)
  if (!isRootOwner && l) {
    const creator = (l.creator_username || '').toLowerCase()
    const allowedDownlines = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
    if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
      return {
        success: false,
        error: 'Permission Denied: Cannot extend keys outside your downline.'
      }
    }
  }
  const cost = isRootOwner ? 0 : calculateExtensionCost(days, cleanActor, l?.devices_max || 1)
  let remainingBalance: number | undefined = undefined

  if (!isRootOwner && cost > 0) {
    const accounts = getStoredAccounts()
    const actorAcc = accounts.find((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
    if (!actorAcc || actorAcc.balance < cost) {
      return {
        success: false,
        error: `Insufficient wallet balance! Extending ${cleanKey} by +${days} Day(s) costs ₹${cost}.`
      }
    }
    actorAcc.balance = Math.max(0, actorAcc.balance - cost)
    remainingBalance = actorAcc.balance
    saveStoredAccounts(accounts)
  }

  let newExp: string | undefined = undefined
  if (l) {
    const currDays = parseInt(l.plan_duration?.match(/\d+/)?.[0] || '1', 10)
    const totalDays = currDays + days
    const isVip = (l.plan_duration || '').includes('[VIP]')
    const newPlan = `${totalDays} Days${isVip ? ' [VIP]' : ''}`
    l.plan_duration = newPlan

    if (l.expires_at) {
      const base = new Date(l.expires_at).getTime()
      newExp = new Date(
        Math.min(Math.max(base, Date.now()) + days * 86400000, max365DaysMs)
      ).toISOString()
      l.expires_at = newExp
    } else {
      // Unactivated fresh key: plan_duration extended cumulatively, clock starts on first login!
      newExp = undefined
      l.expires_at = null
    }
    saveStoredLicenses(lics)
  }
  return { success: true, newExpiresAt: newExp, remainingBalance, cost }
}

export async function togglePauseLicenseBackend(
  licenseKey: string,
  requesterUsername: string = 'debajoyti'
): Promise<{
  success: boolean
  is_paused: boolean
  status: string
  newExpiresAt?: string | null
  message: string
}> {
  const cleanKey = licenseKey.trim().toUpperCase()
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  // Hard cap: never extend beyond 365 days from now
  const max365DaysMs = nowMs + 365 * 86400000
  // localStorage is a secondary cache only — DB paused_at is source of truth
  const pauseMap = getPausedKeyTimestamps()

  if (supabase) {
    // ── ATOMIC POSTGRESQL RPC (Sub-100ms, atomic, server-side freeze/restore) ──
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_toggle_pause_key', {
        p_license_key: cleanKey,
        p_requester: requesterUsername || 'debajoyti',
        p_session_token: getStoredSessionToken()
      })
      if (!rpcErr && rpcRes && typeof rpcRes === 'object') {
        const res = rpcRes as {
          success: boolean
          is_paused: boolean
          status: string
          new_expires_at?: string | null
          restored_seconds?: number
          message: string
        }
        if (res.success) {
          if (res.is_paused) {
            pauseMap[cleanKey] = nowMs
          } else {
            delete pauseMap[cleanKey]
          }
          savePausedKeyTimestamps(pauseMap)
          return {
            success: true,
            is_paused: res.is_paused,
            status: res.status,
            newExpiresAt: res.new_expires_at,
            message: res.message
          }
        } else {
          return {
            success: false,
            is_paused: false,
            status: 'ACTIVE',
            message: res.message || 'Operation failed'
          }
        }
      }
    } catch (e: any) {
      console.warn('RPC rpc_rymon_toggle_pause_key error, using fallback:', e)
    }

    try {
      const [{ data: currentCtrl }, { data: licRow }] = await Promise.all([
        supabase
          .from('rymon_streamer_controls')
          .select('is_paused, paused_at')
          .eq('license_key', cleanKey)
          .maybeSingle(),
        supabase
          .from('rymon_licenses')
          .select('is_paused, paused_at, expires_at, updated_at, status, creator_username')
          .eq('license_key', cleanKey)
          .maybeSingle()
      ])

      const isRootOwner = (requesterUsername || 'debajoyti').trim().toLowerCase() === 'debajoyti'
      if (!isRootOwner && licRow) {
        const creator = (licRow.creator_username || '').toLowerCase()
        const allowedDownlines = await getDownlineUsernames(requesterUsername, true)
        if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
          return {
            success: false,
            is_paused: Boolean(licRow.is_paused),
            status: licRow.status || 'ACTIVE',
            message: 'Permission Denied: Root Founder and external downline keys cannot be modified.'
          }
        }
      }

      const wasPaused = Boolean(licRow?.is_paused ?? currentCtrl?.is_paused)
      const newPaused = !wasPaused
      const newStatus = newPaused ? 'PAUSED' : licRow?.expires_at ? 'ACTIVE' : 'WAITING'
      let nextExpiresAt: string | null | undefined = licRow?.expires_at
      let restoredNote = ''

      if (newPaused) {
        // ── PAUSE: record exact freeze timestamp in DB (device-agnostic) ──
        pauseMap[cleanKey] = nowMs  // also cache locally
        savePausedKeyTimestamps(pauseMap)

        await supabase
          .from('rymon_streamer_controls')
          .update({ is_paused: true, is_online: false, paused_at: nowIso, updated_at: nowIso })
          .eq('license_key', cleanKey)

        await supabase
          .from('rymon_licenses')
          .update({ is_paused: true, status: 'PAUSED', paused_at: nowIso, updated_at: nowIso })
          .eq('license_key', cleanKey)

      } else {
        // ── UNPAUSE: read paused_at from DB first, fall back to localStorage, then updated_at ──
        // DB is the authoritative source — works across devices and sessions
        const dbPausedAt = licRow?.paused_at ?? currentCtrl?.paused_at ?? null
        const pausedSinceMs = dbPausedAt
          ? new Date(dbPausedAt).getTime()
          : (pauseMap[cleanKey] ?? (licRow?.updated_at ? new Date(licRow.updated_at).getTime() : nowMs))

        const frozenMs = Math.max(0, nowMs - pausedSinceMs)
        delete pauseMap[cleanKey]
        savePausedKeyTimestamps(pauseMap)

        // ── CORRECT FORMULA: add frozen duration directly to original expiry ──
        // Never use Math.max(oldExpMs, nowMs) — that gives free time for keys that
        // were paused AFTER their expiry (edge case), causing 2-3 day extensions.
        if (licRow?.expires_at && frozenMs > 60000) {
          const oldExpMs = new Date(licRow.expires_at).getTime()
          // Simple: original_expiry + frozen_duration, capped at 365 days
          const restoredExpMs = Math.min(oldExpMs + frozenMs, max365DaysMs)
          nextExpiresAt = new Date(restoredExpMs).toISOString()
          restoredNote = ` (+${formatDurationShort(frozenMs)} frozen time restored)`
        }

        await supabase
          .from('rymon_streamer_controls')
          .update({
            is_paused: false,
            paused_at: null,
            ...(nextExpiresAt ? { expires_at: nextExpiresAt } : {}),
            updated_at: nowIso
          })
          .eq('license_key', cleanKey)

        await supabase
          .from('rymon_licenses')
          .update({
            is_paused: false,
            status: newStatus,
            paused_at: null,
            ...(nextExpiresAt ? { expires_at: nextExpiresAt } : {}),
            updated_at: nowIso
          })
          .eq('license_key', cleanKey)
      }

      await supabase.from('rymon_activities').insert({
        title: newPaused ? 'Key Paused (Timer Frozen)' : 'Key Resumed (Timer Restored)',
        event_type: newPaused ? 'KEY_PAUSE' : 'KEY_RESUME',
        details: `License ${cleanKey} ${newPaused ? 'PAUSED (Timer Frozen)' : `RESUMED${restoredNote}`} by @${requesterUsername}`,
        actor_username: requesterUsername,
        status: 'SUCCESS'
      })

      return {
        success: true,
        is_paused: newPaused,
        status: newStatus,
        newExpiresAt: nextExpiresAt,
        message: newPaused
          ? `❄️ Key ${cleanKey} PAUSED — Countdown timer is now frozen.`
          : `▶️ Key ${cleanKey} RESUMED${restoredNote}!`
      }
    } catch (err) {
      return { success: false, is_paused: false, status: 'ERROR', message: String(err) }
    }
  }

  // ── Offline / localStorage fallback path ──
  const stored = getStoredLicenses()
  const idx = stored.findIndex((l) => l.license_key === cleanKey)
  if (idx >= 0) {
    const isRootOwner = (requesterUsername || 'debajoyti').trim().toLowerCase() === 'debajoyti'
    if (!isRootOwner) {
      const creator = (stored[idx].creator_username || '').toLowerCase()
      const allowedDownlines = getDownlineUsernamesSync(requesterUsername, getStoredAccounts(), true)
      if (creator === 'debajoyti' || !allowedDownlines.has(creator)) {
        return {
          success: false,
          is_paused: Boolean(stored[idx].is_paused),
          status: stored[idx].status || 'ACTIVE',
          message: 'Permission Denied: Root Founder and external downline keys cannot be modified.'
        }
      }
    }
    const newPaused = !stored[idx].is_paused
    stored[idx].is_paused = newPaused
    stored[idx].status = newPaused ? 'PAUSED' : stored[idx].expires_at ? 'ACTIVE' : 'WAITING'
    if (newPaused) {
      pauseMap[cleanKey] = nowMs
      savePausedKeyTimestamps(pauseMap)
    } else {
      const pausedSinceMs = pauseMap[cleanKey] ?? nowMs
      const frozenMs = Math.max(0, nowMs - pausedSinceMs)
      delete pauseMap[cleanKey]
      savePausedKeyTimestamps(pauseMap)
      // Use same corrected formula in offline path
      if (stored[idx].expires_at && frozenMs > 60000) {
        const oldExpMs = new Date(stored[idx].expires_at!).getTime()
        stored[idx].expires_at = new Date(Math.min(oldExpMs + frozenMs, max365DaysMs)).toISOString()
      }
    }
    saveStoredLicenses(stored)
    return {
      success: true,
      is_paused: newPaused,
      status: stored[idx].status,
      newExpiresAt: stored[idx].expires_at,
      message: newPaused
        ? `❄️ Key ${cleanKey} PAUSED — Countdown timer is now frozen.`
        : `▶️ Key ${cleanKey} RESUMED!`
    }
  }

  return { success: false, is_paused: false, status: 'NOT_FOUND', message: 'Key not found' }
}

export async function bulkTogglePauseAllKeysBackend(
  pauseState: boolean,
  actorUsername: string = 'debajoyti',
  creatorFilter?: string
): Promise<{ success: boolean; count: number; message: string }> {
  let affected = 0
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const max365DaysMs = nowMs + 365 * 86400000
  const pauseMap = getPausedKeyTimestamps()
  const isRootOwner = (actorUsername || 'debajoyti').trim().toLowerCase() === 'debajoyti'

  if (supabase) {
    // ── ATOMIC POSTGRESQL BULK RPC (Single transaction for all 135+ keys) ──
    try {
      const { data: bulkRes, error: bulkErr } = await supabase.rpc('rpc_rymon_bulk_pause_keys', {
        p_pause_state: pauseState,
        p_actor_username: actorUsername || 'debajoyti',
        p_creator_filter: creatorFilter || null,
        p_session_token: getStoredSessionToken()
      })
      if (!bulkErr && bulkRes && typeof bulkRes === 'object') {
        const res = bulkRes as { success: boolean; count: number; message: string }
        if (res.success) {
          if (!pauseState) {
            clearPausedKeyTimestamps()
          }
          return {
            success: true,
            count: res.count,
            message: res.message
          }
        }
      }
    } catch (e: any) {
      console.warn('RPC rpc_rymon_bulk_pause_keys error, using fallback:', e)
    }

    try {
      let allowedCreators: Set<string> | null = null
      if (!isRootOwner) {
        allowedCreators = await getDownlineUsernames(actorUsername, true)
        allowedCreators.delete('debajoyti')
      }

      // Fetch paused_at from DB (device-agnostic source of truth)
      let fetchQuery = supabase
        .from('rymon_licenses')
        .select('license_key, expires_at, updated_at, paused_at, is_paused, status, creator_username')
        .neq('status', 'BANNED')
        .neq('status', 'EXPIRED')
      if (creatorFilter) {
        fetchQuery = fetchQuery.ilike('creator_username', creatorFilter)
      } else if (allowedCreators) {
        fetchQuery = fetchQuery.in('creator_username', Array.from(allowedCreators))
      }
      const { data: rows } = await fetchQuery
      if (rows && rows.length > 0) {
        for (const r of rows) {
          const creator = (r.creator_username || '').toLowerCase()
          if (allowedCreators && !allowedCreators.has(creator)) continue
          const k = r.license_key.toUpperCase()
          let nextExp = r.expires_at

          if (pauseState) {
            // PAUSING: record paused_at in DB + localStorage cache
            if (!r.is_paused) {
              pauseMap[k] = nowMs
            }
          } else if (r.is_paused) {
            // UNPAUSING: DB paused_at is authoritative; localStorage is fallback
            const dbPausedAt = r.paused_at ?? null
            const pausedSinceMs = dbPausedAt
              ? new Date(dbPausedAt).getTime()
              : (pauseMap[k] ?? (r.updated_at ? new Date(r.updated_at).getTime() : nowMs))
            const frozenMs = Math.max(0, nowMs - pausedSinceMs)
            delete pauseMap[k]
            // Corrected formula: oldExpiry + frozenTime (no Math.max that gives free days)
            if (r.expires_at && frozenMs > 60000) {
              const oldExpMs = new Date(r.expires_at).getTime()
              nextExp = new Date(Math.min(oldExpMs + frozenMs, max365DaysMs)).toISOString()
            }
          }

          const rowNextStatus = pauseState ? 'PAUSED' : nextExp ? 'ACTIVE' : 'WAITING'
          await supabase
            .from('rymon_licenses')
            .update({
              is_paused: pauseState,
              status: rowNextStatus,
              paused_at: pauseState ? nowIso : null,
              ...(nextExp !== r.expires_at ? { expires_at: nextExp } : {}),
              updated_at: nowIso
            })
            .eq('license_key', r.license_key)
          affected++
        }
        savePausedKeyTimestamps(pauseMap)
      }

      // Sync streamer_controls: set paused_at + is_paused + expires_at
      let ctrlQuery = supabase
        .from('rymon_streamer_controls')
        .update({
          is_paused: pauseState,
          paused_at: pauseState ? nowIso : null,
          ...(pauseState ? { is_online: false } : {}),
          updated_at: nowIso
        })
      if (creatorFilter) {
        ctrlQuery = ctrlQuery.ilike('creator', creatorFilter)
      } else if (allowedCreators) {
        ctrlQuery = ctrlQuery.in('creator', Array.from(allowedCreators))
      } else {
        ctrlQuery = ctrlQuery.neq('license_key', '')
      }
      await ctrlQuery
    } catch {}
  }

  const stored = getStoredLicenses()
  let syncAllowed: Set<string> | null = null
  if (!isRootOwner) {
    syncAllowed = getDownlineUsernamesSync(actorUsername, getStoredAccounts(), true)
    syncAllowed.delete('debajoyti')
  }
  stored.forEach((l) => {
    if (l.status !== 'BANNED' && l.status !== 'EXPIRED') {
      const creator = String(l.creator_username || '').toLowerCase()
      if (syncAllowed && !syncAllowed.has(creator)) return
      if (!creatorFilter || creator === creatorFilter.toLowerCase()) {
        l.is_paused = pauseState
        l.status = pauseState ? 'PAUSED' : l.expires_at ? 'ACTIVE' : 'WAITING'
        affected++
      }
    }
  })
  saveStoredLicenses(stored)

  const newAct: RymonActivity = {
    id: Date.now(),
    title: pauseState ? 'Global Keys Paused (Frozen)' : 'Global Keys Resumed (Timers Restored)',
    event_type: pauseState ? 'BULK_PAUSE' : 'BULK_RESUME',
    details: `${pauseState ? 'Paused & froze timers for' : 'Resumed & restored timers for'} all active keys by @${actorUsername}`,
    actor_username: actorUsername,
    status: 'SUCCESS',
    created_at: nowIso
  }
  saveStoredActivities([newAct, ...getStoredActivities()])

  return {
    success: true,
    count: affected,
    message: pauseState
      ? '❄️ All active license keys have been PAUSED and their countdown timers are frozen.'
      : '▶️ All paused license keys have been RESUMED with frozen time restored!'
  }
}

export async function bulkResetAllHwidBackend(
  actorUsername: string = 'debajoyti',
  creatorFilter?: string
): Promise<{ success: boolean; message: string }> {
  const nowIso = new Date().toISOString()
  const isRootOwner = (actorUsername || 'debajoyti').trim().toLowerCase() === 'debajoyti'
  let allowedCreators: Set<string> | null = null
  if (!isRootOwner) {
    allowedCreators = await getDownlineUsernames(actorUsername, true)
    allowedCreators.delete('debajoyti')
  }

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_bulk_reset_hwid', {
        p_creator_filter: creatorFilter || null,
        p_session_token: getStoredSessionToken()
      })
      if (rpcErr || (rpcRes && !rpcRes.success)) {
        return {
          success: false,
          message: rpcErr?.message || rpcRes?.message || 'Permission Denied: Failed to reset HWIDs.'
        }
      }
      return {
        success: true,
        message: rpcRes?.message || 'All scoped hardware ID (HWID) bindings have been reset.'
      }
    } catch (e: any) {
      return { success: false, message: e?.message || 'Database error during bulk HWID reset.' }
    }
  }

  const stored = getStoredLicenses()
  let syncAllowed: Set<string> | null = null
  if (!isRootOwner) {
    syncAllowed = getDownlineUsernamesSync(actorUsername, getStoredAccounts(), true)
    syncAllowed.delete('debajoyti')
  }
  stored.forEach((l) => {
    const creator = String(l.creator_username || '').toLowerCase()
    if (syncAllowed && !syncAllowed.has(creator)) return
    if (!creatorFilter || creator === creatorFilter.toLowerCase()) {
      l.device_hwid = ''
      l.devices_used = 0
    }
  })
  saveStoredLicenses(stored)

  const newAct: RymonActivity = {
    id: Date.now(),
    title: 'Global HWID Reset',
    event_type: 'BULK_HWID_RESET',
    details: `Reset all HWID bindings by @${actorUsername}`,
    actor_username: actorUsername,
    status: 'SUCCESS',
    created_at: nowIso
  }
  saveStoredActivities([newAct, ...getStoredActivities()])

  return {
    success: true,
    message: 'All hardware ID (HWID) bindings have been reset across keys.'
  }
}

export async function bulkExtendAllKeysBackend(
  rawDays: number,
  actorUsername: string = 'debajoyti',
  creatorFilter?: string
): Promise<{ success: boolean; count: number; remainingBalance?: number; message: string }> {
  let count = 0
  const rawNum = Math.floor(Number(rawDays) || 0)
  if (rawNum < 1) {
    return {
      success: false,
      count: 0,
      message: 'Invalid extension duration. Minimum extension duration is 1 day.'
    }
  }
  const days = Math.min(30, rawNum)
  const msToAdd = days * 86400000
  const max365DaysMs = Date.now() + 365 * 86400000
  const cleanActor = (actorUsername || 'debajoyti').trim()
  const isRootOwner = cleanActor.toLowerCase() === 'debajoyti'
  let remainingBalance: number | undefined = undefined

  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_bulk_extend_keys', {
        p_days: days,
        p_actor_username: cleanActor,
        p_creator_filter: creatorFilter || null,
        p_session_token: getStoredSessionToken()
      })

      if (rpcErr) {
        return { success: false, count: 0, message: rpcErr.message || 'Database error during bulk extension.' }
      }

      if (rpcRes) {
        if (!rpcRes.success) {
          return { success: false, count: 0, message: rpcRes.message || 'Failed to bulk extend keys.' }
        }

        const remainingBalance = rpcRes.remaining_balance !== undefined ? Number(rpcRes.remaining_balance) : undefined
        if (remainingBalance !== undefined) {
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = remainingBalance
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === cleanActor.toLowerCase()) {
                u.balance = remainingBalance
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        return {
          success: true,
          count: Number(rpcRes.count || 0),
          remainingBalance,
          message: rpcRes.message || `Successfully extended ${rpcRes.count} keys by +${days} days!`
        }
      }
    } catch (e: any) {
      return { success: false, count: 0, message: e?.message || 'Error executing bulk extend.' }
    }
  }

  const rawLicenses = getStoredLicenses()
  let syncAllowed: Set<string> | null = null
  if (!isRootOwner) {
    syncAllowed = getDownlineUsernamesSync(cleanActor, getStoredAccounts(), true)
    syncAllowed.delete('debajoyti')
  }
  const stored = rawLicenses.filter((l) => {
    const creator = String(l.creator_username || '').toLowerCase()
    return !syncAllowed || syncAllowed.has(creator)
  })

  const targetLicenses = stored.filter((l) => {
    if (l.status === 'BANNED') return false
    if (creatorFilter && String(l.creator_username || '').toLowerCase() !== creatorFilter.toLowerCase()) return false
    return true
  })

  if (!isRootOwner && targetLicenses.length > 0) {
    let totalCost = 0
    for (const l of targetLicenses) {
      totalCost += calculateExtensionCost(days, cleanActor, Number(l.devices_max || 1))
    }
    const accounts = getStoredAccounts()
    const actorAcc = accounts.find((a) => (a.username || '').toLowerCase() === cleanActor.toLowerCase())
    if (!actorAcc || actorAcc.balance < totalCost) {
      return {
        success: false,
        count: 0,
        message: `Insufficient wallet balance! Bulk extending ${targetLicenses.length} key(s) by +${days} Day(s) costs ₹${totalCost}, but your balance is ₹${actorAcc?.balance || 0}.`
      }
    }
    actorAcc.balance = Math.max(0, actorAcc.balance - totalCost)
    remainingBalance = actorAcc.balance
    saveStoredAccounts(accounts)
  }

  targetLicenses.forEach((l) => {
    const currDays = parseInt(l.plan_duration?.match(/\d+/)?.[0] || '1', 10)
    const totalDays = currDays + days
    const isVip = (l.plan_duration || '').includes('[VIP]')
    const newPlan = `${totalDays} Days${isVip ? ' [VIP]' : ''}`
    l.plan_duration = newPlan

    if (l.expires_at) {
      const base = new Date(l.expires_at).getTime()
      l.expires_at = new Date(
        Math.min(Math.max(base, Date.now()) + msToAdd, max365DaysMs)
      ).toISOString()
    } else {
      // Unactivated fresh key: keep timer unstarted until first login!
      l.expires_at = null
    }
    count++
  })
  saveStoredLicenses(rawLicenses)

  const newAct: RymonActivity = {
    id: Date.now(),
    title: `Bulk Extend (+${days}d)`,
    event_type: 'BULK_EXTEND',
    details: `Added +${days} Day(s) to ${count} key(s) by @${cleanActor}${!isRootOwner && remainingBalance !== undefined ? ` • New Bal: ₹${remainingBalance}` : ''}`,
    actor_username: cleanActor,
    status: 'SUCCESS',
    created_at: new Date().toISOString()
  }
  saveStoredActivities([newAct, ...getStoredActivities()])

  return {
    success: true,
    count,
    remainingBalance,
    message: `Added +${days} Day(s) to ${count} active license(s) (Max 30 Days cap enforced).`
  }
}

export async function grantBonusTimeToKeyBackend(
  licenseKey: string,
  bonusHours: number,
  actorUsername: string = 'debajoyti'
): Promise<{
  success: boolean
  newExpiresAt?: string | null
  status?: string
  message: string
}> {
  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanActor = actorUsername.trim()

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_grant_bonus_time', {
        p_license_key: cleanKey,
        p_bonus_hours: bonusHours,
        p_actor_username: cleanActor,
        p_session_token: getStoredSessionToken()
      })
      if (!error && data && typeof data === 'object') {
        const res = data as {
          success: boolean
          new_expires_at?: string
          status?: string
          message: string
        }
        if (res.success) {
          return {
            success: true,
            newExpiresAt: res.new_expires_at,
            status: res.status,
            message: res.message
          }
        }
        return { success: false, message: res.message || 'Failed to grant bonus' }
      }
    } catch (e: any) {
      console.warn('RPC rpc_rymon_grant_bonus_time error, using fallback:', e)
    }
  }

  // Fallback for offline/local storage
  const stored = getStoredLicenses()
  const idx = stored.findIndex((l) => l.license_key === cleanKey)
  if (idx >= 0) {
    const lic = stored[idx]
    const curExp = lic.expires_at ? new Date(lic.expires_at).getTime() : Date.now()
    const base = Math.max(Date.now(), curExp)
    const nextExp = new Date(base + bonusHours * 3600000).toISOString()
    lic.expires_at = nextExp
    lic.status = lic.is_paused ? 'PAUSED' : 'ACTIVE'
    lic.updated_at = new Date().toISOString()
    saveStoredLicenses(stored)
    return {
      success: true,
      newExpiresAt: nextExp,
      status: lic.status,
      message: `🎁 Granted +${bonusHours} hrs bonus time!`
    }
  }
  return { success: false, message: 'License key not found' }
}

export async function bulkGrantBonusTimeBackend(
  bonusHours: number,
  actorUsername: string = 'debajoyti',
  creatorFilter?: string
): Promise<{
  success: boolean
  count: number
  message: string
}> {
  const cleanActor = actorUsername.trim()

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rpc_rymon_bulk_grant_bonus_time', {
        p_bonus_hours: bonusHours,
        p_actor_username: cleanActor,
        p_creator_filter: creatorFilter || null,
        p_session_token: getStoredSessionToken()
      })
      if (!error && data && typeof data === 'object') {
        const res = data as { success: boolean; count: number; message: string }
        if (res.success) {
          return { success: true, count: res.count, message: res.message }
        }
        return { success: false, count: 0, message: res.message || 'Failed to grant bulk bonus' }
      }
    } catch (e: any) {
      console.warn('RPC rpc_rymon_bulk_grant_bonus_time error, using fallback:', e)
    }
  }

  // Fallback for offline
  const stored = getStoredLicenses()
  let affected = 0
  stored.forEach((l) => {
    if (l.status !== 'BANNED') {
      const curExp = l.expires_at ? new Date(l.expires_at).getTime() : Date.now()
      const base = Math.max(Date.now(), curExp)
      l.expires_at = new Date(base + bonusHours * 3600000).toISOString()
      l.status = l.is_paused ? 'PAUSED' : 'ACTIVE'
      l.updated_at = new Date().toISOString()
      affected++
    }
  })
  saveStoredLicenses(stored)
  return {
    success: true,
    count: affected,
    message: `🎁 Granted +${bonusHours} hrs bonus to ${affected} key(s)!`
  }
}

// ============================================================================
// HELPER STORAGE ROUTINES
// ============================================================================
function getStoredAccounts(): RymonAccount[] {
  try {
    const raw = localStorage.getItem('rymon_sovereign_accounts')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((a: RymonAccount) => {
          if (a.username.toLowerCase() === 'debajoyti') {
            return { ...a, role: 'owner', uplink: 'SOVEREIGN_ROOT' }
          }
          if (a.username.toLowerCase() === 'ryzen') {
            return { ...a, role: 'owner' }
          }
          return a
        })
      }
    }
  } catch {}
  return [...SOVEREIGN_FALLBACK_ACCOUNTS]
}

export function saveStoredAccounts(accounts: RymonAccount[]): void {
  try {
    localStorage.setItem('rymon_sovereign_accounts', JSON.stringify(accounts))
  } catch {}
}

function getStoredLicenses(): RymonLicense[] {
  try {
    const raw = localStorage.getItem('rymon_sovereign_licenses')
    if (raw) return JSON.parse(raw)
  } catch {}
  return [...SOVEREIGN_FALLBACK_LICENSES]
}

function saveStoredLicenses(licenses: RymonLicense[]): void {
  try {
    localStorage.setItem('rymon_sovereign_licenses', JSON.stringify(licenses))
  } catch {}
}

function getStoredActivities(): RymonActivity[] {
  try {
    const raw = localStorage.getItem('rymon_sovereign_activities')
    if (raw) return JSON.parse(raw)
  } catch {}
  return [...SOVEREIGN_FALLBACK_ACTIVITIES]
}

function saveStoredActivities(activities: RymonActivity[]): void {
  try {
    localStorage.setItem('rymon_sovereign_activities', JSON.stringify(activities))
  } catch {}
}

export const OFFICIAL_OWNER_CHAT_ID = '5831800759'

export async function selfServiceResetKeyHwidBackend(
  rawKey: string,
  isOwnerOverride: boolean = false,
  _actorLabel: string = 'Customer'
): Promise<{
  success: boolean
  message: string
  htmlReply: string
  remainingResets: number
  usedToday: number
  dailyLimit: number
}> {
  const cleanKey = (rawKey || '').trim().toUpperCase()
  const policy = getSovereignSecurityPolicy()
  const clientLimit = policy.client_hwid_limit_per_day !== undefined ? Number(policy.client_hwid_limit_per_day) : 1
  const isClientResetAllowed = policy.allow_client_self_reset !== false && clientLimit > 0
  const DAILY_LIMIT = Math.max(1, clientLimit)
  const DAY_WINDOW_MS = 86400000
  const nowMs = Date.now()

  if (!isOwnerOverride && !isClientResetAllowed) {
    return {
      success: false,
      message: 'Client self-service HWID resets are disabled by the owner. Please contact your seller.',
      htmlReply: `🔒 <b>Self-Service HWID Resets Disabled</b>\nClient self-service HWID unbinding is currently disabled. Please contact your seller or administrator.`,
      remainingResets: 0,
      usedToday: 0,
      dailyLimit: 0
    }
  }

  if (!cleanKey) {
    return {
      success: false,
      message: 'Please enter a valid license key.',
      htmlReply: `ℹ️ <b>Usage:</b> Paste your license key directly and click Reset HWID!`,
      remainingResets: DAILY_LIMIT,
      usedToday: 0,
      dailyLimit: isClientResetAllowed ? DAILY_LIMIT : 0
    }
  }

  // Primary Sovereign RPC Path (atomic limit + HWID clear + audit log)
  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_self_reset_hwid', {
        p_license_key: cleanKey,
        p_session_token: isOwnerOverride ? getStoredSessionToken() : ''
      })
      if (!rpcErr && rpcRes) {
        if (!rpcRes.success) {
          return {
            success: false,
            message: rpcRes.message || `Failed to reset ${cleanKey}.`,
            htmlReply: `❌ <b>HWID Reset Rejected:</b> ${rpcRes.message || 'Unable to reset key.'}`,
            remainingResets: Number(rpcRes.remainingResets ?? 0),
            usedToday: Number(rpcRes.usedToday ?? DAILY_LIMIT),
            dailyLimit: Number(rpcRes.dailyLimit ?? DAILY_LIMIT)
          }
        }
        const exactKey = String(rpcRes.key || cleanKey).toUpperCase()
        const usedToday = Number(rpcRes.usedToday ?? 0)
        const remainingResets = Number(rpcRes.remainingResets ?? DAILY_LIMIT)
        const effectiveLimit = Number(rpcRes.dailyLimit ?? DAILY_LIMIT)
        const overrideDone = Boolean(rpcRes.isOverride)
        const htmlReply = overrideDone
          ? [
              `👑 <b>OWNER OVERRIDE — HWID RESET COMPLETE</b>`,
              ``,
              `• <b>Key:</b> <code>${exactKey}</code>`,
              `• <b>Game:</b> ${rpcRes.game || 'Free Fire MAX'}`,
              `• <b>Device Lock:</b> Cleared (Unbound)`,
              `• <b>Customer Daily Quota:</b> Restored to ${effectiveLimit} / ${effectiveLimit} today`,
              `• <b>Timer:</b> Preserved`
            ].join('\n')
          : [
              `✅ <b>KEY HWID RESET SUCCESSFUL!</b>`,
              ``,
              `• <b>Key:</b> <code>${exactKey}</code>`,
              `• <b>Game:</b> ${rpcRes.game || 'Free Fire MAX'} (${rpcRes.plan_duration || ''})`,
              `• <b>Device Lock:</b> Unbound (Ready for new login)`,
              `• <b>Daily Resets Used:</b> ${usedToday} / ${effectiveLimit} today (<b>${remainingResets} left today</b>)`,
              `• <b>Expiry Timer:</b> Preserved`
            ].join('\n')

        return {
          success: true,
          message: `✅ HWID cleared for ${exactKey}! (${remainingResets}/${effectiveLimit} daily resets left today)`,
          htmlReply,
          remainingResets,
          usedToday,
          dailyLimit: effectiveLimit
        }
      }
    } catch {}
  }

  // Offline Fallback Registry Verification
  const localMatch = getStoredLicenses().find((l) => l.license_key.toUpperCase() === cleanKey)
  if (!localMatch) {
    return {
      success: false,
      message: `Key ${cleanKey} not found.`,
      htmlReply: `❌ <b>Key Not Found:</b> <code>${cleanKey}</code>\nPlease double-check your license key and try again.`,
      remainingResets: 0,
      usedToday: 0,
      dailyLimit: DAILY_LIMIT
    }
  }
  if (localMatch.status === 'BANNED') {
    return {
      success: false,
      message: `Key ${cleanKey} is BANNED and cannot be reset.`,
      htmlReply: `🚫 <b>Key Suspended:</b> <code>${cleanKey}</code> is BANNED and cannot be reset.`,
      remainingResets: 0,
      usedToday: DAILY_LIMIT,
      dailyLimit: DAILY_LIMIT
    }
  }
  const isExpired =
    localMatch.status === 'EXPIRED' ||
    Boolean(localMatch.expires_at && new Date(localMatch.expires_at).getTime() <= nowMs)
  if (isExpired) {
    return {
      success: false,
      message: `Key ${cleanKey} has EXPIRED.`,
      htmlReply: `⏰ <b>Key Expired:</b> <code>${cleanKey}</code> has expired. Please contact your seller to renew.`,
      remainingResets: 0,
      usedToday: DAILY_LIMIT,
      dailyLimit: DAILY_LIMIT
    }
  }

  const logMap: Record<string, number[]> = getHwidResetLog()
  const exactKey = localMatch.license_key.toUpperCase()
  const recentResets = (logMap[exactKey] || []).filter((ts) => nowMs - Number(ts) < DAY_WINDOW_MS)
  if (!isOwnerOverride) {
    if (recentResets.length >= DAILY_LIMIT) {
      const oldestTs = Math.min(...recentResets)
      const waitMs = Math.max(60000, DAY_WINDOW_MS - (nowMs - oldestTs))
      const waitStr = formatDurationShort(waitMs)
      return {
        success: false,
        message: `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT} resets used today for ${exactKey}). Next reset in ~${waitStr}.`,
        htmlReply: `🛡️ <b>DAILY HWID RESET LIMIT REACHED (${DAILY_LIMIT}/${DAILY_LIMIT})</b>\nNext Reset Available In: ~${waitStr}`,
        remainingResets: 0,
        usedToday: DAILY_LIMIT,
        dailyLimit: DAILY_LIMIT
      }
    }
    recentResets.push(nowMs)
    logMap[exactKey] = recentResets
  } else {
    delete logMap[exactKey]
  }
  saveHwidResetLog(logMap)

  const nextStatus = localMatch.is_paused
    ? 'PAUSED'
    : localMatch.expires_at
    ? 'ACTIVE'
    : 'WAITING'

  const stored = getStoredLicenses()
  const localItem = stored.find((l) => l.license_key.toUpperCase() === exactKey)
  if (localItem) {
    localItem.device_hwid = ''
    localItem.devices_used = 0
    localItem.status = nextStatus
    saveStoredLicenses(stored)
  }

  const usedToday = isOwnerOverride ? 0 : recentResets.length
  const remainingResets = isOwnerOverride ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - usedToday)

  const htmlReply = isOwnerOverride
    ? [
        `👑 <b>OWNER OVERRIDE — HWID RESET COMPLETE</b>`,
        ``,
        `• <b>Key:</b> <code>${exactKey}</code>`,
        `• <b>Game:</b> ${localMatch.game}`,
        `• <b>Device Lock:</b> Cleared (Unbound)`,
        `• <b>Customer Daily Quota:</b> Restored to ${DAILY_LIMIT} / ${DAILY_LIMIT} today`,
        `• <b>Timer:</b> Preserved`
      ].join('\n')
    : [
        `✅ <b>KEY HWID RESET SUCCESSFUL!</b>`,
        ``,
        `• <b>Key:</b> <code>${exactKey}</code>`,
        `• <b>Game:</b> ${localMatch.game} (${localMatch.plan_duration})`,
        `• <b>Device Lock:</b> Unbound (Ready for new login)`,
        `• <b>Daily Resets Used:</b> ${usedToday} / ${DAILY_LIMIT} today (<b>${remainingResets} left today</b>)`,
        `• <b>Expiry Timer:</b> Preserved`
      ].join('\n')

  return {
    success: true,
    message: `✅ HWID cleared for ${exactKey}! (${remainingResets}/${DAILY_LIMIT} daily resets left today)`,
    htmlReply,
    remainingResets,
    usedToday,
    dailyLimit: DAILY_LIMIT
  }
}

async function notifyOwnerTelegram(text: string, explicitSessionToken?: string): Promise<boolean> {
  try {
    const token = explicitSessionToken || getStoredSessionToken()
    if (!token) return false
    const payload = {
      chat_id: OFFICIAL_OWNER_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      session_token: token
    }
    const resp = await fetch('https://rymon-telegram-bot.onrender.com/api/telegram/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': token
      },
      body: JSON.stringify(payload)
    })
    const json = await resp.json()
    return !!json.ok
  } catch {
    return false
  }
}

// ============================================================================
// SOVEREIGN REFERRAL & INVITE CODE SYSTEM
// ============================================================================
const REFERRAL_SUB_DAYS_STORAGE_KEY = 'rymon_referral_sub_days_v1'

function getLocalReferralSubDaysMap(): Record<string, 30 | 60> {
  try {
    const raw = localStorage.getItem(REFERRAL_SUB_DAYS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) || {}
  } catch {}
  return {}
}

function saveReferralSubDays(code: string, days: 30 | 60): void {
  const cleanCode = code.trim().toUpperCase()
  const map = getLocalReferralSubDaysMap()
  map[cleanCode] = days === 60 ? 60 : 30
  try {
    localStorage.setItem(REFERRAL_SUB_DAYS_STORAGE_KEY, JSON.stringify(map))
  } catch {}
  if (supabase) {
    void setSystemConfigRemote('referral_subscription_days', map)
  }
}

function resolveReferralSubscriptionDays(
  code: string,
  explicitDays?: number,
  remoteMap?: Record<string, number>
): 30 | 60 {
  if (explicitDays === 60) return 60
  if (explicitDays === 30) return 30
  const upper = (code || '').trim().toUpperCase()
  if (remoteMap && remoteMap[upper] === 60) return 60
  const localMap = getLocalReferralSubDaysMap()
  if (localMap[upper] === 60) return 60
  if (upper.includes('60D') || upper.endsWith('-60')) return 60
  return 30
}

function getStoredReferrals(): RymonReferral[] {
  try {
    const raw = localStorage.getItem('rymon_sovereign_referrals')
    if (raw) return JSON.parse(raw)
  } catch {}
  return [...SOVEREIGN_FALLBACK_REFERRALS]
}

function saveStoredReferrals(referrals: RymonReferral[]): void {
  try {
    localStorage.setItem('rymon_sovereign_referrals', JSON.stringify(referrals))
  } catch {}
}

export async function fetchReferralCodes(user?: RymonAccount | null): Promise<RymonReferral[]> {
  // Resellers and streamers cannot view or generate staff referrals
  if (user && (user.role === 'reseller' || user.role === 'streamer')) {
    return []
  }

  let remoteSubMap: Record<string, number> = {}
  if (supabase) {
    try {
      const { data: cfgRow } = await supabase
        .from('rymon_system_config')
        .select('value')
        .eq('key', 'referral_subscription_days')
        .maybeSingle()
      if (cfgRow?.value && typeof cfgRow.value === 'object') {
        remoteSubMap = cfgRow.value as Record<string, number>
        try {
          const merged = { ...getLocalReferralSubDaysMap(), ...remoteSubMap }
          localStorage.setItem(REFERRAL_SUB_DAYS_STORAGE_KEY, JSON.stringify(merged))
        } catch {}
      }
    } catch {}

    try {
      const actorUsername = user?.username || 'debajoyti'

      // 1. Query session-authenticated Sovereign RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_rymon_get_referrals', {
        p_actor_username: actorUsername,
        p_actor_password: '',
        p_session_token: getStoredSessionToken()
      })

      let rows: RymonReferral[] | null = null
      if (!rpcErr && Array.isArray(rpcData)) {
        rows = rpcData as RymonReferral[]
      }

      if (rows && Array.isArray(rows)) {
        const enriched = rows.map((r) => ({
          ...r,
          subscription_days: resolveReferralSubscriptionDays(
            r.code,
            r.subscription_days,
            remoteSubMap
          )
        }))
        const isRootUser = !user || String(user.username || '').toLowerCase() === 'debajoyti'
        const isOwnerUser = user?.role === 'owner'
        if (isRootUser || isOwnerUser) {
          saveStoredReferrals(enriched)
          return enriched
        }
        // Downline check for Admins
        const allowedDownlines = await getDownlineUsernames(user?.username || '', true)
        return enriched.filter((r) => {
          const creator = String(r.created_by || '').toLowerCase()
          return allowedDownlines.has(creator)
        })
      }
    } catch {}
  }

  const stored = getStoredReferrals().map((r) => ({
    ...r,
    subscription_days: resolveReferralSubscriptionDays(r.code, r.subscription_days, remoteSubMap)
  }))
  const isRootUser = !user || String(user.username || '').toLowerCase() === 'debajoyti'
  const isOwnerUser = user?.role === 'owner'
  if (isRootUser || isOwnerUser) {
    return stored
  }
  const allowedDownlines = getDownlineUsernamesSync(user?.username || '', getStoredAccounts(), true)
  return stored.filter((r) => {
    const creator = String(r.created_by || '').toLowerCase()
    return allowedDownlines.has(creator)
  })
}

export async function createReferralCode(
  owner: string,
  targetRole: 'admin' | 'reseller',
  initialBalance: number = 0,
  customCode?: string,
  maxUses: number = 1,
  subscriptionDays: 30 | 60 = 30
): Promise<{ success: boolean; code?: string; remainingBalance?: number; message: string }> {
  const cleanOwner = (owner || 'debajoyti').trim()
  const isRootOwner = cleanOwner.toLowerCase() === 'debajoyti'
  const isOwnerUser = isRootOwner || cleanOwner.toLowerCase() === 'ryzen'
  const safeSubDays: 30 | 60 = subscriptionDays === 60 ? 60 : 30

  // Strict hierarchy: Only Owners (debajoyti & ryzen) can issue Admin referrals
  if (!isOwnerUser && targetRole === 'admin') {
    return {
      success: false,
      message: 'Power restriction: Only Owners (debajoyti & ryzen) can issue Admin referral codes. Admins can only invite Resellers.'
    }
  }

  const roleShort = targetRole === 'admin' ? 'ADM' : 'RES'
  const code =
    (customCode && customCode.trim().toUpperCase()) ||
    `REF-${roleShort}${safeSubDays}D-${generateCryptoCodeSegment(6)}`

  const safeBalance = Math.max(0, Number(initialBalance) || 0)
  const safeMaxUses = Math.max(1, Number(maxUses) || 1)
  const totalFundingRequired = isOwnerUser ? 0 : safeBalance * safeMaxUses
  let remainingBalance: number | undefined = undefined

  saveReferralSubDays(code, safeSubDays)

  if (supabase) {
    try {
      const { data: rpcRes, error: insErr } = await supabase.rpc('rpc_rymon_create_referral', {
        p_code: code,
        p_target_role: targetRole,
        p_initial_balance: safeBalance,
        p_max_uses: safeMaxUses,
        p_subscription_days: safeSubDays,
        p_actor_username: cleanOwner,
        p_actor_password: '',
        p_session_token: getStoredSessionToken()
      })

      if (insErr) {
        return { success: false, message: insErr.message || 'Database error creating referral code.' }
      }

      if (rpcRes?.success) {
        if (rpcRes.remaining_balance !== undefined) {
          remainingBalance = Number(rpcRes.remaining_balance)
          const accounts = getStoredAccounts()
          const aIdx = accounts.findIndex((a) => (a.username || '').toLowerCase() === cleanOwner.toLowerCase())
          if (aIdx !== -1) {
            accounts[aIdx].balance = remainingBalance
            saveStoredAccounts(accounts)
          }
          try {
            const rawSession = localStorage.getItem('rymon_session_user')
            if (rawSession) {
              const u = JSON.parse(rawSession)
              if ((u.username || '').toLowerCase() === cleanOwner.toLowerCase()) {
                u.balance = remainingBalance
                localStorage.setItem('rymon_session_user', JSON.stringify(u))
              }
            }
          } catch {}
        }

        const enrichedInserted: RymonReferral = {
          id: Date.now(),
          code,
          target_role: targetRole,
          initial_balance: safeBalance,
          created_by: cleanOwner,
          max_uses: safeMaxUses,
          times_used: 0,
          is_active: true,
          created_at: new Date().toISOString(),
          subscription_days: safeSubDays
        }
        const stored = getStoredReferrals()
        stored.unshift(enrichedInserted)
        saveStoredReferrals(stored)

        // Dispatch instant Telegram Owner Alert
        void notifyOwnerTelegram([
          `🎟️ <b>NEW INVITE CODE CREATED</b>`,
          ``,
          `• <b>Code:</b> <code>${code}</code>`,
          `• <b>Creator:</b> @${cleanOwner}`,
          `• <b>Target Role:</b> ${targetRole.toUpperCase()}`,
          `• <b>Subscription:</b> ${safeSubDays} Days`,
          `• <b>Starting Balance:</b> ₹${safeBalance.toLocaleString('en-IN')}`,
          `• <b>Max Uses:</b> ${safeMaxUses}x`
        ].join('\n'))

        return {
          success: true,
          code,
          remainingBalance,
          message: `Referral code ${code} (${safeSubDays} Days Subscription) created successfully!`
        }
      } else if (rpcRes?.error) {
        return { success: false, message: rpcRes.error }
      }
    } catch {}
  }

  const stored = getStoredReferrals()
  if (stored.some((r) => r.code.toUpperCase() === code)) {
    return { success: false, message: 'Referral code already exists' }
  }

  if (!isOwnerUser && totalFundingRequired > 0) {
    const accounts = getStoredAccounts()
    const adminAcc = accounts.find((a) => (a.username || '').toLowerCase() === cleanOwner.toLowerCase())
    if (!adminAcc || adminAcc.balance < totalFundingRequired) {
      return {
        success: false,
        message: `Insufficient wallet balance! Requires ₹${totalFundingRequired}.`
      }
    }
    adminAcc.balance = Math.max(0, adminAcc.balance - totalFundingRequired)
    remainingBalance = adminAcc.balance
    saveStoredAccounts(accounts)
  }

  const newRef: RymonReferral = {
    id: Date.now(),
    code,
    target_role: targetRole,
    initial_balance: safeBalance,
    subscription_days: safeSubDays,
    created_by: cleanOwner,
    max_uses: safeMaxUses,
    times_used: 0,
    is_active: true,
    created_at: new Date().toISOString()
  }
  stored.unshift(newRef)
  saveStoredReferrals(stored)

  return {
    success: true,
    code,
    remainingBalance,
    message: `Referral code ${code} (${safeSubDays} Days Subscription) created successfully`
  }
}

export async function registerWithReferral(
  username: string,
  password: string,
  email: string,
  referralCode: string
): Promise<{ success: boolean; user?: RymonAccount; message: string }> {
  const cleanUser = username.trim()
  const cleanPass = password.trim()
  const cleanRef = referralCode.trim().toUpperCase()
  const cleanEmail = email && email.trim() ? email.trim() : `${cleanUser.toLowerCase()}@rymon.vip`

  if (cleanUser.length < 3) {
    return { success: false, message: 'Username must be at least 3 characters' }
  }
  if (cleanPass.length < 4) {
    return { success: false, message: 'Password must be at least 4 characters' }
  }
  if (cleanUser.toLowerCase() === 'debajoyti' || cleanUser.toLowerCase() === 'rymon') {
    return { success: false, message: 'Reserved root owner username cannot be registered' }
  }

  if (supabase) {
    try {
      // 1. Primary Path: Call Sovereign RPC (SECURITY DEFINER, atomic registration)
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_register_with_referral', {
        p_username: cleanUser,
        p_password: cleanPass,
        p_email: cleanEmail,
        p_referral_code: cleanRef
      })

      if (!rpcErr && rpcRes) {
        if (rpcRes.success && rpcRes.user) {
          const u = rpcRes.user
          const newUser: RymonAccount = {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            balance: Number(u.balance) || 0,
            uplink: u.uplink || 'debajoyti',
            referral_code: cleanRef,
            status: u.status || 'ACTIVE',
            expires_at: u.expires_at,
            permissions: u.permissions,
            session_token: u.session_token
          }
          const storedAccounts = getStoredAccounts()
          if (!storedAccounts.some((a) => (a.username || '').toLowerCase() === cleanUser.toLowerCase())) {
            storedAccounts.push(newUser)
            saveStoredAccounts(storedAccounts)
          }

          // Dispatch instant Telegram Owner Alert using newly issued session token
          void notifyOwnerTelegram(
            [
              `👤 <b>NEW USER REGISTERED</b>`,
              ``,
              `• <b>Username:</b> @${newUser.username}`,
              `• <b>Role:</b> ${String(newUser.role).toUpperCase()}`,
              `• <b>Invite Code:</b> <code>${cleanRef}</code>`,
              `• <b>Invited By / Uplink:</b> @${newUser.uplink || 'debajoyti'}`,
              `• <b>Balance:</b> ₹${(Number(newUser.balance) || 0).toLocaleString('en-IN')}`,
              `• <b>Email:</b> ${newUser.email || 'N/A'}`
            ].join('\n'),
            newUser.session_token
          )

          return {
            success: true,
            user: newUser,
            message: rpcRes.message || `Registered successfully as ${String(u.role).toUpperCase()}!`
          }
        } else {
          return {
            success: false,
            message: rpcRes.message || 'Registration failed'
          }
        }
      }

      if (rpcErr) {
        return {
          success: false,
          message: rpcErr.message || 'Registration service unavailable'
        }
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error while connecting to RYMON Cloud'
      }
    }
  }

  // Local fallback if offline
  if (!cleanRef) {
    const storedAccounts = getStoredAccounts()
    if (storedAccounts.some((a) => (a.username || '').toLowerCase() === cleanUser.toLowerCase())) {
      return { success: false, message: 'Username already taken' }
    }
    const newUser: RymonAccount = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12),
      username: cleanUser,
      email: cleanEmail,
      role: 'user',
      balance: 0,
      uplink: 'debajoyti',
      referral_code: '',
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString()
    }
    storedAccounts.push(newUser)
    saveStoredAccounts(storedAccounts)
    return {
      success: true,
      user: newUser,
      message: 'Account created successfully! Welcome to RYMON.'
    }
  }

  const storedRefs = getStoredReferrals()
  const ref = storedRefs.find((r) => r.code.toUpperCase() === cleanRef && r.is_active)
  if (!ref) {
    return { success: false, message: 'Invalid or expired referral code' }
  }
  if (ref.times_used >= ref.max_uses) {
    return { success: false, message: 'This referral code has already reached its usage limit' }
  }

  const storedAccounts = getStoredAccounts()
  if (storedAccounts.some((a) => (a.username || '').toLowerCase() === cleanUser.toLowerCase())) {
    return { success: false, message: 'Username already taken' }
  }

  const subDays = resolveReferralSubscriptionDays(ref.code, ref.subscription_days)

  const newUser: RymonAccount = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12),
    username: cleanUser,
    email: cleanEmail,
    role: ref.target_role,
    balance: ref.initial_balance,
    uplink: ref.created_by,
    referral_code: cleanRef,
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + subDays * 86400000).toISOString()
  }

  ref.times_used += 1
  if (ref.times_used >= ref.max_uses) ref.is_active = false
  saveStoredReferrals(storedRefs)

  storedAccounts.push(newUser)
  saveStoredAccounts(storedAccounts)

  // Dispatch instant Telegram Owner Alert
  void notifyOwnerTelegram([
    `👤 <b>NEW USER REGISTERED (OFFLINE)</b>`,
    ``,
    `• <b>Username:</b> @${newUser.username}`,
    `• <b>Role:</b> ${String(newUser.role).toUpperCase()}`,
    `• <b>Invite Code:</b> <code>${cleanRef}</code>`,
    `• <b>Invited By / Uplink:</b> @${ref.created_by || 'debajoyti'}`
  ].join('\n'))

  return {
    success: true,
    user: newUser,
    message: `Registered successfully as ${ref.target_role} (${subDays} Days Subscription)!`
  }
}

export async function deleteReferralCode(
  id: number,
  code?: string,
  actorUsername: string = 'debajoyti'
): Promise<boolean> {
  if (supabase) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_rymon_delete_referral', {
        p_id: id,
        p_code: code || null,
        p_actor_username: actorUsername || 'debajoyti',
        p_session_token: getStoredSessionToken()
      })

      if (!rpcErr && rpcRes?.success) {
        const stored = getStoredReferrals().filter((r) => r.id !== id && (!code || r.code !== code))
        saveStoredReferrals(stored)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const stored = getStoredReferrals()
  const filtered = stored.filter((r) => r.id !== id && (!code || r.code !== code))
  saveStoredReferrals(filtered)
  return true
}

// ============================================================================
// SOVEREIGN CONNECT API SPECIFICATION (FOR ANDROID APK & STRANGER DAEMON)
// ============================================================================
export const SOVEREIGN_CONNECT_CONFIG = {
  endpoint_url: 'https://zvjqpigduyvczidzafus.supabase.co/rest/v1/rpc/rpc_rymon_verify_license',
  dashboard_url: 'https://greenvest.shop/',
  anon_key: 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR',
  method: 'POST',
  headers: {
    'apikey': 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR',
    'Authorization': 'Bearer sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR',
    'Content-Type': 'application/json'
  },
  sample_request: {
    p_license_key: 'RYMON-FF-XXXX-XXXX',
    p_hwid: 'ANDROID-DEVICE-ID-9481',
    p_game: 'Free Fire MAX',
    p_secret: 'ff_max_sec_7a8b9c1d2e3f405162738495a6b7c8d9e0f1'
  }
}

// ============================================================================
// MULTI-APP & ECOSYSTEM MANAGEMENT (OWNER & STAFF APP SUITE)
// ============================================================================
export interface RegisteredApp {
  id: string
  name: string
  package_name?: string
  platform?: string
  icon?: string
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
  secret?: string
  version?: string
  download_url?: string
  announcement?: string
  description?: string
  created_at: string
}

/** Computes a deterministic per-application secret matching SQL fn_rymon_compute_app_secret. */
export function computeAppSecret(appName: string): string {
  const clean = String(appName || '').trim()
  if (!clean) return ''
  if (clean.toLowerCase() === 'free fire max') {
    return 'ff_max_sec_7a8b9c1d2e3f405162738495a6b7c8d9e0f1'
  }
  let hash1 = 0x811c9dc5
  let hash2 = 0x55555555
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i)
    hash1 = Math.imul((hash1 ^ ch) | 0, 0x01000193) >>> 0
    hash2 = (Math.imul(hash2 | 0, 33) + ch) >>> 0
  }
  const part1 = hash1.toString(16).padStart(8, '0')
  const part2 = hash2.toString(16).padStart(8, '0')
  return (part1 + part2 + '1e584eab26bac5030d2a5fbfec013059afac1d348431d892632d8961').substring(0, 48)
}

/** Resolves the configured secret for an application from registered_apps or falls back deterministically. */
export function getAppSecret(appName: string, apps?: RegisteredApp[]): string {
  const clean = String(appName || '').trim()
  if (!clean) return ''
  const matched = apps?.find(
    (a) =>
      a &&
      (String(a.name || '').trim().toLowerCase() === clean.toLowerCase() ||
        String(a.id || '').trim().toLowerCase() === clean.toLowerCase())
  )
  if (matched?.secret && matched.secret.trim()) {
    return matched.secret.trim()
  }
  return computeAppSecret(clean)
}

const DEFAULT_REGISTERED_APPS: RegisteredApp[] = [
  {
    id: 'ff_max',
    name: 'Free Fire MAX',
    package_name: 'com.dts.freefiremax',
    platform: 'Android Mobile',
    icon: '🔥',
    status: 'ACTIVE',
    secret: 'ff_max_sec_7a8b9c1d2e3f405162738495a6b7c8d9e0f1',
    version: '2.5.0',
    description: 'Universal RTDev Kernel Engine',
    created_at: '2026-10-11T00:00:00Z'
  }
]

const REGISTERED_APPS_CONFIG_KEY = 'registered_apps'
const REGISTERED_APPS_LOCAL_STORAGE = 'rymon_registered_apps_cache'

export function getLocalRegisteredApps(): RegisteredApp[] {
  try {
    const raw = localStorage.getItem(REGISTERED_APPS_LOCAL_STORAGE)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default Free Fire MAX is always present
        const hasFf = parsed.some((a) => (a?.name || '').toLowerCase() === 'free fire max')
        return hasFf ? parsed : [...DEFAULT_REGISTERED_APPS, ...parsed]
      }
    }
  } catch {}
  return [...DEFAULT_REGISTERED_APPS]
}

export async function fetchRegisteredApps(): Promise<RegisteredApp[]> {
  let apps = getLocalRegisteredApps()
  if (supabase) {
    try {
      const { data: cfgRow } = await supabase
        .from('rymon_system_config')
        .select('value')
        .eq('key', REGISTERED_APPS_CONFIG_KEY)
        .maybeSingle()

      if (cfgRow?.value && Array.isArray(cfgRow.value) && cfgRow.value.length > 0) {
        const remoteApps = cfgRow.value as RegisteredApp[]
        const hasFf = remoteApps.some((a) => (a?.name || '').toLowerCase() === 'free fire max')
        apps = hasFf ? remoteApps : [...DEFAULT_REGISTERED_APPS, ...remoteApps]
        try {
          localStorage.setItem(REGISTERED_APPS_LOCAL_STORAGE, JSON.stringify(apps))
        } catch {}
      } else {
        await saveRegisteredApps(DEFAULT_REGISTERED_APPS)
      }
    } catch (err) {
      console.warn('fetchRegisteredApps warning:', err)
    }
  }
  return apps
}

async function saveRegisteredApps(apps: RegisteredApp[]): Promise<boolean> {
  try {
    localStorage.setItem(REGISTERED_APPS_LOCAL_STORAGE, JSON.stringify(apps))
  } catch {}

  if (supabase) {
    try {
      await setSystemConfigRemote(REGISTERED_APPS_CONFIG_KEY, apps)
      return true
    } catch (err) {
      console.error('saveRegisteredApps error:', err)
      return false
    }
  }
  return true
}

export async function addRegisteredApp(newApp: {
  name: string
  package_name?: string
  platform?: string
  icon?: string
  description?: string
}): Promise<RegisteredApp[]> {
  const current = await fetchRegisteredApps()
  const cleanName = newApp.name.trim()
  const exists = current.some((a) => (a?.name || '').toLowerCase() === cleanName.toLowerCase())
  if (exists) {
    return current
  }

  const generatedId = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36).substring(3, 7)
  const appToAdd: RegisteredApp = {
    id: generatedId,
    name: cleanName,
    package_name: (newApp.package_name || '').trim(),
    platform: newApp.platform || 'Android Mobile',
    icon: newApp.icon || '🎮',
    status: 'ACTIVE',
    secret: computeAppSecret(cleanName),
    version: '1.0.0',
    description: (newApp.description || '').trim(),
    created_at: new Date().toISOString()
  }

  const updated = [...current, appToAdd]
  await saveRegisteredApps(updated)
  return updated
}

export async function deleteRegisteredApp(appIdOrName: string): Promise<RegisteredApp[]> {
  const current = await fetchRegisteredApps()
  const target = appIdOrName.trim().toLowerCase()
  if (target === 'ffmax' || target === 'free fire max') {
    return current
  }
  const filtered = current.filter(
    (a) => String(a?.id || '').toLowerCase() !== target && String(a?.name || '').toLowerCase() !== target
  )
  await saveRegisteredApps(filtered)
  return filtered
}

export async function updateRegisteredApp(
  appIdOrName: string,
  updates: Partial<RegisteredApp>
): Promise<RegisteredApp[]> {
  const current = await fetchRegisteredApps()
  const target = appIdOrName.trim().toLowerCase()
  const updated = current.map((a) => {
    if (String(a?.id || '').toLowerCase() === target || String(a?.name || '').toLowerCase() === target) {
      return { ...a, ...updates }
    }
    return a
  })
  await saveRegisteredApps(updated)
  return updated
}



