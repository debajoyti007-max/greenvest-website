/**
 * GreenVest Background Offline Order Synchronization Queue
 * Automatically replays and commits queued offline orders to Supabase on reconnect.
 */

import { idbEnqueueOutbox, idbGetPendingOutbox, idbRemoveOutbox, type OutboxOrder } from './indexedDb'
import { showToast } from '../components/Toast'

let isSyncing = false

export async function queueOfflineOrder(id: string, payload: any): Promise<boolean> {
  const queued = await idbEnqueueOutbox(id, payload)
  if (queued) {
    showToast('📦 অর্ডারটি অফলাইনে সংরক্ষিত হয়েছে। ইন্টারনেট সংযোগ পেলেই স্বয়ংক্রিয়ভাবে জমা হবে।', '💾')
  }
  return queued
}

export async function syncPendingOfflineOrders(
  submitFn: (payload: any) => Promise<any>,
  lang: 'en' | 'bn' = 'bn'
): Promise<number> {
  if (isSyncing || typeof navigator === 'undefined' || !navigator.onLine) {
    return 0
  }

  const pending: OutboxOrder[] = await idbGetPendingOutbox()
  if (pending.length === 0) return 0

  isSyncing = true
  let syncedCount = 0

  try {
    for (const item of pending) {
      try {
        await submitFn(item.payload)
        await idbRemoveOutbox(item.id)
        syncedCount++
      } catch (err: any) {
        console.warn(`[OfflineQueue] Retry failed for order ${item.id}:`, err)
        // If it was already created (idempotent), safe to remove from outbox
        if (err?.message?.includes('duplicate') || err?.code === '23505') {
          await idbRemoveOutbox(item.id)
          syncedCount++
        }
      }
    }

    if (syncedCount > 0) {
      showToast(
        lang === 'bn'
          ? `✅ ${syncedCount}টি অফলাইন অর্ডার সফলভাবে সার্ভারে জমা হয়েছে!`
          : `✅ ${syncedCount} offline orders synced to server!`,
        '🎉'
      )
    }
  } finally {
    isSyncing = false
  }

  return syncedCount
}

/** Initialize global reconnect listener */
export function initOfflineQueue(submitFn: (payload: any) => Promise<any>): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    void syncPendingOfflineOrders(submitFn)
  }

  window.addEventListener('online', handleOnline)
  return () => {
    window.removeEventListener('online', handleOnline)
  }
}
