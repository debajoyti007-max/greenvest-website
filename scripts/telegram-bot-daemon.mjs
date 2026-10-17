import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'

// Polyfill global WebSocket for Supabase Realtime across Node runtimes
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws
}

// Safely resolve secrets from environment variables or local .env (never expose or hardcode in git)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../.env')

function resolveSecret(key, fallback = '') {
  if (process.env[key]) return process.env[key].trim()
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8')
      const match = content.match(new RegExp(`^${key}\\s*=\\s*(.+)`, 'm'))
      if (match) return match[1].trim()
    } catch {}
  }
  return fallback
}

const BOT_TOKEN = resolveSecret('TELEGRAM_BOT_TOKEN') || resolveSecret('BOT_TOKEN')
if (!BOT_TOKEN) {
  console.error('❌ [CRITICAL] Neither TELEGRAM_BOT_TOKEN nor BOT_TOKEN found in environment!')
}
const OWNER_CHAT_ID = resolveSecret('OWNER_CHAT_ID', '5831800759') // @montage007pc (Montage)
const SUPABASE_URL = resolveSecret('VITE_SUPABASE_URL', 'https://zvjqpigduyvczidzafus.supabase.co')
const SUPABASE_SERVICE_KEY = resolveSecret('SUPABASE_SERVICE_ROLE_KEY') || resolveSecret('SUPABASE_SECRET_KEY')
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || resolveSecret('VITE_SUPABASE_ANON_KEY', 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws }
})

// In-Memory VIP Realtime Bridge (Sub-50ms RAM latency, zero Supabase database load)
const vipStates = new Map()

function getVipState(key) {
  const normKey = String(key || '').trim().toUpperCase()
  if (!normKey) return null
  if (!vipStates.has(normKey)) {
    vipStates.set(normKey, {
      license_key: normKey,
      is_online: false,
      is_paused: false,
      is_active: true,
      in_game_panel: true,
      aim_silent: false,
      hit_rate: 100,
      ignore_knocked: false,
      show_aim_line: false,
      show_aim_fov: false,
      aim_fov: 100.0,
      esp_box: true,
      esp_line: false,
      esp_skeleton: false,
      esp_name: false,
      esp_distance: true,
      esp_health: false,
      esp_count: false,
      esp_radar: false,
      speed_hack: false,
      speed_multiplier: 4.8,
      ghost_hack: false,
      no_reload: false,
      no_recoil: false,
      theme_color_index: 0,
      enemies: 0,
      bots: 0,
      emergency_purge: false,
      streamer_name: 'VIP|P:1|E:0|B:0',
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      _dirty: false
    })
  }
  return vipStates.get(normKey)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-License-Key',
  'Content-Type': 'application/json'
}

// Lightweight HTTP server for Render Cloud Web Service, Health Checks & VIP Bridge
const PORT = parseInt(process.env.PORT, 10) || 10000
const healthServer = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = urlObj.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  // 1. VIP Realtime State Query: GET /api/vip/state?key=RYMON-XXXX
  if (req.method === 'GET' && pathname === '/api/vip/state') {
    const key = urlObj.searchParams.get('key')
    const state = getVipState(key)
    if (!state) {
      res.writeHead(400, CORS_HEADERS)
      return res.end(JSON.stringify({ ok: false, error: 'Missing key parameter' }))
    }
    res.writeHead(200, CORS_HEADERS)
    return res.end(JSON.stringify({ ok: true, state }))
  }

  // 2. VIP Realtime Patch: POST/PATCH /api/vip/patch
  if ((req.method === 'POST' || req.method === 'PATCH') && pathname === '/api/vip/patch') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const key = payload.license_key || payload.key || urlObj.searchParams.get('key')
        const state = getVipState(key)
        if (!state) {
          res.writeHead(400, CORS_HEADERS)
          return res.end(JSON.stringify({ ok: false, error: 'Invalid or missing key' }))
        }

        // Apply incoming fields
        const allowed = [
          'is_online', 'is_paused', 'is_active', 'in_game_panel',
          'aim_silent', 'hit_rate', 'ignore_knocked', 'show_aim_line', 'show_aim_fov', 'aim_fov',
          'esp_box', 'esp_line', 'esp_skeleton', 'esp_name', 'esp_distance', 'esp_health', 'esp_count', 'esp_radar',
          'speed_hack', 'speed_multiplier', 'ghost_hack', 'no_reload', 'no_recoil',
          'theme_color_index', 'enemies', 'bots', 'emergency_purge', 'streamer_name'
        ]
        for (const f of allowed) {
          if (payload[f] !== undefined) {
            state[f] = payload[f]
          }
        }
        if (payload.streamer_name) {
          state.streamer_name = payload.streamer_name
          if (payload.streamer_name.includes('P:0')) state.in_game_panel = false
          if (payload.streamer_name.includes('P:1')) state.in_game_panel = true
          const eMatch = payload.streamer_name.match(/E:(\d+)/)
          const bMatch = payload.streamer_name.match(/B:(\d+)/)
          if (eMatch) state.enemies = parseInt(eMatch[1], 10)
          if (bMatch) state.bots = parseInt(bMatch[1], 10)
        }
        state.last_heartbeat = new Date().toISOString()
        state.updated_at = new Date().toISOString()
        state.version = (state.version || 1) + 1
        state._dirty = true

        res.writeHead(200, CORS_HEADERS)
        return res.end(JSON.stringify({ ok: true, state }))
      } catch {
        res.writeHead(400, CORS_HEADERS)
        return res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }))
      }
    })
    return
  }

  // 3. VIP Command Toggle: POST /api/vip/command
  if (req.method === 'POST' && pathname === '/api/vip/command') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const key = payload.key || payload.license_key
        const state = getVipState(key)
        if (!state) {
          res.writeHead(400, CORS_HEADERS)
          return res.end(JSON.stringify({ ok: false, error: 'Invalid or missing key' }))
        }
        if (payload.toggle !== undefined) {
          state[payload.toggle] = payload.value
          if (payload.toggle === 'esp_radar') {
            state.esp_count = Boolean(payload.value)
          }
        }
        if (payload.patch && typeof payload.patch === 'object') {
          Object.assign(state, payload.patch)
        }
        state.updated_at = new Date().toISOString()
        state.version = (state.version || 1) + 1
        state._dirty = true

        res.writeHead(200, CORS_HEADERS)
        return res.end(JSON.stringify({ ok: true, state }))
      } catch {
        res.writeHead(400, CORS_HEADERS)
        return res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }))
      }
    })
    return
  }

  // 4. Secure Telegram Message Dispatch Relay (Prevents exposing BOT_TOKEN to web clients)
  if (req.method === 'POST' && pathname === '/api/telegram/dispatch') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const targetChatId = payload.chat_id || OWNER_CHAT_ID
        const messageText = payload.text || ''
        const replyMarkup = payload.reply_markup

        if (!messageText) {
          res.writeHead(400, CORS_HEADERS)
          return res.end(JSON.stringify({ ok: false, error: 'Missing text parameter' }))
        }

        const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: messageText,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {})
          })
        })
        const tgJson = await tgResp.json()
        res.writeHead(200, CORS_HEADERS)
        return res.end(JSON.stringify(tgJson))
      } catch (err) {
        res.writeHead(500, CORS_HEADERS)
        return res.end(JSON.stringify({ ok: false, error: err.message || 'Telegram relay failed' }))
      }
    })
    return
  }

  // 5. Default Health Check
  res.writeHead(200, CORS_HEADERS)
  res.end(
    JSON.stringify({
      status: 'online',
      service: 'RYMON OFFICIAL TELEGRAM BOT & VIP REALTIME BRIDGE',
      bot: '@Rymon007bot',
      owner: '@montage007pc',
      active_vip_sessions: vipStates.size,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  )
})
healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [Render Web Service] Health & VIP Realtime Bridge listening on 0.0.0.0:${PORT}`)
})

// Gentle 60s background flush to Supabase for active VIP players (low DB load) + RAM Hygiene
setInterval(async () => {
  const now = Date.now()
  for (const [key, state] of vipStates.entries()) {
    if (state.is_online || state._dirty) {
      try {
        const telem = `VIP|P:${state.in_game_panel ? 1 : 0}|E:${state.enemies || 0}|B:${state.bots || 0}`
        await supabase
          .from('rymon_streamer_controls')
          .update({
            is_online: Boolean(state.is_online),
            is_paused: Boolean(state.is_paused),
            is_active: Boolean(state.is_active),
            aim_silent: Boolean(state.aim_silent),
            hit_rate: Number(state.hit_rate ?? 100),
            aim_fov: Number(state.aim_fov ?? 100),
            esp_box: Boolean(state.esp_box),
            esp_line: Boolean(state.esp_line),
            esp_skeleton: Boolean(state.esp_skeleton),
            esp_name: Boolean(state.esp_name),
            esp_distance: Boolean(state.esp_distance),
            esp_health: Boolean(state.esp_health),
            esp_count: Boolean(state.esp_count),
            esp_radar: Boolean(state.esp_radar),
            speed_hack: Boolean(state.speed_hack),
            speed_multiplier: Number(state.speed_multiplier ?? 4.8),
            ghost_hack: Boolean(state.ghost_hack),
            no_reload: Boolean(state.no_reload),
            no_recoil: Boolean(state.no_recoil),
            theme_color_index: Number(state.theme_color_index ?? 0),
            last_heartbeat: state.last_heartbeat || new Date().toISOString(),
            streamer_name: telem,
            updated_at: new Date().toISOString()
          })
          .eq('license_key', key)
        state._dirty = false
      } catch {}
    }

    // RAM Hygiene: Prune inactive keys older than 24h with zero unsaved changes to keep RAM < 40MB
    if (!state._dirty && !state.is_online) {
      const lastActive = state.updated_at ? new Date(state.updated_at).getTime() : 0
      if (lastActive > 0 && now - lastActive > 24 * 60 * 60 * 1000) {
        vipStates.delete(key)
      }
    }
  }
}, 60000)

// Auto Self-Ping to prevent Render free instance from sleeping
if (process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/health`
  console.log(`⏱️ [Render Keep-Alive] Scheduled 10-minute self-ping: ${pingUrl}`)
  setInterval(() => {
    fetch(pingUrl).catch(() => {})
  }, 10 * 60 * 1000)
}

