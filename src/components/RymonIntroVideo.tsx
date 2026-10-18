import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * ⚡ Web Audio API Synthesizer: Cinematic High-Tech Acoustic Experience
 * Pure client-side synthesis. Zero external audio downloads.
 */
function playCyberneticChime(muted: boolean): Promise<boolean> {
  if (muted || typeof window === 'undefined') return Promise.resolve(false)

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return Promise.resolve(false)

    const ctx = new AudioContextClass()

    const resumeAndPlay = async () => {
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const now = ctx.currentTime

      // 1. Cinematic Deep Sub-Bass Rumble (55Hz -> 73.4Hz)
      const subOsc = ctx.createOscillator()
      const subGain = ctx.createGain()
      const subFilter = ctx.createBiquadFilter()

      subOsc.type = 'triangle'
      subOsc.frequency.setValueAtTime(55, now)
      subOsc.frequency.exponentialRampToValueAtTime(73.4, now + 1.2)

      subFilter.type = 'lowpass'
      subFilter.frequency.setValueAtTime(180, now)

      subGain.gain.setValueAtTime(0, now)
      subGain.gain.linearRampToValueAtTime(0.2, now + 0.15)
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8)

      subOsc.connect(subFilter)
      subFilter.connect(subGain)
      subGain.connect(ctx.destination)

      subOsc.start(now)
      subOsc.stop(now + 2.0)

      // 2. High-Tech Harmonic Chime Chord (528Hz, 660Hz, 792Hz, 1056Hz)
      const harmonics = [528, 660, 792, 1056]
      harmonics.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        const startTime = now + 0.08 + idx * 0.04
        osc.frequency.setValueAtTime(freq, startTime)

        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.07 / (idx + 1), startTime + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0005, startTime + 1.6)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(startTime)
        osc.stop(startTime + 1.8)
      })

      // 3. Cybernetic Laser Sweep Sparkle
      const sweepOsc = ctx.createOscillator()
      const sweepGain = ctx.createGain()
      sweepOsc.type = 'sine'
      sweepOsc.frequency.setValueAtTime(1800, now + 0.3)
      sweepOsc.frequency.exponentialRampToValueAtTime(3200, now + 0.7)

      sweepGain.gain.setValueAtTime(0, now + 0.3)
      sweepGain.gain.linearRampToValueAtTime(0.03, now + 0.45)
      sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)

      sweepOsc.connect(sweepGain)
      sweepGain.connect(ctx.destination)

      sweepOsc.start(now + 0.3)
      sweepOsc.stop(now + 0.85)

      return true
    }

    return resumeAndPlay().catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

