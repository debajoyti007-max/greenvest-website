import type { Product } from '../types'
import { PRODUCT_IMAGES } from '../lib/productImages'

/** Catalog seed for local DEV only (production uses Supabase products). */
export const SEED_PRODUCTS: Product[] = [
  { id: 'p1', emoji: '🍅', name: 'Tomato', bnName: 'টমেটো', pA: 60, pB: 45, pC: 30, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p1 },
  { id: 'p2', emoji: '🥔', name: 'Potato', bnName: 'আলু', pA: 40, pB: 30, pC: 22, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p2 },
  { id: 'p3', emoji: '🧅', name: 'Onion', bnName: 'পেঁয়াজ', pA: 55, pB: 42, pC: 28, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p3 },
  { id: 'p4', emoji: '🥬', name: 'Spinach', bnName: 'পালং শাক', pA: 35, pB: 25, pC: 18, inStock: true, category: 'Leafy', unit: 'bunch', imageUrl: PRODUCT_IMAGES.p4 },
  { id: 'p5', emoji: '🥕', name: 'Carrot', bnName: 'গাজর', pA: 70, pB: 50, pC: 35, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p5 },
  { id: 'p6', emoji: '🥒', name: 'Cucumber', bnName: 'শসা', pA: 45, pB: 32, pC: 20, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p6 },
  { id: 'p7', emoji: '🌶️', name: 'Green Chili', bnName: 'কাঁচা মরিচ', pA: 120, pB: 90, pC: 60, inStock: true, category: 'Spices', unit: 'kg', imageUrl: PRODUCT_IMAGES.p7 },
  { id: 'p8', emoji: '🥦', name: 'Cauliflower', bnName: 'ফুলকপি', pA: 50, pB: 38, pC: 25, inStock: true, category: 'Vegetables', unit: 'pc', imageUrl: PRODUCT_IMAGES.p8 },
  { id: 'p9', emoji: '🍆', name: 'Brinjal', bnName: 'बैंगন', pA: 55, pB: 40, pC: 28, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p9 },
  { id: 'p10', emoji: '🥬', name: 'Cabbage', bnName: 'বাঁধাকপি', pA: 45, pB: 32, pC: 22, inStock: true, category: 'Vegetables', unit: 'pc', imageUrl: PRODUCT_IMAGES.p10 },
  { id: 'p11', emoji: '🫑', name: 'Capsicum', bnName: 'ক্যাপসিকাম', pA: 90, pB: 70, pC: 50, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p11 },
  { id: 'p12', emoji: '🧄', name: 'Garlic', bnName: 'রসুন', pA: 180, pB: 140, pC: 100, inStock: true, category: 'Spices', unit: 'kg', imageUrl: PRODUCT_IMAGES.p12 },
  { id: 'p13', emoji: '🫚', name: 'Ginger', bnName: 'আদা', pA: 160, pB: 120, pC: 90, inStock: true, category: 'Spices', unit: 'kg', imageUrl: PRODUCT_IMAGES.p13 },
  { id: 'p14', emoji: '🌿', name: 'Okra', bnName: 'ঢেঁড়স', pA: 70, pB: 55, pC: 40, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p14 },
  { id: 'p15', emoji: '🫛', name: 'Beans', bnName: 'শিম', pA: 80, pB: 60, pC: 45, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p15 },
  { id: 'p16', emoji: '🌿', name: 'Coriander', bnName: 'ধনে পাতা', pA: 30, pB: 20, pC: 15, inStock: true, category: 'Leafy', unit: 'bunch', imageUrl: PRODUCT_IMAGES.p16 },
  { id: 'p17', emoji: '🍋', name: 'Lemon', bnName: 'লেবু', pA: 100, pB: 80, pC: 60, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p17 },
  { id: 'p18', emoji: '🥒', name: 'Bottle Gourd', bnName: 'লাউ', pA: 40, pB: 30, pC: 20, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p18 },
  { id: 'p19', emoji: '🥒', name: 'Bitter Gourd', bnName: 'করলা', pA: 65, pB: 50, pC: 35, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p19 },
  { id: 'p20', emoji: '🌱', name: 'Radish', bnName: 'মুলা', pA: 40, pB: 28, pC: 18, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p20 },
  { id: 'p21', emoji: '🫛', name: 'Green Peas', bnName: 'মটরশুঁটি', pA: 90, pB: 70, pC: 50, inStock: true, category: 'Vegetables', unit: 'kg', imageUrl: PRODUCT_IMAGES.p21 },
  { id: 'f1', emoji: '🐟', name: 'Rohu Fish', bnName: 'রুই মাছ', pA: 280, pB: 220, pC: 160, inStock: true, category: 'Fish', unit: 'kg', soldAs: 'loose' },
  { id: 'f2', emoji: '🐠', name: 'Catla Fish', bnName: 'কাতলা মাছ', pA: 320, pB: 260, pC: 190, inStock: true, category: 'Fish', unit: 'kg', soldAs: 'loose' },
  { id: 'f3', emoji: '🦐', name: 'Prawns', bnName: 'চিংড়ি', pA: 550, pB: 420, pC: 300, inStock: true, category: 'Fish', unit: 'kg', soldAs: 'packet', gramOptions: [250, 500, 1000] },
  { id: 'f4', emoji: '🐡', name: 'Hilsa Fish', bnName: 'ইলিশ মাছ', pA: 800, pB: 650, pC: 500, inStock: true, category: 'Fish', unit: 'pc', soldAs: 'loose' },
  { id: 'f5', emoji: '🐟', name: 'Tilapia', bnName: 'তেলাপিয়া', pA: 180, pB: 140, pC: 100, inStock: true, category: 'Fish', unit: 'kg', soldAs: 'loose' },
]

export function ensureAllSeedProducts(list: Product[]): Product[] {
  const ids = new Set(list.map((p) => p.id))
  const missing = SEED_PRODUCTS.filter((sp) => !ids.has(sp.id))
  if (missing.length === 0) return list
  return [...list, ...missing].sort((a, b) => a.name.localeCompare(b.name))
}
