import { useStore } from '../context/StoreContext'
import type { Lang } from '../types'

export default function ShiftBadge({ lang }: { lang: Lang }) {
  const { shiftStatus, extendedDeliveryNotice } = useStore()

  const isOpen = shiftStatus.isOpen
  const shiftText = lang === 'bn' ? shiftStatus.shiftNameBn : shiftStatus.shiftNameEn
  const noticeText = lang === 'bn' ? shiftStatus.nextShiftNoticeBn : shiftStatus.nextShiftNoticeEn

  return (
    <div className="store-shift-container" title={noticeText}>
      <div className={`store-shift-chip ${isOpen ? 'open' : 'shift-break'}`}>
        <span className="shift-indicator-dot" />
        <span className="shift-main-label">
          {isOpen ? (lang === 'bn' ? '🟢 দোকান খোলা' : '🟢 Open Now') : (lang === 'bn' ? '🟡 পরবর্তী শিফট' : '🟡 Next Shift')}
        </span>
        <span className="shift-time-detail">· {shiftText}</span>
      </div>
      {extendedDeliveryNotice && (
        <div className="extended-delay-banner" role="alert">
          <span>📢 {extendedDeliveryNotice}</span>
        </div>
      )}
    </div>
  )
}
