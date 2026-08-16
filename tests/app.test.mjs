import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// 1. Weight & Pricing Calculation Logic
describe('Weight Multipliers & Pricing Calculations', () => {
  const sampleProduct = {
    id: 'prod-potato',
    name: 'Potato Jyoti',
    bnName: 'আলু জ্যোতি',
    pA: 40,
    pB: 30,
    pC: 22,
    unit: 'kg',
  }

  function calculateLinePrice(product, grade, multiplier, qty) {
    const base = grade === 'A' ? product.pA : grade === 'C' ? product.pC : product.pB
    const unitPrice = Math.round(base * multiplier)
    return { unitPrice, totalLine: unitPrice * qty }
  }

  test('Calculates correct 250g (0.25x) price for Grade B', () => {
    const res = calculateLinePrice(sampleProduct, 'B', 0.25, 2)
    assert.equal(res.unitPrice, 8) // Math.round(30 * 0.25) = 8
    assert.equal(res.totalLine, 16)
  })

  test('Calculates correct 500g (0.5x) price for Grade A', () => {
    const res = calculateLinePrice(sampleProduct, 'A', 0.5, 3)
    assert.equal(res.unitPrice, 20) // Math.round(40 * 0.5) = 20
    assert.equal(res.totalLine, 60)
  })

  test('Calculates correct 2kg (2x) price for Grade C', () => {
    const res = calculateLinePrice(sampleProduct, 'C', 2, 1)
    assert.equal(res.unitPrice, 44) // 22 * 2
    assert.equal(res.totalLine, 44)
  })

  test('Calculates multi-item cart total correctly', () => {
    const cart = [
      { productId: 'prod-potato', grade: 'B', qty: 2, weightMultiplier: 0.5 }, // 30*0.5=15 -> 30
      { productId: 'prod-potato', grade: 'A', qty: 1, weightMultiplier: 1.0 }, // 40*1=40 -> 40
      { productId: 'prod-potato', grade: 'C', qty: 1, weightMultiplier: 2.0 }, // 22*2=44 -> 44
    ]

    const total = cart.reduce((sum, item) => {
      const { totalLine } = calculateLinePrice(sampleProduct, item.grade, item.weightMultiplier, item.qty)
      return sum + totalLine
    }, 0)

    assert.equal(total, 114) // 30 + 40 + 44
  })
})

// 2. Order Payment, Advance & Balance Due Logic
describe('Payment Mode, Advance & Balance Calculations', () => {
  function computeOrderFinancials(subtotal, deliveryFee, discount, paymentType) {
    const grandTotal = Math.max(0, subtotal + deliveryFee - discount)
    const payableAmount = paymentType === 'full' ? grandTotal : Math.ceil(grandTotal * 0.5)
    const balanceDue = grandTotal - payableAmount
    return { grandTotal, payableAmount, balanceDue }
  }

  test('50% Advance mode calculates 50% payable and 50% balance due', () => {
    const res = computeOrderFinancials(500, 30, 50, 'advance') // total = 480
    assert.equal(res.grandTotal, 480)
    assert.equal(res.payableAmount, 240)
    assert.equal(res.balanceDue, 240)
  })

  test('100% Full Payment mode calculates full payable and 0 balance due', () => {
    const res = computeOrderFinancials(500, 30, 50, 'full')
    assert.equal(res.grandTotal, 480)
    assert.equal(res.payableAmount, 480)
    assert.equal(res.balanceDue, 0)
  })

  test('Rounds odd totals up for advance payment', () => {
    const res = computeOrderFinancials(301, 0, 0, 'advance')
    assert.equal(res.grandTotal, 301)
    assert.equal(res.payableAmount, 151) // Math.ceil(301 * 0.5)
    assert.equal(res.balanceDue, 150)
  })
})

