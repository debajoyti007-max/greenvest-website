import type { Grade, Order, OrderItem, OrderStatus, Product, Role, User } from '../types'
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
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    bnName: repairBnName(row.id, row.name, row.bn_name),
    pA: Number(row.p_a),
    pB: Number(row.p_b),
    pC: Number(row.p_c),
    inStock: row.in_stock,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProfile(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    password: '',
    name: row.name,
    role: row.role,
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

export async function updateProfileRole(userId: string, role: Role): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

export async function fetchProducts(): Promise<Product[]> {
  const client = requireClient()
  const { data, error } = await client.from('products').select('*').order('name')
  if (error) throw error
  return (data as ProductRow[]).map(mapProduct)
}

export async function upsertProduct(product: Product): Promise<Product> {
  const client = requireClient()
  const { data, error } = await client
    .from('products')
    .upsert(productToRow(product))
    .select('*')
    .single()
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
  const { error: orderError } = await client.from('orders').insert({
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
  })
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
  if (itemsError) throw itemsError

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

export async function deleteAllOrdersApi(): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('orders').delete().neq('id', '')
  if (error) throw error
}

export function subscribeOrders(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => onChange())
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
