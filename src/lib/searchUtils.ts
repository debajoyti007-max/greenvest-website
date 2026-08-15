import type { Product } from '../types'

/**
 * Banglish & regional phonetic alias mapping for vegetables, fish, and staples.
 * Allows users to type in English letters (e.g., 'alu', 'peyaj', 'potol', 'chingri')
 * or Hindi/regional slang and find the right products instantly.
 */
const BANGLISH_ALIASES: Record<string, string[]> = {
  // Vegetables
  p1: ['tomato', 'tamatar', 'tometo', 'tomatar', 'টমেটো'],
  p2: ['potato', 'alu', 'aloo', 'aaloo', 'batata', 'আলু'],
  p3: ['onion', 'peyaj', 'piyaj', 'peaj', 'kanda', 'pyaj', 'pyaaz', 'পেঁয়াজ'],
  p4: ['spinach', 'palong', 'palang', 'palak', 'sak', 'shaak', 'saag', 'পালং শাক'],
  p5: ['carrot', 'gajor', 'gajar', 'গাজর'],
  p6: ['cucumber', 'shosha', 'sosa', 'kheera', 'khira', 'শসা'],
  p7: ['green chili', 'chili', 'chilli', 'lonka', 'lanka', 'morich', 'marich', 'mirch', 'mirchi', 'কাঁচা মরিচ', 'কাঁচালঙ্কা'],
  p8: ['cauliflower', 'fulkopi', 'phulkopi', 'gobi', 'phool gobi', 'ফুলকপি'],
  p9: ['brinjal', 'begun', 'baingan', 'eggplant', 'aubergine', 'বেগুন'],
  p10: ['cabbage', 'badhakopi', 'bandhakopi', 'patta gobi', 'বাঁধাকপি'],
  p11: ['capsicum', 'shimla mirch', 'capsicom', 'ক্যাপসিকাম'],
  p12: ['garlic', 'roshun', 'rosun', 'lasun', 'lahsun', 'রসুন'],
  p13: ['ginger', 'ada', 'adrak', 'adhrak', 'আদা'],
  p14: ['okra', 'dherosh', 'dheros', 'bhendi', 'bhindi', 'ladyfinger', 'ঢেঁড়স'],
  p15: ['beans', 'shim', 'seem', 'farasbi', 'শিম'],
  p16: ['coriander', 'dhone pata', 'dhone', 'dhonye', 'dhaniya', 'kotmir', 'ধনে পাতা'],
  p17: ['lemon', 'lebu', 'nimbu', 'neebu', 'লেবু', 'পাতিলেবু', 'গন্ধরাজ'],
  p18: ['bottle gourd', 'lau', 'lao', 'lauki', 'kaddu', 'লাউ'],
  p19: ['bitter gourd', 'korola', 'karola', 'uchhe', 'ucche', 'karela', 'করলা', 'উচ্ছে'],
  p20: ['radish', 'mula', 'mulo', 'mooli', 'muli', 'মুলা', 'মুলো'],
  p21: ['green peas', 'peas', 'motorshuti', 'matar', 'motor', 'shuti', 'মটরশুঁটি'],
  p22: ['pointed gourd', 'potol', 'patol', 'parwal', 'parval', 'পটোল', 'পটল'],

  // Fish
  f1: ['rohu', 'rui', 'rui mach', 'rohu fish', 'রুই মাছ', 'রুই'],
  f2: ['catla', 'katla', 'katla mach', 'কাতলা মাছ', 'কাতলা'],
  f3: ['prawn', 'prawns', 'bagda', 'chingri', 'chingree', 'jhinga', 'বাগদা চিংড়ি', 'চিংড়ি'],
  f4: ['hilsa', 'ilish', 'ilish mach', 'ইলিশ মাছ', 'ইলিশ'],
  f5: ['tilapia', 'telapia', 'তেলাপিয়া মাছ', 'তেলাপিয়া'],
  f6: ['bhetki', 'vetki', 'bhekti', 'barramundi', 'ভেটকি মাছ', 'ভেটকি'],
  f7: ['pabda', 'pabda mach', 'পাবদা মাছ', 'পাবদা'],
  f8: ['tangra', 'tengra', 'tangra mach', 'ট্যাংরা মাছ', 'ট্যাংরা'],
  f9: ['parshe', 'parse', 'parse mach', 'পারশে মাছ', 'পারশে'],
  f10: ['pomfret', 'pomfret mach', 'পমফ্রেট মাছ', 'পমফ্রেট'],
}

/**
 * Normalizes text by removing diacritics, punctuation, extra spaces, and converting to lowercase.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0980-\u09FF]/gi, '') // keeps alphanumeric and Bengali unicode
    .replace(/\s+/g, ' ')
}

/**
 * Checks if a product matches a user search query using:
 * 1. English name
 * 2. Bengali name
 * 3. Category
 * 4. Banglish & regional phonetic aliases
 */
export function matchesProductQuery(product: Product, rawQuery: string): boolean {
  const query = normalizeSearchText(rawQuery)
  if (!query) return true

  // Direct check in standard fields
  const normName = normalizeSearchText(product.name)
  const normBnName = normalizeSearchText(product.bnName)
  const normCat = normalizeSearchText(product.category)

  if (normName.includes(query) || normBnName.includes(query) || normCat.includes(query)) {
    return true
  }

  // Check Banglish aliases for this product ID
  const aliases = BANGLISH_ALIASES[product.id] || []
  for (const alias of aliases) {
    const normAlias = normalizeSearchText(alias)
    if (normAlias.includes(query) || query.includes(normAlias)) {
      return true
    }
  }

  // Broad category alias checks (e.g. searching 'mach' matches all fish items)
  if (
    (query.startsWith('mach') || query === 'fish' || query === 'মাছ') &&
    product.category.toLowerCase() === 'fish'
  ) {
    return true
  }

  if (
    (query === 'shaak' || query === 'saag' || query === 'sak' || query === 'পাতা') &&
    (product.category.toLowerCase() === 'leafy' || normName.includes('spinach') || normName.includes('coriander'))
  ) {
    return true
  }

  return false
}
