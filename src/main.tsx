import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { reportSystemAlert } from './lib/telemetry'

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (!event.message) return
    void reportSystemAlert({
      type: 'CRASH',
      details: `${event.message} at ${event.filename || 'script'}:${event.lineno || 0}:${event.colno || 0}`,
      error: event.error instanceof Error ? event.error : null,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection'
    void reportSystemAlert({
      type: 'CRASH',
      details: `Unhandled Rejection: ${msg}`,
      error: reason instanceof Error ? reason : null,
    })
  })

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

