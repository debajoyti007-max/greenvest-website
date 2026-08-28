import { useState } from 'react'
import { isServiceablePin } from '../lib/delivery'
import { SERVICEABLE_PINCODES } from '../lib/business'
import type { Lang } from '../types'

export default function PincodeCheckerModal({
  lang,
  isOpen,
  onClose,
}: {
  lang: Lang
  isOpen: boolean
  onClose: () => void
}) {
  const [pinInput, setPinInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'serviceable' | 'unserviceable'>('idle')

  if (!isOpen) return null

  const handleCheck = () => {
    const clean = pinInput.replace(/\D/g, '')
    if (clean.length !== 6) return
    if (isServiceablePin(clean)) {
      setStatus('serviceable')
    } else {
      setStatus('unserviceable')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
            {lang === 'bn' ? '📍 ডেলিভারি পিন কোড চেক করুন' : '📍 Check Delivery Pincode'}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#4b5563', margin: '0 0 1rem 0' }}>
          {lang === 'bn'
            ? 'আমাদের তাজা সবজি ডেলিভারি আপনার এলাকায় উপলব্ধ কিনা তা দেখতে আপনার ৬ সংখ্যার পিন দিন:'
            : 'Enter your 6-digit PIN code to check produce delivery serviceability in your location:'}
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          <input
            type="text"
            className="input"
            maxLength={6}
            placeholder={lang === 'bn' ? 'উদাঃ 721632' : 'e.g. 721632'}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value)
              setStatus('idle')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            style={{ flex: 1, fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 600 }}
          />
          <button type="button" className="btn btn-primary" onClick={handleCheck}>
            {lang === 'bn' ? 'চেক করুন' : 'Check'}
          </button>
        </div>

        {status === 'serviceable' && (
          <div className="alert success" style={{ padding: '12px', borderRadius: '8px', fontSize: '0.9rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
            <strong>✅ {lang === 'bn' ? 'অভিনন্দন! হোম ডেলিভারি চালু আছে' : 'Great! Home Delivery is Available!'}</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              {lang === 'bn'
                ? `পিন ${pinInput}-এ ১২–২৪ ঘণ্টার মধ্যে তাজা সবজি ডেলিভারি পৌঁছে যাবে।`
                : `Fresh produce will be delivered to PIN ${pinInput} within 12–24 hours.`}
            </p>
          </div>
        )}

        {status === 'unserviceable' && (
          <div className="alert warn" style={{ padding: '12px', borderRadius: '8px', fontSize: '0.9rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
            <strong>⚠️ {lang === 'bn' ? 'হোম ডেলিভারি আপাতত উপলব্ধ নেই' : 'Home Delivery Not Available Here Yet'}</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              {lang === 'bn'
                ? `বর্তমানে শুধুমাত্র পিন ${SERVICEABLE_PINCODES.join(', ')}-এ হোম ডেলিভারি চালু আছে। আপনি দোকান থেকে ফ্রি পিকআপ (₹০) বেছে নিতে পারেন।`
                : `We currently deliver only to PIN codes ${SERVICEABLE_PINCODES.join(', ')}. You can still choose Free Store Pickup (₹0).`}
            </p>
          </div>
        )}

        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#6b7280' }}>
          <strong>{lang === 'bn' ? 'অনুমোদিত পিন কোডসমূহ:' : 'Serviceable PIN codes:'}</strong> {SERVICEABLE_PINCODES.join(', ')}
        </div>
      </div>
    </div>
  )
}
