import { useStore } from '../context/StoreContext'

const SAMPLE_RATES = [
  { emoji: '🥔', nameEn: 'Potato', nameBn: 'আলু', mandi: 20, gv: 22, unit: 'kg' },
  { emoji: '🧅', nameEn: 'Onion', nameBn: 'পিঁয়াজ', mandi: 30, gv: 33, unit: 'kg' },
  { emoji: '🍅', nameEn: 'Tomato', nameBn: 'টমেটো', mandi: 35, gv: 38, unit: 'kg' },
  { emoji: '🥒', nameEn: 'Cucumber', nameBn: 'শশা', mandi: 25, gv: 28, unit: 'kg' },
  { emoji: '🫑', nameEn: 'Capsicum', nameBn: 'ক্যাপসিকাম', mandi: 50, gv: 55, unit: 'kg' },
]

export default function MandiTicker() {
  const { lang } = useStore()

  return (
    <div className="mandi-ticker-bar">
      <div className="mandi-ticker-label">
        <span className="ticker-pulse" />
        <strong>{lang === 'bn' ? '📊 আজকের মান্ডি রেট:' : '📊 Today Mandi Rates:'}</strong>
      </div>
      <div className="mandi-ticker-track">
        <div className="mandi-ticker-content">
          {SAMPLE_RATES.concat(SAMPLE_RATES).map((item, idx) => (
            <span key={idx} className="mandi-ticker-item">
              <span className="item-emoji">{item.emoji}</span>
              <strong>{lang === 'bn' ? item.nameBn : item.nameEn}</strong>: Mandi ₹{item.mandi}/{item.unit} → <span className="gv-price">GV ₹{item.gv}/{item.unit}</span>
              <span className="ticker-bullet">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
