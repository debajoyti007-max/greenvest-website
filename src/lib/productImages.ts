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
  f1:  asset('veg/rohu.jpg'),
  f2:  asset('veg/catla.jpg'),
  f3:  asset('veg/prawns.jpg'),
  f4:  asset('veg/hilsa.jpg'),
  f5:  asset('veg/tilapia.jpg'),
}

export const HERO_IMAGE = asset('veg/hero.jpg')

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
  [['catla', 'কাতলা'],                             PRODUCT_IMAGES.f2],
  [['prawn', 'shrimp', 'চিংড়ি', 'chingri'],       PRODUCT_IMAGES.f3],
  [['hilsa', 'ilish', 'ইলিশ'],                     PRODUCT_IMAGES.f4],
  [['tilapia', 'তেলাপিয়া'],                        PRODUCT_IMAGES.f5],
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

  // 1. Match by name keywords (most reliable — works for any DB row)
  for (const [keywords, img] of NAME_MAP) {
    if (keywords.some((kw) => nameQ.includes(kw))) return img
  }

  // 2. Match by ID (p1–p21 seed products)
  if (id in ID_MAP) return ID_MAP[id]

  // 3. Fallback
  return HERO_IMAGE
}
