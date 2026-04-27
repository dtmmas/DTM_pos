import { useState, useEffect } from 'react'
import { api } from '../api'

interface Log {
  id: number
  action: string
  details: string
  userId: number
  createdAt: string
  user?: { name: string }
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      // Endpoint likely doesn't exist yet, but this is a placeholder structure
      const { data } = await api.get('/logs') 
      setLogs(data)
    } catch (error) {
      console.error('Error fetching logs', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // fetchLogs() // Uncomment when API is ready
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Registros del Sistema (Logs)</h2>
      </div>
      <div style={{ background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ margin: 0 }}>Módulo de Logs en construcción.</p>
        <p style={{ margin: '8px 0 0 0', fontSize: '0.9em' }}>Aquí se mostrarán las actividades del sistema.</p>
      </div>
    </div>
  )
}
