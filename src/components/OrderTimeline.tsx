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

export default function OrderTimeline({ order, lang }: { order: Order; lang: Lang }) {
  if (order.status === 'cancelled') {
    return (
      <ol className="order-timeline cancelled">
        <li className="done warn">{lang === 'bn' ? 'অর্ডার বাতিল' : 'Order cancelled'}</li>
      </ol>
    )
  }

  const active = stepIndex(order)
  const utrDone = order.utrVerified

  return (
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
            <span className="label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
