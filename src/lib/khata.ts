import type { KhataEntry } from '../types'
import { formatWhatsAppPhone } from './whatsapp'
import { UPI_ID, UPI_BANK } from './business'

const KHATA_STORAGE_KEY = 'gv_khata_ledger_v1'

/** Reads all ledger entries from persistent local storage */
export function getStoredKhataEntries(): KhataEntry[] {
  try {
    const raw = localStorage.getItem(KHATA_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as KhataEntry[]
  } catch (e) {
    console.error('Failed to load Khata ledger from storage', e)
    return []
  }
}

/** Saves all ledger entries to persistent local storage */
export function saveKhataEntries(entries: KhataEntry[]): void {
  try {
    localStorage.setItem(KHATA_STORAGE_KEY, JSON.stringify(entries))
  } catch (e) {
    console.error('Failed to save Khata ledger to storage', e)
  }
}

/** Calculates total outstanding balance for a user (positive means customer owes money to the shop) */
export function calculateUserKhataBalance(userId: string, entries?: KhataEntry[]): number {
  const allEntries = entries || getStoredKhataEntries()
  const userEntries = allEntries.filter((e) => e.userId === userId)
  if (userEntries.length === 0) return 0

  return userEntries.reduce((total, entry) => {
    if (entry.type === 'order_debit') {
      return total + entry.amount
    } else if (entry.type === 'payment_credit') {
      return total - entry.amount
    } else if (entry.type === 'adjustment') {
      return total + entry.amount
    }
    return total
  }, 0)
}

/** Appends a new Khata transaction and calculates new balance */
export function recordKhataTransaction(
  userId: string,
  type: 'order_debit' | 'payment_credit' | 'adjustment',
  amount: number,
  notes?: string,
  orderId?: string,
  recordedBy?: string,
): { entry: KhataEntry; newBalance: number } {
  const currentEntries = getStoredKhataEntries()
  const currentBalance = calculateUserKhataBalance(userId, currentEntries)
  
  let newBalance = currentBalance
  if (type === 'order_debit' || type === 'adjustment') {
    newBalance += amount
  } else if (type === 'payment_credit') {
    newBalance -= amount
  }

  const entry: KhataEntry = {
    id: `KH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    orderId,
    type,
    amount,
    balanceAfter: newBalance,
    notes,
    recordedBy: recordedBy || 'GreenVest Store',
    createdAt: new Date().toISOString(),
  }

  const updatedEntries = [entry, ...currentEntries]
  saveKhataEntries(updatedEntries)

  return { entry, newBalance }
}

/** Generates a formatted WhatsApp payment reminder message with UPI details */
export function buildKhataReminderWhatsAppUrl(
  customer: { name: string; phone: string; balance: number },
  lang: 'bn' | 'en' = 'bn',
): string {
  const digits = formatWhatsAppPhone(customer.phone)
  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=GreenVest&am=${customer.balance}&cu=INR`
  
  const textBn = `নমস্কার *${customer.name}*,
গ্রীনভেস্ট স্টোর (GreenVest) থেকে আপনার ডিজিটাল খাতা বিবরণ:

📋 বর্তমান বকেয়া: *₹${customer.balance}*
🏦 UPI ID: *${UPI_ID}* (${UPI_BANK})

বকেয়া পরিশোধের জন্য নিচের লিংকে ক্লিক করুন:
${upiLink}

ধন্যবাদ,
গ্রীনভেস্ট স্টোর`

  const textEn = `Hello *${customer.name}*,
Here is your digital Khata statement from GreenVest Store:

📋 Outstanding Balance: *₹${customer.balance}*
🏦 UPI ID: *${UPI_ID}* (${UPI_BANK})

Please pay your dues using this UPI link:
${upiLink}

Thank you,
GreenVest Store`

  const msg = encodeURIComponent(lang === 'bn' ? textBn : textEn)
  return `https://wa.me/${digits}?text=${msg}`
}

/** Fetches Khata entries from Supabase with fallback to local storage */
export async function fetchKhataEntriesApi(userId?: string): Promise<KhataEntry[]> {
  const fallback = getStoredKhataEntries()
  const { supabase } = await import('./supabase')
  if (!supabase) return fallback

  try {
    let query = supabase.from('khata_ledger').select('*').order('created_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error || !data) return fallback

    const mapped: KhataEntry[] = data.map((r: any) => ({
      id: String(r.id),
      userId: r.user_id,
      orderId: r.order_id || undefined,
      type: (r.type === 'adjustment_credit' || r.type === 'adjustment_debit') ? 'adjustment' : r.type,
      amount: Number(r.amount),
      balanceAfter: 0,
      notes: r.notes || undefined,
      recordedBy: 'GreenVest Staff',
      createdAt: r.created_at,
    }))

    saveKhataEntries(mapped)
    return mapped
  } catch {
    return fallback
  }
}

/** Saves Khata entry to Supabase */
export async function saveKhataEntryApi(entry: KhataEntry): Promise<void> {
  const { supabase } = await import('./supabase')
  if (!supabase) return

  try {
    const dbType = entry.type === 'adjustment' ? 'adjustment_credit' : entry.type
    await supabase.from('khata_ledger').insert({
      user_id: entry.userId,
      type: dbType,
      amount: entry.amount,
      notes: entry.notes || null,
      order_id: entry.orderId || null,
      payment_method: 'upi',
      created_at: entry.createdAt,
    })
  } catch (err) {
    console.warn('saveKhataEntryApi cloud failed:', err)
  }
}
