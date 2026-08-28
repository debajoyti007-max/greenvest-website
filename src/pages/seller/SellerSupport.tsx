import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { useAuth } from '../../context/AuthContext'
import { showToast } from '../../components/Toast'
import { formatOrderId } from '../../lib/business'
import type { SupportMessage } from '../../types'

export default function SellerSupport() {
  const { user } = useAuth()
  const { lang, supportMessages, sendSupportMessage, resolveSupportTicket, orders } = useStore()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  // Group messages by customer
  const customerThreads = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; userPhone?: string; messages: SupportMessage[]; lastMsg: SupportMessage; status: 'open' | 'resolved' }>()

    ;(supportMessages || []).forEach((m) => {
      if (!map.has(m.userId)) {
        map.set(m.userId, {
          userId: m.userId,
          userName: m.userName,
          userPhone: m.userPhone,
          messages: [],
          lastMsg: m,
          status: m.status || 'open',
        })
      }
      const item = map.get(m.userId)!
      item.messages.push(m)
      item.lastMsg = m
      if (m.status === 'open') item.status = 'open'
    })

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMsg.createdAt).getTime() - new Date(a.lastMsg.createdAt).getTime()
    )
  }, [supportMessages])

  // Select first customer by default
  useEffect(() => {
    if (!selectedUserId && customerThreads.length > 0) {
      setSelectedUserId(customerThreads[0].userId)
    }
  }, [customerThreads, selectedUserId])

  const currentThread = useMemo(() => {
    return customerThreads.find((c) => c.userId === selectedUserId) || null
  }, [customerThreads, selectedUserId])

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
    if (!text || !selectedUserId || !currentThread) return

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

  const handleResolve = async () => {
    if (!selectedUserId) return
    await resolveSupportTicket(selectedUserId)
    showToast(lang === 'bn' ? 'টিকিট সম্পন্ন মার্ক করা হয়েছে!' : 'Support ticket resolved!', '✅')
  }

  return (
    <div className="page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', margin: '0 0 0.25rem', color: '#166534' }}>
            💬 {lang === 'bn' ? 'কাস্টমার সাপোর্ট ডেস্ক' : 'Live Customer Support Desk'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
            {lang === 'bn' ? 'ওয়েবসাইটে সরাসরি কাস্টমারদের প্রশ্নের উত্তর দিন।' : 'Respond to live customer queries in real-time.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link to="/seller" className="btn btn-ghost btn-sm">
            {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
          </Link>
        </div>
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', minHeight: '520px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        {/* Left: Customer Thread List */}
        <div style={{ borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.85rem', color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
            <span>{lang === 'bn' ? 'গ্রাহক তালিকা' : 'Active Chats'}</span>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
              {customerThreads.length}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {customerThreads.length === 0 ? (
              <p style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                {lang === 'bn' ? 'কোনো সাপোর্ট মেসেজ নেই।' : 'No customer messages yet.'}
              </p>
            ) : (
              customerThreads.map((thread) => {
                const isSelected = thread.userId === selectedUserId
                return (
                  <div
                    key={thread.userId}
                    onClick={() => setSelectedUserId(thread.userId)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? '#ffffff' : 'transparent',
                      borderLeft: isSelected ? '4px solid #166534' : '4px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{thread.userName}</strong>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {new Date(thread.lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                    {currentThread.userName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {currentThread.userPhone ? `📞 ${currentThread.userPhone}` : 'Registered Customer'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {customerRecentOrder && (
                    <Link
                      to="/seller/orders"
                      style={{
                        fontSize: '0.75rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      📦 Order #{formatOrderId(customerRecentOrder.id)} ({customerRecentOrder.status})
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleResolve}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  >
                    ✓ {lang === 'bn' ? 'সম্পন্ন' : 'Resolve'}
                  </button>
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
                        {isStaff ? 'Store Response' : m.userName}
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
