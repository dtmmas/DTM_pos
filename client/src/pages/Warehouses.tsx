import { useEffect, useState } from 'react'
import { api } from '../api'

interface Warehouse {
  id: number
  name: string
  type: 'ALMACEN' | 'TIENDA'
  address: string
  status: 'ACTIVO' | 'INACTIVO'
}

export default function Warehouses() {
  const [items, setItems] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    type: 'ALMACEN' as 'ALMACEN' | 'TIENDA',
    address: '',
    status: 'ACTIVO' as 'ACTIVO' | 'INACTIVO'
  })

  const load = async () => {
    try {
      const { data } = await api.get('/warehouses')
      setItems(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setFormData({ name: '', type: 'ALMACEN', address: '', status: 'ACTIVO' })
  }

  const startCreate = () => {
    resetForm()
    setShowCreate(true)
  }

  const startEdit = (w: Warehouse) => {
    setEditTarget(w)
    setFormData({
      name: w.name,
      type: w.type,
      address: w.address || '',
      status: w.status
    })
    setShowEdit(true)
  }

  const saveCreate = async () => {
    if (!formData.name.trim()) return alert('Nombre requerido')
    
    setLoading(true)
    try {
      await api.post('/warehouses', formData)
      setShowCreate(false)
      await load()
      alert('Almacén creado correctamente')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al crear')
    } finally {
      setLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!editTarget) return
    if (!formData.name.trim()) return alert('Nombre requerido')
    
    setLoading(true)
    try {
      await api.put(`/warehouses/${editTarget.id}`, formData)
      setShowEdit(false)
      setEditTarget(null)
      await load()
      alert('Almacén actualizado correctamente')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Seguro de eliminar este almacén?')) return
    try {
      await api.delete(`/warehouses/${id}`)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al eliminar')
    }
  }

  return (
    <div className="page-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2>Almacenes y Tiendas</h2>
        <button className="primary-btn" onClick={startCreate}>Nuevo Almacén</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface)' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left' }}>Nombre</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Tipo</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Dirección</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Estado</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 12 }}>{w.name}</td>
                <td style={{ padding: 12 }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: 4, 
                    background: w.type === 'TIENDA' ? '#e3f2fd' : '#f3e5f5',
                    color: w.type === 'TIENDA' ? '#1565c0' : '#7b1fa2',
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {w.type}
                  </span>
                </td>
                <td style={{ padding: 12 }}>{w.address || '-'}</td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: w.status === 'ACTIVO' ? 'green' : 'red' }}>
                    {w.status}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  <button className="icon-btn" onClick={() => startEdit(w)} style={{ marginRight: 8 }}>✏️</button>
                  <button className="icon-btn danger" onClick={() => handleDelete(w.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(showCreate || showEdit) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--modal)', padding: 24, borderRadius: 12, width: 400, border: '1px solid var(--border)' }}>
            <h3>{showCreate ? 'Nuevo Almacén' : 'Editar Almacén'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Nombre</label>
                <input 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={{ width: '100%', padding: 8 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Tipo</label>
                <select 
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as any})}
                  style={{ width: '100%', padding: 8 }}
                >
                  <option value="ALMACEN">ALMACÉN (Bodega)</option>
                  <option value="TIENDA">TIENDA (Punto de Venta)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Dirección</label>
                <input 
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  style={{ width: '100%', padding: 8 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Estado</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                  style={{ width: '100%', padding: 8 }}
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button onClick={() => { setShowCreate(false); setShowEdit(false); }}>Cancelar</button>
              <button className="primary-btn" onClick={showCreate ? saveCreate : saveEdit} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
