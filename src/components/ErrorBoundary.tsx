import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Caught Error in ErrorBoundary:', error, errorInfo)
  }

  private handleReset = async () => {
    try {
      sessionStorage.clear()
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } catch {}
    this.setState({ hasError: false, error: null })
    window.location.href = window.location.pathname + '?nocache=' + Date.now()
  }

  private handleClearCache = async () => {
    try {
      localStorage.removeItem('gv_products_cache_v2')
      localStorage.removeItem('gv_reviews_cache_v1')
      sessionStorage.clear()
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } catch {}
    window.location.href = '/?nocache=' + Date.now()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          minHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: 'linear-gradient(180deg, #0d111a 0%, #161b26 100%)',
          color: '#e2e8f0'
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
            borderRadius: '24px',
            padding: '2.5rem 1.75rem',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.6)',
            border: '1.5px solid rgba(139, 92, 246, 0.3)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.4rem' }}>
              ⚡
            </div>
            
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '3px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.65rem' }}>
              <span>SYSTEM GLITCH DETECTED</span>
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', margin: '0 0 0.5rem' }}>
              Temporary Refresh Required
            </h2>

            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1rem', fontWeight: 500 }}>
              A new version was deployed. Click below to clear cache and load the latest release cleanly.
            </p>

            {this.state.error?.message && (
              <div style={{
                margin: '0.8rem 0',
                padding: '0.6rem 0.8rem',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                fontSize: '0.75rem',
                color: '#fca5a5',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                textAlign: 'left',
                maxHeight: '100px',
                overflowY: 'auto'
              }}>
                <strong>Reason:</strong> {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '0.8rem 1.25rem',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
                }}
              >
                🔄 Clear Cache & Reload Latest Version
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={this.handleClearCache}
                  style={{
                    padding: '0.7rem',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  🏠 হোম / Home
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.location.href = '/support'
                    } catch {}
                  }}
                  style={{
                    padding: '0.7rem',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#166534',
                    border: '1.5px solid #86efac',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  💬 সাপোর্ট / Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
