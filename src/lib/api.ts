import type {
  Address,
  AppNotification,
  ChatMessage,
  Coupon,
  CustomerTier,
  DailyReport,
  DeliveryZone,
  DeliverySlot,
  Grade,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductReview,
  PromotionalDeal,
  Role,
  Season,
  User,
} from '../types'
import { SEED_PRODUCTS } from '../data/seed'
import { isSupabaseConfigured, supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'
import type { StaffCredentials } from './staffAuth'

type ProductRow = {
  id: string
  emoji: string
  name: string
  bn_name: string
  p_a: number
  p_b: number
  p_c: number
  mrp?: number | null
  available_grades?: string[] | null
  in_stock: boolean
  archived?: boolean | null
  stock_qty?: number | null
  season?: string | null
  category: string
  unit: string
  image_url: string | null
  sold_as?: string | null
  gram_options?: number[] | null
}

type PromotionalDealRow = {
  id: string
  badge_bn: string
  badge_en: string
  title_bn: string
  title_en: string
  subtitle_bn?: string | null
  subtitle_en?: string | null
  coupon_code?: string | null
  link_url?: string | null
  button_text_bn?: string | null
  button_text_en?: string | null
  bg_gradient?: string | null
  emoji?: string | null
  is_active: boolean
  expires_at?: string | null
  auto_remove_on_expiry?: boolean | null
  created_at: string
}

type OrderRow = {
  id: string
  user_id: string
  user_name: string
  user_email: string
  subtotal: number
  delivery_fee: number
  discount?: number | null
  total: number
  advance_amount: number
  payment_type?: string | null
  payment_mode?: string | null
  rejection_reason?: string | null
  assigned_rider_id?: string | null
  utr: string
  utr_verified: boolean
  status: OrderStatus
  address: string
  phone: string
  pin: string
  delivery_slot?: string | null
  delivery_date?: string | null
  delivery_otp?: string | null
  geo_lat?: number | null
  geo_lng?: number | null
  created_at: string
  updated_at: string
  order_items?: OrderItemRow[]
}

type OrderItemRow = {
  order_id?: string
  product_id: string
  name: string
  emoji: string
  grade: Grade
  qty: number
  unit_price: number
  weight_multiplier?: number | null
  weight_label?: string | null
}

type ProfileRow = {
  id: string
  email: string
  name: string
  role: Role
  tier?: CustomerTier | null
  phone?: string | null
  // isBlocked column was dropped from DB in migration 014 — only is_blocked remains
  is_blocked?: boolean | null
  pin?: string | null
  is_super_admin?: boolean | null
  created_at: string
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add keys to .env')
  return supabase
}

function isBrokenBn(value: string | null | undefined) {
  if (!value) return true
  // Corrupted cloud rows sometimes stored literal "?" for Bengali glyphs
  return /^[?\s]+$/.test(value) || !/[\u0980-\u09FF]/.test(value)
}

const bnById = new Map(SEED_PRODUCTS.map((p) => [p.id, p.bnName]))
const bnByName = new Map(SEED_PRODUCTS.map((p) => [p.name.toLowerCase(), p.bnName]))

function repairBnName(id: string, name: string, bnName: string) {
  if (!isBrokenBn(bnName)) return bnName
  return bnById.get(id) || bnByName.get(name.toLowerCase()) || name
}

function mapProduct(row: ProductRow): Product {
  const season = (row.season || 'all') as Season
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    bnName: repairBnName(row.id, row.name, row.bn_name),
    pA: Number(row.p_a),
    pB: Number(row.p_b),
    pC: Number(row.p_c),
    mrp: row.mrp != null ? Number(row.mrp) : undefined,
    availableGrades: Array.isArray(row.available_grades) && row.available_grades.length > 0 ? (row.available_grades as Grade[]) : ['A', 'B', 'C'],
    inStock: Boolean(row.in_stock),
    archived: row.archived ?? false,
    stockQty: row.stock_qty != null ? Number(row.stock_qty) : undefined,
    season,
    category: row.category,
    unit: row.unit,
    imageUrl: row.image_url ?? undefined,
    soldAs: (row.sold_as as 'loose' | 'packet' | 'both') || undefined,
    gramOptions: Array.isArray(row.gram_options) ? row.gram_options : undefined,
  }
}

