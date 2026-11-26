import { useEffect, useRef } from 'react'

interface CyberCoreCanvasProps {
  isDashboard?: boolean
  accentHex?: string
}

interface NodePoint {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  hue: 'cyan' | 'violet' | 'amber' | 'emerald'
}

// Low-poly geodesic vertices & edges for the 3D holographic reactor core
const PHI = (1 + Math.sqrt(5)) / 2
const RAW_VERTS: [number, number, number][] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
]
const ICOSA_VERTS = RAW_VERTS.map(([x, y, z]) => {
  const len = Math.hypot(x, y, z)
  return [x / len, y / len, z / len] as [number, number, number]
})
const ICOSA_EDGES: [number, number][] = []
for (let i = 0; i < ICOSA_VERTS.length; i++) {
  for (let j = i + 1; j < ICOSA_VERTS.length; j++) {
    const d = Math.hypot(
      ICOSA_VERTS[i][0] - ICOSA_VERTS[j][0],
      ICOSA_VERTS[i][1] - ICOSA_VERTS[j][1],
      ICOSA_VERTS[i][2] - ICOSA_VERTS[j][2]
    )
    if (d < 1.15) ICOSA_EDGES.push([i, j])
  }
}

export default function CyberCoreCanvas({
  isDashboard = false,
  accentHex = '#00f5ff',
}: CyberCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, active: false })
  const isDashboardRef = useRef(isDashboard)
  const accentRef = useRef(accentHex)

  useEffect(() => {
    isDashboardRef.current = isDashboard
  }, [isDashboard])

  useEffect(() => {
    accentRef.current = accentHex
  }, [accentHex])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let animId = 0
    let paused = false

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const isCompact = width < 768
    const nodeCount = isCompact ? 34 : 62
    const nodes: NodePoint[] = Array.from({ length: nodeCount }, (_, idx) => ({
      x: (Math.random() - 0.5) * width * 1.15,
      y: (Math.random() - 0.5) * height * 1.15,
      z: Math.random() * 520 + 60,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.34,
      vz: (Math.random() - 0.5) * 0.45,
      size: 1.2 + (idx % 3) * 0.85,
      hue: idx % 4 === 0 ? 'amber' : idx % 3 === 0 ? 'cyan' : idx % 2 === 0 ? 'violet' : 'emerald',
    }))

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.targetX = (e.clientX / Math.max(1, width) - 0.5) * 2
      pointerRef.current.targetY = (e.clientY / Math.max(1, height) - 0.5) * 2
      pointerRef.current.active = true
    }

    const onVisibility = () => {
      paused = document.hidden
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    let time = 0
    const paletteMap = {
      cyan: '0, 245, 255',
      violet: '168, 85, 247',
      amber: '251, 191, 36',
      emerald: '16, 185, 129',
    }

    const project = (x: number, y: number, z: number, fov = 520) => {
      const safeZ = Math.max(60, fov + z)
      const scale = fov / safeZ
      return {
        sx: width * 0.5 + x * scale,
        sy: height * 0.5 + y * scale,
        scale,
      }
    }

    const renderFrame = () => {
      animId = requestAnimationFrame(renderFrame)
      if (paused) return

      time += 0.012
      const p = pointerRef.current
      p.x += (p.targetX - p.x) * 0.06
      p.y += (p.targetY - p.y) * 0.06

      ctx.clearRect(0, 0, width, height)

      const dashboardMode = isDashboardRef.current
      const globalAlphaScale = dashboardMode ? 0.42 : 0.92
      const camOffsetX = p.x * 38
      const camOffsetY = p.y * 26

      // 1. Scrolling Perspective Cyber Horizon Grid (bottom third)
      const horizonY = height * 0.56 + camOffsetY * 0.35
      const bottomY = height + 40
      const spanX = Math.max(width, 900) * 1.4
      ctx.save()
      ctx.lineWidth = 1
      const gridAlpha = dashboardMode ? 0.06 : 0.14
      const vLines = isCompact ? 10 : 16
      for (let i = -vLines / 2; i <= vLines / 2; i++) {
        const ratio = i / (vLines / 2)
        const topX = width * 0.5 + ratio * spanX * 0.12 - camOffsetX * 0.4
        const botX = width * 0.5 + ratio * spanX * 0.95 - camOffsetX * 1.1
        const grad = ctx.createLinearGradient(topX, horizonY, botX, bottomY)
        grad.addColorStop(0, 'rgba(0, 245, 255, 0)')
        grad.addColorStop(0.4, `rgba(139, 92, 246, ${gridAlpha})`)
        grad.addColorStop(1, `rgba(0, 245, 255, ${gridAlpha * 1.4})`)
        ctx.strokeStyle = grad
        ctx.beginPath()
        ctx.moveTo(topX, horizonY)
        ctx.lineTo(botX, bottomY)
        ctx.stroke()
      }

      const hLines = 8
      const scrollPhase = (time * 0.45) % 1
      for (let r = 0; r < hLines; r++) {
        const t = (r + scrollPhase) / hLines
        const easedT = t * t // perspective foreshortening
        const yPos = horizonY + (bottomY - horizonY) * easedT
        const halfW = spanX * (0.12 + 0.83 * easedT)
        ctx.strokeStyle = `rgba(0, 245, 255, ${gridAlpha * easedT * 1.3})`
        ctx.beginPath()
        ctx.moveTo(width * 0.5 - halfW - camOffsetX * (0.4 + 0.7 * easedT), yPos)
        ctx.lineTo(width * 0.5 + halfW - camOffsetX * (0.4 + 0.7 * easedT), yPos)
        ctx.stroke()
      }
      ctx.restore()

      // 2. 3D Holographic Rotating Core Reactor (centered/elevated behind Gateway, subtle corner on Dashboard)
      const coreRadius = dashboardMode
        ? Math.min(width, height) * 0.24
        : Math.min(width, height) * (isCompact ? 0.34 : 0.31)
      const coreCenterX = dashboardMode ? width * 0.78 - camOffsetX * 0.6 : width * 0.5 - camOffsetX * 0.5
      const coreCenterY = dashboardMode ? height * 0.34 - camOffsetY * 0.5 : height * 0.43 - camOffsetY * 0.5

      const rotY = time * 0.55 + p.x * 0.55
      const rotX = time * 0.34 + p.y * 0.45
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)

      const transformedVerts = ICOSA_VERTS.map(([vx, vy, vz]) => {
        // Rotate around Y
        const x1 = vx * cosY - vz * sinY
        const z1 = vx * sinY + vz * cosY
        // Rotate around X
        const y2 = vy * cosX - z1 * sinX
        const z2 = vy * sinX + z1 * cosX
        const scale = 3.2 / (3.2 + z2)
        return {
          x: coreCenterX + x1 * coreRadius * scale,
          y: coreCenterY + y2 * coreRadius * scale,
          z: z2,
        }
      })

      ctx.save()
      // Soft halo around core
      const coreGlow = ctx.createRadialGradient(
        coreCenterX,
        coreCenterY,
        coreRadius * 0.1,
        coreCenterX,
        coreCenterY,
        coreRadius * 1.45
      )
      coreGlow.addColorStop(0, dashboardMode ? 'rgba(139, 92, 246, 0.08)' : 'rgba(0, 245, 255, 0.14)')
      coreGlow.addColorStop(0.55, dashboardMode ? 'rgba(0, 245, 255, 0.03)' : 'rgba(168, 85, 247, 0.08)')
      coreGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(coreCenterX, coreCenterY, coreRadius * 1.45, 0, Math.PI * 2)
      ctx.fill()

      // Outer gyroscopic dashed ring
      ctx.strokeStyle = dashboardMode ? 'rgba(168, 85, 247, 0.14)' : 'rgba(251, 191, 36, 0.28)'
      ctx.lineWidth = 1.2
      ctx.setLineDash([8, 12])
      ctx.beginPath()
      ctx.ellipse(
        coreCenterX,
        coreCenterY,
        coreRadius * 1.32,
        coreRadius * 0.44,
        Math.sin(time * 0.4) * 0.35 + p.x * 0.2,
        0,
        Math.PI * 2
      )
      ctx.stroke()

      ctx.strokeStyle = dashboardMode ? 'rgba(0, 245, 255, 0.12)' : 'rgba(0, 245, 255, 0.25)'
      ctx.beginPath()
      ctx.ellipse(
        coreCenterX,
        coreCenterY,
        coreRadius * 1.18,
        coreRadius * 0.36,
        -Math.cos(time * 0.3) * 0.42 + p.y * 0.2,
        0,
        Math.PI * 2
      )
      ctx.stroke()
      ctx.setLineDash([])

      // Core wireframe edges
      ctx.lineWidth = dashboardMode ? 0.9 : 1.3
      for (const [a, b] of ICOSA_EDGES) {
        const va = transformedVerts[a]
        const vb = transformedVerts[b]
        const depthAlpha = Math.max(0.05, 0.42 - ((va.z + vb.z) * 0.5) * 0.15) * globalAlphaScale
        ctx.strokeStyle = a % 2 === 0
          ? `rgba(0, 245, 255, ${depthAlpha})`
          : `rgba(168, 85, 247, ${depthAlpha})`
        ctx.beginPath()
        ctx.moveTo(va.x, va.y)
        ctx.lineTo(vb.x, vb.y)
        ctx.stroke()
      }

      // Glowing vertices
      for (const v of transformedVerts) {
        const vAlpha = Math.max(0.15, 0.75 - v.z * 0.25) * globalAlphaScale
        ctx.fillStyle = `rgba(251, 191, 36, ${vAlpha})`
        ctx.beginPath()
        ctx.arc(v.x, v.y, dashboardMode ? 1.8 : 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // 3. 3D Depth Neural Constellation Lattice
      const projectedNodes = nodes.map((n) => {
        n.x += n.vx
        n.y += n.vy
        n.z += n.vz

        const boundX = width * 0.65
        const boundY = height * 0.65
        if (n.x > boundX) n.x = -boundX
        if (n.x < -boundX) n.x = boundX
        if (n.y > boundY) n.y = -boundY
        if (n.y < -boundY) n.y = boundY
        if (n.z > 580) n.z = 60
        if (n.z < 60) n.z = 580

        const proj = project(n.x - camOffsetX * (n.z * 0.004), n.y - camOffsetY * (n.z * 0.004), n.z)
        return { ...proj, hue: n.hue, size: n.size, z: n.z }
      })

      const maxLinkDist = isCompact ? 105 : 145
      for (let i = 0; i < projectedNodes.length; i++) {
        const a = projectedNodes[i]
        if (a.sx < -40 || a.sx > width + 40 || a.sy < -40 || a.sy > height + 40) continue

        for (let j = i + 1; j < projectedNodes.length; j++) {
          const b = projectedNodes[j]
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy)
          if (dist < maxLinkDist) {
            const strength = (1 - dist / maxLinkDist) * 0.22 * globalAlphaScale
            ctx.strokeStyle = `rgba(${paletteMap[a.hue]}, ${strength})`
            ctx.lineWidth = 0.85
            ctx.beginPath()
            ctx.moveTo(a.sx, a.sy)
            ctx.lineTo(b.sx, b.sy)
            ctx.stroke()
          }
        }

        const dotAlpha = Math.min(0.85, a.scale * 0.95) * globalAlphaScale
        ctx.fillStyle = `rgba(${paletteMap[a.hue]}, ${dotAlpha})`
        ctx.beginPath()
        ctx.arc(a.sx, a.sy, Math.max(0.9, a.size * a.scale), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    animId = requestAnimationFrame(renderFrame)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.95,
      }}
    />
  )
}
