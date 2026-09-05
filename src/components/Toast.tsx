import { useEffect, useState } from 'react'
import { _registerToastSetter, type ToastMessage } from '../lib/toast'

/**
 * Global toast container.  Mount once at app root.
 * Use `showToast()` from `src/lib/toast.ts` to display notifications.
 */
export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    _registerToastSetter((msg) => {
      setMessages((prev) => [...prev.slice(-2), msg])
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      }, 2800)
    })
    return () => { _registerToastSetter(null) }
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
