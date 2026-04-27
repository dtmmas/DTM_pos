import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

interface Brand { id: number; name: string }

export default function Brands() {
  const [items, setItems] = useState<Brand[]>([])
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [showEdit, setShowEdit] = useState(false)
  const [editTarget, setEditTarget] = useState<Brand | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null)

  const load = async () => {
    const { data } = await api.get('/brands')
    const sorted = [...data].sort((a: Brand, b: Brand) => a.name.localeCompare(b.name))
    setItems(sorted)
    try {
      const entries = await Promise.all(sorted.map(async (b: Brand) => {
        const { data } = await api.get(`/brands/${b.id}/usage`)
        return [b.id, data?.count || 0] as const
      }))
      setUsage(Object.fromEntries(entries))
    } catch {}
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(b => b.name.toLowerCase().includes(q))
  }, [items, query])

  const startCreate = () => { setName(''); setShowCreate(true) }
  const cancelCreate = () => { setShowCreate(false); setName('') }
  const saveCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (items.some(x => x.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Ya existe una marca con ese nombre')
      return
    }
    setLoading(true)
    try {
      await api.post('/brands', { name: trimmed })
      setName('')
      setShowCreate(false)
      await load()
      alert('Marca creada correctamente')
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'No se pudo crear la marca.'
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (b: Brand) => {
    setEditTarget(b)
    setName(b.name)
    setShowEdit(true)
  }
  const cancelEdit = () => { setShowEdit(false); setEditTarget(null); setName('') }
  const saveEdit = async () => {
    if (!editTarget) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (items.some(x => x.id !== editTarget.id && x.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Ya existe una marca con ese nombre')
      return
    }
    try {
      setLoading(true)
      await api.put(`/brands/${editTarget.id}`, { name: trimmed })
      setShowEdit(false)
      setEditTarget(null)
      setName('')
      await load()
      alert('Marca actualizada correctamente')
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'No se pudo actualizar la marca.'
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  const removeBrand = async (id: number) => {
    const target = items.find(b => b.id === id) || null
    setDeleteTarget(target)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setLoading(true)
      await api.delete(`/brands/${deleteTarget.id}`)
      await load()
      setDeleteTarget(null)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'No se pudo eliminar la marca.'
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Marcas</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} style={{ width: 280 }} />
          <button className="primary-btn" onClick={startCreate}>Nuevo</button>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
              aria-label="Vista grid"
              title="Vista grid"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
              </svg>
            </button>
            <button
              className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
              aria-label="Vista lista"
              title="Vista lista"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {filtered.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{b.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{usage[b.id] ?? 0} producto(s)</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 'auto', alignItems: 'center' }}>
                <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(b)}>
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                </button>
                <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeBrand(b.id)} disabled={(usage[b.id] ?? 0) > 0}>
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path d="M3 6h18" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--modal)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 8 }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Uso</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{b.name}</td>
                  <td style={{ padding: 8 }}>{usage[b.id] ?? 0} producto(s)</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(b)}>
                        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                      </button>
                      <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeBrand(b.id)} disabled={(usage[b.id] ?? 0) > 0}>
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path d="M3 6h18" stroke="currentColor" strokeWidth="2"/>
                          <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2"/>
                          <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2"/>
                          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Nueva marca</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={cancelCreate}>Cancelar</button>
              <button onClick={saveCreate} disabled={loading}>{loading ? 'Guardando...' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Editar marca</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={cancelEdit}>Cancelar</button>
              <button onClick={saveEdit} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Confirmar eliminación</h3>
            <div style={{ marginBottom: 12 }}>
              Esta acción eliminará la marca <strong>{deleteTarget.name}</strong> de forma permanente. ¿Confirmar?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} disabled={loading}>Cancelar</button>
              <button className="danger" onClick={confirmDelete} disabled={loading}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}