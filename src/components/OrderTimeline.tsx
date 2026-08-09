import type { Lang, Order, OrderStatus } from '../types'

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
  deliverySlot
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

  const isConfirmedNotDelivered = order.status === 'confirmed'
  const todayStr = new Date().toDateString()
  const isToday = createdAt && new Date(createdAt).toDateString() === todayStr
  const dayText = isToday ? 'Today' : 'Tomorrow'
  
  let etaText = ''
  if (isConfirmedNotDelivered && deliverySlot) {
    if (deliverySlot === 'morning') {
      etaText = `Estimated: ${dayText} 8 AM - 12 PM`
    } else if (deliverySlot === 'evening') {
      etaText = `Estimated: ${dayText} 4 PM - 8 PM`
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
                ? 'পেমেন্ট জমা (UTR যাচাই বাকি)'
                : 'Payment submitted (UTR pending)'
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
    </>
  )
}
