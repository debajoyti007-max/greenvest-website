import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  bulkUpdateOrderStatusApi,
  checkDuplicateUtrApi,
  findRecentOrderByUtrApi,
  createOrder,
  deleteProductApi,
  fetchOrders,
  fetchProducts,
  insertProduct,
  setAllProductsInStock,
  subscribeOrders,
  subscribeProducts,
  updateOrderStatusApi,
  deleteOrderApi,
  upsertProduct,
  verifyUtrApi,
  fetchAddresses as fetchAddressesApi,
  saveAddress as saveAddressApi,
  deleteAddress as deleteAddressApi,
  validateCoupon as validateCouponApi,
  createCoupon as createCouponApi,
  saveDailyReport as saveDailyReportApi,
  fetchDailyReport as fetchDailyReportApi,
  fetchDeliveryZones as fetchDeliveryZonesApi,
} from '../lib/api'
import { ALLOW_LOCAL_FALLBACK, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee } from '../lib/delivery'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  ensureSeeded,
  getCart,
  getLang,
  getOrders,
  getProducts,
  getAppNotifications,
  saveAppNotifications,
  saveCart,
  saveDelivery,
  saveOrders,
  saveProducts,
  setLang as persistLang,
  STORE_EVENT,
  uid,
} from '../lib/storage'
import type { CartItem, Grade, Lang, Order, OrderStatus, Product, Address, Coupon, DailyReport, DeliveryZone, AppNotification } from '../types'
import { showToast } from '../components/Toast'
import { useAuth } from './AuthContext'

interface PlaceOrderOpts {
  address: string
  phone: string
  pin: string
  utr: string
  deliverySlot: import('../types').DeliverySlot
  discountAmount?: number
  zones?: DeliveryZone[]
  geoLat?: number
  geoLng?: number
  paymentType?: 'full' | 'advance'
  advanceAmount?: number
}

