import { useState, useMemo } from 'react'
import type { Lang, Order, Product, User, OrderStatus } from '../../types'
import { showToast } from '../Toast'
import { getAppNotifications, saveAppNotifications } from '../../lib/storage'

interface DatabaseCleanerProps {
  orders: Order[]
  users: User[]
  products: Product[]
  lang: Lang
  deleteOrder: (id: string) => Promise<void>
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>
  onRefresh: () => Promise<void>
}

interface PendingCleanAction {
  type: 'abandoned_pending' | 'purge_cancelled' | 'purge_notifs' | 'full_clean'
  title: string
  description: string
  count: number
  targetIds: string[]
}

export default function DatabaseCleaner({
  orders,
  users,
  products,
  lang,
  deleteOrder,
  updateOrderStatus,
  onRefresh,
}: DatabaseCleanerProps) {
  const [running, setRunning] = useState(false)
  const [confirmModal, setConfirmModal] = useState<PendingCleanAction | null>(null)
  const [retentionDays, setRetentionDays] = useState<number>(14)

  const now = Date.now()
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const MS_PER_HOUR = 60 * 60 * 1000

  // ── Metrics Calculation ──────────────────────────────────────────
  const deliveredOrders = useMemo(() => orders.filter((o) => o.status === 'delivered'), [orders])
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  )
  const allCancelledOrders = useMemo(() => orders.filter((o) => o.status === 'cancelled'), [orders])

  // Cancelled orders older than retention threshold (default 14 days)
  const staleCancelledOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== 'cancelled') return false
      const ageMs = now - new Date(o.createdAt).getTime()
      return ageMs >= retentionDays * MS_PER_DAY
    })
  }, [orders, retentionDays, now, MS_PER_DAY])

  // Abandoned pending orders (> 48h with no UTR)
  const abandonedPendingOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== 'pending') return false
      const hasUtr = Boolean(o.utr && o.utr.trim().length > 3)
      if (hasUtr) return false
      const ageMs = now - new Date(o.createdAt).getTime()
      return ageMs >= 48 * MS_PER_HOUR
    })
  }, [orders, now, MS_PER_HOUR])

  // Notifications older than 30 days
  const staleNotificationsCount = useMemo(() => {
    const notifs = getAppNotifications()
    const cutoff = now - 30 * MS_PER_DAY
    return notifs.filter((n) => new Date(n.createdAt).getTime() < cutoff).length
  }, [now, MS_PER_DAY])

  // Storage breakdown
  const customPhotoProducts = useMemo(
    () => products.filter((p) => Boolean(p.imageUrl && p.imageUrl.startsWith('http'))),
    [products]
  )

  // ── Handlers ─────────────────────────────────────────────────────

  const promptAction = (type: PendingCleanAction['type']) => {
    if (type === 'abandoned_pending') {
      if (abandonedPendingOrders.length === 0) {
        showToast(
          lang === 'bn' ? 'কোনো পরিত্যক্ত পেন্ডিং অর্ডার নেই' : 'No abandoned pending orders found',
          '✨'
        )
        return
      }
      setConfirmModal({
        type,
        title: lang === 'bn' ? 'পরিত্যক্ত পেন্ডিং অর্ডার বাতিল ও ক্লিন' : 'Cancel Abandoned Pending Orders',
        description:
          lang === 'bn'
            ? `৪৮ ঘণ্টার বেশি পুরনো কোনো UTR ছাড়া ${abandonedPendingOrders.length}টি পেন্ডিং অর্ডার বাতিল করা হবে।`
            : `Will cancel ${abandonedPendingOrders.length} orders that have been pending for >48h without UTR.`,
        count: abandonedPendingOrders.length,
        targetIds: abandonedPendingOrders.map((o) => o.id),
      })
    } else if (type === 'purge_cancelled') {
      if (staleCancelledOrders.length === 0) {
        showToast(
          lang === 'bn'
            ? `${retentionDays} দিনের বেশি পুরনো কোনো বাতিল অর্ডার নেই`
            : `No cancelled orders older than ${retentionDays} days`,
          '✨'
        )
        return
      }
      setConfirmModal({
        type,
        title: lang === 'bn' ? 'পুরনো বাতিল অর্ডার পার্জ (স্থায়ী রিমুভ)' : 'Purge Old Cancelled Orders',
        description:
          lang === 'bn'
            ? `${retentionDays} দিনের বেশি পুরনো ${staleCancelledOrders.length}টি বাতিল অর্ডার ডেটাবেস থেকে স্থায়ীভাবে মুছে ফেলা হবে। ডেলিভারি রেকর্ড সুরক্ষিত থাকবে।`
            : `Permanently delete ${staleCancelledOrders.length} cancelled orders older than ${retentionDays} days. Delivered records are 100% safe.`,
        count: staleCancelledOrders.length,
        targetIds: staleCancelledOrders.map((o) => o.id),
      })
    } else if (type === 'purge_notifs') {
      if (staleNotificationsCount === 0) {
        showToast(
          lang === 'bn' ? '৩০ দিনের পুরনো কোনো নোটিফিকেশন নেই' : 'No notifications older than 30 days',
          '✨'
        )
        return
      }
      setConfirmModal({
        type,
        title: lang === 'bn' ? 'মেয়াদোত্তীর্ণ নোটিফিকেশন ক্লিন' : 'Clean Stale Notifications',
        description:
          lang === 'bn'
            ? `৩০ দিনের বেশি পুরনো ${staleNotificationsCount}টি ব্রডকাস্ট নোটিফিকেশন ক্লিন করা হবে।`
            : `Will remove ${staleNotificationsCount} broadcast alerts older than 30 days.`,
        count: staleNotificationsCount,
        targetIds: [],
      })
    } else if (type === 'full_clean') {
      const totalToClean = staleCancelledOrders.length + abandonedPendingOrders.length + staleNotificationsCount
      if (totalToClean === 0) {
        showToast(
          lang === 'bn' ? 'সবকিছু ইতোমধ্যে পরিষ্কার আছে!' : 'Database is already clean & healthy!',
          '🎉'
        )
        return
      }
      setConfirmModal({
        type,
        title: lang === 'bn' ? 'সম্পূর্ণ স্মার্ট সিস্টেম রক্ষণাবেক্ষণ' : 'Full Smart Database Maintenance',
        description:
          lang === 'bn'
            ? `একযোগে ${abandonedPendingOrders.length}টি পরিত্যক্ত অর্ডার, ${staleCancelledOrders.length}টি পুরনো বাতিল অর্ডার এবং ${staleNotificationsCount}টি পুরনো নোটিফিকেশন নিরাপদভাবে ক্লিন করা হবে।`
            : `Will auto-clean ${abandonedPendingOrders.length} abandoned orders, purge ${staleCancelledOrders.length} cancelled orders (>14d), and remove ${staleNotificationsCount} old alerts.`,
        count: totalToClean,
        targetIds: [...staleCancelledOrders.map((o) => o.id), ...abandonedPendingOrders.map((o) => o.id)],
      })
    }
  }

  const executeConfirmedClean = async () => {
    if (!confirmModal) return
    setRunning(true)

    try {
      if (confirmModal.type === 'abandoned_pending') {
        let count = 0
        for (const id of confirmModal.targetIds) {
          await updateOrderStatus(id, 'cancelled')
          count++
        }
        showToast(
          lang === 'bn'
            ? `✅ ${count}টি পরিত্যক্ত পেন্ডিং অর্ডার বাতিল করা হয়েছে!`
            : `✅ Cancelled ${count} abandoned orders!`,
          '🧹'
        )
      } else if (confirmModal.type === 'purge_cancelled') {
        let count = 0
        for (const id of confirmModal.targetIds) {
          await deleteOrder(id)
          count++
        }
        showToast(
          lang === 'bn'
            ? `🗑️ ${count}টি পুরনো বাতিল অর্ডার স্থায়ীভাবে পার্জ করা হয়েছে!`
            : `🗑️ Purged ${count} old cancelled orders!`,
          '✨'
        )
      } else if (confirmModal.type === 'purge_notifs') {
        const notifs = getAppNotifications()
        const cutoff = now - 30 * MS_PER_DAY
        const kept = notifs.filter((n) => new Date(n.createdAt).getTime() >= cutoff)
        saveAppNotifications(kept)
        showToast(
          lang === 'bn' ? '🔔 পুরনো নোটিফিকেশন ক্লিন সম্পন্ন!' : '🔔 Stale notifications cleaned!',
          '✨'
        )
      } else if (confirmModal.type === 'full_clean') {
        // 1. Cancel abandoned
        for (const o of abandonedPendingOrders) {
          await updateOrderStatus(o.id, 'cancelled')
        }
        // 2. Purge old cancelled
        for (const o of staleCancelledOrders) {
          await deleteOrder(o.id)
        }
        // 3. Clean notifs
        const notifs = getAppNotifications()
        const cutoff = now - 30 * MS_PER_DAY
        saveAppNotifications(notifs.filter((n) => new Date(n.createdAt).getTime() >= cutoff))

        showToast(
          lang === 'bn'
            ? '🎉 সম্পূর্ণ স্মার্ট ডেটাবেস ক্লিন সফলভাবে সম্পন্ন হয়েছে!'
            : '🎉 Full Smart Database Maintenance completed!',
          '🚀'
        )
      }

      await onRefresh()
      setConfirmModal(null)
    } catch (err) {
      console.error('Clean execution failed:', err)
      showToast(
        lang === 'bn' ? 'ক্লিন অপারেশনে ত্রুটি হয়েছে' : 'Failed to clean some records',
        '❌',
        'error'
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="db-cleaner-container">
      {/* 📊 Metrics Grid */}
      <div className="db-metrics-grid">
        <div className="db-metric-card">
          <div className="db-metric-head">
            <span className="db-metric-icon">📦</span>
            <span className="db-metric-badge safe">SAFE & PROTECTED</span>
          </div>
          <strong className="db-metric-val">{deliveredOrders.length}</strong>
          <span className="db-metric-title">
            {lang === 'bn' ? 'ডেলিভার্ড ও সফল অর্ডার' : 'Delivered Orders'}
          </span>
          <span className="db-metric-sub">
            {lang === 'bn' ? `${users.length} জন গ্রাহকের রেকর্ড সংরক্ষিত` : `${users.length} users protected`}
          </span>
        </div>

        <div className="db-metric-card">
          <div className="db-metric-head">
            <span className="db-metric-icon">⏳</span>
            <span className={`db-metric-badge ${abandonedPendingOrders.length > 0 ? 'warning' : 'ok'}`}>
              {abandonedPendingOrders.length > 0 ? `${abandonedPendingOrders.length} GHOST` : 'CLEAN'}
            </span>
          </div>
          <strong className="db-metric-val">{abandonedPendingOrders.length}</strong>
          <span className="db-metric-title">
            {lang === 'bn' ? 'পরিত্যক্ত পেন্ডিং (>৪৮ ঘণ্টা)' : 'Abandoned Pending (>48h)'}
          </span>
          <span className="db-metric-sub">
            {lang === 'bn' ? `${activeOrders.length}টি লাইভ ডেলিভারি চলছে` : `${activeOrders.length} active in delivery`}
          </span>
        </div>

        <div className="db-metric-card">
          <div className="db-metric-head">
            <span className="db-metric-icon">🗑️</span>
            <span className={`db-metric-badge ${staleCancelledOrders.length > 0 ? 'alert' : 'ok'}`}>
              {staleCancelledOrders.length > 0 ? `${staleCancelledOrders.length} DEAD` : 'CLEAN'}
            </span>
          </div>
          <strong className="db-metric-val">{staleCancelledOrders.length}</strong>
          <span className="db-metric-title">
            {lang === 'bn' ? `বাতিল অর্ডার (>${retentionDays} দিন)` : `Cancelled Orders (>${retentionDays}d)`}
          </span>
          <span className="db-metric-sub">
            {lang === 'bn' ? `মোট ${allCancelledOrders.length}টি বাতিল ফাইল` : `${allCancelledOrders.length} total cancelled`}
          </span>
        </div>

        <div className="db-metric-card">
          <div className="db-metric-head">
            <span className="db-metric-icon">🖼️</span>
            <span className="db-metric-badge info">STORAGE</span>
          </div>
          <strong className="db-metric-val">{customPhotoProducts.length}</strong>
          <span className="db-metric-title">
            {lang === 'bn' ? 'ক্লাউড ফটো প্রোডাক্ট' : 'Cloud Photo Products'}
          </span>
          <span className="db-metric-sub">
            {products.length - customPhotoProducts.length} {lang === 'bn' ? 'টি ইমোজি প্রোডাক্ট' : 'emoji items'}
          </span>
        </div>
      </div>

      {/* ⚡ 1-Click Smart Cleaner Action Cards */}
      <div className="db-actions-section">
        <div className="db-actions-header">
          <div>
            <h3 className="db-section-title">
              ⚡ {lang === 'bn' ? '১-ক্লিক স্মার্ট ডেটাবেস ক্লিনার' : '1-Click Smart Cleaners'}
            </h3>
            <p className="db-section-sub">
              {lang === 'bn'
                ? 'সুরক্ষিত ও বুদ্ধিমান ক্লিনিং — ডেলিভারি রেকর্ড ও কাস্টমার প্রোফাইল ১০০% নিরাপদ থাকে।'
                : 'Safe, rules-based cleaning — financial records and user profiles are strictly preserved.'}
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary db-full-clean-btn"
            onClick={() => promptAction('full_clean')}
            disabled={running}
          >
            🚀 {lang === 'bn' ? 'সম্পূর্ণ স্মার্ট মেইনটেন্যান্স' : 'Run Full Maintenance'}
          </button>
        </div>

        <div className="db-cards-grid">
          {/* Card 1: Abandoned Orders */}
          <div className="db-clean-card">
            <div className="db-card-content">
              <span className="db-card-icon">⏳</span>
              <div>
                <h4 className="db-card-title">
                  {lang === 'bn' ? 'পরিত্যক্ত পেন্ডিং অর্ডার ক্লিন' : 'Clean Abandoned Pending'}
                </h4>
                <p className="db-card-desc">
                  {lang === 'bn'
                    ? 'যেসব অর্ডার ৪৮ ঘণ্টার বেশি সময় ধরে কোনো UTR ছাড়া ঝুলছে সেগুলোকে অটো বাতিল করুন।'
                    : 'Auto-cancel orders pending for >48h with no payment or UTR.'}
                </p>
                <div className="db-card-pill-row">
                  <span className="db-count-chip">
                    {abandonedPendingOrders.length} {lang === 'bn' ? 'টি পাওয়া গেছে' : 'detected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm db-action-btn"
              onClick={() => promptAction('abandoned_pending')}
              disabled={running || abandonedPendingOrders.length === 0}
            >
              🧹 {lang === 'bn' ? 'অটো বাতিল করুন' : 'Auto-Cancel'}
            </button>
          </div>

          {/* Card 2: Purge Cancelled Trash */}
          <div className="db-clean-card">
            <div className="db-card-content">
              <span className="db-card-icon">🗑️</span>
              <div>
                <h4 className="db-card-title">
                  {lang === 'bn' ? 'পুরনো বাতিল অর্ডার পার্জ' : 'Purge Cancelled Trash'}
                </h4>
                <p className="db-card-desc">
                  {lang === 'bn'
                    ? `${retentionDays} দিনের বেশি পুরনো বাতিল অর্ডার ডেটাবেস থেকে স্থায়ীভাবে ডিলিট করুন।`
                    : `Permanently delete cancelled orders older than ${retentionDays} days.`}
                </p>
                <div className="db-card-pill-row">
                  <span className="db-count-chip">
                    {staleCancelledOrders.length} {lang === 'bn' ? 'টি বাতিল ফাইল' : 'stale orders'}
                  </span>
                  <div className="db-retention-select">
                    <label>
                      {lang === 'bn' ? 'সময়সীমা:' : 'Threshold:'}
                      <select
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(Number(e.target.value))}
                        disabled={running}
                      >
                        <option value={7}>7 {lang === 'bn' ? 'দিন' : 'days'}</option>
                        <option value={14}>14 {lang === 'bn' ? 'দিন' : 'days'}</option>
                        <option value={30}>30 {lang === 'bn' ? 'দিন' : 'days'}</option>
                        <option value={60}>60 {lang === 'bn' ? 'দিন' : 'days'}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm db-action-btn danger"
              onClick={() => promptAction('purge_cancelled')}
              disabled={running || staleCancelledOrders.length === 0}
            >
              🗑️ {lang === 'bn' ? 'পার্জ করুন' : 'Purge Trash'}
            </button>
          </div>

          {/* Card 3: Notifications Cleaner */}
          <div className="db-clean-card">
            <div className="db-card-content">
              <span className="db-card-icon">🔔</span>
              <div>
                <h4 className="db-card-title">
                  {lang === 'bn' ? 'মেয়াদোত্তীর্ণ নোটিফিকেশন ক্লিন' : 'Clean Stale Alerts'}
                </h4>
                <p className="db-card-desc">
                  {lang === 'bn'
                    ? '৩০ দিনের বেশি পুরনো পুরনো অ্যানাউন্সমেন্ট ও অ্যালার্ট মেসেজ মুছে ফেলুন।'
                    : 'Purge broadcast notifications older than 30 days.'}
                </p>
                <div className="db-card-pill-row">
                  <span className="db-count-chip">
                    {staleNotificationsCount} {lang === 'bn' ? 'টি পুরনো নোটিফিকেশন' : 'expired alerts'}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm db-action-btn"
              onClick={() => promptAction('purge_notifs')}
              disabled={running || staleNotificationsCount === 0}
            >
              🧹 {lang === 'bn' ? 'ক্লিন করুন' : 'Clean Alerts'}
            </button>
          </div>
        </div>
      </div>

      {/* 🛡️ Safety Confirmation Modal */}
      {confirmModal && (
        <div
          className="glass-modal-overlay"
          onClick={() => !running && setConfirmModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="glass-modal-container glass-mono-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className="glass-modal-header">
              <div className="glass-header-left">
                <span className="glass-modal-icon">🛡️</span>
                <div>
                  <h3 className="glass-modal-title">{confirmModal.title}</h3>
                  <span className="glass-mono-badge">SAFETY VERIFIED</span>
                </div>
              </div>
              <button
                type="button"
                className="glass-close-btn"
                onClick={() => !running && setConfirmModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="glass-modal-scroll" style={{ padding: '1.25rem' }}>
              <p style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.6, margin: '0 0 1rem' }}>
                {confirmModal.description}
              </p>

              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🔒</span>
                <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>
                  {lang === 'bn'
                    ? `আপনার ${deliveredOrders.length}টি ডেলিভার্ড অর্ডার এবং সকল অ্যাকাউন্ট ১০০% সুরক্ষিত থাকবে।`
                    : `Your ${deliveredOrders.length} delivered orders & user profiles are 100% locked & safe.`}
                </span>
              </div>
            </div>

            <div className="glass-modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmModal(null)}
                disabled={running}
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  background: confirmModal.type === 'purge_cancelled' ? '#dc2626' : '#166534',
                  borderColor: confirmModal.type === 'purge_cancelled' ? '#dc2626' : '#166534',
                }}
                onClick={executeConfirmedClean}
                disabled={running}
              >
                {running
                  ? lang === 'bn'
                    ? 'ক্লিন হচ্ছে…'
                    : 'Cleaning…'
                  : lang === 'bn'
                    ? 'নিশ্চিত ও ক্লিন করুন ➔'
                    : 'Confirm & Clean ➔'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
