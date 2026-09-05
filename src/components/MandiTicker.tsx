import { useStore } from '../context/useStore'

export default function MandiTicker() {
  const { products, lang } = useStore()

  const liveItems = products.filter((p) => p.inStock).map((p) => ({
    id: p.id,
    emoji: p.emoji,
    name: lang === 'bn' ? p.bnName : p.name,
    price: p.pA,
    unit: p.unit || 'kg',
  }))

  if (liveItems.length === 0) return null

  const displayList = liveItems.concat(liveItems)

  return (
    <div className="mandi-ticker-bar">
      <div className="mandi-ticker-label">
        <span className="ticker-pulse" />
        <strong>{lang === 'bn' ? '🌿 তাজা সবজির লাইভ দাম:' : '🌿 Fresh Stock Live Prices:'}</strong>
      </div>
      <div className="mandi-ticker-track">
        <div className="mandi-ticker-content">
          {displayList.map((item, idx) => (
            <span key={`${item.id}-${idx}`} className="mandi-ticker-item">
              <span className="item-emoji">{item.emoji}</span>
              <strong>{item.name}</strong>: <span className="gv-price">₹{item.price}/{item.unit}</span>
              <span className="ticker-bullet">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
