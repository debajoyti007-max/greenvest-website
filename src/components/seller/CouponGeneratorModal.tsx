import { useState } from 'react'
import { showToast } from '../../lib/toast'
import { useStore } from '../../context/useStore'
import { useAuth } from '../../context/useAuth'

interface CouponGeneratorModalProps {
  onClose: () => void
}

export default function CouponGeneratorModal({ onClose }: CouponGeneratorModalProps) {
  const { lang, createCoupon, sendNotification } = useStore()
  const { user } = useAuth()

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat')
  const [discountValue, setDiscountValue] = useState<number>(50)
  const [minOrder, setMinOrder] = useState<number>(500)
  const [validityDays, setValidityDays] = useState<number>(15)
  const [broadcast, setBroadcast] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdCoupon, setCreatedCoupon] = useState<{
    code: string
    discountType: 'flat' | 'percent'
    discountValue: number
    minOrder: number
    expiryText: string
    shareMsg: string
  } | null>(null)

  // Quick code randomizer
  const generateRandomCode = () => {
    const prefixes = ['GV', 'FRESH', 'SUMMER', 'SAVE', 'ORGANIC', 'SUPER', 'OFFER']
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const suffix = discountType === 'flat' ? `${discountValue}` : `${discountValue}PCT`
    setCode(`${prefix}${suffix}`)
  }

  const handleCreate = async () => {
    const finalCode = (code.trim() || `GV${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (!finalCode) {
      showToast(lang === 'bn' ? 'সঠিক কুপন কোড লিখুন' : 'Enter a valid coupon code', '⚠️', 'error')
      return
    }

    if (discountValue <= 0) {
      showToast(lang === 'bn' ? 'সঠিক ছাড়ের পরিমাণ দিন' : 'Enter valid discount amount', '⚠️', 'error')
      return
    }

    setCreating(true)

    let expiresAt: string | undefined = undefined
    let expiryText = lang === 'bn' ? 'মেয়াদ: সীমাহীন' : 'Validity: Lifetime'

    if (validityDays > 0) {
      const expDate = new Date()
      expDate.setDate(expDate.getDate() + validityDays)
      expiresAt = expDate.toISOString()
      expiryText = lang === 'bn' ? `${validityDays} দিন (${expDate.toLocaleDateString('bn-IN')})` : `${validityDays} Days (${expDate.toLocaleDateString()})`
    }

    try {
      const ok = await createCoupon({
        code: finalCode,
        discount_type: discountType,
        discount_value: Number(discountValue),
        min_order: Number(minOrder) || 0,
        valid: true,
        expires_at: expiresAt,
      })

      if (ok) {
        const discountLabel = discountType === 'flat' ? `₹${discountValue}` : `${discountValue}%`

        // Format share message
        const shareMsg =
          lang === 'bn'
            ? `🎉 GreenVest বিশেষ অফার!\n\n🎟️ কুপন কোড: *${finalCode}*\n💸 ছাড়: *${discountLabel}*\n🛒 মিনিমাম অর্ডার: ₹${minOrder}\n⏳ ${expiryText}\n\n👉 অর্ডার করুন: https://greenvest-website.vercel.app`
            : `🎉 GreenVest Special Discount Offer!\n\n🎟️ Coupon Code: *${finalCode}*\n💸 Discount: *${discountLabel}*\n🛒 Min Order: ₹${minOrder}\n⏳ ${expiryText}\n\n👉 Shop now: https://greenvest-website.vercel.app`

        if (broadcast) {
          try {
            await sendNotification(
              'all',
              lang === 'bn' ? `🎟️ নতুন অফার কুপন: ${finalCode}` : `🎟️ New Promo Code: ${finalCode}`,
              lang === 'bn'
                ? `ব্যবহার করুন কোড ${finalCode} এবং পান ${discountLabel} ছাড় (মিনিমাম অর্ডার ₹${minOrder})!`
                : `Use code ${finalCode} to get ${discountLabel} discount on orders over ₹${minOrder}!`,
              user?.name || 'GreenVest Store'
            )
          } catch {}
        }

        setCreatedCoupon({
          code: finalCode,
          discountType,
          discountValue,
          minOrder,
          expiryText,
          shareMsg,
        })

        showToast(
          lang === 'bn'
            ? `🎉 কুপন ${finalCode} সফলভাবে তৈরি ও সক্রিয় করা হয়েছে!`
            : `🎉 Coupon ${finalCode} created & activated!`,
          '🎟️'
        )
      } else {
        showToast(lang === 'bn' ? 'কুপন সেভ করতে সমস্যা হয়েছে' : 'Failed to save coupon', '❌', 'error')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleCopyCode = async (c: string) => {
    try {
      await navigator.clipboard.writeText(c)
      showToast(lang === 'bn' ? '📋 কোড কপি করা হয়েছে!' : '📋 Code copied to clipboard!', '✅')
    } catch {}
  }

  const handleShareCoupon = async (msg: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'GreenVest Coupon Offer',
          text: msg,
        })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(msg)
      showToast(lang === 'bn' ? 'অফার টেক্সট কপি হয়েছে!' : 'Offer message copied!', '📋')
    } catch {}
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal coupon-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(500px, 94vw)',
          borderRadius: '16px',
          background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
          border: '1.5px solid #fde047',
          padding: '1.5rem',
          boxShadow: '0 20px 40px rgba(180, 83, 9, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🎟️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#854d0e', fontWeight: 800 }}>
                {lang === 'bn' ? 'সেলার কুপন জেনারেটর' : 'Seller Promo Coupon Creator'}
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
                {lang === 'bn' ? 'কাস্টমারদের জন্য কাস্টম ডিসকাউন্ট তৈরি করুন' : 'Custom Discount & Campaign Codes'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {!createdCoupon ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {/* Coupon Code Input */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                {lang === 'bn' ? 'কুপন কোড (Coupon Code):' : 'Coupon Code:'}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={lang === 'bn' ? 'যেমন: SAVE50, GV100' : 'e.g. SAVE50, GV100'}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: '1.5px solid #d1d5db',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                />
                <button
                  type="button"
                  onClick={generateRandomCode}
                  style={{
                    padding: '0.6rem 0.9rem',
                    background: '#fef08a',
                    border: '1px solid #eab308',
                    borderRadius: '8px',
                    fontWeight: 700,
                    color: '#854d0e',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🎲 {lang === 'bn' ? 'অটো কোড' : 'Random'}
                </button>
              </div>
            </div>

            {/* Discount Type */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                {lang === 'bn' ? 'ছাড়ের ধরণ (Discount Type):' : 'Discount Type:'}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setDiscountType('flat')}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: '2px solid',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: discountType === 'flat' ? '#fef08a' : '#ffffff',
                    borderColor: discountType === 'flat' ? '#eab308' : '#e5e7eb',
                    color: discountType === 'flat' ? '#854d0e' : '#4b5563',
                  }}
                >
                  💰 {lang === 'bn' ? 'নগদ টাকা ছাড় (Flat ₹)' : 'Flat Amount (₹)'}
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: '2px solid',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: discountType === 'percent' ? '#fef08a' : '#ffffff',
                    borderColor: discountType === 'percent' ? '#eab308' : '#e5e7eb',
                    color: discountType === 'percent' ? '#854d0e' : '#4b5563',
                  }}
                >
                  📊 {lang === 'bn' ? 'শতাংশ ছাড় (Percent %)' : 'Percentage (%)'}
                </button>
              </div>
            </div>

            {/* Discount Value & Min Order row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                  {discountType === 'flat'
                    ? (lang === 'bn' ? 'ছাড়ের পরিমাণ (₹):' : 'Discount (₹):')
                    : (lang === 'bn' ? 'ছাড় শতাংশ (%):' : 'Discount (%):')}
                </label>
                <input
                  type="number"
                  min="1"
                  max={discountType === 'percent' ? 90 : 2000}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: '1.5px solid #d1d5db',
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                  {lang === 'bn' ? 'মিনিমাম অর্ডার (₹):' : 'Min Order (₹):'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={minOrder}
                  onChange={(e) => setMinOrder(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: '1.5px solid #d1d5db',
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            {/* Validity Duration Selection */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                {lang === 'bn' ? 'কুপনের মেয়াদ (Validity):' : 'Coupon Validity:'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                {[
                  { days: 7, label: lang === 'bn' ? '৭ দিন' : '7 Days' },
                  { days: 15, label: lang === 'bn' ? '১৫ দিন' : '15 Days' },
                  { days: 30, label: lang === 'bn' ? '১ মাস' : '30 Days' },
                  { days: 0, label: lang === 'bn' ? 'সীমাহীন' : 'Lifetime' },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setValidityDays(opt.days)}
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid',
                      cursor: 'pointer',
                      background: validityDays === opt.days ? '#166534' : '#ffffff',
                      borderColor: validityDays === opt.days ? '#166534' : '#d1d5db',
                      color: validityDays === opt.days ? '#ffffff' : '#374151',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Broadcast Checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#1f2937', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <strong>
                {lang === 'bn'
                  ? '📢 সব নিবন্ধিত কাস্টমারকে ইন-অ্যাপ নোটিফিকেশন পাঠান'
                  : '📢 Send in-app notification to all registered customers'}
              </strong>
            </label>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  background: '#ca8a04',
                  borderColor: '#ca8a04',
                  color: '#ffffff',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                {creating ? '⏳...' : `🎟️ ${lang === 'bn' ? 'কুপন তৈরি ও সক্রিয় করুন' : 'Create & Activate Coupon'}`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #d1d5db',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {lang === 'bn' ? 'বন্ধ' : 'Close'}
              </button>
            </div>
          </div>
        ) : (
          /* Created Coupon Success Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div
              style={{
                background: '#ffffff',
                border: '2px dashed #ca8a04',
                borderRadius: '12px',
                padding: '1.25rem',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(202, 138, 4, 0.1)',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: '#854d0e', fontWeight: 700, textTransform: 'uppercase' }}>
                {lang === 'bn' ? 'সক্রিয় কুপন কোড' : 'Active Promo Code'}
              </span>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 900,
                  color: '#14532d',
                  letterSpacing: '0.1em',
                  margin: '0.5rem 0',
                }}
              >
                {createdCoupon.code}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 600 }}>
                {createdCoupon.discountType === 'flat' ? `₹${createdCoupon.discountValue} FLAT OFF` : `${createdCoupon.discountValue}% OFF`} · {lang === 'bn' ? `মিনিমাম অর্ডার ₹${createdCoupon.minOrder}` : `Min order ₹${createdCoupon.minOrder}`}
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', display: 'block', marginTop: '0.35rem' }}>
                ⏳ {createdCoupon.expiryText}
              </span>
            </div>

            {/* Share & Copy Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => handleCopyCode(createdCoupon.code)}
                style={{
                  padding: '0.75rem',
                  background: '#fef08a',
                  border: '1.5px solid #eab308',
                  borderRadius: '10px',
                  fontWeight: 800,
                  color: '#854d0e',
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                }}
              >
                📋 {lang === 'bn' ? 'কুপন কোড কপি করুন' : 'Copy Coupon Code'}
              </button>

              <button
                type="button"
                onClick={() => void handleShareCoupon(createdCoupon.shareMsg)}
                style={{
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 800,
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                  boxShadow: '0 4px 12px rgba(22, 101, 52, 0.25)',
                }}
              >
                📲 {lang === 'bn' ? 'অফার মেসেজ শেয়ার / কপি' : 'Share / Copy Offer Message'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreatedCoupon(null)}
                style={{ flex: 1 }}
              >
                + {lang === 'bn' ? 'আরেকটি কুপন তৈরি করুন' : 'Create Another Coupon'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                {lang === 'bn' ? 'সম্পন্ন' : 'Done'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
