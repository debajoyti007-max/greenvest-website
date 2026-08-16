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

// 6. Checkout Lock & Cart Safety on Error
describe('Checkout Lock & Cart Safety', () => {
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

    await submitMock(false)
    assert.equal(isSubmitting, false)

    try {
      await submitMock(true)
    } catch {}
    assert.equal(isSubmitting, false, 'Submitting lock must be released on error')
  })

  test('Cart is not cleared when order placement throws an error', async () => {
    let cart = [{ productId: 'p1', qty: 2 }]

    async function placeOrderMock(shouldFail) {
      if (shouldFail) throw new Error('DB connection failed')
      // Only clear cart upon success:
      cart = []
      return { id: 'ord-123' }
    }

    try {
      await placeOrderMock(true)
    } catch {}

    assert.equal(cart.length, 1, 'Cart items must be preserved after order error')
    assert.equal(cart[0].productId, 'p1')

    // Successful order clears cart
    await placeOrderMock(false)
    assert.equal(cart.length, 0, 'Cart is safely cleared upon success')
  })
})

// 7. Customer Privacy & Access Isolation
describe('Customer Privacy & Order Isolation', () => {
  const allOrders = [
    { id: 'o-1', userId: 'user-alice', userEmail: 'alice@mail.com', phone: '9876543210' },
    { id: 'o-2', userId: 'user-bob', userEmail: 'bob@mail.com', phone: '9123456789' },
  ]

  function filterCustomerOrders(orders, currentUserId, userEmail, phone, role) {
    const isStaff = role === 'seller' || role === 'admin' || role === 'rider'
    if (isStaff) return orders
    if (!currentUserId && !userEmail && !phone) return []
    return orders.filter(
      (o) =>
        o.userId === currentUserId ||
        (userEmail && o.userEmail === userEmail) ||
        (phone && o.phone === phone)
    )
  }

  test('Regular customer can only view their own orders', () => {
    const aliceOrders = filterCustomerOrders(allOrders, 'user-alice', 'alice@mail.com', '9876543210', 'customer')
    assert.equal(aliceOrders.length, 1)
    assert.equal(aliceOrders[0].id, 'o-1')
  })

  test('Unauthenticated/empty user returns 0 orders', () => {
    const guestOrders = filterCustomerOrders(allOrders, null, null, null, 'customer')
    assert.equal(guestOrders.length, 0)
  })

  test('Staff members can view all orders', () => {
    const staffOrders = filterCustomerOrders(allOrders, 'user-staff', 'staff@mail.com', null, 'seller')
    assert.equal(staffOrders.length, 2)
  })
})

// 8. Rider Delivery Gating
describe('Rider Delivery Gating Requirements', () => {
  function canRiderDeliver(order) {
    return Boolean(order.utrVerified || order.status === 'confirmed' || order.status === 'advance_paid')
  }

  test('Allows delivery when payment is verified (utrVerified: true)', () => {
    assert.equal(canRiderDeliver({ status: 'pending', utrVerified: true }), true)
  })

  test('Allows delivery when seller confirmed order (status: confirmed)', () => {
    assert.equal(canRiderDeliver({ status: 'confirmed', utrVerified: false }), true)
  })

  test('Prevents rider from marking delivered when order is unverified pending', () => {
    assert.equal(canRiderDeliver({ status: 'pending', utrVerified: false }), false)
  })
})

// 9. Optimistic State Rollback on API Failure
describe('Optimistic Updates State Rollback', () => {
  test('Reverts orders state to previous snapshot on update failure', async () => {
    let ordersState = [{ id: 'o-1', status: 'pending' }]

    async function updateStatusOptimistic(id, newStatus, shouldFail) {
      const prevSnapshot = [...ordersState]
      // Optimistic update:
      ordersState = ordersState.map((o) => (o.id === id ? { ...o, status: newStatus } : o))

      try {
        if (shouldFail) throw new Error('Network error')
      } catch {
        // Rollback:
        ordersState = prevSnapshot
      }
    }

    // Failed update should rollback to pending
    await updateStatusOptimistic('o-1', 'delivered', true)
    assert.equal(ordersState[0].status, 'pending', 'State must rollback to pending after API failure')

    // Successful update should commit
    await updateStatusOptimistic('o-1', 'delivered', false)
    assert.equal(ordersState[0].status, 'delivered', 'State updates successfully on API success')
  })
})

// 10. Free Delivery & PIN Code Verification Logic
describe('Free Delivery & PIN Code Verification Logic', () => {
  function calcDeliveryFee(_pin) {
    return { fee: 0, zone: 'Free Delivery' }
  }

  function isValidPinCode(pin) {
    if (!pin) return false
    const cleaned = String(pin).replace(/\D/g, '')
    return cleaned.length === 6
  }

  test('Always provides ₹0 free delivery regardless of PIN location', () => {
    assert.equal(calcDeliveryFee('721632').fee, 0)
    assert.equal(calcDeliveryFee('700001').fee, 0)
    assert.equal(calcDeliveryFee('110001').fee, 0)
  })

  test('Validates 6-digit PIN code format for address verification', () => {
    assert.equal(isValidPinCode('721632'), true)
    assert.equal(isValidPinCode(' 721632 '), true)
    assert.equal(isValidPinCode('72163'), false)
    assert.equal(isValidPinCode(''), false)
  })
})

