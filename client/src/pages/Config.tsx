import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useConfigStore } from '../store/config'

export default function Config() {
  const { config, fetchConfig } = useConfigStore()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (config) {
      setName(config.name)
      setCurrency(config.currency)
      setLogoUrl(config.logoUrl || '')
    }
  }, [config])

  const logoPreview = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile)
    return logoUrl || ''
  }, [logoFile, logoUrl])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('currency', currency)
      if (logoFile) fd.append('logo', logoFile)
      else if (logoUrl) fd.append('logoUrl', logoUrl)
      await api.put('/config', fd)
      await fetchConfig()
      alert('Configuración guardada')
      setLogoFile(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ maxWidth: 600, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <h2 style={{ margin: 0, marginBottom: 20 }}>Configuración del sistema</h2>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Nombre</label>
            <input value={name} onChange={e=>setName(e.target.value)} required style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Moneda</label>
            <input value={currency} onChange={e=>setCurrency(e.target.value)} required style={{ width: '100%' }} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Logo actual / vista previa</label>
            {logoPreview && (
              <img src={logoPreview} alt="logo" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block', marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 4 }} />
            )}
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Subir nuevo logo</label>
            <input type="file" accept="image/*" onChange={(e)=> setLogoFile(e.target.files?.[0] || null)} />
            {logoFile && <div className="file-name" style={{ marginTop: 4 }}>{logoFile.name}</div>}
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>Opcional: o pega una URL</small>
            <input placeholder="Logo URL" value={logoUrl} onChange={e=>setLogoUrl(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'inherit' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}