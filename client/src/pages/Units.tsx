import { useEffect, useMemo, useState } from 'react'
import { getUnits, createUnit, updateUnit, deleteUnit } from '../api'

interface Unit { id: number; code: string; name: string }

export default function Units() {
  const [items, setItems] = useState<Unit[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)

  // Form states
  const [formData, setFormData] = useState({ code: '', name: '' })
  const [saving, setSaving] = useState(false)

  async function refresh() {
    try {
      setLoading(true)
      const data = await getUnits()
      setItems(data)
      setError(null)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error cargando unidades')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(u => (u.name || '').toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q))
  }, [items, query])

  // Modal handlers
  const openCreateModal = () => {
    setFormData({ code: '', name: '' })
    setShowCreateModal(true)
    setError(null)
  }

  const openEditModal = (unit: Unit) => {
    setSelectedUnit(unit)
    setFormData({ code: unit.code, name: unit.name })
    setShowEditModal(true)
    setError(null)
  }

  const openDeleteModal = (unit: Unit) => {
    setSelectedUnit(unit)
    setShowDeleteModal(true)
  }

  const closeModals = () => {
    setShowCreateModal(false)
    setShowEditModal(false)
    setShowDeleteModal(false)
    setSelectedUnit(null)
    setFormData({ code: '', name: '' })
    setError(null)
  }

  // CRUD operations
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code.trim() || !formData.name.trim()) {
      setError('Ingresa código y nombre')
      return
    }
    try {
      setSaving(true)
      await createUnit({ code: formData.code.trim(), name: formData.name.trim() })
      closeModals()
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error creando unidad')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUnit || !formData.code.trim() || !formData.name.trim()) {
      setError('Código y nombre son requeridos')
      return
    }
    try {
      setSaving(true)
      await updateUnit(selectedUnit.id, { code: formData.code.trim(), name: formData.name.trim() })
      closeModals()
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error actualizando unidad')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUnit) return
    try {
      setSaving(true)
      await deleteUnit(selectedUnit.id)
      closeModals()
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error eliminando unidad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Unidades</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} style={{ width: 280 }} />
          <button className="primary-btn" onClick={openCreateModal}>Nueva Unidad</button>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
              </svg>
            </button>
            <button
              className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No hay unidades</p>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {filtered.map((unit) => (
            <div key={unit.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{unit.name}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="icon-btn primary"
                    onClick={() => openEditModal(unit)}
                    title="Editar"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => openDeleteModal(unit)}
                    title="Eliminar"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                <p style={{ margin: 0 }}><strong>Código:</strong> {unit.code}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--modal)' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Código</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Nombre</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((unit) => (
                  <tr key={unit.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{unit.code}</td>
                    <td style={{ padding: 8 }}>{unit.name}</td>
                    <td style={{ padding: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="icon-btn primary"
                          onClick={() => openEditModal(unit)}
                          title="Editar"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                          </svg>
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => openDeleteModal(unit)}
                          title="Eliminar"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nueva Unidad</h2>
              <button className="close-btn" onClick={closeModals}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Código</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="ej: KG, LT, PZ"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ej: Kilogramo, Litro, Pieza"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModals}>
                  Cancelar
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedUnit && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar Unidad</h2>
              <button className="close-btn" onClick={closeModals}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Código</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModals}>
                  Cancelar
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedUnit && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar Unidad</h2>
              <button className="close-btn" onClick={closeModals}>×</button>
            </div>
            <div className="modal-body">
              <p>¿Estás seguro de que deseas eliminar la unidad <strong>{selectedUnit.name}</strong>?</p>
              <p className="warning-text">Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-btn" onClick={closeModals}>
                Cancelar
              </button>
              <button className="danger-btn" onClick={handleDelete} disabled={saving}>
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}