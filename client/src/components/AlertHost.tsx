import { useEffect, useState } from 'react'

type AlertItem = {
  id: number
  message: string
}

const APP_ALERT_EVENT = 'dtmpos:alert'

export function showAppAlert(message: unknown) {
  const detail = { message: String(message ?? '') }
  // En Trae el dispatch síncrono durante updates complejos puede terminar en React #185.
  // Lo diferimos al siguiente tick para romper la cascada de renders.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(APP_ALERT_EVENT, { detail }))
  }, 0)
}

export default function AlertHost() {
  const [items, setItems] = useState<AlertItem[]>([])

  useEffect(() => {
    const originalAlert = window.alert.bind(window)

    window.alert = (message?: unknown) => {
      showAppAlert(message)
    }

    const handleAlert = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>
      const message = String(customEvent.detail?.message || '').trim()
      if (!message) return

      const id = Date.now() + Math.floor(Math.random() * 1000)
      setItems(prev => [...prev, { id, message }])
      window.setTimeout(() => {
        setItems(prev => prev.filter(item => item.id !== id))
      }, 3500)
    }

    window.addEventListener(APP_ALERT_EVENT, handleAlert as EventListener)

    return () => {
      window.alert = originalAlert
      window.removeEventListener(APP_ALERT_EVENT, handleAlert as EventListener)
    }
  }, [])

  if (!items.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none'
      }}
    >
      {items.map(item => (
        <div
          key={item.id}
          style={{
            minWidth: 280,
            maxWidth: 420,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid rgba(59, 130, 246, 0.28)',
            background: 'rgba(15, 23, 42, 0.96)',
            color: '#fff',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.28)',
            fontSize: 14,
            lineHeight: 1.4,
            pointerEvents: 'auto'
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
