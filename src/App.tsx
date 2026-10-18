import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import RymonIntroVideo from './components/RymonIntroVideo'

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      if (typeof window !== 'undefined') {
        const storageKey = 'gv_chunk_retry_' + window.location.pathname
        const hasRetried = window.sessionStorage.getItem(storageKey)
        if (!hasRetried) {
          window.sessionStorage.setItem(storageKey, '1')
          if ('caches' in window) {
            try {
              const keys = await caches.keys()
              await Promise.all(keys.map((k) => caches.delete(k)))
            } catch {}
          }
          if ('serviceWorker' in navigator) {
            try {
              const regs = await navigator.serviceWorker.getRegistrations()
              await Promise.all(regs.map((r) => r.unregister()))
            } catch {}
          }
          window.location.href = window.location.pathname + '?reload=' + Date.now()
          return new Promise<{ default: T }>(() => {})
        }
        window.sessionStorage.removeItem(storageKey)
      }
      throw error
    }
  })
}

const RymonConnect = lazyWithRetry(() => import('./pages/RymonConnect'))

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#040508',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#00f5ff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            border: '3px solid rgba(0, 245, 255, 0.15)',
            borderTopColor: '#00f5ff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }}
        />
        <div
          style={{
            fontSize: '12px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            fontWeight: 700,
          }}
        >
          CONNECTING RYMON CORE...
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <RymonIntroVideo />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="*" element={<RymonConnect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
