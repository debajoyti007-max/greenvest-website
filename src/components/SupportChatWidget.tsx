import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { useAuth } from '../context/useAuth'
import { formatOrderId } from '../lib/business'
import { showToast } from '../lib/toast'

export default function SupportChatWidget() {
  const { lang, orders, supportMessages, sendSupportMessage, resolveSupportTicket, getUserKhataBalance, cartCount } = useStore()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [inputMsg, setInputMsg] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Filter messages for current user
  const userThread = useMemo(() => {
    if (!user) return []
    return (supportMessages || []).filter((m) => m.userId === user.id)
  }, [supportMessages, user])

  // Latest active order
  const activeOrder = useMemo(() => {
    if (!user) return null
    return orders
      .filter((o) => o.userId === user.id && o.status !== 'delivered' && o.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
  }, [orders, user])

  const khataBal = user ? getUserKhataBalance(user.id) : 0

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, userThread.length])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMsg).trim()
    if (!text) return
    if (!user) {
      showToast(lang === 'bn' ? 'মেসেজ পাঠাতে অনুগ্রহ করে লগইন করুন' : 'Please login to send a support message', '⚠️')
      return
    }

    setSending(true)
    try {
      await sendSupportMessage({
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        senderRole: 'customer',
        message: text,
        orderId: activeOrder ? activeOrder.id : undefined,
        status: 'open',
      })
      setInputMsg('')
      showToast(lang === 'bn' ? 'মেসেজ পাঠানো হয়েছে!' : 'Message sent!', '💬')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating Modern Support Pill (Bottom-Right) */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`support-bubble${userThread.some((m) => m.status === 'open' && m.senderRole === 'seller') ? ' has-unread' : ''}`}
          style={{
            position: 'fixed',
            bottom: cartCount > 0
              ? 'calc(var(--bottom-nav-h, 68px) + env(safe-area-inset-bottom, 0px) + 68px)'
              : 'calc(var(--bottom-nav-h, 68px) + env(safe-area-inset-bottom, 0px) + 12px)',
            right: '16px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
            color: '#ffffff',
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 24px rgba(22, 101, 52, 0.4)',
            fontSize: '0.84rem',
            fontWeight: 700,
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
          }}
          aria-label="Customer Support"
        >
          <span style={{ fontSize: '1.05rem' }}>💬</span>
          <span>{lang === 'bn' ? 'সাপোর্ট' : 'Support'}</span>
          <span
            className="support-status-line"
            style={{ marginLeft: '2px' }}
          />
        </button>
      )}

      {/* Floating Chat Drawer */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottom-nav-h, 68px) + env(safe-area-inset-bottom, 0px) + 8px)',
            right: '16px',
            zIndex: 10000,
            width: '360px',
            maxWidth: 'calc(100vw - 24px)',
            height: '520px',
            maxHeight: 'calc(100vh - 140px)',
            background: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'inherit',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #166534 0%, #0f172a 100%)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🌱</span> {lang === 'bn' ? 'GreenVest কাস্টমার কেয়ার' : 'GreenVest Support Desk'}
              </div>
              <div className="support-status-line" style={{ marginTop: '4px' }}>
                {lang === 'bn' ? '< ১ ঘন্টায় উত্তর দেওয়া হয়' : 'Typically replies in < 1 hr'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user && userThread.length > 0 && userThread.some((m) => m.status === 'open') && (
                <button
                  type="button"
                  onClick={async () => {
                    await resolveSupportTicket(user.id)
                    showToast(lang === 'bn' ? 'টিকিট সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে!' : 'Ticket marked as resolved!', '✅')
                  }}
                  title="Mark issue as solved"
                  style={{
                    background: '#22c55e',
                    border: 'none',
                    color: '#ffffff',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✓ {lang === 'bn' ? 'সমাধান হয়েছে' : 'Solved'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  color: '#ffffff',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick FAQ / Instant Helper Pills (Zero Supabase API usage) */}
          <div
            style={{
              padding: '10px 12px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {activeOrder && (
              <button
                type="button"
                onClick={() => handleSend(lang === 'bn' ? `আমার অর্ডার #${formatOrderId(activeOrder.id)}-এর বর্তমান খবর কী?` : `What is the status of my order #${formatOrderId(activeOrder.id)}?`)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#1e293b',
                }}
              >
                📦 {lang === 'bn' ? 'অর্ডার স্ট্যাটাস' : 'Track Order'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSend(lang === 'bn' ? 'কোনো সবজি ক্ষতিগ্রস্ত বা মিসিং হলে কী করণীয়?' : 'How to report damaged or missing produce?')}
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#1e293b',
              }}
            >
              🥬 {lang === 'bn' ? 'কোয়ালিটি অভিযোগ' : 'Quality Issue'}
            </button>
            {khataBal > 0 && (
              <button
                type="button"
                onClick={() => handleSend(lang === 'bn' ? `আমার খাতা বাকি ₹${khataBal} সংক্রান্ত তথ্য দিন।` : `Information regarding my Khata dues of ₹${khataBal}.`)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#1e293b',
                }}
              >
                📒 {lang === 'bn' ? 'খাতা বাকি' : 'Khata Dues'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSend(lang === 'bn' ? 'আজকের ডেলিভারি শিফট ও সময় কখন?' : 'What are today delivery shift hours?')}
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#1e293b',
              }}
            >
              ⏰ {lang === 'bn' ? 'ডেলিভারি সময়' : 'Timings'}
            </button>
          </div>

          {/* Chat Messages Body */}
          <div
            style={{
              flex: 1,
              padding: '12px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: '#f8fafc',
            }}
          >
            {/* Greeting */}
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '85%',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                padding: '8px 12px',
                borderRadius: '12px 12px 12px 2px',
                fontSize: '0.82rem',
                color: '#334155',
                lineHeight: 1.4,
              }}
            >
              👋 {lang === 'bn'
                ? 'নমস্কার! GreenVest সাপোর্টে আপনাকে স্বাগতম। আপনার অর্ডার, পণ্য বা যেকোনো বিষয়ে প্রশ্ন থাকলে নিচে লিখুন।'
                : 'Hello! Welcome to GreenVest Support. How can we help you with your fresh groceries today?'}
            </div>

            {/* Active order quick card */}
            {activeOrder && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#1e40af' }}>
                  📦 {lang === 'bn' ? 'চলমান অর্ডার' : 'Active Order'} #{formatOrderId(activeOrder.id)}
                </div>
                <div style={{ color: '#3b82f6', marginTop: '2px' }}>
                  {lang === 'bn' ? 'স্ট্যাটাস:' : 'Status:'} <strong>{activeOrder.status.toUpperCase()}</strong> · ₹{activeOrder.total}
                </div>
                <Link
                  to={`/track?id=${formatOrderId(activeOrder.id)}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    color: '#2563eb',
                    fontWeight: 700,
                    textDecoration: 'underline',
                  }}
                >
                  {lang === 'bn' ? 'লাইভ ট্র্যাক দেখুন →' : 'Live Track →'}
                </Link>
              </div>
            )}

            {/* User Chat Thread */}
            {userThread.map((m) => {
              const isMe = m.senderRole === 'customer'
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: isMe ? '#166534' : '#ffffff',
                    color: isMe ? '#ffffff' : '#1e293b',
                    border: isMe ? 'none' : '1px solid #e2e8f0',
                    padding: '8px 12px',
                    borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: '0.82rem',
                    lineHeight: 1.4,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {!isMe && (
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', marginBottom: '2px' }}>
                      🏪 {m.senderRole === 'admin' ? 'Store Admin' : 'Seller Desk'}
                    </div>
                  )}
                  <div>{m.message}</div>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                      textAlign: 'right',
                      marginTop: '3px',
                    }}
                  >
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            style={{
              padding: '8px 12px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              placeholder={lang === 'bn' ? 'আপনার প্রশ্ন লিখুন...' : 'Type your question...'}
              disabled={sending}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '20px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={sending || !inputMsg.trim()}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: inputMsg.trim() ? '#166534' : '#cbd5e1',
                color: '#ffffff',
                border: 'none',
                cursor: inputMsg.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
              }}
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  )
}
