import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatOrderId } from '../lib/business'
import { showToast } from '../components/Toast'

export default function Support() {
  const { lang, orders, supportMessages, sendSupportMessage, getUserKhataBalance, shiftStatus } = useStore()
  const { user } = useAuth()
  const [inputMsg, setInputMsg] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const userThread = useMemo(() => {
    if (!user) return []
    return (supportMessages || []).filter((m) => m.userId === user.id)
  }, [supportMessages, user])

  const activeOrder = useMemo(() => {
    if (!user) return null
    return orders
      .filter((o) => o.userId === user.id && o.status !== 'delivered' && o.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
  }, [orders, user])

  const khataBal = user ? getUserKhataBalance(user.id) : 0

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [userThread.length])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMsg).trim()
    if (!text) return
    if (!user) {
      showToast(lang === 'bn' ? 'মেসেজ পাঠাতে লগইন করুন' : 'Please login to message support', '⚠️')
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
    <div className="page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: '0 0 0.35rem', color: '#166534' }}>
          💬 {lang === 'bn' ? 'গ্রাহক সহায়তা ও কাস্টমার কেয়ার' : 'Customer Care & Support'}
        </h1>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          {lang === 'bn'
            ? 'অর্ডার, ডেলিভারি বা পণ্যের গুণমান নিয়ে যেকোনো প্রশ্ন থাকলে সরাসরি জানান।'
            : 'Get instant assistance regarding your orders, fresh produce quality, and deliveries.'}
        </p>
      </div>

      {/* 4 Clean Quick Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {/* Card 1: Track Active Order */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>📦</div>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block' }}>
            {lang === 'bn' ? 'অর্ডার ট্র্যাকিং' : 'Order Tracking'}
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', margin: '4px 0 8px' }}>
            {activeOrder
              ? (lang === 'bn' ? `অর্ডার #${formatOrderId(activeOrder.id)}: ${activeOrder.status}` : `Order #${formatOrderId(activeOrder.id)}: ${activeOrder.status}`)
              : (lang === 'bn' ? 'বর্তমানে কোনো চলমান অর্ডার নেই' : 'No active orders right now')}
          </span>
          {activeOrder ? (
            <Link
              to={`/track?id=${formatOrderId(activeOrder.id)}`}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
            >
              {lang === 'bn' ? 'ট্র্যাক করুন →' : 'Track Order →'}
            </Link>
          ) : (
            <Link to="/shop" className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
              {lang === 'bn' ? 'কেনাকাটা করুন' : 'Shop Now'}
            </Link>
          )}
        </div>

        {/* Card 2: Freshness & Quality Promise */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>🥬</div>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block' }}>
            {lang === 'bn' ? 'কোয়ালিটি গ্যারান্টি' : 'Quality Guarantee'}
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', margin: '4px 0 8px' }}>
            {lang === 'bn' ? 'কোনো পণ্য নষ্ট বেরোলে ১০০% রিপ্লেসমেন্ট' : '100% replacement for damaged produce'}
          </span>
          <button
            type="button"
            onClick={() => handleSend(lang === 'bn' ? 'আমার সাম্প্রতিক অর্ডারের সবজিতে কোয়ালিটি সমস্যা রয়েছে।' : 'I have a quality issue with produce in my recent order.')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
          >
            {lang === 'bn' ? 'রিপোর্ট করুন' : 'Report Issue'}
          </button>
        </div>

        {/* Card 3: Khata Balance */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>📒</div>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block' }}>
            {lang === 'bn' ? 'ডিজিটাল খাতা' : 'Digital Khata'}
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', margin: '4px 0 8px' }}>
            {lang === 'bn' ? `বর্তমান বকেয়া: ₹${khataBal}` : `Current Balance: ₹${khataBal}`}
          </span>
          <Link to="/profile" className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
            {lang === 'bn' ? 'খাতা দেখুন' : 'View Passbook'}
          </Link>
        </div>

        {/* Card 4: Shift Hours */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>⏰</div>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block' }}>
            {lang === 'bn' ? 'ডেলিভারি শিফট' : 'Delivery Shifts'}
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', margin: '4px 0 8px' }}>
            {shiftStatus.isOpen
              ? (lang === 'bn' ? '🟢 দোকান খোলা · দ্রুত ডেলিভারি' : '🟢 Store Open · Active Delivery')
              : (lang === 'bn' ? '🌙 অর্ডার গ্রহণ চলছে' : '🌙 Accepting Next-Shift Orders')}
          </span>
          <button
            type="button"
            onClick={() => handleSend(lang === 'bn' ? 'ডেলিভারি শিফটের বিস্তারিত সময়সূচী জানতে চাই।' : 'Please share the delivery shift timetable.')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
          >
            {lang === 'bn' ? 'তথ্য জানুন' : 'Check Timings'}
          </button>
        </div>
      </div>

      {/* Main Live Chat Thread Card */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        {/* Chat Card Header */}
        <div style={{ padding: '12px 18px', background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🌱</span>
            <div>
              <strong style={{ fontSize: '0.95rem' }}>{lang === 'bn' ? 'স্টোর অ্যাডমিনের সাথে চ্যাট' : 'Direct Chat with Store'}</strong>
              <div style={{ fontSize: '0.72rem', color: '#bbf7d0' }}>
                {lang === 'bn' ? 'সরাসরি উত্তর প্রদান করা হয়' : 'Fast, in-app customer response'}
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', background: '#22c55e', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
            ONLINE
          </span>
        </div>

        {/* Message Log */}
        <div style={{ height: '340px', overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc' }}>
          {/* Welcome Message */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', background: '#ffffff', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '14px 14px 14px 2px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
            👋 {lang === 'bn'
              ? 'নমস্কার! GreenVest সহায়তা কেন্দ্রে স্বাগতম। আপনার অর্ডার বা কোনো প্রশ্নের জন্য নিচে বার্তা পাঠান।'
              : 'Hello! Welcome to GreenVest Support. Feel free to ask any question or report any issue below.'}
          </div>

          {userThread.map((m) => {
            const isMe = m.senderRole === 'customer'
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  background: isMe ? '#166534' : '#ffffff',
                  color: isMe ? '#ffffff' : '#1e293b',
                  border: isMe ? 'none' : '1px solid #e2e8f0',
                  padding: '10px 14px',
                  borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  fontSize: '0.85rem',
                  lineHeight: 1.4,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}
              >
                {!isMe && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>
                    🏪 {m.senderRole === 'admin' ? 'Store Admin' : 'Seller Desk'}
                  </div>
                )}
                <div>{m.message}</div>
                <div style={{ fontSize: '0.68rem', color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8', textAlign: 'right', marginTop: '4px' }}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          style={{ padding: '12px 16px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder={user ? (lang === 'bn' ? 'আপনার প্রশ্ন লিখুন...' : 'Type your question...') : (lang === 'bn' ? 'মেসেজ পাঠাতে লগইন করুন...' : 'Please login to send message...')}
            disabled={sending || !user}
            style={{ flex: 1, padding: '10px 14px', borderRadius: '24px', border: '1.5px solid #cbd5e1', fontSize: '0.88rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={sending || !inputMsg.trim() || !user}
            className="btn btn-primary"
            style={{ borderRadius: '24px', padding: '10px 20px', fontWeight: 700, fontSize: '0.88rem' }}
          >
            {sending ? '...' : (lang === 'bn' ? 'পাঠান' : 'Send')}
          </button>
        </form>
      </div>
    </div>
  )
}
