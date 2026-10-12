import { createClient } from '@supabase/supabase-js'

const BOT_TOKEN = '8866404681:AAHQbK2PXyx_Y2ISGmhytxRF6G7Pm4oZO6A'
const OWNER_CHAT_ID = '5831000769' // @montage007pc (Montage)
const SUPABASE_URL = 'https://zvjqpigduyvczidzafus.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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

async function sendTelegramReply(chatId, htmlText) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })
  } catch (err) {
    console.error('[TG Send Error]', err)
  }
}

async function getDailyResetLog() {
  try {
    const { data } = await supabase
      .from('rymon_system_config')
      .select('value')
      .eq('key', 'hwid_reset_daily_log')
      .maybeSingle()
    if (data?.value && typeof data.value === 'object') {
      return data.value
    }
  } catch {}
  return {}
}

async function saveDailyResetLog(logMap) {
  try {
    await supabase
      .from('rymon_system_config')
      .upsert(
        { key: 'hwid_reset_daily_log', value: logMap, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
  } catch {}
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
    .select('*')
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

  const logMap = await getDailyResetLog()
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

  await saveDailyResetLog(logMap)

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
  const msg = upd.message || upd.channel_post
  if (!msg || !msg.chat || !msg.text) return

  const chatId = String(msg.chat.id)
  const text = String(msg.text).trim()
  const lowerText = text.toLowerCase()
  const senderName = msg.from?.first_name || msg.chat.title || 'VIP User'
  const senderUser = msg.from?.username ? `@${msg.from.username}` : senderName
  const isOwnerChat = chatId === OWNER_CHAT_ID

  if (lowerText.startsWith('/start') || lowerText.startsWith('/help')) {
    const lines = [
      `⚡ <b>RYMON OFFICIAL BOT (@Rymon007bot)</b>`,
      `Welcome, <b>${senderName}</b>!`,
      ``,
      `🔄 <b>24/7 Self-Service Key Reset (Max 2/Day):</b>`,
      `• Simply <b>send your License Key</b> (e.g. <code>RYMON-FF-XXXX-XXXX</code>) or type:`,
      `• /reset <code>YOUR_KEY</code> — Unbind device HWID (2 resets/day)`,
      `• /check <code>YOUR_KEY</code> — Check key expiry, status &amp; daily resets`,
      `• /apk — Download Latest RYMON STREAMER APK`,
      `• /id — Show your Telegram Chat ID (<code>${chatId}</code>)`
    ]
    if (isOwnerChat) {
      lines.push(
        ``,
        `👑 <b>ROOT OWNER COMMAND CENTER (@montage007pc):</b>`,
        `• /status — Live Server &amp; Key Telemetry`,
        `• /unused — Copy all Unused (Waiting) Keys`,
        `• /playing — View Players Currently In-Game`,
        `• /gen <code>1d</code> | <code>3d</code> | <code>7d</code> | <code>15d</code> | <code>30d</code> | <code>2h</code> — Mint VIP Key`,
        `• /pause <code>KEY</code> — Freeze Key &amp; Timer`,
        `• /resume <code>KEY</code> — Resume Key &amp; Restore Timer`,
        `• /reset <code>KEY</code> — Unlimited Owner Override Reset`
      )
    }
    lines.push(``, `🌐 <b>Portal:</b> https://greenvest.shop/`)
    await sendTelegramReply(chatId, lines.join('\n'))
    return
  }

  if (lowerText.startsWith('/id')) {
    await sendTelegramReply(
      chatId,
      `🆔 <b>Your Telegram Chat ID:</b> <code>${chatId}</code>${isOwnerChat ? ' (👑 Root Owner Verified)' : ''}`
    )
    return
  }

  if (lowerText.startsWith('/apk')) {
    const reply = [
      `📲 <b>RYMON STREAMER OFFICIAL APK (v2.4)</b>`,
      ``,
      `⬇️ <b>Direct Download:</b>`,
      `https://greenvest.shop/download/RYMON_STREAMER_LATEST.apk`,
      ``,
      `✨ <b>Features:</b> Instant Website Remote Hack Toggles + Live Heartbeat Engine`,
      `🌐 <b>Web Remote Control:</b> https://greenvest.shop/`
    ].join('\n')
    await sendTelegramReply(chatId, reply)
    return
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
      supabase.from('rymon_licenses').select('*').ilike('license_key', queryKey).maybeSingle(),
      supabase.from('rymon_streamer_controls').select('*').ilike('license_key', queryKey).maybeSingle(),
      getDailyResetLog()
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
    lowerText.startsWith('/resume')
  ) {
    if (!isOwnerChat) {
      await sendTelegramReply(
        chatId,
        `🔒 <b>Restricted Command:</b> This command is reserved for the Root Owner (@montage007pc).\n\n💡 <i>Normal users can send their key directly or use <code>/reset KEY</code> (max 2/day), <code>/check KEY</code>, or <code>/apk</code>.</i>`
      )
      return
    }

    if (lowerText.startsWith('/status')) {
      const [{ data: lics }, { data: ctrls }, { data: usrs }] = await Promise.all([
        supabase.from('rymon_licenses').select('*'),
        supabase.from('rymon_streamer_controls').select('*'),
        supabase.from('rymon_accounts').select('id')
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
        `👥 <b>Registered Staff/Resellers:</b> ${(usrs || []).length}`,
        ``,
        `🌐 https://greenvest.shop/`
      ].join('\n')
      await sendTelegramReply(chatId, reply)
      return
    }

    if (lowerText.startsWith('/unused')) {
      const { data: unusedKeys } = await supabase
        .from('rymon_licenses')
        .select('*')
        .eq('status', 'WAITING')
        .order('created_at', { ascending: false })
      const list = unusedKeys || []
      if (list.length === 0) {
        await sendTelegramReply(chatId, `🟡 No Unused (WAITING) keys found right now.`)
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
          list.length > 30 ? `\n<i>...and ${list.length - 30} more on greenvest.shop</i>` : ''
        ].join('\n')
        await sendTelegramReply(chatId, reply)
      }
      return
    }

    if (lowerText.startsWith('/playing')) {
      const { data: ctrls } = await supabase.from('rymon_streamer_controls').select('*')
      const playingList = (ctrls || []).filter((c) => isActivelyPlaying(c))
      if (playingList.length === 0) {
        await sendTelegramReply(
          chatId,
          `⚪ <b>0 Players In-Game Right Now.</b> All bound keys are currently idle/offline.`
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
          `🟢 <b>CURRENTLY PLAYING IN-GAME (${playingList.length})</b>\n\n${listStr}`
        )
      }
      return
    }

    if (lowerText.startsWith('/gen')) {
      const parts = text.split(/\s+/)
      const arg = (parts[1] || '1d').toLowerCase()
      const durationMap = {
        '2h': '2 Hours',
        '1d': '1 Day',
        '3d': '3 Days',
        '7d': '7 Days',
        '15d': '15 Days',
        '30d': '30 Days'
      }
      const planDuration = durationMap[arg] || '1 Day'
      const b1 = Math.random().toString(36).substring(2, 6).toUpperCase()
      const b2 = Math.random().toString(36).substring(2, 6).toUpperCase()
      const newKey = `RYMON-FF-${b1}-${b2}`

      const { error } = await supabase.from('rymon_licenses').insert({
        license_key: newKey,
        game: 'Free Fire',
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
        await supabase.from('rymon_streamer_controls').upsert(
          {
            license_key: newKey,
            game_name: 'Free Fire',
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
        const reply = [
          `✨ <b>NEW VIP KEY GENERATED!</b>`,
          ``,
          `🔑 <b>Tap to Copy Key:</b>`,
          `<code>${newKey}</code>`,
          ``,
          `• <b>Game:</b> Free Fire`,
          `• <b>Duration:</b> ${planDuration} (Starts on 1st APK Login)`,
          `• <b>Devices:</b> 1 Device (Max 2 Self-Resets/Day)`
        ].join('\n')
        await sendTelegramReply(chatId, reply)
      } else {
        await sendTelegramReply(chatId, `❌ Failed to generate key: ${error.message}`)
      }
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
        .select('*')
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
  }

  // Direct license key paste (e.g. RYMON-FF-XXXX-XXXX) -> Self-Service 2/Day HWID Reset!
  if (/^[A-Za-z0-9]{2,12}-[A-Za-z0-9-]+$/.test(text)) {
    const reply = await handleKeyHwidReset(text, isOwnerChat, senderUser)
    await sendTelegramReply(chatId, reply)
  }
}

async function startDaemon() {
  console.log('🚀 [@Rymon007bot Daemon] Starting 24/7 Long-Polling Responder...')
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
        // Immediately acknowledge processed updates on Telegram server
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=0&offset=${offset}`)
      }
    } catch (err) {
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
}

startDaemon()
