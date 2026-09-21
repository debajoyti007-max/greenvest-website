import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  bulkUpdateOrderStatusApi,
  cancelOwnOrderApi,
  findRecentOrderForUserApi,
  createOrder,
  deleteProductApi,
  fetchOrders,
  fetchProducts,
  invalidateProductCache,
  insertProduct,
  mapProduct,
  setAllProductsInStock,
  subscribeOrders,
  subscribeProducts,
  updateOrderStatusApi,
  updateOrderDeliveryDateApi,
  deleteOrderApi,
  upsertProduct,
  bulkUpsertProducts,
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
import {
  ALLOW_LOCAL_FALLBACK,
  MIN_ORDER_AMOUNT,
  MAX_VEGETABLE_QTY_KG,
  MAX_DELIVERY_WEIGHT_KG,
  MAX_ORDERS_PER_HOUR,
  SERVICEABLE_PINCODES,
  calculateCartTotalWeightKg,
  checkOrderRateLimit,
  ADVANCE_PERCENT,
  calculateTierDiscount,
  getCurrentShiftStatus,
  isOrderStalePending,
} from '../lib/business'
import { calcDeliveryFee, isServiceablePin, STORE_LOCATION } from '../lib/delivery'
import { getStoredPromotionalDeals, saveStoredPromotionalDeals } from '../lib/deals'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
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
  getActiveUserPin,
  uid,
} from '../lib/storage'
import type { CartItem, Grade, Lang, Order, OrderStatus, Product, Address, Coupon, DailyReport, DeliveryZone, AppNotification, ProductReview, CustomerTier, ShiftInfo, PromotionalDeal, SupportMessage } from '../types'
import { showToast } from '../lib/toast'
import { requireStaffCredentials } from '../lib/staffAuth'
import { initOfflineQueue, syncPendingOfflineOrders } from '../lib/offlineQueue'
import { useAuth } from './useAuth'

interface PlaceOrderOpts {
  address: string
  phone: string
  pin: string
  payerUpiName?: string
  deliverySlot: import('../types').DeliverySlot
  deliveryDate?: string
  discountAmount?: number
  zones?: DeliveryZone[]
  geoLat?: number
  geoLng?: number
  paymentType?: 'full' | 'advance'
  advanceAmount?: number
  deliveryNotes?: string
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
  bulkUpdateProducts: (
    products: Product[],
    onProgress?: (completed: number, total: number) => void,
  ) => Promise<{ success: boolean; count: number; error?: string }>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  toggleStock: (id: string) => Promise<void>
  morningReset: () => Promise<void>
  updateOrderStatus: (id: string, status: OrderStatus, rejectionReason?: string) => Promise<void>
  updateOrderDeliveryDate: (id: string, deliveryDate: string) => Promise<void>
  bulkUpdateOrderStatus: (ids: string[], status: OrderStatus) => Promise<void>
  findRecentOrder: () => Promise<Order | null>
  deleteOrder: (id: string) => Promise<void>
  refresh: () => Promise<void>
  refreshOrdersOnly: () => Promise<void>
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
  loadProductReviews: (productId: string, offset?: number, limit?: number) => Promise<ProductReview[]>
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
  refreshSupportMessages: () => Promise<void>
}

