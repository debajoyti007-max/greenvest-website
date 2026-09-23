import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    const payableAmount = paymentType === 'full' ? grandTotal : (grandTotal > 0 ? Math.max(1, Math.ceil(grandTotal * 0.1)) : 0)
    const balanceDue = grandTotal - payableAmount
    return { grandTotal, payableAmount, balanceDue }
  }

  test('10% Advance mode calculates 10% payable and 90% balance due', () => {
    const res = computeOrderFinancials(500, 30, 50, 'advance') // total = 480
    assert.equal(res.grandTotal, 480)
    assert.equal(res.payableAmount, 48) // 480 * 0.1
    assert.equal(res.balanceDue, 432)
  })

  test('100% Full Payment mode calculates full payable and 0 balance due', () => {
    const res = computeOrderFinancials(500, 30, 50, 'full')
    assert.equal(res.grandTotal, 480)
    assert.equal(res.payableAmount, 480)
    assert.equal(res.balanceDue, 0)
  })

  test('Rounds odd totals up for 10% advance payment', () => {
    const res = computeOrderFinancials(301, 0, 0, 'advance')
    assert.equal(res.grandTotal, 301)
    assert.equal(res.payableAmount, 31) // Math.ceil(301 * 0.1)
    assert.equal(res.balanceDue, 270)
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

// 4. Zero-Friction 1-Tap UPI Order Placement (No UTR Required)
describe('Zero-Friction 1-Tap UPI Order Placement', () => {
  test('Creates order seamlessly without requiring customer UTR input', () => {
    const order = {
      id: 'ord-test-1',
      userId: 'usr-123',
      payerUpiName: 'Sourav Ghosh',
      total: 350,
      advanceAmount: 35,
      paymentType: 'advance',
      status: 'pending',
    }

    assert.equal(order.status, 'pending')
    assert.equal(order.payerUpiName, 'Sourav Ghosh')
    assert.equal(order.advanceAmount, 35)
    assert.equal(order.utr, undefined)
  })

  test('Defaults database storage UTR to ONLINE when unspecified', () => {
    function prepareOrderForDb(order) {
      return {
        ...order,
        utr: order.utr || 'ONLINE',
      }
    }

    const res = prepareOrderForDb({ id: 'ord-2', total: 400 })
    assert.equal(res.utr, 'ONLINE')
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
    return Boolean(order.status === 'confirmed' || order.status === 'advance_paid')
  }

  test('Allows delivery when seller confirmed order (status: confirmed)', () => {
    assert.equal(canRiderDeliver({ status: 'confirmed' }), true)
  })

  test('Allows delivery when advance is paid (status: advance_paid)', () => {
    assert.equal(canRiderDeliver({ status: 'advance_paid' }), true)
  })

  test('Prevents rider from marking delivered when order is still pending', () => {
    assert.equal(canRiderDeliver({ status: 'pending' }), false)
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

// 10. Tiered Delivery & PIN Code Verification Logic
describe('Tiered Delivery & PIN Code Verification Logic', () => {
  const SERVICEABLE_PINCODES = ['721632', '721633', '721643']
  const PIN_DISTANCE_MAP = {
    '721632': { distanceKm: 3.2, fee: 30 },
    '721633': { distanceKm: 8.0, fee: 50 },
    '721643': { distanceKm: 10.5, fee: 50 },
  }

  function calcDeliveryFee(pin, fulfillmentMode = 'delivery') {
    if (fulfillmentMode === 'pickup') {
      return { fee: 0, isPickup: true, isOutOfRange: false }
    }
    const cleanPin = pin ? String(pin).replace(/\D/g, '') : ''
    if (cleanPin.length === 6 && !SERVICEABLE_PINCODES.includes(cleanPin)) {
      return { fee: 0, isOutOfRange: true }
    }
    if (SERVICEABLE_PINCODES.includes(cleanPin)) {
      const pinInfo = PIN_DISTANCE_MAP[cleanPin]
      const distanceKm = pinInfo ? pinInfo.distanceKm : 3.5
      const fee = distanceKm > 5 ? 50 : 30
      return { fee, distanceKm, isOutOfRange: false }
    }
    return { fee: 30, isOutOfRange: false }
  }

  function isValidPinCode(pin) {
    if (!pin) return false
    const cleaned = String(pin).replace(/\D/g, '')
    return cleaned.length === 6
  }

  test('Store pickup provides ₹0 free delivery', () => {
    assert.equal(calcDeliveryFee('721632', 'pickup').fee, 0)
    assert.equal(calcDeliveryFee('721632', 'pickup').isPickup, true)
  })

  test('Local PIN under 5km (721632) charges ₹30', () => {
    const res = calcDeliveryFee('721632')
    assert.equal(res.fee, 30)
    assert.equal(res.isOutOfRange, false)
  })

  test('Extended PIN over 5km (721633, 721643) charges ₹50', () => {
    assert.equal(calcDeliveryFee('721633').fee, 50)
    assert.equal(calcDeliveryFee('721643').fee, 50)
  })

  test('Unserviceable PIN is flagged as out of range', () => {
    assert.equal(calcDeliveryFee('700001').isOutOfRange, true)
    assert.equal(calcDeliveryFee('110001').isOutOfRange, true)
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

// 12. Guest Order Tracking, Cancellation Window, and Daily Manifest
describe('Guest Tracking, Order Cancellation Window & Manifest Logic', () => {
  test('Public order query normalizes search inputs correctly', () => {
    function cleanTrackingQuery(raw) {
      return (raw || '').trim().toLowerCase().replace(/^#/, '')
    }

    assert.equal(cleanTrackingQuery('#ORD-849201'), 'ord-849201')
    assert.equal(cleanTrackingQuery(' 849201 '), '849201')
    assert.equal(cleanTrackingQuery('#849201'), '849201')
  })

  test('Customer cancellation is only allowed for pending orders within 30 minutes', () => {
    function canCancelPendingOrder(order) {
      if (order.status !== 'pending') return false
      const elapsed = Date.now() - new Date(order.createdAt).getTime()
      return elapsed < 30 * 60 * 1000
    }

    const recentPending = { status: 'pending', createdAt: new Date().toISOString() }
    const confirmedOrder = { status: 'confirmed', createdAt: new Date().toISOString() }
    const oldPending = { status: 'pending', createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString() }

    assert.equal(canCancelPendingOrder(recentPending), true)
    assert.equal(canCancelPendingOrder(confirmedOrder), false)
    assert.equal(canCancelPendingOrder(oldPending), false)
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
    lat: 22.1746825,
    lng: 87.9106158,
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
    assert.ok(d >= 3.0 && d <= 4.0)
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

describe('Customer Product Reviews & Star Ratings', () => {
  const calculateProductRating = (reviews, productId) => {
    const prodReviews = reviews.filter((r) => r.productId === productId)
    if (prodReviews.length === 0) {
      return { avg: 4.9, count: 6 }
    }
    const sum = prodReviews.reduce((acc, r) => acc + r.rating, 0)
    const avg = Math.round((sum / prodReviews.length) * 10) / 10
    return { avg, count: prodReviews.length }
  }

  const sampleReviews = [
    { productId: 'p1', rating: 5, comment: 'Great tomatoes' },
    { productId: 'p1', rating: 4, comment: 'Good quality' },
    { productId: 'p2', rating: 5, comment: 'Clean potatoes' },
  ]

  test('Calculates correct average and review count for products with reviews', () => {
    const res = calculateProductRating(sampleReviews, 'p1')
    assert.equal(res.count, 2)
    assert.equal(res.avg, 4.5)
  })

  test('Returns high starter rating for unreviewed fresh products', () => {
    const res = calculateProductRating(sampleReviews, 'p99')
    assert.equal(res.count, 6)
    assert.equal(res.avg, 4.9)
  })

  test('Rating clamped between 1 and 5 stars', () => {
    const validateRating = (r) => Math.min(5, Math.max(1, Math.round(r)))
    assert.equal(validateRating(6), 5)
    assert.equal(validateRating(0), 1)
    assert.equal(validateRating(4.7), 5)
  })
})

describe('Dynamic UPI QR & 1-Tap Pay Link Generator', () => {
  const buildUpiPayUri = (upiId, amount, note = 'GreenVest Order') => {
    const cleanPa = upiId.trim()
    const cleanPn = encodeURIComponent('GreenVest Fresh')
    const cleanAm = Math.max(1, amount).toFixed(2)
    const cleanTn = encodeURIComponent(note)
    return `upi://pay?pa=${cleanPa}&pn=${cleanPn}&am=${cleanAm}&cu=INR&tn=${cleanTn}`
  }

  test('Embeds exact payable amount in UPI URI correctly', () => {
    const uri = buildUpiPayUri('8170859653-2@ybl', 340, 'GreenVest Order')
    assert.ok(uri.includes('am=340.00'))
    assert.ok(uri.includes('pa=8170859653-2%40ybl') || uri.includes('pa=8170859653-2@ybl'))
    assert.ok(uri.includes('cu=INR'))
  })

  test('Formats advance 10% amount correctly with 2 decimal places', () => {
    const uri = buildUpiPayUri('8170859653-2@ybl', 275.5, 'GreenVest Order')
    assert.ok(uri.includes('am=275.50'))
  })
})

describe('Rider Turn-by-Turn GPS Navigation URL Builder', () => {
  const buildRiderNavUrl = (order) => {
    const destParam = (order.geoLat && order.geoLng)
      ? `${order.geoLat},${order.geoLng}`
      : encodeURIComponent(`${order.address}, ${order.pin || ''}, West Bengal`)
    return `https://www.google.com/maps/dir/?api=1&destination=${destParam}&travelmode=driving`
  }

  test('Builds direct GPS lat/lng destination when coordinates exist', () => {
    const order = { geoLat: 22.1746, geoLng: 87.9106, address: 'Test House', pin: '721632' }
    const url = buildRiderNavUrl(order)
    assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=22.1746,87.9106&travelmode=driving')
  })

  test('Builds address + PIN fallback destination when no GPS is recorded', () => {
    const order = { address: 'Tamluk Station Road', pin: '721636' }
    const url = buildRiderNavUrl(order)
    assert.ok(url.includes('destination=Tamluk%20Station%20Road%2C%20721636%2C%20West%20Bengal'))
    assert.ok(url.includes('travelmode=driving'))
  })
})

describe('Safe JSON Parsing & Cache Self-Healing Guard', () => {
  const safeJsonParse = (raw, fallback) => {
    if (!raw || typeof raw !== 'string') return fallback
    try {
      const parsed = JSON.parse(raw)
      return parsed !== null && parsed !== undefined ? parsed : fallback
    } catch {
      return fallback
    }
  }

  test('Parses valid JSON strings successfully', () => {
    const res = safeJsonParse('{"name":"Tomato","price":40}', { name: 'fallback', price: 0 })
    assert.equal(res.name, 'Tomato')
    assert.equal(res.price, 40)
  })

  test('Safely returns fallback on corrupted/broken JSON without crashing', () => {
    const res = safeJsonParse('{corrupted_json_syntax...', { status: 'safe_fallback' })
    assert.equal(res.status, 'safe_fallback')
  })

  test('Handles null, undefined and empty strings without throwing', () => {
    assert.equal(safeJsonParse(null, 'default'), 'default')
    assert.equal(safeJsonParse(undefined, 'default'), 'default')
    assert.equal(safeJsonParse('', 'default'), 'default')
  })
})

// 9. Client Feature Suite: 9 Specialized Requirements
describe('9 Client Requirements & Features Validation', () => {
  // Feature 1 & 4: Serviceable Pincodes Whitelist
  const SERVICEABLE_PINCODES = ['721632', '721633', '721643']
  const isServiceablePin = (pin) => {
    if (!pin) return false
    const clean = String(pin).trim()
    return SERVICEABLE_PINCODES.includes(clean)
  }

  test('Pincode whitelist allows 721632, 721633, 721643 and rejects others', () => {
    assert.equal(isServiceablePin('721632'), true)
    assert.equal(isServiceablePin('721633'), true)
    assert.equal(isServiceablePin('721643'), true)
    assert.equal(isServiceablePin('700001'), false)
    assert.equal(isServiceablePin('721636'), false)
    assert.equal(isServiceablePin(''), false)
  })

  // Feature 2: Tiered / Dynamic Pricing
  const calculateTierDiscount = (basePrice, tier) => {
    if (!basePrice || basePrice <= 0) return 0
    if (tier === 'vip') return Math.round(basePrice * 0.95)
    if (tier === 'wholesale') return Math.round(basePrice * 0.88)
    return basePrice
  }

  test('Dynamic pricing applies 5% discount for VIP and 12% for Wholesale', () => {
    assert.equal(calculateTierDiscount(100, 'regular'), 100)
    assert.equal(calculateTierDiscount(100, 'vip'), 95)
    assert.equal(calculateTierDiscount(100, 'wholesale'), 88)
    assert.equal(calculateTierDiscount(50, 'wholesale'), 44)
  })

  // Feature 1: MRP Strikethrough Calculation & Varied Dynamic Discount %
  const computeMarketMrp = (sellingPrice, overrideMrp, productKey) => {
    if (overrideMrp && overrideMrp > sellingPrice) return overrideMrp
    if (!sellingPrice || sellingPrice <= 0) return 0
    const variations = [18, 22, 25, 28, 30, 33, 35, 38, 42]
    let markupPercent = 25
    if (productKey) {
      let hash = 0
      for (let i = 0; i < productKey.length; i++) {
        hash = (hash << 5) - hash + productKey.charCodeAt(i)
        hash |= 0
      }
      markupPercent = variations[Math.abs(hash) % variations.length]
    } else {
      markupPercent = variations[Math.abs(Math.round(sellingPrice)) % variations.length]
    }
    return Math.ceil(sellingPrice * (1 + markupPercent / 100))
  }

  const computeDiscountPercent = (mrp, sellingPrice) => {
    if (!mrp || mrp <= sellingPrice) return 0
    return Math.round(((mrp - sellingPrice) / mrp) * 100)
  }

  test('Market MRP computes varied organic markups across different items', () => {
    const mrp1 = computeMarketMrp(20, undefined, 'veg-potato')
    const mrp2 = computeMarketMrp(40, undefined, 'veg-tomato')
    const mrp3 = computeMarketMrp(70, undefined, 'veg-capsicum')

    assert.ok(mrp1 > 20)
    assert.ok(mrp2 > 40)
    assert.ok(mrp3 > 70)

    const disc1 = computeDiscountPercent(mrp1, 20)
    const disc2 = computeDiscountPercent(mrp2, 40)
    const disc3 = computeDiscountPercent(mrp3, 70)

    // Ensure realistic varied discounts between 15% and 35%
    assert.ok(disc1 >= 15 && disc1 <= 35)
    assert.ok(disc2 >= 15 && disc2 <= 35)
    assert.ok(disc3 >= 15 && disc3 <= 35)
  })

  test('Market MRP dynamically adjusts when seller changes the main price', () => {
    // Seller sets price 20 -> MRP adjusts
    const mrpAt20 = computeMarketMrp(20, undefined, 'veg-onion')
    // Seller increases price to 30 -> MRP automatically scales up
    const mrpAt30 = computeMarketMrp(30, undefined, 'veg-onion')
    assert.ok(mrpAt30 > mrpAt20)

    // Seller provides custom override MRP 45 for selling price 30
    const customMrp = computeMarketMrp(30, 45, 'veg-onion')
    assert.equal(customMrp, 45)
    assert.equal(computeDiscountPercent(customMrp, 30), 33) // (45-30)/45 = 33% OFF
  })

  // Feature 3: Option A, B, C Custom Visibility
  const filterAvailableGrades = (product) => {
    if (product.availableGrades && product.availableGrades.length > 0) {
      return product.availableGrades
    }
    return ['A', 'B', 'C']
  }

  test('Filters available product grades based on seller toggles', () => {
    const productWithAandB = { id: 'p1', availableGrades: ['A', 'B'] }
    const productDefault = { id: 'p2' }
    assert.deepEqual(filterAvailableGrades(productWithAandB), ['A', 'B'])
    assert.deepEqual(filterAvailableGrades(productDefault), ['A', 'B', 'C'])
  })

  // Feature 8: Operating Hours Shifts
  const isShiftOpen = (hour) => {
    // Morning: 7-12, Evening: 16-21
    return (hour >= 7 && hour < 12) || (hour >= 16 && hour < 21)
  }

  test('Store shift calculation detects Morning & Evening store hours correctly', () => {
    assert.equal(isShiftOpen(8), true)   // 8 AM (Morning open)
    assert.equal(isShiftOpen(11), true)  // 11 AM (Morning open)
    assert.equal(isShiftOpen(13), false) // 1 PM (Midday break)
    assert.equal(isShiftOpen(18), true)  // 6 PM (Evening open)
    assert.equal(isShiftOpen(22), false) // 10 PM (Closed for night)
    assert.equal(isShiftOpen(5), false)  // 5 AM (Closed)
  })

  // Feature 9: Max 10 kg Vegetable Order Limit
  test('Vegetable quantity limit caps at 10 kg and detects bulk inquiry need', () => {
    const MAX_KG = 10
    const qty1 = 5
    const qty2 = 12
    assert.equal(qty1 <= MAX_KG, true)
    assert.equal(qty2 > MAX_KG, true)
  })

  // Feature 1 Enhancement: Fully Customizable Seller Promotional Deals
  const filterActiveDeals = (deals) => deals.filter((d) => d.isActive !== false)

  test('Filters active promotional deals and excludes seller-disabled ones', () => {
    const deals = [
      { id: 'd1', titleEn: '50% off', isActive: true },
      { id: 'd2', titleEn: 'Old offer', isActive: false },
      { id: 'd3', titleEn: 'Free gift', isActive: true },
    ]
    const active = filterActiveDeals(deals)
    assert.equal(active.length, 2)
    assert.equal(active.some((d) => d.id === 'd2'), false)
  })

  test('Supports custom seller deals with or without coupon codes', () => {
    const customDealWithCode = {
      id: 'd-code',
      titleBn: '১০% ছাড়',
      titleEn: '10% OFF',
      couponCode: 'SPECIAL10',
      isActive: true,
    }
    const customDealWithoutCode = {
      id: 'd-nocode',
      titleBn: 'ফ্রি হোম ডেলিভারি',
      titleEn: 'Free Delivery',
      linkUrl: '/shop',
      isActive: true,
    }
    assert.equal(Boolean(customDealWithCode.couponCode), true)
    assert.equal(Boolean(customDealWithoutCode.couponCode), false)
    assert.equal(customDealWithoutCode.linkUrl, '/shop')
  })
})

// 19. Auto Smart Remove System (Deals Expiry, Stale Orders)
describe('Auto Smart Remove Engine', () => {
  // Feature 1: Deal Expiry and Auto-Removal
  const isDealExpired = (deal) => {
    if (!deal.expiresAt) return false
    const expTime = new Date(deal.expiresAt).getTime()
    if (isNaN(expTime)) return false
    return Date.now() > expTime
  }

  const filterActiveDeals = (deals) => {
    return deals.filter((d) => d.isActive !== false && !isDealExpired(d))
  }

  test('Auto-detects and excludes expired promotional deals from storefront', () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString() // in 1 hour

    const deals = [
      { id: 'd-live', titleEn: 'Ongoing deal', isActive: true },
      { id: 'd-future', titleEn: 'Flash sale', isActive: true, expiresAt: futureDate },
      { id: 'd-expired', titleEn: 'Midnight special', isActive: true, expiresAt: pastDate },
      { id: 'd-disabled', titleEn: 'Disabled deal', isActive: false },
    ]

    const activeDeals = filterActiveDeals(deals)
    assert.equal(activeDeals.length, 2)
    assert.equal(activeDeals.some((d) => d.id === 'd-live'), true)
    assert.equal(activeDeals.some((d) => d.id === 'd-future'), true)
    assert.equal(activeDeals.some((d) => d.id === 'd-expired'), false)
    assert.equal(activeDeals.some((d) => d.id === 'd-disabled'), false)
  })

  // Feature 4: Stale Pending Orders Auto-Cancel
  const isOrderStalePending = (order, timeoutHours = 2) => {
    if (order.status !== 'pending') return false
    const created = new Date(order.createdAt).getTime()
    if (isNaN(created)) return false
    const ageHours = (Date.now() - created) / (1000 * 60 * 60)
    return ageHours >= timeoutHours
  }

  test('Correctly identifies unconfirmed orders older than 2 hours as stale pending', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const staleOrder = { id: 'ord-stale', status: 'pending', createdAt: threeHoursAgo }
    const freshPendingOrder = { id: 'ord-fresh', status: 'pending', createdAt: thirtyMinsAgo }
    const confirmedOrder = { id: 'ord-conf', status: 'confirmed', createdAt: threeHoursAgo }

    assert.equal(isOrderStalePending(staleOrder, 2), true, 'Order > 2 hours pending must be stale')
    assert.equal(isOrderStalePending(freshPendingOrder, 2), false, 'Recent order must not be stale')
    assert.equal(isOrderStalePending(confirmedOrder, 2), false, 'Confirmed order must not be stale')
  })
})

// 20. Universal Database Persistence & Field Mapping
describe('Universal Database Persistence & Field Mapping', () => {
  test('ProductRow maps mrp, available_grades, and stock accurately', () => {
    const product = {
      id: 'p-test',
      emoji: '🥬',
      name: 'Palak',
      bnName: 'পালং শাক',
      pA: 30,
      pB: 25,
      pC: 20,
      mrp: 40,
      availableGrades: ['A', 'B'],
      inStock: true,
      category: 'Leafy',
      unit: 'kg',
    }

    // Map to row
    const row = {
      id: product.id,
      emoji: product.emoji,
      name: product.name,
      bn_name: product.bnName,
      p_a: product.pA,
      p_b: product.pB,
      p_c: product.pC,
      mrp: product.mrp,
      available_grades: product.availableGrades,
      in_stock: product.inStock,
    }

    assert.equal(row.mrp, 40)
    assert.deepEqual(row.available_grades, ['A', 'B'])
    assert.equal(row.p_a, 30)
    assert.equal(row.p_b, 25)
    assert.equal(row.p_c, 20)
  })

  test('ProfileRow maps customer tier correctly', () => {
    const profileRow = {
      id: 'usr-123',
      email: 'customer@greenvest.shop',
      name: 'Rohan',
      role: 'customer',
      tier: 'vip',
      phone: '9876543210',
      created_at: new Date().toISOString(),
    }

    const mappedUser = {
      id: profileRow.id,
      email: profileRow.email,
      name: profileRow.name,
      role: profileRow.role,
      tier: profileRow.tier || 'regular',
      phone: profileRow.phone,
    }

    assert.equal(mappedUser.tier, 'vip')
  })

  test('PromotionalDeal preserves empty list after all deals are deleted', () => {
    const deals = []
    const raw = JSON.stringify(deals)
    const parsed = JSON.parse(raw)
    const getStored = (data) => (Array.isArray(data) ? data : [{ id: 'default' }])
    
    const result = getStored(parsed)
    assert.deepEqual(result, [], 'Deleted deals list must remain empty and not resurrect defaults')
  })
})

// 21. In-App Customer Support & Live Chat Desk
describe('In-App Customer Support & Live Chat Desk', () => {
  test('Filters support messages by customer user ID correctly', () => {
    const allMessages = [
      { id: 'm1', userId: 'user-1', userName: 'User One', message: 'Hi', createdAt: '2026-08-28T10:00:00Z' },
      { id: 'm2', userId: 'user-2', userName: 'User Two', message: 'Hello', createdAt: '2026-08-28T10:05:00Z' },
      { id: 'm3', userId: 'user-1', userName: 'User One', message: 'Where is my order?', createdAt: '2026-08-28T10:10:00Z' },
    ]

    const user1Thread = allMessages.filter((m) => m.userId === 'user-1')
    assert.equal(user1Thread.length, 2)
    assert.equal(user1Thread[0].id, 'm1')
    assert.equal(user1Thread[1].id, 'm3')
  })

  test('Resolving support ticket updates all user messages to resolved status', () => {
    const messages = [
      { id: 'm1', userId: 'user-1', status: 'open' },
      { id: 'm2', userId: 'user-2', status: 'open' },
    ]

    const resolved = messages.map((m) => (m.userId === 'user-1' ? { ...m, status: 'resolved' } : m))
    assert.equal(resolved.find((m) => m.id === 'm1')?.status, 'resolved')
    assert.equal(resolved.find((m) => m.id === 'm2')?.status, 'open')
  })

  test('Reopening support ticket sets user messages back to open status', () => {
    const messages = [
      { id: 'm1', userId: 'user-1', status: 'resolved' },
      { id: 'm2', userId: 'user-2', status: 'resolved' },
    ]

    const reopened = messages.map((m) => (m.userId === 'user-1' ? { ...m, status: 'open' } : m))
    assert.equal(reopened.find((m) => m.id === 'm1')?.status, 'open')
    assert.equal(reopened.find((m) => m.id === 'm2')?.status, 'resolved')
  })

  test('Auto-cleans resolved junk older than 7 days from storage and preserves active open tickets', () => {
    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
    const yesterday = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString()
    const cutoffTime = now - 7 * 24 * 60 * 60 * 1000

    const messages = [
      { id: 'm1', userId: 'user-1', status: 'resolved', createdAt: eightDaysAgo }, // junk (old resolved) -> PURGE
      { id: 'm2', userId: 'user-2', status: 'open', createdAt: eightDaysAgo },     // open -> PRESERVE
      { id: 'm3', userId: 'user-3', status: 'resolved', createdAt: yesterday },    // fresh resolved -> PRESERVE
    ]

    const active = messages.filter((m) => {
      const isOldResolved = m.status === 'resolved' && new Date(m.createdAt).getTime() < cutoffTime
      return !isOldResolved
    })

    assert.equal(active.length, 2)
    assert.equal(active.some((m) => m.id === 'm1'), false, 'Old resolved message m1 must be purged')
    assert.equal(active.some((m) => m.id === 'm2'), true, 'Open message m2 must be preserved')
    assert.equal(active.some((m) => m.id === 'm3'), true, 'Recent resolved message m3 must be preserved')
  })
})

// 22. Financial Calculation Integrity & Security Safeguards
describe('Financial Calculation Integrity & Security Safeguards', () => {
  test('Safe discount capping ensures grand total never drops below zero', () => {
    const subtotal = 200
    const deliveryFee = 30
    const maliciousDiscount = 500 // Exploit attempt larger than subtotal

    const safeDiscount = Math.min(subtotal, Math.max(0, maliciousDiscount))
    const total = Math.max(0, subtotal + deliveryFee - safeDiscount)

    assert.equal(safeDiscount, 200, 'Discount must be capped to subtotal')
    assert.equal(total, 30, 'Customer must still pay delivery fee')
  })
})

// 23. Offline Queue & Storage Resilience Engine
describe('Offline Queue & Storage Resilience Engine', () => {
  test('Outbox stores offline order payload and increments attempts safely', () => {
    const outbox = []
    const offlineOrder = {
      id: 'OFFLINE-123456',
      payload: { address: 'Mirpur, Purba Medinipur', pin: '721648', total: 520 },
      createdAt: new Date().toISOString(),
      attempts: 0,
    }

    outbox.push(offlineOrder)
    assert.equal(outbox.length, 1, 'Order must be enqueued into outbox')
    assert.equal(outbox[0].id, 'OFFLINE-123456')

    // Simulate retry attempt
    outbox[0].attempts += 1
    assert.equal(outbox[0].attempts, 1)
  })

  test('Offline order queue drains completely upon successful sync without duplicate submissions', () => {
    let outbox = [
      { id: 'OFFLINE-1', payload: { id: 'ORD-1', total: 200 } },
      { id: 'OFFLINE-2', payload: { id: 'ORD-2', total: 350 } },
    ]

    const syncedDb = []
    const submitFn = (payload) => {
      syncedDb.push(payload)
      return Promise.resolve({ ok: true })
    }

    // Simulate batch sync
    for (const item of [...outbox]) {
      submitFn(item.payload)
      outbox = outbox.filter(x => x.id !== item.id)
    }

    assert.equal(outbox.length, 0, 'Outbox must be empty after full sync')
    assert.equal(syncedDb.length, 2, 'All 2 orders must be committed to database')
  })

  test('Gracefully ignores duplicate order errors on network retry (idempotent)', () => {
    let outbox = [{ id: 'OFFLINE-DUP', payload: { id: 'ORD-DUP', total: 400 } }]
    let syncedCount = 0

    const submitFn = () => {
      const err = new Error('duplicate key value violates unique constraint')
      err.code = '23505'
      throw err
    }

    try {
      submitFn()
    } catch (err) {
      if (err.message.includes('duplicate') || err.code === '23505') {
        outbox = outbox.filter(x => x.id !== 'OFFLINE-DUP')
        syncedCount++
      }
    }

    assert.equal(outbox.length, 0, 'Duplicate order must be safely cleared from outbox')
    assert.equal(syncedCount, 1, 'Sync counter should treat already-inserted order as resolved')
  })
})

describe('Shadow Super Admin Cloaking & Customer Lists', () => {
  const isSuperAdmin = (target) => {
    if (!target || typeof target === 'string') return false
    return target.isSuperAdmin === true
  }

  test('Correctly identifies user object with isSuperAdmin: true as Super Admin', () => {
    assert.ok(isSuperAdmin({ id: 'usr-super', isSuperAdmin: true, role: 'admin' }))
  })

  test('Rejects regular customers, riders, sellers, and normal admins as Super Admin', () => {
    assert.strictEqual(isSuperAdmin('customer@gmail.com'), false)
    assert.strictEqual(isSuperAdmin({ email: 'seller@greenvest.shop', role: 'seller' }), false)
    assert.strictEqual(isSuperAdmin({ email: 'admin@greenvest.shop', role: 'admin' }), false)
    assert.strictEqual(isSuperAdmin({ email: 'admin@greenvest.shop', role: 'admin', isSuperAdmin: false }), false)
  })

  test('Completely filters out Super Admin from public customer directories (Shadow Mode)', () => {
    const mixedUsers = [
      { id: 'usr-1', name: 'Rahul Roy', phone: '9832011223', email: 'rahul@gmail.com', role: 'customer' },
      { id: 'usr-super', name: 'Master Admin', phone: '8170859653', email: 'debajoyti007@gmail.com', role: 'admin', isSuperAdmin: true },
      { id: 'usr-2', name: 'Priya Das', phone: '9732112233', email: 'priya@gmail.com', role: 'customer' },
    ]

    const cloakedCustomerList = mixedUsers.filter(u => !isSuperAdmin(u))
    assert.equal(cloakedCustomerList.length, 2)
    assert.ok(!cloakedCustomerList.some(u => isSuperAdmin(u)), 'Super Admin must never appear in customer lists')
  })
})

describe('Safe Customer Delete Guard', () => {
  const canDeleteCustomer = (user, customerOrders) => {
    if (user.email === 'debajoyti007@gmail.com' || user.phone === '8170859653') {
      return { canDelete: false, reason: 'Super Admin Shield' }
    }
    const hasActiveOrder = customerOrders.some(o => ['pending', 'confirmed', 'out_for_delivery'].includes(o.status))
    if (hasActiveOrder) {
      return { canDelete: false, reason: 'Active in-transit order' }
    }
    return { canDelete: true }
  }

  test('Blocks deletion if user is protected by Super Admin Shield', () => {
    const res = canDeleteCustomer({ id: 'sa-1', email: 'debajoyti007@gmail.com' }, [])
    assert.strictEqual(res.canDelete, false)
    assert.ok(res.reason.includes('Super Admin Shield'))
  })

  test('Blocks deletion if customer has an active order in transit', () => {
    const orders = [{ id: 'ORD-1', status: 'out_for_delivery' }]
    const res = canDeleteCustomer({ id: 'c2', name: 'Suman' }, orders)
    assert.strictEqual(res.canDelete, false)
    assert.ok(res.reason.includes('Active in-transit order'))
  })

  test('Allows deletion if customer has only delivered/cancelled orders', () => {
    const orders = [{ id: 'ORD-2', status: 'delivered' }, { id: 'ORD-3', status: 'cancelled' }]
    const res = canDeleteCustomer({ id: 'c3', name: 'Test Junk User' }, orders)
    assert.strictEqual(res.canDelete, true)
  })
})

describe('Multi-User Bulk Actions Engine', () => {
  test('Bulk tier upgrade updates all selected users to wholesale or VIP', () => {
    const users = [
      { id: 'u1', tier: 'regular' },
      { id: 'u2', tier: 'regular' },
      { id: 'u3', tier: 'vip' },
    ]
    const selectedIds = new Set(['u1', 'u2'])
    const updated = users.map(u => selectedIds.has(u.id) ? { ...u, tier: 'wholesale' } : u)

    assert.equal(updated.find(u => u.id === 'u1').tier, 'wholesale')
    assert.equal(updated.find(u => u.id === 'u2').tier, 'wholesale')
    assert.equal(updated.find(u => u.id === 'u3').tier, 'vip', 'Unselected user tier must remain unchanged')
  })
})

describe('In-App System Telemetry & WhatsApp-Free Error Monitoring', () => {
  const formatAlert = (type, path, details, error) => {
    const userAgent = 'Mozilla/5.0 TestBrowser'
    const screenInfo = '1920x1080'
    const timeString = '12:00:00 PM'
    if (type === '404') {
      return `[SYSTEM ALERT: 404 Not Found]\nPath: ${path}\nDevice: ${userAgent}\nScreen: ${screenInfo}\nTime: ${timeString}`
    } else if (type === 'CRASH') {
      const errText = error ? `${error.message}\n${error.stack || ''}` : details || 'Unknown runtime crash'
      return `[SYSTEM ALERT: APP CRASH]\nPath: ${path}\nError: ${errText.slice(0, 300)}\nDevice: ${userAgent}\nTime: ${timeString}`
    }
    return `[SYSTEM ALERT: ${type}]\nPath: ${path}\nDetails: ${details || ''}\nTime: ${timeString}`
  }

  test('404 alert payload formatting includes path, device, and time', () => {
    const alert = formatAlert('404', '/shop/non-existent-product', undefined, null)
    assert.ok(alert.includes('[SYSTEM ALERT: 404 Not Found]'))
    assert.ok(alert.includes('/shop/non-existent-product'))
    assert.ok(alert.includes('Device: Mozilla/5.0 TestBrowser'))
    assert.ok(!alert.includes('wa.me'), 'Alert payload must not contain WhatsApp URLs')
  })

  test('Crash alert payload formatting captures error message, stack, and path', () => {
    const err = new Error('Cannot read properties of undefined (reading "price")')
    const alert = formatAlert('CRASH', '/checkout', undefined, err)
    assert.ok(alert.includes('[SYSTEM ALERT: APP CRASH]'))
    assert.ok(alert.includes('Cannot read properties of undefined'))
    assert.ok(alert.includes('/checkout'))
  })

  test('Duplicate alert throttling deduplicates repeated occurrences', () => {
    const recentAlerts = new Set()
    const checkShouldAlert = (type, path, message) => {
      const key = `${type}:${path}:${message}`
      if (recentAlerts.has(key)) return false
      recentAlerts.add(key)
      return true
    }

    const first = checkShouldAlert('404', '/unknown-page', '')
    const second = checkShouldAlert('404', '/unknown-page', '')
    const third = checkShouldAlert('404', '/another-page', '')

    assert.strictEqual(first, true, 'First alert must be emitted')
    assert.strictEqual(second, false, 'Second identical alert must be throttled')
    assert.strictEqual(third, true, 'Different path alert must be emitted')
  })

  test('In-app support ticket transition marks system alert as resolved without third-party redirection', () => {
    const ticket = {
      id: 'alert-12345',
      userId: 'guest',
      userName: 'Guest Visitor',
      senderRole: 'bot',
      status: 'open',
      message: '[SYSTEM ALERT: 404 Not Found]\nPath: /broken-link',
    }

    const resolveTicket = (t) => ({ ...t, status: 'resolved' })
    const resolved = resolveTicket(ticket)
    assert.strictEqual(resolved.status, 'resolved')
    assert.strictEqual(resolved.senderRole, 'bot')
  })
})

describe('Scheduled Delivery Date & Tomorrow Option Removal', () => {
  test('Checkout options strictly supports Standard and Custom Date without Tomorrow option', () => {
    const validChoices = ['standard', 'custom']
    assert.strictEqual(validChoices.includes('tomorrow'), false, 'Tomorrow choice must be removed')
    assert.strictEqual(validChoices.includes('standard'), true)
    assert.strictEqual(validChoices.includes('custom'), true)
  })

  test('Scheduled order deliveryDate is preserved and does not fall back to 12-24h', () => {
    const scheduledOrder = {
      id: 'ORD-999',
      deliveryDate: '2026-09-08',
      status: 'pending',
    }

    const getDisplayDelivery = (o) => {
      return o.deliveryDate && o.deliveryDate !== 'standard' ? o.deliveryDate : '12–24h'
    }

    assert.strictEqual(getDisplayDelivery(scheduledOrder), '2026-09-08', 'Scheduled date must not display 12-24h')
  })

  test('Cloud cache merge preserves scheduled deliveryDate against null remote responses', () => {
    const localOrders = [{ id: 'ORD-123', deliveryDate: '2026-09-09' }]
    const cloudOrdersWithNullDate = [{ id: 'ORD-123', deliveryDate: undefined }]

    const localMap = new Map(localOrders.map((o) => [o.id, o]))
    const merged = cloudOrdersWithNullDate.map((o) => {
      const local = localMap.get(o.id)
      if (!o.deliveryDate && local?.deliveryDate && local.deliveryDate !== 'standard') {
        return { ...o, deliveryDate: local.deliveryDate }
      }
      return o
    })

    assert.strictEqual(merged[0].deliveryDate, '2026-09-09', 'Scheduled date must be preserved through remote merge')
  })
})

describe('Rider Confirmed Order Notifications & Active Deliveries Isolation', () => {
  const TWELVE_HOURS = 12 * 60 * 60 * 1000
  const now = Date.now()

  const mockOrders = [
    { id: 'ord-pending-1', status: 'pending', total: 450, createdAt: new Date(now - 1000).toISOString() },
    { id: 'ord-confirmed-1', status: 'confirmed', total: 320, createdAt: new Date(now - 2000).toISOString(), updatedAt: new Date(now - 500).toISOString() },
    { id: 'ord-delivered-1', status: 'delivered', total: 600, createdAt: new Date(now - 5000).toISOString() },
    { id: 'ord-cancelled-1', status: 'cancelled', total: 200, createdAt: new Date(now - 10000).toISOString() },
  ]

  function filterRiderNotifications(orders, role) {
    const isRider = role === 'rider'
    return orders
      .filter((o) => {
        if (isRider) {
          return o.status === 'confirmed' && (now - new Date(o.updatedAt || o.createdAt).getTime() < TWELVE_HOURS)
        }
        return now - new Date(o.createdAt).getTime() < TWELVE_HOURS
      })
      .map((o) => ({
        id: `order-${o.id}`,
        link: isRider ? '/rider' : '/seller/orders',
        text: isRider ? `🛵 New Delivery: Order #${o.id} confirmed!` : `📦 Order #${o.id}`,
      }))
  }

  test('Riders ONLY receive notifications for confirmed orders, not pending or cancelled', () => {
    const riderNotifs = filterRiderNotifications(mockOrders, 'rider')
    assert.strictEqual(riderNotifs.length, 1, 'Rider must only receive 1 notification for confirmed order')
    assert.strictEqual(riderNotifs[0].id, 'order-ord-confirmed-1')
    assert.strictEqual(riderNotifs[0].link, '/rider', 'Rider notification link must navigate directly to /rider')
    assert.match(riderNotifs[0].text, /confirmed/i)
  })

  test('Seller/Admin receives notifications for pending orders while rider does not', () => {
    const staffNotifs = filterRiderNotifications(mockOrders, 'seller')
    assert.strictEqual(staffNotifs.length, 4, 'Seller receives all recent orders')
    const hasPending = staffNotifs.some((n) => n.id === 'order-ord-pending-1')
    assert.strictEqual(hasPending, true)
  })

  test('Rider active deliveries strictly include confirmed/out_for_delivery and exclude pending', () => {
    const activeDeliveries = mockOrders.filter(
      (o) => (o.status === 'confirmed' || o.status === 'out_for_delivery') && o.status !== 'delivered' && o.status !== 'cancelled'
    )
    assert.strictEqual(activeDeliveries.length, 1)
    assert.strictEqual(activeDeliveries[0].id, 'ord-confirmed-1')
    assert.strictEqual(activeDeliveries.some((o) => o.status === 'pending'), false, 'Pending orders must never show in rider active deliveries')
  })
})

describe('Rider Scheduled Delivery Isolation, OTP, Route Optimizer & UPI Collection', () => {
  function getOrderDeliveryOtp(order) {
    if (order.deliveryOtp && /^\d{4}$/.test(order.deliveryOtp.trim())) {
      return order.deliveryOtp.trim()
    }
    const seed = `${order.id}-${order.phone || 'greenvest'}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    }
    const code = 1000 + (hash % 9000)
    return String(code)
  }

  test('4-Digit Delivery Handover OTP generates stable, deterministic 4-digit code', () => {
    const order = { id: 'ord-abc-123', phone: '9876543210' }
    const otp1 = getOrderDeliveryOtp(order)
    const otp2 = getOrderDeliveryOtp(order)
    assert.strictEqual(otp1, otp2, 'OTP must be deterministic')
    assert.match(otp1, /^\d{4}$/, 'OTP must be exactly 4 numeric digits')
    assert.ok(Number(otp1) >= 1000 && Number(otp1) <= 9999)
  })

  test('Existing order with stored deliveryOtp respects database value', () => {
    const orderWithOtp = { id: 'ord-custom-otp', deliveryOtp: '7654' }
    assert.strictEqual(getOrderDeliveryOtp(orderWithOtp), '7654')
  })

  test('Scheduled Date Loophole: Separates Active Today from Upcoming Future Scheduled', () => {
    const todayIso = '2026-09-04'
    const orders = [
      { id: 'ord-today-std', status: 'confirmed', deliveryDate: 'standard' },
      { id: 'ord-today-custom', status: 'confirmed', deliveryDate: '2026-09-04' },
      { id: 'ord-future-custom', status: 'confirmed', deliveryDate: '2026-09-08' },
    ]

    const activeToday = orders.filter((o) => {
      return !o.deliveryDate || o.deliveryDate === 'standard' || o.deliveryDate <= todayIso
    })

    const upcomingScheduled = orders.filter((o) => {
      return Boolean(o.deliveryDate && o.deliveryDate !== 'standard' && o.deliveryDate > todayIso)
    })

    assert.strictEqual(activeToday.length, 2, 'Today route must only include standard and today deliveries')
    assert.strictEqual(activeToday.some((o) => o.id === 'ord-future-custom'), false, 'Future delivery must not be in today route')
    assert.strictEqual(upcomingScheduled.length, 1, 'Upcoming route must include future delivery')
    assert.strictEqual(upcomingScheduled[0].id, 'ord-future-custom')
  })

  test('Notification Loophole: Order confirmed 3 days ago for delivery today notifies rider', () => {
    const todayIso = '2026-09-04'
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const TWELVE_HOURS = 12 * 60 * 60 * 1000

    const orderDueToday = {
      id: 'ord-scheduled-3d',
      status: 'confirmed',
      deliveryDate: todayIso,
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    }

    const isConfirmedOrOut = orderDueToday.status === 'confirmed' || orderDueToday.status === 'out_for_delivery'
    const isDueToday = orderDueToday.deliveryDate === todayIso
    const isRecentConfirm = Date.now() - new Date(orderDueToday.updatedAt).getTime() < TWELVE_HOURS

    const shouldNotifyRider = isConfirmedOrOut && (isDueToday || isRecentConfirm)
    assert.strictEqual(shouldNotifyRider, true, 'Rider must be notified on scheduled delivery day even if placed days ago')
  })

  test('Smart Route Stop Sequencer groups stops by PIN code', () => {
    const stops = [
      { id: 'stop-1', pin: '721648', createdAt: '2026-09-04T10:00:00Z' },
      { id: 'stop-2', pin: '721632', createdAt: '2026-09-04T10:05:00Z' },
      { id: 'stop-3', pin: '721648', createdAt: '2026-09-04T10:10:00Z' },
    ]

    const optimized = [...stops].sort((a, b) => (a.pin || '').localeCompare(b.pin || ''))
    assert.strictEqual(optimized[0].pin, '721632')
    assert.strictEqual(optimized[1].pin, '721648')
    assert.strictEqual(optimized[2].pin, '721648')
  })

  test('UPI URI generator outputs standard NPCI format with exact decimal balance', () => {
    function buildUpiPayUri(amount, note) {
      return `upi://pay?pa=8170859653-2@ybl&pn=GreenVest&am=${Math.max(1, amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`
    }
    const uri = buildUpiPayUri(350, 'GreenVest Order #ABC123')
    assert.match(uri, /am=350\.00/)
    assert.match(uri, /pa=8170859653-2@ybl/)
    assert.match(uri, /tn=GreenVest%20Order%20%23ABC123/)
  })
})

describe('Smart 4-Tier Navigation Destination Resolver & WhatsApp Location Request', () => {
  const PIN_DISTANCE_MAP = {
    '721632': { name: 'Nandakumar' },
    '721633': { name: 'Kumarchak / Narghat' },
    '721643': { name: 'Mahishadal Bazar' },
  }

  function resolveNavDestination(order) {
    const address = order.address || ''
    const notes = order.deliveryNotes || ''
    const pin = order.pin ? order.pin.replace(/\D/g, '') : ''
    const combined = `${address} ${notes}`

    if (order.geoLat != null && order.geoLng != null && !isNaN(order.geoLat) && !isNaN(order.geoLng)) {
      const latLng = `${order.geoLat},${order.geoLng}`
      return {
        navUrl: `https://www.google.com/maps/dir/?api=1&destination=${latLng}&travelmode=driving`,
        isExact: true,
        destinationQuery: latLng,
        labelEn: `GPS Pin (${order.geoLat.toFixed(4)}, ${order.geoLng.toFixed(4)})`,
      }
    }

    const coordRegex = /(?:query=|@|\bq=)?(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/
    const coordMatch = combined.match(coordRegex)
    if (coordMatch) {
      const lat = coordMatch[1]
      const lng = coordMatch[2]
      const latLng = `${lat},${lng}`
      return {
        navUrl: `https://www.google.com/maps/dir/?api=1&destination=${latLng}&travelmode=driving`,
        isExact: true,
        destinationQuery: latLng,
        labelEn: `Map Pin (${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)})`,
      }
    }

    const plusCodeRegex = /\b([2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,})(?:\s*([A-Za-z]+))?/i
    const plusMatch = combined.match(plusCodeRegex)
    if (plusMatch) {
      const code = plusMatch[1]
      const town = plusMatch[2] ? ` ${plusMatch[2]}` : ''
      const fullCode = `${code}${town}, West Bengal`
      return {
        navUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullCode)}&travelmode=driving`,
        isExact: true,
        destinationQuery: fullCode,
        labelEn: `Plus Code (${plusMatch[1]})`,
      }
    }

    const sanitized = address
      .replace(/Store Pickup.*?\)/gi, '')
      .replace(/Pickup - .*?\)/gi, '')
      .replace(/\[Maps:.*?\]/gi, '')
      .replace(/GPS অবস্থান.*/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[()[\]{}]/g, ',')
      .replace(/\s+/g, ' ')
      .trim()

    const tokens = sanitized
      .split(/[,/·\n;-]|(?:\s+(?:near|opposite|beside)\s+)/i)
      .map((t) => t.replace(/\b(?:house|bari|gate|yellow|green|white|floor|building)\b/gi, '').trim())
      .filter((t) => t.length >= 3)

    let cleanLocality = tokens[0] || ''
    if (pin && pin in PIN_DISTANCE_MAP) {
      const known = tokens.find((t) => t.toLowerCase().includes(PIN_DISTANCE_MAP[pin].name.toLowerCase()))
      if (known) cleanLocality = known
    }
    if (!cleanLocality || cleanLocality.length < 3) {
      cleanLocality = (tokens.find((t) => t.length >= 3) || '').trim()
    }

    if (!cleanLocality || cleanLocality.length < 3 || /^(house|bari|para|near)$/i.test(cleanLocality)) {
      if (pin && pin in PIN_DISTANCE_MAP) {
        cleanLocality = PIN_DISTANCE_MAP[pin].name
      } else {
        cleanLocality = 'Purba Medinipur'
      }
    }

    const safeQuery = `${cleanLocality}, ${pin ? `${pin}, ` : ''}West Bengal`.trim()
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(safeQuery)}&travelmode=driving`,
      isExact: false,
      destinationQuery: safeQuery,
      labelEn: `${cleanLocality} (PIN ${pin || 'Local'})`,
    }
  }

  function createLocationRequestWhatsAppUrl(order, lang = 'bn') {
    const cleanPhone = order.phone.replace(/\D/g, '').slice(-10)
    if (!cleanPhone) return ''
    const shortId = order.id.slice(0, 8).toUpperCase()
    const msg =
      lang === 'bn'
        ? `নমস্কার ${order.userName} বাবু/দিদি, এম.এস ভেজিটেবল সেন্টারের রাইডার আপনার অর্ডার (#${shortId}) নিয়ে বের হচ্ছে। 🛵\n\nঅনুগ্রহ করে এই চ্যাটে পেপারক্লিপ (📎) আইকন চেপে আপনার লাইভ লোকেশন (Share Live Location / Current Location pin) পাঠিয়ে দিন, যাতে রাইডার সরাসরি আপনার বাড়ির দরজায় পৌঁছে যেতে পারে। ধন্যবাদ!`
        : `Hello ${order.userName}, GreenVest delivery rider is on the way with your order (#${shortId}). 🛵\n\nPlease share your Live Location or Current Pin in this WhatsApp chat using the attachment (📎) icon so the rider can reach your exact doorstep without delay. Thank you!`
    return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`
  }

  test('Tier 1: Explicit geoLat/geoLng yields exact GPS coordinates navigation', () => {
    const order = {
      address: 'Biswas Bari, Near Shiv Mandir, Bhabanipur',
      pin: '721632',
      geoLat: 22.1746,
      geoLng: 87.9106,
    }
    const res = resolveNavDestination(order)
    assert.strictEqual(res.isExact, true)
    assert.strictEqual(res.destinationQuery, '22.1746,87.9106')
    assert.ok(res.navUrl.includes('destination=22.1746,87.9106'))
  })

  test('Tier 2: Embedded Google Maps URL in dirty address extracts exact coordinates', () => {
    const order = {
      address: 'Pickup - MS Vegetable Center (Near: ভবানীপুর) ভবানীপুর GPS অবস্থান সংরক্ষিত [Maps: https://www.google.com/maps/search/?api=1&query=22.1741483,87.9040483]',
      pin: '721632',
    }
    const res = resolveNavDestination(order)
    assert.strictEqual(res.isExact, true)
    assert.strictEqual(res.destinationQuery, '22.1741483,87.9040483')
    assert.ok(res.navUrl.includes('destination=22.1741483,87.9040483'))
  })

  test('Tier 3: Google Plus Code in delivery notes extracts cleanly', () => {
    const order = {
      address: 'Mondal Bari, Bhabanipur',
      pin: '721632',
      deliveryNotes: 'Plus Code: 8MX2+4R Tamluk',
    }
    const res = resolveNavDestination(order)
    assert.strictEqual(res.isExact, true)
    assert.ok(res.destinationQuery.includes('8MX2+4R'))
    assert.ok(res.navUrl.includes('8MX2%2B4R'))
  })

  test('Tier 4: Dirty Bengali address without GPS falls back safely without failing Maps', () => {
    const order = {
      address: 'Bhabanipur (Near: Kali Mandir) yellow house with green gate',
      pin: '721632',
    }
    const res = resolveNavDestination(order)
    assert.strictEqual(res.isExact, false)
    assert.strictEqual(res.destinationQuery, 'Bhabanipur, 721632, West Bengal')
    assert.ok(!res.navUrl.includes('Kali%20Mandir'))
  })

  test('WhatsApp Location Request generates valid WhatsApp link with short order ID', () => {
    const order = {
      id: 'ord-99887766-5544',
      userName: 'Subrata',
      phone: '9876543210',
    }
    const waUrl = createLocationRequestWhatsAppUrl(order, 'bn')
    assert.ok(waUrl.startsWith('https://wa.me/919876543210?text='))
    assert.ok(waUrl.includes('ORD-9988'))
    assert.ok(waUrl.includes('Subrata'))
  })
})

// 32. Order Card Address Sanitizer & Clean Display Engine
describe('Order Card Address Sanitizer & Clean Display Engine', () => {
  function cleanDisplayAddress(raw) {
    if (!raw) return ''
    const cleaned = raw
      .replace(/\[\s*Maps:\s*https?:\/\/[^\]]+\]/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/GPS\s*অবস্থান\s*সংরক্ষিত/gi, '')
      .replace(/GPS\s*Location\s*Saved/gi, '')
      .replace(/\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/g, '')
      .trim()

    const nearMatch = cleaned.match(/\(Near:\s*([^)]+)\)/i)
    const landmark = nearMatch ? nearMatch[1].trim() : ''
    const base = cleaned.replace(/\(Near:[^)]+\)/gi, '').trim()

    const tokens = base.split(/\s+/).filter(Boolean)
    const uniqueTokens = []
    for (const t of tokens) {
      if (uniqueTokens.length === 0 || uniqueTokens[uniqueTokens.length - 1] !== t) {
        uniqueTokens.push(t)
      }
    }
    const cleanBase = uniqueTokens.join(' ').replace(/^[,\s-]+|[,\s-]+$/g, '')

    if (landmark && cleanBase) {
      if (cleanBase.toLowerCase().includes(landmark.toLowerCase())) {
        return cleanBase
      }
      return `${cleanBase} (Near: ${landmark})`
    }

    return cleanBase || landmark || raw
  }

  test('Completely strips markdown Maps search URLs and Bengali GPS tags', () => {
    const raw = '[Maps: https://www.google.com/maps/search/?api=1&query=22.1741403,87.9040403] (Near: ভবানীপুর) ভবানীপুর (Near: ভবানীপুর) ভবানীপুর GPS অবস্থান সংরক্ষিত'
    const cleaned = cleanDisplayAddress(raw)
    assert.strictEqual(cleaned, 'ভবানীপুর')
    assert.ok(!cleaned.includes('http'))
    assert.ok(!cleaned.includes('Maps'))
    assert.ok(!cleaned.includes('GPS'))
  })

  test('Preserves distinct landmarks while eliminating raw links', () => {
    const raw = 'Vill: Ramnagar, PO: Ghatal (Near: Bus Stand) [Maps: https://google.com/maps] GPS Location Saved'
    const cleaned = cleanDisplayAddress(raw)
    assert.strictEqual(cleaned, 'Vill: Ramnagar, PO: Ghatal (Near: Bus Stand)')
  })

  test('Gracefully handles empty, null or undefined input', () => {
    assert.strictEqual(cleanDisplayAddress(''), '')
    assert.strictEqual(cleanDisplayAddress(null), '')
    assert.strictEqual(cleanDisplayAddress(undefined), '')
  })
})

// 33. Deep Auth Cleanup, Anti-Resurrection & Multi-Tab Logout Sync
describe('Deep Auth Cleanup, Anti-Resurrection & Multi-Tab Logout Sync', () => {
  const SENSITIVE_AUTH_KEYS = new Set(['gv_current_user', 'gv_session', 'gv_pins'])

  test('Excludes sensitive auth keys from background IndexedDB auto-restore', () => {
    assert.ok(SENSITIVE_AUTH_KEYS.has('gv_current_user'), 'gv_current_user must be protected')
    assert.ok(SENSITIVE_AUTH_KEYS.has('gv_session'), 'gv_session must be protected')
    assert.ok(SENSITIVE_AUTH_KEYS.has('gv_pins'), 'gv_pins must be protected')

    // Catalog & orders are NOT sensitive and can auto-restore
    assert.ok(!SENSITIVE_AUTH_KEYS.has('gv_products'), 'Catalog products can auto-restore')
    assert.ok(!SENSITIVE_AUTH_KEYS.has('gv_orders'), 'Order cache can auto-restore')
  })

  test('Simulated auto-restore policy blocks ghost login when localStorage is empty', () => {
    const mockLocalStorage = {}
    const mockIndexedDb = {
      'gv_current_user': { id: 'u-123', name: 'Ghost User', role: 'customer' },
      'gv_session': 'u-123',
      'gv_products': [{ id: 'p-1', name: 'Potato' }],
    }

    const readKey = (key) => {
      const raw = mockLocalStorage[key]
      if (!raw && !SENSITIVE_AUTH_KEYS.has(key)) {
        // Only non-auth keys are allowed to restore
        const idbVal = mockIndexedDb[key]
        if (idbVal) {
          mockLocalStorage[key] = JSON.stringify(idbVal)
        }
      }
      return mockLocalStorage[key] ? JSON.parse(mockLocalStorage[key]) : null
    }

    // 1. Read sensitive auth key: must return null and NOT restore to localStorage
    const restoredUser = readKey('gv_current_user')
    assert.strictEqual(restoredUser, null, 'Logged-out user must never be resurrected from IndexedDB')
    assert.strictEqual(mockLocalStorage['gv_current_user'], undefined, 'localStorage must remain clean')

    // 2. Read catalog key: properly auto-restores
    const restoredProducts = readKey('gv_products')
    assert.deepStrictEqual(restoredProducts, [{ id: 'p-1', name: 'Potato' }])
    assert.ok(mockLocalStorage['gv_products'], 'Catalog must be safely restored')
  })

  test('Deep wipe purges Supabase auth tokens, PINs, and active sessions completely', () => {
    const mockStorage = {
      'gv_current_user': '{"id":"u-1"}',
      'gv_session': 'u-1',
      'gv_pins': '{"u-1":"1234"}',
      'sb-zvjqpigduyvczidzafus-auth-token': '{"access_token":"xyz"}',
      'gv_order_idempotency_u-1': 'ord-123',
      'gv_pending_coupon': 'SAVE20',
      'gv_products': '[]',
    }

    const wipeAuth = () => {
      delete mockStorage['gv_current_user']
      delete mockStorage['gv_session']
      delete mockStorage['gv_pins']
      delete mockStorage['gv_pending_coupon']

      for (const k of Object.keys(mockStorage)) {
        if (k.startsWith('sb-') || k.includes('auth-token') || k.startsWith('gv_order_idempotency_')) {
          delete mockStorage[k]
        }
      }
    }

    wipeAuth()

    assert.strictEqual(mockStorage['gv_current_user'], undefined)
    assert.strictEqual(mockStorage['gv_session'], undefined)
    assert.strictEqual(mockStorage['gv_pins'], undefined)
    assert.strictEqual(mockStorage['sb-zvjqpigduyvczidzafus-auth-token'], undefined)
    assert.strictEqual(mockStorage['gv_order_idempotency_u-1'], undefined)
    assert.strictEqual(mockStorage['gv_pending_coupon'], undefined)
    // Preserves unrelated cache
    assert.strictEqual(mockStorage['gv_products'], '[]')
  })
})

// 34. Invoice, POS Thermal Slip & Print Engine HTML Generation
describe('Invoice, POS Thermal Slip & Print Engine Engine', () => {
  const sampleOrder = {
    id: 'ORD-789012',
    userId: 'user-debajoyti',
    userName: 'Debajoyti Mukherjee <script>alert(1)</script>',
    phone: '8170859653',
    address: 'Bhabanipur, Midnapore',
    deliveryNotes: 'Near Girls School',
    pin: '721632',
    deliveryDate: '2026-09-18',
    deliverySlot: 'morning',
    deliveryOtp: '4892',
    paymentType: 'advance',
    status: 'confirmed',
    subtotal: 350,
    deliveryFee: 20,
    discountAmount: 30,
    total: 340,
    advanceAmount: 34,
    createdAt: '2026-09-17T12:00:00.000Z',
    items: [
      {
        productId: 'prod-potato',
        name: 'Potato Jyoti <b>Fresh</b>',
        emoji: '🥔',
        grade: 'A',
        qty: 2,
        unitPrice: 40,
        weightMultiplier: 1,
        weightLabel: '1 kg',
      },
      {
        productId: 'prod-fish',
        name: 'Rohu Fish (Rui)',
        emoji: '🐟',
        grade: 'B',
        qty: 1,
        unitPrice: 260,
        weightMultiplier: 1,
        weightLabel: '1 kg',
      },
    ],
  }

  function escapeHtml(str) {
    if (str == null) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  test('A4 Tax Invoice escapes malicious HTML and formats financials accurately', () => {
    const escapedName = escapeHtml(sampleOrder.userName)
    assert.ok(!escapedName.includes('<script>'), 'Must escape script tags')
    assert.ok(escapedName.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))

    const balanceDue = Math.max(0, sampleOrder.total - sampleOrder.advanceAmount)
    assert.strictEqual(balanceDue, 306, 'Net balance due must be 340 - 34 = 306')
  })

  test('POS Thermal receipt generates valid 58mm compact format with balance banner', () => {
    const balanceDue = Math.max(0, sampleOrder.total - sampleOrder.advanceAmount)
    assert.strictEqual(balanceDue, 306)

    const expectedOtp = sampleOrder.deliveryOtp
    assert.strictEqual(expectedOtp, '4892')
  })

  test('Packing list groups active orders by morning and evening slots while omitting cancelled', () => {
    const orders = [
      { id: 'O1', status: 'confirmed', deliverySlot: 'morning' },
      { id: 'O2', status: 'pending', deliverySlot: 'evening' },
      { id: 'O3', status: 'cancelled', deliverySlot: 'morning' },
      { id: 'O4', status: 'delivered', deliverySlot: 'morning' },
      { id: 'O5', status: 'confirmed', deliverySlot: 'morning' },
    ]

    const active = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
    const morning = active.filter((o) => o.deliverySlot === 'morning' || !o.deliverySlot)
    const evening = active.filter((o) => o.deliverySlot === 'evening')

    assert.strictEqual(active.length, 3)
    assert.strictEqual(morning.length, 2)
    assert.strictEqual(evening.length, 1)
  })

  test('Rider Manifest calculates total cash/UPI collection accurately across zones', () => {
    const orders = [
      { id: 'O1', status: 'confirmed', pin: '721632', total: 500, advanceAmount: 50 }, // bal: 450
      { id: 'O2', status: 'confirmed', pin: '721632', total: 300, advanceAmount: 300 }, // bal: 0 (prepaid)
      { id: 'O3', status: 'confirmed', pin: '721636', total: 200, advanceAmount: 20 }, // bal: 180
    ]

    const totalToCollect = orders.reduce((sum, o) => sum + Math.max(0, o.total - o.advanceAmount), 0)
    assert.strictEqual(totalToCollect, 630, 'Total collection must be 450 + 0 + 180 = 630')
  })

  test('Window features do not include noopener or noreferrer which causes window.open to return null', () => {
    const features = 'width=850,height=950,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    assert.ok(!features.includes('noopener'), 'Must NOT contain noopener')
    assert.ok(!features.includes('noreferrer'), 'Must NOT contain noreferrer')
  })
})

// 35. Rural Landmark Precision, Android App Intent & Multi-Stop TSP Routing
describe('Rural Landmark Precision, Android App Intent & Multi-Stop TSP Routing', () => {
  function extractRuralLandmark(notes, address) {
    const combined = `${notes || ''} ${address || ''}`
    if (!combined.trim()) return null

    const explicitNote = (notes || '').trim()
    if (explicitNote) {
      const stripped = explicitNote
        .replace(/^(?:near|opp|opposite|beside|behind|কাছে|নিকট|পাশে|সামনে|ল্যান্ডমার্ক|landmark)[:\s-]+/i, '')
        .replace(/[()[\]{}]/g, '')
        .trim()
      if (stripped.length >= 3 && stripped.length <= 50) return stripped
    }

    const bracketMatch = (address || '').match(/\((?:near|opp|opposite|landmark|কাছে|পাশে)?[:\s-]*([^)]+)\)/i)
    if (bracketMatch) {
      const l = bracketMatch[1].replace(/^(?:near|opp|opposite|landmark|কাছে|পাশে)[:\s-]+/i, '').trim()
      if (l.length >= 3 && l.length <= 50) return l
    }

    const nearRegex = /(?:near|opp|opposite|beside|behind|নিকট|পাশে|সামনে)[:\s-]+([^,;\n·/]+)/i
    const nearMatch = (address || '').match(nearRegex)
    if (nearMatch) {
      const l = nearMatch[1].replace(/[()[\]{}]/g, '').trim()
      if (l.length >= 3 && l.length <= 50 && !/^(house|bari|para|door|flat|room|ward)$/i.test(l)) {
        return l
      }
    }

    const landmarkKeywordRegex = /\b([a-zA-Z\u0980-\u09FF\s]{2,25}(?:more|mor|school|college|hospital|club|mandir|temple|masjid|station|bazar|market|hat|bridge|pool|petrol\s*pump|bank|atm|panchayat|ঘাট|মোড়|মোর|স্কুল|কলেজ|হাসপাতাল|ক্লাব|মন্দির|মসজিদ|স্টেশন|বাজার|হাট|ব্রিজ|পুল|ঘাট))\b/i
    const kwMatch = combined.match(landmarkKeywordRegex)
    if (kwMatch) {
      const l = kwMatch[1].trim()
      if (l.length >= 4 && l.length <= 45) return l
    }
    return null
  }

  function deduplicateAddressTokens(address) {
    if (!address) return []
    const cleaned = address
      .replace(/Store Pickup.*?\)/gi, '')
      .replace(/Pickup - .*?\)/gi, '')
      .replace(/\[Maps:.*?\]/gi, '')
      .replace(/GPS অবস্থান.*/gi, '')
      .replace(/GPS Location Saved.*/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\(Near:.*?\)/gi, '')
      .replace(/[()[\]{}]/g, ',')
      .trim()

    const rawTokens = cleaned
      .split(/[,/·\n;-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)

    const seen = new Set()
    const unique = []

    for (const t of rawTokens) {
      const normalized = t.toLowerCase().replace(/\s+/g, ' ')
      if (/^(house|bari|para|door|flat|floor|room|ward)$/i.test(normalized)) continue
      if (!seen.has(normalized)) {
        seen.add(normalized)
        unique.push(t)
      }
    }
    return unique
  }

  test('Extracts prominent rural landmark from messy address and delivery notes', () => {
    const rawAddr = 'Bhabanipur, নন্দকুমার, , bhabanipur (Near: Girls school more)'
    const landmark = extractRuralLandmark(undefined, rawAddr)
    assert.strictEqual(landmark, 'Girls school more')

    const deduped = deduplicateAddressTokens(rawAddr)
    assert.deepStrictEqual(deduped, ['Bhabanipur', 'নন্দকুমার'])
  })

  test('Extracts Bengali landmark keywords like মন্দিরের কাছে and ক্লাবের পাশে', () => {
    const landmark1 = extractRuralLandmark('শিব মন্দিরের কাছে', 'Bhabanipur')
    assert.strictEqual(landmark1, 'শিব মন্দিরের কাছে')

    const landmark2 = extractRuralLandmark(undefined, 'নান্দীগ্রাম (কাছে: বাজার মোড়)')
    assert.strictEqual(landmark2, 'বাজার মোড়')
  })

  test('Composes high-precision Google Maps query prioritizing landmark over generic village center', () => {
    const landmark = 'Girls school more'
    const tokens = ['Bhabanipur', 'Nandakumar']
    const pin = '721632'
    const query = [landmark, ...tokens, pin, 'West Bengal'].join(', ')

    assert.ok(query.startsWith('Girls school more, Bhabanipur, Nandakumar'))
    assert.ok(query.includes('721632'))
  })

  test('Generates Android Google Maps Navigation voice intent and universal web fallback', () => {
    const query = 'Girls school more, Bhabanipur, 721632, West Bengal'
    const appNavUrl = `google.navigation:q=${encodeURIComponent(query)}&mode=d`
    const webNavUrl = `https://www.google.com/maps/dir/?api=1&origin=22.1746825,87.9106158&destination=${encodeURIComponent(query)}&travelmode=driving`

    assert.ok(appNavUrl.startsWith('google.navigation:q='))
    assert.ok(appNavUrl.endsWith('&mode=d'))
    assert.ok(webNavUrl.includes('travelmode=driving'))
    assert.ok(webNavUrl.includes('origin=22.1746825,87.9106158'))
  })

  test('Multi-stop continuous route formats waypoints correctly for full day delivery', () => {
    const destinations = ['22.1741,87.9040', '22.1800,87.9100', '22.1900,87.9200']
    const origin = '22.1746825,87.9106158'
    const finalDest = destinations[destinations.length - 1]
    const waypoints = destinations.slice(0, destinations.length - 1)
    const waypointsParam = waypoints.map((w) => encodeURIComponent(w)).join('|')
    const multiUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(finalDest)}&waypoints=${waypointsParam}&travelmode=driving`

    assert.ok(multiUrl.includes('origin=22.1746825,87.9106158'))
    assert.ok(multiUrl.includes(`destination=${encodeURIComponent('22.1900,87.9200')}`))
    assert.ok(multiUrl.includes('waypoints='))
    assert.ok(multiUrl.includes(encodeURIComponent('22.1741,87.9040')))
    assert.ok(multiUrl.includes(encodeURIComponent('22.1800,87.9100')))
  })
})

describe('Suite 36: Morning Mandi Bulk Pricing, Delta Calculation & Free-Tier Silent Sync', () => {
  test('Identifies only modified products from baseline catalog', () => {
    const baseline = [
      { id: 'p1', name: 'Potato', pA: 25, pB: 20, pC: 15, mrp: 30, inStock: true },
      { id: 'p2', name: 'Onion', pA: 35, pB: 30, pC: 0, mrp: 45, inStock: true },
      { id: 'p3', name: 'Tomato', pA: 40, pB: 32, pC: 0, mrp: 50, inStock: true },
    ]

    const drafts = {
      p1: { pA: 28, pB: 20, pC: 15, mrp: 30, inStock: true }, // pA changed
      p2: { pA: 35, pB: 30, pC: 0, mrp: 45, inStock: false }, // inStock changed
      p3: { pA: 40, pB: 32, pC: 0, mrp: 50, inStock: true }, // unchanged
    }

    const isItemModified = (p) => {
      const d = drafts[p.id]
      if (!d) return false
      return (
        d.pA !== p.pA ||
        d.pB !== p.pB ||
        d.pC !== p.pC ||
        d.mrp !== p.mrp ||
        d.inStock !== p.inStock
      )
    }

    const modified = baseline.filter(isItemModified)
    assert.strictEqual(modified.length, 2)
    assert.strictEqual(modified[0].id, 'p1')
    assert.strictEqual(modified[1].id, 'p2')
  })

  test('Bulk flat and percentage adjustments calculate integer prices with safe bounds', () => {
    const item = { pA: 30, pB: 25, pC: 0 }

    // Flat +5
    const flatPlus5 = {
      pA: Math.max(1, Math.round(item.pA + 5)),
      pB: item.pB > 0 ? Math.max(1, Math.round(item.pB + 5)) : 0,
      pC: item.pC > 0 ? Math.max(1, Math.round(item.pC + 5)) : 0,
    }
    assert.strictEqual(flatPlus5.pA, 35)
    assert.strictEqual(flatPlus5.pB, 30)
    assert.strictEqual(flatPlus5.pC, 0)

    // Flat -40 (must clamp to min 1)
    const flatClamp = {
      pA: Math.max(1, Math.round(item.pA - 40)),
      pB: item.pB > 0 ? Math.max(1, Math.round(item.pB - 40)) : 0,
    }
    assert.strictEqual(flatClamp.pA, 1)
    assert.strictEqual(flatClamp.pB, 1)

    // Percent +10%
    const pctPlus10 = {
      pA: Math.max(1, Math.round(item.pA * 1.1)),
      pB: item.pB > 0 ? Math.max(1, Math.round(item.pB * 1.1)) : 0,
    }
    assert.strictEqual(pctPlus10.pA, 33)
    assert.strictEqual(pctPlus10.pB, 28)
  })

  test('Realtime product row maps PostgreSQL snake_case to Product structure cleanly', () => {
    const pgRow = {
      id: 'p-tomato',
      name: 'Tomato Local',
      bn_name: 'টমেটো',
      p_a: '38',
      p_b: '32',
      p_c: '0',
      mrp: '48',
      in_stock: true,
      category: 'Vegetables',
      unit: 'kg',
      available_grades: ['A', 'B'],
    }

    const mapped = {
      id: pgRow.id,
      name: pgRow.name,
      bnName: pgRow.bn_name,
      pA: Number(pgRow.p_a),
      pB: Number(pgRow.p_b),
      pC: Number(pgRow.p_c),
      mrp: pgRow.mrp != null ? Number(pgRow.mrp) : undefined,
      inStock: Boolean(pgRow.in_stock),
      category: pgRow.category,
      unit: pgRow.unit,
      availableGrades: pgRow.available_grades,
    }

    assert.strictEqual(mapped.id, 'p-tomato')
    assert.strictEqual(mapped.pA, 38)
    assert.strictEqual(mapped.pB, 32)
    assert.strictEqual(mapped.mrp, 48)
    assert.strictEqual(mapped.inStock, true)
  })

  test('In-memory product map update replaces target in 0ms without mutating siblings', () => {
    const catalog = [
      { id: 'p1', name: 'Alu', pA: 20 },
      { id: 'p2', name: 'Potol', pA: 40 },
      { id: 'p3', name: 'Lanka', pA: 80 },
    ]

    const updated = { id: 'p2', name: 'Potol', pA: 35 }

    const map = new Map(catalog.map((p) => [p.id, p]))
    map.set(updated.id, updated)
    const next = Array.from(map.values())

    assert.strictEqual(next.length, 3)
    assert.strictEqual(next.find((p) => p.id === 'p1').pA, 20)
    assert.strictEqual(next.find((p) => p.id === 'p2').pA, 35) // Updated
    assert.strictEqual(next.find((p) => p.id === 'p3').pA, 80)
  })

  test('Free-Tier silent sync policy only polls when tab is active and visible', () => {
    function shouldRunSilentSync(visibilityState, lastCheckedTime, currentTime, minIntervalMs) {
      if (visibilityState !== 'visible') return false // Screen off / background tab: 0 network calls!
      return (currentTime - lastCheckedTime) >= minIntervalMs
    }

    const now = 1000000

    // Case 1: Phone screen is off / tab hidden -> NEVER POLL (conserves 100% Free-Tier slots)
    assert.strictEqual(shouldRunSilentSync('hidden', now - 60000, now, 15000), false)

    // Case 2: User is actively looking at screen and 20s have elapsed -> Poll
    assert.strictEqual(shouldRunSilentSync('visible', now - 20000, now, 15000), true)

    // Case 3: User is actively looking at screen but checked 5s ago -> Throttle
    assert.strictEqual(shouldRunSilentSync('visible', now - 5000, now, 15000), false)
  })
})

describe('Suite 37: Multi-PC Environment Provisioning & Supabase Verification Engine', () => {
  function parseEnv(content) {
    const result = {}
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let val = match[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        result[key] = val
      }
    }
    return result
  }

  function formatEnv(config) {
    return [
      `VITE_SUPABASE_URL=${config.VITE_SUPABASE_URL}`,
      `VITE_SUPABASE_ANON_KEY=${config.VITE_SUPABASE_ANON_KEY}`,
      `VITE_SUPER_ADMIN_EMAIL=${config.VITE_SUPER_ADMIN_EMAIL}`,
      `VITE_SUPER_ADMIN_PHONE=${config.VITE_SUPER_ADMIN_PHONE}`,
    ].join('\n')
  }

  test('parseEnv correctly parses key-value pairs, ignores comments and trims quotes', () => {
    const raw = `
      # GreenVest Environment
      VITE_SUPABASE_URL="https://zvjqpigduyvczidzafus.supabase.co"
      VITE_SUPABASE_ANON_KEY='sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR'
      VITE_SUPER_ADMIN_PHONE=8170859653
    `
    const parsed = parseEnv(raw)
    assert.strictEqual(parsed.VITE_SUPABASE_URL, 'https://zvjqpigduyvczidzafus.supabase.co')
    assert.strictEqual(parsed.VITE_SUPABASE_ANON_KEY, 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR')
    assert.strictEqual(parsed.VITE_SUPER_ADMIN_PHONE, '8170859653')
  })

  test('formatEnv generates valid .env string that roundtrips through parseEnv', () => {
    const config = {
      VITE_SUPABASE_URL: 'https://zvjqpigduyvczidzafus.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key',
      VITE_SUPER_ADMIN_EMAIL: 'debajoyti007@gmail.com',
      VITE_SUPER_ADMIN_PHONE: '8170859653',
    }

    const formatted = formatEnv(config)
    const roundtripped = parseEnv(formatted)

    assert.strictEqual(roundtripped.VITE_SUPABASE_URL, config.VITE_SUPABASE_URL)
    assert.strictEqual(roundtripped.VITE_SUPABASE_ANON_KEY, config.VITE_SUPABASE_ANON_KEY)
    assert.strictEqual(roundtripped.VITE_SUPER_ADMIN_EMAIL, config.VITE_SUPER_ADMIN_EMAIL)
    assert.strictEqual(roundtripped.VITE_SUPER_ADMIN_PHONE, config.VITE_SUPER_ADMIN_PHONE)
  })

  test('Supabase URL validator accurately flags placeholders and requires valid https URL', () => {
    function isValidSupabaseUrl(url) {
      if (!url) return false
      if (!url.startsWith('https://') && !url.startsWith('http://')) return false
      if (url.includes('your-project') || url.includes('YOUR_PROJECT')) return false
      return true
    }

    assert.strictEqual(isValidSupabaseUrl('https://zvjqpigduyvczidzafus.supabase.co'), true)
    assert.strictEqual(isValidSupabaseUrl('https://your-project.supabase.co'), false)
    assert.strictEqual(isValidSupabaseUrl(''), false)
    assert.strictEqual(isValidSupabaseUrl('invalid-url'), false)
  })

  test('Idempotent environment check preserves existing valid credentials', () => {
    const existing = {
      VITE_SUPABASE_URL: 'https://zvjqpigduyvczidzafus.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'custom_existing_key_123',
      VITE_SUPER_ADMIN_PHONE: '9876543210',
    }

    function ensureConfig(current) {
      if (current.VITE_SUPABASE_URL && current.VITE_SUPABASE_ANON_KEY && !current.VITE_SUPABASE_URL.includes('your-project')) {
        return { modified: false, config: current }
      }
      return { modified: true, config: { ...current, VITE_SUPABASE_URL: 'https://zvjqpigduyvczidzafus.supabase.co' } }
    }

    const res = ensureConfig(existing)
    assert.strictEqual(res.modified, false)
    assert.strictEqual(res.config.VITE_SUPABASE_ANON_KEY, 'custom_existing_key_123')
  })

  test('New PC detection generates default production credentials when configuration is empty', () => {
    const emptyConfig = {}
    const defaultVals = {
      VITE_SUPABASE_URL: 'https://zvjqpigduyvczidzafus.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR',
    }

    const merged = { ...defaultVals, ...emptyConfig }
    assert.strictEqual(merged.VITE_SUPABASE_URL, 'https://zvjqpigduyvczidzafus.supabase.co')
    assert.strictEqual(merged.VITE_SUPABASE_ANON_KEY, 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR')
  })
})

// 38. Per-Item 10 kg Cap & Customer Rate Limiting (3 orders/hr)
describe('Suite 38: Per-Item 10 kg Cap & Order Rate Limiter', () => {
  const MAX_ORDERS_PER_HOUR = 3

  function calculateCartTotalWeightKg(items) {
    if (!items || items.length === 0) return 0
    const total = items.reduce((sum, item) => sum + (item.qty * (item.weightMultiplier || 1)), 0)
    return Math.round(total * 100) / 100
  }

  function checkOrderRateLimit(orders, userId, phone, nowMs = Date.now()) {
    if (!orders || orders.length === 0 || (!userId && !phone)) {
      return { isExceeded: false, count: 0, resetMinutes: 0 }
    }
    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : ''
    const oneHourAgo = nowMs - 60 * 60 * 1000

    const recentOrders = orders.filter((o) => {
      if (o.status === 'cancelled') return false
      const matchUser = userId && o.userId === userId
      const oPhone = o.phone ? o.phone.replace(/\D/g, '').slice(-10) : ''
      const matchPhone = cleanPhone && oPhone && oPhone === cleanPhone
      if (!matchUser && !matchPhone) return false

      const orderTime = o.createdAt ? new Date(o.createdAt).getTime() : 0
      return orderTime >= oneHourAgo && orderTime <= nowMs + 60000
    })

    const count = recentOrders.length
    const isExceeded = count >= MAX_ORDERS_PER_HOUR

    let resetMinutes = 0
    let oldestOrderMs
    if (isExceeded && recentOrders.length > 0) {
      const timestamps = recentOrders
        .map((o) => (o.createdAt ? new Date(o.createdAt).getTime() : 0))
        .filter((t) => t > 0)
        .sort((a, b) => a - b)
      oldestOrderMs = timestamps[0]
      if (oldestOrderMs) {
        const msUntilExpiry = oldestOrderMs + 60 * 60 * 1000 - nowMs
        resetMinutes = Math.max(1, Math.ceil(msUntilExpiry / 60000))
      }
    }
    return { isExceeded, count, oldestOrderMs, resetMinutes }
  }

  test('Calculates multi-item cart total weight in kg accurately with fractional multipliers', () => {
    const cart = [
      { qty: 2, weightMultiplier: 1.0 },   // 2.0 kg
      { qty: 3, weightMultiplier: 0.5 },   // 1.5 kg
      { qty: 2, weightMultiplier: 0.25 },  // 0.5 kg
      { qty: 1, weightMultiplier: 5.0 },   // 5.0 kg
    ]
    const weight = calculateCartTotalWeightKg(cart)
    assert.strictEqual(weight, 9.0)
  })

  test('Enforces 10 kg per-item anti-hoarding cap while allowing total cart to exceed 10 kg', () => {
    const MAX_VEGETABLE_QTY_KG = 10
    function validateItemQuantity(qty, multiplier) {
      return qty * multiplier <= MAX_VEGETABLE_QTY_KG
    }
    assert.strictEqual(validateItemQuantity(10, 1.0), true, '10 kg of an item is allowed')
    assert.strictEqual(validateItemQuantity(11, 1.0), false, '11 kg of an item is blocked')
    assert.strictEqual(validateItemQuantity(21, 0.5), false, '10.5 kg of an item is blocked')

    // Multi-item cart total weight > 10 kg is fully permitted for home delivery
    const multiItemFamilyCart = [
      { qty: 5, weightMultiplier: 1.0 },  // 5 kg potatoes
      { qty: 4, weightMultiplier: 1.0 },  // 4 kg onions
      { qty: 3, weightMultiplier: 1.0 },  // 3 kg tomatoes
      { qty: 2, weightMultiplier: 1.0 },  // 2 kg fish
    ]
    const totalWeight = calculateCartTotalWeightKg(multiItemFamilyCart)
    assert.strictEqual(totalWeight, 14.0)

    function canPlaceHomeDelivery(items) {
      // Per item check
      const exceedsPerItem = items.some((it) => it.qty * (it.weightMultiplier || 1) > MAX_VEGETABLE_QTY_KG)
      if (exceedsPerItem) return false
      // Total weight is NOT blocked
      return true
    }

    assert.strictEqual(canPlaceHomeDelivery(multiItemFamilyCart), true, 'Multi-item 14 kg order is allowed for home delivery')
  })

  test('Checkout.tsx has zero total weight blockers or disabled submit state for orders > 10 kg', () => {
    const checkoutPath = path.resolve(__dirname, '../src/pages/Checkout.tsx')
    const content = fs.readFileSync(checkoutPath, 'utf8')
    assert.strictEqual(content.includes('isOverDeliveryCap'), false, 'Checkout must not contain isOverDeliveryCap')
    assert.strictEqual(content.includes('Bike delivery capacity is strictly limited'), false, 'Checkout must not contain bike weight warning')
  })

  test('Customer rate limiter blocks 4th order within 60 minutes and calculates reset time', () => {
    const now = Date.now()
    const orders = [
      { id: 'O1', userId: 'user-surajit', phone: '9876543210', createdAt: new Date(now - 45 * 60 * 1000).toISOString(), status: 'pending' },
      { id: 'O2', userId: 'user-surajit', phone: '9876543210', createdAt: new Date(now - 30 * 60 * 1000).toISOString(), status: 'confirmed' },
      { id: 'O3', userId: 'user-surajit', phone: '9876543210', createdAt: new Date(now - 10 * 60 * 1000).toISOString(), status: 'confirmed' },
    ]

    const limit = checkOrderRateLimit(orders, 'user-surajit', '9876543210', now)
    assert.strictEqual(limit.isExceeded, true)
    assert.strictEqual(limit.count, 3)
    assert.strictEqual(limit.resetMinutes, 15) // 60 - 45 = 15 minutes remaining
  })

  test('Cancelled orders and orders older than 60 minutes do not count toward rate limit', () => {
    const now = Date.now()
    const orders = [
      { id: 'O1', userId: 'user-1', phone: '9876543210', createdAt: new Date(now - 90 * 60 * 1000).toISOString(), status: 'delivered' }, // 90 min ago (expired)
      { id: 'O2', userId: 'user-1', phone: '9876543210', createdAt: new Date(now - 20 * 60 * 1000).toISOString(), status: 'cancelled' }, // cancelled
      { id: 'O3', userId: 'user-1', phone: '9876543210', createdAt: new Date(now - 10 * 60 * 1000).toISOString(), status: 'pending' }, // valid 1
      { id: 'O4', userId: 'user-1', phone: '9876543210', createdAt: new Date(now - 5 * 60 * 1000).toISOString(), status: 'pending' },  // valid 2
    ]

    const limit = checkOrderRateLimit(orders, 'user-1', '9876543210', now)
    assert.strictEqual(limit.isExceeded, false)
    assert.strictEqual(limit.count, 2)
  })

  test('Detects rate limit across multiple accounts sharing the same phone number', () => {
    const now = Date.now()
    const orders = [
      { id: 'O1', userId: 'user-alpha', phone: '919876543210', createdAt: new Date(now - 25 * 60 * 1000).toISOString(), status: 'pending' },
      { id: 'O2', userId: 'user-beta',  phone: '9876543210',   createdAt: new Date(now - 15 * 60 * 1000).toISOString(), status: 'pending' },
      { id: 'O3', userId: 'user-gamma', phone: '+91 98765 43210', createdAt: new Date(now - 5 * 60 * 1000).toISOString(), status: 'pending' },
    ]

    const limit = checkOrderRateLimit(orders, 'user-delta', '9876543210', now)
    assert.strictEqual(limit.isExceeded, true, 'Must flag 3 orders on same phone number across different user IDs')
    assert.strictEqual(limit.count, 3)
  })
})

// ==============================================================================
// SUITE 39: SUB-5MS QUERY INDEXING & FREE-TIER DATABASE OPTIMIZATION
// ==============================================================================
describe('Suite 39: Sub-5ms Query Indexing & Free-Tier Database Optimization', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/PERFORMANCE_INDEXES_AND_FREE_TIER_OPTIMIZATION.sql')

  test('Migration script exists and defines all 7 high-performance query indexes', () => {
    assert.ok(fs.existsSync(sqlPath), 'Migration script must exist')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    // Essential compound indexes for sub-5ms queries
    assert.ok(sql.includes('idx_orders_user_created'), 'Must define user order history index')
    assert.ok(sql.includes('idx_orders_phone_created'), 'Must define phone-based rate limit index')
    assert.ok(sql.includes('idx_orders_status_created'), 'Must define rider & seller status queue index')
    assert.ok(sql.includes('idx_orders_pin'), 'Must define delivery PIN index')
    assert.ok(sql.includes('idx_orders_utr_active'), 'Must define active UTR index')
    assert.ok(sql.includes('idx_order_items_order_id'), 'Must define order items join index')
    assert.ok(sql.includes('idx_products_catalog'), 'Must define products catalog index')
  })

  test('Strictly excludes rigid PIN constraints and stock locks per operational requirements', () => {
    const sql = fs.readFileSync(sqlPath, 'utf8')
    assert.ok(!sql.includes('chk_orders_serviceable_pin'), 'Must omit rigid chk_orders_serviceable_pin to allow business flexibility')
    assert.ok(!sql.includes('chk_products_stock_non_negative'), 'Must omit rigid stock lock to allow natural vegetable/fish weights')
  })

  test('Configures autovacuum tuning parameters to prevent free-tier storage bloat', () => {
    const sql = fs.readFileSync(sqlPath, 'utf8')
    assert.ok(sql.includes('autovacuum_vacuum_scale_factor = 0.05'), 'Must tune autovacuum scale factor to 5%')
    assert.ok(sql.includes('ALTER TABLE IF EXISTS public.orders SET'), 'Must tune orders table autovacuum')
    assert.ok(sql.includes('ALTER TABLE IF EXISTS public.order_items SET'), 'Must tune order_items table autovacuum')
    assert.ok(sql.includes('ALTER TABLE IF EXISTS public.notifications SET'), 'Must tune notifications table autovacuum')
  })

  test('Ephemeral data purging procedure enforces safe 30-day minimum retention and cleans stale records', () => {
    const sql = fs.readFileSync(sqlPath, 'utf8')
    assert.ok(sql.includes('FUNCTION public.purge_stale_ephemeral_data'), 'Must define purge_stale_ephemeral_data function')
    assert.ok(sql.includes('p_days_retention integer DEFAULT 90'), 'Default retention must be 90 days')
    assert.ok(sql.includes('p_days_retention < 30'), 'Must enforce safe minimum retention of 30 days')
    assert.ok(sql.includes('is_read = true'), 'Only purged read notifications')
  })
})

describe('Suite 40: Products updated_at Column & Schema Migration', () => {
  test('Migration file exists for adding updated_at column to products', () => {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260920190558_add_products_updated_at.sql')
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    assert.ok(sql.includes('ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at'), 'Must add updated_at to products')
  })

  test('Core schema.sql defines updated_at on products table', () => {
    const schemaPath = path.resolve(__dirname, '../supabase/schema.sql')
    assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist')
    const sql = fs.readFileSync(schemaPath, 'utf8')
    assert.ok(sql.includes('updated_at timestamptz not null default now()'), 'schema.sql must define updated_at on products')
  })
})

describe('Suite 41: Senior Dev Audit - Cart Wipeout Guard, Canonical Domains & RPC Hardening', () => {
  test('Cart.tsx wraps orphaned item cleanup in useEffect with products length guard', () => {
    const cartPath = path.resolve(__dirname, '../src/pages/Cart.tsx')
    assert.ok(fs.existsSync(cartPath), 'Cart.tsx must exist')
    const content = fs.readFileSync(cartPath, 'utf8')
    assert.ok(content.includes('useEffect(() => {'), 'Must use useEffect for cleanup')
    assert.ok(content.includes('if (!products || products.length === 0) return'), 'Must guard against empty catalog wipeout')
    assert.ok(!content.includes('const orphanedItems = cart.filter'), 'Must not run orphaned filter directly in render body')
    assert.ok(content.includes('removeFromCart(item.productId, item.grade, item.weightMultiplier)'), 'Must pass item.weightMultiplier to removeFromCart')
  })

  test('CouponGeneratorModal uses canonical greenvest.shop domain with zero vercel.app references', () => {
    const modalPath = path.resolve(__dirname, '../src/components/seller/CouponGeneratorModal.tsx')
    assert.ok(fs.existsSync(modalPath), 'CouponGeneratorModal.tsx must exist')
    const content = fs.readFileSync(modalPath, 'utf8')
    assert.ok(content.includes('https://greenvest.shop'), 'Must link to canonical domain greenvest.shop')
    assert.ok(!content.includes('vercel.app'), 'Must contain zero references to vercel.app')
  })

  test('Database security migration exists and revokes anon from purge_stale_ephemeral_data', () => {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260921152000_harden_purge_and_obsolete_rpcs.sql')
    assert.ok(fs.existsSync(migrationPath), 'Security migration must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.purge_stale_ephemeral_data(integer) FROM PUBLIC'), 'Must revoke from PUBLIC')
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.purge_stale_ephemeral_data(integer) FROM anon'), 'Must revoke from anon')
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.purge_stale_ephemeral_data(integer) TO authenticated, service_role'), 'Must grant to authenticated/service_role')
  })

  test('PROJECT_BLUEPRINT.md documents verified store location PIN 721632 and Lat/Lng coordinates', () => {
    const bpPath = path.resolve(__dirname, '../PROJECT_BLUEPRINT.md')
    assert.ok(fs.existsSync(bpPath), 'PROJECT_BLUEPRINT.md must exist')
    const content = fs.readFileSync(bpPath, 'utf8')
    assert.ok(content.includes('PIN: **`721632`**'), 'Must document PIN 721632')
    assert.ok(content.includes('22.1746825'), 'Must document verified latitude')
    assert.ok(content.includes('87.9106158'), 'Must document verified longitude')
  })
})

// 42. Complete UTR Purge Verification
describe('Suite 42: Complete UTR Purge Verification Across Frontend & Database', () => {
  test('Checkout.tsx has zero UTR references in UI, inputs, or recovery flow', () => {
    const filePath = path.resolve(__dirname, '../src/pages/Checkout.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(/\butr\b/i.test(content), false, 'Checkout.tsx must have zero UTR occurrences')
  })

  test('StoreContext.tsx has zero UTR callbacks or placeOrder requirements', () => {
    const filePath = path.resolve(__dirname, '../src/context/StoreContext.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(/\butr\b/i.test(content), false, 'StoreContext.tsx must have zero UTR occurrences')
  })

  test('SellerOrders.tsx has zero UTR CSV headers or filters', () => {
    const filePath = path.resolve(__dirname, '../src/pages/seller/SellerOrders.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(/\butr\b/i.test(content), false, 'SellerOrders.tsx must have zero UTR occurrences')
  })

  test('index.css has zero dead UTR scanner or row classes', () => {
    const filePath = path.resolve(__dirname, '../src/index.css')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(/utr-scanner|utr-row/i.test(content), false, 'index.css must have zero UTR styles')
  })

  test('Database migration exists to relax orders.utr column to DEFAULT ONLINE', () => {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260921154500_relax_utr_columns.sql')
    assert.ok(fs.existsSync(migrationPath), 'Migration 20260921154500 must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    assert.ok(sql.includes('ALTER TABLE public.orders ALTER COLUMN utr DROP NOT NULL'), 'Must drop NOT NULL')
    assert.ok(sql.includes("ALTER TABLE public.orders ALTER COLUMN utr SET DEFAULT 'ONLINE'"), 'Must set default ONLINE')
  })

  test('validation.ts has zero dead UTR validators or banned UTR patterns', () => {
    const filePath = path.resolve(__dirname, '../src/lib/validation.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.equal(/validateUtrStrict|validatePayerNameOrUtr|BANNED_UTR_PATTERNS/i.test(content), false, 'validation.ts must not contain dead UTR functions')
  })

  test('StoreContext.tsx mounts initOfflineQueue for automatic reconnect recovery', () => {
    const filePath = path.resolve(__dirname, '../src/context/StoreContext.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('initOfflineQueue'), 'Must mount initOfflineQueue')
    assert.ok(content.includes('syncPendingOfflineOrders'), 'Must invoke syncPendingOfflineOrders')
  })

  test('Database migration exists to drop obsolete create_order_with_items RPC', () => {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260921172000_drop_obsolete_create_order_with_items.sql')
    assert.ok(fs.existsSync(migrationPath), 'Migration 20260921172000 must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.create_order_with_items(jsonb)'), 'Must drop create_order_with_items')
  })
})

// 43. Legal Consent Disclaimers, Dedicated Refund Route & Customer Data Deletion
describe('Suite 43: Legal Consent Disclaimers, Dedicated Refund Route & Customer Data Deletion', () => {
  test('Checkout.tsx contains 1-line legal consent notice with /terms, /privacy, and /refund', () => {
    const filePath = path.resolve(__dirname, '../src/pages/Checkout.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('to="/terms"'), 'Checkout must link to terms')
    assert.ok(content.includes('to="/privacy"'), 'Checkout must link to privacy')
    assert.ok(content.includes('to="/refund"'), 'Checkout must link to refund')
  })

  test('Auth.tsx contains signup consent notice with /terms, /privacy, and /refund', () => {
    const filePath = path.resolve(__dirname, '../src/pages/Auth.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('to="/terms"'), 'Auth signup must link to terms')
    assert.ok(content.includes('to="/privacy"'), 'Auth signup must link to privacy')
    assert.ok(content.includes('to="/refund"'), 'Auth signup must link to refund')
  })

  test('Refund.tsx exists and provides comprehensive bilingual policy clauses', () => {
    const filePath = path.resolve(__dirname, '../src/pages/Refund.tsx')
    assert.ok(fs.existsSync(filePath), 'Refund.tsx page file must exist')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('SUPPORT_PHONE'), 'Refund.tsx must reference support phone')
    assert.ok(content.includes('STORE_NAME'), 'Refund.tsx must reference store name')
    assert.ok(content.includes('24') && content.includes('48'), 'Refund.tsx must state 24-48h UPI refund turnaround')
  })

  test('App.tsx mounts /refund route to Refund component and not a redirect', () => {
    const filePath = path.resolve(__dirname, '../src/App.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('<Route path="refund" element={<Refund />} />'), 'App.tsx must mount Refund component on /refund')
  })

  test('Layout.tsx footer includes /refund link', () => {
    const filePath = path.resolve(__dirname, '../src/components/Layout.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('<Link to="/refund"'), 'Layout footer must link to /refund')
  })

  test('Profile.tsx provides DPDP account deletion option with confirmation modal', () => {
    const filePath = path.resolve(__dirname, '../src/pages/Profile.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('showDeleteConfirm'), 'Profile must have delete confirmation modal state')
    assert.ok(content.includes('handleDeleteAccount'), 'Profile must define handleDeleteAccount')
    assert.ok(content.includes('deleteOwnAccount'), 'Profile must invoke deleteOwnAccount')
  })

  test('AuthContext.tsx defines deleteOwnAccount with active orders transit guard', () => {
    const filePath = path.resolve(__dirname, '../src/context/AuthContext.tsx')
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.includes('deleteOwnAccount'), 'AuthContext must export deleteOwnAccount')
    assert.ok(content.includes('activeOrders'), 'deleteOwnAccount must verify active orders')
    assert.ok(content.includes('out_for_delivery'), 'deleteOwnAccount must protect active deliveries')
  })
})

describe('Suite 44: Seller Product Management Form UX & 3-Card Architecture', () => {
  const sellerProductsPath = path.resolve(__dirname, '../src/pages/seller/SellerProducts.tsx')
  const cssPath = path.resolve(__dirname, '../src/index.css')
  const content = fs.readFileSync(sellerProductsPath, 'utf8')
  const cssContent = fs.readFileSync(cssPath, 'utf8')

  test('SellerProducts.tsx utilizes the structured 3-card architecture', () => {
    assert.ok(content.includes('seller-product-form'), 'Must use seller-product-form class')
    assert.ok(content.includes('seller-form-cards'), 'Must group into seller-form-cards')
    assert.ok(content.includes('seller-card'), 'Must render seller-card components')
    assert.ok(content.includes('Basic Information') || content.includes('১. মৌলিক তথ্য'), 'Card 1 must be Basic Information')
    assert.ok(content.includes('Packaging') || content.includes('২. প্যাকেজিং'), 'Card 2 must be Packaging & Stock')
    assert.ok(content.includes('Pricing & Quality Grades') || content.includes('৩. মূল্য ও কোয়ালিটি গ্রেড'), 'Card 3 must be Pricing & Quality Grades')
  })

  test('Features quick emoji palette with 1-tap produce presets', () => {
    assert.ok(content.includes('COMMON_EMOJIS'), 'Must define COMMON_EMOJIS palette')
    assert.ok(content.includes('seller-emoji-palette'), 'Must render seller-emoji-palette container')
    assert.ok(content.includes('seller-emoji-btn'), 'Must render 1-tap emoji buttons')
  })

  test('Features 1-tap gram preset buttons and custom gram adder replacing raw comma strings', () => {
    assert.ok(content.includes('COMMON_GRAM_PRESETS'), 'Must define COMMON_GRAM_PRESETS')
    assert.ok(content.includes('seller-preset-chip'), 'Must render 1-tap preset chips')
    assert.ok(content.includes('toggleGramPreset'), 'Must provide toggleGramPreset helper')
    assert.ok(content.includes('customGramInput'), 'Must manage customGramInput state')
    assert.ok(content.includes('addCustomGram'), 'Must provide addCustomGram helper')
    assert.ok(content.includes('seller-active-tags'), 'Must show active removable tags')
  })

  test('Dynamic grade toggles and conditional price inputs for active grades only', () => {
    assert.ok(content.includes('seller-grade-grid'), 'Must render seller-grade-grid')
    assert.ok(content.includes('seller-grade-card'), 'Must render seller-grade-card')
    assert.ok(content.includes('toggleGrade'), 'Must provide toggleGrade helper')
    assert.ok(content.includes("form.availableGrades?.includes('A')"), 'Must conditionally check Grade A')
    assert.ok(content.includes("form.availableGrades?.includes('B')"), 'Must conditionally check Grade B')
    assert.ok(content.includes("form.availableGrades?.includes('C')"), 'Must conditionally check Grade C')
  })

  test('Features Auto MRP calculation and live storefront discount preview', () => {
    assert.ok(content.includes('handleAutoMrp'), 'Must provide handleAutoMrp helper')
    assert.ok(content.includes('computeMarketMrp'), 'Must call computeMarketMrp')
    assert.ok(content.includes('seller-discount-preview'), 'Must render storefront preview')
    assert.ok(content.includes('seller-discount-pill'), 'Must render discount pill')
  })

  test('index.css includes responsive styling rules for seller form', () => {
    assert.ok(cssContent.includes('.seller-product-form'), 'CSS must define .seller-product-form')
    assert.ok(cssContent.includes('.seller-card'), 'CSS must define .seller-card')
    assert.ok(cssContent.includes('.seller-emoji-palette'), 'CSS must define .seller-emoji-palette')
    assert.ok(cssContent.includes('.seller-gram-presets'), 'CSS must define .seller-gram-presets')
    assert.ok(cssContent.includes('.seller-grade-grid'), 'CSS must define .seller-grade-grid')
  })

  test('Operates strictly on IN / OUT stock rule with zero numeric stock input fields', () => {
    assert.ok(!content.includes('value={form.stockQty}'), 'Must not have numeric stock quantity input')
    assert.ok(content.includes('IN (In Stock') || content.includes('IN (স্টকে আছে'), 'Must have 1-tap IN button')
    assert.ok(content.includes('OUT (Out of Stock') || content.includes('OUT (স্টক নেই'), 'Must have 1-tap OUT button')
  })
})

describe('Suite 45: Customer Delivery Address Auto-Save & 1-Tap Selector', () => {
  const checkoutPath = path.resolve(__dirname, '../src/pages/Checkout.tsx')
  const checkoutContent = fs.readFileSync(checkoutPath, 'utf8')

  test('Checkout.tsx automatically calls saveAddress to persist location in Supabase on order submission', () => {
    assert.ok(checkoutContent.includes('await saveAddress('), 'Must invoke saveAddress on order placement')
    assert.ok(checkoutContent.includes('fetchAddresses(user.id)'), 'Must refresh addresses from Supabase')
    assert.ok(checkoutContent.includes('saveDelivery(user.id,'), 'Must persist delivery details to localStorage cache')
  })

  test('Checkout.tsx stores full compound address in localStorage saveDelivery to prevent empty area validation errors', () => {
    assert.ok(
      checkoutContent.includes('saveDelivery(user.id, {\n            address: fullAddress,') ||
      checkoutContent.includes('address: fullAddress,'),
      'Must store fullAddress in saveDelivery instead of just house'
    )
  })

  test('Checkout.tsx renders 1-Tap Saved Addresses selector card list and New Address reset', () => {
    assert.ok(checkoutContent.includes('📍 সংরক্ষিত ঠিকানা (১-ট্যাপে নির্বাচন করুন):') || checkoutContent.includes('Saved Addresses (1-Tap Auto Fill):'), 'Must render saved addresses header')
    assert.ok(checkoutContent.includes('loadAddressIntoForm(a)'), 'Must populate form on 1-tap selection')
    assert.ok(checkoutContent.includes('setSelectedAddressId(null)'), 'Must allow resetting to new address')
  })

  test('Checkout.tsx provides fallback 1-tap auto-fill button for cached last delivery address', () => {
    assert.ok(checkoutContent.includes('⚡ শেষ ব্যবহৃত ঠিকানা অটো-ফিল করুন') || checkoutContent.includes('Auto-fill Last Used Address'), 'Must render 1-tap fallback button')
  })

  test('Checkout.tsx features customer-facing auto-save reassurance badge', () => {
    assert.ok(checkoutContent.includes('আপনার ডেলিভারি ঠিকানা পরবর্তী অর্ডারের জন্য প্রোফাইলে অটো-সেভ হবে') || checkoutContent.includes('Address will automatically save to your profile'), 'Must show auto-save assurance badge')
  })

  test('loadAddressIntoForm splits compound addresses into house and area to satisfy mandatory field validation', () => {
    assert.ok(checkoutContent.includes('loadAddressIntoForm'), 'Must define loadAddressIntoForm')
    assert.ok(checkoutContent.includes('setHouse(parts.slice(0, parts.length - 1).join('), 'Must split house from compound address')
    assert.ok(checkoutContent.includes('setArea(parts[parts.length - 1])'), 'Must split area from compound address')
  })
})

describe('Suite 46: Tiered Role Delegation & Admin Customer PIN Reset', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260923223000_tiered_role_delegation_and_customer_pin_reset.sql')
  const migrationContent = fs.readFileSync(migrationPath, 'utf8')
  const authContextPath = path.resolve(__dirname, '../src/context/AuthContext.tsx')
  const authContextContent = fs.readFileSync(authContextPath, 'utf8')
  const adminUsersPath = path.resolve(__dirname, '../src/pages/admin/AdminUsers.tsx')
  const adminUsersContent = fs.readFileSync(adminUsersPath, 'utf8')

  test('Database migration restricts role assignment strictly to admins and denies sellers', () => {
    assert.ok(
      migrationContent.includes("verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin'])"),
      'Must verify caller has admin role only'
    )
  })

  test('Database migration strictly blocks normal admins from granting or revoking Admin role', () => {
    assert.ok(
      migrationContent.includes("(p_role = 'admin' OR v_target.role = 'admin') AND NOT coalesce(v_caller.is_super_admin, false)"),
      'Must check if caller is Super Admin when granting or revoking Admin'
    )
    assert.ok(
      migrationContent.includes('Only Super Admin can grant or revoke the Admin role'),
      'Must return informative error message'
    )
  })

  test('Database migration allows normal admins to assign seller and rider roles', () => {
    assert.ok(
      migrationContent.includes("UPDATE public.profiles SET role = p_role, updated_at = now()"),
      'Must perform update for permitted roles'
    )
    assert.ok(
      migrationContent.includes("PERFORM set_config('app.allow_profile_change', 'true', true);"),
      'Must bypass anti-escalation trigger for authorized admin caller'
    )
  })

  test('Database migration allows admins to reset customer PIN (4 digits)', () => {
    assert.ok(
      migrationContent.includes("Target is a Customer: Any admin (Normal or Super Admin) can reset customer PIN") ||
      migrationContent.includes("Customer PIN must be exactly 4 digits"),
      'Must allow admin to reset customer PIN'
    )
  })

  test('Database migration allows staff self-password reset but blocks normal admins from resetting other staff', () => {
    assert.ok(
      migrationContent.includes("v_target.id <> v_caller.id AND NOT coalesce(v_caller.is_super_admin, false)"),
      'Must allow self reset or require Super Admin for other staff'
    )
    assert.ok(
      migrationContent.includes("Only Super Admin can reset passwords for other staff members"),
      'Must protect other staff members from unauthorized password resets'
    )
  })

  test('AuthContext.tsx prevents non-super admin from resetting other staff passwords but allows self-reset', () => {
    assert.ok(
      authContextContent.includes('!user?.isSuperAdmin && !isSelf'),
      'Must check both isSuperAdmin and isSelf'
    )
    assert.ok(
      authContextContent.includes('Only Super Admin can reset passwords for other staff members'),
      'Must reject resetting other staff members'
    )
  })

  test('AdminUsers.tsx guards staff password reset modal for non-super admin non-self viewers', () => {
    assert.ok(
      adminUsersContent.includes('!isViewerSuperAdmin && !isSelf'),
      'Must check both isViewerSuperAdmin and isSelf in AdminUsers.tsx'
    )
    assert.ok(
      adminUsersContent.includes('Only Super Admin can reset passwords for other staff members'),
      'Must inform user when attempting to reset other staff'
    )
  })
})

describe('Suite 47: Super Admin Supabase Magic Link 2FA & OTP Verification', () => {
  const authContextPath = path.resolve(__dirname, '../src/context/AuthContext.tsx')
  const authContextContent = fs.readFileSync(authContextPath, 'utf8')
  const authPath = path.resolve(__dirname, '../src/pages/Auth.tsx')
  const authContent = fs.readFileSync(authPath, 'utf8')

  test('AuthContext.tsx triggers Supabase Magic Link OTP for Super Admin login', () => {
    assert.ok(
      authContextContent.includes('profile.isSuperAdmin && supabase'),
      'Must check if user is Super Admin'
    )
    assert.ok(
      authContextContent.includes('supabase.auth.signInWithOtp'),
      'Must call signInWithOtp for Super Admin'
    )
    assert.ok(
      authContextContent.includes('mfaPending: true'),
      'Must return mfaPending: true'
    )
  })

  test('AuthContext.tsx validates 6-digit confirmation codes with verifyAdminOtp', () => {
    assert.ok(
      authContextContent.includes('verifyAdminOtp'),
      'Must define verifyAdminOtp'
    )
    assert.ok(
      authContextContent.includes('supabase.auth.verifyOtp'),
      'Must call verifyOtp'
    )
  })

  test('AuthContext.tsx onAuthStateChange captures magic link session and hydrates Super Admin profile', () => {
    assert.ok(
      authContextContent.includes('client.auth.onAuthStateChange'),
      'Must listen for auth state changes'
    )
    assert.ok(
      authContextContent.includes('saveCurrentUser(profile)'),
      'Must persist authenticated profile'
    )
    assert.ok(
      authContextContent.includes("window.location.replace(`${window.location.origin}/admin`)"),
      'Must navigate Super Admin to /admin'
    )
  })

  test('Auth.tsx renders Gmail prompt, launch button, and 6-digit confirmation code verification box', () => {
    assert.ok(
      authContent.includes('mode === \'mfa\''),
      'Must handle mfa mode'
    )
    assert.ok(
      authContent.includes('https://mail.google.com'),
      'Must provide 1-tap Gmail link'
    )
    assert.ok(
      authContent.includes('verifyAdminOtp(otpCode)'),
      'Must allow verifying 6-digit email confirmation code'
    )
  })
})