// 3. Coupon Validation and Field Aliases
describe('Coupon Validation & Dual Schema Interoperability', () => {
  function validateCoupon(couponRow, orderTotal) {
    const isValid = couponRow.valid !== false && couponRow.active !== false
    const expiry = couponRow.expires_at || couponRow.valid_until
    if (!isValid) return null
    if (expiry && new Date(expiry).getTime() < Date.now()) return null
    if (orderTotal < (couponRow.min_order || 0)) return null

    const discVal = Number(couponRow.discount_value) || 0
    const computedDiscount =
      couponRow.discount_type === 'percent'
        ? Math.round((orderTotal * discVal) / 100)
        : discVal

    return { valid: true, discount: computedDiscount }
  }

  test('Validates active flat coupon successfully', () => {
    const coupon = { code: 'SAVE50', discount_type: 'flat', discount_value: 50, min_order: 300, valid: true }
    const res = validateCoupon(coupon, 400)
    assert.ok(res)
    assert.equal(res.discount, 50)
  })

  test('Validates active percentage coupon successfully', () => {
    const coupon = { code: '10OFF', discount_type: 'percent', discount_value: 10, min_order: 200, active: true }
    const res = validateCoupon(coupon, 500)
    assert.ok(res)
    assert.equal(res.discount, 50) // 10% of 500
  })

  test('Rejects expired coupon with valid_until', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString()
    const coupon = { code: 'OLD', discount_type: 'flat', discount_value: 20, min_order: 100, valid: true, valid_until: pastDate }
    const res = validateCoupon(coupon, 200)
    assert.equal(res, null)
  })

  test('Rejects when order total is below min_order threshold', () => {
    const coupon = { code: 'BIGORDER', discount_type: 'flat', discount_value: 100, min_order: 1000, valid: true }
    const res = validateCoupon(coupon, 500)
    assert.equal(res, null)
  })
})

// 4. UTR Validation & Duplicate Checks
describe('UTR Sanitization & Validation', () => {
  function sanitizeUTR(raw) {
    const clean = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const isValid = clean.length >= 10 && clean.length <= 22
    return { clean, isValid }
  }

  test('Sanitizes and validates normal 12-digit UPI UTR', () => {
    const res = sanitizeUTR(' 412345678901 ')
    assert.equal(res.clean, '412345678901')
    assert.equal(res.isValid, true)
  })

  test('Rejects too short UTR (< 10 chars)', () => {
    const res = sanitizeUTR('12345')
    assert.equal(res.isValid, false)
  })

  test('Rejects duplicate UTR when already exists on active order', () => {
    const existingOrders = [
      { id: 'ord-1', utr: '412345678901', status: 'confirmed' },
      { id: 'ord-2', utr: '598765432109', status: 'cancelled' },
    ]

    function isDuplicate(utr, currentOrderId = null) {
      return existingOrders.some(
        (o) => o.utr === utr && o.id !== currentOrderId && o.status !== 'cancelled'
      )
    }

    assert.equal(isDuplicate('412345678901'), true) // Confirmed order -> duplicate!
    assert.equal(isDuplicate('598765432109'), false) // Cancelled order -> allowed!
    assert.equal(isDuplicate('999999999999'), false) // New UTR -> allowed!
  })
})

// 5. XSS Protection in Print Invoices
describe('XSS Protection in Invoices & Print Utilities', () => {
  function escapeHtml(str) {
    if (str == null) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  test('Sanitizes malicious script tags in customer names', () => {
    const maliciousName = '<script>alert("hacked")</script>'
    const escaped = escapeHtml(maliciousName)
    assert.equal(escaped.includes('<script>'), false)
    assert.equal(escaped, '&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;')
  })

  test('Sanitizes HTML injection in customer addresses', () => {
    const maliciousAddress = '<img src=x onerror=alert(1)> Flat 4B'
    const escaped = escapeHtml(maliciousAddress)
    assert.equal(escaped.includes('<img'), false)
    assert.equal(escaped.includes('onerror'), true)
    assert.equal(escaped.startsWith('&lt;img'), true)
  })
})

// 6. Checkout Unlock & Error Recovery
describe('Checkout Lock & Error Recovery', () => {
  test('Submitting state is guaranteed to reset in finally block even on error', async () => {
    let isSubmitting = false

    async function submitMock(shouldFail) {
      isSubmitting = true
      try {
        if (shouldFail) throw new Error('Network timeout')
        return { success: true }
      } finally {
        isSubmitting = false
      }
    }

    // Success flow
    await submitMock(false)
    assert.equal(isSubmitting, false)

    // Error flow
    try {
      await submitMock(true)
    } catch {
      // Ignored
    }
    assert.equal(isSubmitting, false, 'Submitting lock must be released on error')
  })
})
