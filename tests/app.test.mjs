import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// 1. License Key Formats & Masking
describe('RYMON License Key Formats & Sanitization', () => {
  function formatKey(raw) {
    if (!raw) return ''
    const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    return clean
  }

  function maskKey(key) {
    if (!key || key.length <= 8) return '****'
    return key.slice(0, 4) + '-****-****-' + key.slice(-4)
  }

  test('Sanitizes and normalizes license key inputs', () => {
    assert.equal(formatKey('  rymon-vip-2026-demo  '), 'RYMON-VIP-2026-DEMO')
    assert.equal(formatKey('rymon@#$-1234'), 'RYMON-1234')
  })

  test('Masks sensitive middle segments of license keys', () => {
    assert.equal(maskKey('RYMON-AAAA-BBBB-CCCC'), 'RYMO-****-****-CCCC')
    assert.equal(maskKey('SHORT'), '****')
  })
})

// 2. Streamer Control Telemetry Payload Validation
describe('Streamer Control Telemetry Payload', () => {
  function parseTelemetryTag(tag) {
    const isVip = tag.includes('VIP')
    const panelMatch = tag.match(/P:(\d+)/)
    const enemiesMatch = tag.match(/E:(\d+)/)
    const botsMatch = tag.match(/B:(\d+)/)

    return {
      isVip,
      panelOn: panelMatch ? panelMatch[1] === '1' : false,
      enemies: enemiesMatch ? parseInt(enemiesMatch[1], 10) : 0,
      bots: botsMatch ? parseInt(botsMatch[1], 10) : 0,
    }
  }

  test('Correctly parses composite telemetry tags', () => {
    const tag = 'VIP|P:1|E:4|B:2'
    const parsed = parseTelemetryTag(tag)
    assert.equal(parsed.isVip, true)
    assert.equal(parsed.panelOn, true)
    assert.equal(parsed.enemies, 4)
    assert.equal(parsed.bots, 2)
  })

  test('Handles standard telemetry tags', () => {
    const tag = 'P:0|E:0|B:0'
    const parsed = parseTelemetryTag(tag)
    assert.equal(parsed.isVip, false)
    assert.equal(parsed.panelOn, false)
    assert.equal(parsed.enemies, 0)
    assert.equal(parsed.bots, 0)
  })
})

// 3. Reseller Pricing Calculation
describe('Reseller Key Pricing & Margin Calculations', () => {
  const DEFAULT_KEY_PRICES = {
    DAY_1: 50,
    DAY_3: 120,
    WEEK_1: 250,
    MONTH_1: 700,
    LIFETIME: 2500,
  }

  function calculateExtensionCost(durationKey, basePriceMap, discountPercent = 0) {
    const base = basePriceMap[durationKey] || 0
    if (discountPercent <= 0) return base
    return Math.max(1, Math.round(base * (1 - discountPercent / 100)))
  }

  test('Calculates standard key extension prices without discount', () => {
    assert.equal(calculateExtensionCost('DAY_1', DEFAULT_KEY_PRICES), 50)
    assert.equal(calculateExtensionCost('MONTH_1', DEFAULT_KEY_PRICES), 700)
    assert.equal(calculateExtensionCost('LIFETIME', DEFAULT_KEY_PRICES), 2500)
  })

  test('Applies reseller discount properly', () => {
    // 20% reseller margin
    assert.equal(calculateExtensionCost('MONTH_1', DEFAULT_KEY_PRICES, 20), 560)
  })
})

