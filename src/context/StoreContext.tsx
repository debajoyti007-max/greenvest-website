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
  invalidateProductCache,
  insertProduct,
  setAllProductsInStock,
  subscribeOrders,
  updateOrderStatusApi,
  updateOrderDeliveryDateApi,
  deleteOrderApi,
  upsertProduct,
  verifyUtrApi,
  updateOrderUtrApi,
  fetchAddresses as fetchAddressesApi,
  saveAddress as saveAddressApi,
  deleteAddress as deleteAddressApi,
  validateCoupon as validateCouponApi,
  createCoupon as createCouponApi,
  saveDailyReport as saveDailyReportApi,
  fetchDailyReport as fetchDailyReportApi,
  fetchDeliveryZones as fetchDeliveryZonesApi,
  fetchNotificationsApi,
  saveNotificationApi,
  fetchProductReviewsApi,
  saveProductReviewApi,
  fetchPromotionalDealsApi,
  savePromotionalDealApi,
  deletePromotionalDealApi,
  fetchSupportMessagesApi,
  sendSupportMessageApi,
  resolveSupportTicketApi,
  reopenSupportTicketApi,
  deleteSupportThreadApi,
  cleanupOldSupportMessagesApi,
} from '../lib/api'
import { ALLOW_LOCAL_FALLBACK, MIN_ORDER_AMOUNT, MAX_VEGETABLE_QTY_KG, calculateTierDiscount, getCurrentShiftStatus, isOrderStalePending } from '../lib/business'
import { calcDeliveryFee, STORE_LOCATION } from '../lib/delivery'
import { getStoredKhataEntries, recordKhataTransaction, calculateUserKhataBalance, fetchKhataEntriesApi, saveKhataEntryApi } from '../lib/khata'
import { getStoredPromotionalDeals, saveStoredPromotionalDeals } from '../lib/deals'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { SEED_REVIEWS } from '../data/seedReviews'
import {
  ensureSeeded,
  getCart,
  getLang,
  getOrders,
  getProducts,
  getAppNotifications,
  saveAppNotifications,
  getStoredSupportMessages,
  saveStoredSupportMessages,
  saveCart,
  saveDelivery,
  saveOrders,
  saveProducts,
  setLang as persistLang,
  STORE_EVENT,
  uid,
} from '../lib/storage'
import type { CartItem, Grade, Lang, Order, OrderStatus, Product, Address, Coupon, DailyReport, DeliveryZone, AppNotification, ProductReview, KhataEntry, CustomerTier, ShiftInfo, PromotionalDeal, SupportMessage } from '../types'
import { showToast } from '../lib/toast'
import { useAuth } from './AuthContext'

