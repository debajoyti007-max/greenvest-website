import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  bulkUpdateOrderStatusApi,
  checkDuplicateUtrApi,
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
  saveDailyReport as saveDailyReportApi,
  fetchDailyReport as fetchDailyReportApi,
  fetchDeliveryZones as fetchDeliveryZonesApi,
} from '../lib/api'
import { ALLOW_LOCAL_FALLBACK, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee } from '../lib/delivery'
import { isSupabaseConfigured } from '../lib/supabase'
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
}

interface StoreContextValue {
  products: Product[]
  cart: CartItem[]
  orders: Order[]
  lang: Lang
  loading: boolean
  setLang: (lang: Lang) => void
  addToCart: (productId: string, grade: Grade, qty?: number) => void
  updateCartQty: (productId: string, grade: Grade, qty: number) => void
  removeFromCart: (productId: string, grade: Grade) => void
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
  verifyUtr: (id: string, verified: boolean) => Promise<void>
  deleteOrder: (id: string) => Promise<void>
  refresh: () => Promise<void>
  fetchAddresses: (userId: string) => Promise<Address[]>
  saveAddress: (addr: Address) => Promise<void>
  deleteAddress: (id: number) => Promise<void>
  validateCoupon: (code: string, orderTotal: number) => Promise<Coupon | null>
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
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [lang, setLangState] = useState<Lang>('en')
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

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