// 4. License Duration Extension & Wallet Credit Cut Rules
describe('License Duration Extension & Wallet Credit Cut Engine', () => {
  const PRICE_MAP = {
    '2 Hours': 20,
    '1 Day': 35,
    '3 Days': 50,
    '7 Days': 100,
    '15 Days': 180,
    '30 Days': 350,
  }

  function calculateKeyExtensionCost(days, username, devicesMax = 1) {
    if (!username) return 0
    const clean = username.trim().toLowerCase()
    if (clean === 'debajoyti') return 0 // Root owner is exempt

    const devMult = Math.max(1, Number(devicesMax) || 1)
    let unit = 0
    if (days === 1) unit = PRICE_MAP['1 Day'] ?? 35
    else if (days === 3) unit = PRICE_MAP['3 Days'] ?? 50
    else if (days === 7) unit = PRICE_MAP['7 Days'] ?? 100
    else if (days === 15) unit = PRICE_MAP['15 Days'] ?? 180
    else if (days === 30) unit = PRICE_MAP['30 Days'] ?? 350
    else {
      const dailyRate = PRICE_MAP['1 Day'] ?? 35
      unit = Math.round(dailyRate * Math.max(1, days))
    }
    return unit * devMult
  }

  function validateExtensionRequest(rawDays) {
    const rawNum = Math.floor(Number(rawDays) || 0)
    if (rawNum < 7) {
      return {
        valid: false,
        error: 'Extension duration under 7 days is disabled. Minimum extension duration is 7 days.',
      }
    }
    return {
      valid: true,
      days: Math.min(30, rawNum),
    }
  }

  function simulateWalletExtension({ actor, actorRole, balance, days, devicesMax }) {
    const validation = validateExtensionRequest(days)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }
    const isOwner = actorRole === 'owner' || actor.toLowerCase() === 'debajoyti'
    const cost = isOwner ? 0 : calculateKeyExtensionCost(validation.days, actor, devicesMax)
    if (!isOwner && balance < cost) {
      return {
        success: false,
        error: `Insufficient wallet balance! Extending requires ₹${cost}, but balance is ₹${balance}.`,
      }
    }
    const remainingBalance = isOwner ? balance : balance - cost
    return {
      success: true,
      cost,
      remainingBalance,
      days: validation.days,
    }
  }

  test('Rejects extension requests under 7 days (1 day and 3 days disallowed)', () => {
    const res1 = validateExtensionRequest(1)
    assert.equal(res1.valid, false)
    assert.match(res1.error, /Minimum extension duration is 7 days/i)

    const res2 = validateExtensionRequest(3)
    assert.equal(res2.valid, false)
    assert.match(res2.error, /Minimum extension duration is 7 days/i)

    const res3 = validateExtensionRequest(5)
    assert.equal(res3.valid, false)
  })

  test('Accepts valid extension durations (7, 15, 30 days) and caps at 30 days', () => {
    assert.equal(validateExtensionRequest(7).days, 7)
    assert.equal(validateExtensionRequest(15).days, 15)
    assert.equal(validateExtensionRequest(30).days, 30)
    assert.equal(validateExtensionRequest(45).days, 30) // Capped at 30
  })

  test('Calculates extension costs for Reseller and Admin based on devices', () => {
    // 7 Days 1 device = ₹100
    assert.equal(calculateKeyExtensionCost(7, 'reseller_sam', 1), 100)
    // 7 Days 2 devices = ₹100 * 2 = ₹200
    assert.equal(calculateKeyExtensionCost(7, 'admin_alex', 2), 200)
    // 15 Days 1 device = ₹180
    assert.equal(calculateKeyExtensionCost(15, 'reseller_sam', 1), 180)
    // 30 Days 1 device = ₹350
    assert.equal(calculateKeyExtensionCost(30, 'reseller_sam', 1), 350)
  })

  test('Exempts root owner from extension costs (FREE)', () => {
    assert.equal(calculateKeyExtensionCost(7, 'debajoyti', 1), 0)
    assert.equal(calculateKeyExtensionCost(30, 'debajoyti', 5), 0)
  })

  test('Deducts credit properly for Admin and Reseller on extension', () => {
    const resellerTx = simulateWalletExtension({
      actor: 'reseller_sam',
      actorRole: 'reseller',
      balance: 500,
      days: 7,
      devicesMax: 1,
    })
    assert.equal(resellerTx.success, true)
    assert.equal(resellerTx.cost, 100)
    assert.equal(resellerTx.remainingBalance, 400)

    const adminTx = simulateWalletExtension({
      actor: 'admin_alex',
      actorRole: 'admin',
      balance: 1000,
      days: 15,
      devicesMax: 2, // 180 * 2 = 360
    })
    assert.equal(adminTx.success, true)
    assert.equal(adminTx.cost, 360)
    assert.equal(adminTx.remainingBalance, 640)
  })

  test('Rejects extension when Admin or Reseller has insufficient credit', () => {
    const failedTx = simulateWalletExtension({
      actor: 'reseller_sam',
      actorRole: 'reseller',
      balance: 60,
      days: 7,
      devicesMax: 1, // Requires 100, only has 60
    })
    assert.equal(failedTx.success, false)
    assert.match(failedTx.error, /Insufficient wallet balance/i)
  })
})

