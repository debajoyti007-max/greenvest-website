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
  if (order.status === 'confirmed' || (order.status as string) === 'out_for_delivery') return 1
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
}) {
  if (order.status === 'cancelled') {
    return (
      <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
        <ol className="order-timeline cancelled" style={{ margin: '0 0 0.5rem' }}>
          <li className="done warn">{lang === 'bn' ? 'অর্ডার বাতিল' : 'Order cancelled'}</li>
        </ol>
        {order.rejectionReason && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '0.45rem 0.8rem',
              fontSize: '0.82rem',
              color: '#991b1b',
              display: 'inline-block',
              margin: '0.2rem auto',
            }}
          >
            ⚠️ {lang === 'bn' ? 'বাতিলের কারণ:' : 'Reason:'} <strong>{order.rejectionReason}</strong>
          </div>
        )}
      </div>
    )
  }

  const active = stepIndex(order)

  let etaText = ''
  if (order.status !== 'delivered') {
    if (order.deliveryDate && order.deliveryDate !== 'standard') {
      etaText = lang === 'bn' ? `📅 নির্ধারিত ডেলিভারির দিন: ${order.deliveryDate}` : `📅 Scheduled Delivery: ${order.deliveryDate}`
    } else {
      etaText = lang === 'bn' ? `⚡ ডেলিভারি ১২–২৪ ঘণ্টার মধ্যে` : `⚡ Delivery within 12–24h`
    }
  }

  const isConfirmed = order.status === 'confirmed' || (order.status as string) === 'out_for_delivery'
  const isPending = order.status === 'pending' || order.status === 'advance_paid'
  const isDelivered = order.status === 'delivered'

  return (
    <>
      <ol className="order-timeline" aria-label={lang === 'bn' ? 'অর্ডার স্ট্যাটাস' : 'Order status'}>
        {STEPS.map((step, i) => {
          const done = i <= active
          const current = i === active
          const label =
            i === 0
              ? order.isKhataOrder
                ? lang === 'bn'
                  ? 'অর্ডার জমা (খাতা)'
                  : 'Order Placed (Khata)'
                : order.paymentType === 'full'
                ? lang === 'bn'
                  ? 'ফুল পেমেন্ট জমা'
                  : 'Full Payment'
                : lang === 'bn'
                ? '১০% অগ্রিম জমা'
                : '10% Advance Paid'
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
        <p className="eta-text muted" style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.88rem' }}>
          {etaText}
        </p>
      )}

      {/* ⏳ Awaiting Seller Confirmation (Pending / Advance Paid) — No premature OTP */}
      {isPending && (
        <div
          style={{
            margin: '0.75rem auto 0',
            maxWidth: '360px',
            background: '#fefce8',
            border: '1.5px solid #fef08a',
            borderRadius: '12px',
            padding: '0.65rem 0.9rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#854d0e', marginBottom: '0.2rem' }}>
            ⏳ {lang === 'bn' ? 'সেলার অনুমোদনের জন্য অপেক্ষমাণ' : 'Awaiting Seller Confirmation'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#a16207', lineHeight: 1.4 }}>
            {lang === 'bn'
              ? 'আপনার অর্ডারটি দোকানে পৌঁছেছে। সেলার অর্ডারটি কনফার্ম করলেই প্যাকিং শুরু হবে এবং আপনার ডেলিভারি ওটিপি (OTP) প্রদর্শিত হবে।'
              : 'Your order is being reviewed by the store. Once confirmed, packing begins and your Delivery OTP will be revealed.'}
          </div>
        </div>
      )}

      {/* 🔐 Delivery Handover OTP: ONLY visible once seller confirms or out for delivery */}
      {isConfirmed && order.id && (
        <div
          style={{
            margin: '0.75rem auto 0',
            maxWidth: '320px',
            background: '#f0fdf4',
            border: '1.5px dashed #22c55e',
            borderRadius: '12px',
            padding: '0.65rem 1rem',
            textAlign: 'center',
            boxShadow: '0 2px 6px rgba(22, 101, 52, 0.06)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {lang === 'bn' ? '🔐 ডেলিভারি ওটিপি (OTP)' : '🔐 Delivery Handover OTP'}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', letterSpacing: '6px', margin: '0.2rem 0' }}>
            {getOrderDeliveryOtp(order)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>
            {lang === 'bn' ? 'রাইডার মাল ডেলিভারি দেওয়ার সময় এই ৪ সংখ্যার কোডটি বলুন' : 'Share this 4-digit code with your rider upon delivery'}
          </div>
        </div>
      )}

      {/* ✅ Delivered Confirmation */}
      {isDelivered && (
        <div
          style={{
            margin: '0.75rem auto 0',
            maxWidth: '320px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            padding: '0.5rem 0.85rem',
            textAlign: 'center',
            color: '#166534',
            fontSize: '0.82rem',
            fontWeight: 700,
          }}
        >
          ✅ {lang === 'bn' ? 'অর্ডার সফলভাবে ডেলিভারি সম্পন্ন হয়েছে' : 'Order Delivered Successfully'}
        </div>
      )}
    </>
  )
}
