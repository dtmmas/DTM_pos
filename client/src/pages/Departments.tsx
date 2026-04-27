import { useEffect, useMemo, useState } from 'react'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../api'

interface Department { id: number; name: string }

export default function Departments() {
  const [items, setItems] = useState<Department[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const load = async () => {
    const data = await getDepartments()
    const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name))
    setItems(sorted)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(d => d.name.toLowerCase().includes(q))
  }, [items, query])

  const saveCreate = async () => {
    const name = createName.trim()
    if (!name) return
    if (items.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      alert('Ya existe un departamento con ese nombre')
      return
    }
    setLoading(true)
    try {
      await createDepartment({ name })
      setCreateName('')
      setShowCreate(false)
      await load()
      alert('Departamento creado correctamente')
    } finally { setLoading(false) }
  }

  const startEdit = (d: Department) => { setEditTarget(d); setEditName(d.name); setShowEdit(true) }
  const saveEdit = async () => {
    const name = editName.trim()
    if (!name || !editTarget) return
    if (items.some(x => x.id !== editTarget.id && x.name.toLowerCase() === name.toLowerCase())) {
      alert('Ya existe un departamento con ese nombre')
      return
    }
    setLoading(true)
    try {
      await updateDepartment(editTarget.id, { name })
      setShowEdit(false)
      setEditTarget(null)
      setEditName('')
      await load()
      alert('Departamento actualizado correctamente')
    } finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      await deleteDepartment(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'No se pudo eliminar el departamento')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Departamentos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} style={{ width: 280 }} />
          <button className="primary-btn" onClick={() => setShowCreate(true)}>Nuevo departamento</button>
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
          {filtered.map(d => (
            <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{d.name}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', alignItems: 'center' }}>
                <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(d)}>
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                </button>
                <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => setDeleteTarget(d)}>
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
                <th style={{ textAlign: 'left', padding: 8 }}>Departamento</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{d.name}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(d)}>
                        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                      </button>
                      <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => setDeleteTarget(d)}>
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
            <h3 style={{ margin: 0, marginBottom: 12 }}>Nuevo departamento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input placeholder="Nombre" value={createName} onChange={e => setCreateName(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="primary-btn" disabled={loading} onClick={saveCreate}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Editar departamento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input placeholder="Nombre" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setShowEdit(false); setEditTarget(null) }}>Cancelar</button>
              <button className="primary-btn" disabled={loading} onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Eliminar departamento</h3>
            <p style={{ marginBottom: 12 }}>¿Confirmas eliminar "{deleteTarget.name}"?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="danger" disabled={loading} onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}