import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'

export default function Config() {
  const { config, fetchConfig } = useConfigStore()
  const user = useAuthStore(s => s.user)
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN'
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingBackup, setDownloadingBackup] = useState(false)

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

  const downloadBackup = async () => {
    setDownloadingBackup(true)
    try {
      const response = await api.get('/config/backup', { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/sql;charset=utf-8' })
      const downloadUrl = URL.createObjectURL(blob)
      const contentDisposition = String(response.headers?.['content-disposition'] || '')
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] || `backup-${Date.now()}.sql`

      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(downloadUrl)
    } catch (err: any) {
      console.error(err)
      let errorMessage = 'No se pudo generar el backup'

      try {
        const data = err?.response?.data
        if (data instanceof Blob) {
          const text = await data.text()
          try {
            const parsed = JSON.parse(text)
            errorMessage = parsed?.error || parsed?.message || text || errorMessage
          } catch {
            errorMessage = text || errorMessage
          }
        } else if (typeof data === 'string' && data.trim()) {
          errorMessage = data
        } else if (data?.error) {
          errorMessage = data.error
        }
      } catch {
        // noop
      }

      alert(errorMessage)
    } finally {
      setDownloadingBackup(false)
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

        {isAdmin && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Backup de base de datos</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Genera un respaldo SQL completo de la base de datos y lo descarga en tu equipo. Esta opción está disponible solo para administrador.
            </div>
            <button type="button" className="secondary-btn" onClick={downloadBackup} disabled={downloadingBackup}>
              {downloadingBackup ? 'Generando backup...' : 'Descargar backup SQL'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
