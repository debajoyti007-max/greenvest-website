import { useState } from 'react'
import { showToast } from './Toast'

interface FreshnessRatingProps {
  orderId: string
  lang: 'en' | 'bn'
}

export default function FreshnessRating({ orderId, lang }: FreshnessRatingProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleRate = (star: number) => {
    setRating(star)
    setSubmitted(true)
    localStorage.setItem(`greenvest_rating_${orderId}`, star.toString())
    showToast(
      lang === 'bn'
        ? '❤️ তাজা সবজি রেটিং জানানোর জন্য ধন্যবাদ!'
        : '❤️ Thank you for rating vegetable freshness!',
      '⭐'
    )
  }

  if (submitted || localStorage.getItem(`greenvest_rating_${orderId}`)) {
    return (
      <div className="freshness-rating-box success">
        <span>⭐ {lang === 'bn' ? 'রেটিং সংরক্ষিত হয়েছে: ' : 'Your Rating: '}{rating || localStorage.getItem(`greenvest_rating_${orderId}`)} / 5</span>
      </div>
    )
  }

  return (
    <div className="freshness-rating-box">
      <span className="rating-title">
        🌿 {lang === 'bn' ? 'আজকের সবজির তাজাত্ব কেমন ছিল?' : 'How fresh were your vegetables today?'}
      </span>
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="star-btn"
            onClick={() => handleRate(star)}
          >
            ⭐
          </button>
        ))}
      </div>
    </div>
  )
}