function mapDeal(row: PromotionalDealRow): PromotionalDeal {
  return {
    id: row.id,
    badgeBn: row.badge_bn || '',
    badgeEn: row.badge_en || '',
    titleBn: row.title_bn || '',
    titleEn: row.title_en || '',
    subtitleBn: row.subtitle_bn || '',
    subtitleEn: row.subtitle_en || '',
    couponCode: row.coupon_code || undefined,
    linkUrl: row.link_url || undefined,
    buttonTextBn: row.button_text_bn || undefined,
    buttonTextEn: row.button_text_en || undefined,
    bgGradient: row.bg_gradient || undefined,
    emoji: row.emoji || undefined,
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at || undefined,
    autoRemoveOnExpiry: row.auto_remove_on_expiry ?? true,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function dealToRow(d: PromotionalDeal): PromotionalDealRow {
  return {
    id: d.id,
    badge_bn: d.badgeBn,
    badge_en: d.badgeEn,
    title_bn: d.titleBn,
    title_en: d.titleEn,
    subtitle_bn: d.subtitleBn || null,
    subtitle_en: d.subtitleEn || null,
    coupon_code: d.couponCode || null,
    link_url: d.linkUrl || null,
    button_text_bn: d.buttonTextBn || null,
    button_text_en: d.buttonTextEn || null,
    bg_gradient: d.bgGradient || null,
    emoji: d.emoji || null,
    is_active: d.isActive !== false,
    expires_at: d.expiresAt || null,
    auto_remove_on_expiry: d.autoRemoveOnExpiry !== false,
    created_at: d.createdAt || new Date().toISOString(),
  }
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    productId: row.product_id,
    name: row.name,
    emoji: row.emoji,
    grade: row.grade,
    qty: Number(row.qty),
    unitPrice: Number(row.unit_price),
    weightMultiplier: row.weight_multiplier != null ? Number(row.weight_multiplier) : undefined,
    weightLabel: row.weight_label || undefined,
  }
}

function mapOrder(row: OrderRow): Order {
  const slot = row.delivery_slot
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    items: (row.order_items || []).map(mapOrderItem),
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    discountAmount: row.discount != null ? Number(row.discount) : undefined,
    total: Number(row.total),
    advanceAmount: Number(row.advance_amount),
    paymentType: (row.payment_type as 'full' | 'advance') || 'advance',
    paymentMode: (row.payment_mode as 'online' | undefined) || undefined,
    rejectionReason: row.rejection_reason || undefined,
    utr: row.utr,
    payerUpiName: (row as any).payer_upi_name || undefined,
    utrVerified: row.utr_verified,
    status: row.status,
    address: row.address,
    phone: row.phone,
    pin: row.pin,
    deliverySlot: slot === 'morning' || slot === 'evening' ? (slot as DeliverySlot) : undefined,
    deliveryDate: row.delivery_date || undefined,
    deliveryOtp: row.delivery_otp || undefined,
    deliveryNotes: (row as any).delivery_notes || undefined,
    geoLat: row.geo_lat ?? undefined,
    geoLng: row.geo_lng ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapProfile(row: ProfileRow): User {
  // Derive phone from email if not explicitly stored (legacy accounts)
  const derivedPhone =
    row.phone ||
    (row.email.endsWith('@greenvest.shop')
      ? row.email.replace('@greenvest.shop', '')
      : undefined)
  return {
    id: row.id,
    email: row.email,
    password: '',
    name: row.name,
    role: row.role,
    tier: row.tier || 'regular',
    phone: derivedPhone || undefined,
    isBlocked: Boolean(row.is_blocked),
    // 🔒 Security: isSuperAdmin is set ONLY by the database, never by env vars in frontend code
    isSuperAdmin: row.is_super_admin === true,
    createdAt: row.created_at,
  }
}

export async function fetchProfile(userId: string): Promise<User | null> {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? mapProfile(data as ProfileRow) : null
}

export async function fetchProfiles(callerId: string, callerPin: string): Promise<User[]> {
  const client = requireClient()
  const { data: rpcData, error: rpcErr } = await client.rpc('get_staff_customers', {
    p_caller_id: callerId,
    p_caller_pin: callerPin,
  })
  if (rpcErr) throw new Error(rpcErr.message || 'Failed to load customer list')
  if (!rpcData || !Array.isArray(rpcData)) return []
  return (rpcData as ProfileRow[]).map(mapProfile)
}

export async function checkAccountExistsByEmail(email: string): Promise<boolean> {
  const client = requireClient()
  const { data, error } = await client.rpc('check_account_exists', { p_identifier: email.trim() })
  if (error) return false
  const row = data as { exists?: boolean } | null
  return Boolean(row?.exists)
}

export async function updateProfileRole(
  userId: string,
  role: Role,
  staff: StaffCredentials,
  email?: string,
  phone?: string,
): Promise<void> {
  const client = requireClient()
  const lookupId = userId || email || phone || ''
  const { data, error } = await client.rpc('update_user_role_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_user_id: lookupId,
    p_role: role,
  })
  if (error) throw new Error(error.message || 'Failed to update role')
  const result = data as { success?: boolean; error?: string } | null
  if (result?.success === false) throw new Error(result.error || 'Failed to update role')
}

export async function updateOwnPin(callerId: string, oldPin: string, newPin: string): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_own_pin', {
    p_caller_id: callerId,
    p_old_pin: oldPin,
    p_new_pin: newPin,
  })
  if (error) throw new Error(error.message || 'Failed to update PIN')
  const result = data as { ok?: boolean; error?: string } | null
  if (!result?.ok) throw new Error(result?.error || 'Failed to update PIN')
}

export async function upgradeStaffPasswordApi(
  callerId: string,
  oldSecret: string,
  newPassword: string,
): Promise<{ ok: boolean; message?: string }> {
  const client = requireClient()
  const { data, error } = await client.rpc('upgrade_staff_password', {
    p_caller_id: callerId,
    p_old_secret: oldSecret,
    p_new_password: newPassword,
  })
  if (error) throw new Error(error.message || 'Failed to upgrade staff password')
  const result = data as { ok?: boolean; error?: string; message?: string } | null
  if (!result?.ok) throw new Error(result?.error || 'Failed to upgrade staff password')
  return { ok: true, message: result.message }
}

export async function updateProfilePinAdmin(
  userId: string,
  pin: string,
  staff: StaffCredentials,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_user_pin_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_user_id: userId,
    p_new_pin: pin,
  })
  if (error) throw new Error(error.message || 'Failed to reset PIN')
  const result = data as { ok?: boolean; error?: string } | null
  if (!result?.ok) throw new Error(result?.error || 'Failed to reset PIN')
}

export async function updateProfileBlocked(
  userId: string,
  isBlocked: boolean,
  staff: StaffCredentials,
  email?: string,
  phone?: string,
): Promise<void> {
  const client = requireClient()
  const lookupId = userId || email || phone || ''
  const { data, error } = await client.rpc('update_user_block_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_user_id: lookupId,
    p_is_blocked: isBlocked,
  })
  if (error) throw new Error(error.message || 'Failed to update block status')
  const result = data as { success?: boolean; error?: string } | null
  if (result?.success === false) throw new Error(result.error || 'Failed to update block status')
}

export async function updateProfileDetails(
  userId: string,
  details: { name?: string; phone?: string },
  callerPin: string,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_own_profile', {
    p_caller_id: userId,
    p_caller_pin: callerPin,
    p_name: details.name ?? null,
    p_phone: details.phone ?? null,
  })
  if (error) throw new Error(error.message || 'Failed to update profile')
  const result = data as { ok?: boolean; error?: string } | null
  if (!result?.ok) throw new Error(result?.error || 'Failed to update profile')
}

export async function updateProfileTier(
  userId: string,
  tier: CustomerTier,
  staff: StaffCredentials,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_user_tier_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_user_id: userId,
    p_tier: tier,
  })
  if (error) throw new Error(error.message || 'Failed to update tier')
  const result = data as { success?: boolean; error?: string } | null
  if (result?.success === false) throw new Error(result.error || 'Failed to update tier')
}

// ── SWR Product In-Memory & LocalStorage Cache ─────────────────────────
let memoryProductCache: { data: Product[]; timestamp: number } | null = null
const PRODUCT_CACHE_TTL_MS = 4 * 60 * 1000 // 4 minutes client-side TTL

export function invalidateProductCache(): void {
  memoryProductCache = null
  try {
    localStorage.removeItem('gv_products_cache_v2')
  } catch {}
}

