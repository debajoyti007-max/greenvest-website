import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface FairytaleAtmosphereProps {
  /**
   * If true (e.g. user is logged in to dashboard), dims or softens the scene
   * so dense tables and data cards remain 100% readable.
   */
  isDashboard?: boolean
}

export const FairytaleAtmosphere: React.FC<FairytaleAtmosphereProps> = ({ isDashboard = false }) => {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // ── Safe WebGL Capability Check ──────────────────────────────────────────
    try {
      const testCanvas = document.createElement('canvas')
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl')
      if (!gl) return
    } catch {
      return
    }

    // ── 1. Scene & Volumetric Twilight Atmosphere ─────────────────────────────
    const scene = new THREE.Scene()
    const fogColor = new THREE.Color(0x05070d) // Deep enchanted obsidian
    scene.background = fogColor
    scene.fog = new THREE.FogExp2(0x05070d, isDashboard ? 0.045 : 0.032)

    // ── 2. Cinematic Camera with Heavy Game Inertia ───────────────────────────
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 0, 13)

    // ── 3. High-Performance ACES Renderer ────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    // Cap pixel ratio to 1.75 to protect 4K/retina mobile devices from overheating
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = isDashboard ? 0.95 : 1.35
    container.appendChild(renderer.domElement)

    // ── 4. Cinematic Fairytale Game Lighting ──────────────────────────────────
    // Ambient moonlit night
    const ambientLight = new THREE.AmbientLight(0x0c1527, 1.4)
    scene.add(ambientLight)

    // Directional moonlit sapphire rim light (highlights metallic PBR edges)
    const moonRim = new THREE.DirectionalLight(0x818cf8, isDashboard ? 1.5 : 3.2)
    moonRim.position.set(-8, 9, -5)
    scene.add(moonRim)

    // Warm hearthfire / golden ember light from the relic core
    const emberPoint = new THREE.PointLight(0xf59e0b, isDashboard ? 2.0 : 4.5, 25)
    emberPoint.position.set(3, -2, 4)
    scene.add(emberPoint)

    // Subtle ethereal amethyst ground bounce light
    const twilightBounce = new THREE.PointLight(0xa855f7, isDashboard ? 1.0 : 2.5, 20)
    twilightBounce.position.set(-4, -6, 3)
    scene.add(twilightBounce)

    // ── 5. The Ancient Sacred Relic (Floating Monolith Core) ──────────────────
    const relicGroup = new THREE.Group()
    scene.add(relicGroup)

    // Outer Torus Knot: Ancient carved obsidian artifact with pearlescent iridescence
    const knotGeo = new THREE.TorusKnotGeometry(1.65, 0.32, 140, 32, 2, 3)
    const knotMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.88,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      iridescence: 0.82,
      iridescenceIOR: 1.45,
      reflectivity: 0.95,
    })
    const knotMesh = new THREE.Mesh(knotGeo, knotMat)
    relicGroup.add(knotMesh)

    // Celestial Orbital Halo Ring
    const haloGeo = new THREE.TorusGeometry(2.65, 0.04, 16, 100)
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: isDashboard ? 0.4 : 0.85,
      metalness: 0.9,
      roughness: 0.2,
    })
    const haloMesh = new THREE.Mesh(haloGeo, haloMat)
    haloMesh.rotation.x = Math.PI * 0.45
    relicGroup.add(haloMesh)

    // Inner Sacred Starlight Core (Icosahedron jewel)
    const coreGeo = new THREE.IcosahedronGeometry(0.55, 1)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: isDashboard ? 0.6 : 1.2,
      metalness: 0.1,
      roughness: 0.1,
      wireframe: true,
    })
    const coreMesh = new THREE.Mesh(coreGeo, coreMat)
    relicGroup.add(coreMesh)

    // ── 6. Living Forest Spirit Wisps & Golden Embers ────────────────────────
    const particleCount = isDashboard ? 120 : 260
    const particlePositions = new Float32Array(particleCount * 3)
    const particleSpeeds = new Float32Array(particleCount * 3)
    const particlePhases = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3
      particlePositions[idx] = (Math.random() - 0.5) * 18
      particlePositions[idx + 1] = (Math.random() - 0.5) * 14
      particlePositions[idx + 2] = (Math.random() - 0.5) * 12

      particleSpeeds[idx] = (Math.random() - 0.5) * 0.0035
      particleSpeeds[idx + 1] = 0.004 + Math.random() * 0.008 // Gentle natural rising drift
      particleSpeeds[idx + 2] = (Math.random() - 0.5) * 0.0035

      particlePhases[i] = Math.random() * Math.PI * 2
    }

    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))

    // Procedural soft-glow fairy dust texture (zero network lag / zero assets)
    const dustCanvas = document.createElement('canvas')
    dustCanvas.width = 64
    dustCanvas.height = 64
    const dustCtx = dustCanvas.getContext('2d')
    if (dustCtx) {
      const grad = dustCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
      grad.addColorStop(0, 'rgba(255, 245, 190, 1.0)') // Pure glowing fairy light
      grad.addColorStop(0.25, 'rgba(245, 158, 11, 0.6)') // Golden aura
      grad.addColorStop(0.65, 'rgba(168, 85, 247, 0.15)') // Twilight violet halo
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)')
      dustCtx.fillStyle = grad
      dustCtx.fillRect(0, 0, 64, 64)
    }
    const dustTexture = new THREE.CanvasTexture(dustCanvas)

    const particleMat = new THREE.PointsMaterial({
      size: isDashboard ? 0.32 : 0.42,
      map: dustTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: isDashboard ? 0.55 : 0.9,
    })

    const particles = new THREE.Points(particleGeo, particleMat)
    scene.add(particles)

    // ── 7. Cinematic Camera Crane Physics (Lerp Parallax) ─────────────────────
    let mouseX = 0
    let mouseY = 0
    let targetX = 0
    let targetY = 0

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0
      let clientY = 0
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else if ('clientX' in e) {
        clientX = e.clientX
        clientY = e.clientY
      }
      mouseX = (clientX / window.innerWidth - 0.5) * 2
      mouseY = (clientY / window.innerHeight - 0.5) * 2
    }

    window.addEventListener('mousemove', onPointerMove, { passive: true })
    window.addEventListener('touchmove', onPointerMove, { passive: true })

    // ── 8. Render Loop with Visibility Sleep Shield (0% Idle CPU) ─────────────
    let animId: number
    const clock = new THREE.Clock()
    let isPaused = false

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true
        cancelAnimationFrame(animId)
      } else {
        isPaused = false
        clock.getDelta() // discard elapsed idle delta
        animId = requestAnimationFrame(renderFrame)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const renderFrame = () => {
      if (isPaused) return

      const time = clock.getElapsedTime()

      // Cinematic crane inertia (smooth damping)
      targetX += (mouseX - targetX) * 0.022
      targetY += (mouseY - targetY) * 0.022

      camera.position.x = targetX * 1.6
      camera.position.y = -targetY * 1.3
      camera.lookAt(0, 0, 0)

      // Sacred artifact meditative rotation & floating breath
      relicGroup.rotation.y = time * 0.12
      relicGroup.rotation.x = Math.sin(time * 0.22) * 0.28
      relicGroup.position.y = Math.sin(time * 0.55) * 0.22

      // Counter-rotating orbital halo ring
      haloMesh.rotation.z = -time * 0.18
      haloMesh.rotation.y = Math.sin(time * 0.3) * 0.2

      // Inner jewel subtle cosmic pulsation
      const pulse = 1.0 + Math.sin(time * 2.2) * 0.08
      coreMesh.scale.set(pulse, pulse, pulse)

      // Drifting spirit fireflies (organic wave float)
      const positions = particleGeo.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3
        positions[idx + 1] += particleSpeeds[idx + 1]
        // Gentle organic wind breeze
        positions[idx] += Math.sin(time * 0.8 + particlePhases[i]) * 0.004
        positions[idx + 2] += Math.cos(time * 0.7 + particlePhases[i]) * 0.003

        // Loop seamlessly back to forest floor when floated past sky
        if (positions[idx + 1] > 8.0) {
          positions[idx + 1] = -8.0
          positions[idx] = (Math.random() - 0.5) * 18
          positions[idx + 2] = (Math.random() - 0.5) * 12
        }
      }
      particleGeo.attributes.position.needsUpdate = true

      renderer.render(scene, camera)
      animId = requestAnimationFrame(renderFrame)
    }

    animId = requestAnimationFrame(renderFrame)

    // ── 9. Responsive Resize Handler ──────────────────────────────────────────
    const onResize = () => {
      if (!container) return
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize)

    // ── 10. Memory Safe Cleanup on Unmount ─────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      // Deep GPU resource disposal
      knotGeo.dispose()
      knotMat.dispose()
      haloGeo.dispose()
      haloMat.dispose()
      coreGeo.dispose()
      coreMat.dispose()
      particleGeo.dispose()
      particleMat.dispose()
      dustTexture.dispose()
      renderer.dispose()

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [isDashboard])

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        transition: 'opacity 0.8s ease',
        opacity: 1,
      }}
      aria-hidden="true"
    />
  )
}

export default FairytaleAtmosphere
