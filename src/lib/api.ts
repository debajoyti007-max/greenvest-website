import type {
  Address,
  AppNotification,
  ChatMessage,
  Coupon,
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
import { isSupabaseConfigured, supabase } from './supabase'

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
  utr: string
  utr_verified: boolean
  status: OrderStatus
  address: string
  phone: string
  pin: string
  delivery_slot?: string | null
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
  phone?: string | null
  isBlocked?: boolean | null
  pin?: string | null
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

function productToRow(p: Product | (Omit<Product, 'id'> & { id: string })) {
  return {
    id: p.id,
    emoji: p.emoji,
    name: p.name,
    bn_name: p.bnName,
    p_a: p.pA,
    p_b: p.pB,
    p_c: p.pC,
    mrp: p.mrp || null,
    available_grades: p.availableGrades && p.availableGrades.length > 0 ? p.availableGrades : ['A', 'B', 'C'],
    in_stock: p.inStock,
    archived: Boolean(p.archived),
    stock_qty: p.stockQty ?? null,
    season: p.season || 'all',
    category: p.category,
    unit: p.unit,
    image_url: p.imageUrl || null,
    sold_as: p.soldAs || null,
    gram_options: p.gramOptions || null,
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
    paymentType: row.payment_type === 'full' ? 'full' : 'advance',
    utr: row.utr,
    utrVerified: row.utr_verified,
    status: row.status,
    address: row.address,
    phone: row.phone,
    pin: row.pin,
    deliverySlot: slot === 'morning' || slot === 'evening' ? (slot as DeliverySlot) : undefined,
    geoLat: row.geo_lat ?? undefined,
    geoLng: row.geo_lng ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProfile(row: ProfileRow): User {
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
    phone: derivedPhone || undefined,
    isBlocked: row.isBlocked ?? false,
    createdAt: row.created_at,
  }
}

export async function fetchProfile(userId: string): Promise<User | null> {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? mapProfile(data as ProfileRow) : null
}

export async function fetchProfiles(): Promise<User[]> {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data as ProfileRow[]).map(mapProfile)
}

export async function checkAccountExistsByEmail(email: string): Promise<User | null> {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('*').eq('email', email.toLowerCase()).maybeSingle()
  if (error) return null
  return data ? mapProfile(data as ProfileRow) : null
}

async function updateProfileField(
  userId: string,
  email: string | undefined,
  phone: string | undefined,
  fields: Record<string, unknown>
): Promise<void> {
  const client = requireClient()
  const normalizedFields: Record<string, unknown> = { ...fields }
  if ('isBlocked' in fields) {
    normalizedFields.is_blocked = fields.isBlocked
    delete normalizedFields.isBlocked
  }

  // 1. Try atomic SECURITY DEFINER RPC (bypasses all RLS restrictions)
  if (normalizedFields.role && typeof normalizedFields.role === 'string') {
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('update_user_role_admin', {
        p_user_id: userId,
        p_role: normalizedFields.role,
      })
      if (!rpcErr && rpcData) return
    } catch {}
  }

  // 2. Try by exact ID
  if (userId) {
    const { data: idRows, error: errId } = await client.from('profiles').update(normalizedFields).eq('id', userId).select()
    if (!errId && idRows && idRows.length > 0) return
  }

  // 3. Try by email if provided
  if (email && email.trim()) {
    const { data: emailRows, error: errEmail } = await client.from('profiles').update(normalizedFields).eq('email', email.trim().toLowerCase()).select()
    if (!errEmail && emailRows && emailRows.length > 0) return
  }

  // 4. Try by phone or formatted phone email (e.g. 8350087877@greenvest.shop)
  const rawIdentifier = phone || email || userId
  if (rawIdentifier) {
    const digits = rawIdentifier.replace(/\D/g, '')
    if (digits.length >= 10) {
      const phoneEmail = `${digits.slice(-10)}@greenvest.shop`
      const { data: peRows, error: errPhoneEmail } = await client.from('profiles').update(normalizedFields).eq('email', phoneEmail).select()
      if (!errPhoneEmail && peRows && peRows.length > 0) return

      const { data: pRows, error: errPhone } = await client.from('profiles').update(normalizedFields).eq('phone', digits.slice(-10)).select()
      if (!errPhone && pRows && pRows.length > 0) return
    }
  }

  // 5. Fallback: auto-create/upsert missing profile row in database
  const targetEmail = (email && email.trim()) ? email.trim().toLowerCase() : (phone ? `${phone.replace(/\D/g, '').slice(-10)}@greenvest.shop` : `${userId}@greenvest.shop`)
  const targetPhone = phone ? phone.replace(/\D/g, '').slice(-10) : (userId.replace(/\D/g, '').length >= 10 ? userId.replace(/\D/g, '').slice(-10) : undefined)

  const payload: Record<string, unknown> = {
    id: userId || crypto.randomUUID(),
    email: targetEmail,
    name: targetEmail.split('@')[0],
    role: 'customer',
    created_at: new Date().toISOString(),
    ...normalizedFields,
  }
  if (targetPhone) payload.phone = targetPhone

  const { error: upsertErr } = await client.from('profiles').upsert(payload, { onConflict: 'id' })
  if (upsertErr) {
    console.error('updateProfileField upsert error:', upsertErr)
    throw new Error(upsertErr.message || 'Failed to save profile to database')
  }
}

