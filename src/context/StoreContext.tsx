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
  ensureSeeded,
  getCart,
  getLang,
  getOrders,
  getProducts,
  saveCart,
  saveOrders,
  saveProducts,
  setLang as persistLang,
  STORE_EVENT,
  uid,
} from '../lib/storage'
import type { CartItem, Grade, Lang, Order, OrderStatus, Product } from '../types'
import { useAuth } from './AuthContext'

interface StoreContextValue {
  products: Product[]
  cart: CartItem[]
  orders: Order[]
  lang: Lang
  setLang: (lang: Lang) => void
  addToCart: (productId: string, grade: Grade, qty?: number) => void
  updateCartQty: (productId: string, grade: Grade, qty: number) => void
  removeFromCart: (productId: string, grade: Grade) => void
  clearCart: () => void
  cartCount: number
  cartTotal: number
  priceFor: (p: Product, grade: Grade) => number
  placeOrder: (opts: { address: string; phone: string; utr: string }) => Order | null
  updateProduct: (product: Product) => void
  addProduct: (product: Omit<Product, 'id'>) => void
  deleteProduct: (id: string) => void
  toggleStock: (id: string) => void
  updateOrderStatus: (id: string, status: OrderStatus) => void
  verifyUtr: (id: string, verified: boolean) => void
  refresh: () => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [lang, setLangState] = useState<Lang>('en')

  const refresh = useCallback(() => {
    ensureSeeded()
    setProducts(getProducts())
    setCart(getCart())
    setOrders(getOrders())
    setLangState(getLang())
  }, [])

  useEffect(() => {
    refresh()
    const onStore = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('gv_')) refresh()
    }
    window.addEventListener(STORE_EVENT, onStore)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORE_EVENT, onStore)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const setLang = useCallback((l: Lang) => {
    persistLang(l)
    setLangState(l)
  }, [])

  const priceFor = useCallback((p: Product, grade: Grade) => {
    if (grade === 'A') return p.pA
    if (grade === 'B') return p.pB
    return p.pC
  }, [])

  const addToCart = useCallback((productId: string, grade: Grade, qty = 1) => {
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
  }, [])

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
    (opts: { address: string; phone: string; utr: string }) => {
      if (!user) return null
      const currentCart = getCart()
      const currentProducts = getProducts()
      if (currentCart.length === 0) return null

      const items = currentCart.map((c) => {
        const p = currentProducts.find((x) => x.id === c.productId)!
        return {
          productId: c.productId,
          name: p.name,
          emoji: p.emoji,
          grade: c.grade,
          qty: c.qty,
          unitPrice: priceFor(p, c.grade),
        }
      })

      const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
      const now = new Date().toISOString()
      const order: Order = {
        id: uid('ord'),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        items,
        total,
        advanceAmount: Math.ceil(total * 0.5),
        utr: opts.utr.trim(),
        utrVerified: false,
        status: 'advance_paid',
        address: opts.address.trim(),
        phone: opts.phone.trim(),
        createdAt: now,
        updatedAt: now,
      }

      const nextOrders = [order, ...getOrders()]
      saveOrders(nextOrders)
      setOrders(nextOrders)
      saveCart([])
      setCart([])
      return order
    },
    [user, priceFor],
  )

  const updateProduct = useCallback((product: Product) => {
    const next = getProducts().map((p) => (p.id === product.id ? product : p))
    saveProducts(next)
    setProducts(next)
  }, [])

  const addProduct = useCallback((product: Omit<Product, 'id'>) => {
    const next = [...getProducts(), { ...product, id: uid('p') }]
    saveProducts(next)
    setProducts(next)
  }, [])

  const deleteProduct = useCallback((id: string) => {
    const next = getProducts().filter((p) => p.id !== id)
    saveProducts(next)
    setProducts(next)
  }, [])

  const toggleStock = useCallback((id: string) => {
    const next = getProducts().map((p) => (p.id === id ? { ...p, inStock: !p.inStock } : p))
    saveProducts(next)
    setProducts(next)
  }, [])

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    const next = getOrders().map((o) =>
      o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
    )
    saveOrders(next)
    setOrders(next)
  }, [])

  const verifyUtr = useCallback((id: string, verified: boolean) => {
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
  }, [])

  const value = useMemo(
    () => ({
      products,
      cart,
      orders,
      lang,
      setLang,
      addToCart,
      updateCartQty,
      removeFromCart,
      clearCart,
      cartCount,
      cartTotal,
      priceFor,
      placeOrder,
      updateProduct,
      addProduct,
      deleteProduct,
      toggleStock,
      updateOrderStatus,
      verifyUtr,
      refresh,
    }),
    [
      products,
      cart,
      orders,
      lang,
      setLang,
      addToCart,
      updateCartQty,
      removeFromCart,
      clearCart,
      cartCount,
      cartTotal,
      priceFor,
      placeOrder,
      updateProduct,
      addProduct,
      deleteProduct,
      toggleStock,
      updateOrderStatus,
      verifyUtr,
      refresh,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
