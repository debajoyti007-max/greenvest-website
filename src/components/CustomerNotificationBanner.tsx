import { useState } from 'react'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { isDealExpired } from '../lib/deals'
import { showToast } from '../lib/toast'

const TWELVE_HOURS = 12 * 60 * 60 * 1000

export default function CustomerNotificationBanner() {
  const { notifications, promotionalDeals, lang } = useStore()
  const { user } = useAuth()
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gv_dismissed_notifs') || '[]')
    } catch {
      return []
    }
  })

  // 1. Check for active, recent notifications first
  const activeNotification = (notifications || []).find((n) => {
    const isTarget = !n.userId || n.userId === 'all' || (user && n.userId === user.id)
    const isRecent = Date.now() - new Date(n.createdAt).getTime() < TWELVE_HOURS
    const isNotDismissed = !dismissedIds.includes(n.id)
    return isTarget && isRecent && isNotDismissed
  })

  // 2. Check for active promotional deals / flash discount announcements
  const activeDeal = (promotionalDeals || []).find((d) => {
    const isLive = d.isActive !== false && !isDealExpired(d)
    const isNotDismissed = !dismissedIds.includes(d.id)
    return isLive && isNotDismissed
  })

  const handleDismiss = (id: string) => {
    const updated = [...dismissedIds, id]
    setDismissedIds(updated)
    try {
      localStorage.setItem('gv_dismissed_notifs', JSON.stringify(updated))
    } catch (e) {
      console.error(e)
    }
  }

  const handleClaimCoupon = (code: string, id: string) => {
    if (!code) return
    try {
      sessionStorage.setItem('gv_pending_coupon', code.toUpperCase())
      navigator.clipboard?.writeText(code.toUpperCase()).catch(() => {})
      showToast(
        lang === 'bn'
          ? `🎟️ কুপন কোড "${code.toUpperCase()}" কপি ও চেকআউটে যুক্ত হয়েছে!`
          : `🎟️ Coupon "${code.toUpperCase()}" claimed & ready at checkout!`,
        '🎉',
      )
    } catch {}
    handleDismiss(id)
  }

  // Determine what to display
  let bannerItem: {
    id: string
    badge: string
    title: string
    subtitle: string
    couponCode?: string
    emoji: string
    time?: string
  } | null = null

  if (activeNotification) {
    // Extract any embedded coupon code from message or title
    const couponMatch =
      activeNotification.message.match(/(?:code|কোড|coupon|কুপন)[:\s]+([A-Za-z0-9_-]{3,15})/i) ||
      activeNotification.title.match(/(?:code|কোড|coupon|কুপন)[:\s]+([A-Za-z0-9_-]{3,15})/i)

    bannerItem = {
      id: activeNotification.id,
      badge: activeNotification.sender || (lang === 'bn' ? 'স্টোর নোটিশ' : 'Store Notice'),
      title: activeNotification.title,
      subtitle: activeNotification.message,
      couponCode: couponMatch ? couponMatch[1].toUpperCase() : undefined,
      emoji: '📢',
      time: new Date(activeNotification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  } else if (activeDeal) {
    bannerItem = {
      id: activeDeal.id,
      badge: lang === 'bn' ? (activeDeal.badgeBn || 'অফার') : (activeDeal.badgeEn || 'Offer'),
      title: lang === 'bn' ? (activeDeal.titleBn || activeDeal.titleEn) : (activeDeal.titleEn || activeDeal.titleBn),
      subtitle: lang === 'bn' ? (activeDeal.subtitleBn || '') : (activeDeal.subtitleEn || ''),
      couponCode: activeDeal.couponCode,
      emoji: activeDeal.emoji || '🔥',
    }
  }

  if (!bannerItem) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        width: '92%',
        maxWidth: '680px',
        background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
        color: '#ffffff',
        padding: '0.85rem 1.25rem',
        borderRadius: '16px',
        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.85rem',
        animation: 'slideDownBanner 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <style>{`
        @keyframes slideDownBanner {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#bbf7d0' }}>
          <span>{bannerItem.emoji} {bannerItem.badge}</span>
          {bannerItem.time && (
            <>
              <span>•</span>
              <span style={{ fontWeight: 400 }}>{bannerItem.time}</span>
            </>
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.15rem', color: '#ffffff' }}>
          {bannerItem.title}
        </div>
        {bannerItem.subtitle && (
          <div style={{ fontSize: '0.85rem', opacity: 0.95, marginTop: '0.1rem', wordBreak: 'break-word', color: '#f0fdf4' }}>
            {bannerItem.subtitle}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
        {bannerItem.couponCode && (
          <button
            type="button"
            onClick={() => handleClaimCoupon(bannerItem!.couponCode!, bannerItem!.id)}
            style={{
              background: '#fef08a',
              border: 'none',
              color: '#854d0e',
              padding: '0.42rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🎟️ {bannerItem.couponCode}
          </button>
        )}

        {/* 🚫 Ignore / Dismiss Option requested by user */}
        <button
          type="button"
          onClick={() => handleDismiss(bannerItem!.id)}
          title={lang === 'bn' ? 'অফারটি ইগনোর করুন' : 'Ignore this announcement'}
          style={{
            background: 'rgba(255, 255, 255, 0.18)',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            color: '#ffffff',
            padding: '0.42rem 0.8rem',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)')}
        >
          ✕ {lang === 'bn' ? 'ইগনোর' : 'Ignore'}
        </button>
      </div>
    </div>
  )
}