export async function updateProfileRole(userId: string, role: Role, email?: string, phone?: string): Promise<void> {
  return updateProfileField(userId, email, phone, { role })
}

export async function updateProfilePin(userId: string, pin: string, email?: string, phone?: string): Promise<void> {
  return updateProfileField(userId, email, phone, { pin })
}

export async function updateProfileBlocked(userId: string, isBlocked: boolean, email?: string, phone?: string): Promise<void> {
  return updateProfileField(userId, email, phone, { isBlocked })
}

export async function updateProfileDetails(userId: string, details: { name?: string; phone?: string }, email?: string, phone?: string): Promise<void> {
  return updateProfileField(userId, email, phone, details)
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

export async function upsertProduct(product: Product): Promise<Product> {
  invalidateProductCache()
  const client = requireClient()
  const row = productToRow(product)

  // 1. Try atomic SECURITY DEFINER RPC (bypasses all RLS restrictions)
  try {
    const { data: rpcData, error: rpcErr } = await client.rpc('save_product_admin', {
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
    })
    if (!rpcErr && rpcData) {
      return mapProduct(rpcData as ProductRow)
    }
  } catch {}

  // 2. Direct update for existing products
  if (product.id) {
    let { data: updated, error: updateErr } = await client
      .from('products')
      .update(row)
      .eq('id', product.id)
      .select('*')
      .maybeSingle()

    if (updateErr && /(archived|stock_qty|season|sold_as|gram_options)/i.test(updateErr.message)) {
      const { archived: _a, stock_qty: _s, season: _se, sold_as: _so, gram_options: _go, ...rest } = row
      ;({ data: updated, error: updateErr } = await client
        .from('products')
        .update(rest)
        .eq('id', product.id)
        .select('*')
        .maybeSingle())
    }

    if (!updateErr && updated) {
      return mapProduct(updated as ProductRow)
    }
  }

  // 3. Fallback to upsert
  let { data, error } = await client.from('products').upsert(row).select('*').single()
  if (error && /(archived|stock_qty|season|sold_as|gram_options)/i.test(error.message)) {
    const { archived: _a, stock_qty: _s, season: _se, sold_as: _so, gram_options: _go, ...rest } = row
    ;({ data, error } = await client.from('products').upsert(rest).select('*').single())
  }
  if (error) throw error
  return mapProduct(data as ProductRow)
}

export async function insertProduct(product: Omit<Product, 'id'>): Promise<Product> {
  invalidateProductCache()
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return upsertProduct({ ...product, id })
}

export async function deleteProductApi(id: string): Promise<void> {
  invalidateProductCache()
  const client = requireClient()
  const { error } = await client.from('products').delete().eq('id', id)
  if (error) {
    console.error('deleteProductApi error:', error)
    throw new Error(error.message || 'Failed to delete product from database')
  }
}

export async function setAllProductsInStock(): Promise<void> {
  invalidateProductCache()
  const client = requireClient()
  const { error } = await client.from('products').update({ in_stock: true }).neq('archived', true)
  if (error) throw error
}


export async function fetchOrders(
  userRole?: string,
  userId?: string,
  userEmail?: string,
  userPhone?: string,
  limitCount = 100,
): Promise<Order[]> {
  const client = requireClient()
  const isStaff = userRole === 'seller' || userRole === 'admin' || userRole === 'rider'

  // Privacy isolation: non-staff users must provide an identifier
  if (!isStaff && !userId && !userEmail && !userPhone) {
    return []
  }

  let ordersData: OrderRow[] = []
  let itemsData: OrderItemRow[] = []

  try {
    let query = client
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(limitCount)

    if (!isStaff) {
      const filters: string[] = []
      if (userId) filters.push(`user_id.eq.${userId}`)
      if (userEmail) filters.push(`user_email.eq.${userEmail.toLowerCase()}`)
      if (userPhone) filters.push(`phone.eq.${userPhone.replace(/\D/g, '')}`)
      if (filters.length > 0) {
        query = query.or(filters.join(','))
      }
    }
    const { data, error } = await query
    if (!error && data) {
      return (data as OrderRow[]).map(mapOrder)
    }
  } catch (err) {
    console.warn('Nested orders query fallback triggered:', err)
  }

  // Fallback: 2-step separate query if nested select failed
  try {
    let ordersQuery = client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limitCount)

    if (!isStaff) {
      const filters: string[] = []
      if (userId) filters.push(`user_id.eq.${userId}`)
      if (userEmail) filters.push(`user_email.eq.${userEmail.toLowerCase()}`)
      if (userPhone) filters.push(`phone.eq.${userPhone.replace(/\D/g, '')}`)
      if (filters.length > 0) {
        ordersQuery = ordersQuery.or(filters.join(','))
      }
    }
    const { data: ords, error: ordErr } = await ordersQuery
    if (ordErr || !ords) throw ordErr || new Error('No orders found')
    ordersData = ords as OrderRow[]

    const orderIds = ordersData.map((o) => o.id)
    if (orderIds.length > 0) {
      const { data: itms } = await client.from('order_items').select('*').in('order_id', orderIds)
      if (itms) itemsData = itms as OrderItemRow[]
    }
  } catch (err) {
    console.error('fetchOrders fallback error:', err)
    return []
  }

  const itemsByOrderId = new Map<string, OrderItemRow[]>()
  itemsData.forEach((it) => {
    if (it.order_id) {
      const arr = itemsByOrderId.get(it.order_id) || []
      arr.push(it)
      itemsByOrderId.set(it.order_id, arr)
    }
  })

  return ordersData.map((ord) => {
    const rowWithItems: OrderRow = {
      ...ord,
      order_items: itemsByOrderId.get(ord.id) || [],
    }
    return mapOrder(rowWithItems)
  })
}

