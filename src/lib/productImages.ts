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

/**
 * Always resolve product image from local /public/veg/ files using name matching.
 * The DB image_url field is IGNORED for standard products to avoid stale/wrong URLs.
 * Only truly custom uploaded images (Supabase Storage /product-images/ path) are used directly.
 */
export function resolveProductImage(id: string, imageUrl?: string, name?: string) {
  // 1. Only use imageUrl if it's a real custom upload (Supabase Storage), not a legacy CDN link
  if (
    imageUrl &&
    imageUrl.startsWith('http') &&
    (imageUrl.includes('/storage/v1/object/') || imageUrl.includes('product-images'))
  ) {
    return imageUrl
  }

  // 2. Name + ID based matching — always wins over any DB image_url
  const nameQ = `${name || ''} ${id || ''}`.toLowerCase()

  if (nameQ.includes('bitter') || nameQ.includes('করলা') || nameQ.includes('উচ্ছে') || id === 'p19')
    return PRODUCT_IMAGES.p19
  if (nameQ.includes('bottle') || nameQ.includes('লাউ') || id === 'p18')
    return PRODUCT_IMAGES.p18
  if (nameQ.includes('coriander') || nameQ.includes('ধনে') || nameQ.includes('dhania') || id === 'p16')
    return PRODUCT_IMAGES.p16
  if (nameQ.includes('spinach') || nameQ.includes('পালং') || id === 'p4')
    return PRODUCT_IMAGES.p4
  if (nameQ.includes('cabbage') || nameQ.includes('বাঁধাকপি') || id === 'p10')
    return PRODUCT_IMAGES.p10
  if (nameQ.includes('cauliflower') || nameQ.includes('ফুলকপি') || id === 'p8')
    return PRODUCT_IMAGES.p8
  if (nameQ.includes('capsicum') || nameQ.includes('ক্যাপসিকাম') || id === 'p11')
    return PRODUCT_IMAGES.p11
  if (nameQ.includes('brinjal') || nameQ.includes('বেগুন') || nameQ.includes('eggplant') || id === 'p9')
    return PRODUCT_IMAGES.p9
  if (nameQ.includes('chili') || nameQ.includes('chilli') || nameQ.includes('মরিচ') || nameQ.includes('লঙ্কা') || id === 'p7')
    return PRODUCT_IMAGES.p7
  if (nameQ.includes('cucumber') || nameQ.includes('শসা') || id === 'p6')
    return PRODUCT_IMAGES.p6
  if (nameQ.includes('carrot') || nameQ.includes('গাজর') || id === 'p5')
    return PRODUCT_IMAGES.p5
  if (nameQ.includes('garlic') || nameQ.includes('রসুন') || id === 'p12')
    return PRODUCT_IMAGES.p12
  if (nameQ.includes('ginger') || nameQ.includes('আদা') || id === 'p13')
    return PRODUCT_IMAGES.p13
  if (nameQ.includes('okra') || nameQ.includes('ঢেঁড়স') || nameQ.includes('ভেন্ডি') || id === 'p14')
    return PRODUCT_IMAGES.p14
  if (nameQ.includes('beans') || nameQ.includes('শিম') || id === 'p15')
    return PRODUCT_IMAGES.p15
  if (nameQ.includes('lemon') || nameQ.includes('লেবু') || id === 'p17')
    return PRODUCT_IMAGES.p17
  if (nameQ.includes('radish') || nameQ.includes('মুলা') || id === 'p20')
    return PRODUCT_IMAGES.p20
  if (nameQ.includes('peas') || nameQ.includes('মটর') || id === 'p21')
    return PRODUCT_IMAGES.p21
  if (nameQ.includes('potato') || nameQ.includes('আলু') || id === 'p2')
    return PRODUCT_IMAGES.p2
  if (nameQ.includes('onion') || nameQ.includes('পেঁয়াজ') || id === 'p3')
    return PRODUCT_IMAGES.p3
  if (nameQ.includes('tomato') || nameQ.includes('টমেটো') || id === 'p1')
    return PRODUCT_IMAGES.p1

  // 3. Fallback: hero photo
  return HERO_IMAGE
}