  const refreshCloud = useCallback(async () => {
    try {
      const prods = await fetchProducts()
      setProducts(prods)
      setCart(getCart())
      const l = getLang()
      setLangState(l)
      document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
      document.body.classList.toggle('lang-bn', l === 'bn')
      if (user) {
        const ords = await fetchOrders()
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
    setCart(getCart())
    setOrders([])
    const l = getLang()
    setLangState(l)
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
    document.body.classList.toggle('lang-bn', l === 'bn')
    setLoading(false)
  }, [cloud, refreshCloud, refreshLocal])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onStore = () => {
      if (cloud) {
        setCart(getCart())
        setLangState(getLang())
      } else if (ALLOW_LOCAL_FALLBACK) {
        refreshLocal()
      } else {
        setCart(getCart())
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
  }, [cloud, refreshLocal])

  useEffect(() => {
    if (!cloud) return
    return subscribeProducts(async () => {
      try {
        const prods = await fetchProducts()
        setProducts(prods)
      } catch { /* */ }
    })
  }, [cloud])

  useEffect(() => {
    if (!cloud || !user) return
    return subscribeOrders(() => {
      void refreshCloud()
    })
  }, [cloud, user, refreshCloud])

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

  const addToCart = useCallback((productId: string, grade: Grade, qty = 1) => {
    const p = products.find((x) => x.id === productId)
    if (p && !p.inStock) return

    const current = getCart()
    const idx = current.findIndex((c) => c.productId === productId && c.grade === grade)

    let next: CartItem[]
    if (idx >= 0) {
      next = current.map((c, i) => (i === idx ? { ...c, qty: c.qty + qty } : c))
    } else {
      next = [...current, { productId, grade, qty }]
    }
    saveCart(next)
    setCart(next)
  }, [products])

  const updateCartQty = useCallback((productId: string, grade: Grade, qty: number) => {
    const next = getCart()
      .map((c) => (c.productId === productId && c.grade === grade ? { ...c, qty } : c))
      .filter((c) => c.qty > 0)
    saveCart(next)
    setCart(next)
  }, [])

  const removeFromCart = useCallback((productId: string, grade: Grade) => {
    const next = getCart().filter((c) => !(c.productId === productId && c.grade === grade))
    saveCart(next)
    setCart(next)
  }, [])

  const clearCart = useCallback(() => {
    saveCart([])
    setCart([])
  }, [])

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart])

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const p = products.find((x) => x.id === item.productId)
      if (!p) return sum
      return sum + priceFor(p, item.grade) * item.qty
    }, 0)
  }, [cart, products, priceFor])

  const placeOrder = useCallback(
    async (opts: PlaceOrderOpts) => {
      if (!user) return null
      const currentCart = getCart()
      if (currentCart.length === 0) return null

      const catalog = cloud ? products : getProducts()
      const items = currentCart
        .map((c) => {
          const p = catalog.find((x) => x.id === c.productId)
          if (!p) return null
          return {
            productId: c.productId,
            name: p.name,
            emoji: p.emoji,
            grade: c.grade,
            qty: c.qty,
            unitPrice: priceFor(p, c.grade),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (items.length === 0) return null

      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
      if (subtotal < MIN_ORDER_AMOUNT) return null
      const { fee: deliveryFee } = calcDeliveryFee(opts.pin, opts.zones)
      const total = Math.max(0, subtotal + deliveryFee - (opts.discountAmount || 0))
      const now = new Date().toISOString()
      const order: Order = {
        id: uid('ord'),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        items,
        subtotal,
        deliveryFee,
        total,
        advanceAmount: Math.ceil(total * 0.5),
        utr: opts.utr.trim(),
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
        await createOrder(order)
        saveDelivery(user.id, {
          address: order.address,
          phone: order.phone,
          pin: order.pin,
          deliverySlot: order.deliverySlot,
        })
        saveCart([])
        setCart([])
        await refreshCloud()
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
      saveCart([])
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
      const next = [...getCart()]

      for (const it of order.items) {
        const p = catalog.find((x) => x.id === it.productId)
        if (!p || !p.inStock || p.archived) {
          skipped += 1
          continue
        }
        const idx = next.findIndex((c) => c.productId === it.productId && c.grade === it.grade)
        if (idx >= 0) {
          next[idx] = { ...next[idx], qty: next[idx].qty + it.qty }
        } else {
          next.push({ productId: it.productId, grade: it.grade, qty: it.qty })
        }
        added += 1
      }

      saveCart(next)
      setCart(next)
      return { added, skipped }
    },
    [cloud, products],
  )

  const updateProduct = useCallback(
    async (product: Product) => {
      if (cloud) {
        const saved = await upsertProduct(product)
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
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
        const saved = await insertProduct(product)
        setProducts((prev) => [...prev, saved])
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
      if (cloud) {
        await deleteProductApi(id)
        setProducts((prev) => prev.filter((p) => p.id !== id))
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
    const next = getProducts().map((p) => ({ ...p, inStock: true }))
    saveProducts(next)
    setProducts(next)
  }, [cloud, refreshCloud])

  const checkDuplicateUtr = useCallback(
    async (utr: string): Promise<boolean> => {
      const clean = utr.trim()
      if (clean.length < 6) return false
      if (cloud) {
        return checkDuplicateUtrApi(clean)
      }
      const existing = getOrders()
      return existing.some((o) => o.utr === clean && o.status !== 'cancelled')
    },
    [cloud],
  )

  const updateOrderStatus = useCallback(
    async (id: string, status: OrderStatus) => {
      if (cloud) {
        await updateOrderStatusApi(id, status)
        await refreshCloud()
        return
      }
      const next = getOrders().map((o) =>
        o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
      )
      saveOrders(next)
      setOrders(next)
    },
    [cloud, refreshCloud],
  )

  const bulkUpdateOrderStatus = useCallback(
    async (ids: string[], status: OrderStatus) => {
      if (ids.length === 0) return
      if (cloud) {
        await bulkUpdateOrderStatusApi(ids, status)
        await refreshCloud()
        return
      }
      const next = getOrders().map((o) =>
        ids.includes(o.id) ? { ...o, status, updatedAt: new Date().toISOString() } : o,
      )
      saveOrders(next)
      setOrders(next)
    },
    [cloud, refreshCloud],
  )

  const verifyUtr = useCallback(
    async (id: string, verified: boolean) => {
      if (cloud) {
        await verifyUtrApi(id, verified)
        await refreshCloud()
        return
      }
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
      setOrders(next)
    },
    [cloud, refreshCloud],
  )

  const deleteOrder = useCallback(
    async (id: string) => {
      if (cloud) {
        await deleteOrderApi(id)
        await refreshCloud()
        return
      }
      const next = getOrders().filter((o) => o.id !== id)
      saveOrders(next)
      setOrders(next)
    },
    [cloud, refreshCloud],
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
      const current = getAppNotifications()
      const next = [newNotif, ...current]
      saveAppNotifications(next)
      setNotifications(next)
      showToast(lang === 'bn' ? '📢 নোটিফিকেশন পাঠানো হয়েছে!' : '📢 Notification sent successfully!', '📢')
    },
    [lang],
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
      verifyUtr,
      deleteOrder,
      refresh,
      fetchAddresses,
      saveAddress,
      deleteAddress,
      validateCoupon,
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
      verifyUtr,
      deleteOrder,
      refresh,
      fetchAddresses,
      saveAddress,
      deleteAddress,
      validateCoupon,
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
