import { useState, useEffect, useSyncExternalStore } from 'react'
import {
  VALID_MONTAGE_KEYS,
  subscribeToMontageAuth,
  getMontageAuthSnapshot,
  lockMontageGate,
  unlockMontageGate
} from '../lib/montageGate'

export default function MontageBlockGate({ children }: { children: React.ReactNode }) {
  const isAuthorized = useSyncExternalStore(subscribeToMontageAuth, getMontageAuthSnapshot, () => false)
  const [keyInput, setKeyInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const [showKeyDialog, setShowKeyDialog] = useState(false)

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) +
          ' ' +
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
      setSuccessMsg('✓ Clearance Confirmed. Decrypting Montage Gateway...')
      setTimeout(() => {
        unlockMontageGate()
      }, 700)
    } else {
      setErrorMsg('ACCESS REJECTED: Invalid Montage clearance token.')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 600)
    }
  }

  if (isAuthorized) {
    return (
      <>
        {children}
        {/* Floating discreet re-lock button for Montage admin testing */}
        <button
          type="button"
          onClick={lockMontageGate}
          title="Lock site with Montage Permission Gate"
          style={{
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '9999px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            opacity: 0.35,
            transition: 'opacity 0.2s ease, transform 0.15s ease',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.35'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          🔒 Lock Gate
        </button>
      </>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: '#07090e',
        backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(220, 38, 38, 0.25), transparent 70%),
          radial-gradient(ellipse 60% 40% at 50% 120%, rgba(185, 28, 28, 0.15), transparent 70%),
          linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 32px 32px, 32px 32px',
        color: '#f8fafc',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
          maxWidth: '560px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '16px',
          padding: '36px 28px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(220, 38, 38, 0.12)',
          textAlign: 'center',
          position: 'relative',
          animation: isShaking ? 'montageGateShake 0.5s ease-in-out' : 'none'
        }}
      >
        {/* Security Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '9999px',
            padding: '6px 14px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#fca5a5',
            marginBottom: '22px'
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 10px #ef4444'
            }}
          />
          SECURITY PERIMETER ACTIVE • MONTAGE PROTOCOL
        </div>

        {/* Warning Icon Graphic */}
        <div
          style={{
            width: '68px',
            height: '68px',
            margin: '0 auto 20px auto',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(153, 27, 27, 0.4))',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            boxShadow: '0 0 24px rgba(239, 68, 68, 0.3)'
          }}
        >
          ⛔
        </div>

        {/* Exact User Requested Main Headline */}
        <h1
          style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.35rem)',
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            margin: '0 0 16px 0',
            color: '#ffffff',
            textShadow: '0 2px 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.25)'
          }}
        >
          Fuck off first, permission by Montage
        </h1>

        {/* Subtitle / Explanation */}
        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.6,
            color: '#94a3b8',
            margin: '0 0 24px 0',
            maxWidth: '460px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
        >
          Access to this website is strictly restricted. Visitors without authorized clearance from
          Montage Corporation are denied entry.
        </p>

        {/* Telemetry info card */}
        <div
          style={{
            background: 'rgba(2, 6, 23, 0.6)',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            borderRadius: '10px',
            padding: '14px 16px',
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
            <span style={{ color: '#ef4444', fontWeight: 700 }}>RESTRICTED / BLOCKED</span>
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
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>MONTAGE CORPORATION</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>TIMESTAMP:</span>
            <span style={{ color: '#94a3b8' }}>{currentTime || 'SYNCHRONIZING...'}</span>
          </div>
        </div>

        {/* Authorization Key Form Toggle */}
        {!showKeyDialog ? (
          <button
            type="button"
            onClick={() => setShowKeyDialog(true)}
            style={{
              background: 'transparent',
              border: '1px dashed rgba(148, 163, 184, 0.4)',
              color: '#94a3b8',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)'
              e.currentTarget.style.color = '#f8fafc'
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)'
              e.currentTarget.style.color = '#94a3b8'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>🔑</span> Have a Montage Clearance Key? Enter Here
          </button>
        ) : (
          <form onSubmit={handleVerify} style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter Montage Permission Key..."
                autoFocus
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  transition: 'opacity 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                UNLOCK
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowKeyDialog(false)
                  setErrorMsg('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Status alerts */}
        {errorMsg && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
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
              marginTop: '16px',
              padding: '10px 14px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22c55e',
              borderRadius: '8px',
              color: '#86efac',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {successMsg}
          </div>
        )}
      </div>

      {/* Footer System Signature */}
      <div
        style={{
          marginTop: '28px',
          fontSize: '11px',
          color: '#475569',
          letterSpacing: '0.06em',
          textTransform: 'uppercase'
        }}
      >
        MONTAGE SECURITY GATEWAY • ACCESS CONTROLLED
      </div>

      {/* Inject Keyframe Shake Animation */}
      <style>{`
        @keyframes montageGateShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  )
}
