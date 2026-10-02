import { useState, useEffect, useSyncExternalStore } from 'react'
import {
  VALID_MONTAGE_KEYS,
  subscribeToMontageAuth,
  getMontageAuthSnapshot,
  unlockMontageGate
} from '../lib/montageGate'

export default function MontageBlockGate({ children }: { children: React.ReactNode }) {
  const isAuthorized = useSyncExternalStore(subscribeToMontageAuth, getMontageAuthSnapshot, () => false)
  const [keyInput, setKeyInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) +
          ' • ' +
          now.toLocaleTimeString('en-US', { hour12: false }) +
          ' UTC' +
          (now.getTimezoneOffset() <= 0 ? '+' : '-') +
          Math.abs(Math.floor(now.getTimezoneOffset() / 60))
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    const trimmed = keyInput.trim().toLowerCase()

    if (VALID_MONTAGE_KEYS.has(trimmed)) {
      setSuccessMsg('✓ Clearance verified. Unlocking website...')
      setTimeout(() => {
        unlockMontageGate()
      }, 600)
    } else {
      setErrorMsg('Invalid clearance key. Please contact Montage for permission.')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
    }
  }

  if (isAuthorized) {
    return <>{children}</>
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: '#05070d',
        backgroundImage: `
          radial-gradient(ellipse 90% 60% at 50% -15%, rgba(14, 165, 233, 0.18), transparent 70%),
          radial-gradient(ellipse 70% 45% at 50% 115%, rgba(16, 185, 129, 0.12), transparent 70%),
          linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 36px 36px, 36px 36px',
        color: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'rgba(11, 17, 32, 0.88)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: '20px',
          padding: '42px 32px',
          boxShadow:
            '0 30px 70px -15px rgba(0, 0, 0, 0.8), 0 0 50px rgba(14, 165, 233, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          textAlign: 'center',
          position: 'relative',
          animation: isShaking ? 'montageGateShake 0.45s ease-in-out' : 'none'
        }}
      >
        {/* Top Premium Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(16, 185, 129, 0.08))',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '9999px',
            padding: '7px 16px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#38bdf8',
            marginBottom: '26px'
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#38bdf8',
              boxShadow: '0 0 10px #38bdf8'
            }}
          />
          MONTAGE ACCESS CONTROL • PRIVATE GATEWAY
        </div>

        {/* Premium Lock Icon Graphic */}
        <div
          style={{
            width: '70px',
            height: '70px',
            margin: '0 auto 22px auto',
            borderRadius: '18px',
            background:
              'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.4))',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '30px',
            boxShadow: '0 0 30px rgba(14, 165, 233, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3)'
          }}
        >
          🔒
        </div>

        {/* Clean, Professional & Premium Headline */}
        <h1
          style={{
            fontSize: 'clamp(1.6rem, 4.5vw, 2.1rem)',
            fontWeight: 800,
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            margin: '0 0 14px 0',
            color: '#ffffff',
            textShadow: '0 2px 24px rgba(56, 189, 248, 0.35)'
          }}
        >
          To unlock this website, please contact Montage
        </h1>

        {/* Professional Subtitle */}
        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.65,
            color: '#94a3b8',
            margin: '0 0 28px 0',
            maxWidth: '430px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
        >
          This storefront is currently operating under private access. Authorization is managed by{' '}
          <strong style={{ color: '#e2e8f0', fontWeight: 600 }}>Montage Corporation</strong>.
          Please contact Montage to receive clearance or enter your key below to unlock.
        </p>

        {/* Telemetry info card */}
        <div
          style={{
            background: 'rgba(2, 6, 23, 0.65)',
            border: '1px solid rgba(51, 65, 85, 0.55)',
            borderRadius: '12px',
            padding: '14px 18px',
            fontSize: '12px',
            textAlign: 'left',
            color: '#cbd5e1',
            marginBottom: '26px'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
              paddingBottom: '4px'
            }}
          >
            <span style={{ color: '#64748b' }}>ACCESS STATUS:</span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>PRIVATE / LOCKED</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
              paddingBottom: '4px'
            }}
          >
            <span style={{ color: '#64748b' }}>AUTHORITY:</span>
            <span style={{ color: '#a7f3d0', fontWeight: 600 }}>MONTAGE CORPORATION</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>TIMESTAMP:</span>
            <span style={{ color: '#94a3b8' }}>{currentTime || 'SYNCHRONIZING...'}</span>
          </div>
        </div>

        {/* Direct Unlock Input Form */}
        <form onSubmit={handleVerify} style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter clearance key to unlock..."
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                borderRadius: '10px',
                padding: '13px 16px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'inherit',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
              }}
            />
            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '13px',
                padding: '13px 22px',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                transition: 'opacity 0.15s ease, transform 0.15s ease',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              UNLOCK
            </button>
          </div>
        </form>

        {/* Status alerts */}
        {errorMsg && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: '8px',
              color: '#a7f3d0',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {successMsg}
          </div>
        )}
      </div>

      {/* Inject Keyframe Shake Animation */}
      <style>{`
        @keyframes montageGateShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
