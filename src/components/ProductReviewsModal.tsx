import { useState, useMemo, type FormEvent } from 'react'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import type { Product } from '../types'

interface ProductReviewsModalProps {
  product: Product
  onClose: () => void
}

const PRESET_TAGS = [
  { bn: '🥬 খুব তাজা', en: '🥬 Very Fresh' },
  { bn: '⚡ দ্রুত ডেলিভারি', en: '⚡ Fast Delivery' },
  { bn: '👍 সঠিক ওজন', en: '👍 Accurate Weight' },
  { bn: '💰 সেরা দাম', en: '💰 Best Price' },
  { bn: '⭐ প্রিমিয়াম কোয়ালিটি', en: '⭐ Premium Quality' },
]

export default function ProductReviewsModal({ product, onClose }: ProductReviewsModalProps) {
  const { user } = useAuth()
  const { lang, getReviewsForProduct, getProductRating, addReview } = useStore()

  const reviews = getReviewsForProduct(product.id)
  const { avg, count } = getProductRating(product.id)

  const [isWriting, setIsWriting] = useState(false)
  const [rating, setRating] = useState(5)
  const [name, setName] = useState(user?.name || '')
  const [comment, setComment] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Star breakdown calculation
  const breakdown = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5
      counts[star] = (counts[star] || 0) + 1
    })
    const total = reviews.length || 1
    return {
      5: Math.round((counts[5] / total) * 100),
      4: Math.round((counts[4] / total) * 100),
      3: Math.round((counts[3] / total) * 100),
      2: Math.round((counts[2] / total) * 100),
      1: Math.round((counts[1] / total) * 100),
    }
  }, [reviews])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      await addReview({
        productId: product.id,
        userId: user?.id,
        userName: name.trim(),
        rating,
        comment: comment.trim(),
        tag: selectedTag || undefined,
        isVerifiedBuyer: true,
      })
      setComment('')
      setIsWriting(false)
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="glass-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="glass-modal-card review-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="review-modal-header">
          <div className="review-modal-title-area">
            <span className="review-product-emoji">{product.emoji}</span>
            <div>
              <h2 className="review-modal-title">
                {lang === 'bn' ? product.bnName : product.name}
              </h2>
              <p className="review-modal-sub">
                {lang === 'bn' ? `${product.name} — কাস্টমার রিভিউ ও রেটিং` : `${product.bnName} — Customer Reviews & Ratings`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="glass-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Rating Overview Card */}
        <div className="rating-overview-card">
          <div className="rating-overview-score">
            <span className="rating-big-num">{avg.toFixed(1)}</span>
            <div className="rating-stars-gold">
              {'★'.repeat(Math.round(avg))}
              {'☆'.repeat(5 - Math.round(avg))}
            </div>
            <span className="rating-total-count">
              {lang === 'bn' ? `${count} টি যাচাইকৃত রিভিউ` : `${count} verified reviews`}
            </span>
          </div>

          <div className="rating-bars-col">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="rating-bar-row">
                <span className="rating-bar-star-label">{star} ★</span>
                <div className="rating-bar-track">
                  <div
                    className="rating-bar-fill"
                    style={{ width: `${breakdown[star as 1 | 2 | 3 | 4 | 5]}%` }}
                  />
                </div>
                <span className="rating-bar-pct">
                  {breakdown[star as 1 | 2 | 3 | 4 | 5]}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button: Write Review */}
        {!isWriting && (
          <div className="review-action-row">
            <button
              type="button"
              className="btn btn-primary btn-sm review-write-trigger"
              onClick={() => setIsWriting(true)}
            >
              ✍️ {lang === 'bn' ? 'একটি রিভিউ লিখুন' : 'Write a Review'}
            </button>
          </div>
        )}

        {/* Write Review Form */}
        {isWriting && (
          <form className="write-review-form" onSubmit={handleSubmit}>
            <h3 className="write-review-title">
              ✍️ {lang === 'bn' ? 'আপনার মূল্যবান মতামত দিন' : 'Share Your Experience'}
            </h3>

            {/* Interactive Stars */}
            <div className="interactive-stars-row">
              <label className="write-label">
                {lang === 'bn' ? 'রেটিং নির্বাচন করুন:' : 'Select Rating:'}
              </label>
              <div className="interactive-stars">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`star-btn ${num <= rating ? 'active' : ''}`}
                    onClick={() => setRating(num)}
                    aria-label={`${num} stars`}
                  >
                    ★
                  </button>
                ))}
                <span className="star-rating-text">
                  {rating === 5 && (lang === 'bn' ? 'অসাধারণ (৫/৫)' : 'Excellent (5/5)')}
                  {rating === 4 && (lang === 'bn' ? 'খুব ভালো (৪/৫)' : 'Very Good (4/5)')}
                  {rating === 3 && (lang === 'bn' ? 'ভালো (৩/৫)' : 'Good (3/5)')}
                  {rating <= 2 && (lang === 'bn' ? 'সাধারণ (২/৫)' : 'Average (2/5)')}
                </span>
              </div>
            </div>

            {/* Quick Preset Tags */}
            <div className="preset-tags-group">
              <label className="write-label">
                {lang === 'bn' ? 'ট্যাগ নির্বাচন করুন (ঐচ্ছিক):' : 'Quick Tag (Optional):'}
              </label>
              <div className="preset-tags-list">
                {PRESET_TAGS.map((t) => {
                  const tagText = lang === 'bn' ? t.bn : t.en
                  const isSelected = selectedTag === tagText
                  return (
                    <button
                      key={t.en}
                      type="button"
                      className={`preset-tag-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedTag(isSelected ? '' : tagText)}
                    >
                      {tagText}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Name Input */}
            <div className="form-group-compact">
              <label className="write-label">
                {lang === 'bn' ? 'আপনার নাম:' : 'Your Name:'}
              </label>
              <input
                type="text"
                required
                className="input-compact"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: সুব্রত মন্ডল' : 'e.g. Subrata Mondal'}
              />
            </div>

            {/* Comment Area */}
            <div className="form-group-compact">
              <label className="write-label">
                {lang === 'bn' ? 'আপনার রিভিউ / মন্তব্য:' : 'Your Feedback:'}
              </label>
              <textarea
                className="input-compact review-textarea"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'শাকসবজি বা মাছের গুণমান, সতেজতা ও ডেলিভারি কেমন ছিল লিখুন...'
                    : 'Describe freshness, quality, packing and delivery experience...'
                }
              />
            </div>

            {/* Form Actions */}
            <div className="write-review-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsWriting(false)}
                disabled={submitting}
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || !name.trim()}
              >
                {submitting
                  ? (lang === 'bn' ? 'জমা হচ্ছে…' : 'Submitting…')
                  : (lang === 'bn' ? 'রিভিউ জমা দিন 🚀' : 'Submit Review 🚀')}
              </button>
            </div>
          </form>
        )}

        {/* Reviews List */}
        <div className="review-list-container">
          <h3 className="review-list-title">
            💬 {lang === 'bn' ? 'সাম্প্রতিক ক্রেতাদের মন্তব্য' : 'Recent Customer Feedback'} ({reviews.length})
          </h3>

          {reviews.length === 0 ? (
            <p className="empty-reviews-hint">
              {lang === 'bn' ? 'এখনো কোনো রিভিউ নেই। প্রথম রিভিউটি আপনি দিন!' : 'No reviews yet. Be the first to write one!'}
            </p>
          ) : (
            <div className="review-cards-scroll">
              {reviews.map((r) => (
                <div key={r.id} className="customer-review-card">
                  <div className="review-card-top">
                    <div className="reviewer-info">
                      <span className="reviewer-avatar">
                        {r.userName.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="reviewer-name-row">
                          <strong className="reviewer-name">{r.userName}</strong>
                          {r.isVerifiedBuyer && (
                            <span className="verified-buyer-badge" title="Verified Customer">
                              ✓ {lang === 'bn' ? 'যাচাইকৃত ক্রেতা' : 'Verified Buyer'}
                            </span>
                          )}
                        </div>
                        <span className="review-date">{formatDate(r.createdAt)}</span>
                      </div>
                    </div>

                    <div className="review-card-stars">
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(5 - r.rating)}
                    </div>
                  </div>

                  {r.tag && (
                    <span className="review-tag-pill">{r.tag}</span>
                  )}

                  {r.comment && (
                    <p className="review-comment-text">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
