import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import { formatDateTime } from '../utils/date'
import MobileBarcodeScannerButton from '../components/MobileBarcodeScannerButton'

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
  productCode?: string
  description?: string
  productType?: string
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

interface ProductBatchOption {
  batchNo: string
  expiryDate?: string
  quantity: number
}

interface ProductDetailResponse {
  id: number
  name: string
  sku?: string
  productCode?: string
  description?: string
  productType?: string
  stock: number
  batches?: ProductBatchOption[]
  imeis?: string[]
  serials?: string[]
}

interface TrackedProductSelection {
  product: Product
  productType: 'IMEI' | 'SERIAL'
  availableImeis: string[]
  availableSerials: string[]
  selectedImeis: string[]
  selectedSerials: string[]
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
  const [loadingProductId, setLoadingProductId] = useState<number | null>(null)
  
  // Create Form Product Search
  const [createSearchTerm, setCreateSearchTerm] = useState('')
  const [createSearchResults, setCreateSearchResults] = useState<Product[]>([])
  const [trackedSelection, setTrackedSelection] = useState<TrackedProductSelection | null>(null)

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
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN'
  const userWarehouseId = user?.warehouseId ? Number(user.warehouseId) : null
  const filterWarehouses = isAdmin
    ? warehouses
    : warehouses.filter(w => w.id === userWarehouseId)
  const sourceWarehouse = warehouses.find(w => w.id === userWarehouseId) || null
  const destinationWarehouses = warehouses.filter(w => w.id !== sourceId)
  const selectedImeisInItems = items
    .map(item => item.imei)
    .filter((value): value is string => Boolean(value))
  const selectedSerialsInItems = items
    .map(item => item.serial)
    .filter((value): value is string => Boolean(value))
  const availableTrackedImeis = trackedSelection
    ? trackedSelection.availableImeis.filter(imei => !selectedImeisInItems.includes(imei))
    : []
  const availableTrackedSerials = trackedSelection
    ? trackedSelection.availableSerials.filter(serial => !selectedSerialsInItems.includes(serial))
    : []

  useEffect(() => {
    loadWarehouses()
    loadTransfers()
  }, [])

  useEffect(() => {
    if (!isAdmin && userWarehouseId) {
      setSourceId(userWarehouseId)
    }
  }, [isAdmin, userWarehouseId])

  const resetCreateProductSearch = () => {
    setCreateSearchTerm('')
    setCreateSearchResults([])
    setTrackedSelection(null)
    setLoadingProductId(null)
  }

  const fetchProductDetail = async (productId: number) => {
    if (!sourceId) return null
    const res = await api.get(`/products/${productId}`, { params: { warehouseId: sourceId } })
    return res.data as ProductDetailResponse
  }

  const refreshItemAvailability = async (productId: number) => {
    const detail = await fetchProductDetail(productId)
    if (!detail) return null

    setItems(prev => prev.map(item => {
      if (item.productId !== productId) return item

      const nextImeis = Array.isArray(detail.imeis) ? detail.imeis : []
      const nextSerials = Array.isArray(detail.serials) ? detail.serials : []
      const nextBatches = Array.isArray(detail.batches) ? detail.batches : []
      const selectedBatch = nextBatches.find(batch => batch.batchNo === item.batchNo)

      return {
        ...item,
        availableImeis: nextImeis,
        availableSerials: nextSerials,
        availableBatches: nextBatches,
        imei: item.imei && !nextImeis.includes(item.imei) ? '' : item.imei,
        serial: item.serial && !nextSerials.includes(item.serial) ? '' : item.serial,
        batchNo: item.batchNo && !nextBatches.some(batch => batch.batchNo === item.batchNo) ? '' : item.batchNo,
        stockAtSource: selectedBatch ? selectedBatch.quantity : Number(detail.stock || item.stockAtSource || 0)
      }
    }))

    if (trackedSelection?.product.id === productId) {
      setTrackedSelection(prev => prev ? {
        ...prev,
        availableImeis: Array.isArray(detail.imeis) ? detail.imeis : [],
        availableSerials: Array.isArray(detail.serials) ? detail.serials : [],
        selectedImeis: prev.selectedImeis.filter(imei => Array.isArray(detail.imeis) && detail.imeis.includes(imei)),
        selectedSerials: prev.selectedSerials.filter(serial => Array.isArray(detail.serials) && detail.serials.includes(serial))
      } : prev)
    }

    return detail
  }

