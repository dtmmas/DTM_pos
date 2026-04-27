import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import { formatDateTime } from '../utils/date'

interface Warehouse {
  id: number
  name: string
}

interface Product {
  id: number
  name: string
  sku: string
  stock: number
  imageUrl?: string
}

interface TransferItem {
  productId: number
  name: string
  quantity: number
  stockAtSource: number
  batchNo?: string
  expiryDate?: string
  imei?: string
  serial?: string
  // UI helpers
  availableBatches?: any[]
  availableImeis?: any[]
  availableSerials?: any[]
}

interface Transfer {
  id: number
  source_warehouse_id: number
  destination_warehouse_id: number
  source_warehouse_name: string
  destination_warehouse_name: string
  status: string
  created_at: string
  notes?: string
  created_by_user?: string
  total_quantity: number
}

export default function Transfers() {
  const [view, setView] = useState<'list' | 'create'>('list')
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  
  const [searchTerm, setSearchTerm] = useState('')
  const [filterWarehouse, setFilterWarehouse] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Create Form State
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [destId, setDestId] = useState<number | null>(null)
  const [items, setItems] = useState<TransferItem[]>([])
  const [notes, setNotes] = useState('')
  
  // Product Search State
  const [loadingSearch, setLoadingSearch] = useState(false)
  
  // Create Form Product Search
  const [createSearchTerm, setCreateSearchTerm] = useState('')
  const [createSearchResults, setCreateSearchResults] = useState<Product[]>([])

  const filteredTransfers = transfers.filter(t => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = 
      t.id.toString().includes(term) ||
      t.source_warehouse_name?.toLowerCase().includes(term) ||
      t.destination_warehouse_name?.toLowerCase().includes(term) ||
      t.notes?.toLowerCase().includes(term) ||
      t.created_by_user?.toLowerCase().includes(term)
    
    const matchesWarehouse = !filterWarehouse || 
      t.source_warehouse_id.toString() === filterWarehouse || 
      t.destination_warehouse_id.toString() === filterWarehouse

    const matchesStatus = !filterStatus || t.status === filterStatus

    return matchesSearch && matchesWarehouse && matchesStatus
  })

  const user = useAuthStore(s => s.user)

  useEffect(() => {
    loadWarehouses()
    loadTransfers()
  }, [])

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/warehouses')
      setWarehouses(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadTransfers = async () => {
    try {
      const res = await api.get('/transfers')
      setTransfers(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateSearchProducts = async (term: string) => {
    setCreateSearchTerm(term)
    if (!term || term.length < 2) {
      setCreateSearchResults([])
      return
    }
    
    if (!sourceId) {
        // Can't search stock correctly without source warehouse
        return
    }

    setLoadingSearch(true)
    try {
      // Fetch products with stock relative to SOURCE warehouse
      const res = await api.get('/products', { 
          params: { 
              search: term, 
              warehouseId: sourceId 
          } 
      })
      // Client-side filter if API doesn't support search param yet, or just rely on API
      // Assuming /products returns all, we filter here for now
      const filtered = res.data.filter((p: Product) => 
          p.name.toLowerCase().includes(term.toLowerCase()) || 
          p.sku?.toLowerCase().includes(term.toLowerCase())
      )
      setCreateSearchResults(filtered)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSearch(false)
    }
  }

  const addItem = (product: Product) => {
    // Check basic duplicate (only if no special details needed yet)
    // Actually we need to fetch details first if it's special type
    
    // Fetch details if needed
    const fetchDetails = async () => {
        try {
            const res = await api.get(`/products/${product.id}`, { params: { warehouseId: sourceId } })
            const pData = res.data
            
            // If product has batches/imei/serial, we might need a modal or expanded row
            // For simplicity, let's add to list and let user select details in the table row
            
            setItems(prev => [...prev, {
                productId: product.id,
                name: product.name,
                quantity: 1,
                stockAtSource: product.stock,
                availableBatches: pData.batches || [],
                availableImeis: pData.imeis || [],
                availableSerials: pData.serials || []
            }])
            setCreateSearchTerm('')
            setCreateSearchResults([])
        } catch (err) {
            console.error(err)
            alert('Error al cargar detalles del producto')
        }
    }
    
    fetchDetails()
  }

  const updateItemDetail = (index: number, field: string, value: any) => {
      setItems(prev => prev.map((item, i) => {
          if (i === index) {
              return { ...item, [field]: value }
          }
          return item
      }))
  }

  const updateItemQty = (productId: number, qty: number) => {
    // Actually using index for updates now to support multiple same-product rows (for different imeis/series)
    // But keeping this for now, though logic should move to updateItemDetail
  }

  const handleSubmit = async () => {
    if (!sourceId || !destId) return alert('Seleccione almacenes')
    if (sourceId === destId) return alert('Almacenes deben ser distintos')
    if (items.length === 0) return alert('Agregue productos')
    
    // Validate selections
    for (const item of items) {
        if (item.availableBatches?.length && !item.batchNo) {
            return alert(`Seleccione lote para ${item.name}`)
        }
        if (item.availableImeis?.length && !item.imei) {
            return alert(`Seleccione IMEI para ${item.name}`)
        }
        if (item.availableSerials?.length && !item.serial) {
            return alert(`Seleccione Serie para ${item.name}`)
        }
    }

    try {
      const payload = {
        source_warehouse_id: sourceId,
        destination_warehouse_id: destId,
        items: items.map(i => ({ 
            product_id: i.productId, 
            quantity: i.quantity, 
            batch_no: i.batchNo, 
            imei: i.imei, 
            serial: i.serial
        })),
        notes
      }
      
      await api.post('/transfers', payload)
      alert('Transferencia realizada con éxito')
      setView('list')
      loadTransfers()
      // Reset form
      setSourceId(null)
      setDestId(null)
      setItems([])
      setNotes('')
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.error || 'Error al realizar transferencia')
    }
  }

  return (
    <div className="page-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Transferencias de Inventario</h2>
        
        {view === 'list' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input 
              placeholder="Buscar..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', width: 200 }}
            />
            
            <select 
              value={filterWarehouse} 
              onChange={e => setFilterWarehouse(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
            >
              <option value="">Todos los almacenes</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>

            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
            >
              <option value="">Todos los estados</option>
              <option value="COMPLETED">Completado</option>
              <option value="PENDING">Pendiente</option>
              <option value="CANCELLED">Cancelado</option>
            </select>

            <button className="primary-btn" onClick={() => setView('create')}>Nueva Transferencia</button>
          </div>
        ) : (
          <button className="secondary-btn" onClick={() => setView('list')}>Volver al Historial</button>
        )}
      </div>

      {view === 'list' ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--modal)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 12 }}>ID</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Origen</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Destino</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Items</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Usuario</th>
                <th style={{ textAlign: 'center', padding: 12 }}>Estado</th>
                <th style={{ textAlign: 'center', padding: 12 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontWeight: 'bold' }}>#{t.id}</td>
                  <td style={{ padding: 12 }}>{formatDateTime(t.created_at)}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                      {t.source_warehouse_name}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                      {t.destination_warehouse_name}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{t.total_quantity}</td>
                  <td style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>{t.created_by_user || 'N/A'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: 6, 
                      fontSize: 12, 
                      fontWeight: 600,
                      background: t.status === 'COMPLETED' ? '#dcfce7' : t.status === 'PENDING' ? '#fef9c3' : '#fee2e2',
                      color: t.status === 'COMPLETED' ? '#166534' : t.status === 'PENDING' ? '#854d0e' : '#991b1b'
                    }}>
                      {t.status === 'COMPLETED' ? 'COMPLETADO' : t.status === 'PENDING' ? 'PENDIENTE' : 'CANCELADO'}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {/* Placeholder for future view details action */}
                    <button className="icon-btn" title="Ver detalles">
                       <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="currentColor"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTransfers.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No se encontraron transferencias</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <label className="label">Almacén Origen</label>
              <select 
                className="input" 
                value={sourceId || ''} 
                onChange={e => {
                    setSourceId(Number(e.target.value))
                    setItems([]) // Clear items if source changes as stock differs
                }}
              >
                <option value="">Seleccionar...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Almacén Destino</label>
              <select 
                className="input" 
                value={destId || ''} 
                onChange={e => setDestId(Number(e.target.value))}
              >
                <option value="">Seleccionar...</option>
                {warehouses.filter(w => w.id !== sourceId).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Agregar Productos (Búsqueda en Origen)</label>
            <input 
              className="input"
              placeholder={sourceId ? "Buscar por nombre o SKU..." : "Seleccione almacén origen primero"}
              value={createSearchTerm}
              onChange={e => handleCreateSearchProducts(e.target.value)}
              disabled={!sourceId}
            />
            {loadingSearch && <div>Buscando...</div>}
            {createSearchResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto', marginTop: 5 }}>
                {createSearchResults.map(p => (
                  <div 
                    key={p.id} 
                    style={{ padding: 8, borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                    onClick={() => addItem(p)}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <span>{p.name}</span>
                    <span style={{ fontWeight: 'bold' }}>Stock: {p.stock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3>Items a Transferir</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Detalle (Lote/Serie)</th>
                  <th>Stock Origen</th>
                  <th>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.productId}-${index}`}>
                    <td>{item.name}</td>
                    <td>
                        {item.availableBatches && item.availableBatches.length > 0 && (
                            <select 
                                className="input small"
                                value={item.batchNo || ''}
                                onChange={e => {
                                    const batch = item.availableBatches?.find(b => b.batchNo === e.target.value)
                                    updateItemDetail(index, 'batchNo', e.target.value)
                                    // Update max qty based on batch
                                    if (batch) updateItemDetail(index, 'stockAtSource', batch.quantity)
                                }}
                            >
                                <option value="">Seleccionar Lote...</option>
                                {item.availableBatches.map((b: any) => (
                                    <option key={b.batchNo} value={b.batchNo}>{b.batchNo} (Exp: {b.expiryDate}) - Stock: {b.quantity}</option>
                                ))}
                            </select>
                        )}
                        
                        {item.availableImeis && item.availableImeis.length > 0 && (
                            <select 
                                className="input small"
                                value={item.imei || ''}
                                onChange={e => {
                                    updateItemDetail(index, 'imei', e.target.value)
                                    updateItemDetail(index, 'quantity', 1) // IMEI is always 1
                                    updateItemDetail(index, 'stockAtSource', 1)
                                }}
                            >
                                <option value="">Seleccionar IMEI...</option>
                                {item.availableImeis.map((i: string) => (
                                    <option key={i} value={i}>{i}</option>
                                ))}
                            </select>
                        )}

                        {item.availableSerials && item.availableSerials.length > 0 && (
                            <select 
                                className="input small"
                                value={item.serial || ''}
                                onChange={e => {
                                    updateItemDetail(index, 'serial', e.target.value)
                                    updateItemDetail(index, 'quantity', 1)
                                    updateItemDetail(index, 'stockAtSource', 1)
                                }}
                            >
                                <option value="">Seleccionar Serie...</option>
                                {item.availableSerials.map((s: string) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        )}

                    </td>
                    <td>{item.stockAtSource}</td>
                    <td>
                      <input 
                        type="number" 
                        min="1" 
                        max={item.stockAtSource}
                        value={item.quantity} 
                        onChange={e => {
                            const val = parseInt(e.target.value) || 0
                            if (val > item.stockAtSource) {
                                alert(`Stock insuficiente. Máximo ${item.stockAtSource}`)
                                updateItemDetail(index, 'quantity', item.stockAtSource)
                            } else {
                                updateItemDetail(index, 'quantity', val)
                            }
                        }}
                        disabled={!!item.imei || !!item.serial} // Locked for IMEI/Serial
                        style={{ width: 80, padding: 4 }}
                      />
                    </td>
                    <td>
                      <button className="btn-danger small" onClick={() => {
                          setItems(prev => prev.filter((_, i) => i !== index))
                      }}>X</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Agregue productos a la lista</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Notas / Observaciones</label>
            <textarea 
              className="input" 
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={() => setView('list')}>Cancelar</button>
            <button 
                className="btn-primary" 
                onClick={handleSubmit}
                disabled={!sourceId || !destId || items.length === 0}
            >
                Confirmar Transferencia
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
