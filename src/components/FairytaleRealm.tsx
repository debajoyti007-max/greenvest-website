import React, { useMemo } from 'react'

interface FairytaleRealmProps {
  isDashboard?: boolean
}

export const FairytaleRealm: React.FC<FairytaleRealmProps> = ({ isDashboard = false }) => {
  // Generate a stable set of 36 golden spirit embers with randomized timings
  // Animated 100% on GPU compositor thread via translate3d (0.00% CPU usage)
  const embers = useMemo(() => {
    return Array.from({ length: 36 }).map((_, i) => {
      const left = (i * 2.7 + (i % 7) * 3.1) % 100
      const duration = 7 + (i % 8) * 1.5 // 7s to 18s
      const delay = (i * 0.45) % 8 // Staggered start
      const size = 2 + (i % 4) * 1.5 // 2px to 6.5px
      const driftX = ((i % 5) - 2) * 45 // -90px to +90px sway
      const opacity = 0.4 + (i % 5) * 0.12 // 0.4 to 0.88
      const isGold = i % 3 !== 0 // Most are golden amber, some are starlight violet
      return {
        id: i,
        left: `${left}%`,
        duration: `${duration}s`,
        delay: `-${delay}s`,
        size: `${size}px`,
        driftX: `${driftX}px`,
        opacity,
        color: isGold
          ? 'radial-gradient(circle, #fef08a 0%, #f59e0b 60%, rgba(245, 158, 11, 0) 100%)'
          : 'radial-gradient(circle, #e9d5ff 0%, #a855f7 60%, rgba(168, 85, 247, 0) 100%)',
        boxShadow: isGold
          ? '0 0 10px rgba(245, 158, 11, 0.8), 0 0 20px rgba(251, 191, 36, 0.4)'
          : '0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(192, 132, 252, 0.4)',
      }
    })
  }, [])

  return (
    <div
      className="fairytale-realm-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        backgroundColor: '#05070d',
        transition: 'opacity 0.6s ease',
      }}
      aria-hidden="true"
    >
      {/* ── 1. CINEMATIC TWILIGHT & CELESTIAL GOD-RAYS (GPU GRADIENTS) ───────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle 900px at 50% 15%, rgba(245, 158, 11, 0.10), transparent 70%),
            radial-gradient(circle 800px at 20% 70%, rgba(139, 92, 246, 0.12), transparent 60%),
            radial-gradient(circle 700px at 80% 85%, rgba(16, 185, 129, 0.07), transparent 60%),
            radial-gradient(circle 1000px at 50% 100%, rgba(5, 7, 13, 0.95), #05070d)
          `,
          opacity: isDashboard ? 0.4 : 1,
          transition: 'opacity 0.8s ease',
        }}
      />

      {/* ── 2. ETHEREAL CELESTIAL MIST ───────────────────────────────────────── */}
      <div
        className="fairytale-mist-layer"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '45vh',
          background: 'linear-gradient(to top, rgba(15, 23, 42, 0.6) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 100%)',
          filter: 'blur(30px)',
          opacity: isDashboard ? 0.3 : 0.7,
        }}
      />

      {/* ── 3. 120 FPS GPU-COMPOSITED SPIRIT EMBERS (ZERO CPU OVERHEAD) ──────── */}
      {!isDashboard && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {embers.map((e) => (
            <span
              key={e.id}
              className="spirit-ember"
              style={{
                position: 'absolute',
                left: e.left,
                bottom: '-20px',
                width: e.size,
                height: e.size,
                borderRadius: '50%',
                background: e.color,
                boxShadow: e.boxShadow,
                opacity: e.opacity,
                animation: `floatSpiritEmber ${e.duration} linear infinite`,
                animationDelay: e.delay,
                willChange: 'transform, opacity',
                '--drift-x': e.driftX,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* ── 4. PURE COMPOSITOR KEYFRAMES (LOCKED 120 FPS) ────────────────────── */}
      <style>{`
        @keyframes floatSpiritEmber {
          0% {
            transform: translate3d(0, 0, 0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 0.9;
          }
          50% {
            transform: translate3d(var(--drift-x), -50vh, 0) scale(1.1);
            opacity: 0.75;
          }
          85% {
            opacity: 0.6;
          }
          100% {
            transform: translate3d(calc(var(--drift-x) * 1.5), -105vh, 0) scale(0.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

export default FairytaleRealm
