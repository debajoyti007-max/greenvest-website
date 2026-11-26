/**
 * Sovereign Connect Gateway for KeyAuth Standalone Licensing
 * Route: https://greenvest.shop/connect (and /api/connect)
 * Directly authenticates against Supabase RPC rpc_rymon_verify_license
 * Zero external third-party dependencies (100% self-hosted).
 */

import { timingSafeEqual } from 'node:crypto'

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://zvjqpigduyvczidzafus.supabase.co'
).replace(/\/$/, '')

const SUPABASE_VERIFY_RPC = `${SUPABASE_URL}/rest/v1/rpc/rpc_rymon_verify_license`
const SUPABASE_API_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR'

const ALLOWED_ORIGINS = new Set(
  [
    'https://greenvest.shop',
    'https://www.greenvest.shop',
    'http://localhost:3000',
    'http://localhost:5173',
    ...(process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map((s) => s.trim()) : [])
  ].filter(Boolean)
)

let cachedApps = null
let lastAppsFetch = 0

function computeAppSecret(appName) {
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

function safeSecretEquals(a, b) {
  const s1 = String(a || '')
  const s2 = String(b || '')
  if (!s1 || !s2 || s1.length !== s2.length) return false
  try {
    return timingSafeEqual(Buffer.from(s1, 'utf8'), Buffer.from(s2, 'utf8'))
  } catch {
    return false
  }
}

async function getRegisteredApps() {
  if (cachedApps && Date.now() - lastAppsFetch < 30000) {
    return cachedApps
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rymon_system_config?key=eq.registered_apps&select=value`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && Array.isArray(data[0]?.value)) {
        cachedApps = data[0].value
        lastAppsFetch = Date.now()
        return cachedApps
      }
    }
  } catch {}
  return cachedApps || []
}

function sanitizeParam(val, maxLen = 128) {
  if (val === undefined || val === null) return ''
  return Array.from(String(val))
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .trim()
    .slice(0, maxLen)
}

export default async function handler(req, res) {
  const origin = req.headers?.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-App-Secret')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: true,
      service: 'KeyAuth Sovereign Edge Gateway',
      gateway: 'https://greenvest.shop/connect',
      engine: 'KeyAuth Core RPC',
      uptime: '100%',
      capabilities: ['license_auth', 'hwid_lock', 'app_secret', 'version_check', 'maintenance_killswitch', 'broadcast_announcement'],
      instructions: 'Send POST request with user_key, serial, app, and secret parameters'
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: false, reason: 'Method Not Allowed' })
  }

  try {
    let body = req.body

    // Handle raw string / urlencoded payloads (common in curl / libcurl)
    if (typeof body === 'string') {
      if (body.length > 16384) {
        return res.status(413).json({ status: false, success: false, reason: 'Payload too large' })
      }
      try {
        body = JSON.parse(body)
      } catch {
        const params = new URLSearchParams(body)
        body = Object.fromEntries(params.entries())
      }
    }

    // Extract license key and hardware serial / HWID
    const userKey = sanitizeParam(
      body?.user_key ||
      body?.p_license_key ||
      body?.key ||
      req.query?.user_key ||
      req.query?.key,
      128
    )

    const serial = sanitizeParam(
      body?.serial ||
      body?.p_hwid ||
      body?.hwid ||
      req.query?.serial ||
      req.query?.hwid,
      256
    )

    // Extract target app / game (required — no empty-app loophole)
    const targetApp = sanitizeParam(
      body?.app ||
      body?.game ||
      body?.app_name ||
      body?.target ||
      req.query?.app ||
      req.query?.game,
      128
    )

    const appSecret = sanitizeParam(
      body?.secret ||
      body?.app_secret ||
      body?.p_secret ||
      req.headers?.['x-app-secret'] ||
      req.query?.secret,
      128
    )

    const clientVersion = sanitizeParam(
      body?.version ||
      body?.ver ||
      req.query?.version,
      64
    )

    if (!userKey) {
      return res.status(400).json({
        status: false,
        success: false,
        reason: 'License key is empty (user_key parameter required)'
      })
    }

    if (!serial) {
      return res.status(400).json({
        status: false,
        success: false,
        reason: 'Hardware ID is required (serial parameter required)'
      })
    }

    const upperKey = userKey.toUpperCase()
    if (upperKey === 'RYMON-MASTER-KEY' || upperKey.includes('MASTER') || upperKey.includes('OWNER')) {
      return res.status(403).json({
        status: false,
        success: false,
        reason: 'Master key bypass has been permanently revoked. Please use a valid license key.'
      })
    }

    if (!targetApp) {
      return res.status(400).json({
        status: false,
        success: false,
        reason: 'Application name is required (app parameter required)'
      })
    }

    if (!appSecret) {
      return res.status(401).json({
        status: false,
        success: false,
        reason: 'App Secret is required (secret parameter required)'
      })
    }

    const apps = await getRegisteredApps()
    const matchedApp = apps.find((a) => {
      if (!a) return false
      const aName = String(a.name || '').toLowerCase()
      const aId = String(a.id || '').toLowerCase()
      const t = targetApp.toLowerCase()
      return aName === t || aId === t
    })

    const expectedSecret = (matchedApp?.secret && String(matchedApp.secret).trim()) || computeAppSecret(targetApp)
    if (!safeSecretEquals(appSecret, expectedSecret)) {
      return res.status(401).json({
        status: false,
        success: false,
        reason: `Invalid App Secret for "${targetApp}". Check your KeyAuth Connect credentials.`
      })
    }

    if (matchedApp && (matchedApp.status === 'MAINTENANCE' || matchedApp.status === 'INACTIVE')) {
      return res.status(503).json({
        status: false,
        success: false,
        reason: `🛠️ ${matchedApp.name || targetApp} is currently under maintenance. Please try again later.`,
        data: {
          maintenance: true,
          announcement: matchedApp.announcement || 'Scheduled maintenance in progress.'
        }
      })
    }

    // Query Supabase RPC rpc_rymon_verify_license (with app secret + strict cross-app isolation)
    const rpcResponse = await fetch(SUPABASE_VERIFY_RPC, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_license_key: userKey,
        p_hwid: serial,
        p_game: targetApp,
        p_secret: appSecret
      })
    })

    if (!rpcResponse.ok) {
      const errText = await rpcResponse.text()
      console.error('[/api/connect] Supabase RPC failure:', rpcResponse.status, errText)
      return res.status(502).json({
        status: false,
        success: false,
        reason: 'License verification service temporarily unavailable'
      })
    }

    const rpcResult = await rpcResponse.json()
    const isValid = rpcResult && (rpcResult.valid === true || rpcResult.success === true)

    if (isValid) {
      const expStr = rpcResult.expires_at || 'Never'
      const appName = rpcResult.game || rpcResult.app || targetApp
      const updateRequired = Boolean(matchedApp?.version && clientVersion && clientVersion !== matchedApp.version)
      return res.status(200).json({
        status: true,
        success: true,
        message: rpcResult.message || 'Key authenticated successfully',
        data: {
          EXP: expStr,
          exp: expStr,
          expiry: expStr,
          app: appName,
          game: appName,
          status: rpcResult.status || 'ACTIVE',
          max_devices: rpcResult.devices_max || rpcResult.max_devices || 1,
          current_version: matchedApp?.version || '1.0.0',
          update_required: updateRequired,
          download_url: matchedApp?.download_url || '',
          announcement: matchedApp?.announcement || ''
        }
      })
    } else {
      return res.status(200).json({
        status: false,
        success: false,
        reason: rpcResult?.error || rpcResult?.message || 'Authentication failed: Invalid key or HWID mismatch'
      })
    }
  } catch (err) {
    console.error('[/api/connect] Gateway exception:', err)
    return res.status(500).json({
      status: false,
      success: false,
      reason: 'Internal Gateway Exception'
    })
  }
}
