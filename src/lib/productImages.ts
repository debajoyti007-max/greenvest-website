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

/** Prefer local photos so broken remote URLs never hide vegetables. */
export function resolveProductImage(id: string, imageUrl?: string) {
  if (PRODUCT_IMAGES[id]) return PRODUCT_IMAGES[id]
  if (imageUrl?.startsWith('/')) return asset(imageUrl.replace(/^\//, ''))
  if (imageUrl && !imageUrl.includes('unsplash.com') && !imageUrl.includes('images.unsplash')) {
    return imageUrl
  }
  return HERO_IMAGE
}