export async function fetchProducts(forceRefresh = false): Promise<Product[]> {
  const now = Date.now()

  // 1. Return in-memory cache if valid & not forced
  if (!forceRefresh && memoryProductCache && now - memoryProductCache.timestamp < PRODUCT_CACHE_TTL_MS) {
    return memoryProductCache.data
  }

  // 2. Check localStorage cache if in-memory is empty
  if (!forceRefresh && !memoryProductCache) {
    try {
      const raw = localStorage.getItem('gv_products_cache_v2')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (
          parsed.timestamp &&
          now - parsed.timestamp < PRODUCT_CACHE_TTL_MS &&
          Array.isArray(parsed.data) &&
          parsed.data.length > 0
        ) {
          memoryProductCache = { data: parsed.data, timestamp: parsed.timestamp }
          return parsed.data
        }
      }
    } catch {}
  }

  // 3. Lightweight fetch from Supabase with safe fallback
  try {
    const client = requireClient()
    const { data, error } = await client.from('products').select('*').order('name')
    if (error) throw error
    const fetched = (data as ProductRow[]).map(mapProduct)
    const result = fetched.length > 0 ? fetched : SEED_PRODUCTS

    // Update in-memory & localStorage caches
    memoryProductCache = { data: result, timestamp: now }
    try {
      localStorage.setItem('gv_products_cache_v2', JSON.stringify({ data: result, timestamp: now }))
    } catch {}

    return result
  } catch (err) {
    console.warn('fetchProducts network issue, falling back to cache/seed:', err)
    if (memoryProductCache?.data && memoryProductCache.data.length > 0) {
      return memoryProductCache.data
    }
    try {
      const raw = localStorage.getItem('gv_products_cache_v2')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.data) && parsed.data.length > 0) return parsed.data
      }
    } catch {}
    return SEED_PRODUCTS
  }
}

export async function upsertProduct(product: Product, staff: StaffCredentials): Promise<Product> {
  invalidateProductCache()
  const client = requireClient()

  const { data: rpcData, error: rpcErr } = await client.rpc('save_product_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_id: product.id,
    p_name: product.name,
    p_bn_name: product.bnName || '',
    p_p_a: product.pA,
    p_p_b: product.pB,
    p_p_c: product.pC,
    p_in_stock: product.inStock,
    p_category: product.category,
    p_unit: product.unit,
    p_image_url: product.imageUrl || null,
    p_emoji: product.emoji || '🥬',
    p_archived: Boolean(product.archived),
    p_mrp: product.mrp ?? null,
    p_available_grades: product.availableGrades?.length ? product.availableGrades : ['A', 'B', 'C'],
    p_sold_as: product.soldAs || 'loose',
    p_gram_options: product.gramOptions || null,
    p_stock_qty: product.stockQty ?? null,
  })
  if (rpcErr) throw new Error(rpcErr.message || 'Failed to save product')
  if (!rpcData) throw new Error('Failed to save product')
  return mapProduct(rpcData as ProductRow)
}

export async function insertProduct(product: Omit<Product, 'id'>, staff: StaffCredentials): Promise<Product> {
  invalidateProductCache()
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return upsertProduct({ ...product, id }, staff)
}

export async function deleteProductApi(id: string, staff: StaffCredentials): Promise<void> {
  invalidateProductCache()
  const client = requireClient()
  const { data, error } = await client.rpc('delete_product_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_product_id: id,
  })
  if (error) throw new Error(error.message || 'Failed to delete product')
  const result = data as { success?: boolean } | null
  if (result?.success === false) throw new Error('Failed to delete product')
}

export async function setAllProductsInStock(staff: StaffCredentials): Promise<void> {
  invalidateProductCache()
  const client = requireClient()
  const { data, error } = await client.rpc('set_all_products_in_stock_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
  })
  if (error) throw new Error(error.message || 'Failed to reset stock')
  const result = data as { success?: boolean } | null
  if (result?.success === false) throw new Error('Failed to reset stock')
}


export async function fetchOrders(
  userRole?: string,
  userId?: string,
  _userEmail?: string,
  _userPhone?: string,
  limitCount = 100,
  userPin?: string,
): Promise<Order[]> {
  const client = requireClient()
  const isStaff = userRole === 'seller' || userRole === 'admin' || userRole === 'rider'

  // 1. Staff Gateway: try secure RPC for sellers, admins, and riders
  if (isStaff && userId) {
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('get_staff_orders', {
        p_caller_id: userId,
        p_caller_pin: userPin || '',
      })
      if (!rpcErr && rpcData && Array.isArray(rpcData)) {
        return (rpcData as OrderRow[]).map(mapOrder)
      }
      if (rpcErr) {
        console.warn('get_staff_orders RPC fallback notice:', rpcErr.message)
      }
    } catch (err) {
      console.warn('get_staff_orders RPC exception:', err)
    }
  }

  // Customer gateway: requires PIN-verified RPC
  if (!isStaff && userId && userPin) {
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('get_customer_orders', {
        p_caller_id: userId,
        p_caller_pin: userPin,
        p_limit: limitCount,
      })
      if (!rpcErr && rpcData) {
        const payload = rpcData as { ok?: boolean; orders?: OrderRow[] }
        if (payload.ok && Array.isArray(payload.orders)) {
          return payload.orders.map(mapOrder)
        }
      }
    } catch (err) {
      console.warn('get_customer_orders RPC error:', err)
    }
  }

  if (!isStaff) return []
  return []
}

/**
 * @deprecated Use fetchOrderByIdAndPhone instead.
 * This function is kept only for internal admin/seller staff queries
 * that already have verified authentication context.
 * DO NOT call from public-facing pages.
 */
