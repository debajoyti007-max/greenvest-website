import { useState, useEffect } from 'react'

interface Message {
  id: string
  sender: 'customer' | 'seller'
  text: string
  time: string
}

interface OrderChatProps {
  orderId: string
  role: 'customer' | 'seller'
  lang: 'en' | 'bn'
}

export default function OrderChat({ orderId, role, lang }: OrderChatProps) {
  const storageKey = `greenvest_chat_${orderId}`
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [storageKey])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: role,
      text: inputText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updated = [...messages, newMsg]
    setMessages(updated)
    localStorage.setItem(storageKey, JSON.stringify(updated))
    setInputText('')
  }

  return (
    <div className="order-chat-container">
      <div className="chat-header">
        <span>💬 {role === 'seller' ? (lang === 'bn' ? 'কাস্টমার নোট ও চ্যাট' : 'Customer Note & Chat') : (lang === 'bn' ? 'সেলার লাইভ চ্যাট' : 'Direct Chat with Seller')}</span>
      </div>

      <div className="chat-messages-box">
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
        />
        <button type="submit" className="btn btn-primary btn-sm">
          {lang === 'bn' ? 'পাঠান' : 'Send'}
        </button>
      </form>
    </div>
  )
}
