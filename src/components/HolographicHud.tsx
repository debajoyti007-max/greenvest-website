import { useEffect, useRef, useState } from 'react'

/**
 * Smooth ease-out animated counter so telemetry numbers roll dynamically instead of snapping.
 */
export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  durationMs = 680,
}: {
  value: number
  prefix?: string
  suffix?: string
  durationMs?: number
}) {
  const [display, setDisplay] = useState(value)
  const prevValueRef = useRef(value)

  useEffect(() => {
    const startVal = prevValueRef.current
    const endVal = Number.isFinite(value) ? value : 0
    if (startVal === endVal) {
      setDisplay(endVal)
      return
    }

    const startTime = performance.now()
    let rafId = 0

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startVal + (endVal - startVal) * eased)
      setDisplay(current)
      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        prevValueRef.current = endVal
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [value, durationMs])

  return (
    <span>
      {prefix}
      {display.toLocaleString('en-IN')}
      {suffix}
    </span>
  )
}

/**
 * Animated signal equalizer / telemetry spectrum bars.
 */
export function AudioWaveformBars({
  color = '#00f5ff',
  bars = 5,
  height = 16,
}: {
  color?: string
  bars?: number
  height?: number
}) {
  return (
    <span
      className="sg-wave-bars"
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: '2.5px',
        height: `${height}px`,
      }}
    >
      {Array.from({ length: bars }).map((_, idx) => (
        <span
          key={idx}
          className="sg-wave-bar"
          style={{
            width: '2.5px',
            height: `${height}px`,
            borderRadius: '2px',
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`,
            animationDelay: `${idx * 0.14}s`,
          }}
        />
      ))}
    </span>
  )
}

/**
 * Continuous kinetic telemetry ticker banner for the gateway & top cyber HUD.
 */
export function LiveTelemetryTicker({ items }: { items?: string[] }) {
  const tickerItems = items ?? [
    'RYMON CORE v4.2 // QUANTUM SHIELD ACTIVE',
    '⚡ 120FPS GPU COMPOSITOR',
    '🔐 END-TO-END HWID CRYPTOGRAPHY',
    '🛰️ ZERO-LATENCY CLOUD SYNC',
    '👑 VIP STREAMER REMOTE ENGINE',
    '🛡️ ANTI-REPLAY TELEMETRY LOCK',
  ]

  return (
    <div className="sg-ticker-wrap" aria-hidden="true">
      <div className="sg-ticker-track">
        {[...tickerItems, ...tickerItems].map((label, idx) => (
          <span key={idx} className="sg-ticker-chip">
            <span className="sg-ticker-dot" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Attaches a global GPU-friendly pointer spotlight tracker updating --mx and --my
 * on cards matching .sg-spotlight-card without triggering React re-renders.
 */
export function SpotlightTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let rafId = 0

    const onPointerMove = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId)
      const clientX = e.clientX
      const clientY = e.clientY

      rafId = requestAnimationFrame(() => {
        const target = e.target as HTMLElement | null
        const card = target?.closest?.('.sg-spotlight-card') as HTMLElement | null
        if (!card) return
        const rect = card.getBoundingClientRect()
        const relX = clientX - rect.left
        const relY = clientY - rect.top
        card.style.setProperty('--mx', `${relX}px`)
        card.style.setProperty('--my', `${relY}px`)
      })
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return null
}