const DEFAULT_PRICES = {
  '2 Hours': 15,
  '1 Day': 35,
  '3 Days': 50,
  '7 Days': 100,
  '15 Days': 180,
  '30 Days': 350
}

function formatDurationShort(ms) {
  const totalMins = Math.max(1, Math.round(ms / 60000))
  const days = Math.floor(totalMins / (60 * 24))
  const hours = Math.floor((totalMins % (60 * 24)) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function isActivelyPlaying(ctrl) {
  if (!ctrl || !ctrl.is_online || ctrl.is_paused || !ctrl.device_hwid) return false
  if (!ctrl.last_heartbeat) return false
  const ageMs = Date.now() - new Date(ctrl.last_heartbeat).getTime()
  return ageMs >= -60000 && ageMs <= 75000
}

function buildCustomerInlineKeyboard(isReseller, isOwner) {
  const rows = [
    [
      { text: '🔄 Reset Key (2/Day)', callback_data: 'cmd:help_reset' },
      { text: '🔍 Check Key Status', callback_data: 'cmd:help_check' }
    ],
    [
      { text: '📲 Download APK', callback_data: 'cmd:apk' },
      { text: '🆔 My Chat ID', callback_data: 'cmd:id' }
    ]
  ]
  if (isReseller || isOwner) {
    rows.push([{ text: '💼 Open Reseller Store & Wallet', callback_data: 'cmd:reseller_menu' }])
  } else {
    rows.push([{ text: '💼 Apply for Reseller (30D / 60D)', callback_data: 'cmd:apply_reseller' }])
  }
  if (isOwner) {
    rows.push([{ text: '👑 Open Root Owner Panel', callback_data: 'cmd:owner_menu' }])
  }
  return { inline_keyboard: rows }
}

function buildResellerInlineKeyboard(priceMap = DEFAULT_PRICES) {
  const p2h = priceMap['2 Hours'] ?? 15
  const p1 = priceMap['1 Day'] ?? 35
  const p3 = priceMap['3 Days'] ?? 50
  const p7 = priceMap['7 Days'] ?? 100
  const p15 = priceMap['15 Days'] ?? 180
  const p30 = priceMap['30 Days'] ?? 350
  return {
    inline_keyboard: [
      [
        { text: '💰 My Wallet & Sub', callback_data: 'res:wallet' },
        { text: '📋 My Keys', callback_data: 'res:mykeys' }
      ],
      [
        { text: `🛒 Buy 2H (₹${p2h})`, callback_data: 'res:buy:2h' },
        { text: `🛒 Buy 1D (₹${p1})`, callback_data: 'res:buy:1d' }
      ],
      [
        { text: `🛒 Buy 3D (₹${p3})`, callback_data: 'res:buy:3d' },
        { text: `🛒 Buy 7D (₹${p7})`, callback_data: 'res:buy:7d' }
      ],
      [
        { text: `🛒 Buy 15D (₹${p15})`, callback_data: 'res:buy:15d' },
        { text: `🛒 Buy 30D (₹${p30})`, callback_data: 'res:buy:30d' }
      ],
      [
        { text: '💳 Top-Up +₹500', callback_data: 'res:topup:500' },
        { text: '💳 Top-Up +₹1000', callback_data: 'res:topup:1000' }
      ],
      [{ text: '🏠 Main Menu', callback_data: 'cmd:main_menu' }]
    ]
  }
}

function buildOwnerInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Live Status', callback_data: 'own:status' },
        { text: '🟢 Playing Now', callback_data: 'own:playing' },
        { text: '🟡 Unused Keys', callback_data: 'own:unused' }
      ],
      [
        { text: '⚡ Mint 1D Key', callback_data: 'own:gen:1d' },
        { text: '⚡ Mint 7D Key', callback_data: 'own:gen:7d' },
        { text: '⚡ Mint 30D Key', callback_data: 'own:gen:30d' }
      ],
      [
        { text: '👥 All Resellers', callback_data: 'own:resellers' },
        { text: '🎟️ 30D Invite', callback_data: 'own:invite:30' },
        { text: '🎟️ 60D Invite', callback_data: 'own:invite:60' }
      ],
      [{ text: '🏠 Main Menu', callback_data: 'cmd:main_menu' }]
    ]
  }
}

async function sendTelegramReply(chatId, htmlText, replyMarkup) {
  try {
    const payload = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
    if (replyMarkup) payload.reply_markup = replyMarkup
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch (err) {
    console.error('[TG Send Error]', err)
  }
}

async function answerCallback(callbackQueryId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {})
      })
    })
  } catch {}
}

