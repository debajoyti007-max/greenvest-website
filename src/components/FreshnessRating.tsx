import { useState } from 'react'
import { showToast } from '../lib/toast'

interface FreshnessRatingProps {
  orderId: string
  lang: 'en' | 'bn'
}

const STAR_LABELS: Record<number, { en: string; bn: string }> = {
  1: { en: 'Poor 😞', bn: 'খুব খারাপ 😞' },
  2: { en: 'Fair 😐', bn: 'মোটামুটি 😐' },
  3: { en: 'Good 🙂', bn: 'ভালো 🙂' },
  4: { en: 'Very Good 😊', bn: 'বেশ ভালো 😊' },
  5: { en: 'Excellent! 🤩', bn: 'অসাধারণ! 🤩' },
}

const STORAGE_KEY = (id: string) => `greenvest_rating_${id}`

export default function FreshnessRating({ orderId, lang }: FreshnessRatingProps) {
  const saved = localStorage.getItem(STORAGE_KEY(orderId))
  const [rating, setRating] = useState<number | null>(saved ? Number(saved) : null)
  const [hover, setHover] = useState<number | null>(null)

  const handleRate = (star: number) => {
    setRating(star)
    localStorage.setItem(STORAGE_KEY(orderId), star.toString())
    showToast(
      lang === 'bn'
        ? `❤️ ${star} তারা রেটিং সংরক্ষিত হয়েছে!`
        : `❤️ ${star}-star rating saved! Thank you!`,
      '⭐'
    )
  }

  const handleDelete = () => {
    setRating(null)
    localStorage.removeItem(STORAGE_KEY(orderId))
    showToast(
      lang === 'bn' ? '🗑️ রেটিং মুছে ফেলা হয়েছে।' : '🗑️ Rating removed.',
      '🗑️'
    )
  }

  const displayStar = hover ?? rating ?? 0

  if (rating !== null) {
    return (
      <div className="freshness-rating-box success" style={{
        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
        border: '1.5px solid #86efac',
        borderRadius: '14px',
        padding: '1rem 1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem' }}>
            {'⭐'.repeat(rating)}{'☆'.repeat(5 - rating)}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>
            {STAR_LABELS[rating]?.[lang] || ''}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          title={lang === 'bn' ? 'রেটিং মুছুন' : 'Remove rating'}
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            color: '#dc2626',
            padding: '0.3rem 0.6rem',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          🗑️ {lang === 'bn' ? 'মুছুন' : 'Remove'}
        </button>
      </div>
    )
  }

  return (
    <div className="freshness-rating-box" style={{
      background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
      border: '1.5px solid #fde68a',
      borderRadius: '14px',
      padding: '1rem 1.2rem',
    }}>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', fontWeight: 600, color: '#92400e' }}>
        🌿 {lang === 'bn' ? 'আজকের সবজির তাজাত্ব রেট করুন:' : 'Rate the freshness of your vegetables:'}
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleRate(star)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.6rem',
                cursor: 'pointer',
                transition: 'transform 0.15s',
                transform: hover === star ? 'scale(1.3)' : 'scale(1)',
                filter: star <= displayStar ? 'brightness(1)' : 'brightness(0.4)',
              }}
              title={STAR_LABELS[star]?.[lang]}
            >
              ⭐
            </button>
          ))}
        </div>
        {hover && (
          <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 600, marginLeft: '0.3rem' }}>
            {STAR_LABELS[hover]?.[lang]}
          </span>
        )}
      </div>
    </div>
  )
}
