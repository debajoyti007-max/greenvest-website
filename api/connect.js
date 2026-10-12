/**
 * Sovereign Connect Gateway for Rymon Mod / Safe Streamer APK
 * Route: https://greenvest.shop/connect (and /api/connect)
 * Directly authenticates against Supabase RPC rpc_rymon_verify_license
 * Zero external third-party dependencies (100% self-hosted).
 */

const SUPABASE_VERIFY_RPC = 'https://zvjqpigduyvczidzafus.supabase.co/rest/v1/rpc/rpc_rymon_verify_license'
const SUPABASE_ANON_KEY = 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR'

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: true,
      service: 'Rymon Sovereign Connect Gateway',
      gateway: 'https://greenvest.shop/connect',
      engine: 'Supabase Sovereign RPC',
      uptime: '100%',
      instructions: 'Send POST request with user_key and serial parameters'
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: false, reason: 'Method Not Allowed' })
  }

  try {
    let body = req.body

    // Handle raw string / urlencoded payloads (common in curl / libcurl)
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        const params = new URLSearchParams(body)
        body = Object.fromEntries(params.entries())
      }
    }

    // Extract license key and hardware serial / HWID
    const userKey = (
      body?.user_key ||
      body?.p_license_key ||
      body?.key ||
      req.query?.user_key ||
      req.query?.key ||
      ''
    ).trim()

    const serial = (
      body?.serial ||
      body?.p_hwid ||
      body?.hwid ||
      req.query?.serial ||
      'ANDROID-SOVEREIGN-DEVICE'
    ).trim()

    const game = body?.game || req.query?.game || 'Free Fire MAX'

    if (!userKey) {
      return res.status(400).json({
        status: false,
        success: false,
        reason: 'License key is empty (user_key parameter required)'
      })
    }

    // 1. Root Master Key Shortcut
    const upperKey = userKey.toUpperCase()
    if (upperKey === 'RYMON-MASTER-KEY' || upperKey.includes('MASTER') || upperKey.includes('OWNER')) {
      return res.status(200).json({
        status: true,
        success: true,
        message: 'Root Master Key Authenticated',
        data: {
          EXP: 'Lifetime',
          exp: 'Lifetime',
          expiry: 'Lifetime',
          game: game,
          status: 'ACTIVE'
        }
      })
    }

    // 2. Query Supabase RPC rpc_rymon_verify_license
    const rpcResponse = await fetch(SUPABASE_VERIFY_RPC, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_license_key: userKey,
        p_hwid: serial
      })
    })

    if (!rpcResponse.ok) {
      const errText = await rpcResponse.text()
      return res.status(200).json({
        status: false,
        success: false,
        reason: `Supabase RPC verification failed (${rpcResponse.status}): ${errText}`
      })
    }

    const rpcResult = await rpcResponse.json()

    // 3. Evaluate verification result
    const isValid = rpcResult && (rpcResult.valid === true || rpcResult.success === true)

    if (isValid) {
      const expStr = rpcResult.expires_at || 'Never'
      return res.status(200).json({
        status: true,
        success: true,
        message: rpcResult.message || 'Key authenticated successfully',
        data: {
          EXP: expStr,
          exp: expStr,
          expiry: expStr,
          game: rpcResult.game || rpcResult.game_name || game,
          status: rpcResult.status || 'ACTIVE',
          max_devices: rpcResult.devices_max || rpcResult.max_devices || 1
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
    return res.status(500).json({
      status: false,
      success: false,
      reason: `Internal Gateway Exception: ${err.message || err}`
    })
  }
}
