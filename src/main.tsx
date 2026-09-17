import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

if (typeof window !== 'undefined') {
  // Normalize legacy hash-routed /#/admin links to HTML5 /admin
  if (window.location.hash.startsWith('#/admin')) {
    const hashRemainder = window.location.hash.replace('#/admin', '')
    window.history.replaceState(null, '', `${window.location.origin}/admin${hashRemainder}`)
  }

  // Register PWA Service Worker for offline shell and speed with auto-update
  if ('serviceWorker' in navigator && !window.location.host.includes('localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (!newWorker) return
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content available: notify worker to skip waiting immediately
                newWorker.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          })
        })
        .catch((err) => {
          console.debug('ServiceWorker registration skipped/failed:', err)
        })

      // When the updated service worker takes control, refresh page once for seamless update
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

