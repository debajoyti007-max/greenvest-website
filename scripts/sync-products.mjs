/**
 * Upsert seed products (correct Bangla names + new items) using seller login.
 * Usage: node scripts/sync-products.mjs
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const products = [
  { id: 'p1', emoji: '🍅', name: 'Tomato', bn_name: 'টমেটো', p_a: 60, p_b: 45, p_c: 30, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/tomato.jpg' },
  { id: 'p2', emoji: '🥔', name: 'Potato', bn_name: 'আলু', p_a: 40, p_b: 30, p_c: 22, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/potato.jpg' },
  { id: 'p3', emoji: '🧅', name: 'Onion', bn_name: 'পেঁয়াজ', p_a: 55, p_b: 42, p_c: 28, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/onion.jpg' },
  { id: 'p4', emoji: '🥬', name: 'Spinach', bn_name: 'পালং শাক', p_a: 35, p_b: 25, p_c: 18, in_stock: true, category: 'Leafy', unit: 'bunch', image_url: '/veg/spinach.jpg' },
  { id: 'p5', emoji: '🥕', name: 'Carrot', bn_name: 'গাজর', p_a: 70, p_b: 50, p_c: 35, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/carrot.jpg' },
  { id: 'p6', emoji: '🥒', name: 'Cucumber', bn_name: 'শসা', p_a: 45, p_b: 32, p_c: 20, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/cucumber.jpg' },
  { id: 'p7', emoji: '🌶️', name: 'Green Chili', bn_name: 'কাঁচা মরিচ', p_a: 120, p_b: 90, p_c: 60, in_stock: true, category: 'Spices', unit: 'kg', image_url: '/veg/chili.jpg' },
  { id: 'p8', emoji: '🥦', name: 'Cauliflower', bn_name: 'ফুলকপি', p_a: 50, p_b: 38, p_c: 25, in_stock: true, category: 'Vegetables', unit: 'pc', image_url: '/veg/cauliflower.jpg' },
  { id: 'p9', emoji: '🍆', name: 'Brinjal', bn_name: 'বেগুন', p_a: 55, p_b: 40, p_c: 28, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/brinjal.jpg' },
  { id: 'p10', emoji: '🥬', name: 'Cabbage', bn_name: 'বাঁধাকপি', p_a: 45, p_b: 32, p_c: 22, in_stock: true, category: 'Vegetables', unit: 'pc', image_url: '/veg/cabbage.jpg' },
  { id: 'p11', emoji: '🫑', name: 'Capsicum', bn_name: 'ক্যাপসিকাম', p_a: 90, p_b: 70, p_c: 50, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/capsicum.jpg' },
  { id: 'p12', emoji: '🧄', name: 'Garlic', bn_name: 'রসুন', p_a: 180, p_b: 140, p_c: 100, in_stock: true, category: 'Spices', unit: 'kg', image_url: '/veg/garlic.jpg' },
  { id: 'p13', emoji: '🫚', name: 'Ginger', bn_name: 'আদা', p_a: 160, p_b: 120, p_c: 90, in_stock: true, category: 'Spices', unit: 'kg', image_url: '/veg/ginger.jpg' },
  { id: 'p14', emoji: '🌿', name: 'Okra', bn_name: 'ঢেঁড়স', p_a: 70, p_b: 55, p_c: 40, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/okra.jpg' },
  { id: 'p15', emoji: '🫛', name: 'Beans', bn_name: 'শিম', p_a: 80, p_b: 60, p_c: 45, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/beans.jpg' },
  { id: 'p16', emoji: '🌿', name: 'Coriander', bn_name: 'ধনে পাতা', p_a: 30, p_b: 20, p_c: 15, in_stock: true, category: 'Leafy', unit: 'bunch', image_url: '/veg/coriander.jpg' },
  { id: 'p17', emoji: '🍋', name: 'Lemon', bn_name: 'লেবু', p_a: 100, p_b: 80, p_c: 60, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/lemon.jpg' },
  { id: 'p18', emoji: '🥒', name: 'Bottle Gourd', bn_name: 'লাউ', p_a: 40, p_b: 30, p_c: 20, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/bottlegourd.jpg' },
  { id: 'p19', emoji: '🥒', name: 'Bitter Gourd', bn_name: 'করলা', p_a: 65, p_b: 50, p_c: 35, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/bittergourd.jpg' },
  { id: 'p20', emoji: '🌱', name: 'Radish', bn_name: 'মুলা', p_a: 40, p_b: 28, p_c: 18, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/radish.jpg' },
  { id: 'p21', emoji: '🫛', name: 'Green Peas', bn_name: 'মটরশুঁটি', p_a: 90, p_b: 70, p_c: 50, in_stock: true, category: 'Vegetables', unit: 'kg', image_url: '/veg/peas.jpg' },
  { id: 'p22', emoji: '🐟', name: 'Rohu Fish', bn_name: 'রুই মাছ', p_a: 280, p_b: 240, p_c: 200, in_stock: true, category: 'Fish', unit: 'kg', image_url: null },
  { id: 'p23', emoji: '🐟', name: 'Katla Fish', bn_name: 'কাতলা মাছ', p_a: 300, p_b: 260, p_c: 220, in_stock: true, category: 'Fish', unit: 'kg', image_url: null },
  { id: 'p24', emoji: '🥚', name: 'Eggs (12)', bn_name: 'ডিম (১২টা)', p_a: 90, p_b: 80, p_c: 70, in_stock: true, category: 'Eggs', unit: 'tray', image_url: null },
  { id: 'p25', emoji: '🫘', name: 'Moong Dal', bn_name: 'মুগ ডাল', p_a: 140, p_b: 120, p_c: 100, in_stock: true, category: 'Pulses', unit: 'kg', image_url: null },
  { id: 'p26', emoji: '🫘', name: 'Masoor Dal', bn_name: 'মসুর ডাল', p_a: 130, p_b: 110, p_c: 95, in_stock: true, category: 'Pulses', unit: 'kg', image_url: null },
  { id: 'p27', emoji: '🫘', name: 'Chana Dal', bn_name: 'ছোলার ডাল', p_a: 120, p_b: 100, p_c: 85, in_stock: true, category: 'Pulses', unit: 'kg', image_url: null },
]

const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: anon,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'seller@demo.com', password: 'demo123' }),
})
const authJson = await authRes.json()
if (!authRes.ok) {
  console.error('Seller login failed:', authJson)
  process.exit(1)
}

const upsertRes = await fetch(`${url}/rest/v1/products?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${authJson.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(products),
})
const upsertJson = await upsertRes.json()
if (!upsertRes.ok) {
  console.error('Upsert failed:', upsertJson)
  process.exit(1)
}
console.log(`Synced ${Array.isArray(upsertJson) ? upsertJson.length : '?'} products with Bangla names + fish/egg/dal.`)