export async function fetchOrderByPublicQuery(rawQuery: string): Promise<Order | null> {
  if (!supabase) return null

  const cleaned = (rawQuery || '').trim().toLowerCase().replace(/^#/, '')
  const digitsOnly = cleaned.replace(/\D/g, '')
  if (!cleaned) return null

  try {
    let query = supabase.from('orders').select('*, order_items(*)')
    const filters: string[] = [`id.eq.${cleaned}`, `id.ilike.%${cleaned}`]
    if (digitsOnly.length >= 10) {
      filters.push(`phone.eq.${digitsOnly.slice(-10)}`)
    }
    const { data, error } = await query.or(filters.join(',')).limit(1).maybeSingle()
    if (!error && data) {
      return mapOrder(data as OrderRow)
    }
  } catch (err) {
    console.debug('fetchOrderByPublicQuery error:', err)
  }
  return null
}

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

export async function createOrder(order: Order): Promise<Order> {
  const client = requireClient()

  // Auto-ensure user profile exists — use INSERT with ignoreDuplicates so we
  // NEVER overwrite an existing role (rider/seller would get reset to 'customer'!)
  try {
    await client.from('profiles').insert({
      id: order.userId,
      email: order.userEmail || `${order.userId}@greenvest.shop`,
      name: order.userName || 'Customer',
      role: 'customer',
      phone: order.phone ? order.phone.replace(/\D/g, '').slice(-10) : undefined,
      created_at: new Date().toISOString(),
    })
  } catch (profErr) {
    console.debug('Profile already exists, role preserved:', profErr)
  }

  // Also backfill phone on existing profile if provided in order
  if (order.phone && order.userId) {
    const cleanPh = order.phone.replace(/\D/g, '').slice(-10)
    if (cleanPh.length >= 10) {
      void client.from('profiles').update({ phone: cleanPh }).eq('id', order.userId)
    }
  }

  // Attempt atomic server-side RPC transaction first
  try {
    const { data: atomicRes, error: rpcErr } = await client.rpc('create_order_atomic', {
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
    })

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
    console.debug('Atomic RPC fallback to direct insert:', rpcEx)
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
    utr: order.utr,
    utr_verified: order.utrVerified,
    status: order.status,
    address: order.address,
    phone: order.phone,
    pin: order.pin,
    delivery_slot: order.deliverySlot || null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  }

  if (order.geoLat != null) payload.geo_lat = order.geoLat
  if (order.geoLng != null) payload.geo_lng = order.geoLng

  let { error: orderError } = await client.from('orders').insert(payload)
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
    ;({ error: orderError } = await client.from('orders').insert(cleanPayload))
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
  let { error: itemsError } = await client.from('order_items').insert(items)
  if (itemsError) {
    // Fallback without weight columns if old schema
    const fallbackItems = items.map(({ weight_multiplier: _wm, weight_label: _wl, ...rest }) => rest)
    ;({ error: itemsError } = await client.from('order_items').insert(fallbackItems))
  }
  if (itemsError) {
    console.error('createOrder → order_items insert failed:', itemsError)
    await client.from('orders').delete().eq('id', order.id)
    throw new Error(itemsError.message || 'Order items insert failed')
  }

  return order
}

export async function updateOrderStatusApi(id: string, status: OrderStatus): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function bulkUpdateOrderStatusApi(ids: string[], status: OrderStatus): Promise<void> {
  if (ids.length === 0) return
  const client = requireClient()
  const { error } = await client
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
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

export async function verifyUtrApi(id: string, verified: boolean): Promise<void> {
  const client = requireClient()
  const patch: Record<string, unknown> = {
    utr_verified: verified,
    updated_at: new Date().toISOString(),
  }
  if (verified) patch.status = 'confirmed'
  const { error } = await client.from('orders').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteOrderApi(id: string): Promise<void> {
  const client = requireClient()
  // Delete order_items first to avoid foreign key violation
  await client.from('order_items').delete().eq('order_id', id)
  const { error } = await client.from('orders').delete().eq('id', id)
  if (error) {
    console.error('deleteOrderApi error:', error)
    throw new Error(error.message || 'Failed to delete order from database')
  }
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


export async function fetchAddresses(userId: string): Promise<Address[]> {
  if (!supabase || !userId) return []
  try {
    const { data, error } = await supabase.from('addresses').select('*').eq('user_id', userId)
    if (error) return []
    return data || []
  } catch { return [] }
}

export async function saveAddress(addr: Address): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('addresses').upsert(addr)
  } catch {}
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

export async function createCoupon(coupon: {
  code: string
  discount_type: 'flat' | 'percent'
  discount_value: number
  min_order: number
  valid: boolean
  expires_at?: string
}): Promise<boolean> {
  const cleanCode = coupon.code.trim().toUpperCase()
  const payload: any = {
    ...coupon,
    code: cleanCode,
    valid: coupon.valid ?? true,
    active: coupon.valid ?? true,
    expires_at: coupon.expires_at || null,
    valid_until: coupon.expires_at || null,
    created_at: new Date().toISOString(),
  }

  // 1. Cache locally immediately (guarantees offline/client validation)
  try {
    const localCoupons = JSON.parse(localStorage.getItem('gv_coupons') || '{}')
    localCoupons[cleanCode] = payload
    localStorage.setItem('gv_coupons', JSON.stringify(localCoupons))
  } catch {}

  if (!supabase) return true

  // 2. Try SECURITY DEFINER RPC (bypasses all client RLS restrictions)
  try {
    const { error: rpcErr } = await supabase.rpc('save_coupon_admin', {
      p_code: cleanCode,
      p_discount_type: coupon.discount_type,
      p_discount_value: coupon.discount_value,
      p_min_order: coupon.min_order,
      p_valid: coupon.valid ?? true,
      p_expires_at: coupon.expires_at || null,
    })
    if (!rpcErr) return true
  } catch {}

  // 3. Fallback to direct table upsert
  try {
    let { error } = await supabase.from('coupons').upsert(payload)
    if (error) {
      // Retry with alternative column mapping
      const altPayload = {
        code: cleanCode,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order: coupon.min_order,
        active: coupon.valid,
        valid_until: coupon.expires_at || null,
      }
      ;({ error } = await supabase.from('coupons').upsert(altPayload))
    }
    return !error
  } catch {
    return true // Local cache succeeded
  }
}

export async function saveDailyReport(report: DailyReport): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('daily_reports').upsert(report, { onConflict: 'report_date' })
  } catch {}
}

export async function fetchDailyReport(date: string): Promise<DailyReport | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('daily_reports').select('*').eq('report_date', date).maybeSingle()
    if (error) return null
    return data as DailyReport
  } catch { return null }
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.from('delivery_zones').select('*').eq('active', true)
    if (error) return []
    return data || []
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
        sender: n.sender || 'GreenVest',
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
  const fallback = JSON.parse(localStorage.getItem(localKey) || '[]')

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
  const fallback = JSON.parse(localStorage.getItem(localKey) || '[]')

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