async function fetchOrderByPublicQueryInternal(rawQuery: string): Promise<Order | null> {
  if (!supabase) return null

  const cleaned = (rawQuery || '').trim().toLowerCase().replace(/^#/, '')
  const digitsOnly = cleaned.replace(/\D/g, '')
  if (!cleaned) return null

  try {
    const query = supabase.from('orders').select('*, order_items(*)')
    const filters: string[] = [`id.eq.${cleaned}`, `id.ilike.%${cleaned}`]
    if (digitsOnly.length >= 10) {
      filters.push(`phone.eq.${digitsOnly.slice(-10)}`)
    }
    const { data, error } = await query.or(filters.join(',')).limit(1).maybeSingle()
    if (!error && data) {
      return mapOrder(data as OrderRow)
    }
  } catch (err) {
    console.debug('fetchOrderByPublicQueryInternal error:', err)
  }
  return null
}

/**
 * Secure dual-factor order lookup for the public /track page.
 * Requires BOTH the Order ID AND the customer's 10-digit phone number.
 * This prevents strangers from looking up other people's orders by guessing IDs.
 */
export async function fetchOrderByIdAndPhone(
  rawOrderId: string,
  rawPhone: string,
): Promise<Order | null> {
  if (!supabase) return null

  const cleanId = (rawOrderId || '').trim().replace(/^#/i, '')
  const cleanPhone = (rawPhone || '').replace(/\D/g, '').slice(-10)

  if (!cleanId || cleanPhone.length < 10) return null

  try {
    const { data, error } = await supabase.rpc('track_order_public', {
      p_order_id: cleanId,
      p_phone: cleanPhone,
    })
    if (error) return null
    const payload = data as { ok?: boolean; order?: OrderRow } | null
    if (payload?.ok && payload.order) {
      return mapOrder(payload.order)
    }
  } catch (err) {
    console.debug('fetchOrderByIdAndPhone error:', err)
  }
  return null
}

export async function cancelOwnOrderApi(
  callerId: string,
  callerPin: string,
  orderId: string,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('cancel_own_order', {
    p_caller_id: callerId,
    p_caller_pin: callerPin,
    p_order_id: orderId,
  })
  if (error) throw new Error(error.message || 'Failed to cancel order')
  const result = data as { ok?: boolean; error?: string } | null
  if (!result?.ok) throw new Error(result?.error || 'Failed to cancel order')
}

// Re-export internal function for admin/seller staff code that uses the old name
export { fetchOrderByPublicQueryInternal as fetchOrderByPublicQuery }

export async function updateOrderUtrApi(orderId: string, utr: string): Promise<boolean> {
  const client = requireClient()

  const cleanedUtr = (utr || '').trim().toUpperCase()
  const { error } = await client
    .from('orders')
    .update({ utr: cleanedUtr, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('utr_verified', false)

  if (error) {
    throw error
  }
  return true
}

async function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, errorMsg = 'Request timed out'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms)
  })
  try {
    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function createOrder(order: Order): Promise<Order> {
  const client = requireClient()

  // Backfill phone on existing profile if provided in order (non-blocking)
  if (order.phone && order.userId) {
    const cleanPh = order.phone.replace(/\D/g, '').slice(-10)
    if (cleanPh.length >= 10) {
      void client.from('profiles').update({ phone: cleanPh }).eq('id', order.userId)
    }
  }

  const rpcPayload = {
    p_id: order.id,
    p_user_id: order.userId,
    p_user_name: order.userName,
    p_user_email: order.userEmail || `${order.userId}@greenvest.shop`,
    p_address: order.address,
    p_phone: order.phone,
    p_pin: order.pin,
    p_delivery_slot: order.deliverySlot || 'morning',
    p_utr: order.utr,
    p_delivery_fee: order.deliveryFee,
    p_discount: order.discountAmount || 0,
    p_payment_type: order.paymentType || 'advance',
    p_items: order.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      emoji: it.emoji,
      grade: it.grade,
      qty: it.qty,
      weightMultiplier: it.weightMultiplier || 1,
      weightLabel: it.weightLabel || '1 kg',
    })),
    p_delivery_date: order.deliveryDate || 'standard',
    p_geo_lat: order.geoLat ?? null,
    p_geo_lng: order.geoLng ?? null,
    p_payer_upi_name: order.payerUpiName ?? null,
    p_delivery_notes: order.deliveryNotes ?? null,
  }

  // Attempt 1: Atomic server-side RPC transaction with strict 7s timeout
  try {
    const { data: atomicRes, error: rpcErr } = await withTimeout(
      client.rpc('create_order_atomic', rpcPayload),
      7000,
      'Atomic RPC client timed out',
    )

    if (!rpcErr && atomicRes && (atomicRes as any).success) {
      return order
    }
    if (rpcErr && rpcErr.message && /already been used/i.test(rpcErr.message)) {
      throw new Error(rpcErr.message)
    }
  } catch (rpcEx: any) {
    if (rpcEx?.message && /already been used/i.test(rpcEx.message)) {
      throw rpcEx
    }
    console.debug('Atomic RPC client call failed or timed out:', rpcEx)
  }

  // Attempt 2: Direct REST RPC fallback (bypasses any frozen client auth refresh queue)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const restRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_order_atomic`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (restRes.ok) {
      const data = await restRes.json()
      if (data && (data.success || data.order_id)) {
        return order
      }
    }
  } catch (restErr) {
    console.debug('Direct REST RPC fallback failed or timed out:', restErr)
  }

  // Step 1: Insert order row
  const payload: any = {
    id: order.id,
    user_id: order.userId,
    user_name: order.userName,
    user_email: order.userEmail,
    subtotal: order.subtotal,
    delivery_fee: order.deliveryFee,
    discount: order.discountAmount || 0,
    total: order.total,
    advance_amount: order.advanceAmount,
    payment_type: order.paymentType || 'advance',
    payment_mode: order.paymentMode || 'online',
    rejection_reason: order.rejectionReason || null,
    utr: order.utr,
    utr_verified: order.utrVerified,
    status: order.status,
    address: order.address,
    phone: order.phone,
    pin: order.pin,
    delivery_slot: order.deliverySlot || null,
    delivery_date: order.deliveryDate || null,
    delivery_notes: order.deliveryNotes || null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  }

  if (order.geoLat != null) payload.geo_lat = order.geoLat
  if (order.geoLng != null) payload.geo_lng = order.geoLng
  if (order.payerUpiName) (payload as any).payer_upi_name = order.payerUpiName
  if (order.deliveryDate) (payload as any).delivery_date = order.deliveryDate
  if (order.deliveryNotes) (payload as any).delivery_notes = order.deliveryNotes

  let { error: orderError } = await withTimeout(client.from('orders').insert(payload), 6000, 'Orders insert timed out')
  if (orderError) {
    // Retry with essential core columns in case of unmigrated schema extensions
    const cleanPayload = {
      id: order.id,
      user_id: order.userId,
      user_name: order.userName,
      user_email: order.userEmail,
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      total: order.total,
      advance_amount: order.advanceAmount,
      utr: order.utr,
      utr_verified: order.utrVerified,
      status: order.status,
      address: order.address,
      phone: order.phone,
      pin: order.pin,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    }
    ;({ error: orderError } = await withTimeout(client.from('orders').insert(cleanPayload), 5000, 'Orders fallback insert timed out'))
  }
  if (orderError) {
    console.error('createOrder → orders insert failed:', orderError)
    throw new Error(orderError.message || 'Order insert failed')
  }

  // Step 2: Insert order items
  const items = order.items.map((it) => ({
    order_id: order.id,
    product_id: it.productId,
    name: it.name,
    emoji: it.emoji,
    grade: it.grade,
    qty: it.qty,
    unit_price: it.unitPrice,
    weight_multiplier: it.weightMultiplier || 1,
    weight_label: it.weightLabel || '1 kg',
  }))
  let { error: itemsError } = await withTimeout(client.from('order_items').insert(items), 6000, 'Order items insert timed out')
  if (itemsError) {
    // Fallback without weight columns if old schema
    const fallbackItems = items.map(({ weight_multiplier: _wm, weight_label: _wl, ...rest }) => rest)
    ;({ error: itemsError } = await withTimeout(client.from('order_items').insert(fallbackItems), 5000, 'Order items fallback insert timed out'))
  }
  if (itemsError) {
    console.error('createOrder → order_items insert failed:', itemsError)
    await client.from('orders').delete().eq('id', order.id)
    throw new Error(itemsError.message || 'Order items insert failed')
  }

  return order
}

