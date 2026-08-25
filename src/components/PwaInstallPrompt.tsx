import { useState, useEffect } from 'react'
import { useStore } from '../context/StoreContext'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export default function PwaInstallPrompt() {
  const { lang } = useStore()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // 1. Check if already running in standalone/installed mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) return

    // 2. Check if user dismissed prompt in the last 3 days
    const dismissedTs = localStorage.getItem('gv_pwa_dismissed')
    if (dismissedTs && Date.now() - Number(dismissedTs) < 3 * 24 * 60 * 60 * 1000) {
      return
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    setShowPrompt(false)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem('gv_pwa_installed', 'true')
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('gv_pwa_dismissed', Date.now().toString())
  }

  if (!showPrompt || !deferredPrompt) return null

  return (
    <div
      className="pwa-install-banner"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99998,
        width: '92%',
        maxWidth: '520px',
        backgroundColor: '#ffffff',
        border: '1.5px solid #16a34a',
        borderRadius: '16px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
        padding: '0.9rem 1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.85rem',
        animation: 'slideUpPrompt 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <span style={{ fontSize: '2rem', lineHeight: 1 }}>🌿</span>
        <div>
          <strong style={{ display: 'block', color: '#166534', fontSize: '0.95rem' }}>
            {lang === 'bn' ? 'GreenVest অ্যাপ ইনস্টল করুন' : 'Install GreenVest App'}
          </strong>
          <span style={{ fontSize: '0.78rem', color: '#4b5563' }}>
            {lang === 'bn'
              ? 'মোবাইলে অ্যাপের মতো দ্রুত ব্যবহার ও অফার আপডেট পান'
              : 'Add to home screen for faster ordering & live notifications'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleInstallClick}
          className="btn btn-primary"
          style={{
            padding: '0.45rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderRadius: '10px',
            backgroundColor: '#16a34a',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {lang === 'bn' ? 'ইনস্টল' : 'Install'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
