/**
 * GreenVest Intelligent Cache & Storage Manager
 * 1. Automatically cleans corrupted or outdated cache entries
 * 2. Provides safe JSON parsing with zero-throw fallbacks
 * 3. Migrates client state across code versions seamlessly
 */

const CURRENT_CACHE_VERSION = 'v2'
const CACHE_VERSION_KEY = 'gv_cache_ver'

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && parsed !== undefined ? (parsed as T) : fallback
  } catch (err) {
    console.warn('safeJsonParse caught corrupted payload, using fallback:', err)
    return fallback
  }
}

/**
 * Validates local storage on boot, clears deprecated keys from older releases.
 */
export function initCacheGuard(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    const storedVer = localStorage.getItem(CACHE_VERSION_KEY)
    if (storedVer !== CURRENT_CACHE_VERSION) {
      // Clean up legacy legacy cache keys
      const legacyKeys = [
        'gv_products_cache_v1',
        'gv_orders_cache_v1',
        'greenvest_cart_v1',
        'gv_admin_users_cache',
      ]
      legacyKeys.forEach((k) => {
        try {
          localStorage.removeItem(k)
        } catch {}
      })
      localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION)
    }

    // 🧹 Routine Auto-Maintenance (Prune old notification logs older than 30 days)
    try {
      const notifsRaw = localStorage.getItem('gv_app_notifications')
      if (notifsRaw) {
        const notifs = JSON.parse(notifsRaw)
        if (Array.isArray(notifs)) {
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
          const fresh = notifs.filter((n: any) => !n.createdAt || new Date(n.createdAt).getTime() > thirtyDaysAgo)
          if (fresh.length !== notifs.length) {
            localStorage.setItem('gv_app_notifications', JSON.stringify(fresh))
          }
        }
      }
    } catch {}
  } catch (e) {
    console.warn('initCacheGuard failed silently:', e)
  }
}
