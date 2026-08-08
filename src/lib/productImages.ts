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

  // 2. Strict name & ID query (excludes imageUrl so old tomato links never contaminate search)
  const nameQuery = `${name || ''} ${id || ''}`.toLowerCase()

  if (nameQuery.includes('bitter') || nameQuery.includes('করলা') || nameQuery.includes('উচ্ছে') || nameQuery.includes('bittergourd') || id === 'p19') {
    return PRODUCT_IMAGES.p19
  }
  if (nameQuery.includes('coriander') || nameQuery.includes('ধনে') || nameQuery.includes('dhania') || id === 'p16') {
    return PRODUCT_IMAGES.p16
  }
  if (nameQuery.includes('bottle') || nameQuery.includes('লাউ') || nameQuery.includes('bottlegourd') || id === 'p18') {
    return PRODUCT_IMAGES.p18
  }
  if (nameQuery.includes('spinach') || nameQuery.includes('পালং') || nameQuery.includes('শাক') || id === 'p4') {
    return PRODUCT_IMAGES.p4
  }
  if (nameQuery.includes('cabbage') || nameQuery.includes('বাঁধাকপি') || id === 'p10') {
    return PRODUCT_IMAGES.p10
  }
  if (nameQuery.includes('cauliflower') || nameQuery.includes('ফুলকপি') || id === 'p8') {
    return PRODUCT_IMAGES.p8
  }
  if (nameQuery.includes('capsicum') || nameQuery.includes('ক্যাপসিকাম') || id === 'p11') {
    return PRODUCT_IMAGES.p11
  }
  if (nameQuery.includes('brinjal') || nameQuery.includes('বেগুন') || nameQuery.includes('बैंगন') || id === 'p9') {
    return PRODUCT_IMAGES.p9
  }
  if (nameQuery.includes('chili') || nameQuery.includes('মরিচ') || nameQuery.includes('লঙ্কা') || id === 'p7') {
    return PRODUCT_IMAGES.p7
  }
  if (nameQuery.includes('cucumber') || nameQuery.includes('শসা') || id === 'p6') {
    return PRODUCT_IMAGES.p6
  }
  if (nameQuery.includes('carrot') || nameQuery.includes('গাজর') || id === 'p5') {
    return PRODUCT_IMAGES.p5
  }
  if (nameQuery.includes('garlic') || nameQuery.includes('রসুন') || id === 'p12') {
    return PRODUCT_IMAGES.p12
  }
  if (nameQuery.includes('ginger') || nameQuery.includes('আদা') || id === 'p13') {
    return PRODUCT_IMAGES.p13
  }
  if (nameQuery.includes('okra') || nameQuery.includes('ঢেঁড়স') || nameQuery.includes('ভেন্ডি') || id === 'p14') {
    return PRODUCT_IMAGES.p14
  }
  if (nameQuery.includes('beans') || nameQuery.includes('শিম') || id === 'p15') {
    return PRODUCT_IMAGES.p15
  }
  if (nameQuery.includes('lemon') || nameQuery.includes('লেবু') || id === 'p17') {
    return PRODUCT_IMAGES.p17
  }
  if (nameQuery.includes('radish') || nameQuery.includes('মুলা') || id === 'p20') {
    return PRODUCT_IMAGES.p20
  }
  if (nameQuery.includes('peas') || nameQuery.includes('মটর') || id === 'p21') {
    return PRODUCT_IMAGES.p21
  }
  if (nameQuery.includes('potato') || nameQuery.includes('আলু') || id === 'p2') {
    return PRODUCT_IMAGES.p2
  }
  if (nameQuery.includes('onion') || nameQuery.includes('পেঁয়াজ') || id === 'p3') {
    return PRODUCT_IMAGES.p3
  }
  if (nameQuery.includes('tomato') || nameQuery.includes('টমেটো') || id === 'p1') {
    return PRODUCT_IMAGES.p1
  }

  // 3. Fallback to valid /veg/ image path if provided
  if (imageUrl?.startsWith('/veg/')) {
    return asset(imageUrl)
  }

  // 4. Default fallback hero photo
  return HERO_IMAGE
}
