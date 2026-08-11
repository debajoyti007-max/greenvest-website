import type {
  Address,
  Coupon,
  DailyReport,
  DeliveryZone,
  DeliverySlot,
  Grade,
  Order,
  OrderItem,
  OrderStatus,
  Product,
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
  in_stock: boolean
  archived?: boolean | null
  stock_qty?: number | null
  season?: string | null
  category: string
  unit: string
  image_url: string | null
}

type OrderRow = {
  id: string
  user_id: string
  user_name: string
  user_email: string
  subtotal: number
  delivery_fee: number
  total: number
  advance_amount: number
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
  product_id: string
  name: string
  emoji: string
  grade: Grade
  qty: number
  unit_price: number
}

type ProfileRow = {
  id: string
  email: string
  name: string
  role: Role
  phone?: string | null
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
    inStock: row.in_stock,
    archived: Boolean(row.archived),
    stockQty: row.stock_qty == null ? undefined : Number(row.stock_qty),
    season: ['all', 'summer', 'winter', 'rainy'].includes(season) ? season : 'all',
    category: row.category,
    unit: row.unit,
    imageUrl: row.image_url || undefined,
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
    in_stock: p.inStock,
    archived: Boolean(p.archived),
    stock_qty: p.stockQty ?? null,
    season: p.season || 'all',
    category: p.category,
    unit: p.unit,
    image_url: p.imageUrl || null,
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
    total: Number(row.total),
    advanceAmount: Number(row.advance_amount),
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

export async function updateProfileRole(userId: string, role: Role, email?: string): Promise<void> {
  const client = requireClient()
  try {
    await client.from('profiles').update({ role }).eq('id', userId)
  } catch {
    /* ignore */
  }
  if (email) {
    try {
      await client.from('profiles').update({ role }).eq('email', email.toLowerCase())
    } catch {
      /* ignore */
    }
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const client = requireClient()
  const { data, error } = await client.from('products').select('*').order('name')
  if (error) throw error
  return (data as ProductRow[]).map(mapProduct)
}

export async function upsertProduct(product: Product): Promise<Product> {
  const client = requireClient()
  const row = productToRow(product)
  let { data, error } = await client.from('products').upsert(row).select('*').single()
  if (error && /(archived|stock_qty|season)/i.test(error.message)) {
    const { archived: _a, stock_qty: _s, season: _se, ...rest } = row
    ;({ data, error } = await client.from('products').upsert(rest).select('*').single())
  }
  if (error) throw error
  return mapProduct(data as ProductRow)
}

export async function insertProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return upsertProduct({ ...product, id })
}

export async function deleteProductApi(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('products').delete().eq('id', id)
  if (error) throw error
}

export async function setAllProductsInStock(): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('products').update({ in_stock: true }).neq('id', '')
  if (error) throw error
}

export async function fetchOrders(): Promise<Order[]> {
  const client = requireClient()

  const { data, error } = await client
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as OrderRow[]).map(mapOrder)
}

export async function createOrder(order: Order): Promise<Order> {
  const client = requireClient()
  const payload: Record<string, unknown> = {
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
  if (order.deliverySlot) payload.delivery_slot = order.deliverySlot
  if (order.geoLat != null) payload.geo_lat = order.geoLat
  if (order.geoLng != null) payload.geo_lng = order.geoLng

  let { error: orderError } = await client.from('orders').insert(payload)
  if (orderError && /delivery_slot|geo_lat|geo_lng/i.test(orderError.message)) {
    delete payload.delivery_slot
    delete payload.geo_lat
    delete payload.geo_lng
    ;({ error: orderError } = await client.from('orders').insert(payload))
  }
  if (orderError) throw orderError

  const items = order.items.map((it) => ({
    order_id: order.id,
    product_id: it.productId,
    name: it.name,
    emoji: it.emoji,
    grade: it.grade,
    qty: it.qty,
    unit_price: it.unitPrice,
  }))
  const { error: itemsError } = await client.from('order_items').insert(items)
  if (itemsError) {
    await client.from('orders').delete().eq('id', order.id)
    throw itemsError
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
  const { error } = await client.from('orders').delete().eq('id', id)
  if (error) throw error
}


export function subscribeOrders(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
    .subscribe((status) => {
      if (status === 'TIMED_OUT' || status === 'CLOSED') {
        setTimeout(() => void channel.subscribe(), 2000)
      }
    })
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
    .subscribe((status) => {
      if (status === 'TIMED_OUT' || status === 'CLOSED') {
        setTimeout(() => void channel.subscribe(), 2000)
      }
    })
  return () => {
    void client.removeChannel(channel)
  }
}


export async function fetchAddresses(userId: string): Promise<Address[]> {
  if (!supabase) return []
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
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('validate_coupon', { code_val: code, total_val: orderTotal })
    if (error || !data) return null
    return data as Coupon
  } catch { return null }
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
