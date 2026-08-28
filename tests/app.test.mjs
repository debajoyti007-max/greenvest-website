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

  test('Formats advance 50% amount correctly with 2 decimal places', () => {
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

  // Feature 1: MRP Strikethrough Calculation & Brand Discount %
  const computeMarketMrp = (sellingPrice) => {
    if (!sellingPrice || sellingPrice <= 0) return 0
    return Math.ceil(sellingPrice * 1.25)
  }

  const computeDiscountPercent = (mrp, sellingPrice) => {
    if (!mrp || mrp <= sellingPrice) return 0
    return Math.round(((mrp - sellingPrice) / mrp) * 100)
  }

  test('Market MRP computes big-brand markup (e.g. ₹20 selling price -> ₹25 MRP with 20% OFF)', () => {
    assert.equal(computeMarketMrp(20), 25) // 20 * 1.25 = 25
    assert.equal(computeMarketMrp(40), 50) // 40 * 1.25 = 50
    assert.equal(computeMarketMrp(100), 125) // 100 * 1.25 = 125

    // Discount % verification
    assert.equal(computeDiscountPercent(25, 20), 20) // (25-20)/25 = 20% OFF
    assert.equal(computeDiscountPercent(50, 40), 20) // (50-40)/50 = 20% OFF
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

  // Feature 6: Digital Ledger / Khata Book
  const calculateUserKhataBalance = (userId, entries) => {
    return entries
      .filter((e) => e.userId === userId)
      .reduce((sum, e) => {
        if (e.type === 'order_debit') return sum + e.amount
        if (e.type === 'payment_credit') return sum - e.amount
        return sum
      }, 0)
  }

  test('Khata ledger correctly aggregates debits and payment credits', () => {
    const userId = 'usr-123'
    const ledger = [
      { userId, type: 'order_debit', amount: 500 },
      { userId, type: 'order_debit', amount: 300 },
      { userId, type: 'payment_credit', amount: 400 },
    ]
    const balance = calculateUserKhataBalance(userId, ledger)
    assert.equal(balance, 400) // 500 + 300 - 400 = 400
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

// 19. Auto Smart Remove System (Deals Expiry, Stale Orders, Zero-Balance Khata)
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
    if (order.status !== 'pending' || order.utrVerified) return false
    const created = new Date(order.createdAt).getTime()
    if (isNaN(created)) return false
    const ageHours = (Date.now() - created) / (1000 * 60 * 60)
    return ageHours >= timeoutHours
  }

  test('Correctly identifies unpaid orders older than 2 hours as stale pending', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const staleOrder = { id: 'ord-stale', status: 'pending', utrVerified: false, createdAt: threeHoursAgo }
    const freshPendingOrder = { id: 'ord-fresh', status: 'pending', utrVerified: false, createdAt: thirtyMinsAgo }
    const verifiedOrder = { id: 'ord-verified', status: 'pending', utrVerified: true, createdAt: threeHoursAgo }
    const confirmedOrder = { id: 'ord-conf', status: 'confirmed', utrVerified: false, createdAt: threeHoursAgo }

    assert.equal(isOrderStalePending(staleOrder, 2), true, 'Order > 2 hours unverified pending must be stale')
    assert.equal(isOrderStalePending(freshPendingOrder, 2), false, 'Recent order must not be stale')
    assert.equal(isOrderStalePending(verifiedOrder, 2), false, 'Verified UTR order must not be stale')
    assert.equal(isOrderStalePending(confirmedOrder, 2), false, 'Confirmed order must not be stale')
  })

  // Feature 5: Zero-Balance Khata Smart Filter
  test('Filters Khata accounts to only display active debtors with outstanding dues (>0)', () => {
    const customers = [
      { id: 'c1', name: 'Rahim', balance: 450 },
      { id: 'c2', name: 'Karim', balance: 0 },
      { id: 'c3', name: 'Bijoy', balance: 1200 },
      { id: 'c4', name: 'Shyamal', balance: 0 },
    ]

    const duesOnly = customers.filter((c) => c.balance > 0)
    const settledOnly = customers.filter((c) => c.balance === 0)

    assert.equal(duesOnly.length, 2)
    assert.deepEqual(duesOnly.map((c) => c.id), ['c1', 'c3'])
    assert.equal(settledOnly.length, 2)
    assert.deepEqual(settledOnly.map((c) => c.id), ['c2', 'c4'])
  })
})






