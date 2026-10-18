interface RymonAnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  showText?: boolean
  withGlow?: boolean
  className?: string
  onClick?: () => void
}

const sizeMap = {
  sm: { emblemSize: 32, fontSize: 13, subSize: 8, gap: 8 },
  md: { emblemSize: 44, fontSize: 16, subSize: 9, gap: 11 },
  lg: { emblemSize: 72, fontSize: 22, subSize: 11, gap: 16 },
  xl: { emblemSize: 120, fontSize: 32, subSize: 13, gap: 20 },
  hero: { emblemSize: 180, fontSize: 44, subSize: 16, gap: 24 },
}

export default function RymonAnimatedLogo({
  size = 'md',
  showText = true,
  withGlow = true,
  className = '',
  onClick,
}: RymonAnimatedLogoProps) {
  const cfg = sizeMap[size]

  return (
    <div
      className={`rymon-animated-logo-wrap ${className}`}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${cfg.gap}px`,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* 🛡️ Authentic Vector Titanium Hexagonal Shield with Live Laser Pulse */}
      <div
        className="rymon-emblem-core"
        style={{
          position: 'relative',
          width: cfg.emblemSize,
          height: cfg.emblemSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* Ambient Radial Aura Bloom */}
        {withGlow && (
          <div
            className="rymon-aura-bloom"
            style={{
              position: 'absolute',
              inset: '-20%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, rgba(0, 245, 255, 0.25) 50%, transparent 75%)',
              filter: 'blur(10px)',
              pointerEvents: 'none',
              animation: 'rymonAuraPulse 3s ease-in-out infinite alternate',
              zIndex: 0,
            }}
          />
        )}

        {/* 📐 Crisp Mathematical Vector SVG Emblem */}
        <svg
          viewBox="0 0 100 100"
          className="rymon-vector-svg"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: 2,
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.85)) drop-shadow(0 0 8px rgba(168, 85, 247, 0.4))',
          }}
        >
          <defs>
            <linearGradient id={`rymonMetal_${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#e2e8f0" />
              <stop offset="70%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            <linearGradient id={`rymonNeon_${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="50%" stopColor="#00f5ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>

          {/* Outer Chamfered Hexagon Boundary */}
          <polygon
            points="50,4 90,27 90,73 50,96 10,73 10,27"
            fill="#090b12"
            stroke="#1e293b"
            strokeWidth="2.5"
          />

          {/* Inner Glowing Cyan/Amethyst Precision Border */}
          <polygon
            points="50,9 85,29 85,71 50,91 15,71 15,29"
            fill="#0d111c"
            stroke={`url(#rymonNeon_${size})`}
            strokeWidth="1.6"
            strokeDasharray="40 10"
            style={{ animation: 'rymonOrbitSpin 24s linear infinite', transformOrigin: '50% 50%' }}
          />

          {/* ── THE ARCHITECTURAL "R" MONOGRAM ── */}
          {/* Vertical Titanium Spine */}
          <path
            d="M 28 26 L 40 26 L 40 74 L 28 74 Z"
            fill={`url(#rymonMetal_${size})`}
          />
          {/* Vertical Hairline Laser Conduit */}
          <line
            x1="34"
            y1="30"
            x2="34"
            y2="70"
            stroke="#00f5ff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Upper R Bowl */}
          <path
            d="M 40 26 L 62 26 C 72 26 77 31 77 39 C 77 47 72 52 62 52 L 40 52 Z"
            fill={`url(#rymonMetal_${size})`}
          />
          <path
            d="M 40 34 L 60 34 C 65 34 68 36 68 39 C 68 42 65 44 60 44 L 40 44 Z"
            fill="#0d111c"
          />

          {/* Angular 45-Degree Kick Leg */}
          <polygon
            points="48,50 62,50 78,74 64,74"
            fill={`url(#rymonMetal_${size})`}
          />
          <line
            x1="55"
            y1="54"
            x2="71"
            y2="74"
            stroke="#00f5ff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Core Energy Intersection Node */}
          <circle cx="40" cy="52" r="2.5" fill="#00f5ff" />
        </svg>
      </div>

      {/* 🏛️ Authentic Swiss Corporate Typography Lockup */}
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            className="rymon-corp-title"
            style={{
              fontSize: `${cfg.fontSize}px`,
              fontWeight: 900,
              letterSpacing: '0.16em',
              fontFamily: '"Inter", "DM Sans", system-ui, -apple-system, sans-serif',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 35%, #cbd5e1 70%, #ffffff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.7))',
              whiteSpace: 'nowrap',
            }}
          >
            RYMON
          </span>
          <span
            className="rymon-corp-subtitle"
            style={{
              fontSize: `${cfg.subSize}px`,
              fontWeight: 700,
              letterSpacing: '0.34em',
              textTransform: 'uppercase',
              color: '#94a3b8',
              lineHeight: 1.2,
              marginTop: '2px',
              fontFamily: '"Inter", "DM Sans", system-ui, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            CORPORATION
          </span>
        </div>
      )}
    </div>
  )
}