// eslint-disable-next-line react/only-export-components -- context must be exported for useStore.ts hook companion file
export const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useAuth()
  const userRef = useRef(user)
  userRef.current = user
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
    return []
  })

  // Hydrate reviews from Supabase if connected (public catalog data — safe for all)
  useEffect(() => {
    if (!cloud) return
    fetchProductReviewsApi().then((data) => {
      if (Array.isArray(data)) {
        setReviews(data)
      }
    })

    // Hydrate promotional deals from Supabase if connected (public marketing data — safe for all)
    fetchPromotionalDealsApi().then((deals) => {
      if (Array.isArray(deals)) {
        setPromotionalDeals(deals)
      }
    })
  }, [cloud])

  // ── 🔒 Security Guard: Support Hydration ONLY for authenticated users ──
  // Never hydrate private support data for anonymous guests.
  const userRole = user?.role
  const userId = user?.id
  useEffect(() => {
    if (!cloud || !userId) return // ⛔ Anonymous guests — skip entirely

    const isStaff = userRole === 'admin' || userRole === 'seller'

    // Support messages: only staff or the active user's own ticket thread
    fetchSupportMessagesApi(isStaff ? undefined : userId).then((msgs) => {
      if (msgs && Array.isArray(msgs) && msgs.length > 0) {
        setSupportMessages(msgs)
      }
    })
  }, [cloud, user, userId, userRole])

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
      const currentUser = userRef.current
      setCart(getCart(currentUser?.id))
      const l = getLang()
      setLangState(l)
      document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
      document.body.classList.toggle('lang-bn', l === 'bn')
      if (currentUser) {
        // Pass role + id + pin so fetchOrders filters correctly via Staff Gateway RPC
        const callerPin = getActiveUserPin(currentUser)
        const ords = await fetchOrders(currentUser.role, currentUser.id, currentUser.email, currentUser.phone, 100, callerPin)
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
        if (currentUser) {
          const cloudNotifs = await fetchNotificationsApi(currentUser.id)
          if (cloudNotifs.length > 0) {
            setNotifications(cloudNotifs)
            saveAppNotifications(cloudNotifs)
          }
        } else {
          setNotifications([])
        }
      } catch {}
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshOrdersOnly = useCallback(async () => {
    const currentUser = userRef.current
    if (!currentUser) return
    try {
      const callerPin = getActiveUserPin(currentUser)
      const ords = await fetchOrders(currentUser.role, currentUser.id, currentUser.email, currentUser.phone, 100, callerPin)
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
  }, [])

  const refresh = useCallback(async () => {
    if (cloud) {
      await refreshCloud()
      return
    }
    if (ALLOW_LOCAL_FALLBACK) {
      refreshLocal()
      return
    }
    const currentUser = userRef.current
    setProducts([])
    setCart(getCart(currentUser?.id))
    setOrders([])
    const l = getLang()
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
    setLoading(false)
  }, [cloud, refreshCloud, refreshLocal])

  const safeCloudSync = useCallback(async () => {
    invalidateProductCache()
    if (cloud) {
      await refreshCloud()
    } else {
      refreshLocal()
    }
  }, [cloud, refreshCloud, refreshLocal])

  // Initial hydration on mount
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Re-fetch only when user identity or role changes (login/logout/switch), NOT on every re-render
  const prevUserKeyRef = useRef(`${user?.id || ''}:${user?.role || ''}`)
  useEffect(() => {
    const currentKey = `${user?.id || ''}:${user?.role || ''}`
    if (prevUserKeyRef.current !== currentKey) {
      prevUserKeyRef.current = currentKey
      void refresh()
    }
  }, [user?.id, user?.role, refresh])

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

    const isStaff = user && (user.role === 'seller' || user.role === 'admin' || user.role === 'rider')

    if (isStaff) {
      // ⚡ Staff Realtime Channels: Sellers, Admins, Riders subscribe to Supabase Realtime
      // (Consumes only 1-3 connections total, keeping 195+ Free-Tier connection slots open)
      let oTimer: ReturnType<typeof setTimeout> | null = null
      const unsubOrds = subscribeOrders(() => {
        if (oTimer) clearTimeout(oTimer)
        oTimer = setTimeout(() => {
          void refreshOrdersOnly()
        }, 1000)
      })

      const unsubProds = subscribeProducts((payload) => {
        if (payload?.new && (payload.new as any).id) {
          try {
            const updated = mapProduct(payload.new as any)
            setProducts((prev) => {
              const exists = prev.some((p) => p.id === updated.id)
              const next = exists ? prev.map((p) => (p.id === updated.id ? updated : p)) : [...prev, updated]
              saveProducts(next)
              return next
            })
          } catch {
            void fetchProducts(true).then((p) => setProducts(p)).catch(() => {})
          }
        } else {
          void fetchProducts(true).then((p) => setProducts(p)).catch(() => {})
        }
      })

      return () => {
        unsubOrds()
        unsubProds?.()
      }
    } else {
      // ⚡ Free-Tier Safe Customer Smart Sync (ZERO extra WebSockets consumed!):
      // 1. Instant re-fetch when customer focuses tab / unlocks mobile device
      // 2. Silent 30-second background pulse ONLY when the page is active and visible
      // 3. 0ms Cross-tab sync when seller updates rates in another tab

      let lastCheckedTime = Date.now()

      const silentSyncCatalog = async () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        try {
          const fresh = await fetchProducts(true)
          setProducts(fresh)
          saveProducts(fresh)
          lastCheckedTime = Date.now()
        } catch {}
      }

      const onFocus = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Date.now() - lastCheckedTime > 15000) {
            void silentSyncCatalog()
          }
          if (user) {
            void refreshOrdersOnly()
          }
        }
      }

      // 30-second silent pulse (Free-Tier safe: stops completely when tab is hidden / phone screen is off)
      const pulseInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          void silentSyncCatalog()
        }
      }, 30000)

      // Cross-tab broadcast: if seller or mandi tool changes price in another tab on the same device
      const onCatalogVersionChanged = () => {
        void silentSyncCatalog()
      }

      window.addEventListener('visibilitychange', onFocus)
      window.addEventListener('focus', onFocus)
      window.addEventListener('gv_catalog_version_changed', onCatalogVersionChanged)

      return () => {
        clearInterval(pulseInterval)
        window.removeEventListener('visibilitychange', onFocus)
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('gv_catalog_version_changed', onCatalogVersionChanged)
      }
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

      const isPickup =
        opts.address.toLowerCase().includes('pickup') ||
        (opts.pin === STORE_LOCATION.pin && opts.address.toLowerCase().includes('store'))

      // 📍 0. Serviceable PIN Validation for Home Delivery
      if (!isPickup && !isServiceablePin(opts.pin)) {
        const errMsg =
          lang === 'bn'
            ? `বর্তমানে হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে চালু রয়েছে। দোকান থেকে ফ্রি পিকআপ (₹০) বেছে নিন।`
            : `Home delivery is currently available only in PIN codes: ${SERVICEABLE_PINCODES.join(', ')}. Please choose Free Store Pickup.`
        showToast(errMsg, '⚠️')
        throw new Error(errMsg)
      }

      // ⚖️ 1. Total Weight Cap for Home Delivery (Two-Wheeler / Bike Capacity)
      const totalCartWeightKg = calculateCartTotalWeightKg(currentCart)
      if (!isPickup && totalCartWeightKg > MAX_DELIVERY_WEIGHT_KG) {
        const errMsg =
          lang === 'bn'
            ? `মোটরবাইকে হোম ডেলিভারির সর্বোচ্চ সীমা ১০ কেজি (আপনার ব্যাগের ওজন: ${totalCartWeightKg} কেজি)। অনুগ্রহ করে দোকান থেকে ফ্রি পিকআপ (₹০) বেছে নিন অথবা কার্ট থেকে পরিমাণ কমান।`
            : `Home delivery by two-wheeler is limited to ${MAX_DELIVERY_WEIGHT_KG} kg max (your cart weight: ${totalCartWeightKg} kg). Please choose Free Store Pickup or reduce item quantity.`
        showToast(errMsg, '⚠️')
        throw new Error(errMsg)
      }

      // 🛡️ 2. Customer Order Rate Limit (Max 3 orders / hour)
      // Check in-memory store orders first
      const rateLimitCheck = checkOrderRateLimit(orders, user.id, opts.phone)
      if (rateLimitCheck.isExceeded) {
        const waitMin = rateLimitCheck.resetMinutes || 15
        const errMsg =
          lang === 'bn'
            ? `নিরাপত্তা কারণে প্রতি ঘণ্টায় সর্বোচ্চ ${MAX_ORDERS_PER_HOUR}টি অর্ডার করা যাবে। অনুগ্রহ করে ~${waitMin} মিনিট অপেক্ষা করুন।`
            : `Rate limit reached: Maximum ${MAX_ORDERS_PER_HOUR} orders per hour. Please wait ~${waitMin} minutes before placing another order.`
        showToast(errMsg, '⚠️')
        throw new Error(errMsg)
      }

      // Server-Side Supabase check (prevents multi-tab / incognito / cache-cleared bypass)
      if (cloud && supabase) {
        try {
          const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          const cleanPhone = opts.phone.replace(/\D/g, '').slice(-10)
          const filterStr = cleanPhone ? `user_id.eq.${user.id},phone.ilike.%${cleanPhone}%` : `user_id.eq.${user.id}`
          const { count, error } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', oneHourAgoIso)
            .neq('status', 'cancelled')
            .or(filterStr)

          if (!error && count !== null && count >= MAX_ORDERS_PER_HOUR) {
            const errMsg =
              lang === 'bn'
                ? `নিরাপত্তা কারণে প্রতি ঘণ্টায় সর্বোচ্চ ${MAX_ORDERS_PER_HOUR}টি অর্ডার করা যাবে। পূর্ববর্তী অর্ডার সম্পন্ন হওয়া পর্যন্ত অপেক্ষা করুন।`
                : `Server rate limit: Maximum ${MAX_ORDERS_PER_HOUR} orders per hour allowed. Please wait for previous orders to process.`
            showToast(errMsg, '⚠️')
            throw new Error(errMsg)
          }
        } catch (rateErr) {
          if (rateErr instanceof Error && rateErr.message.includes('rate limit')) {
            throw rateErr
          }
          console.warn('Server rate limit check non-fatal error:', rateErr)
        }
      }

      const coords = opts.geoLat && opts.geoLng ? { lat: opts.geoLat, lng: opts.geoLng } : null
      const { fee: deliveryFee } = calcDeliveryFee(opts.pin, coords || opts.zones, isPickup ? 'pickup' : 'delivery')
      const safeDiscount = Math.min(subtotal, Math.max(0, opts.discountAmount || 0))
      const total = Math.max(0, subtotal + deliveryFee - safeDiscount)
      
      const isFull = opts.paymentType === 'full'
      const advanceAmount = isFull ? total : opts.advanceAmount != null ? opts.advanceAmount : (total > 0 ? Math.max(1, Math.ceil(total * (ADVANCE_PERCENT / 100))) : 0)

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
        payerUpiName: opts.payerUpiName?.trim() || undefined,
        status: 'pending',
        address: opts.address.trim(),
        phone: opts.phone.trim(),
        pin: opts.pin.replace(/\D/g, ''),
        deliverySlot: opts.deliverySlot,
        deliveryDate: opts.deliveryDate,
        deliveryNotes: opts.deliveryNotes?.trim() || undefined,
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
    [user, cloud, products, priceFor, refreshCloud, orders, lang],
  )

  // ── Offline Order Queue Reconnection Engine ──────────────────────────────
  // Automatically replays and syncs any orders queued while offline as soon
  // as browser connectivity returns.
  useEffect(() => {
    const cleanup = initOfflineQueue(async (payload) => {
      await placeOrder(payload)
    })
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void syncPendingOfflineOrders(async (payload) => {
        await placeOrder(payload)
      }, lang)
    }
    return cleanup
  }, [placeOrder, lang])

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
          const staff = requireStaffCredentials(user)
          const saved = await upsertProduct(product, staff)
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
    [cloud, user],
  )

  const bulkUpdateProducts = useCallback(
    async (
      updatedList: Product[],
      onProgress?: (completed: number, total: number) => void,
    ): Promise<{ success: boolean; count: number; error?: string }> => {
      if (!updatedList.length) return { success: true, count: 0 }
      const prevSnapshot = products

      // Optimistic update
      setProducts((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]))
        updatedList.forEach((p) => map.set(p.id, p))
        const next = Array.from(map.values())
        saveProducts(next)
        return next
      })

      if (cloud) {
        try {
          const staff = requireStaffCredentials(user)
          const res = await bulkUpsertProducts(updatedList, staff, onProgress)
          if (res.errors.length > 0 && res.updated.length === 0) {
            setProducts(prevSnapshot)
            saveProducts(prevSnapshot)
            return { success: false, count: 0, error: res.errors[0].error }
          }
          setProducts((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]))
            res.updated.forEach((p) => map.set(p.id, p))
            const next = Array.from(map.values())
            saveProducts(next)
            return next
          })
          return { success: true, count: res.updated.length }
        } catch (err: any) {
          setProducts(prevSnapshot)
          saveProducts(prevSnapshot)
          return { success: false, count: 0, error: err.message || 'Bulk update failed' }
        }
      } else {
        return { success: true, count: updatedList.length }
      }
    },
    [cloud, products, user],
  )

  const addProduct = useCallback(
    async (product: Omit<Product, 'id'>) => {
      if (cloud) {
        try {
          const staff = requireStaffCredentials(user)
          const saved = await insertProduct(product, staff)
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
    [cloud, user],
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
          const staff = requireStaffCredentials(user)
          await deleteProductApi(id, staff)
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
    [cloud, user],
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
      const staff = requireStaffCredentials(user)
      await setAllProductsInStock(staff)
      await refreshCloud()
      return
    }
    const next = getProducts().map((p) => (p.archived ? p : { ...p, inStock: true }))
    saveProducts(next)
    setProducts(next)
  }, [cloud, refreshCloud, user])

  const findRecentOrder = useCallback(
    async (): Promise<Order | null> => {
      if (!user) return null
      if (cloud) return findRecentOrderForUserApi(user.id)
      const existing = getOrders()
      const found = existing.find(
        (o) => o.userId === user.id && o.status !== 'cancelled',
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

        if (cloud) {
          try {
            if (status === 'cancelled' && user?.role === 'customer') {
              const pin = getActiveUserPin(user)
              if (!pin || !user.id) throw new Error('Please log in again to cancel this order.')
              await cancelOwnOrderApi(user.id, pin, id)
            } else {
              const staff = requireStaffCredentials(user)
              await updateOrderStatusApi(id, status, staff, rejectionReason)
            }
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
    [cloud, user],
  )

  const updateOrderDeliveryDate = useCallback(
    async (id: string, deliveryDate: string) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, deliveryDate, updatedAt: new Date().toISOString() } : o)),
      )
      if (cloud) {
        try {
          const staff = requireStaffCredentials(user)
          await updateOrderDeliveryDateApi(id, deliveryDate, staff)
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
    [cloud, user],
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

      setOrders((prev) =>
        prev.map((o) =>
          staleIds.includes(o.id)
            ? { ...o, status: 'cancelled' as OrderStatus, rejectionReason: reason, updatedAt: new Date().toISOString() }
            : o,
        ),
      )

      if (cloud) {
        try {
          const staff = requireStaffCredentials(user)
          await bulkUpdateOrderStatusApi(staleIds, 'cancelled', staff, reason)
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
    [orders, cloud, user],
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

  const refreshSupportMessages = useCallback(async () => {
    if (!cloud || !userId) return
    const isStaff = userRole === 'admin' || userRole === 'seller'
    try {
      const msgs = await fetchSupportMessagesApi(isStaff ? undefined : userId)
      if (msgs && Array.isArray(msgs)) {
        setSupportMessages(msgs)
        saveStoredSupportMessages(msgs)
      }
    } catch (err) {
      console.warn('refreshSupportMessages error:', err)
    }
  }, [cloud, userId, userRole])

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
          const staff = requireStaffCredentials(user)
          await bulkUpdateOrderStatusApi(ids, status, staff)
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
    [cloud, user],
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
          const staff = requireStaffCredentials(user)
          await deleteOrderApi(id, staff)
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
    [cloud, user],
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
    const staff = requireStaffCredentials(user)
    return createCouponApi(coupon, staff)
  }, [cloud, user])

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
    async (targetUserId: string | 'all', title: string, message: string, senderName = 'Store Support') => {
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

  const loadProductReviews = useCallback(
    async (productId: string, offset = 0, limit = 20) => {
      const fetched = await fetchProductReviewsApi(productId, { limit, offset })
      if (fetched.length > 0) {
        setReviews((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]))
          fetched.forEach((r) => map.set(r.id, r))
          return Array.from(map.values())
        })
      }
      return fetched
    },
    [],
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
      bulkUpdateProducts,
      addProduct,
      deleteProduct,
      toggleStock,
      morningReset,
      updateOrderStatus,
      updateOrderDeliveryDate,
      bulkUpdateOrderStatus,
      findRecentOrder,
      deleteOrder,
      refresh,
      refreshOrdersOnly,
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
      loadProductReviews,
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
      refreshSupportMessages,
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
      bulkUpdateProducts,
      addProduct,
      deleteProduct,
      toggleStock,
      morningReset,
      updateOrderStatus,
      updateOrderDeliveryDate,
      bulkUpdateOrderStatus,
      findRecentOrder,
      deleteOrder,
      refresh,
      refreshOrdersOnly,
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
      loadProductReviews,
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
      refreshSupportMessages,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

