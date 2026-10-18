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
