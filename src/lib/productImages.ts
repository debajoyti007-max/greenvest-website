/** Local vegetable photos in /public/veg (reliable, no broken CDN). */
export const PRODUCT_IMAGES: Record<string, string> = {
  p1: '/veg/tomato.jpg',
  p2: '/veg/potato.jpg',
  p3: '/veg/onion.jpg',
  p4: '/veg/spinach.jpg',
  p5: '/veg/carrot.jpg',
  p6: '/veg/cucumber.jpg',
  p7: '/veg/chili.jpg',
  p8: '/veg/cauliflower.jpg',
  p9: '/veg/brinjal.jpg',
  p10: '/veg/cabbage.jpg',
  p11: '/veg/capsicum.jpg',
  p12: '/veg/garlic.jpg',
  p13: '/veg/ginger.jpg',
  p14: '/veg/okra.jpg',
  p15: '/veg/beans.jpg',
  p16: '/veg/coriander.jpg',
  p17: '/veg/lemon.jpg',
  p18: '/veg/bottlegourd.jpg',
  p19: '/veg/bittergourd.jpg',
  p20: '/veg/radish.jpg',
  p21: '/veg/peas.jpg',
}

export const HERO_IMAGE = '/veg/hero.jpg'

/** Prefer local photos so broken remote URLs never hide vegetables. */
export function resolveProductImage(id: string, imageUrl?: string) {
  if (PRODUCT_IMAGES[id]) return PRODUCT_IMAGES[id]
  if (imageUrl && imageUrl.startsWith('/')) return imageUrl
  if (imageUrl && !imageUrl.includes('unsplash.com') && !imageUrl.includes('images.unsplash')) {
    return imageUrl
  }
  return HERO_IMAGE
}
