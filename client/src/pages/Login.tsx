import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const config = useConfigStore(s => s.config)
  const [email, setEmail] = useState('admin@local')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) navigate('/')
    else setError('Credenciales inválidas')
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', padding: 16 }}>
      <div style={{ width: 360, maxWidth: '92vw', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
        {config?.logoUrl && <img src={config.logoUrl} alt="logo" style={{ width: 64, height: 64, borderRadius: 12, display: 'block', margin: '0 auto 8px' }} />}
        <h1 style={{ textAlign: 'center', margin: '0 0 8px 0', fontSize: '1.5rem' }}>{config?.name ?? 'DTMPos'}</h1>
        <p style={{ textAlign: 'center', margin: '0 0 24px 0', color: 'var(--muted)' }}>Moneda: {config?.currency ?? 'USD'}</p>
        <form onSubmit={onSubmit}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Email</label>
          <input 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="email"
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--modal)', color: 'var(--text)', marginBottom: 16 }} 
          />
          <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Contraseña</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="contraseña" 
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--modal)', color: 'var(--text)' }}
          />
          {error && <div style={{ color: '#ef4444', marginTop: 12, fontSize: 14, textAlign: 'center' }}>{error}</div>}
          <button 
            type="submit"
            style={{ width: '100%', marginTop: 24, padding: '10px', borderRadius: 8, border: 0, background: 'var(--accent)', color: '#052b35', fontWeight: 700, cursor: 'pointer' }}
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  )
}