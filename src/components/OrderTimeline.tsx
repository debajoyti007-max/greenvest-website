import type { Lang, Order, OrderStatus } from '../types'
import { getOrderDeliveryOtp } from '../lib/business'

const STEPS: { key: OrderStatus; en: string; bn: string }[] = [
  { key: 'advance_paid', en: 'Advance paid', bn: 'অগ্রিম দেওয়া' },
  { key: 'confirmed', en: 'Confirmed', bn: 'কনফার্ম' },
  { key: 'delivered', en: 'Delivered', bn: 'ডেলিভারি হয়েছে' },
]

function stepIndex(order: Order): number {
  if (order.status === 'cancelled') return -1
  if (order.status === 'delivered') return 2
  if (order.status === 'confirmed') return 1
  // pending / advance_paid
  return 0
}

function formatTime(dateVal?: string | number | Date) {
  if (!dateVal) return ''
  return new Date(dateVal).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function OrderTimeline({ 
  order, 
  lang,
  createdAt,
  updatedAt,
}: { 
  order: Order; 
  lang: Lang;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
  deliverySlot?: string;
}) {
  if (order.status === 'cancelled') {
    return (
      <ol className="order-timeline cancelled">
        <li className="done warn">{lang === 'bn' ? 'অর্ডার বাতিল' : 'Order cancelled'}</li>
      </ol>
    )
  }

  const active = stepIndex(order)
  const utrDone = order.utrVerified

  let etaText = ''
  if (order.status !== 'delivered') {
    if (order.deliveryDate && order.deliveryDate !== 'standard') {
      etaText = lang === 'bn' ? `📅 নির্ধারিত ডেলিভারির দিন: ${order.deliveryDate}` : `📅 Scheduled Delivery: ${order.deliveryDate}`
    } else {
      etaText = lang === 'bn' ? `⚡ ডেলিভারি ১২–২৪ ঘণ্টার মধ্যে` : `⚡ Delivery within 12–24h`
    }
  }

  return (
    <>
      <ol className="order-timeline" aria-label={lang === 'bn' ? 'অর্ডার স্ট্যাটাস' : 'Order status'}>
        {STEPS.map((step, i) => {
          const done = i <= active
          const current = i === active
          const label =
            i === 0 && !utrDone
              ? lang === 'bn'
                ? 'পেমেন্ট জমা (যাচাই প্রক্রিয়াধীন)'
                : 'Payment submitted (Verifying)'
              : lang === 'bn'
                ? step.bn
                : step.en
          return (
            <li key={step.key} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`}>
              <span className="dot" aria-hidden />
              <span className="label">
                {label}
                {done && (
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {i === 0 && createdAt ? formatTime(createdAt) : ''}
                    {i === 1 && updatedAt && active >= 1 ? formatTime(updatedAt) : ''}
                    {i === 2 && updatedAt && active === 2 ? formatTime(updatedAt) : ''}
                  </div>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      {etaText && (
        <p className="eta-text muted" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
          {etaText}
        </p>
      )}
      {order.status !== 'delivered' && order.id && (
        <div
          style={{
            margin: '0.85rem auto 0',
            maxWidth: '320px',
            background: '#f8fafc',
            border: '1.5px dashed #94a3b8',
            borderRadius: '12px',
            padding: '0.65rem 1rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {lang === 'bn' ? '🔐 ডেলিভারি ওটিপি (OTP)' : '🔐 Delivery Handover OTP'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#166534', letterSpacing: '5px', margin: '0.2rem 0' }}>
            {getOrderDeliveryOtp(order)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {lang === 'bn' ? 'ডেলিভারির সময় রাইডারকে এই ৪ সংখ্যার কোডটি বলুন' : 'Share this 4-digit code with your rider upon delivery'}
          </div>
        </div>
      )}
    </>
  )
}
