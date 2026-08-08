import { useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  emoji?: string
  type?: 'success' | 'error' | 'info'
}

let _setToast: ((msg: ToastMessage) => void) | null = null

export function showToast(text: string, emoji = '✅', type: ToastMessage['type'] = 'success') {
  _setToast?.({ id: Date.now(), text, emoji, type })
}

export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    _setToast = (msg) => {
      setMessages((prev) => [...prev.slice(-2), msg])
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      }, 2800)
    }
    return () => { _setToast = null }
  }, [])

  if (messages.length === 0) return null

  return (
    <div className="toast-stack" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`toast toast-${m.type ?? 'success'}`}>
          <span className="toast-emoji">{m.emoji}</span>
          <span>{m.text}</span>
        </div>
      ))}
    </div>
  )
}