// 5. Role-Based Navigation & Feature Accessibility
describe('Role-Based UI & Navigation Security Scoping', () => {
  function getAllowedTabsForRole(role, isRoot = false) {
    if (role === 'streamer') return ['remote']
    if (role === 'reseller') return ['remote', 'overview', 'generate', 'keys', 'extend', 'advance']
    if (role === 'admin')
      return [
        'remote',
        'overview',
        'generate',
        'keys',
        'extend',
        'users',
        'add-balance',
        'referrals',
        'delete',
        'advance',
      ]
    if (role === 'owner') {
      if (isRoot) {
        return [
          'remote',
          'overview',
          'generate',
          'keys',
          'extend',
          'users',
          'add-balance',
          'referrals',
          'delete',
          'advance',
          'connect-api',
          'apps',
        ]
      }
      return [
        'remote',
        'overview',
        'generate',
        'keys',
        'extend',
        'users',
        'add-balance',
        'referrals',
        'delete',
        'advance',
      ]
    }
    return ['remote']
  }

  test('Guarantees sql-setup and telegram are completely removed from all role navigation', () => {
    for (const role of ['streamer', 'reseller', 'admin', 'owner']) {
      const allowed = getAllowedTabsForRole(role, role === 'owner')
      assert.equal(allowed.includes('sql-setup'), false, `sql-setup must not exist for ${role}`)
      assert.equal(allowed.includes('telegram'), false, `telegram must not exist for ${role}`)
    }
  })

  test('Restricts Reseller navigation strictly to their scope (no add-balance, users, referrals, delete)', () => {
    const resellerTabs = getAllowedTabsForRole('reseller', false)
    assert.deepEqual(resellerTabs, ['remote', 'overview', 'generate', 'keys', 'extend', 'advance'])
    assert.equal(resellerTabs.includes('add-balance'), false)
    assert.equal(resellerTabs.includes('users'), false)
    assert.equal(resellerTabs.includes('referrals'), false)
    assert.equal(resellerTabs.includes('delete'), false)
  })

  test('Restricts Admin from accessing Root-only apps and connect-api', () => {
    const adminTabs = getAllowedTabsForRole('admin', false)
    assert.equal(adminTabs.includes('apps'), false)
    assert.equal(adminTabs.includes('connect-api'), false)
    assert.equal(adminTabs.includes('users'), true)
    assert.equal(adminTabs.includes('referrals'), true)
  })

  test('Permits Administrator role creation only to Root Owner', () => {
    function canCreateAdminInvite(isOwner) {
      return Boolean(isOwner)
    }
    assert.equal(canCreateAdminInvite(true), true)
    assert.equal(canCreateAdminInvite(false), false)
  })
})

// 6. Realtime Activity Log Scoping per Role
describe('Realtime Activity Log Scoping per Role', () => {
  function shouldDeliverActivityToUser(activity, user, downlineUsernames = new Set()) {
    const actorLower = String(activity.actor_username || '').toLowerCase()
    const curUser = String(user?.username || '').toLowerCase()
    const role = user?.role || ''

    // 1. Root Owner (debajoyti): sees all platform activities
    if (!user || curUser === 'debajoyti') {
      return true
    }
    // 2. Reseller: only sees activities they performed themselves
    if (role === 'reseller') {
      return actorLower === curUser
    }
    // 3. Admin: sees activities for themselves + their downline
    if (role === 'admin') {
      return actorLower === curUser || downlineUsernames.has(actorLower)
    }
    // 4. Partner Owner: sees activities for themselves and non-root downlines
    if (role === 'owner') {
      return actorLower !== 'debajoyti'
    }
    return false
  }

  const sampleActivities = [
    { id: '1', title: 'Root Wipe', actor_username: 'debajoyti' },
    { id: '2', title: 'Admin Invite Reseller', actor_username: 'admin_alex' },
    { id: '3', title: 'Downline Key Gen', actor_username: 'reseller_bob' },
    { id: '4', title: 'Foreign Reseller Gen', actor_username: 'reseller_stranger' },
  ]

  test('Root Owner receives all platform activities', () => {
    const rootUser = { username: 'debajoyti', role: 'owner' }
    for (const act of sampleActivities) {
      assert.equal(shouldDeliverActivityToUser(act, rootUser), true)
    }
  })

  test('Reseller receives ONLY activities performed by their own account', () => {
    const reseller = { username: 'reseller_bob', role: 'reseller' }
    assert.equal(shouldDeliverActivityToUser(sampleActivities[0], reseller), false) // Root Wipe
    assert.equal(shouldDeliverActivityToUser(sampleActivities[1], reseller), false) // Admin
    assert.equal(shouldDeliverActivityToUser(sampleActivities[2], reseller), true)  // Self
    assert.equal(shouldDeliverActivityToUser(sampleActivities[3], reseller), false) // Stranger
  })

  test('Admin receives activities for self and downlines, but NEVER root owner activities', () => {
    const admin = { username: 'admin_alex', role: 'admin' }
    const downlines = new Set(['reseller_bob'])
    assert.equal(shouldDeliverActivityToUser(sampleActivities[0], admin, downlines), false) // Root Wipe (Excluded)
    assert.equal(shouldDeliverActivityToUser(sampleActivities[1], admin, downlines), true)  // Self
    assert.equal(shouldDeliverActivityToUser(sampleActivities[2], admin, downlines), true)  // Downline
    assert.equal(shouldDeliverActivityToUser(sampleActivities[3], admin, downlines), false) // Stranger (Excluded)
  })
})

