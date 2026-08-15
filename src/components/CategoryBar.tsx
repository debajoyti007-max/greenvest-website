import type { Lang } from '../types'

export interface CategoryOption {
  id: string
  labelEn: string
  labelBn: string
  emoji: string
  count?: number
}

interface CategoryBarProps {
  categories: string[]
  selectedCategory: string
  onSelectCategory: (category: string) => void
  lang: Lang
  categoryCounts?: Record<string, number>
}

const CATEGORY_META: Record<string, { labelEn: string; labelBn: string; emoji: string }> = {
  All: { labelEn: 'All Items', labelBn: 'সব সামগ্রী', emoji: '🌟' },
  Vegetables: { labelEn: 'Veggies', labelBn: 'নিত্য সবজি', emoji: '🥔' },
  Leafy: { labelEn: 'Leafy Greens', labelBn: 'শাক পাতা', emoji: '🥬' },
  Spices: { labelEn: 'Spices & Aromatics', labelBn: 'মসলা ও ফোড়ন', emoji: '🌶️' },
  Fish: { labelEn: 'Fresh Fish', labelBn: 'তাজা মাছ', emoji: '🐟' },
  Eggs: { labelEn: 'Eggs', labelBn: 'ডিম', emoji: '🥚' },
  Pulses: { labelEn: 'Pulses & Dal', labelBn: 'ডাল', emoji: '🌾' },
}

export default function CategoryBar({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts = {},
}: CategoryBarProps) {
  return (
    <div className="category-scroll-wrapper" aria-label="Product categories">
      <div className="category-chips-bar">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat] || {
            labelEn: cat,
            labelBn: cat,
            emoji: '🌱',
          }
          const isSelected = selectedCategory === cat
          const count = categoryCounts[cat]

          return (
            <button
              key={cat}
              type="button"
              className={`category-chip ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat)}
              aria-pressed={isSelected}
            >
              <span className="category-chip-emoji">{meta.emoji}</span>
              <span className="category-chip-text">
                <span className="category-chip-bn">{meta.labelBn}</span>
                <span className="category-chip-en">{meta.labelEn}</span>
              </span>
              {typeof count === 'number' && count > 0 && (
                <span className="category-chip-count">{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