/**
 * Verifies the 4-digit delivery handover OTP server-side via the
 * `verify_delivery_handover` Supabase RPC.
 *
 * The database compares the entered OTP against `orders.delivery_otp`
 * atomically and, on success, sets `status = 'delivered'` in the same
 * transaction.  The client never sees the stored OTP — it is never sent
 * to the browser.
 *
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on failure.
 */
export async function verifyDeliveryOtpApi(
  orderId: string,
  enteredOtp: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = requireClient()
  try {
    const { data, error } = await client.rpc('verify_delivery_handover', {
      p_order_id: orderId,
      p_otp: enteredOtp.trim(),
    })
    if (error) {
      return { ok: false, error: error.message || 'OTP verification failed' }
    }
    const result = data as { success: boolean; message?: string } | null
    if (result?.success) return { ok: true }
    return { ok: false, error: result?.message || 'Incorrect OTP' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error during OTP verification' }
  }
}

export async function updateOrderStatusApi(
  id: string,
  status: OrderStatus,
  staff: StaffCredentials,
  rejectionReason?: string,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_order_status_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_order_id: id,
    p_status: status,
    p_reason: rejectionReason || null,
  })
  if (error) throw new Error(error.message || 'Failed to update order status')
  const result = data as { success?: boolean; error?: string } | null
  if (result?.success === false) throw new Error(result.error || 'Failed to update order status')
}

export async function bulkUpdateOrderStatusApi(
  ids: string[],
  status: OrderStatus,
  staff: StaffCredentials,
  rejectionReason?: string,
): Promise<void> {
  for (const id of ids) {
    await updateOrderStatusApi(id, status, staff, rejectionReason)
  }
}

export async function updateOrderDeliveryDateApi(
  id: string,
  deliveryDate: string,
  staff: StaffCredentials,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('update_order_delivery_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_order_id: id,
    p_delivery_date: deliveryDate,
  })
  if (error) throw new Error(error.message || 'Failed to update delivery date')
  const result = data as { success?: boolean } | null
  if (result?.success === false) throw new Error('Failed to update delivery date')
}

export async function checkDuplicateUtrApi(utr: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const clean = utr.trim().toUpperCase()
  if (clean.length < 6) return false
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('utr', clean)
    .neq('status', 'cancelled')
    .limit(1)
  return Boolean(data && data.length > 0)
}

export async function findRecentOrderByUtrApi(userId: string, utr: string): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const clean = utr.trim().toUpperCase()
  if (!clean) return null
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('utr', clean)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
    if (!error && data && data.length > 0) {
      return mapOrder(data[0] as OrderRow)
    }
  } catch (e) {
    console.warn('findRecentOrderByUtrApi fallback check error:', e)
  }
  return null
}

// verifyUtrApi removed — UTR verification feature was removed.
// Sellers now use 1-tap Accept Order only (no UTR entry required).

export async function deleteOrderApi(id: string, staff: StaffCredentials): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('delete_order_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_order_id: id,
  })
  if (error) throw new Error(error.message || 'Failed to delete order')
  const result = data as { success?: boolean } | null
  if (result?.success === false) throw new Error('Failed to delete order')
}


