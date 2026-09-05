/**
 * Imperative toast dispatcher.
 * The Toast component (src/components/Toast.tsx) registers the setter at
 * mount time.  Every other module imports `showToast` from here — never
 * from the component file — so React Fast Refresh stays happy.
 */

export interface ToastMessage {
  id: number
  text: string
  emoji?: string
  type?: 'success' | 'error' | 'info'
}

// Internal setter reference — populated by the Toast component on mount.
let _setToast: ((msg: ToastMessage) => void) | null = null

/** Called by Toast component to register itself. */
export function _registerToastSetter(setter: ((msg: ToastMessage) => void) | null): void {
  _setToast = setter
}

/** Display a toast notification. Can be called from anywhere in the app. */
export function showToast(
  text: string,
  emoji = '✅',
  type: ToastMessage['type'] = 'success',
): void {
  _setToast?.({ id: Date.now(), text, emoji, type })
}