interface StoreContextValue {
  products: Product[]
  cart: CartItem[]
  orders: Order[]
  lang: Lang
  loading: boolean
  setLang: (lang: Lang) => void
  addToCart: (productId: string, grade: Grade, qty?: number, weightMultiplier?: number, weightLabel?: string) => void
  updateCartQty: (productId: string, grade: Grade, qty: number, weightMultiplier?: number) => void
  removeFromCart: (productId: string, grade: Grade, weightMultiplier?: number) => void
  clearCart: () => void
  cartCount: number
  cartTotal: number
  priceFor: (p: Product, grade: Grade) => number
  placeOrder: (opts: PlaceOrderOpts) => Promise<Order | null>
  reorderFromOrder: (order: Order) => { added: number; skipped: number }
  updateProduct: (product: Product) => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  toggleStock: (id: string) => Promise<void>
  morningReset: () => Promise<void>
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>
  bulkUpdateOrderStatus: (ids: string[], status: OrderStatus) => Promise<void>
  checkDuplicateUtr: (utr: string) => Promise<boolean>
  findRecentOrderByUtr: (utr: string) => Promise<Order | null>
  verifyUtr: (id: string, verified: boolean) => Promise<void>
  deleteOrder: (id: string) => Promise<void>
  refresh: () => Promise<void>
  fetchAddresses: (userId: string) => Promise<Address[]>
  saveAddress: (addr: Address) => Promise<void>
  deleteAddress: (id: number) => Promise<void>
  validateCoupon: (code: string, orderTotal: number) => Promise<Coupon | null>
  createCoupon: (coupon: { code: string; discount_type: 'flat' | 'percent'; discount_value: number; min_order: number; valid: boolean; expires_at?: string }) => Promise<boolean>
  saveDailyReport: (report: DailyReport) => Promise<void>
  fetchDailyReport: (date: string) => Promise<DailyReport | null>
  fetchDeliveryZones: () => Promise<DeliveryZone[]>
  notifications: AppNotification[]
  sendNotification: (targetUserId: string | 'all', title: string, message: string, senderName?: string) => Promise<void>
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useAuth()
  const cloud = mode === 'cloud' && isSupabaseConfigured
  const [products, setProducts] = useState<Product[]>(() => {
    ensureSeeded()
    return getProducts()
  })
  const [cart, setCart] = useState<CartItem[]>(() => getCart(user?.id))
  const [orders, setOrders] = useState<Order[]>(() => getOrders())
  const [lang, setLangState] = useState<Lang>(() => getLang())
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getAppNotifications())
  const notifChannelRef = useRef<RealtimeChannel | null>(null)

  const refreshLocal = useCallback(() => {
    ensureSeeded()
    setProducts(getProducts())
    setCart(getCart())
    setOrders(getOrders())
    setNotifications(getAppNotifications())
    const l = getLang()
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
    setLoading(false)
  }, [])

  // ── Supabase Realtime: live notification broadcast ─────────────────────────
  useEffect(() => {
    if (!cloud || !supabase) return
    const ch = supabase
      .channel('gv-broadcasts')
      .on('broadcast', { event: 'notif' }, ({ payload }: { payload: unknown }) => {
        const n = payload as AppNotification
        // Bug 2 fix: never show notification with a falsy userId; only exact 'all' or own ID
        const isMe = n.userId === 'all' || (!!user && n.userId === user.id)
        if (!isMe) return
        setNotifications(prev => {
          const next = [n, ...prev].slice(0, 30)
          saveAppNotifications(next)
          return next
        })
        showToast(`📢 ${n.title ? n.title + ': ' : ''}${n.message}`, '🔔')
      })
      .subscribe()
    notifChannelRef.current = ch
    return () => {
      if (supabase) supabase.removeChannel(ch)
      notifChannelRef.current = null
    }
  }, [cloud, user?.id])

  const refreshCloud = useCallback(async () => {
    try {
      const prods = await fetchProducts()
      setProducts(prods)
      setCart(getCart(user?.id))
      const l = getLang()
      setLangState(l)
      document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
      document.body.classList.toggle('lang-bn', l === 'bn')
      if (user) {
        // Pass role + id so fetchOrders filters correctly:
        // rider/seller/admin → all orders | customer → only their own
        const ords = await fetchOrders(user.role, user.id, user.email, user.phone)
        setOrders(ords)
      } else {
        setOrders([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user])

  const refresh = useCallback(async () => {
    if (cloud) {
      await refreshCloud()
      return
    }
    if (ALLOW_LOCAL_FALLBACK) {
      refreshLocal()
      return
    }
    setProducts([])
    setCart(getCart(user?.id))
    setOrders([])
    const l = getLang()
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
    setLoading(false)
  }, [cloud, refreshCloud, refreshLocal, user?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onStore = () => {
      if (cloud) {
        setCart(getCart(user?.id))
        setLangState(getLang())
      } else if (ALLOW_LOCAL_FALLBACK) {
        refreshLocal()
      } else {
        setCart(getCart(user?.id))
        setLangState(getLang())
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('gv_')) onStore()
    }
    window.addEventListener(STORE_EVENT, onStore)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORE_EVENT, onStore)
      window.removeEventListener('storage', onStorage)
    }
  }, [cloud, refreshLocal, user?.id])

  useEffect(() => {
    if (!cloud) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    return subscribeProducts(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        try {
          const prods = await fetchProducts(true)
          setProducts(prods)
        } catch {}
      }, 500)
    })
  }, [cloud])

  useEffect(() => {
    // ⚡ Smart WebSocket Throttling:
    // Only open persistent order websocket channels for staff (seller, admin, rider) who need live alerts.
    // Regular customers use instant optimistic state updates to save concurrent connection limits and eliminate server load!
    if (!cloud || !user) return
    const isStaff = user.role === 'seller' || user.role === 'admin' || user.role === 'rider'
    if (!isStaff) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    return subscribeOrders(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void refreshCloud()
      }, 500)
    })
  }, [cloud, user?.id, user?.role, refreshCloud])

  // ✅ No polling needed — subscribeOrders + subscribeProducts above handle all live updates via Supabase Realtime.

  const setLang = useCallback((l: Lang) => {
    persistLang(l)
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
  }, [])

  const priceFor = useCallback((p: Product, grade: Grade) => {
    if (grade === 'A') return p.pA
    if (grade === 'B') return p.pB
    return p.pC
  }, [])

  useEffect(() => {
    setCart(getCart(user?.id))
  }, [user?.id])

  const addToCart = useCallback((productId: string, grade: Grade, qty = 1, weightMultiplier = 1, weightLabel?: string) => {
    const p = products.find((x) => x.id === productId)
    if (p && !p.inStock) return

    const current = getCart(user?.id)
    const mult = weightMultiplier || 1
    const label = weightLabel || (mult === 1 ? p?.unit || '1 kg' : mult === 0.25 ? '250g' : mult === 0.5 ? '500g' : `${mult}kg`)
    const idx = current.findIndex((c) => c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult)

    let next: CartItem[]
    if (idx >= 0) {
      next = current.map((c, i) => (i === idx ? { ...c, qty: c.qty + qty } : c))
    } else {
      next = [...current, { productId, grade, qty, weightMultiplier: mult, weightLabel: label }]
    }
    saveCart(next, user?.id)
    setCart(next)
  }, [products, user?.id])

  const updateCartQty = useCallback((productId: string, grade: Grade, qty: number, weightMultiplier = 1) => {
    const mult = weightMultiplier || 1
    const next = getCart(user?.id)
      .map((c) => (c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult ? { ...c, qty } : c))
      .filter((c) => c.qty > 0)
    saveCart(next, user?.id)
    setCart(next)
  }, [user?.id])

  const removeFromCart = useCallback((productId: string, grade: Grade, weightMultiplier = 1) => {
    const mult = weightMultiplier || 1
    const next = getCart(user?.id).filter((c) => !(c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult))
    saveCart(next, user?.id)
    setCart(next)
  }, [user?.id])

  const clearCart = useCallback(() => {
    saveCart([], user?.id)
    setCart([])
  }, [user?.id])

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart])

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const p = products.find((x) => x.id === item.productId)
      if (!p) return sum
      const weight = item.weightMultiplier || 1
      const unitPrice = Math.round(priceFor(p, item.grade) * weight)
      return sum + unitPrice * item.qty
    }, 0)
  }, [cart, products, priceFor])

  const placeOrder = useCallback(
    async (opts: PlaceOrderOpts) => {
      if (!user) return null
      const currentCart = getCart(user.id)
      if (currentCart.length === 0) return null

      const catalog = cloud ? products : getProducts()
      const items = currentCart
        .map((c) => {
          const p = catalog.find((x) => x.id === c.productId)
          if (!p) return null
          const weight = c.weightMultiplier || 1
          const unitPrice = Math.round(priceFor(p, c.grade) * weight)
          const weightLabel = c.weightLabel || (weight === 1 ? p.unit : weight === 0.25 ? '250g' : weight === 0.5 ? '500g' : `${weight}kg`)
          return {
            productId: c.productId,
            name: weightLabel && weightLabel !== p.unit ? `${p.name} (${weightLabel})` : p.name,
            emoji: p.emoji,
            grade: c.grade,
            qty: c.qty,
            unitPrice,
            weightMultiplier: weight,
            weightLabel,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (items.length === 0) return null

      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
      if (subtotal < MIN_ORDER_AMOUNT) return null
      const { fee: deliveryFee } = calcDeliveryFee(opts.pin, opts.zones)
      const total = Math.max(0, subtotal + deliveryFee - (opts.discountAmount || 0))
      const isFull = opts.paymentType === 'full'
      const advanceAmount = isFull ? total : (opts.advanceAmount != null ? opts.advanceAmount : Math.ceil(total * 0.5))

      const now = new Date().toISOString()
      const order: Order = {
        id: crypto.randomUUID(),   // UUID required by DB — uid('ord') was generating invalid IDs
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        items,
        subtotal,
        deliveryFee,
        discountAmount: opts.discountAmount || 0,
        total,
        advanceAmount,
        paymentType: isFull ? 'full' : 'advance',
        utr: opts.utr.trim().toUpperCase(),
        utrVerified: false,
        status: 'pending',
        address: opts.address.trim(),
        phone: opts.phone.trim(),
        pin: opts.pin.replace(/\D/g, ''),
        deliverySlot: opts.deliverySlot,
        geoLat: opts.geoLat,
        geoLng: opts.geoLng,
        createdAt: now,
        updatedAt: now,
      }

      if (cloud) {
        try {
          await createOrder(order)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('placeOrder failed:', msg)
          showToast(`Order failed: ${msg}`, 'error')
          throw err
        }
        saveDelivery(user.id, {
          address: order.address,
          phone: order.phone,
          pin: order.pin,
          deliverySlot: order.deliverySlot,
        })
        saveCart([], user.id)
        setCart([])
        // Optimistically prepend the order so it shows immediately — don't wait for refresh
        setOrders((prev) => [order, ...prev])
        // Best-effort background sync; failures are safe since we already set state above
        refreshCloud().catch(() => { /* ignore */ })
        return order
      }

      const nextOrders = [order, ...getOrders()]
      saveOrders(nextOrders)
      setOrders(nextOrders)
      saveDelivery(user.id, {
        address: order.address,
        phone: order.phone,
        pin: order.pin,
        deliverySlot: order.deliverySlot,
      })
      saveCart([], user.id)
      setCart([])
      return order
    },
    [user, cloud, products, priceFor, refreshCloud],
  )

  const reorderFromOrder = useCallback(
    (order: Order) => {
      const catalog = cloud ? products : getProducts()
      let added = 0
      let skipped = 0
      const next = [...getCart(user?.id)]

      for (const it of order.items) {
        const p = catalog.find((x) => x.id === it.productId)
        if (!p || !p.inStock || p.archived) {
          skipped += 1
          continue
        }
        const mult = it.weightMultiplier || 1
        const idx = next.findIndex((c) => c.productId === it.productId && c.grade === it.grade && (c.weightMultiplier || 1) === mult)
        if (idx >= 0) {
          next[idx] = { ...next[idx], qty: next[idx].qty + it.qty }
        } else {
          next.push({
            productId: it.productId,
            grade: it.grade,
            qty: it.qty,
            weightMultiplier: mult,
            weightLabel: it.weightLabel,
          })
        }
        added += 1
      }

      saveCart(next, user?.id)
      setCart(next)
      return { added, skipped }
    },
    [cloud, products, user?.id],
  )

  const updateProduct = useCallback(
    async (product: Product) => {
      let prevSnapshot: Product[] = []
      setProducts((prev) => {
        prevSnapshot = prev
        return prev.map((p) => (p.id === product.id ? product : p))
      })

      if (cloud) {
        try {
          const saved = await upsertProduct(product)
          setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
        } catch (err: any) {
          console.error('updateProduct failed, reverting UI:', err)
          setProducts(prevSnapshot)
          showToast(`Failed to update product: ${err.message || err}`, 'error')
          throw err
        }
        return
      }
      const next = getProducts().map((p) => (p.id === product.id ? product : p))
      saveProducts(next)
      setProducts(next)
    },
    [cloud],
  )

  const addProduct = useCallback(
    async (product: Omit<Product, 'id'>) => {
      if (cloud) {
        try {
          const saved = await insertProduct(product)
          setProducts((prev) => [...prev, saved])
        } catch (err: any) {
          console.error('addProduct failed:', err)
          showToast(`Failed to add product: ${err.message || err}`, 'error')
          throw err
        }
        return
      }
      const next = [...getProducts(), { ...product, id: uid('p') }]
      saveProducts(next)
      setProducts(next)
    },
    [cloud],
  )

  const deleteProduct = useCallback(
    async (id: string) => {
      let prevSnapshot: Product[] = []
      setProducts((prev) => {
        prevSnapshot = prev
        return prev.filter((p) => p.id !== id)
      })

      if (cloud) {
        try {
          await deleteProductApi(id)
        } catch (err: any) {
          console.error('deleteProduct failed, reverting UI:', err)
          setProducts(prevSnapshot)
          showToast(`Failed to delete product: ${err.message || err}`, 'error')
          throw err
        }
        return
      }
      const next = getProducts().filter((p) => p.id !== id)
      saveProducts(next)
      setProducts(next)
    },
    [cloud],
  )

  const toggleStock = useCallback(
    async (id: string) => {
      const current = products.find((p) => p.id === id)
      if (!current) return
      await updateProduct({ ...current, inStock: !current.inStock })
    },
    [products, updateProduct],
  )

  const morningReset = useCallback(async () => {
    if (cloud) {
      await setAllProductsInStock()
      await refreshCloud()
      return
    }
    const next = getProducts().map((p) => (p.archived ? p : { ...p, inStock: true }))
    saveProducts(next)
    setProducts(next)
  }, [cloud, refreshCloud])

  const checkDuplicateUtr = useCallback(
    async (utr: string): Promise<boolean> => {
      const clean = utr.trim().toUpperCase()
      if (clean.length < 6) return false
      // In cloud mode: only check Supabase (ignore stale local orders)
      if (cloud) return checkDuplicateUtrApi(clean)
      // Local mode only: check local storage
      const existing = getOrders()
      return existing.some((o) => o.utr.toUpperCase() === clean && o.status !== 'cancelled')
    },
    [cloud],
  )

  const findRecentOrderByUtr = useCallback(
    async (utr: string): Promise<Order | null> => {
      const clean = utr.trim().toUpperCase()
      if (!clean || !user) return null
      if (cloud) return findRecentOrderByUtrApi(user.id, clean)
      const existing = getOrders()
      const found = existing.find(
        (o) => o.userId === user.id && o.utr.toUpperCase() === clean && o.status !== 'cancelled',
      )
      return found || null
    },
    [cloud, user],
  )

  const updateOrderStatus = useCallback(
    async (id: string, status: OrderStatus) => {
      let prevSnapshot: Order[] = []
      setOrders((prev) => {
        prevSnapshot = prev
        return prev.map((o) => (o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o))
      })

      if (cloud) {
        try {
          await updateOrderStatusApi(id, status)
        } catch (err: any) {
          console.error('updateOrderStatus failed, reverting UI:', err)
          setOrders(prevSnapshot)
          showToast(`Error updating order: ${err.message || err}`, 'error')
          throw err
        }
      } else {
        const next = getOrders().map((o) =>
          o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
        )
        saveOrders(next)
      }
    },
    [cloud],
  )

  const bulkUpdateOrderStatus = useCallback(
    async (ids: string[], status: OrderStatus) => {
      if (ids.length === 0) return
      let prevSnapshot: Order[] = []
      setOrders((prev) => {
        prevSnapshot = prev
        return prev.map((o) => (ids.includes(o.id) ? { ...o, status, updatedAt: new Date().toISOString() } : o))
      })

      if (cloud) {
        try {
          await bulkUpdateOrderStatusApi(ids, status)
        } catch (err: any) {
          console.error('bulkUpdateOrderStatus failed, reverting UI:', err)
          setOrders(prevSnapshot)
          showToast(`Bulk update failed: ${err.message || err}`, 'error')
          throw err
        }
      } else {
        const next = getOrders().map((o) =>
          ids.includes(o.id) ? { ...o, status, updatedAt: new Date().toISOString() } : o,
        )
        saveOrders(next)
      }
    },
    [cloud],
  )

  const verifyUtr = useCallback(
    async (id: string, verified: boolean) => {
      let prevSnapshot: Order[] = []
      setOrders((prev) => {
        prevSnapshot = prev
        return prev.map((o) =>
          o.id === id
            ? {
                ...o,
                utrVerified: verified,
                status: verified ? ('confirmed' as OrderStatus) : o.status,
                updatedAt: new Date().toISOString(),
              }
            : o,
        )
      })

      if (cloud) {
        try {
          await verifyUtrApi(id, verified)
        } catch (err: any) {
          console.error('verifyUtr failed, reverting UI:', err)
          setOrders(prevSnapshot)
          showToast(`Verify UTR failed: ${err.message || err}`, 'error')
          throw err
        }
      } else {
        const next = getOrders().map((o) =>
          o.id === id
            ? {
                ...o,
                utrVerified: verified,
                status: verified ? ('confirmed' as OrderStatus) : o.status,
                updatedAt: new Date().toISOString(),
              }
            : o,
        )
        saveOrders(next)
      }
    },
    [cloud],
  )

  const deleteOrder = useCallback(
    async (id: string) => {
      let prevSnapshot: Order[] = []
      setOrders((prev) => {
        prevSnapshot = prev
        return prev.filter((o) => o.id !== id)
      })

      if (cloud) {
        try {
          await deleteOrderApi(id)
        } catch (err: any) {
          console.error('deleteOrder failed, reverting UI:', err)
          setOrders(prevSnapshot)
          showToast(`Delete order failed: ${err.message || err}`, 'error')
          throw err
        }
      } else {
        const next = getOrders().filter((o) => o.id !== id)
        saveOrders(next)
      }
    },
    [cloud],
  )

  const fetchAddresses = useCallback(async (userId: string) => {
    if (!cloud) return []
    return fetchAddressesApi(userId)
  }, [cloud])

  const saveAddress = useCallback(async (addr: Address) => {
    if (!cloud) return
    return saveAddressApi(addr)
  }, [cloud])

  const deleteAddress = useCallback(async (id: number) => {
    if (!cloud) return
    return deleteAddressApi(id)
  }, [cloud])

  const validateCoupon = useCallback(async (code: string, orderTotal: number) => {
    if (!cloud) return null
    return validateCouponApi(code, orderTotal)
  }, [cloud])

  const createCoupon = useCallback(async (coupon: { code: string; discount_type: 'flat' | 'percent'; discount_value: number; min_order: number; valid: boolean; expires_at?: string }) => {
    if (!cloud) return false
    return createCouponApi(coupon)
  }, [cloud])

  const saveDailyReport = useCallback(async (report: DailyReport) => {
    if (!cloud) return
    return saveDailyReportApi(report)
  }, [cloud])

  const fetchDailyReport = useCallback(async (date: string) => {
    if (!cloud) return null
    return fetchDailyReportApi(date)
  }, [cloud])

  const fetchDeliveryZones = useCallback(async () => {
    if (!cloud) return []
    return fetchDeliveryZonesApi()
  }, [cloud])

  const sendNotification = useCallback(
    async (targetUserId: string | 'all', title: string, message: string, senderName = 'GreenVest Seller') => {
      const newNotif: AppNotification = {
        id: uid('notif'),
        userId: targetUserId,
        title: title.trim(),
        message: message.trim(),
        sender: senderName,
        createdAt: new Date().toISOString(),
      }
      // Save locally (for sender's own view)
      const current = getAppNotifications()
      const next = [newNotif, ...current].slice(0, 30)
      saveAppNotifications(next)
      setNotifications(next)

      // Broadcast via Supabase Realtime → reaches ALL online users instantly
      if (cloud && notifChannelRef.current) {
        try {
          await notifChannelRef.current.send({
            type: 'broadcast',
            event: 'notif',
            payload: newNotif,
          })
        } catch (e) {
          console.warn('Realtime broadcast failed:', e)
        }
      }

      showToast(lang === 'bn' ? '📢 নোটিফিকেশন পাঠানো হয়েছে!' : '📢 Notification sent successfully!', '📢')
    },
    [cloud, lang],
  )

  const value = useMemo<StoreContextValue>(
    () => ({
      products,
      cart,
      orders,
      lang,
      loading,
      setLang,
      addToCart,
      updateCartQty,
      removeFromCart,
      clearCart,
      cartCount,
      cartTotal,
      priceFor,
      placeOrder,
      reorderFromOrder,
      updateProduct,
      addProduct,
      deleteProduct,
      toggleStock,
      morningReset,
      updateOrderStatus,
      bulkUpdateOrderStatus,
      checkDuplicateUtr,
      findRecentOrderByUtr,
      verifyUtr,
      deleteOrder,
      refresh,
      fetchAddresses,
      saveAddress,
      deleteAddress,
      validateCoupon,
      createCoupon,
      saveDailyReport,
      fetchDailyReport,
      fetchDeliveryZones,
      notifications,
      sendNotification,
    }),
    [
      products,
      cart,
      orders,
      lang,
      loading,
      setLang,
      addToCart,
      updateCartQty,
      removeFromCart,
      clearCart,
      cartCount,
      cartTotal,
      priceFor,
      placeOrder,
      reorderFromOrder,
      updateProduct,
      addProduct,
      deleteProduct,
      toggleStock,
      morningReset,
      updateOrderStatus,
      bulkUpdateOrderStatus,
      checkDuplicateUtr,
      findRecentOrderByUtr,
      verifyUtr,
      deleteOrder,
      refresh,
      fetchAddresses,
      saveAddress,
      deleteAddress,
      validateCoupon,
      createCoupon,
      saveDailyReport,
      fetchDailyReport,
      fetchDeliveryZones,
      notifications,
      sendNotification,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