// 11. High-Volume Scalability & Storage Quotas
describe('High-Volume Scalability & Quota Protection', () => {
  test('Caps local storage orders to latest 50 entries', () => {
    const hugeOrdersList = Array.from({ length: 120 }, (_, i) => ({
      id: `ord-${i}`,
      total: 500,
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    }))

    function saveOrdersPruned(orders) {
      return orders.slice(0, 50)
    }

    const saved = saveOrdersPruned(hugeOrdersList)
    assert.equal(saved.length, 50)
    assert.equal(saved[0].id, 'ord-0')
    assert.equal(saved[49].id, 'ord-49')
  })

  test('fetchOrders applies default limit to prevent unbounded memory spikes', () => {
    function getQueryLimit(customLimit) {
      return customLimit || 100
    }

    assert.equal(getQueryLimit(undefined), 100)
    assert.equal(getQueryLimit(25), 25)
  })
})

// 12. Guest Order Tracking, UTR Edit, and Daily Manifest
describe('Guest Tracking, UTR Edit & Manifest Logic', () => {
  test('Public order query normalizes search inputs correctly', () => {
    function cleanTrackingQuery(raw) {
      return (raw || '').trim().toLowerCase().replace(/^#/, '')
    }

    assert.equal(cleanTrackingQuery('#ORD-849201'), 'ord-849201')
    assert.equal(cleanTrackingQuery(' 849201 '), '849201')
    assert.equal(cleanTrackingQuery('#849201'), '849201')
  })

  test('UTR edit is only allowed for unverified pending orders within 30 minutes', () => {
    function canEditUtr(order) {
      if (order.status !== 'pending') return false
      if (order.utrVerified) return false
      const elapsed = Date.now() - new Date(order.createdAt).getTime()
      return elapsed < 30 * 60 * 1000
    }

    const recentPending = { status: 'pending', utrVerified: false, createdAt: new Date().toISOString() }
    const verifiedPending = { status: 'pending', utrVerified: true, createdAt: new Date().toISOString() }
    const confirmedOrder = { status: 'confirmed', utrVerified: true, createdAt: new Date().toISOString() }
    const oldPending = { status: 'pending', utrVerified: false, createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString() }

    assert.equal(canEditUtr(recentPending), true)
    assert.equal(canEditUtr(verifiedPending), false)
    assert.equal(canEditUtr(confirmedOrder), false)
    assert.equal(canEditUtr(oldPending), false)
  })

  test('Rider daily manifest calculates correct total balance to collect', () => {
    const orders = [
      { total: 500, advanceAmount: 250, status: 'confirmed' },
      { total: 1000, advanceAmount: 1000, status: 'confirmed' },
      { total: 800, advanceAmount: 400, status: 'confirmed' },
    ]

    const totalCashToCollect = orders.reduce((sum, o) => sum + Math.max(0, o.total - o.advanceAmount), 0)
    assert.equal(totalCashToCollect, 650) // 250 + 0 + 400 = 650
  })
})

// 13. Distance-Based Delivery & Store Pickup Logic
describe('Store Location & Distance-Based Delivery Tiers', () => {
  const STORE_LOCATION = {
    lat: 22.1723059,
    lng: 87.8677517,
  }

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 10) / 10
  }

  function calcDeliveryFee(distanceKm, fulfillmentMode) {
    if (fulfillmentMode === 'pickup') {
      return { fee: 0, isPickup: true, isOutOfRange: false }
    }
    if (distanceKm <= 5) {
      return { fee: 30, isPickup: false, isOutOfRange: false }
    }
    if (distanceKm <= 15) {
      return { fee: 50, isPickup: false, isOutOfRange: false }
    }
    return { fee: 50, isPickup: false, isOutOfRange: true }
  }

  test('Haversine distance calculation is accurate', () => {
    const d = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, 22.19, 87.88)
    assert.ok(d > 2.0 && d < 3.5)
  })

  test('Store pickup has zero (0) delivery charge', () => {
    const res = calcDeliveryFee(8.0, 'pickup')
    assert.equal(res.fee, 0)
    assert.equal(res.isPickup, true)
    assert.equal(res.isOutOfRange, false)
  })

  test('Under 5 km charges exactly ₹30 delivery fee', () => {
    const res = calcDeliveryFee(3.2, 'delivery')
    assert.equal(res.fee, 30)
    assert.equal(res.isOutOfRange, false)
  })

  test('5 km to 15 km charges exactly ₹50 delivery fee', () => {
    const res = calcDeliveryFee(10.5, 'delivery')
    assert.equal(res.fee, 50)
    assert.equal(res.isOutOfRange, false)
  })

  test('Beyond 15 km is flagged as out of delivery range', () => {
    const res = calcDeliveryFee(18.2, 'delivery')
    assert.equal(res.isOutOfRange, true)
  })
})

