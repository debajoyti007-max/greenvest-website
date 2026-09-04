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
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

