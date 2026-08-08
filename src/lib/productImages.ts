/** Local vegetable photos in /public/veg — use Vite BASE_URL for GitHub Pages. */
const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')

function asset(path: string) {
  const clean = path.replace(/^\//, '')
  return `${base}${clean}`
}

export const PRODUCT_IMAGES: Record<string, string> = {
  p1: asset('veg/tomato.jpg'),
  p2: asset('veg/potato.jpg'),
  p3: asset('veg/onion.jpg'),
  p4: asset('veg/spinach.jpg'),
  p5: asset('veg/carrot.jpg'),
  p6: asset('veg/cucumber.jpg'),
  p7: asset('veg/chili.jpg'),
  p8: asset('veg/cauliflower.jpg'),
  p9: asset('veg/brinjal.jpg'),
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
}

export const HERO_IMAGE = asset('veg/hero.jpg')

/** Prefer local photos & smart name matching so correct vegetable photo always shows. */
export function resolveProductImage(id: string, imageUrl?: string, name?: string) {
  // 1. If explicit valid custom upload URL from Supabase Storage
  if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:')) && !imageUrl.includes('unsplash.com')) {
    return imageUrl
  }

  const query = `${name || ''} ${id || ''} ${imageUrl || ''}`.toLowerCase()

  // 2. Smart keyword matching by English and Bengali vegetable names
  if (query.includes('bitter') || query.includes('করলা') || query.includes('উচ্ছে') || query.includes('bittergourd')) {
    return PRODUCT_IMAGES.p19
  }
  if (query.includes('coriander') || query.includes('ধনে') || query.includes('dhania')) {
    return PRODUCT_IMAGES.p16
  }
  if (query.includes('bottle') || query.includes('লাউ') || query.includes('bottlegourd')) {
    return PRODUCT_IMAGES.p18
  }
  if (query.includes('spinach') || query.includes('পালং') || query.includes('শাক')) {
    return PRODUCT_IMAGES.p4
  }
  if (query.includes('cabbage') || query.includes('বাঁধাকপি')) {
    return PRODUCT_IMAGES.p10
  }
  if (query.includes('cauliflower') || query.includes('ফুলকপি')) {
    return PRODUCT_IMAGES.p8
  }
  if (query.includes('capsicum') || query.includes('ক্যাপসিকাম')) {
    return PRODUCT_IMAGES.p11
  }
  if (query.includes('brinjal') || query.includes('বেগুন') || query.includes('बैंगন')) {
    return PRODUCT_IMAGES.p9
  }
  if (query.includes('chili') || query.includes('মরিচ') || query.includes('লঙ্কা')) {
    return PRODUCT_IMAGES.p7
  }
  if (query.includes('cucumber') || query.includes('শসা')) {
    return PRODUCT_IMAGES.p6
  }
  if (query.includes('carrot') || query.includes('গাজর')) {
    return PRODUCT_IMAGES.p5
  }
  if (query.includes('garlic') || query.includes('রসুন')) {
    return PRODUCT_IMAGES.p12
  }
  if (query.includes('ginger') || query.includes('আদা')) {
    return PRODUCT_IMAGES.p13
  }
  if (query.includes('okra') || query.includes('ঢেঁড়স') || query.includes('ভেন্ডি')) {
    return PRODUCT_IMAGES.p14
  }
  if (query.includes('beans') || query.includes('শিম')) {
    return PRODUCT_IMAGES.p15
  }
  if (query.includes('lemon') || query.includes('লেবু')) {
    return PRODUCT_IMAGES.p17
  }
  if (query.includes('radish') || query.includes('মুলা')) {
    return PRODUCT_IMAGES.p20
  }
  if (query.includes('peas') || query.includes('মটর')) {
    return PRODUCT_IMAGES.p21
  }
  if (query.includes('potato') || query.includes('আলু')) {
    return PRODUCT_IMAGES.p2
  }
  if (query.includes('onion') || query.includes('পেঁয়াজ')) {
    return PRODUCT_IMAGES.p3
  }
  if (query.includes('tomato') || query.includes('টমেটো')) {
    return PRODUCT_IMAGES.p1
  }

  // 3. Fallback by explicit ID
  if (PRODUCT_IMAGES[id]) return PRODUCT_IMAGES[id]

  // 4. Default fallback hero photo
  return HERO_IMAGE
}