interface PlaceOrderOpts {
  address: string
  phone: string
  pin: string
  utr: string
  payerUpiName?: string
  deliverySlot: import('../types').DeliverySlot
  deliveryDate?: string
  discountAmount?: number
  zones?: DeliveryZone[]
  geoLat?: number
  geoLng?: number
  paymentType?: 'full' | 'advance' | 'khata'
  advanceAmount?: number
  isKhataOrder?: boolean
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
  priceFor: (p: Product, grade: Grade, tierOverride?: CustomerTier) => number
  placeOrder: (opts: PlaceOrderOpts) => Promise<Order | null>
  reorderFromOrder: (order: Order) => { added: number; skipped: number }
  updateProduct: (product: Product) => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  toggleStock: (id: string) => Promise<void>
  morningReset: () => Promise<void>
  updateOrderStatus: (id: string, status: OrderStatus, rejectionReason?: string) => Promise<void>
  updateOrderDeliveryDate: (id: string, deliveryDate: string) => Promise<void>
  bulkUpdateOrderStatus: (ids: string[], status: OrderStatus) => Promise<void>
  checkDuplicateUtr: (utr: string) => Promise<boolean>
  findRecentOrderByUtr: (utr: string) => Promise<Order | null>
  updateOrderUtr: (orderId: string, utr: string) => Promise<void>
  verifyUtr: (id: string, verified: boolean) => Promise<void>
  deleteOrder: (id: string) => Promise<void>
  refresh: () => Promise<void>
  safeCloudSync: () => Promise<void>
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
  reviews: ProductReview[]
  addReview: (review: Omit<ProductReview, 'id' | 'createdAt'>) => Promise<ProductReview>
  getProductRating: (productId: string) => { avg: number; count: number }
  getReviewsForProduct: (productId: string) => ProductReview[]
  khataEntries: KhataEntry[]
  getUserKhataBalance: (userId?: string) => number
  addKhataTransaction: (userId: string, type: 'order_debit' | 'payment_credit' | 'adjustment', amount: number, notes?: string, orderId?: string) => void
  shiftStatus: ShiftInfo
  extendedDeliveryNotice: string | null
  setExtendedDeliveryNotice: (notice: string | null) => void
  promotionalDeals: PromotionalDeal[]
  addPromotionalDeal: (deal: Omit<PromotionalDeal, 'id' | 'createdAt'>) => Promise<void>
  updatePromotionalDeal: (deal: PromotionalDeal) => Promise<void>
  deletePromotionalDeal: (dealId: string) => Promise<void>
  togglePromotionalDeal: (dealId: string, isActive: boolean) => Promise<void>
  autoCancelStaleOrders: (timeoutHours?: number) => Promise<number>
  supportMessages: SupportMessage[]
  sendSupportMessage: (msg: Omit<SupportMessage, 'id' | 'createdAt'>) => Promise<SupportMessage>
  resolveSupportTicket: (userId: string) => Promise<void>
  reopenSupportTicket: (userId: string) => Promise<void>
  deleteSupportThread: (userId: string) => Promise<void>
  cleanupOldSupportMessages: (daysOld?: number) => Promise<number>
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
  const [khataEntries, setKhataEntries] = useState<KhataEntry[]>(() => getStoredKhataEntries())
  const [promotionalDeals, setPromotionalDeals] = useState<PromotionalDeal[]>(() => getStoredPromotionalDeals())
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>(() => getStoredSupportMessages())
  const [extendedDeliveryNotice, setExtendedDeliveryNotice] = useState<string | null>(() => {
    try {
      return localStorage.getItem('gv_extended_delivery_notice')
    } catch {
      return null
    }
  })
  const shiftStatus = useMemo(() => getCurrentShiftStatus(), [])
  const notifChannelRef = useRef<RealtimeChannel | null>(null)
  const inFlightStatusRef = useRef<Set<string>>(new Set())
  const [reviews, setReviews] = useState<ProductReview[]>(() => {
    try {
      const saved = localStorage.getItem('greenvest_all_reviews')
      if (saved) return JSON.parse(saved)
    } catch {}
    return SEED_REVIEWS
  })

