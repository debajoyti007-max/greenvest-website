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
    if (rawNum < 1) {
      return {
        valid: false,
        error: 'Invalid extension duration. Minimum is 1 day.',
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

  test('Accepts 1 day, 3 days, 7 days, 15 days, 30 days and caps at 30 days', () => {
    assert.equal(validateExtensionRequest(1).days, 1)
    assert.equal(validateExtensionRequest(3).days, 3)
    assert.equal(validateExtensionRequest(7).days, 7)
    assert.equal(validateExtensionRequest(15).days, 15)
    assert.equal(validateExtensionRequest(30).days, 30)
    assert.equal(validateExtensionRequest(45).days, 30) // Capped at 30
  })

  test('Rejects extension requests under 1 day (0 or negative)', () => {
    const res1 = validateExtensionRequest(0)
    assert.equal(res1.valid, false)
    assert.match(res1.error, /Minimum is 1 day/i)

    const res2 = validateExtensionRequest(-5)
    assert.equal(res2.valid, false)
  })

  test('Calculates extension costs for Reseller and Admin based on devices', () => {
    // 1 Day 1 device = ₹35
    assert.equal(calculateKeyExtensionCost(1, 'reseller_sam', 1), 35)
    // 1 Day 2 devices = ₹35 * 2 = ₹70
    assert.equal(calculateKeyExtensionCost(1, 'admin_alex', 2), 70)
    // 3 Days 1 device = ₹50
    assert.equal(calculateKeyExtensionCost(3, 'reseller_sam', 1), 50)
    // 3 Days 3 devices = ₹50 * 3 = ₹150
    assert.equal(calculateKeyExtensionCost(3, 'reseller_sam', 3), 150)
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
    assert.equal(calculateKeyExtensionCost(1, 'debajoyti', 1), 0)
    assert.equal(calculateKeyExtensionCost(3, 'debajoyti', 2), 0)
    assert.equal(calculateKeyExtensionCost(7, 'debajoyti', 1), 0)
    assert.equal(calculateKeyExtensionCost(30, 'debajoyti', 5), 0)
  })

  test('Deducts credit properly for Admin and Reseller on extension', () => {
    const reseller1Day = simulateWalletExtension({
      actor: 'reseller_sam',
      actorRole: 'reseller',
      balance: 500,
      days: 1,
      devicesMax: 1,
    })
    assert.equal(reseller1Day.success, true)
    assert.equal(reseller1Day.cost, 35)
    assert.equal(reseller1Day.remainingBalance, 465)

    const reseller3Day = simulateWalletExtension({
      actor: 'reseller_sam',
      actorRole: 'reseller',
      balance: 500,
      days: 3,
      devicesMax: 2,
    })
    assert.equal(reseller3Day.success, true)
    assert.equal(reseller3Day.cost, 100)
    assert.equal(reseller3Day.remainingBalance, 400)

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

// 7. Bulk Extend All Keys Engine
describe('Bulk Extend All Keys Engine & Credit Cut Calculation', () => {
  function calculateExtensionCost(days, actor, devicesMax = 1) {
    const rawNum = Math.floor(Number(days) || 0)
    let unit = 35
    if (rawNum === 1) unit = 35
    else if (rawNum === 3) unit = 50
    else if (rawNum === 7) unit = 100
    else if (rawNum === 15) unit = 180
    else if (rawNum === 30) unit = 350
    else unit = Math.round(35 * rawNum)
    return unit * Math.max(1, Number(devicesMax) || 1)
  }

  function simulateBulkExtend({ actorRole, balance, days, keys }) {
    const isOwner = actorRole === 'owner'
    const totalCost = isOwner
      ? 0
      : keys.reduce((sum, k) => sum + calculateExtensionCost(days, 'user', k.devices_max || 1), 0)

    if (!isOwner && balance < totalCost) {
      return {
        success: false,
        error: `Insufficient wallet balance! Bulk extending ${keys.length} key(s) costs ₹${totalCost}, but balance is ₹${balance}.`,
      }
    }

    return {
      success: true,
      count: keys.length,
      totalCost,
      remainingBalance: isOwner ? balance : balance - totalCost,
    }
  }

  const sampleKeys = [
    { license_key: 'KEY-1', devices_max: 1 },
    { license_key: 'KEY-2', devices_max: 2 },
    { license_key: 'KEY-3', devices_max: 1 },
  ]

  test('Owner bulk extends all keys with zero wallet deduction (FREE)', () => {
    const res = simulateBulkExtend({
      actorRole: 'owner',
      balance: 999999,
      days: 7,
      keys: sampleKeys,
    })
    assert.equal(res.success, true)
    assert.equal(res.totalCost, 0)
    assert.equal(res.remainingBalance, 999999)
  })

  test('Reseller correctly cuts credit based on duration and devices', () => {
    // 3 keys: dev 1, dev 2, dev 1. For 1 day: (35*1) + (35*2) + (35*1) = 35 + 70 + 35 = 140
    const res1Day = simulateBulkExtend({
      actorRole: 'reseller',
      balance: 500,
      days: 1,
      keys: sampleKeys,
    })
    assert.equal(res1Day.success, true)
    assert.equal(res1Day.totalCost, 140)
    assert.equal(res1Day.remainingBalance, 360)

    // For 3 days: (50*1) + (50*2) + (50*1) = 50 + 100 + 50 = 200
    const res3Day = simulateBulkExtend({
      actorRole: 'reseller',
      balance: 500,
      days: 3,
      keys: sampleKeys,
    })
    assert.equal(res3Day.success, true)
    assert.equal(res3Day.totalCost, 200)
    assert.equal(res3Day.remainingBalance, 300)
  })

  test('Rejects bulk extend when wallet balance is insufficient', () => {
    const res = simulateBulkExtend({
      actorRole: 'reseller',
      balance: 100, // costs 140 for 1 day
      days: 1,
      keys: sampleKeys,
    })
    assert.equal(res.success, false)
    assert.match(res.error, /Insufficient wallet balance/i)
  })
})

// 8. User Wallet Top-Up: Set Exact Balance vs Add Balance
describe('Wallet Top-Up: Set Exact Balance vs Add Balance', () => {
  function simulateTopUpBalance({ isOwner, mode, targetCurrentBalance, amount }) {
    if (isOwner && mode === 'set') {
      if (amount < 0) return { success: false, error: 'Target balance cannot be negative.' }
      return { success: true, newBalance: amount, mode: 'set' }
    }
    // Add mode
    if (amount <= 0) return { success: false, error: 'Transfer amount must be greater than 0.' }
    return { success: true, newBalance: targetCurrentBalance + amount, mode: 'add' }
  }

  test('Owner Set Exact Balance directly adjusts target balance to exact figure (even if lower or zero)', () => {
    // Reseller has 1200, Owner sets exact balance to 500 -> becomes 500 (not 1700!)
    const res = simulateTopUpBalance({
      isOwner: true,
      mode: 'set',
      targetCurrentBalance: 1200,
      amount: 500,
    })
    assert.equal(res.success, true)
    assert.equal(res.newBalance, 500)

    // Owner sets balance to 0 -> becomes 0
    const resZero = simulateTopUpBalance({
      isOwner: true,
      mode: 'set',
      targetCurrentBalance: 1200,
      amount: 0,
    })
    assert.equal(resZero.success, true)
    assert.equal(resZero.newBalance, 0)
  })

  test('Owner Add (Credit) mode increments on top of existing balance', () => {
    const res = simulateTopUpBalance({
      isOwner: true,
      mode: 'add',
      targetCurrentBalance: 1200,
      amount: 300,
    })
    assert.equal(res.success, true)
    assert.equal(res.newBalance, 1500)
  })

  test('Admin / Transfer mode rejects negative or 0 credit amount', () => {
    const resZero = simulateTopUpBalance({
      isOwner: false,
      mode: 'add',
      targetCurrentBalance: 500,
      amount: 0,
    })
    assert.equal(resZero.success, false)
    assert.match(resZero.error, /greater than 0/i)
  })
})