export default function RymonIntroVideo() {
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return false
    const hasQuery = window.location.search.includes('intro=true')
    if (hasQuery) return true
    const alreadyPlayed = window.sessionStorage.getItem('rymon_intro_viewed_v1')
    return !alreadyPlayed
  })

  const [dissolving, setDissolving] = useState(false)
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('rymon_intro_muted') === 'true'
  })
  const [remainingTime, setRemainingTime] = useState(2.5)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const dismissedRef = useRef(false)

  // 🚪 Instant Graceful Dismiss with Immediate Click Pass-Through
  const dismissIntro = useCallback(() => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    try {
      window.sessionStorage.setItem('rymon_intro_viewed_v1', 'true')
    } catch {}
    setDissolving(true)
    setTimeout(() => {
      setActive(false)
    }, 120)
  }, [])

  // 🎬 External Replay Event Listener (from Hero Banner or Console header)
  useEffect(() => {
    const handleReplay = () => {
      dismissedRef.current = false
      setDissolving(false)
      setRemainingTime(2.5)
      setActive(true)
      void playCyberneticChime(muted)
    }

    window.addEventListener('replay_rymon_intro', handleReplay)
    window.addEventListener('replay_gv_intro', handleReplay)

    return () => {
      window.removeEventListener('replay_rymon_intro', handleReplay)
      window.removeEventListener('replay_gv_intro', handleReplay)
    }
  }, [muted])

  // 🎹 Keyboard Accessibility (Esc to dismiss)
  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissIntro()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, dismissIntro])

  // ⏱️ 2.5s Master Timer & Countdown Clock
  useEffect(() => {
    if (!active || dissolving) return

    void playCyberneticChime(muted)

    const startTime = Date.now()
    const totalDurationMs = 2500

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const left = Math.max(0, (totalDurationMs - elapsed) / 1000)
      setRemainingTime(Number(left.toFixed(1)))

      if (elapsed >= 2200 && !dismissedRef.current) {
        dismissedRef.current = true
        try {
          window.sessionStorage.setItem('rymon_intro_viewed_v1', 'true')
        } catch {}
        setDissolving(true)
      }

      if (elapsed >= totalDurationMs) {
        clearInterval(timer)
        setActive(false)
      }
    }, 100)

    return () => clearInterval(timer)
  }, [active, dissolving, muted])

  // 🌌 High-Performance GPU Canvas Background
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    interface Particle {
      x: number
      y: number
      radius: number
      color: string
      vx: number
      vy: number
      alpha: number
      alphaSpeed: number
    }

    const particles: Particle[] = []
    const particleCount = Math.min(36, Math.floor((w * h) / 28000))
    const palette = ['#a855f7', '#00f5ff', '#c084fc', '#38bdf8', '#ffffff']

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 2 + 0.8,
        color: palette[Math.floor(Math.random() * palette.length)],
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.35,
        alpha: Math.random() * 0.7 + 0.2,
        alphaSpeed: (Math.random() * 0.015 + 0.006) * (Math.random() > 0.5 ? 1 : -1),
      })
    }

    let running = true

    const render = () => {
      if (!running || !ctx) return
      ctx.clearRect(0, 0, w, h)

      // Radial ambient core bloom
      const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.55)
      grad.addColorStop(0, 'rgba(126, 34, 206, 0.18)')
      grad.addColorStop(0.5, 'rgba(0, 245, 255, 0.06)')
      grad.addColorStop(1, 'rgba(4, 5, 8, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.alpha += p.alphaSpeed

        if (p.alpha <= 0.1 || p.alpha >= 0.85) {
          p.alphaSpeed = -p.alphaSpeed
        }

        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0

        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha))
        ctx.shadowBlur = 8
        ctx.shadowColor = p.color
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [active])

  if (!active) return null

  return (
    <aside
      aria-label="RYMON CORPORATION Brand Intro"
      role="dialog"
      aria-modal="true"
      onClick={dismissIntro}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: '#040508',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: 'pointer',
        pointerEvents: dissolving ? 'none' : 'auto',
        touchAction: 'manipulation',
        opacity: dissolving ? 0 : 1,
        transform: dissolving ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.14s ease-out, transform 0.14s ease-out',
      }}
    >
      {/* 🌌 High-Performance Canvas Particles */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* 🧭 Top Floating Control Pill */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(14px, 3vh, 28px)',
          right: 'clamp(14px, 3vw, 28px)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🔊/🔇 Audio Mute Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !muted
            setMuted(next)
            try {
              window.localStorage.setItem('rymon_intro_muted', String(next))
            } catch {}
            if (!next) {
              void playCyberneticChime(false)
            }
          }}
          aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
          title={muted ? 'Unmute Sound' : 'Mute Sound'}
          style={{
            background: 'rgba(168, 85, 247, 0.16)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            color: '#c084fc',
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>

        {/* ⚡ Skip Button */}
        <button
          type="button"
          onClick={dismissIntro}
          aria-label="Skip Intro"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            color: '#ffffff',
            padding: '7px 15px',
            borderRadius: '999px',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          <span>Skip</span>
          <span style={{ color: '#00f5ff', fontWeight: 800 }}>➔</span>
          <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '2px' }}>
            ({remainingTime.toFixed(1)}s)
          </span>
        </button>
      </div>

      {/* 👑 Central Authentic Vector Emblem & Typography Presentation */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 20px',
          maxWidth: '560px',
        }}
      >
        {/* Top Technical Kicker */}
        <div
          className="rymon-intro-kicker"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 14px',
            borderRadius: '999px',
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.32)',
            color: '#c084fc',
            fontSize: 'clamp(10px, 2.2vw, 12px)',
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 'clamp(16px, 3vh, 26px)',
            boxShadow: '0 0 16px rgba(168, 85, 247, 0.2)',
            animation: 'rymonFadeSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <span style={{ color: '#00f5ff' }}>⚡</span>
          <span>SOVEREIGN ARCHITECTURE</span>
          <span style={{ color: '#00f5ff' }}>⚡</span>
        </div>

        {/* 📐 Crisp Mathematical Vector SVG Emblem (100% Authentic Human Design) */}
        <div
          className="rymon-intro-emblem-box"
          style={{
            position: 'relative',
            width: 'clamp(110px, 22vw, 150px)',
            height: 'clamp(110px, 22vw, 150px)',
            marginBottom: 'clamp(18px, 3vh, 26px)',
            animation: 'rymonEmblemZoomIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Subtle Ambient Radial Aura */}
          <div
            style={{
              position: 'absolute',
              inset: '-20px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.45) 0%, rgba(0, 245, 255, 0.22) 45%, transparent 75%)',
              filter: 'blur(16px)',
              pointerEvents: 'none',
              animation: 'rymonAuraPulse 2.4s ease-in-out infinite alternate',
            }}
          />

          <svg
            viewBox="0 0 120 120"
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              zIndex: 2,
              filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.9)) drop-shadow(0 0 14px rgba(168, 85, 247, 0.45))',
            }}
          >
            <defs>
              <linearGradient id="introMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="30%" stopColor="#f1f5f9" />
                <stop offset="65%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>

              <linearGradient id="introNeon" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="50%" stopColor="#00f5ff" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>

            {/* Hexagonal Outer Chamfer Shield */}
            <polygon
              points="60,6 108,34 108,86 60,114 12,86 12,34"
              fill="#080b12"
              stroke="#1e293b"
              strokeWidth="2.8"
            />

            {/* Dynamic Orbit Ring */}
            <polygon
              points="60,12 102,36 102,84 60,108 18,84 18,36"
              fill="#0d111c"
              stroke="url(#introNeon)"
              strokeWidth="1.8"
              strokeDasharray="45 15"
              style={{ animation: 'rymonOrbitSpin 20s linear infinite', transformOrigin: '50% 50%' }}
            />

            {/* ── Precision Architectural "R" Monogram ── */}
            {/* Left Vertical Spine */}
            <path
              d="M 34 32 L 48 32 L 48 88 L 34 88 Z"
              fill="url(#introMetal)"
            />
            <line
              x1="41"
              y1="36"
              x2="41"
              y2="84"
              stroke="#00f5ff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />

            {/* Upper R Bowl */}
            <path
              d="M 48 32 L 74 32 C 86 32 92 38 92 48 C 92 58 86 64 74 64 L 48 64 Z"
              fill="url(#introMetal)"
            />
            <path
              d="M 48 42 L 72 42 C 78 42 81 44 81 48 C 81 52 78 54 72 54 L 48 54 Z"
              fill="#0d111c"
            />

            {/* Angular 45-Degree Kick Leg */}
            <polygon
              points="58,62 74,62 94,88 78,88"
              fill="url(#introMetal)"
            />
            <line
              x1="66"
              y1="66"
              x2="85"
              y2="88"
              stroke="#00f5ff"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Core Center Pulse Node */}
            <circle cx="48" cy="63" r="3" fill="#00f5ff" />
          </svg>
        </div>

        {/* 🏛️ Authentic Swiss Corporate Typography */}
        <h1
          className="rymon-intro-title"
          style={{
            fontSize: 'clamp(28px, 6vw, 42px)',
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            margin: '0 0 3px',
            fontFamily: '"Inter", "DM Sans", system-ui, -apple-system, sans-serif',
            background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 25%, #cbd5e1 65%, #ffffff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.8))',
            lineHeight: 1.1,
            animation: 'rymonFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both',
          }}
        >
          RYMON
        </h1>

        <div
          className="rymon-intro-sub"
          style={{
            fontSize: 'clamp(11px, 2.6vw, 14px)',
            fontWeight: 700,
            letterSpacing: '0.44em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            fontFamily: '"Inter", "DM Sans", system-ui, sans-serif',
            marginBottom: 'clamp(14px, 2.5vh, 20px)',
            animation: 'rymonFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both',
          }}
        >
          CORPORATION
        </div>

        {/* Clean Corporate Tagline */}
        <p
          style={{
            fontSize: 'clamp(11.5px, 2.4vw, 13.5px)',
            color: '#94a3b8',
            margin: '0 0 16px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            fontFamily: '"Inter", system-ui, sans-serif',
            lineHeight: 1.4,
            animation: 'rymonFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both',
          }}
        >
          Advanced Hardware Telemetry &amp; VIP Streamer Console
        </p>

        {/* Minimalist Trust Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            animation: 'rymonFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.45s both',
          }}
        >
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(5, 223, 114, 0.1)',
              border: '1px solid rgba(5, 223, 114, 0.25)',
              color: '#4ade80',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
            VIP Bridge Online
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              color: '#c084fc',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            🔒 Sovereign AES-256
          </span>
        </div>
      </div>

      {/* 🌟 Bottom Glowing Laser Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #7e22ce 0%, #a855f7 35%, #00f5ff 70%, #ffffff 100%)',
            boxShadow: '0 0 12px #00f5ff, 0 0 20px #a855f7',
            animation: 'rymonIntroProgress 2.4s linear forwards',
          }}
        />
      </div>

      {/* Subtle Bottom Dismissal Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 'clamp(14px, 2.5vh, 22px)',
          color: 'rgba(255, 255, 255, 0.35)',
          fontSize: '10.5px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          zIndex: 10,
        }}
      >
        Tap anywhere to enter
      </div>
    </aside>
  )
}
