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

  // Register PWA Service Worker for offline shell and speed
  if ('serviceWorker' in navigator && !window.location.host.includes('localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.debug('ServiceWorker registration skipped/failed:', err)
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

