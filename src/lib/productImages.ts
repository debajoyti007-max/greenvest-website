/** Local vegetable photos in /public/veg — use Vite BASE_URL for GitHub Pages. */
const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')

function asset(path: string) {
  const clean = path.replace(/^\//, '')
  return `${base}${clean}`
}

export const PRODUCT_IMAGES: Record<string, string> = {
  p1:  asset('veg/tomato.jpg'),
  p2:  asset('veg/potato.jpg'),
  p3:  asset('veg/onion.jpg'),
  p4:  asset('veg/spinach.jpg'),
  p5:  asset('veg/carrot.jpg'),
  p6:  asset('veg/cucumber.jpg'),
  p7:  asset('veg/chili.jpg'),
  p8:  asset('veg/cauliflower.jpg'),
  p9:  asset('veg/brinjal.jpg'),
  p10: asset('veg/cabbage.jpg'),
  p11: asset('veg/capsicum.jpg'),
  p12: asset('veg/garlic.jpg'),
  p13: asset('veg/ginger.jpg'),
  p14: asset('veg/okra.jpg'),
  p15: asset('veg/beans.jpg'),
  p16: asset('veg/coriander.jpg'),
  p17: asset('veg/lemon.jpg'),
  p18: asset('veg/bottlegourd.jpg'),
  p19: asset('veg/bittergourd.jpg'),
  p20: asset('veg/radish.jpg'),
  p21: asset('veg/peas.jpg'),
  p22: asset('veg/potol.jpg?v=2'),
  // Fish — v=2 forces CDN + browser cache refresh with new unique studio photos
  f1:  asset('veg/rohu.jpg?v=2'),
  f2:  asset('veg/catla.jpg?v=2'),
  f3:  asset('veg/prawns.jpg?v=2'),
  f4:  asset('veg/hilsa.jpg?v=2'),
  f5:  asset('veg/tilapia.jpg?v=2'),
  f6:  asset('veg/bhetki.jpg?v=3'),
  f7:  asset('veg/pabda.jpg?v=3'),
  f8:  asset('veg/tangra.jpg?v=2'),
  f9:  asset('veg/parshe.jpg?v=2'),
  f10: asset('veg/pomfret.jpg?v=2'),
}

export const HERO_IMAGE = asset('veg/hero.jpg')
export const HERO_VEGGIES_IMAGE = asset('veg/hero_veggies.jpg')
export const HERO_FISH_IMAGE = asset('veg/hero_fish.jpg')

/** Map of product name keywords → local image (always wins over DB URL) */
const NAME_MAP: Array<[string[], string]> = [
  [['bitter', 'করলা', 'উচ্ছে', 'karela'],        PRODUCT_IMAGES.p19],
  [['bottle', 'লাউ', 'lauki'],                    PRODUCT_IMAGES.p18],
  [['coriander', 'ধনে', 'dhania', 'cilantro'],   PRODUCT_IMAGES.p16],
  [['spinach', 'পালং', 'palak'],                  PRODUCT_IMAGES.p4],
  [['cabbage', 'বাঁধাকপি'],                       PRODUCT_IMAGES.p10],
  [['cauliflower', 'ফুলকপি'],                      PRODUCT_IMAGES.p8],
  [['capsicum', 'ক্যাপসিকাম', 'bell pepper'],    PRODUCT_IMAGES.p11],
  [['brinjal', 'বেগুন', 'eggplant', 'aubergine'], PRODUCT_IMAGES.p9],
  [['chili', 'chilli', 'মরিচ', 'লঙ্কা'],         PRODUCT_IMAGES.p7],
  [['cucumber', 'শসা'],                            PRODUCT_IMAGES.p6],
  [['carrot', 'গাজর'],                             PRODUCT_IMAGES.p5],
  [['garlic', 'রসুন'],                             PRODUCT_IMAGES.p12],
  [['ginger', 'আদা'],                              PRODUCT_IMAGES.p13],
  [['okra', 'ঢেঁড়স', 'ভেন্ডি', 'bhindi'],       PRODUCT_IMAGES.p14],
  [['beans', 'শিম'],                               PRODUCT_IMAGES.p15],
  [['lemon', 'লেবু'],                              PRODUCT_IMAGES.p17],
  [['radish', 'মুলা', 'মূলা'],                    PRODUCT_IMAGES.p20],
  [['peas', 'মটর'],                                PRODUCT_IMAGES.p21],
  [['potato', 'আলু'],                              PRODUCT_IMAGES.p2],
  [['onion', 'পেঁয়াজ'],                           PRODUCT_IMAGES.p3],
  [['tomato', 'টমেটো'],                            PRODUCT_IMAGES.p1],
  [['rohu', 'রুই'],                                PRODUCT_IMAGES.f1],
  [['catla', 'katla', 'কাতলা'],                    PRODUCT_IMAGES.f2],
  [['prawn', 'shrimp', 'চিংড়ি', 'chingri'],       PRODUCT_IMAGES.f3],
  [['hilsa', 'ilish', 'ইলিশ'],                     PRODUCT_IMAGES.f4],
  [['tilapia', 'তেলাপিয়া'],                        PRODUCT_IMAGES.f5],
  [['bhetki', 'ভেটকি'],                             PRODUCT_IMAGES.f6],
  [['pabda', 'পাবদা'],                             PRODUCT_IMAGES.f7],
  [['tangra', 'ট্যাংরা'],                           PRODUCT_IMAGES.f8],
  [['parshe', 'পারশে'],                            PRODUCT_IMAGES.f9],
  [['pomfret', 'পমফ্রেট'],                         PRODUCT_IMAGES.f10],
  [['potol', 'pointed gourd', 'পটোল', 'পটল'],      PRODUCT_IMAGES.p22],
  [['fish', 'মাছ'],                                PRODUCT_IMAGES.f1],
]

/** ID → local image (for seed products p1–p21) */
const ID_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_IMAGES).map(([k, v]) => [k, v])
)

/**
 * Always resolve product image from local /public/veg/ using name or ID.
 * DB image_url is COMPLETELY IGNORED — prevents any wrong CDN/Unsplash URL from showing.
 */
export function resolveProductImage(_id: string, _imageUrl?: string, name?: string): string {
  const id = _id || ''
  const nameQ = (name || '').toLowerCase()

  // 1. Exact ID match (f1–f10, p1–p22 seed items) — ALWAYS WINS
  if (id in ID_MAP) return ID_MAP[id]

  // 2. Keyword match by name (e.g. "Bagda Prawns", "Bhetki", "Rohu Fish", "Catla Fish") — ALWAYS WINS over DB URLs
  for (const [keywords, img] of NAME_MAP) {
    if (keywords.some((kw) => nameQ.includes(kw))) return img
  }

  // 3. Local veg/ relative path from DB
  if (_imageUrl && _imageUrl.startsWith('veg/')) {
    return asset(_imageUrl)
  }

  // 4. Custom user uploaded photo (only if uploaded by seller to Supabase storage)
  if (_imageUrl && _imageUrl.includes('supabase.co/storage')) {
    return _imageUrl
  }

  // 5. Fallback: if fish/seafood item return fresh Rohu photo, else fresh Tomato photo
  if (nameQ.includes('fish') || nameQ.includes('মাছ') || nameQ.includes('prawn') || nameQ.includes('chingri')) {
    return PRODUCT_IMAGES.f1
  }

  return PRODUCT_IMAGES.p1
}