  // Hydrate reviews from Supabase if connected
  useEffect(() => {
    if (!cloud) return
    fetchProductReviewsApi().then((data) => {
      if (data && data.length > 0) {
        setReviews(data)
      }
    })

    // Hydrate promotional deals from Supabase if connected
    fetchPromotionalDealsApi().then((deals) => {
      if (deals && Array.isArray(deals) && deals.length > 0) {
        setPromotionalDeals(deals)
      }
    })

    // Hydrate Khata entries from Supabase if connected
    fetchKhataEntriesApi().then((entries) => {
      if (entries && Array.isArray(entries) && entries.length > 0) {
        setKhataEntries(entries)
      }
    })

    // Hydrate Support messages from Supabase if connected
    fetchSupportMessagesApi().then((msgs) => {
      if (msgs && Array.isArray(msgs) && msgs.length > 0) {
        setSupportMessages(msgs)
      }
    })
  }, [cloud])

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
  const currentUserId = user?.id
  useEffect(() => {
    // ⚡ Free Tier Optimization: Do NOT open websocket broadcast channels for anonymous guests.
    // Only authenticated/logged-in users need live notification push.
    if (!cloud || !supabase || !user) return
    const ch = supabase
      .channel('gv-broadcasts')
      .on('broadcast', { event: 'notif' }, ({ payload }: { payload: unknown }) => {
        const n = payload as AppNotification
        // Bug 2 fix: never show notification with a falsy userId; only exact 'all' or own ID
        const isMe = n.userId === 'all' || (!!currentUserId && n.userId === currentUserId)
        if (!isMe) return
        setNotifications((prev) => {
          const next = [n, ...prev].slice(0, 30)
          saveAppNotifications(next)
          return next
        })
        showToast(`📢 ${n.title ? n.title + ': ' : ''}${n.message}`, '🔔')
      })
      .on('broadcast', { event: 'deal_broadcast' }, ({ payload }: { payload: unknown }) => {
        const d = payload as PromotionalDeal
        if (!d || !d.id) return
        setPromotionalDeals((prev) => {
          if (prev.some((existing) => existing.id === d.id)) return prev
          const next = [d, ...prev]
          saveStoredPromotionalDeals(next)
          return next
        })
      })
      .subscribe()
    notifChannelRef.current = ch
    return () => {
      if (supabase) supabase.removeChannel(ch)
      notifChannelRef.current = null
    }
  }, [cloud, currentUserId, user])

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
        // Merge with local cache to safeguard scheduled deliveryDate against empty/null remote schemas
        const localOrders = getOrders()
        const localMap = new Map(localOrders.map((o) => [o.id, o]))
        const mergedOrds = ords.map((o) => {
          const local = localMap.get(o.id)
          if (!o.deliveryDate && local?.deliveryDate && local.deliveryDate !== 'standard') {
            return { ...o, deliveryDate: local.deliveryDate }
          }
          return o
        })
        setOrders(mergedOrds)
        saveOrders(mergedOrds)
      } else {
        setOrders([])
      }

      // 4. Hydrate cloud persistent notifications (offline support)
      try {
        const cloudNotifs = await fetchNotificationsApi(user?.id)
        if (cloudNotifs.length > 0) {
          setNotifications(cloudNotifs)
          saveAppNotifications(cloudNotifs)
        }
      } catch {}
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user])

  const refreshOrdersOnly = useCallback(async () => {
    if (!user) return
    try {
      const ords = await fetchOrders(user.role, user.id, user.email, user.phone)
      const localOrders = getOrders()
      const localMap = new Map(localOrders.map((o) => [o.id, o]))
      const mergedOrds = ords.map((o) => {
        const local = localMap.get(o.id)
        if (!o.deliveryDate && local?.deliveryDate && local.deliveryDate !== 'standard') {
          return { ...o, deliveryDate: local.deliveryDate }
        }
        return o
      })
      setOrders(mergedOrds)
      saveOrders(mergedOrds)
    } catch {}
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

  const safeCloudSync = useCallback(async () => {
    invalidateProductCache()
    if (cloud) {
      await refreshCloud()
    } else {
      refreshLocal()
    }
  }, [cloud, refreshCloud, refreshLocal])

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
    // ⚡ High-Volume WebSocket Optimization:
    // Only open persistent order & product websocket channels for staff (seller, admin, rider).
    // For regular customers, catalog updates on window focus / tab visibility change to eliminate 95% of server connection slots.
    if (!cloud) return

    const isStaff = user && (user.role === 'seller' || user.role === 'admin' || user.role === 'rider')

    if (!isStaff) {
      // Smart refresh on window focus / tab visibility for regular customers
      const onFocus = () => {
        if (document.visibilityState === 'visible') {
          void fetchProducts(true).then((p) => setProducts(p)).catch(() => {})
        }
      }
      window.addEventListener('visibilitychange', onFocus)
      window.addEventListener('focus', onFocus)
      return () => {
        window.removeEventListener('visibilitychange', onFocus)
        window.removeEventListener('focus', onFocus)
      }
    }

    let oTimer: ReturnType<typeof setTimeout> | null = null
    const unsubOrds = subscribeOrders(() => {
      if (oTimer) clearTimeout(oTimer)
      oTimer = setTimeout(() => {
        void refreshOrdersOnly()
      }, 1000)
    })

    return () => {
      unsubOrds()
    }
  }, [cloud, user, refreshOrdersOnly])

  // ✅ No polling needed — subscribeOrders + subscribeProducts above handle all live updates via Supabase Realtime.

  const setLang = useCallback((l: Lang) => {
    persistLang(l)
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
  }, [])

  const priceFor = useCallback(
    (p: Product, grade: Grade, tierOverride?: CustomerTier) => {
      let base = grade === 'A' ? p.pA : grade === 'C' ? p.pC : p.pB
      base = base || p.pB || p.pA || 0
      const activeTier = tierOverride || user?.tier || 'regular'
      return calculateTierDiscount(base, activeTier)
    },
    [user?.tier],
  )

  useEffect(() => {
    setCart(getCart(user?.id))
  }, [user?.id])

  const addToCart = useCallback(
    (productId: string, grade: Grade, qty = 1, weightMultiplier = 1, weightLabel?: string) => {
      const p = products.find((x) => x.id === productId)
      if (p && !p.inStock) return

      const current = getCart(user?.id)
      const mult = weightMultiplier || 1
      const label =
        weightLabel || (mult === 1 ? p?.unit || '1 kg' : mult === 0.25 ? '250g' : mult === 0.5 ? '500g' : `${mult}kg`)
      const idx = current.findIndex(
        (c) => c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult,
      )

      const existingQty = idx >= 0 ? current[idx].qty : 0
      const targetQty = existingQty + qty
      const totalKg = targetQty * mult

      if (totalKg > MAX_VEGETABLE_QTY_KG) {
        showToast(
          lang === 'bn'
            ? 'যেকোনো সবজি সর্বোচ্চ ১০ কেজি পর্যন্ত অর্ডার করা যাবে। পাইকারি প্রয়োজনে যোগাযোগ করুন।'
            : 'Maximum 10 kg per vegetable. For bulk orders, please contact shop owner.',
          '⚠️',
        )
        return
      }

      let next: CartItem[]
      if (idx >= 0) {
        next = current.map((c, i) => (i === idx ? { ...c, qty: targetQty } : c))
      } else {
        next = [...current, { productId, grade, qty: targetQty, weightMultiplier: mult, weightLabel: label }]
      }
      saveCart(next, user?.id)
      setCart(next)
    },
    [products, user?.id, lang],
  )

  const updateCartQty = useCallback(
    (productId: string, grade: Grade, qty: number, weightMultiplier = 1) => {
      const mult = weightMultiplier || 1
      const totalKg = qty * mult

      if (totalKg > MAX_VEGETABLE_QTY_KG) {
        showToast(
          lang === 'bn'
            ? 'যেকোনো সবজি সর্বোচ্চ ১০ কেজি পর্যন্ত অর্ডার করা যাবে। পাইকারি প্রয়োজনে যোগাযোগ করুন।'
            : 'Maximum 10 kg per vegetable. For bulk orders, please contact shop owner.',
          '⚠️',
        )
        return
      }

      const next = getCart(user?.id)
        .map((c) =>
          c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult ? { ...c, qty } : c,
        )
        .filter((c) => c.qty > 0)
      saveCart(next, user?.id)
      setCart(next)
    },
    [user?.id, lang],
  )

  const removeFromCart = useCallback(
    (productId: string, grade: Grade, weightMultiplier = 1) => {
      const mult = weightMultiplier || 1
      const next = getCart(user?.id).filter(
        (c) => !(c.productId === productId && c.grade === grade && (c.weightMultiplier || 1) === mult),
      )
      saveCart(next, user?.id)
      setCart(next)
    },
    [user?.id],
  )

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
          const weightLabel =
            c.weightLabel || (weight === 1 ? p.unit : weight === 0.25 ? '250g' : weight === 0.5 ? '500g' : `${weight}kg`)
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

      const isPickup = opts.pin === STORE_LOCATION.pin || opts.address.toLowerCase().includes('pickup')
      const coords = opts.geoLat && opts.geoLng ? { lat: opts.geoLat, lng: opts.geoLng } : null
      const { fee: deliveryFee } = calcDeliveryFee(opts.pin, coords || opts.zones, isPickup ? 'pickup' : 'delivery')
      const safeDiscount = Math.min(subtotal, Math.max(0, opts.discountAmount || 0))
      const total = Math.max(0, subtotal + deliveryFee - safeDiscount)
      
      const isKhata = opts.paymentType === 'khata'
      const isFull = opts.paymentType === 'full'
      const advanceAmount = isKhata ? 0 : isFull ? total : opts.advanceAmount != null ? opts.advanceAmount : (total > 0 ? Math.max(1, Math.ceil(total * 0.1)) : 0)

      const now = new Date().toISOString()
      const order: Order = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        items,
        subtotal,
        deliveryFee,
        discountAmount: opts.discountAmount || 0,
        total,
        advanceAmount,
        paymentType: opts.paymentType || (isFull ? 'full' : 'advance'),
        isKhataOrder: isKhata,
        utr: isKhata ? 'KHATA-DEBIT' : opts.utr.trim().toUpperCase(),
        payerUpiName: opts.payerUpiName?.trim() || undefined,
        utrVerified: isKhata,
        status: isKhata ? 'confirmed' : 'pending',
        address: opts.address.trim(),
        phone: opts.phone.trim(),
        pin: opts.pin.replace(/\D/g, ''),
        deliverySlot: opts.deliverySlot,
        deliveryDate: opts.deliveryDate,
        geoLat: opts.geoLat,
        geoLng: opts.geoLng,
        createdAt: now,
        updatedAt: now,
      }

      if (isKhata) {
        recordKhataTransaction(user.id, 'order_debit', total, `Order #${order.id.slice(-6)}`, order.id, 'Khata Checkout')
        setKhataEntries(getStoredKhataEntries())
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
        setOrders((prev) => [order, ...prev])
        refreshCloud().catch(() => {})
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
    [user, cloud, products, priceFor, refreshCloud, lang],
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

      const localNext = getProducts().map((p) => (p.id === product.id ? product : p))
      saveProducts(localNext)

      if (cloud) {
        try {
          const saved = await upsertProduct(product)
          setProducts((prev) => {
            const updated = prev.map((p) => (p.id === saved.id ? saved : p))
            saveProducts(updated)
            return updated
          })
        } catch (err: any) {
          console.error('updateProduct failed, reverting UI:', err)
          setProducts(prevSnapshot)
          saveProducts(prevSnapshot)
          showToast(`Failed to update product: ${err.message || err}`, 'error')
          throw err
        }
        return
      }
      setProducts(localNext)
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
    async (id: string, status: OrderStatus, rejectionReason?: string) => {
      if (inFlightStatusRef.current.has(id)) {
        return // Prevent concurrent double-invocations for the same order
      }
      inFlightStatusRef.current.add(id)
      try {
        let prevSnapshot: Order[] = []
        setOrders((prev) => {
          prevSnapshot = prev
          return prev.map((o) => (o.id === id ? { ...o, status, rejectionReason, updatedAt: new Date().toISOString() } : o))
        })

        // 🛡️ Financial Ledger Integrity: Auto-revert Khata debit if a Khata order is cancelled
        if (status === 'cancelled') {
          const targetOrder = prevSnapshot.find((o) => o.id === id) || orders.find((o) => o.id === id)
          if (targetOrder?.isKhataOrder && targetOrder.status !== 'cancelled') {
            recordKhataTransaction(
              targetOrder.userId,
              'payment_credit',
              targetOrder.total,
              `Khata Reversal: Order #${targetOrder.id.slice(-6)} Cancelled`,
              targetOrder.id,
              user?.name || 'System Reversal',
            )
            setKhataEntries(getStoredKhataEntries())
          }
        }

        if (cloud) {
          try {
            await updateOrderStatusApi(id, status, rejectionReason)
            const next = getOrders().map((o) =>
              o.id === id ? { ...o, status, rejectionReason, updatedAt: new Date().toISOString() } : o,
            )
            saveOrders(next)
          } catch (err: any) {
            console.error('updateOrderStatus failed, reverting UI:', err)
            setOrders(prevSnapshot)
            showToast(`Error updating order: ${err.message || err}`, 'error')
            throw err
          }
        } else {
          const next = getOrders().map((o) =>
            o.id === id ? { ...o, status, rejectionReason, updatedAt: new Date().toISOString() } : o,
          )
          saveOrders(next)
        }
      } finally {
        inFlightStatusRef.current.delete(id)
      }
    },
    [cloud, user?.name, orders],
  )

  const updateOrderDeliveryDate = useCallback(
    async (id: string, deliveryDate: string) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, deliveryDate, updatedAt: new Date().toISOString() } : o)),
      )
      if (cloud) {
        try {
          await updateOrderDeliveryDateApi(id, deliveryDate)
        } catch (err) {
          console.error('updateOrderDeliveryDate failed:', err)
        }
      } else {
        const next = getOrders().map((o) =>
          o.id === id ? { ...o, deliveryDate, updatedAt: new Date().toISOString() } : o,
        )
        saveOrders(next)
      }
    },
    [cloud],
  )

  const getUserKhataBalance = useCallback(
    (userId?: string) => {
      const target = userId || user?.id
      if (!target) return 0
      return calculateUserKhataBalance(target, khataEntries)
    },
    [user?.id, khataEntries],
  )

  const addKhataTransaction = useCallback(
    (
      userId: string,
      type: 'order_debit' | 'payment_credit' | 'adjustment',
      amount: number,
      notes?: string,
      orderId?: string,
    ) => {
      const res = recordKhataTransaction(userId, type, amount, notes, orderId, user?.name || 'GreenVest Staff')
      setKhataEntries(getStoredKhataEntries())
      if (cloud && res?.entry) {
        void saveKhataEntryApi(res.entry)
      }
    },
    [cloud, user?.name],
  )

  const addPromotionalDeal = useCallback(
    async (deal: Omit<PromotionalDeal, 'id' | 'createdAt'>) => {
      const newDeal: PromotionalDeal = {
        ...deal,
        id: `deal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      }
      setPromotionalDeals((prev) => {
        const next = [newDeal, ...prev]
        saveStoredPromotionalDeals(next)
        return next
      })
      if (cloud) {
        await savePromotionalDealApi(newDeal)
        if (notifChannelRef.current) {
          try {
            await notifChannelRef.current.send({
              type: 'broadcast',
              event: 'deal_broadcast',
              payload: newDeal,
            })
          } catch (e) {
            console.warn('Realtime deal broadcast failed:', e)
          }
        }
      }
    },
    [cloud],
  )

  const updatePromotionalDeal = useCallback(
    async (updatedDeal: PromotionalDeal) => {
      setPromotionalDeals((prev) => {
        const next = prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d))
        saveStoredPromotionalDeals(next)
        return next
      })
      if (cloud) {
        await savePromotionalDealApi(updatedDeal)
      }
    },
    [cloud],
  )

  const deletePromotionalDeal = useCallback(
    async (dealId: string) => {
      setPromotionalDeals((prev) => {
        const next = prev.filter((d) => d.id !== dealId)
        saveStoredPromotionalDeals(next)
        return next
      })
      if (cloud) {
        await deletePromotionalDealApi(dealId)
      }
    },
    [cloud],
  )

  const togglePromotionalDeal = useCallback(
    async (dealId: string, isActive: boolean) => {
      let targetDeal: PromotionalDeal | undefined
      setPromotionalDeals((prev) => {
        const next = prev.map((d) => {
          if (d.id === dealId) {
            targetDeal = { ...d, isActive }
            return targetDeal
          }
          return d
        })
        saveStoredPromotionalDeals(next)
        return next
      })
      if (cloud && targetDeal) {
        await savePromotionalDealApi(targetDeal)
      }
    },
    [cloud],
  )

  const autoCancelStaleOrders = useCallback(
    async (timeoutHours = 2): Promise<number> => {
      const staleOrders = orders.filter((o) => isOrderStalePending(o, timeoutHours))
      if (staleOrders.length === 0) return 0

      const staleIds = staleOrders.map((o) => o.id)
      const reason = `Auto-cancelled: Payment unverified after ${timeoutHours} hours`

      // 🛡️ Financial Ledger Integrity: Auto-revert Khata debits for stale orders
      staleOrders.forEach((o) => {
        if (o.isKhataOrder && o.status !== 'cancelled') {
          recordKhataTransaction(
            o.userId,
            'payment_credit',
            o.total,
            `Auto-Reversal: Order #${o.id.slice(-6)} Stale Cancelled`,
            o.id,
            'System Auto-Cancel',
          )
        }
      })
      setKhataEntries(getStoredKhataEntries())

      setOrders((prev) =>
        prev.map((o) =>
          staleIds.includes(o.id)
            ? { ...o, status: 'cancelled' as OrderStatus, rejectionReason: reason, updatedAt: new Date().toISOString() }
            : o,
        ),
      )

      if (cloud) {
        try {
          await bulkUpdateOrderStatusApi(staleIds, 'cancelled', reason)
        } catch (err) {
          console.error('Failed to cloud sync auto-cancelled stale orders', err)
        }
      } else {
        const next = getOrders().map((o) =>
          staleIds.includes(o.id)
            ? { ...o, status: 'cancelled' as OrderStatus, rejectionReason: reason, updatedAt: new Date().toISOString() }
            : o,
        )
        saveOrders(next)
      }

      return staleOrders.length
    },
    [orders, cloud],
  )

  const sendSupportMessage = useCallback(
    async (msgData: Omit<SupportMessage, 'id' | 'createdAt'>): Promise<SupportMessage> => {
      const newMsg: SupportMessage = {
        ...msgData,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      }
      setSupportMessages((prev) => {
        const next = [...prev, newMsg]
        saveStoredSupportMessages(next)
        return next
      })

      if (cloud) {
        try {
          await sendSupportMessageApi(newMsg)
        } catch (err) {
          console.warn('Failed to cloud sync support message', err)
        }
      }
      return newMsg
    },
    [cloud],
  )

  const resolveSupportTicket = useCallback(
    async (userId: string) => {
      setSupportMessages((prev) => {
        const next = prev.map((m) => (m.userId === userId ? { ...m, status: 'resolved' as const } : m))
        saveStoredSupportMessages(next)
        return next
      })

      if (cloud) {
        try {
          await resolveSupportTicketApi(userId)
        } catch (err) {
          console.warn('Failed to cloud sync resolve support ticket', err)
        }
      }
    },
    [cloud],
  )

  const reopenSupportTicket = useCallback(
    async (userId: string) => {
      setSupportMessages((prev) => {
        const next = prev.map((m) => (m.userId === userId ? { ...m, status: 'open' as const } : m))
        saveStoredSupportMessages(next)
        return next
      })

      if (cloud) {
        try {
          await reopenSupportTicketApi(userId)
        } catch (err) {
          console.warn('Failed to cloud sync reopen support ticket', err)
        }
      }
    },
    [cloud],
  )

  const deleteSupportThread = useCallback(
    async (userId: string) => {
      setSupportMessages((prev) => {
        const next = prev.filter((m) => m.userId !== userId)
        saveStoredSupportMessages(next)
        return next
      })

      if (cloud) {
        try {
          await deleteSupportThreadApi(userId)
        } catch (err) {
          console.warn('Failed to cloud sync delete support thread', err)
        }
      }
    },
    [cloud],
  )

  const cleanupOldSupportMessages = useCallback(
    async (daysOld = 7): Promise<number> => {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000
      let purged = 0
      setSupportMessages((prev) => {
        const next = prev.filter((m) => {
          const isOld = m.status === 'resolved' && new Date(m.createdAt).getTime() < cutoffTime
          return !isOld
        })
        purged = prev.length - next.length
        saveStoredSupportMessages(next)
        return next
      })

      if (cloud) {
        try {
          await cleanupOldSupportMessagesApi(daysOld)
        } catch (err) {
          console.warn('Failed to cloud cleanup old support messages', err)
        }
      }
      return purged
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

  const updateOrderUtr = useCallback(
    async (orderId: string, newUtr: string) => {
      const prevOrders = [...orders]
      const cleaned = (newUtr || '').trim().toUpperCase()
      if (!cleaned) throw new Error('Invalid UTR')

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, utr: cleaned, updatedAt: new Date().toISOString() } : o)),
      )

      try {
        if (cloud) {
          await updateOrderUtrApi(orderId, cleaned)
        } else {
          const current = getOrders()
          saveOrders(
            current.map((o) => (o.id === orderId ? { ...o, utr: cleaned, updatedAt: new Date().toISOString() } : o)),
          )
        }
        showToast('✓ UTR successfully updated!', '✅')
      } catch (err: any) {
        setOrders(prevOrders)
        showToast(`Failed to update UTR: ${err.message || 'Error'}`, 'error')
        throw err
      }
    },
    [cloud, orders],
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
      if (cloud) {
        void saveNotificationApi(newNotif)
        if (notifChannelRef.current) {
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
      }

      showToast(lang === 'bn' ? '📢 নোটিফিকেশন পাঠানো হয়েছে!' : '📢 Notification sent successfully!', '📢')
    },
    [cloud, lang],
  )

  const addReview = useCallback(
    async (review: Omit<ProductReview, 'id' | 'createdAt'>) => {
      const created = await saveProductReviewApi(review)
      setReviews((prev) => [created, ...prev])
      showToast(lang === 'bn' ? '🌟 আপনার রিভিউ সফলভাবে জমা হয়েছে!' : '🌟 Review submitted successfully!', '⭐')
      return created
    },
    [lang],
  )

  const getReviewsForProduct = useCallback(
    (productId: string) => {
      return reviews.filter((r) => r.productId === productId)
    },
    [reviews],
  )

  const getProductRating = useCallback(
    (productId: string) => {
      const prodReviews = reviews.filter((r) => r.productId === productId)
      if (prodReviews.length === 0) {
        return { avg: 4.9, count: 6 }
      }
      const sum = prodReviews.reduce((acc, r) => acc + r.rating, 0)
      const avg = Math.round((sum / prodReviews.length) * 10) / 10
      return { avg, count: prodReviews.length }
    },
    [reviews],
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
      updateOrderDeliveryDate,
      bulkUpdateOrderStatus,
      checkDuplicateUtr,
      findRecentOrderByUtr,
      updateOrderUtr,
      verifyUtr,
      deleteOrder,
      refresh,
      safeCloudSync,
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
      reviews,
      addReview,
      getProductRating,
      getReviewsForProduct,
      khataEntries,
      getUserKhataBalance,
      addKhataTransaction,
      shiftStatus,
      extendedDeliveryNotice,
      setExtendedDeliveryNotice: (notice: string | null) => {
        setExtendedDeliveryNotice(notice)
        try {
          if (notice) localStorage.setItem('gv_extended_delivery_notice', notice)
          else localStorage.removeItem('gv_extended_delivery_notice')
        } catch {}
      },
      promotionalDeals,
      addPromotionalDeal,
      updatePromotionalDeal,
      deletePromotionalDeal,
      togglePromotionalDeal,
      autoCancelStaleOrders,
      supportMessages,
      sendSupportMessage,
      resolveSupportTicket,
      reopenSupportTicket,
      deleteSupportThread,
      cleanupOldSupportMessages,
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
      updateOrderDeliveryDate,
      bulkUpdateOrderStatus,
      checkDuplicateUtr,
      findRecentOrderByUtr,
      updateOrderUtr,
      verifyUtr,
      deleteOrder,
      refresh,
      safeCloudSync,
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
      reviews,
      addReview,
      getProductRating,
      getReviewsForProduct,
      khataEntries,
      getUserKhataBalance,
      addKhataTransaction,
      shiftStatus,
      extendedDeliveryNotice,
      promotionalDeals,
      addPromotionalDeal,
      updatePromotionalDeal,
      deletePromotionalDeal,
      togglePromotionalDeal,
      autoCancelStaleOrders,
      supportMessages,
      sendSupportMessage,
      resolveSupportTicket,
      reopenSupportTicket,
      deleteSupportThread,
      cleanupOldSupportMessages,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