async function getSystemConfigValue(key, fallback = {}) {
  try {
    const { data } = await supabase
      .from('rymon_system_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (data?.value && typeof data.value === 'object') return data.value
  } catch {}
  return fallback
}

async function saveSystemConfigValue(key, value) {
  try {
    await supabase
      .from('rymon_system_config')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch {}
}

async function getResellerPriceMap(username) {
  const [globalPrices, userCustomMaps] = await Promise.all([
    getSystemConfigValue('global_default_key_prices', DEFAULT_PRICES),
    getSystemConfigValue('user_custom_key_prices', {})
  ])
  const base = { ...DEFAULT_PRICES, ...globalPrices }
  const clean = (username || '').toLowerCase()
  if (userCustomMaps[clean] && typeof userCustomMaps[clean] === 'object') {
    return { ...base, ...userCustomMaps[clean] }
  }
  return base
}

async function resolveTelegramReseller(chatId) {
  const bindings = await getSystemConfigValue('telegram_reseller_bindings', {})
  const bound = bindings[chatId]
  if (!bound || !bound.username) return null
  const { data } = await supabase
    .from('rymon_accounts')
    .select('id, username, role, balance, status, expires_at')
    .ilike('username', bound.username)
    .maybeSingle()
  return data || null
}

async function grantResellerByChatId({
  chatId,
  subDays = 30,
  initialBalance = 0,
  customUsername,
  customPassword,
  tgName,
  tgHandle
}) {
  const cleanChatId = String(chatId).trim()
  const safeDays = Number(subDays) === 60 ? 60 : 30
  const addBal = Math.max(0, Number(initialBalance) || 0)
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const expiresAtIso = new Date(nowMs + safeDays * 86400000).toISOString()

  const bindings = await getSystemConfigValue('telegram_reseller_bindings', {})
  const existingBinding = bindings[cleanChatId]
  const suffix = cleanChatId.replace(/[^0-9]/g, '').slice(-4) || '0007'
  const desiredUsername = (
    customUsername?.trim() ||
    existingBinding?.username ||
    `reseller_${suffix}`
  ).toLowerCase()
  const generatedPassword = customPassword?.trim() || `Rymon@${suffix}`

  let finalUsername = desiredUsername
  let finalBalance = addBal
  let createdNew = false

  const { data: existingAcc } = await supabase
    .from('rymon_accounts')
    .select('id, username, balance, role')
    .ilike('username', desiredUsername)
    .maybeSingle()

  if (existingAcc) {
    finalUsername = existingAcc.username
    finalBalance = Number(existingAcc.balance || 0) + addBal
    const nextRole =
      existingAcc.role === 'owner' || existingAcc.role === 'admin' ? existingAcc.role : 'reseller'
    await supabase
      .from('rymon_accounts')
      .update({
        role: nextRole,
        balance: finalBalance,
        expires_at: expiresAtIso,
        status: 'ACTIVE',
        updated_at: nowIso
      })
      .eq('id', existingAcc.id)
  } else {
    createdNew = true
    const { data: inserted } = await supabase
      .from('rymon_accounts')
      .insert({
        username: desiredUsername,
        password_hash: generatedPassword,
        email: `${desiredUsername}@rymon.vip`,
        role: 'reseller',
        balance: addBal,
        uplink: 'debajoyti',
        devices_used: 0,
        devices_max: 500,
        status: 'ACTIVE',
        expires_at: expiresAtIso
      })
      .select('username, balance')
      .maybeSingle()
    if (inserted) {
      finalUsername = inserted.username
      finalBalance = Number(inserted.balance || addBal)
    }
  }

  bindings[cleanChatId] = {
    chat_id: cleanChatId,
    username: finalUsername,
    tg_name: tgName || existingBinding?.tg_name || finalUsername,
    tg_handle: tgHandle || existingBinding?.tg_handle || '',
    linked_at: nowIso
  }
  await saveSystemConfigValue('telegram_reseller_bindings', bindings)

  const priceMap = await getResellerPriceMap(finalUsername)
  const welcomeLines = [
    `🎉 <b>CONGRATULATIONS! YOU ARE NOW AN OFFICIAL RYMON RESELLER!</b>`,
    ``,
    `🆔 <b>Linked Telegram Chat ID:</b> <code>${cleanChatId}</code>`,
    `👤 <b>Reseller Account:</b> <code>${finalUsername}</code>`,
    ...(createdNew ? [`🔑 <b>Web Password:</b> <code>${generatedPassword}</code>`] : []),
    `💰 <b>Wallet Balance:</b> <b>₹${finalBalance.toLocaleString('en-IN')}</b>`,
    `⏳ <b>Subscription Plan:</b> <b>${safeDays} Days</b> (Expires ${new Date(expiresAtIso).toLocaleDateString('en-IN')})`,
    ``,
    `🛒 <b>Tap any button below to buy/generate keys directly inside Telegram:</b>`
  ]
  await sendTelegramReply(
    cleanChatId,
    welcomeLines.join('\n'),
    buildResellerInlineKeyboard(priceMap)
  )

  return {
    username: finalUsername,
    password: createdNew ? generatedPassword : null,
    subDays: safeDays,
    balance: finalBalance
  }
}

async function handleKeyHwidReset(rawKey, isOwnerOverride, actorLabel) {
  const cleanKey = (rawKey || '').trim().toUpperCase()
  const DAILY_LIMIT = 2
  const DAY_WINDOW_MS = 86400000
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  if (!cleanKey) {
    return `ℹ️ <b>Usage:</b> Send <code>/reset RYMON-XXXX-XXXX</code> or simply paste your license key directly!`
  }

  const { data: licRecord } = await supabase
    .from('rymon_licenses')
    .select('license_key, status, expires_at, is_paused, game, plan_duration')
    .ilike('license_key', cleanKey)
    .maybeSingle()

  if (!licRecord) {
    return `❌ <b>Key Not Found:</b> <code>${cleanKey}</code>\nPlease double-check your license key and try again.`
  }

  if (licRecord.status === 'BANNED') {
    return `🚫 <b>Key Suspended:</b> <code>${cleanKey}</code> is BANNED and cannot be reset.`
  }

  const isExpired =
    licRecord.status === 'EXPIRED' ||
    Boolean(licRecord.expires_at && new Date(licRecord.expires_at).getTime() <= nowMs)
  if (isExpired) {
    return `⏰ <b>Key Expired:</b> <code>${cleanKey}</code> has expired. Please contact your seller to renew.`
  }

  const logMap = await getSystemConfigValue('hwid_reset_daily_log', {})
  const exactKey = licRecord.license_key.toUpperCase()
  const recentResets = (logMap[exactKey] || []).filter((ts) => nowMs - Number(ts) < DAY_WINDOW_MS)

  if (!isOwnerOverride) {
    if (recentResets.length >= DAILY_LIMIT) {
      const oldestTs = Math.min(...recentResets)
      const waitMs = Math.max(60000, DAY_WINDOW_MS - (nowMs - oldestTs))
      const waitStr = formatDurationShort(waitMs)
      return [
        `🛡️ <b>DAILY HWID RESET LIMIT REACHED (2/2)</b>`,
        ``,
        `• <b>Key:</b> <code>${exactKey}</code>`,
        `• <b>Resets Used Today:</b> 2 / 2 (Max 2 per day)`,
        `• <b>Next Reset Available In:</b> ~${waitStr}`,
        ``,
        `<i>Normal users can reset their key up to 2 times per day. Contact your seller or @montage007pc if you need an emergency override.</i>`
      ].join('\n')
    }
    recentResets.push(nowMs)
    logMap[exactKey] = recentResets
  } else {
    delete logMap[exactKey]
  }

  await saveSystemConfigValue('hwid_reset_daily_log', logMap)

  const nextStatus = licRecord.is_paused
    ? 'PAUSED'
    : licRecord.expires_at
    ? 'ACTIVE'
    : 'WAITING'

  await supabase
    .from('rymon_licenses')
    .update({
      device_hwid: '',
      devices_used: 0,
      status: nextStatus,
      updated_at: nowIso
    })
    .eq('license_key', licRecord.license_key)

  await supabase
    .from('rymon_streamer_controls')
    .update({
      device_hwid: '',
      devices_used: 0,
      is_online: false,
      updated_at: nowIso
    })
    .eq('license_key', licRecord.license_key)

  await supabase.from('rymon_activities').insert({
    title: isOwnerOverride ? 'Owner Override HWID Reset (TG)' : 'Customer HWID Reset (TG 2/Day)',
    event_type: 'HWID_RESET',
    details: isOwnerOverride
      ? `Owner override cleared HWID & restored 2/day quota for ${exactKey}`
      : `Device HWID unbound for ${exactKey} (${recentResets.length}/${DAILY_LIMIT} used today) via @Rymon007bot by ${actorLabel}`,
    actor_username: actorLabel,
    status: 'SUCCESS'
  })

  if (isOwnerOverride) {
    return [
      `👑 <b>OWNER OVERRIDE — HWID RESET COMPLETE</b>`,
      ``,
      `• <b>Key:</b> <code>${exactKey}</code>`,
      `• <b>Game:</b> ${licRecord.game}`,
      `• <b>Device Lock:</b> Cleared (Unbound)`,
      `• <b>Customer Daily Quota:</b> Restored to 2 / 2 today`,
      `• <b>Timer:</b> Preserved`
    ].join('\n')
  }

  const usedToday = recentResets.length
  const remaining = Math.max(0, DAILY_LIMIT - usedToday)
  return [
    `✅ <b>KEY HWID RESET SUCCESSFUL!</b>`,
    ``,
    `• <b>Key:</b> <code>${exactKey}</code>`,
    `• <b>Game:</b> ${licRecord.game} (${licRecord.plan_duration})`,
    `• <b>Device Lock:</b> Unbound (Ready for new login)`,
    `• <b>Daily Resets Used:</b> ${usedToday} / ${DAILY_LIMIT} today (<b>${remaining} left today</b>)`,
    `• <b>Expiry Timer:</b> Preserved`
  ].join('\n')
}

async function processUpdate(upd) {
  const cbq = upd.callback_query
  const msg = cbq ? cbq.message : upd.message || upd.channel_post
  if (!msg || !msg.chat) return

  const chatId = String(msg.chat.id)
  const senderFrom = cbq ? cbq.from : msg.from
  const senderName = senderFrom?.first_name || msg.chat.title || 'VIP User'
  const senderUser = senderFrom?.username ? `@${senderFrom.username}` : senderName
  const isOwnerChat = chatId === OWNER_CHAT_ID

  const linkedReseller = await resolveTelegramReseller(chatId)
  const isResellerChat = Boolean(linkedReseller)

  let text = String(msg.text || '').trim()
  if (cbq && cbq.data) {
    const data = String(cbq.data)
    await answerCallback(cbq.id)

    if (data === 'cmd:main_menu') text = '/start'
    else if (data === 'cmd:help_reset') {
      await sendTelegramReply(
        chatId,
        `🔄 <b>HOW TO RESET YOUR KEY HWID (MAX 2/DAY):</b>\n\nSimply <b>paste &amp; send your License Key</b> right here in the chat (e.g. <code>RYMON-FF-XXXX-XXXX</code>) or send:\n<code>/reset RYMON-FF-XXXX-XXXX</code>`
      )
      return
    } else if (data === 'cmd:help_check') {
      await sendTelegramReply(
        chatId,
        `🔍 <b>CHECK KEY STATUS &amp; DAILY RESETS:</b>\n\nSend:\n<code>/check RYMON-FF-XXXX-XXXX</code>`
      )
      return
    } else if (data === 'cmd:apk') text = '/apk'
    else if (data === 'cmd:id') text = '/id'
    else if (data === 'cmd:apply_reseller') text = '/apply'
    else if (data === 'cmd:reseller_menu') text = '/wallet'
    else if (data === 'cmd:owner_menu') text = '/owner'
    else if (data === 'res:wallet') text = '/wallet'
    else if (data === 'res:mykeys') text = '/mykeys'
    else if (data.startsWith('res:buy:')) {
      const planCode = data.split(':')[2] || '1d'
      text = `/buy ${planCode} 1`
    } else if (data.startsWith('res:topup:')) {
      const amt = data.split(':')[2] || '500'
      text = `/topup ${amt}`
    } else if (data === 'own:status') text = '/status'
    else if (data === 'own:playing') text = '/playing'
    else if (data === 'own:unused') text = '/unused'
    else if (data.startsWith('own:gen:')) {
      const planCode = data.split(':')[2] || '1d'
      text = `/gen ${planCode}`
    } else if (data === 'own:resellers') text = '/resellers'
    else if (data.startsWith('own:invite:')) {
      const days = data.split(':')[2] || '30'
      text = `/invite ${days}d 0`
    } else if (data.startsWith('own:grant:')) {
      if (!isOwnerChat) return
      const [, , targetChatId, daysStr, balStr] = data.split(':')
      const grantRes = await grantResellerByChatId({
        chatId: targetChatId,
        subDays: Number(daysStr) === 60 ? 60 : 30,
        initialBalance: Number(balStr) || 0
      })
      await sendTelegramReply(
        chatId,
        `👑 <b>RESELLER GRANTED VIA 1-TAP</b>\n\n• <b>Chat ID:</b> <code>${targetChatId}</code>\n• <b>Username:</b> <code>${grantRes.username}</code>${grantRes.password ? `\n• <b>Password:</b> <code>${grantRes.password}</code>` : ''}\n• <b>Plan:</b> ${grantRes.subDays} Days\n• <b>Wallet:</b> ₹${grantRes.balance}`,
        buildOwnerInlineKeyboard()
      )
      return
    } else if (data.startsWith('own:addbal:')) {
      if (!isOwnerChat) return
      const [, , targetChatId, amtStr] = data.split(':')
      text = `/addbal ${targetChatId} ${amtStr}`
    } else if (data.startsWith('own:rejecttopup:')) {
      if (!isOwnerChat) return
      const [, , targetChatId, amtStr] = data.split(':')
      await sendTelegramReply(
        targetChatId,
        `❌ Your wallet top-up request of <b>₹${amtStr}</b> was declined by the Owner. Please contact @montage007pc with your payment proof.`
      )
      await sendTelegramReply(
        chatId,
        `✅ Top-up request (₹${amtStr}) for Chat ID <code>${targetChatId}</code> rejected.`
      )
      return
    }
  }

  if (!text) return
  const lowerText = text.toLowerCase()

  if (lowerText.startsWith('/start') || lowerText.startsWith('/help')) {
    const lines = [
      `⚡ <b>RYMON OFFICIAL BOT (@Rymon007bot)</b>`,
      `Welcome, <b>${senderName}</b>!`,
      `🆔 <b>Chat ID:</b> <code>${chatId}</code>${isOwnerChat ? ' (👑 Root Owner)' : isResellerChat ? ` (💼 Reseller: @${linkedReseller?.username})` : ''}`,
      ``,
      `🔄 <b>Customer Self-Service Key Reset (Max 2/Day):</b>`,
      `• <b>Paste your License Key directly</b> (e.g. <code>RYMON-FF-XXXX-XXXX</code>) or use <code>/reset KEY</code>`,
      `• <code>/check KEY</code> — Check key status &amp; daily resets`,
      `• <code>/apk</code> — Download Latest RYMON STREAMER APK`
    ]
    if (isResellerChat && linkedReseller) {
      lines.push(
        ``,
        `💼 <b>RESELLER STORE ACTIVE (@${linkedReseller.username}):</b>`,
        `• <b>Wallet Balance:</b> ₹${Number(linkedReseller.balance || 0).toLocaleString('en-IN')}`,
        `• Tap <b>Open Reseller Store &amp; Wallet</b> below to buy keys in 1 click!`
      )
    }
    if (isOwnerChat) {
      lines.push(
        ``,
        `👑 <b>OWNER QUICK COMMANDS:</b>`,
        `• <code>/givereseller CHAT_ID 30d 500</code> — Grant Reseller by Chat ID`,
        `• <code>/addbal CHAT_ID 1000</code> — Add ₹ Balance to Reseller`,
        `• <code>/renew CHAT_ID 30d</code> — Renew 30D/60D Reseller Sub`,
        `• <code>/resellers</code> — View all Resellers &amp; Chat IDs`
      )
    }
    await sendTelegramReply(
      chatId,
      lines.join('\n'),
      buildCustomerInlineKeyboard(isResellerChat, isOwnerChat)
    )
    return
  }

  if (lowerText.startsWith('/owner') && isOwnerChat) {
    const reply = [
      `👑 <b>ROOT OWNER COMMAND CENTER (@montage007pc)</b>`,
      ``,
      `<b>Tap a button below or use slash commands:</b>`,
      `• <code>/givereseller &lt;CHAT_ID&gt; &lt;30d|60d&gt; [balance] [username]</code>`,
      `• <code>/addbal &lt;CHAT_ID_OR_USER&gt; &lt;amount&gt;</code>`,
      `• <code>/renew &lt;CHAT_ID_OR_USER&gt; &lt;30d|60d&gt;</code>`,
      `• <code>/banuser &lt;CHAT_ID_OR_USER&gt;</code> | <code>/unbanuser &lt;CHAT_ID_OR_USER&gt;</code>`,
      `• <code>/gen 1d|3d|7d|15d|30d|2h [vip]</code>`,
      `• <code>/purgekeys [days]</code> — Clean expired short-term keys`,
      `• <code>/pause KEY</code> | <code>/resume KEY</code> | <code>/reset KEY</code>`
    ].join('\n')
    await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
    return
  }

  if (lowerText.startsWith('/id')) {
    await sendTelegramReply(
      chatId,
      `🆔 <b>Your Telegram Chat ID:</b> <code>${chatId}</code>${isOwnerChat ? ' (👑 Root Owner Verified)' : isResellerChat ? ` (💼 Reseller @${linkedReseller?.username})` : ''}`
    )
    return
  }

  if (lowerText.startsWith('/apk')) {
    const reply = [
      `📲 <b>RYMON STREAMER OFFICIAL APK (v4.2.1)</b>`,
      ``,
      `✨ <b>Architecture:</b> ARM64-v8a (Android 5.0 - 15+)`,
      `🛡️ <b>Engine:</b> Safe Streamer Overlay + Realtime Cloud Telemetry`,
      `⚡ <b>Auth:</b> Sovereign License Key System`,
      ``,
      `⬇️ <i>Contact @montage007pc to receive the latest release build APK directly in chat.</i>`
    ].join('\n')
    await sendTelegramReply(chatId, reply)
    return
  }

  if (lowerText.startsWith('/apply')) {
    await sendTelegramReply(
      chatId,
      `✅ <b>Reseller Application Sent to Owner (@montage007pc)!</b>\n\n🆔 <b>Your Chat ID:</b> <code>${chatId}</code>\nAs soon as the Owner approves your 30-Day or 60-Day Reseller plan, @Rymon007bot will notify you here automatically.`
    )
    const ownerAlert = [
      `📩 <b>NEW RESELLER APPLICATION</b>`,
      ``,
      `• <b>Applicant:</b> ${senderName} (${senderUser})`,
      `• <b>Telegram Chat ID:</b> <code>${chatId}</code>`,
      ``,
      `<i>Tap a button below to make them an Official Reseller immediately:</i>`
    ].join('\n')
    await sendTelegramReply(OWNER_CHAT_ID, ownerAlert, {
      inline_keyboard: [
        [
          { text: '✅ Give 30D Reseller (₹0)', callback_data: `own:grant:${chatId}:30:0` },
          { text: '💎 Give 60D Reseller (₹0)', callback_data: `own:grant:${chatId}:60:0` }
        ],
        [
          { text: '✅ 30D + ₹500 Wallet', callback_data: `own:grant:${chatId}:30:500` },
          { text: '💎 60D + ₹1000 Wallet', callback_data: `own:grant:${chatId}:60:1000` }
        ]
      ]
    })
    return
  }

  if (lowerText.startsWith('/login')) {
    const parts = text.split(/\s+/)
    const uName = (parts[1] || '').trim()
    const uPass = (parts[2] || '').trim()
    if (!uName || !uPass) {
      await sendTelegramReply(
        chatId,
        `ℹ️ <b>Link Existing Reseller Account:</b>\n<code>/login YOUR_USERNAME YOUR_PASSWORD</code>`
      )
      return
    }
    const { data: userRow } = await supabase
      .from('rymon_accounts')
      .select('id, username, role, balance, password_hash')
      .ilike('username', uName)
      .maybeSingle()
    if (!userRow || userRow.password_hash !== uPass) {
      await sendTelegramReply(chatId, `❌ Invalid username or password.`)
      return
    }
    const bindings = await getSystemConfigValue('telegram_reseller_bindings', {})
    bindings[chatId] = {
      chat_id: chatId,
      username: userRow.username,
      tg_name: senderName,
      tg_handle: senderUser,
      linked_at: new Date().toISOString()
    }
    await saveSystemConfigValue('telegram_reseller_bindings', bindings)
    const priceMap = await getResellerPriceMap(userRow.username)
    await sendTelegramReply(
      chatId,
      `✅ <b>Telegram Linked to @${userRow.username}!</b>\n\n• <b>Role:</b> ${String(userRow.role).toUpperCase()}\n• <b>Wallet Balance:</b> ₹${Number(userRow.balance || 0).toLocaleString('en-IN')}\n\n<i>Tap any button below to buy keys directly from Telegram:</i>`,
      buildResellerInlineKeyboard(priceMap)
    )
    return
  }

  if (
    lowerText.startsWith('/wallet') ||
    lowerText.startsWith('/me') ||
    lowerText.startsWith('/buy') ||
    lowerText.startsWith('/mykeys') ||
    lowerText.startsWith('/topup') ||
    lowerText.startsWith('/extend')
  ) {
    const activeAccount = isOwnerChat
      ? {
          id: '1',
          username: 'debajoyti',
          role: 'owner',
          balance: 9999999,
          status: 'ACTIVE'
        }
      : linkedReseller

    if (!activeAccount) {
      await sendTelegramReply(
        chatId,
        `🔒 <b>Reseller Access Required</b>\n\nYour Telegram Chat ID (<code>${chatId}</code>) is not linked to a Reseller account yet.\n• Tap <b>💼 Apply for Reseller</b> below, or\n• If you already have a website account, type <code>/login username password</code>.`,
        buildCustomerInlineKeyboard(false, false)
      )
      return
    }

    const priceMap = await getResellerPriceMap(activeAccount.username)

    if (lowerText.startsWith('/wallet') || lowerText.startsWith('/me')) {
      const isSubExpired =
        activeAccount.role !== 'owner' &&
        Boolean(activeAccount.expires_at && new Date(activeAccount.expires_at).getTime() < Date.now())
      const subText =
        activeAccount.role === 'owner'
          ? '👑 Unlimited (Root Owner)'
          : activeAccount.expires_at
          ? `${isSubExpired ? '🔴 EXPIRED' : '🟢 ACTIVE'} (Until ${new Date(activeAccount.expires_at).toLocaleDateString('en-IN')})`
          : '🟢 ACTIVE (30D/60D)'

      const reply = [
        `💼 <b>RESELLER STORE &amp; WALLET (@${activeAccount.username})</b>`,
        ``,
        `🆔 <b>Chat ID:</b> <code>${chatId}</code>`,
        `💰 <b>Wallet Balance:</b> <b>${activeAccount.role === 'owner' ? '∞ UNLIMITED' : `₹${Number(activeAccount.balance || 0).toLocaleString('en-IN')}`}</b>`,
        `⏳ <b>Subscription:</b> ${subText}`,
        ``,
        `🏷️ <b>Your Key Price List (1 Device):</b>`,
        `• 2 Hours: <b>₹${priceMap['2 Hours'] ?? 15}</b> | 1 Day: <b>₹${priceMap['1 Day'] ?? 35}</b>`,
        `• 3 Days: <b>₹${priceMap['3 Days'] ?? 50}</b> | 7 Days: <b>₹${priceMap['7 Days'] ?? 100}</b>`,
        `• 15 Days: <b>₹${priceMap['15 Days'] ?? 180}</b> | 30 Days: <b>₹${priceMap['30 Days'] ?? 350}</b>`,
        ``,
        `<i>Tap any plan button below to buy &amp; generate a key immediately:</i>`
      ].join('\n')
      await sendTelegramReply(chatId, reply, buildResellerInlineKeyboard(priceMap))
      return
    }

    if (lowerText.startsWith('/buy')) {
      const parts = text.split(/\s+/)
      const arg = (parts[1] || '1d').toLowerCase()
      const isVipRequested = parts.some((p) => p.toLowerCase() === 'vip') || arg.includes('vip')
      const cleanArg = arg.replace('vip', '')
      const qty = Math.min(10, Math.max(1, parseInt(parts[2] || '1') || 1))
      const durationMap = {
        '2h': '2 Hours',
        '1d': '1 Day',
        '3d': '3 Days',
        '7d': '7 Days',
        '15d': '15 Days',
        '30d': '30 Days'
      }
      const rawDuration = durationMap[cleanArg] || durationMap[arg]
      if (!rawDuration) {
        await sendTelegramReply(
          chatId,
          `ℹ️ <b>Usage:</b> Tap a Buy button below or send:\n<code>/buy 1d</code> (Standard) | <code>/buy 1d vip</code> (VIP Streamer)\n<code>/buy 3d</code> | <code>/buy 7d</code> | <code>/buy 30d</code>`,
          buildResellerInlineKeyboard(priceMap)
        )
        return
      }
      const planDuration = isVipRequested ? `${rawDuration} [VIP]` : rawDuration

      if (activeAccount.status === 'BANNED') {
        await sendTelegramReply(chatId, `🚫 Your account is suspended and cannot generate keys.`)
        return
      }
      if (
        activeAccount.role !== 'owner' &&
        activeAccount.expires_at &&
        new Date(activeAccount.expires_at).getTime() < Date.now()
      ) {
        await sendTelegramReply(
          chatId,
          `⏰ Your Reseller subscription expired on ${new Date(activeAccount.expires_at).toLocaleDateString('en-IN')}. Contact @montage007pc to renew (30 Days / 60 Days).`
        )
        return
      }

      const basePrice = priceMap[rawDuration] ?? 35
      const unitPrice = isVipRequested ? Math.round(basePrice * 1.5) : basePrice
      const totalCost = unitPrice * qty
      const liveBal = Number(activeAccount.balance || 0)

      if (activeAccount.role !== 'owner' && liveBal < totalCost) {
        await sendTelegramReply(
          chatId,
          `❌ <b>Insufficient Wallet Balance!</b>\n• <b>Cost:</b> ₹${totalCost.toLocaleString('en-IN')} (${qty}x ${planDuration} @ ₹${unitPrice})\n• <b>Your Wallet:</b> ₹${liveBal.toLocaleString('en-IN')}\n\nTap <b>💳 Top-Up</b> below to request wallet credit from Owner!`,
          buildResellerInlineKeyboard(priceMap)
        )
        return
      }

      const nextBalance = activeAccount.role === 'owner' ? liveBal : Math.max(0, liveBal - totalCost)
      if (activeAccount.role !== 'owner') {
        await supabase
          .from('rymon_accounts')
          .update({ balance: nextBalance, updated_at: new Date().toISOString() })
          .eq('id', activeAccount.id)
      }

      const generatedKeys = []
      for (let i = 0; i < qty; i++) {
        const b1 = Math.random().toString(36).substring(2, 6).toUpperCase()
        const b2 = Math.random().toString(36).substring(2, 6).toUpperCase()
        generatedKeys.push(`RYMON-FF-${b1}-${b2}`)
      }

      const licPayloads = generatedKeys.map((k) => ({
        license_key: k,
        game: 'Free Fire MAX',
        plan_duration: planDuration,
        creator_username: activeAccount.username,
        devices_used: 0,
        devices_max: 1,
        device_hwid: '',
        status: 'WAITING',
        is_paused: false,
        expires_at: null
      }))
      await supabase.from('rymon_licenses').insert(licPayloads)

      // Lazy Creation: Only insert into rymon_streamer_controls if VIP Streamer Key
      if (isVipRequested) {
        const ctrlPayloads = generatedKeys.map((k) => ({
          license_key: k,
          game_name: 'Free Fire MAX',
          plan_duration: planDuration,
          creator: activeAccount.username,
          devices_max: 1,
          devices_used: 0,
          device_hwid: '',
          is_active: true,
          is_paused: false,
          is_online: false,
          updated_at: new Date().toISOString()
        }))
        await supabase.from('rymon_streamer_controls').upsert(ctrlPayloads, { onConflict: 'license_key' })
      }

      const keyLines = generatedKeys.map((k, idx) => `${idx + 1}. <code>${k}</code>`).join('\n')
      const reply = [
        `✅ <b>${isVipRequested ? '👑 VIP STREAMER' : '📱 STANDARD'} KEY PURCHASED &amp; GENERATED!</b>`,
        ``,
        `🔑 <b>Tap Key to Copy:</b>`,
        keyLines,
        ``,
        `• <b>Tier:</b> ${isVipRequested ? '👑 VIP Streamer (Web Remote Enabled)' : '📱 Standard (Zero-Lag Mobile APK)'}`,
        `• <b>Game:</b> Free Fire`,
        `• <b>Plan:</b> ${planDuration} (Starts on 1st APK Login)`,
        `• <b>Cost Deducted:</b> ${activeAccount.role === 'owner' ? 'FREE (Owner)' : `₹${totalCost}`}`,
        `• <b>Remaining Wallet:</b> <b>${activeAccount.role === 'owner' ? '∞ UNLIMITED' : `₹${nextBalance.toLocaleString('en-IN')}`}</b>`
      ].join('\n')
      await sendTelegramReply(chatId, reply, buildResellerInlineKeyboard(priceMap))

      if (!isOwnerChat) {
        await sendTelegramReply(
          OWNER_CHAT_ID,
          `🛒 <b>RESELLER KEY PURCHASE (@${activeAccount.username})</b>\n• <b>Plan:</b> ${qty}x ${planDuration} (₹${totalCost})\n• <b>Key:</b> <code>${generatedKeys.join(', ')}</code>\n• <b>New Balance:</b> ₹${nextBalance.toLocaleString('en-IN')}`
        )
      }
      return
    }

    if (lowerText.startsWith('/mykeys')) {
      const { data: myKeys } = await supabase
        .from('rymon_licenses')
        .select('license_key, plan_duration, status')
        .ilike('creator_username', activeAccount.username)
        .order('created_at', { ascending: false })
        .limit(30)
      const list = myKeys || []
      if (list.length === 0) {
        await sendTelegramReply(
          chatId,
          `📋 You have 0 generated keys yet. Tap a <b>🛒 Buy</b> button below to generate your first key!`,
          buildResellerInlineKeyboard(priceMap)
        )
      } else {
        const waitingCount = list.filter((k) => k.status === 'WAITING').length
        const activeCount = list.filter((k) => k.status === 'ACTIVE').length
        const lines = list
          .slice(0, 25)
          .map((k, i) => `${i + 1}. <code>${k.license_key}</code> — ${k.plan_duration} [${k.status}]`)
          .join('\n')
        await sendTelegramReply(
          chatId,
          `📋 <b>YOUR GENERATED KEYS (@${activeAccount.username})</b>\n🟡 Unused: <b>${waitingCount}</b> | ⚡ Active: <b>${activeCount}</b>\n\n${lines}`,
          buildResellerInlineKeyboard(priceMap)
        )
      }
      return
    }

    if (lowerText.startsWith('/topup')) {
      const parts = text.split(/\s+/)
      const reqAmt = Math.max(100, parseInt(parts[1] || '500') || 500)
      const note = parts.slice(2).join(' ') || 'Via Telegram Bot'
      await sendTelegramReply(
        chatId,
        `💳 <b>Top-Up Request Sent (₹${reqAmt.toLocaleString('en-IN')})!</b>\nOwner (@montage007pc) has been notified with a 1-tap approval button.`
      )
      await sendTelegramReply(
        OWNER_CHAT_ID,
        [
          `💳 <b>RESELLER WALLET TOP-UP REQUEST</b>`,
          ``,
          `• <b>Reseller:</b> @${activeAccount.username} (${senderUser})`,
          `• <b>Chat ID:</b> <code>${chatId}</code>`,
          `• <b>Current Balance:</b> ₹${Number(activeAccount.balance || 0).toLocaleString('en-IN')}`,
          `• <b>Requested Add:</b> <b>+₹${reqAmt.toLocaleString('en-IN')}</b>`,
          `• <b>Note:</b> ${note}`,
          ``,
          `<i>Tap below to credit their wallet immediately:</i>`
        ].join('\n'),
        {
          inline_keyboard: [
            [
              {
                text: `✅ Approve +₹${reqAmt}`,
                callback_data: `own:addbal:${chatId}:${reqAmt}`
              },
              {
                text: '❌ Reject',
                callback_data: `own:rejecttopup:${chatId}:${reqAmt}`
              }
            ]
          ]
        }
      )
      return
    }
  }

  if (lowerText.startsWith('/reset')) {
    const parts = text.split(/\s+/)
    const targetKey = (parts[1] || '').trim().toUpperCase()
    const reply = await handleKeyHwidReset(targetKey, isOwnerChat, senderUser)
    await sendTelegramReply(chatId, reply)
    return
  }

  if (lowerText.startsWith('/check')) {
    const parts = text.split(/\s+/)
    const queryKey = (parts[1] || '').trim().toUpperCase()
    if (!queryKey) {
      await sendTelegramReply(chatId, `ℹ️ Usage: <code>/check RYMON-XXXX-XXXX</code>`)
      return
    }
    const [{ data: found }, { data: ctrl }, logMap] = await Promise.all([
      supabase.from('rymon_licenses').select('license_key, status, game, plan_duration, creator_username, device_hwid, expires_at').ilike('license_key', queryKey).maybeSingle(),
      supabase.from('rymon_streamer_controls').select('license_key, is_online, is_paused, device_hwid, last_heartbeat').ilike('license_key', queryKey).maybeSingle(),
      getSystemConfigValue('hwid_reset_daily_log', {})
    ])
    if (!found) {
      await sendTelegramReply(chatId, `❌ Key <code>${queryKey}</code> not found in database.`)
      return
    }
    const exactKey = found.license_key.toUpperCase()
    const recent = (logMap[exactKey] || []).filter((ts) => Date.now() - Number(ts) < 86400000)
    const leftToday = Math.max(0, 2 - recent.length)
    const playing = isActivelyPlaying(ctrl)
    const reply = [
      `🔍 <b>KEY INSPECTION:</b> <code>${found.license_key}</code>`,
      ``,
      `• <b>Status:</b> ${playing ? '🟢 PLAYING NOW' : found.status}`,
      `• <b>Game:</b> ${found.game}`,
      `• <b>Plan:</b> ${found.plan_duration} (Max 30D)`,
      `• <b>Seller:</b> @${found.creator_username}`,
      `• <b>HWID:</b> <code>${found.device_hwid || 'Unbound (Ready for Login)'}</code>`,
      `• <b>Daily Resets Left:</b> <b>${leftToday} / 2 today</b>`,
      `• <b>Expires:</b> ${found.expires_at ? new Date(found.expires_at).toLocaleString('en-IN') : 'Starts on 1st APK Login'}`
    ].join('\n')
    await sendTelegramReply(chatId, reply)
    return
  }

  if (
    lowerText.startsWith('/status') ||
    lowerText.startsWith('/unused') ||
    lowerText.startsWith('/playing') ||
    lowerText.startsWith('/gen') ||
    lowerText.startsWith('/pause') ||
    lowerText.startsWith('/resume') ||
    lowerText.startsWith('/givereseller') ||
    lowerText.startsWith('/addreseller') ||
    lowerText.startsWith('/addbal') ||
    lowerText.startsWith('/renew') ||
    lowerText.startsWith('/resellers') ||
    lowerText.startsWith('/invite') ||
    lowerText.startsWith('/banuser') ||
    lowerText.startsWith('/unbanuser') ||
    lowerText.startsWith('/broadcast') ||
    lowerText.startsWith('/purgekeys') ||
    lowerText.startsWith('/clean')
  ) {
    if (!isOwnerChat) {
      await sendTelegramReply(
        chatId,
        `🔒 <b>Restricted Command:</b> This command is reserved for the Root Owner (@montage007pc).`
      )
      return
    }

    if (lowerText.startsWith('/status')) {
      const [{ data: lics }, { data: ctrls }, { data: usrs }, bindings] = await Promise.all([
        supabase.from('rymon_licenses').select('status, is_paused'),
        supabase.from('rymon_streamer_controls').select('license_key, is_online, is_paused, device_hwid, last_heartbeat'),
        supabase.from('rymon_accounts').select('id'),
        getSystemConfigValue('telegram_reseller_bindings', {})
      ])
      const allLics = lics || []
      const playingCount = (ctrls || []).filter((c) => isActivelyPlaying(c)).length
      const unusedCount = allLics.filter((k) => k.status === 'WAITING').length
      const activeCount = allLics.filter((k) => k.status === 'ACTIVE').length
      const pausedCount = allLics.filter((k) => k.status === 'PAUSED' || k.is_paused).length
      const expiredCount = allLics.filter((k) => k.status === 'EXPIRED').length
      const reply = [
        `📊 <b>RYMON OFFICIAL — LIVE PLATFORM STATUS</b>`,
        ``,
        `🟢 <b>Playing Now (In-Game):</b> ${playingCount}`,
        `⚡ <b>Active Keys:</b> ${activeCount}`,
        `🟡 <b>Unused (Waiting) Keys:</b> ${unusedCount}`,
        `⏸️ <b>Paused Keys:</b> ${pausedCount}`,
        `🔴 <b>Expired Keys:</b> ${expiredCount}`,
        `🔑 <b>Total Keys:</b> ${allLics.length}`,
        `💼 <b>Telegram-Linked Resellers:</b> ${Object.keys(bindings).length}`,
        `👥 <b>Total Staff/Resellers:</b> ${(usrs || []).length}`
      ].join('\n')
      await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
      return
    }

    if (lowerText.startsWith('/unused')) {
      const { data: unusedKeys } = await supabase
        .from('rymon_licenses')
        .select('license_key, plan_duration, game')
        .eq('status', 'WAITING')
        .order('created_at', { ascending: false })
      const list = unusedKeys || []
      if (list.length === 0) {
        await sendTelegramReply(
          chatId,
          `🟡 No Unused (WAITING) keys found right now.`,
          buildOwnerInlineKeyboard()
        )
      } else {
        const listStr = list
          .slice(0, 30)
          .map((k, idx) => `${idx + 1}. <code>${k.license_key}</code> (${k.plan_duration} • ${k.game})`)
          .join('\n')
        const reply = [
          `🟡 <b>UNUSED (WAITING) KEYS (${list.length})</b>`,
          `<i>Tap any key below to copy:</i>`,
          ``,
          listStr,
          list.length > 30 ? `\n<i>...and ${list.length - 30} more keys</i>` : ''
        ].join('\n')
        await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
      }
      return
    }

    if (lowerText.startsWith('/playing')) {
      const { data: ctrls } = await supabase
        .from('rymon_streamer_controls')
        .select('license_key, is_online, is_paused, device_hwid, last_heartbeat, game_name, creator')
      const playingList = (ctrls || []).filter((c) => isActivelyPlaying(c))
      if (playingList.length === 0) {
        await sendTelegramReply(
          chatId,
          `⚪ <b>0 Players In-Game Right Now.</b> All bound keys are currently idle/offline.`,
          buildOwnerInlineKeyboard()
        )
      } else {
        const listStr = playingList
          .map(
            (c, idx) =>
              `${idx + 1}. 🟢 <code>${c.license_key}</code> — ${c.game_name || 'Free Fire'} (@${c.creator || 'rymon'})`
          )
          .join('\n')
        await sendTelegramReply(
          chatId,
          `🟢 <b>CURRENTLY PLAYING IN-GAME (${playingList.length})</b>\n\n${listStr}`,
          buildOwnerInlineKeyboard()
        )
      }
      return
    }

    if (lowerText.startsWith('/gen')) {
      const parts = text.split(/\s+/)
      const durationMap = {
        '2h': '2 Hours',
        '1d': '1 Day',
        '3d': '3 Days',
        '7d': '7 Days',
        '15d': '15 Days',
        '30d': '30 Days'
      }

      let rawDuration = '1 Day'
      let isVipRequested = false
      const gameWords = []

      for (let i = 1; i < parts.length; i++) {
        const p = parts[i]
        const lp = p.toLowerCase()
        const cleanP = lp.replace('vip', '')
        if (lp === 'vip') {
          isVipRequested = true
        } else if (durationMap[cleanP]) {
          rawDuration = durationMap[cleanP]
          if (lp.includes('vip')) isVipRequested = true
        } else if (durationMap[lp]) {
          rawDuration = durationMap[lp]
        } else {
          gameWords.push(p)
        }
      }

      const rawGame = gameWords.join(' ').trim()
      const isFf = !rawGame || rawGame.toLowerCase().includes('free fire') || rawGame.toLowerCase() === 'ff'
      const finalGameName = isFf ? 'Free Fire MAX' : rawGame
      const planDuration = isVipRequested ? `${rawDuration} [VIP]` : rawDuration

      const gameTag = isFf
        ? 'FF'
        : (finalGameName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'APP')

      const b1 = Math.random().toString(36).substring(2, 6).toUpperCase()
      const b2 = Math.random().toString(36).substring(2, 6).toUpperCase()
      const newKey = `RYMON-${gameTag}-${b1}-${b2}`

      const { error } = await supabase.from('rymon_licenses').insert({
        license_key: newKey,
        game: finalGameName,
        plan_duration: planDuration,
        creator_username: 'debajoyti',
        devices_used: 0,
        devices_max: 1,
        device_hwid: '',
        status: 'WAITING',
        is_paused: false,
        expires_at: null
      })

      if (!error) {
        if (isFf && isVipRequested) {
          await supabase.from('rymon_streamer_controls').upsert(
            {
              license_key: newKey,
              game_name: finalGameName,
              plan_duration: planDuration,
              creator: 'debajoyti',
              devices_max: 1,
              devices_used: 0,
              device_hwid: '',
              is_active: true,
              is_paused: false,
              is_online: false,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'license_key' }
          )
        }
        const reply = [
          `✨ <b>NEW ${isVipRequested ? '👑 VIP STREAMER' : '📱 STANDARD'} KEY GENERATED!</b>`,
          ``,
          `🔑 <b>Tap to Copy Key:</b>`,
          `<code>${newKey}</code>`,
          ``,
          `• <b>Tier:</b> ${isVipRequested ? '👑 VIP Streamer (Web Remote & Live Controls)' : '📱 Standard (Zero-Lag Mobile APK)'}`,
          `• <b>Game:</b> ${finalGameName}`,
          `• <b>Duration:</b> ${planDuration} (Starts on 1st APK Login)`,
          `• <b>Devices:</b> 1 Device (Max 2 Self-Resets/Day)`
        ].join('\n')
        await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
      } else {
        await sendTelegramReply(chatId, `❌ Failed to generate key: ${error.message}`)
      }
      return
    }

    if (lowerText.startsWith('/givereseller')) {
      const parts = text.split(/\s+/)
      const targetChatId = (parts[1] || '').trim()
      const subArg = (parts[2] || '30d').toLowerCase()
      const subDays = subArg.includes('60') ? 60 : 30
      const startBal = Math.max(0, parseInt(parts[3] || '0') || 0)
      const customUser = (parts[4] || '').trim()

      if (!targetChatId) {
        await sendTelegramReply(
          chatId,
          `ℹ️ <b>Grant Reseller by Telegram Chat ID:</b>\n<code>/givereseller &lt;CHAT_ID&gt; &lt;30d|60d&gt; [starting_balance] [username]</code>\n\nExample:\n<code>/givereseller 987654321 30d 500</code>`
        )
        return
      }

      const grantRes = await grantResellerByChatId({
        chatId: targetChatId,
        subDays,
        initialBalance: startBal,
        customUsername: customUser || undefined
      })

      await sendTelegramReply(
        chatId,
        [
          `👑 <b>RESELLER GRANTED BY CHAT ID</b>`,
          ``,
          `• <b>Telegram Chat ID:</b> <code>${targetChatId}</code>`,
          `• <b>Username:</b> <code>${grantRes.username}</code>`,
          ...(grantRes.password ? [`• <b>Password:</b> <code>${grantRes.password}</code>`] : []),
          `• <b>Subscription:</b> ${subDays} Days`,
          `• <b>Wallet Balance:</b> ₹${grantRes.balance.toLocaleString('en-IN')}`,
          ``,
          `<i>The reseller has been notified on Telegram with their tap-to-buy store!</i>`
        ].join('\n'),
        buildOwnerInlineKeyboard()
      )
      return
    }

    if (lowerText.startsWith('/addbal')) {
      const parts = text.split(/\s+/)
      const targetIdOrUser = (parts[1] || '').trim()
      const amt = parseInt(parts[2] || '0') || 0
      if (!targetIdOrUser || !amt) {
        await sendTelegramReply(
          chatId,
          `ℹ️ <b>Usage:</b> <code>/addbal &lt;CHAT_ID_OR_USERNAME&gt; &lt;amount&gt;</code>\nExample: <code>/addbal 987654321 500</code>`
        )
        return
      }
      const bindings = await getSystemConfigValue('telegram_reseller_bindings', {})
      const resolvedUser = bindings[targetIdOrUser]?.username || targetIdOrUser
      const { data: userRow } = await supabase
        .from('rymon_accounts')
        .select('id, username, balance')
        .ilike('username', resolvedUser)
        .maybeSingle()

      if (!userRow) {
        await sendTelegramReply(chatId, `❌ Reseller <code>${resolvedUser}</code> not found.`)
        return
      }

      const nextBal = Math.max(0, Number(userRow.balance || 0) + amt)
      await supabase
        .from('rymon_accounts')
        .update({ balance: nextBal, updated_at: new Date().toISOString() })
        .eq('id', userRow.id)

      await sendTelegramReply(
        chatId,
        `✅ Credited <b>₹${amt.toLocaleString('en-IN')}</b> to @${userRow.username}! New Balance: <b>₹${nextBal.toLocaleString('en-IN')}</b>`
      )

      const targetChat =
        bindings[targetIdOrUser]?.chat_id ||
        Object.values(bindings).find(
          (b) => b.username && b.username.toLowerCase() === userRow.username.toLowerCase()
        )?.chat_id

      if (targetChat) {
        const pMap = await getResellerPriceMap(userRow.username)
        await sendTelegramReply(
          targetChat,
          `💰 <b>WALLET CREDITED BY OWNER!</b>\n\n• <b>Added:</b> +₹${amt.toLocaleString('en-IN')}\n• <b>New Wallet Balance:</b> <b>₹${nextBal.toLocaleString('en-IN')}</b>\n\n<i>Tap any button below to buy keys:</i>`,
          buildResellerInlineKeyboard(pMap)
        )
      }
      return
    }

    if (lowerText.startsWith('/renew')) {
      const parts = text.split(/\s+/)
      const targetIdOrUser = (parts[1] || '').trim()
      const subDays = (parts[2] || '30d').includes('60') ? 60 : 30
      if (!targetIdOrUser) {
        await sendTelegramReply(
          chatId,
          `ℹ️ <b>Usage:</b> <code>/renew &lt;CHAT_ID_OR_USERNAME&gt; &lt;30d|60d&gt;</code>`
        )
        return
      }
      const bindings = await getSystemConfigValue('telegram_reseller_bindings', {})
      const resolvedUser = bindings[targetIdOrUser]?.username || targetIdOrUser
      const { data: userRow } = await supabase
        .from('rymon_accounts')
        .select('id, username')
        .ilike('username', resolvedUser)
        .maybeSingle()
      if (!userRow) {
        await sendTelegramReply(chatId, `❌ Reseller <code>${resolvedUser}</code> not found.`)
        return
      }
      const newExpIso = new Date(Date.now() + subDays * 86400000).toISOString()
      await supabase
        .from('rymon_accounts')
        .update({ expires_at: newExpIso, status: 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('id', userRow.id)
      await sendTelegramReply(
        chatId,
        `✅ Renewed @${userRow.username} subscription for <b>${subDays} Days</b> (Until ${new Date(newExpIso).toLocaleDateString('en-IN')})!`
      )
      return
    }

    if (lowerText.startsWith('/resellers')) {
      const [{ data: allAccs }, bindings] = await Promise.all([
        supabase
          .from('rymon_accounts')
          .select('username, role, balance, expires_at')
          .neq('role', 'owner')
          .order('balance', { ascending: false }),
        getSystemConfigValue('telegram_reseller_bindings', {})
      ])
      const chatByUsername = {}
      Object.values(bindings).forEach((b) => {
        if (b && b.username) chatByUsername[b.username.toLowerCase()] = b.chat_id
      })
      const rows = (allAccs || []).slice(0, 25).map((a, idx) => {
        const cid = chatByUsername[a.username.toLowerCase()] || 'Unlinked'
        const expStr = a.expires_at ? new Date(a.expires_at).toLocaleDateString('en-IN') : '30D'
        return `${idx + 1}. <b>@${a.username}</b> (${String(a.role).toUpperCase()}) • ₹${Number(a.balance || 0).toLocaleString('en-IN')} • Sub: ${expStr} • ChatID: <code>${cid}</code>`
      })
      const reply = [
        `👥 <b>RESELLERS &amp; STAFF (${(allAccs || []).length})</b>`,
        ``,
        rows.length > 0 ? rows.join('\n') : 'No resellers found yet.',
        ``,
        `💡 <b>Give Reseller by Chat ID:</b>`,
        `<code>/givereseller CHAT_ID 30d 500</code>`,
        `💡 <b>Add Wallet Balance:</b>`,
        `<code>/addbal CHAT_ID 1000</code>`
      ].join('\n')
      await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
      return
    }

    if (lowerText.startsWith('/invite')) {
      const parts = text.split(/\s+/)
      const subDays = (parts[1] || '30d').includes('60') ? 60 : 30
      const initBal = Math.max(0, parseInt(parts[2] || '0') || 0)
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
      const code = `RYMON-RES-${subDays}D-${rand}`
      await supabase.from('rymon_referrals').insert({
        code,
        creator_username: 'debajoyti',
        target_role: 'reseller',
        initial_balance: initBal,
        max_uses: 1,
        times_used: 0,
        is_active: true
      })
      await sendTelegramReply(
        chatId,
        [
          `🎟️ <b>NEW ${subDays}-DAY RESELLER INVITE CODE</b>`,
          ``,
          `🔑 <b>Tap to Copy Code:</b>`,
          `<code>${code}</code>`,
          ``,
          `• <b>Role:</b> RESELLER (${subDays} Days Subscription)`,
          `• <b>Starting Balance:</b> ₹${initBal.toLocaleString('en-IN')}`,
          `• <b>Redeem via:</b> @Rymon007bot`
        ].join('\n'),
        buildOwnerInlineKeyboard()
      )
      return
    }

    if (lowerText.startsWith('/pause') || lowerText.startsWith('/resume')) {
      const parts = text.split(/\s+/)
      const targetKey = (parts[1] || '').trim().toUpperCase()
      const wantPause = lowerText.startsWith('/pause')
      if (!targetKey) {
        await sendTelegramReply(
          chatId,
          `ℹ️ Usage: <code>/${wantPause ? 'pause' : 'resume'} RYMON-XXXX-XXXX</code>`
        )
        return
      }
      const { data: licRow } = await supabase
        .from('rymon_licenses')
        .select('license_key, expires_at')
        .ilike('license_key', targetKey)
        .maybeSingle()
      if (!licRow) {
        await sendTelegramReply(chatId, `❌ Key <code>${targetKey}</code> not found.`)
        return
      }
      const nowIso = new Date().toISOString()
      const nextStatus = wantPause ? 'PAUSED' : licRow.expires_at ? 'ACTIVE' : 'WAITING'
      await supabase
        .from('rymon_licenses')
        .update({ is_paused: wantPause, status: nextStatus, updated_at: nowIso })
        .eq('license_key', licRow.license_key)
      await supabase
        .from('rymon_streamer_controls')
        .update({ is_paused: wantPause, ...(wantPause ? { is_online: false } : {}), updated_at: nowIso })
        .eq('license_key', licRow.license_key)
      await sendTelegramReply(
        chatId,
        wantPause
          ? `❄️ Key <code>${licRow.license_key}</code> PAUSED — Countdown timer frozen.`
          : `▶️ Key <code>${licRow.license_key}</code> RESUMED!`
      )
      return
    }

    if (lowerText.startsWith('/purgekeys') || lowerText.startsWith('/clean')) {
      const parts = text.split(/\s+/)
      const daysArg = parseInt(parts[1] || '60') || 60
      const { data, error } = await supabase.rpc('rpc_rymon_purge_expired_keys', {
        p_days_retention: daysArg,
        p_actor_username: 'telegram_owner'
      })
      if (error) {
        await sendTelegramReply(chatId, `❌ <b>Database Purge Failed:</b> ${error.message}`)
      } else {
        const deletedKeys = data?.deleted_keys_count ?? 0
        const deletedControls = data?.deleted_controls_count ?? 0
        const cutoff = data?.cutoff_timestamp
          ? new Date(data.cutoff_timestamp).toLocaleString('en-IN')
          : `${daysArg} days ago`
        const reply = [
          `🧹 <b>DATABASE RETENTION PURGE COMPLETE</b>`,
          ``,
          `• <b>Retention Cutoff:</b> Older than ${daysArg} days (${cutoff})`,
          `• <b>Purged Expired Short-Term Keys:</b> ${deletedKeys}`,
          `• <b>Purged Orphaned Streamer Controls:</b> ${deletedControls}`,
          `• <b>Database Health:</b> 100% Optimized (Supabase Free Tier Clean)`
        ].join('\n')
        await sendTelegramReply(chatId, reply, buildOwnerInlineKeyboard())
      }
      return
    }
  }

  // Direct license key paste (e.g. RYMON-FF-XXXX-XXXX) -> Self-Service 2/Day HWID Reset!
  if (/^[A-Za-z0-9]{2,12}-[A-Za-z0-9-]+$/.test(text)) {
    const reply = await handleKeyHwidReset(text, isOwnerChat, senderUser)
    await sendTelegramReply(chatId, reply)
    return
  }

  // Fallback for any other message: Always guide the user so the bot never ignores them
  if (text.length > 0) {
    const helpMarkup = {
      inline_keyboard: [
        [
          { text: '🔄 How to Reset HWID', callback_data: 'cmd:help_reset' },
          { text: '🔍 Check Key', callback_data: 'cmd:help_check' }
        ],
        [
          { text: '📥 Download APK', callback_data: 'cmd:apk' },
          { text: '🏠 Main Menu', callback_data: 'cmd:main_menu' }
        ]
      ]
    }
    const fallbackMsg = [
      `🤖 <b>RYMON OFFICIAL BOT (@Rymon007bot)</b>`,
      ``,
      `Hello <b>${senderName}</b>! I am online and ready to assist you.`,
      ``,
      `🔄 <b>To Reset Your HWID (Max 2/Day):</b>`,
      `Simply send your License Key directly here (e.g. <code>RYMON-FF-XXXX-XXXX</code>) or use <code>/reset KEY</code>`,
      ``,
      `🔍 <b>To Check Key Status & Resets:</b>`,
      `Send <code>/check KEY</code>`,
      ``,
      `📲 <b>To Download Latest Streamer APK:</b>`,
      `Send <code>/apk</code> or tap the button below.`,
      ``,
      `ℹ️ Type <code>/start</code> anytime to view the full interactive menu.`
    ].join('\n')
    await sendTelegramReply(chatId, fallbackMsg, helpMarkup)
  }
}

async function registerBotCommands() {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Open Interactive Menu & Store' },
          { command: 'reset', description: 'Reset Key HWID (Max 2/Day)' },
          { command: 'check', description: 'Check Key Status & Daily Resets' },
          { command: 'wallet', description: 'Reseller Store, Wallet & Buy Keys' },
          { command: 'buy', description: 'Buy Key from Reseller Wallet' },
          { command: 'mykeys', description: 'View Your Generated Reseller Keys' },
          { command: 'apply', description: 'Apply for 30D/60D Reseller Access' },
          { command: 'apk', description: 'Download Latest RYMON STREAMER APK' },
          { command: 'id', description: 'Get Your Telegram Chat ID' }
        ]
      })
    })

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyShortDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        short_description: '⚡ Official RYMON Bot • 24/7 Key HWID Reset, License Management & Streamer APK'
      })
    })

    const fullDesc = [
      '⚡ Welcome to RYMON OFFICIAL BOT (@Rymon007bot)',
      '',
      '🔐 Sovereign Licensing & Streamer Engine:',
      '• Self-Service Key HWID Reset (Max 2/day)',
      '• Real-time Key Status & Expiry Checker',
      '• Latest RYMON STREAMER APK Downloads',
      '• Official Reseller Store & Wallet',
      '',
      '👑 Maintained by @montage007pc'
    ].join('\n')

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: fullDesc
      })
    })
  } catch {}
}

async function startDaemon() {
  console.log('🚀 [@Rymon007bot Daemon] Starting 24/7 Reseller Store & 2/Day Reset Responder...')
  await registerBotCommands()

  // Publish daemon heartbeat to Supabase so browser tabs yield polling (zero 409 Conflict)
  const publishHeartbeat = () => {
    saveSystemConfigValue('tg_daemon_heartbeat', { ts: Date.now() })
  }
  publishHeartbeat()
  setInterval(publishHeartbeat, 45000)

  let offset = 0
  while (true) {
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=15&offset=${offset}`
      )
      const json = await resp.json()
      if (json.ok && Array.isArray(json.result) && json.result.length > 0) {
        for (const upd of json.result) {
          offset = Math.max(offset, upd.update_id + 1)
          await processUpdate(upd)
        }
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=0&offset=${offset}`)
      }
    } catch {
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
}

startDaemon()
