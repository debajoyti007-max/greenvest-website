import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { filterActivePromotionalDeals, formatDealTimeRemaining } from '../lib/deals'
import { showToast } from '../lib/toast'
import type { Lang } from '../types'

export default function DealsBanner({ lang }: { lang: Lang }) {
  const { promotionalDeals } = useStore()
  const [, setTick] = useState(0)

  // 1-second interval to update countdowns and auto-remove expired deals immediately
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Customer ignore list persisted in localStorage
  const [ignoredDealIds, setIgnoredDealIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('gv_dismissed_deals')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const handleIgnoreDeal = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setIgnoredDealIds((prev) => {
      const next = [...new Set([...prev, id])]
      try {
        localStorage.setItem('gv_dismissed_deals', JSON.stringify(next))
      } catch {}
      return next
    })
    showToast(lang === 'bn' ? 'অফারটি লুকানো হয়েছে' : 'Offer dismissed', '✕')
  }

  // Auto-smart filter: only active, non-expired, and non-ignored deals
  const activeDeals = filterActivePromotionalDeals(promotionalDeals).filter(
    (d) => !ignoredDealIds.includes(d.id),
  )
  const [activeIdx, setActiveIdx] = useState(0)

  // Clamp activeIdx if activeDeals length changes
  const currentIndex = activeIdx >= activeDeals.length ? 0 : activeIdx
  const currentDeal = activeDeals[currentIndex]

  // Carousel rotation timer (every 6 seconds)
  useEffect(() => {
    if (activeDeals.length <= 1) return
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % activeDeals.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [activeDeals.length])

  if (!currentDeal || activeDeals.length === 0) {
    return null
  }

  const copyCode = (code: string) => {
    if (!code) return
    sessionStorage.setItem('gv_pending_coupon', code)
    navigator.clipboard?.writeText(code).catch(() => {})
    showToast(
      lang === 'bn'
        ? `🎟️ কুপন কোড "${code}" কপি ও চেকআউটে স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে!`
        : `🎟️ Coupon code "${code}" copied & ready at checkout!`,
      '🎉',
    )
  }

  const badgeText = lang === 'bn' ? (currentDeal.badgeBn || currentDeal.badgeEn) : (currentDeal.badgeEn || currentDeal.badgeBn)
  const titleText = lang === 'bn' ? (currentDeal.titleBn || currentDeal.titleEn) : (currentDeal.titleEn || currentDeal.titleBn)
  const subtitleText = lang === 'bn' ? (currentDeal.subtitleBn || currentDeal.subtitleEn) : (currentDeal.subtitleEn || currentDeal.subtitleBn)
  const btnText = lang === 'bn' ? (currentDeal.buttonTextBn || 'কপি কোড') : (currentDeal.buttonTextEn || 'Copy Code')

  // Live remaining time string
  const timeRemaining = currentDeal.expiresAt
    ? formatDealTimeRemaining(currentDeal.expiresAt, lang)
    : ''

  return (
    <section className="deals-banner-container" aria-label="Promotional Deals & Offers">
      <div
        className="deals-banner-card"
        style={{
          background: currentDeal.bgGradient || 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
        }}
      >
        <div className="deals-content">
          <div className="deals-badge-row">
            <span className="deals-pill">
              {currentDeal.emoji || '🔥'} {badgeText}
            </span>

            {/* ⏳ Live Smart Expiry Countdown Badge */}
            {timeRemaining && timeRemaining !== 'Expired' && (
              <span
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#fef08a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⏳ {timeRemaining}
              </span>
            )}

            {activeDeals.length > 1 && (
              <span className="deals-dots">
                {activeDeals.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-label={`Show deal ${i + 1}`}
                    className={`deal-dot-btn ${i === currentIndex ? 'active' : ''}`}
                    onClick={() => setActiveIdx(i)}
                  />
                ))}
              </span>
            )}

            {/* 🚫 Ignore Option requested by user */}
            <button
              type="button"
              onClick={(e) => handleIgnoreDeal(currentDeal.id, e)}
              title={lang === 'bn' ? 'অফারটি ইগনোর করুন' : 'Ignore this offer'}
              aria-label="Ignore offer"
              style={{
                marginLeft: 'auto',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.45)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.25)')}
            >
              ✕ {lang === 'bn' ? 'ইগনোর' : 'Ignore'}
            </button>
          </div>

          <h3 className="deals-title">{titleText}</h3>
          {subtitleText && <p className="deals-subtitle">{subtitleText}</p>}
        </div>

        <div className="deals-action-box">
          {currentDeal.couponCode ? (
            <>
              <div className="deals-code-chip" onClick={() => copyCode(currentDeal.couponCode!)}>
                <span className="deals-code-text">{currentDeal.couponCode}</span>
                <span className="deals-copy-icon">📋</span>
              </div>
              <button
                type="button"
                className="btn btn-sm deals-apply-btn"
                onClick={() => copyCode(currentDeal.couponCode!)}
              >
                {btnText}
              </button>
            </>
          ) : currentDeal.linkUrl ? (
            <Link
              to={currentDeal.linkUrl}
              className="btn btn-sm deals-apply-btn"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {btnText} →
            </Link>
          ) : (
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'white',
                background: 'rgba(255,255,255,0.2)',
                padding: '4px 10px',
                borderRadius: '8px',
              }}
            >
              ✓ Active Offer
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
