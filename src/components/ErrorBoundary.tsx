import { Component, type ErrorInfo, type ReactNode } from 'react'

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
            background: '#ffffff',
            borderRadius: '24px',
            padding: '2rem 1.5rem',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 20px 40px -15px rgba(22, 101, 52, 0.15)',
            border: '1px solid #dcfce7',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🥬</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#166534', margin: '0 0 0.5rem' }}>
              GreenVest
            </h2>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1f2937', margin: '0 0 0.25rem' }}>
              একটি সাময়িক ত্রুটি ঘটেছে
            </p>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1.5rem', lineHeight: 1.4 }}>
              Something went wrong. Tap below to reload fresh data instantly.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '0.85rem 1.25rem',
                  borderRadius: '12px',
                  background: '#166534',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 101, 52, 0.25)',
                }}
              >
                🔄 পেজ রিফ্রেশ করুন / Refresh Page
              </button>

              <button
                type="button"
                onClick={this.handleClearCache}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '12px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                🏠 হোম পেজে যান / Go to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
