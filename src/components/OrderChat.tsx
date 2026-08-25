import { useState, useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import { fetchOrderMessagesApi, sendOrderMessageApi } from '../lib/api'
import { supabase } from '../lib/supabase'

interface OrderChatProps {
  orderId: string
  role: 'customer' | 'seller'
  lang: 'en' | 'bn'
}

export default function OrderChat({ orderId, role, lang }: OrderChatProps) {
  const storageKey = `greenvest_chat_${orderId}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]')
    } catch {
      return []
    }
  })
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // 1. Lazy On-Demand Supabase Realtime Subscription (Zero background waste)
  useEffect(() => {
    if (!orderId) return

    // Load fresh messages from database on mount
    void fetchOrderMessagesApi(orderId).then((cloudMsgs) => {
      if (cloudMsgs.length > 0) {
        setMessages(cloudMsgs)
        try {
          localStorage.setItem(storageKey, JSON.stringify(cloudMsgs))
        } catch {}
      }
    })

    if (!supabase) return

    // Subscribe to order-specific channel ONLY while this component is on-screen
    const channelName = `order-chat-${orderId}`
    const ch = supabase
      .channel(channelName)
      .on('broadcast', { event: 'new_msg' }, ({ payload }: { payload: unknown }) => {
        const msg = payload as ChatMessage
        if (msg && msg.orderId === orderId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            const next = [...prev, msg]
            try {
              localStorage.setItem(storageKey, JSON.stringify(next))
            } catch {}
            return next
          })
        }
      })
      .subscribe()

    return () => {
      // Instantly disconnect when user navigates away
      if (supabase) {
        void supabase.removeChannel(ch)
      }
    }
  }, [orderId, storageKey])

  // Auto scroll to bottom
  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text || sending) return

    setSending(true)
    setInputText('')

    try {
      const savedMsg = await sendOrderMessageApi(orderId, role, text)

      setMessages((prev) => {
        if (prev.some((m) => m.id === savedMsg.id)) return prev
        const next = [...prev, savedMsg]
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {}
        return next
      })

      // Broadcast to other participant
      if (supabase) {
        const ch = supabase.channel(`order-chat-${orderId}`)
        await ch.send({
          type: 'broadcast',
          event: 'new_msg',
          payload: savedMsg,
        })
      }
    } catch (err) {
      console.warn('Chat send fallback error:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="order-chat-container">
      <div className="chat-header">
        <span>💬 {role === 'seller' ? (lang === 'bn' ? 'কাস্টমার নোট ও চ্যাট' : 'Customer Note & Chat') : (lang === 'bn' ? 'সেলার লাইভ চ্যাট' : 'Direct Chat with Seller')}</span>
      </div>

      <div className="chat-messages-box" ref={boxRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">
            {role === 'customer'
              ? (lang === 'bn' ? 'ডেলিভারি নির্দেশ বা প্রশ্ন লিখুন (যেমন: ভালো টমেটো দেবেন)' : 'Add special delivery notes or instructions here...')
              : (lang === 'bn' ? 'কাস্টমারের কোনো বিশেষ মেসেজ নেই।' : 'No messages yet.')}
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-bubble-row ${m.sender === role ? 'chat-sent' : 'chat-received'}`}>
              <div className="chat-bubble">
                <span className="chat-sender-tag">{m.sender === 'seller' ? '🌾 Seller' : '👤 Customer'}</span>
                <p className="chat-text">{m.text}</p>
                <span className="chat-time">{m.time}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={lang === 'bn' ? 'মেসেজ লিখুন...' : 'Type a message...'}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !inputText.trim()}>
          {lang === 'bn' ? 'পাঠান' : 'Send'}
        </button>
      </form>
    </div>
  )
}