export function subscribeOrders(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

export function subscribeProducts(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('products-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => onChange())
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

// ── Customer-specific order subscription (free-tier optimized) ───────────────
// Opens only for logged-in customers. Filtered by user_id so the channel only
// fires when THEIR orders change — no wasted events from other users.
export function subscribeCustomerOrders(userId: string, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase || !userId) return () => {}
  const client = supabase
  const channel = client
    .channel(`customer-orders-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

// ── Per-order message subscription (DB-level guarantee) ──────────────────────
// Listens to postgres_changes on order_messages filtered to a specific orderId.
// This is a reliable DB-level fallback — if the recipient was offline when the
// broadcast fired, they still get the message when they open the chat.
export function subscribeOrderMessages(orderId: string, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase || !orderId) return () => {}
  const client = supabase
  const channel = client
    .channel(`order-msg-db-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

// ── Single order subscription for live tracking (free-tier optimized) ────────
// Used on TrackOrder.tsx when viewing a specific order. Subscribes only while on page.
export function subscribeSingleOrder(orderId: string, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase || !orderId) return () => {}
  const client = supabase
  const channel = client
    .channel(`order-track-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

// ── Support messages subscription (scoped to customer or all for staff) ──────
// If userId is provided: listens only for that user's messages.
// If userId is undefined: listens for any incoming message (used in seller support desk).
export function subscribeSupportMessages(userId: string | undefined, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channelName = userId ? `support-msgs-${userId}` : 'support-msgs-staff'
  const filter = userId ? `user_id=eq.${userId}` : undefined
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        ...(filter ? { filter } : {}),
      },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}


export async function fetchAddresses(userId: string): Promise<Address[]> {
  if (!supabase || !userId) return []
  try {
    const { data, error } = await supabase.from('addresses').select('*').eq('user_id', userId)
    if (error) return []
    return (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      label: r.label,
      address: r.address,
      phone: r.phone,
      pin: r.pin,
      is_default: r.is_default,
      geoLat: r.geo_lat != null ? Number(r.geo_lat) : undefined,
      geoLng: r.geo_lng != null ? Number(r.geo_lng) : undefined,
      landmark: r.landmark || undefined,
    }))
  } catch { return [] }
}

export async function saveAddress(addr: Address): Promise<void> {
  if (!supabase) return
  try {
    const payload: any = {
      user_id: addr.user_id,
      label: addr.label || 'Home',
      address: addr.address,
      phone: addr.phone,
    }
    if (addr.pin) payload.pin = addr.pin
    if (addr.is_default !== undefined) payload.is_default = addr.is_default
    if (addr.geoLat != null) payload.geo_lat = addr.geoLat
    if (addr.geoLng != null) payload.geo_lng = addr.geoLng
    if (addr.landmark) payload.landmark = addr.landmark

    if (addr.id) {
      payload.id = addr.id
      const { error } = await supabase.from('addresses').upsert(payload)
      if (error) {
        // Fallback without extended columns in case database columns aren't migrated yet
        delete payload.pin
        delete payload.is_default
        delete payload.geo_lat
        delete payload.geo_lng
        delete payload.landmark
        await supabase.from('addresses').upsert(payload)
      }
    } else {
      const { error } = await supabase.from('addresses').insert(payload)
      if (error) {
        // Fallback without extended columns
        delete payload.pin
        delete payload.is_default
        delete payload.geo_lat
        delete payload.geo_lng
        delete payload.landmark
        await supabase.from('addresses').insert(payload)
      }
    }
  } catch (err) {
    console.warn('saveAddress failed:', err)
  }
}

export async function deleteAddress(id: number): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('addresses').delete().eq('id', id)
  } catch {}
}

export async function validateCoupon(code: string, orderTotal: number): Promise<Coupon | null> {
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) return null



  // 1. Try Supabase RPC if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('validate_coupon', { p_code: cleanCode, p_order_total: orderTotal })
      if (!error && data && Array.isArray(data) && data[0]?.valid) {
        const res = data[0]
        return {
          code: cleanCode,
          discount_type: 'flat',
          discount_value: Number(res.discount),
          min_order: 0,
          valid: true,
          discount: Number(res.discount),
          message: res.message || `✅ Coupon applied: ₹${res.discount} off`,
        }
      }
    } catch {}

    // 2. Direct table fallback
    try {
      const { data: row, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle()

      if (!error && row) {
        const isValid = row.valid !== false && row.active !== false
        const expiry = row.expires_at || row.valid_until
        if (!isValid) return null
        if (expiry && new Date(expiry).getTime() < Date.now()) {
          return null
        }
        if (orderTotal < (row.min_order || 0)) {
          return null
        }
        const discVal = Number(row.discount_value) || 0
        const computedDiscount =
          row.discount_type === 'percent'
            ? Math.round((orderTotal * discVal) / 100)
            : discVal

        return {
          code: cleanCode,
          discount_type: row.discount_type,
          discount_value: discVal,
          min_order: row.min_order || 0,
          valid: true,
          active: true,
          expires_at: expiry || undefined,
          valid_until: expiry || undefined,
          discount: computedDiscount,
          message: `✅ Coupon applied: ₹${computedDiscount} off`,
        }
      }
    } catch {}
  }

  // 3. LocalStorage fallback
  try {
    const localCoupons = JSON.parse(localStorage.getItem('gv_coupons') || '{}')
    const match = localCoupons[cleanCode]
    if (match) {
      const isValid = match.valid !== false && match.active !== false
      const expiry = match.expires_at || match.valid_until
      if (!isValid) return null
      if (expiry && new Date(expiry).getTime() < Date.now()) {
        return null
      }
      if (orderTotal < (match.min_order || 0)) {
        return null
      }
      const discVal = Number(match.discount_value) || 0
      const computedDiscount =
        match.discount_type === 'percent'
          ? Math.round((orderTotal * discVal) / 100)
          : discVal
      return {
        code: cleanCode,
        discount_type: match.discount_type,
        discount_value: discVal,
        min_order: match.min_order || 0,
        valid: true,
        active: true,
        expires_at: expiry || undefined,
        valid_until: expiry || undefined,
        discount: computedDiscount,
        message: `✅ Coupon applied: ₹${computedDiscount} off`,
      }
    }
  } catch {}

  return null
}

export async function createCoupon(
  coupon: {
    code: string
    discount_type: 'flat' | 'percent'
    discount_value: number
    min_order: number
    valid: boolean
    expires_at?: string
  },
  staff: StaffCredentials,
): Promise<boolean> {
  const cleanCode = coupon.code.trim().toUpperCase()
  const payload: Record<string, unknown> = {
    ...coupon,
    code: cleanCode,
    valid: coupon.valid ?? true,
    active: coupon.valid ?? true,
    expires_at: coupon.expires_at || null,
    valid_until: coupon.expires_at || null,
    created_at: new Date().toISOString(),
  }

  try {
    const localCoupons = JSON.parse(localStorage.getItem('gv_coupons') || '{}')
    localCoupons[cleanCode] = payload
    localStorage.setItem('gv_coupons', JSON.stringify(localCoupons))
  } catch {}

  if (!supabase) return true

  const { data, error } = await supabase.rpc('save_coupon_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_code: cleanCode,
    p_discount_type: coupon.discount_type,
    p_discount_value: coupon.discount_value,
    p_min_order: coupon.min_order,
    p_valid: coupon.valid ?? true,
    p_expires_at: coupon.expires_at || null,
  })
  if (error) throw new Error(error.message || 'Failed to save coupon')
  const result = data as { success?: boolean } | null
  return result?.success !== false
}

export async function saveDailyReport(report: DailyReport): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase.from('daily_reports').upsert(report, { onConflict: 'report_date' })
    if (error) {
      // Fallback for minimal legacy daily_reports schema
      await supabase.from('daily_reports').upsert({
        report_date: report.report_date,
        total_orders: report.total_orders,
        revenue: report.total_revenue,
      }, { onConflict: 'report_date' })
    }
  } catch {}
}

export async function fetchDailyReport(date: string): Promise<DailyReport | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('daily_reports').select('*').eq('report_date', date).maybeSingle()
    if (error || !data) return null
    return {
      id: data.id,
      report_date: data.report_date,
      total_orders: Number(data.total_orders || 0),
      total_revenue: Number(data.total_revenue ?? data.revenue ?? 0),
      total_cancelled: Number(data.total_cancelled || 0),
      mandi_cost: Number(data.mandi_cost || 0),
      delivery_cost: Number(data.delivery_cost || 0),
      profit: Number(data.profit || 0),
    }
  } catch { return null }
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.from('delivery_zones').select('*').eq('active', true)
    if (error) return []
    return (data || []).map((row: any) => ({
      pin_prefix: String(row.pin_prefix),
      zone: String(row.zone || row.name || 'standard'),
      fee: Number(row.fee || 40),
      eta_hours: String(row.eta_hours || '12-24 hours'),
    }))
  } catch { return [] }
}

// ── Persistent Notifications ────────────────────────────────────────────────
export async function fetchNotificationsApi(userId?: string): Promise<AppNotification[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error || !data) return []

    return (data as any[])
      .filter((n) => !n.user_id || n.user_id === 'all' || (userId && n.user_id === userId))
      .map((n) => ({
        id: String(n.id || n.title),
        userId: n.user_id || 'all',
        title: n.title || '',
        message: n.message || '',
        sender: n.sender || 'Store Support',
        createdAt: n.created_at || new Date().toISOString(),
      }))
  } catch {
    return []
  }
}

export async function saveNotificationApi(notif: AppNotification): Promise<void> {
  if (!supabase) return
  try {
    const row = {
      id: notif.id,
      user_id: notif.userId || 'all',
      title: notif.title,
      message: notif.message,
      sender: notif.sender,
      created_at: notif.createdAt || new Date().toISOString(),
    }
    await supabase.from('notifications').upsert(row)
  } catch {}
}

export async function cleanupOldNotificationsApi(daysOld = 30): Promise<number> {
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffTime).toISOString()
  if (!supabase) return 0
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoffIso)
    if (!error) return 1
  } catch (err) {
    console.warn('cleanupOldNotificationsApi error:', err)
  }
  return 0
}

// ── Realtime Order Messages / Chat ──────────────────────────────────────────
export async function fetchOrderMessagesApi(orderId: string): Promise<ChatMessage[]> {
  if (!supabase || !orderId) return []
  try {
    const { data, error } = await supabase
      .from('order_messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return (data as any[]).map((r) => ({
      id: String(r.id),
      orderId: r.order_id,
      sender: r.sender_role as 'customer' | 'seller',
      text: r.message || r.text || '',
      time: r.created_at
        ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

export async function sendOrderMessageApi(
  orderId: string,
  sender: 'customer' | 'seller',
  text: string
): Promise<ChatMessage> {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const newMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderId,
    sender,
    text: text.trim(),
    time,
    createdAt: new Date().toISOString(),
  }

  // Cache locally
  try {
    const storageKey = `greenvest_chat_${orderId}`
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
    localStorage.setItem(storageKey, JSON.stringify([...existing, newMsg]))
  } catch {}

  if (!supabase) return newMsg

  try {
    await supabase.from('order_messages').insert({
      id: newMsg.id,
      order_id: orderId,
      sender_role: sender,
      message: newMsg.text,
      created_at: newMsg.createdAt,
    })
  } catch {}

  return newMsg
}

// ── Customer Product Reviews ──────────────────────────────────────────────────

export async function fetchProductReviewsApi(productId?: string): Promise<ProductReview[]> {
  const localKey = productId ? `greenvest_reviews_${productId}` : 'greenvest_all_reviews'
  const fallbackRaw: ProductReview[] = JSON.parse(localStorage.getItem(localKey) || '[]')
  // Filter out any legacy seed reviews from localStorage cache
  const fallback = fallbackRaw.filter((r) => !r.id.startsWith('rev-seed-'))

  if (!supabase) return fallback

  try {
    let query = supabase.from('product_reviews').select('*').order('created_at', { ascending: false })
    if (productId) {
      query = query.eq('product_id', productId)
    }
    const { data, error } = await query
    if (error || !data) return fallback

    const mapped: ProductReview[] = data.map((r: any) => ({
      id: r.id,
      productId: r.product_id,
      userId: r.user_id || undefined,
      userName: r.user_name,
      rating: Number(r.rating) || 5,
      comment: r.comment || '',
      tag: r.tag || undefined,
      isVerifiedBuyer: r.is_verified_buyer ?? true,
      createdAt: r.created_at,
    }))

    localStorage.setItem(localKey, JSON.stringify(mapped))
    return mapped
  } catch {
    return fallback
  }
}

export async function saveProductReviewApi(review: Omit<ProductReview, 'id' | 'createdAt'>): Promise<ProductReview> {
  const newReview: ProductReview = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...review,
    createdAt: new Date().toISOString(),
  }

  // Save to local cache
  try {
    const key = `greenvest_reviews_${review.productId}`
    const existing: ProductReview[] = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify([newReview, ...existing]))
  } catch {}

  if (!supabase) return newReview

  try {
    await supabase.from('product_reviews').insert({
      id: newReview.id,
      product_id: newReview.productId,
      user_id: newReview.userId || null,
      user_name: newReview.userName,
      rating: newReview.rating,
      comment: newReview.comment,
      tag: newReview.tag || null,
      is_verified_buyer: newReview.isVerifiedBuyer ?? true,
      created_at: newReview.createdAt,
    })
  } catch (err) {
    console.warn('saveProductReviewApi supabase error:', err)
  }

  return newReview
}

// ── Promotional Deals API ───────────────────────────────────────────────────

export async function fetchPromotionalDealsApi(): Promise<PromotionalDeal[]> {
  const localKey = 'gv_promotional_deals_v1'
  const fallbackRaw: PromotionalDeal[] = JSON.parse(localStorage.getItem(localKey) || '[]')
  // Filter out any legacy demo deals from localStorage cache
  const fallback = fallbackRaw.filter(
    (d) => d.id !== 'deal-first50' && d.id !== 'deal-fresh10' && d.id !== 'deal-mandi20'
  )

  if (!supabase) return fallback

  try {
    const { data, error } = await supabase
      .from('promotional_deals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !data) return fallback
    const mapped = (data as PromotionalDealRow[]).map(mapDeal)
    localStorage.setItem(localKey, JSON.stringify(mapped))
    return mapped
  } catch {
    return fallback
  }
}

export async function savePromotionalDealApi(deal: PromotionalDeal): Promise<PromotionalDeal> {
  const localKey = 'gv_promotional_deals_v1'
  try {
    const existing: PromotionalDeal[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const idx = existing.findIndex((d) => d.id === deal.id)
    if (idx >= 0) existing[idx] = deal
    else existing.unshift(deal)
    localStorage.setItem(localKey, JSON.stringify(existing))
  } catch {}

  if (!supabase) return deal

  try {
    const row = dealToRow(deal)
    await supabase.from('promotional_deals').upsert(row)
  } catch (err) {
    console.warn('savePromotionalDealApi error:', err)
  }

  return deal
}

export async function deletePromotionalDealApi(dealId: string): Promise<void> {
  const localKey = 'gv_promotional_deals_v1'
  try {
    const existing: PromotionalDeal[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const filtered = existing.filter((d) => d.id !== dealId)
    localStorage.setItem(localKey, JSON.stringify(filtered))
  } catch {}

  if (!supabase) return

  try {
    await supabase.from('promotional_deals').delete().eq('id', dealId)
  } catch (err) {
    console.warn('deletePromotionalDealApi error:', err)
  }
}

export async function fetchSupportMessagesApi(userId?: string): Promise<import('../types').SupportMessage[]> {
  const localKey = 'gv_support_messages'
  let cached: import('../types').SupportMessage[] = []
  try {
    cached = JSON.parse(localStorage.getItem(localKey) || '[]')
  } catch {}

  if (!supabase) return cached

  try {
    // 🔒 Security: scope to the specific user's thread unless staff (no userId passed)
    let query = supabase
      .from('support_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
    if (userId) {
      query = query.eq('user_id', userId)
    }
    const { data, error } = await query

    if (!error && data) {
      const mapped: import('../types').SupportMessage[] = data.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name || 'Customer',
        userPhone: r.user_phone,
        senderRole: r.sender_role || 'customer',
        message: r.message || '',
        orderId: r.order_id,
        status: r.status || 'open',
        createdAt: r.created_at || new Date().toISOString(),
      }))
      try {
        localStorage.setItem(localKey, JSON.stringify(mapped))
      } catch {}
      return mapped
    }
  } catch (err) {
    console.warn('fetchSupportMessagesApi error:', err)
  }

  return cached
}

export async function sendSupportMessageApi(msg: import('../types').SupportMessage): Promise<import('../types').SupportMessage> {
  const localKey = 'gv_support_messages'
  try {
    const existing: import('../types').SupportMessage[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    existing.push(msg)
    localStorage.setItem(localKey, JSON.stringify(existing))
  } catch {}

  if (!supabase) return msg

  try {
    await supabase.from('support_messages').insert({
      id: msg.id,
      user_id: msg.userId,
      user_name: msg.userName,
      user_phone: msg.userPhone,
      sender_role: msg.senderRole,
      message: msg.message,
      order_id: msg.orderId,
      status: msg.status || 'open',
      created_at: msg.createdAt,
    })
  } catch (err) {
    console.warn('sendSupportMessageApi error:', err)
  }

  return msg
}

export async function resolveSupportTicketApi(userId: string): Promise<void> {
  const localKey = 'gv_support_messages'
  try {
    const existing: import('../types').SupportMessage[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const updated = existing.map(m => m.userId === userId ? { ...m, status: 'resolved' as const } : m)
    localStorage.setItem(localKey, JSON.stringify(updated))
  } catch {}

  if (!supabase) return

  try {
    await supabase.from('support_messages').update({ status: 'resolved' }).eq('user_id', userId)
  } catch (err) {
    console.warn('resolveSupportTicketApi error:', err)
  }
}

export async function reopenSupportTicketApi(userId: string): Promise<void> {
  const localKey = 'gv_support_messages'
  try {
    const existing: import('../types').SupportMessage[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const updated = existing.map(m => m.userId === userId ? { ...m, status: 'open' as const } : m)
    localStorage.setItem(localKey, JSON.stringify(updated))
  } catch {}

  if (!supabase) return

  try {
    await supabase.from('support_messages').update({ status: 'open' }).eq('user_id', userId)
  } catch (err) {
    console.warn('reopenSupportTicketApi error:', err)
  }
}

export async function deleteSupportThreadApi(userId: string): Promise<void> {
  const localKey = 'gv_support_messages'
  try {
    const existing: import('../types').SupportMessage[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const filtered = existing.filter(m => m.userId !== userId)
    localStorage.setItem(localKey, JSON.stringify(filtered))
  } catch {}

  if (!supabase) return

  try {
    await supabase.from('support_messages').delete().eq('user_id', userId)
  } catch (err) {
    console.warn('deleteSupportThreadApi error:', err)
  }
}

export async function cleanupOldSupportMessagesApi(daysOld = 7): Promise<number> {
  const localKey = 'gv_support_messages'
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffTime).toISOString()

  let purgedCount = 0
  try {
    const existing: import('../types').SupportMessage[] = JSON.parse(localStorage.getItem(localKey) || '[]')
    const active = existing.filter(m => {
      const isOldResolved = m.status === 'resolved' && new Date(m.createdAt).getTime() < cutoffTime
      return !isOldResolved
    })
    purgedCount = existing.length - active.length
    localStorage.setItem(localKey, JSON.stringify(active))
  } catch {}

  if (!supabase) return purgedCount

  try {
    await supabase
      .from('support_messages')
      .delete()
      .eq('status', 'resolved')
      .lt('created_at', cutoffIso)
  } catch (err) {
    console.warn('cleanupOldSupportMessagesApi error:', err)
  }

  return purgedCount
}

export async function deleteUserProfileApi(
  userId: string,
  staff: StaffCredentials,
  _email?: string,
  _phone?: string,
): Promise<void> {
  const client = requireClient()
  const { data, error } = await client.rpc('delete_user_admin', {
    p_caller_id: staff.callerId,
    p_caller_pin: staff.callerPin,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message || 'Failed to delete user')
  const result = data as { ok?: boolean; error?: string } | null
  if (result?.ok === false) throw new Error(result.error || 'Failed to delete user')
}

