import type { Lang } from '../types'

const dict = {
  shop: { en: 'Shop', bn: 'দোকান' },
  cart: { en: 'Cart', bn: 'কার্ট' },
  orders: { en: 'Orders', bn: 'অর্ডার' },
  seller: { en: 'Seller', bn: 'সেলার' },
  admin: { en: 'Admin', bn: 'অ্যাডমিন' },
  login: { en: 'Login', bn: 'লগইন' },
  logout: { en: 'Logout', bn: 'লগআউট' },
  signup: { en: 'Sign up', bn: 'সাইন আপ' },
  loading: { en: 'Loading…', bn: 'লোড হচ্ছে…' },
  search: { en: 'Search vegetables…', bn: 'সবজি খুঁজুন…' },
  all: { en: 'All', bn: 'সব' },
  vegetables: { en: 'Vegetables', bn: 'সবজি' },
  leafy: { en: 'Leafy', bn: 'পাতা' },
  spices: { en: 'Spices', bn: 'মসলা' },
  fish: { en: 'Fish', bn: 'মাছ' },
  eggs: { en: 'Eggs', bn: 'ডিম' },
  pulses: { en: 'Pulses', bn: 'ডাল' },
  notifySellerWa: { en: 'In-app Support & Updates', bn: 'ইন-অ্যাপ সাপোর্ট ও আপডেট' },
  uploadPhoto: { en: 'Upload photo', bn: 'ছবি আপলোড' },
  chooseGrade: { en: 'Choose grade', bn: 'গ্রেড বেছে নিন' },
  added: { en: 'Added ✓', bn: 'যোগ হয়েছে ✓' },
  addToCart: { en: 'Add to cart', bn: 'কার্টে যোগ' },
  cancel: { en: 'Cancel', bn: 'বাতিল' },
  selectGrade: { en: 'Select quality grade', bn: 'মানের গ্রেড বাছুন' },
  outOfStock: { en: 'Out of stock', bn: 'স্টক নেই' },
  inStock: { en: 'In stock', bn: 'স্টকে আছে' },
  viewCart: { en: 'View cart', bn: 'কার্ট দেখুন' },
  shopVeggies: { en: 'Shop fresh veggies', bn: 'তাজা সবজি দেখুন' },
  farmToDoor: { en: 'Farm to door', bn: 'তাজা বাজার' },
  yourCart: { en: 'Your cart', bn: 'আপনার কার্ট' },
  emptyCart: { en: 'Your cart is empty.', bn: 'কার্ট খালি।' },
  continueShop: { en: 'Continue shopping', bn: 'কেনাকাটা করুন' },
  remove: { en: 'Remove', bn: 'মুছুন' },
  total: { en: 'Total', bn: 'মোট' },
  advance: { en: 'Advance (50%)', bn: 'অগ্রিম (৫০%)' },
  checkout: { en: 'Proceed to checkout', bn: 'চেকআউটে যান' },
  addMore: { en: 'Add more items', bn: 'আরও কিনুন' },
  grade: { en: 'Grade', bn: 'গ্রেড' },
  deliveryAddress: { en: 'Delivery address', bn: 'ডেলিভারি ঠিকানা' },
  phone: { en: 'Phone number', bn: 'ফোন নম্বর' },
  pinCode: { en: 'PIN code', bn: 'পিন কোড' },
  utrLabel: { en: 'PhonePe / UPI Name', bn: 'PhonePe / UPI নাম' },
  placeOrder: { en: 'Place order', bn: 'অর্ডার নিশ্চিত করুন' },
  copyUpi: { en: 'Copy UPI ID', bn: 'UPI কপি করুন' },
  copied: { en: 'Copied', bn: 'কপি হয়েছে' },
  myOrders: { en: 'My orders', bn: 'আমার অর্ডার' },
  noOrders: { en: 'No orders yet.', bn: 'এখনো কোনো অর্ডার নেই।' },
  startShopping: { en: 'Start shopping', bn: 'কেনাকাটা শুরু' },
  subtotal: { en: 'Subtotal', bn: 'সাবটোটাল' },
  delivery: { en: 'Delivery', bn: 'ডেলিভারি' },
  verified: { en: 'verified', bn: 'যাচাইকৃত' },
  pending: { en: 'pending', bn: 'অপেক্ষমাণ' },
  howToPay: {
    en: '1) Tap PhonePe / GPay or scan QR → 2) Send payment → 3) Tap "I Have Paid"',
    bn: '১) PhonePe / GPay ট্যাপ করুন বা QR স্ক্যান করুন → ২) টাকা পাঠান → ৩) "পেমেন্ট করেছি" বাটনে চাপুন',
  },
  tipMin: {
    en: 'Tip: Add items until cart reaches ₹500 minimum.',
    bn: 'টিপ: কার্ট কমপক্ষে ৳৫০০ হওয়া পর্যন্ত সবজি যোগ করুন।',
  },
  name: { en: 'Your name', bn: 'আপনার নাম' },
  email: { en: 'Email', bn: 'ইমেইল' },
  password: { en: 'Password', bn: 'পাসওয়ার্ড' },
  createAccount: { en: 'Create account', bn: 'অ্যাকাউন্ট তৈরি' },
  pleaseWait: { en: 'Please wait…', bn: 'অপেক্ষা করুন…' },
  welcomeLogin: {
    en: 'Login as customer, seller, or admin',
    bn: 'কাস্টমার / সেলার / অ্যাডমিন হিসেবে লগইন',
  },
  welcomeSignup: {
    en: 'Create a new customer account',
    bn: 'নতুন কাস্টমার অ্যাকাউন্ট তৈরি করুন',
  },
  contact: { en: 'Contact Us', bn: 'যোগাযোগ করুন' },
  privacy: { en: 'Privacy & Policy', bn: 'গোপনীয়তা ও নীতি' },
  terms: { en: 'Terms', bn: 'শর্তাবলী' },
  freshTag: { en: 'Fresh groceries', bn: 'তাজা সবজি' },
  footerLine: {
    en: 'Fresh daily vegetables & fish, delivered to your door',
    bn: 'তাজা সবজি ও মাছ, সরাসরি আপনার দরজায়',
  },
  local: { en: 'Local', bn: 'লোকাল' },
  nearby: { en: 'Nearby', bn: 'কাছাকাছি' },
  far: { en: 'Far', bn: 'দূর' },
  standard: { en: 'Standard', bn: 'সাধারণ' },
  zone: { en: 'Zone', bn: 'জোন' },
  fee: { en: 'Fee', bn: 'ফি' },
  backDashboard: { en: '← Dashboard', bn: '← ড্যাশবোর্ড' },
  menu: { en: 'Menu', bn: 'মেনু' },
  orderPlaced: { en: 'Order placed!', bn: 'অর্ডার হয়েছে!' },
  orderNotFound: { en: 'Order not found', bn: 'অর্ডার পাওয়া যায়নি' },
  viewMyOrders: { en: 'View my orders', bn: 'অর্ডার দেখুন' },
  keepShopping: { en: 'Keep shopping', bn: 'আরও কিনুন' },
  utrPending: { en: 'verification pending', bn: 'যাচাই অপেক্ষমাণ' },
} as const

export type I18nKey = keyof typeof dict

export function t(lang: Lang, key: I18nKey): string {
  return dict[key][lang]
}

export function catLabel(lang: Lang, category: string): string {
  const map: Record<string, I18nKey> = {
    All: 'all',
    Vegetables: 'vegetables',
    Leafy: 'leafy',
    Spices: 'spices',
    Fish: 'fish',
    Eggs: 'eggs',
    Pulses: 'pulses',
  }
  const k = map[category]
  return k ? t(lang, k) : category
}

export function zoneLabel(lang: Lang, zone: string): string {
  const z = zone.toLowerCase()
  if (z === 'local') return t(lang, 'local')
  if (z === 'nearby') return t(lang, 'nearby')
  if (z === 'far') return t(lang, 'far')
  if (z === 'standard') return t(lang, 'standard')
  return zone
}
