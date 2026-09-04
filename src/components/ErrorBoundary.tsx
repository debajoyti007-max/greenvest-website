import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportSystemAlert } from '../lib/telemetry'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GreenVest Caught Error in ErrorBoundary:', error, errorInfo)
    void reportSystemAlert({
      type: 'CRASH',
      error,
      details: errorInfo.componentStack || undefined,
    })
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  private handleClearCache = () => {
    try {
      localStorage.removeItem('gv_products_cache_v2')
      localStorage.removeItem('gv_reviews_cache_v1')
      sessionStorage.clear()
    } catch {}
    window.location.href = '/'
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
          background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
            borderRadius: '28px',
            padding: '2.5rem 1.75rem',
            maxWidth: '380px',
            width: '100%',
            boxShadow: '0 24px 48px -12px rgba(22, 101, 52, 0.14)',
            border: '1.5px solid #bbf7d0',
          }}>
            <div style={{ fontSize: '3.2rem', marginBottom: '0.4rem', filter: 'drop-shadow(0 6px 12px rgba(22,101,52,0.18))' }}>
              🥬
            </div>
            
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fee2e2', color: '#b91c1c', padding: '3px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.65rem' }}>
              <span>ERROR</span>
              <span>·</span>
              <span>AUTO-LOGGED</span>
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#166534', margin: '0 0 0.5rem' }}>
              সাময়িক সমস্যা · Glitch
            </h2>

            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1.5rem', fontWeight: 600 }}>
              ✓ টিমকে জানানো হয়েছে। নিচের বোতামে রিস্টোর করুন।
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '0.8rem 1.25rem',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 101, 52, 0.25)',
                }}
              >
                🔄 রিফ্রেশ করুন / Refresh
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
