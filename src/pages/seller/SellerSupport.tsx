import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useStore } from '../../context/useStore'
import { useAuth } from '../../context/useAuth'
import { showToast } from '../../lib/toast'
import { formatOrderId } from '../../lib/business'
import type { SupportMessage } from '../../types'

export default function SellerSupport() {
  const { user } = useAuth()
  const {
    lang,
    supportMessages,
    sendSupportMessage,
    resolveSupportTicket,
    reopenSupportTicket,
    deleteSupportThread,
    cleanupOldSupportMessages,
    orders,
  } = useStore()

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [filterTab, setFilterTab] = useState<'open' | 'resolved' | 'all'>('open')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-clean resolved junk messages older than 7 days on mount (keeps DB size under 1%)
  useEffect(() => {
    cleanupOldSupportMessages(7).then((purged) => {
      if (purged > 0) {
        console.log(`[Auto-Clean] Cleaned ${purged} old resolved support messages from storage/DB.`)
      }
    })
  }, [cleanupOldSupportMessages])

  // Group messages by customer
  const allCustomerThreads = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; userPhone?: string; messages: SupportMessage[]; lastMsg: SupportMessage; status: 'open' | 'resolved' }>()

    ;(supportMessages || []).forEach((m) => {
      if (!map.has(m.userId)) {
        map.set(m.userId, {
          userId: m.userId,
          userName: m.userName,
          userPhone: m.userPhone,
          messages: [],
          lastMsg: m,
          status: 'resolved',
        })
      }
      const item = map.get(m.userId)!
      item.messages.push(m)
      item.lastMsg = m
      // If ANY message in the thread is open, the whole thread is considered open
      if (m.status === 'open') {
        item.status = 'open'
      }
    })

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMsg.createdAt).getTime() - new Date(a.lastMsg.createdAt).getTime()
    )
  }, [supportMessages])

  const openCount = useMemo(() => allCustomerThreads.filter((t) => t.status === 'open').length, [allCustomerThreads])
  const resolvedCount = useMemo(() => allCustomerThreads.filter((t) => t.status === 'resolved').length, [allCustomerThreads])

  // Filtered threads based on selected tab
  const filteredThreads = useMemo(() => {
    if (filterTab === 'open') return allCustomerThreads.filter((t) => t.status === 'open')
    if (filterTab === 'resolved') return allCustomerThreads.filter((t) => t.status === 'resolved')
    return allCustomerThreads
  }, [allCustomerThreads, filterTab])

  // Auto-select first thread if selection is invalid for current filter
  useEffect(() => {
    if (filteredThreads.length > 0) {
      if (!selectedUserId || !filteredThreads.some((t) => t.userId === selectedUserId)) {
        setSelectedUserId(filteredThreads[0].userId)
      }
    } else {
      setSelectedUserId(null)
    }
  }, [filteredThreads, selectedUserId])

  const currentThread = useMemo(() => {
    return allCustomerThreads.find((c) => c.userId === selectedUserId) || null
  }, [allCustomerThreads, selectedUserId])

  // Find latest order for the selected customer
  const customerRecentOrder = useMemo(() => {
    if (!selectedUserId) return null
    return orders
      .filter((o) => o.userId === selectedUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
  }, [orders, selectedUserId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentThread?.messages.length])

  const handleSendReply = async (customMessage?: string) => {
    const text = (customMessage || replyText).trim()
    if (!text || !selectedUserId || !currentThread || !user) return

    setSending(true)
    try {
      await sendSupportMessage({
        userId: selectedUserId,
        userName: currentThread.userName,
        userPhone: currentThread.userPhone,
        senderRole: user.role === 'admin' ? 'admin' : 'seller',
        message: text,
        orderId: customerRecentOrder?.id,
        status: 'open',
      })
      setReplyText('')
      showToast(lang === 'bn' ? 'উত্তর পাঠানো হয়েছে!' : 'Reply sent!', '💬')
    } finally {
      setSending(false)
    }
  }

  // 1-Click Close with Farewell Message
  const handleCloseTicket = async () => {
    if (!selectedUserId || !currentThread || !user) return

    setSending(true)
    try {
      // Send friendly closing message
      const farewell = lang === 'bn'
        ? '✓ আপনার সমস্যার সমাধান সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে। GreenVest-এর সাথে থাকার জন্য ধন্যবাদ! 🌿'
        : '✓ Your support request has been resolved. Thank you for shopping with GreenVest! 🌿'

      await sendSupportMessage({
        userId: selectedUserId,
        userName: currentThread.userName,
        userPhone: currentThread.userPhone,
        senderRole: user.role === 'admin' ? 'admin' : 'seller',
        message: farewell,
        orderId: customerRecentOrder?.id,
        status: 'resolved',
      })

      await resolveSupportTicket(selectedUserId)
      showToast(lang === 'bn' ? 'টিকিট বন্ধ ও সমাধান করা হয়েছে!' : 'Ticket closed & resolved!', '✅')
    } finally {
      setSending(false)
    }
  }

  const handleReopen = async () => {
    if (!selectedUserId) return
    await reopenSupportTicket(selectedUserId)
    showToast(lang === 'bn' ? 'টিকিট পুনরায় চালু করা হয়েছে!' : 'Ticket reopened!', '🔄')
  }

  const handleDeleteThread = async () => {
    if (!selectedUserId) return
    if (window.confirm(lang === 'bn' ? 'আপনি কি এই চ্যাটটি ডাটাবেস থেকে মুছে ফেলতে চান?' : 'Permanently delete this customer chat thread from DB?')) {
      await deleteSupportThread(selectedUserId)
      setSelectedUserId(null)
      showToast(lang === 'bn' ? 'চ্যাট মুছে ফেলা হয়েছে!' : 'Thread deleted from DB!', '🗑️')
    }
  }

  const handleManualPurgeJunk = async () => {
    const purged = await cleanupOldSupportMessages(0) // Purge all resolved right now
    showToast(lang === 'bn' ? `${purged}টি সমাধানকৃত চ্যাট ডাটাবেস থেকে মুছে দেওয়া হয়েছে!` : `Purged ${purged} resolved junk chats from DB!`, '🧹')
  }

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', margin: '0 0 0.25rem', color: '#166534' }}>
            💬 {lang === 'bn' ? 'লাইভ সাপোর্ট ও টিকিট ডেস্ক' : 'Live Customer Support Desk'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
            {lang === 'bn' ? 'গ্রাহকদের সমস্যা সমাধান করুন ও টিকিট বন্ধ করুন।' : 'Manage customer queries, close resolved tickets, and keep database clean.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleManualPurgeJunk}
            title="Auto-delete resolved tickets from DB to prevent junk"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem', padding: '4px 10px', background: '#f8fafc', color: '#64748b' }}
          >
            🧹 {lang === 'bn' ? 'সমাধানকৃত জাঙ্ক পরিষ্কার' : 'Purge Resolved Junk'}
          </button>
          <Link to="/seller" className="btn btn-ghost btn-sm">
            {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
          </Link>
        </div>
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', minHeight: '540px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        {/* Left: Customer Thread List with Status Tabs */}
        <div style={{ borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
          {/* Status Tabs */}
          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '4px', background: '#ffffff' }}>
            <button
              type="button"
              onClick={() => setFilterTab('open')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '8px',
                border: 'none',
                background: filterTab === 'open' ? '#fee2e2' : 'transparent',
                color: filterTab === 'open' ? '#991b1b' : '#64748b',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444' }} />
              {lang === 'bn' ? 'চলমান' : 'Open'} ({openCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('resolved')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '8px',
                border: 'none',
                background: filterTab === 'resolved' ? '#dcfce7' : 'transparent',
                color: filterTab === 'resolved' ? '#166534' : '#64748b',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' }} />
              {lang === 'bn' ? 'সম্পন্ন' : 'Closed'} ({resolvedCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('all')}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: 'none',
                background: filterTab === 'all' ? '#e2e8f0' : 'transparent',
                color: filterTab === 'all' ? '#1e293b' : '#64748b',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {lang === 'bn' ? 'সব' : 'All'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredThreads.length === 0 ? (
              <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                {filterTab === 'open'
                  ? (lang === 'bn' ? '🎉 কোনো পেন্ডিং টিকিট নেই!' : '🎉 No open tickets!')
                  : (lang === 'bn' ? 'কোনো মেসেজ নেই।' : 'No messages found.')}
              </p>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.userId === selectedUserId
                const isOpen = thread.status === 'open'
                return (
                  <div
                    key={thread.userId}
                    onClick={() => setSelectedUserId(thread.userId)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? '#ffffff' : 'transparent',
                      borderLeft: isSelected ? (isOpen ? '4px solid #ef4444' : '4px solid #166534') : '4px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isOpen ? '#ef4444' : '#22c55e',
                          }}
                        />
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{thread.userName}</strong>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {new Date(thread.lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {thread.lastMsg.message.startsWith('[SYSTEM ALERT:') && (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, marginRight: '4px' }}>
                          🚨 {thread.lastMsg.message.includes('404') ? '404' : 'ERROR'}
                        </span>
                      )}
                      {thread.lastMsg.message}
                    </div>
                    {thread.userPhone && (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        📞 {thread.userPhone}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Active Chat Conversation */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {currentThread ? (
            <>
              {/* Chat Thread Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{currentThread.userName}</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        background: currentThread.status === 'open' ? '#fee2e2' : '#dcfce7',
                        color: currentThread.status === 'open' ? '#991b1b' : '#166534',
                      }}
                    >
                      {currentThread.status === 'open' ? (lang === 'bn' ? '🔴 চলমান' : '🔴 Open') : (lang === 'bn' ? '🟢 সম্পন্ন' : '🟢 Resolved')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {currentThread.userPhone ? `📞 ${currentThread.userPhone}` : 'Registered Customer'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {customerRecentOrder && (
                    <Link
                      to="/seller/orders"
                      style={{
                        fontSize: '0.75rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      📦 Order #{formatOrderId(customerRecentOrder.id)}
                    </Link>
                  )}

                  {/* Close / Reopen buttons */}
                  {currentThread.status === 'open' ? (
                    <button
                      type="button"
                      onClick={handleCloseTicket}
                      disabled={sending}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#166534' }}
                    >
                      ✓ {lang === 'bn' ? 'টিকিট বন্ধ করুন' : 'Close Ticket'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleReopen}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      >
                        🔄 {lang === 'bn' ? 'পুনরায় খুলুন' : 'Reopen'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteThread}
                        title="Delete from database"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#ef4444' }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Preset Buttons for Admin */}
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <button
                  type="button"
                  onClick={() => handleSendReply(lang === 'bn' ? 'নমস্কার! আমরা আপনার অর্ডারটি চেক করছি এবং দ্রুত ব্যবস্থা নিচ্ছি।' : 'Hello! We are reviewing your order and will update you shortly.')}
                  style={{ padding: '3px 8px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.74rem', cursor: 'pointer' }}
                >
                  ⚡ {lang === 'bn' ? 'দ্রুত উত্তর' : 'Quick Acknowledge'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSendReply(lang === 'bn' ? 'আপনার অর্ডারের সামগ্রী তাজা প্যাক করা হয়েছে এবং রাইডার ডেলিভারির জন্য রওয়ানা হয়েছে।' : 'Your fresh produce is packed and the rider has been dispatched for delivery.')}
                  style={{ padding: '3px 8px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.74rem', cursor: 'pointer' }}
                >
                  🛵 {lang === 'bn' ? 'রওয়ানা হয়েছে' : 'Dispatched Notice'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSendReply(lang === 'bn' ? 'অসুবিধার জন্য আমরা আন্তরিকভাবে দুঃখিত। পরবর্তী অর্ডারে ৫% ছাড়ের জন্য কুপন কোড ব্যবহার করুন: GREENFIRST' : 'We sincerely apologize for the inconvenience. Please use coupon code GREENFIRST for 5% OFF on your next order.')}
                  style={{ padding: '3px 8px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.74rem', cursor: 'pointer' }}
                >
                  🎁 {lang === 'bn' ? 'কুপন দিন' : 'Send Promo Coupon'}
                </button>
              </div>

              {/* Messages Container */}
              <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc' }}>
                {currentThread.messages.map((m) => {
                  if (m.message.startsWith('[SYSTEM ALERT:')) {
                    const is404 = m.message.includes('404')
                    const pathMatch = m.message.match(/Path:\s*([^\n]+)/)
                    const path = pathMatch ? pathMatch[1].trim() : ''

                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: 'center',
                          width: '96%',
                          background: is404 ? 'linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%)' : '#fef2f2',
                          color: '#991b1b',
                          border: is404 ? '1.5px solid #fed7aa' : '1.5px solid #fecaca',
                          padding: '12px 14px',
                          borderRadius: '16px',
                          fontSize: '0.82rem',
                          boxShadow: '0 4px 12px rgba(225, 29, 72, 0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: is404 ? '#fee2e2' : '#fecdd3', color: '#be123c', padding: '3px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '0.74rem' }}>
                            {is404 ? '🔍 404 BROKEN LINK' : '⚠️ RUNTIME ERROR'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#9f1239', fontWeight: 600 }}>
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {path && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '6px 10px', borderRadius: '10px', border: '1px solid #fce7f3', marginBottom: '6px', gap: '8px' }}>
                            <code style={{ fontSize: '0.78rem', color: '#0f172a', wordBreak: 'break-all', fontWeight: 700 }}>
                              {path}
                            </code>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(path)
                                  showToast(lang === 'bn' ? 'লিংক কপি হয়েছে' : 'URL copied', '📋')
                                } catch {}
                              }}
                              style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                            >
                              📋
                            </button>
                          </div>
                        )}

                        <div style={{ fontSize: '0.72rem', color: '#9f1239', display: 'flex', justifyContent: 'space-between' }}>
                          <span>👤 {m.userName} {m.userPhone ? `· 📞 ${m.userPhone}` : ''}</span>
                        </div>
                      </div>
                    )
                  }

                  const isStaff = m.senderRole === 'admin' || m.senderRole === 'seller'
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isStaff ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: isStaff ? '#166534' : '#ffffff',
                        color: isStaff ? '#ffffff' : '#0f172a',
                        border: isStaff ? 'none' : '1px solid #e2e8f0',
                        padding: '8px 12px',
                        borderRadius: isStaff ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        fontSize: '0.84rem',
                        lineHeight: 1.4,
                      }}
                    >
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: isStaff ? '#bbf7d0' : '#64748b', marginBottom: '2px' }}>
                        {isStaff ? 'Store Desk' : m.userName}
                      </div>
                      <div>{m.message}</div>
                      <div style={{ fontSize: '0.65rem', color: isStaff ? 'rgba(255,255,255,0.7)' : '#94a3b8', textAlign: 'right', marginTop: '3px' }}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendReply()
                }}
                style={{ padding: '10px 14px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={lang === 'bn' ? 'গ্রাহককে উত্তর লিখুন...' : 'Type reply to customer...'}
                  disabled={sending}
                  style={{ flex: 1, padding: '8px 14px', borderRadius: '20px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="btn btn-primary"
                  style={{ borderRadius: '20px', padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {sending ? '...' : (lang === 'bn' ? 'উত্তর পাঠান' : 'Reply')}
                </button>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.9rem' }}>
              {lang === 'bn' ? 'চ্যাট দেখতে বামদিকের গ্রাহক নির্বাচন করুন।' : 'Select a customer chat from the left to view thread.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
