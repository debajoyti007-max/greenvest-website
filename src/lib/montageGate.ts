export const MONTAGE_STORAGE_KEY = 'gv_montage_authorized'

export const VALID_MONTAGE_KEYS = new Set([
  'montage',
  'MONTAGE',
  'montage123',
  'Montage',
  'debajoyti',
  'admin',
  'montagecorp',
  'montage-corporation'
])

export function subscribeToMontageAuth(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener('montage-auth-change', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('montage-auth-change', callback)
  }
}

export function getMontageAuthSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  try {
    // Fast-track clearance via URL query parameters: ?key=montage or ?montage=grant
    const params = new URLSearchParams(window.location.search)
    const urlKey = params.get('key') || params.get('montage_key') || params.get('montage')
    if (urlKey && (VALID_MONTAGE_KEYS.has(urlKey.toLowerCase()) || urlKey.toLowerCase() === 'grant')) {
      window.localStorage.setItem(MONTAGE_STORAGE_KEY, 'granted')
      const url = new URL(window.location.href)
      url.searchParams.delete('key')
      url.searchParams.delete('montage_key')
      url.searchParams.delete('montage')
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
      return true
    }
    return window.localStorage.getItem(MONTAGE_STORAGE_KEY) === 'granted'
  } catch {
    return false
  }
}

export function lockMontageGate(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(MONTAGE_STORAGE_KEY)
    window.dispatchEvent(new Event('montage-auth-change'))
  } catch {
    // Ignore storage issues
  }
}

export function unlockMontageGate(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MONTAGE_STORAGE_KEY, 'granted')
    window.dispatchEvent(new Event('montage-auth-change'))
  } catch {
    // Ignore storage issues
  }
}