  const addNormalProductItem = (product: Product, detail: ProductDetailResponse) => {
    setItems(prev => [
      ...prev,
      {
        productId: product.id,
        name: product.name,
        quantity: 1,
        stockAtSource: Number(product.stock || 0),
        availableBatches: detail.batches || [],
        availableImeis: detail.imeis || [],
        availableSerials: detail.serials || []
      }
    ])
    resetCreateProductSearch()
  }

  const addTrackedItems = () => {
    if (!trackedSelection) return

    const selectedValues = trackedSelection.productType === 'IMEI'
      ? trackedSelection.selectedImeis
      : trackedSelection.selectedSerials

    if (selectedValues.length === 0) {
      return alert(`Seleccione al menos un ${trackedSelection.productType === 'IMEI' ? 'IMEI' : 'serie'}`)
    }

    setItems(prev => [
      ...prev,
      ...selectedValues.map(value => ({
        productId: trackedSelection.product.id,
        name: trackedSelection.product.name,
        quantity: 1,
        stockAtSource: 1,
        imei: trackedSelection.productType === 'IMEI' ? value : undefined,
        serial: trackedSelection.productType === 'SERIAL' ? value : undefined,
        availableImeis: trackedSelection.availableImeis,
        availableSerials: trackedSelection.availableSerials
      }))
    ])

    resetCreateProductSearch()
  }

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/warehouses', { params: { mode: 'transfer' } })
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
    setTrackedSelection(null)
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
      const res = await api.get('/products', { 
          params: { 
              search: term, 
              warehouseId: sourceId 
          } 
      })
      const filtered = (res.data as Product[]).filter((p: Product) => Number(p.stock || 0) > 0)
      setCreateSearchResults(filtered)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSearch(false)
    }
  }

  const addItem = async (product: Product) => {
    if (!sourceId) return

    setLoadingProductId(product.id)
    try {
      const productDetail = await fetchProductDetail(product.id)
      if (!productDetail) {
        return
      }
      const productType = String(productDetail.productType || product.productType || 'GENERAL').toUpperCase()

      if (productType === 'IMEI') {
        setTrackedSelection({
          product,
          productType: 'IMEI',
          availableImeis: productDetail.imeis || [],
          availableSerials: [],
          selectedImeis: [],
          selectedSerials: []
        })
        return
      }

      if (productType === 'SERIAL') {
        setTrackedSelection({
          product,
          productType: 'SERIAL',
          availableImeis: [],
          availableSerials: productDetail.serials || [],
          selectedImeis: [],
          selectedSerials: []
        })
        return
      }

      addNormalProductItem(product, productDetail)
    } catch (err) {
      console.error(err)
      alert('Error al cargar detalles del producto')
    } finally {
      setLoadingProductId(null)
    }
  }

  const updateItemDetail = (index: number, field: string, value: any) => {
      setItems(prev => prev.map((item, i) => {
          if (i === index) {
              return { ...item, [field]: value }
          }
          return item
      }))
  }

  const toggleTrackedValue = (value: string) => {
    if (!trackedSelection) return

    if (trackedSelection.productType === 'IMEI') {
      setTrackedSelection(prev => prev ? {
        ...prev,
        selectedImeis: prev.selectedImeis.includes(value)
          ? prev.selectedImeis.filter(current => current !== value)
          : [...prev.selectedImeis, value]
      } : prev)
      return
    }

    setTrackedSelection(prev => prev ? {
      ...prev,
      selectedSerials: prev.selectedSerials.includes(value)
        ? prev.selectedSerials.filter(current => current !== value)
        : [...prev.selectedSerials, value]
    } : prev)
  }

  const handleSubmit = async () => {
    if (!sourceId || !destId) return alert('Seleccione almacenes')
    if (sourceId === destId) return alert('Almacenes deben ser distintos')
    if (items.length === 0) return alert('Agregue productos')
    if (!isAdmin && userWarehouseId && sourceId !== userWarehouseId) {
      return alert('Solo puedes transferir desde tu tienda asignada')
    }
    
    // Validate selections
    const selectedImeis = items.map(item => item.imei).filter((value): value is string => Boolean(value))
    const selectedSerials = items.map(item => item.serial).filter((value): value is string => Boolean(value))
    if (new Set(selectedImeis).size !== selectedImeis.length) {
      return alert('Hay IMEIs repetidos en la transferencia')
    }
    if (new Set(selectedSerials).size !== selectedSerials.length) {
      return alert('Hay series repetidas en la transferencia')
    }
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
      const uniqueProductIds = [...new Set(items.map(item => item.productId))]
      for (const productId of uniqueProductIds) {
        const freshDetail = await refreshItemAvailability(productId)
        if (!freshDetail) {
          return alert('No se pudo validar disponibilidad actual del producto')
        }
      }

      for (const item of items) {
        if (item.imei) {
          const freshDetail = await fetchProductDetail(item.productId)
          const latestImeis = Array.isArray(freshDetail?.imeis) ? freshDetail.imeis : []
          if (!latestImeis.includes(item.imei)) {
            return alert(`El IMEI ${item.imei} ya no está disponible para transferir`)
          }
        }
        if (item.serial) {
          const freshDetail = await fetchProductDetail(item.productId)
          const latestSerials = Array.isArray(freshDetail?.serials) ? freshDetail.serials : []
          if (!latestSerials.includes(item.serial)) {
            return alert(`La serie ${item.serial} ya no está disponible para transferir`)
          }
        }
      }

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
      setSourceId(isAdmin ? null : userWarehouseId)
      setDestId(null)
      setItems([])
      setNotes('')
      resetCreateProductSearch()
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
              <option value="">{isAdmin ? 'Todos los almacenes' : 'Mis transferencias'}</option>
              {filterWarehouses.map(w => (
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
              {isAdmin ? (
                <select 
                  className="input" 
                  value={sourceId || ''} 
                  onChange={e => {
                      setSourceId(Number(e.target.value))
                      setItems([])
                      resetCreateProductSearch()
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              ) : (
                <div
                  className="input"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 42,
                    background: 'var(--bg)',
                    color: 'var(--text)'
                  }}
                >
                  {sourceWarehouse?.name || user?.warehouseName || 'Sin tienda asignada'}
                </div>
              )}
            </div>
            <div>
              <label className="label">Almacén Destino</label>
              <select 
                className="input" 
                value={destId || ''} 
                onChange={e => setDestId(Number(e.target.value))}
              >
                <option value="">Seleccionar...</option>
                {destinationWarehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Agregar Productos (Búsqueda en Origen)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                className="input"
                placeholder={sourceId ? "Buscar por código, nombre, SKU o descripción..." : "Seleccione almacén origen primero"}
                value={createSearchTerm}
                onChange={e => handleCreateSearchProducts(e.target.value)}
                disabled={!sourceId}
                style={{ flex: '1 1 320px' }}
              />
              <MobileBarcodeScannerButton
                buttonLabel="Escanear"
                modalTitle="Escanear producto para transferencia"
                disabled={!sourceId}
                onDetected={value => void handleCreateSearchProducts(value)}
              />
            </div>
            {loadingSearch && <div>Buscando...</div>}
            {createSearchResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto', marginTop: 5 }}>
                {createSearchResults.map(p => (
                  <div 
                    key={p.id} 
                    style={{ padding: 8, borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}
                    onClick={() => void addItem(p)}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {[p.productCode ? `COD: ${p.productCode}` : '', p.sku ? `SKU: ${p.sku}` : '']
                          .filter(Boolean)
                          .join(' | ') || 'Sin código'}
                      </div>
                      {p.description && (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.description}</div>
                      )}
                    </div>
                    <span style={{ fontWeight: 'bold' }}>Stock: {p.stock}</span>
                  </div>
                ))}
              </div>
            )}
            {createSearchTerm.length >= 2 && !loadingSearch && createSearchResults.length === 0 && (
              <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
                No se encontraron productos con stock disponible para esa búsqueda.
              </div>
            )}
            {trackedSelection && (
              <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--card, var(--panel, transparent))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      Seleccionar {trackedSelection.productType === 'IMEI' ? 'IMEIs' : 'series'} para {trackedSelection.product.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Elija varios {trackedSelection.productType === 'IMEI' ? 'IMEIs' : 'series'} disponibles y agréguelos en una sola vez.
                    </div>
                  </div>
                  <button className="btn-secondary" type="button" onClick={resetCreateProductSearch}>
                    Cerrar
                  </button>
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {trackedSelection.productType === 'IMEI' && availableTrackedImeis.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      No hay IMEIs disponibles para agregar o ya fueron seleccionados en la transferencia.
                    </div>
                  )}
                  {trackedSelection.productType === 'SERIAL' && availableTrackedSerials.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      No hay series disponibles para agregar o ya fueron seleccionadas en la transferencia.
                    </div>
                  )}

                  {trackedSelection.productType === 'IMEI' && availableTrackedImeis.map(imei => (
                    <label key={imei} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={trackedSelection.selectedImeis.includes(imei)}
                        onChange={() => toggleTrackedValue(imei)}
                      />
                      <span>{imei}</span>
                    </label>
                  ))}

                  {trackedSelection.productType === 'SERIAL' && availableTrackedSerials.map(serial => (
                    <label key={serial} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={trackedSelection.selectedSerials.includes(serial)}
                        onChange={() => toggleTrackedValue(serial)}
                      />
                      <span>{serial}</span>
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Seleccionados: {trackedSelection.productType === 'IMEI' ? trackedSelection.selectedImeis.length : trackedSelection.selectedSerials.length}
                  </div>
                  <button className="btn-primary" type="button" onClick={addTrackedItems}>
                    Agregar seleccionados
                  </button>
                </div>
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
                    <td>
                      <div>{item.name}</div>
                      {item.imei && <div style={{ fontSize: 12, color: 'var(--muted)' }}>IMEI: {item.imei}</div>}
                      {item.serial && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Serie: {item.serial}</div>}
                    </td>
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
                                onClick={e => e.stopPropagation()}
                                onFocus={() => { void refreshItemAvailability(item.productId) }}
                                onChange={e => {
                                    updateItemDetail(index, 'imei', e.target.value)
                                    updateItemDetail(index, 'quantity', 1) // IMEI is always 1
                                    updateItemDetail(index, 'stockAtSource', 1)
                                }}
                            >
                                <option value="">Seleccionar IMEI...</option>
                                {item.availableImeis
                                  .filter((i: string) => !items.some((other, otherIdx) => otherIdx !== index && other.imei === i))
                                  .map((i: string) => (
                                    <option key={i} value={i}>{i}</option>
                                  ))}
                            </select>
                        )}

                        {item.availableSerials && item.availableSerials.length > 0 && (
                            <select 
                                className="input small"
                                value={item.serial || ''}
                                onClick={e => e.stopPropagation()}
                                onFocus={() => { void refreshItemAvailability(item.productId) }}
                                onChange={e => {
                                    updateItemDetail(index, 'serial', e.target.value)
                                    updateItemDetail(index, 'quantity', 1)
                                    updateItemDetail(index, 'stockAtSource', 1)
                                }}
                            >
                                <option value="">Seleccionar Serie...</option>
                                {item.availableSerials
                                  .filter((s: string) => !items.some((other, otherIdx) => otherIdx !== index && other.serial === s))
                                  .map((s: string) => (
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
                disabled={!sourceId || !destId || items.length === 0 || (!isAdmin && !userWarehouseId)}
            >
                Confirmar Transferencia
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
