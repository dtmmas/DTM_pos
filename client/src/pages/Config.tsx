import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'

interface TrackedInventoryAuditDifference {
  warehouseId: number
  warehouseName: string
  stockQty: number
  trackedQty: number
  trackedItems?: string
}

interface TrackedInventoryAuditItem {
  productId: number
  productType: string
  productCode?: string
  sku?: string
  name: string
  differences: TrackedInventoryAuditDifference[]
}

interface TrackedInventoryAuditResponse {
  generatedAt: string
  productCount: number
  mismatchCount: number
  mismatches: TrackedInventoryAuditItem[]
}

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
  const [downloadingFullBackup, setDownloadingFullBackup] = useState(false)
  const [runningTrackedAudit, setRunningTrackedAudit] = useState(false)
  const [trackedAudit, setTrackedAudit] = useState<TrackedInventoryAuditResponse | null>(null)

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

  const downloadFile = async (url: string, fallbackFilename: string, defaultError: string) => {
    try {
      const response = await api.get(url, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: String(response.headers?.['content-type'] || 'application/octet-stream') })
      const downloadUrl = URL.createObjectURL(blob)
      const contentDisposition = String(response.headers?.['content-disposition'] || '')
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] || fallbackFilename

      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(downloadUrl)
    } catch (err: any) {
      console.error(err)
      let errorMessage = defaultError

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
    }
  }

  const downloadBackup = async () => {
    setDownloadingBackup(true)
    try {
      await downloadFile('/config/backup', `backup-${Date.now()}.sql`, 'No se pudo generar el backup SQL')
    } finally {
      setDownloadingBackup(false)
    }
  }

  const downloadFullBackup = async () => {
    setDownloadingFullBackup(true)
    try {
      await downloadFile('/config/backup/full', `backup-completo-${Date.now()}.tar.gz`, 'No se pudo generar el backup completo')
    } finally {
      setDownloadingFullBackup(false)
    }
  }

  const runTrackedInventoryAudit = async () => {
    setRunningTrackedAudit(true)
    try {
      const response = await api.get('/config/audit/tracked-inventory')
      setTrackedAudit(response.data as TrackedInventoryAuditResponse)
      if (Number(response.data?.mismatchCount || 0) === 0) {
        alert('No se detectaron inconsistencias entre stock y series/IMEI disponibles')
      }
    } catch (err: any) {
      console.error(err)
      alert(err?.response?.data?.error || 'No se pudo ejecutar la auditoria de series e IMEI')
    } finally {
      setRunningTrackedAudit(false)
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
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Backups del sistema</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Puedes descargar un respaldo SQL de la base de datos o un backup completo con base de datos, imágenes y configuración. Esta opción está disponible solo para administrador.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="secondary-btn" onClick={downloadBackup} disabled={downloadingBackup || downloadingFullBackup}>
                {downloadingBackup ? 'Generando backup SQL...' : 'Descargar backup SQL'}
              </button>
              <button type="button" className="primary-btn" onClick={downloadFullBackup} disabled={downloadingBackup || downloadingFullBackup}>
                {downloadingFullBackup ? 'Generando backup completo...' : 'Descargar backup completo'}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={runTrackedInventoryAudit}
                disabled={downloadingBackup || downloadingFullBackup || runningTrackedAudit}
              >
                {runningTrackedAudit ? 'Auditando series e IMEI...' : 'Auditar series e IMEI'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              El backup completo incluye `database.sql`, carpeta `uploads` y `config.json`, para restaurar también las imágenes del sistema.
            </div>

            {trackedAudit && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Auditoria de series e IMEI</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                  Generada: {new Date(trackedAudit.generatedAt).toLocaleString()} | Productos revisados: {trackedAudit.productCount} | Inconsistencias: {trackedAudit.mismatchCount}
                </div>

                {trackedAudit.mismatchCount === 0 ? (
                  <div style={{ fontSize: 13 }}>No se detectaron inconsistencias entre stock y series/IMEI disponibles.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {trackedAudit.mismatches.map(item => (
                      <div key={item.productId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--card)' }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                          {item.productCode ? `COD: ${item.productCode}` : 'Sin codigo'} | {item.sku ? `SKU: ${item.sku}` : 'Sin SKU'} | Tipo: {item.productType}
                        </div>
                        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                          {item.differences.map(diff => (
                            <div key={`${item.productId}-${diff.warehouseId}`} style={{ fontSize: 13 }}>
                              <strong>{diff.warehouseName}</strong>: stock {diff.stockQty} | disponibles {diff.trackedQty}
                              {diff.trackedItems ? ` | ${diff.trackedItems}` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
