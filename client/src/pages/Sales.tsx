import { useState, useEffect, useRef } from 'react'
import { getSales, getSaleDetails, cancelSale } from '../api'
import { useConfigStore } from '../store/config'
import { formatDate, formatDateTime } from '../utils/date'
import jsPDF from 'jspdf'

interface Sale {
  id: number
  doc_no: string
  total: number
  created_at: string
  payment_method: string
  customer_name?: string
  received_amount?: number
  change_amount?: number
  reference_number?: string
  is_credit?: number
  credit_fully_paid?: number
  status?: string
  cancellation_reason?: string
}

interface SaleItem {
  id: number
  product_name: string
  sku?: string
  quantity: number
  unit_price: number
  total: number
}

interface SaleDetail extends Sale {
  items: SaleItem[]
  customer_document?: string
  customer_address?: string
  customer_phone?: string
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 })
  const [search, setSearch] = useState('')
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const config = useConfigStore(s => s.config)

  useEffect(() => {
    loadSales()
  }, [pagination.offset, search])

  const loadSales = async () => {
    setLoading(true)
    try {
      const res = await getSales({
        limit: pagination.limit,
        offset: pagination.offset,
        search
      })
      // The API I wrote uses offset directly
      setSales(res.data)
      setPagination(prev => ({ ...prev, total: res.pagination.total }))
    } catch (err) {
      console.error('Error loading sales:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPagination(prev => ({ ...prev, offset: 0 }))
    loadSales()
  }

  const handleViewDetails = async (saleId: number) => {
    setDetailLoading(true)
    setIsModalOpen(true)
    try {
      const data = await getSaleDetails(saleId)
      setSelectedSale(data)
    } catch (err) {
      console.error('Error details:', err)
      alert('Error cargando detalles')
      setIsModalOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCancelClick = (sale: Sale) => {
    setSaleToCancel(sale)
    setCancelReason('')
    setIsCancelModalOpen(true)
  }

  const confirmCancel = async () => {
    if (!saleToCancel || !cancelReason.trim()) return
    try {
      await cancelSale(saleToCancel.id, cancelReason)
      setIsCancelModalOpen(false)
      setSaleToCancel(null)
      loadSales()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al cancelar venta')
    }
  }

  const generateTicket = (sale: SaleDetail) => {
     // Calcular altura dinámica
     const headerHeight = 40
     const itemHeight = 5
     const footerHeight = 40
     const totalHeight = headerHeight + (sale.items.length * itemHeight) + footerHeight
     
     const doc = new jsPDF({
       orientation: 'portrait',
       unit: 'mm',
       format: [80, Math.max(200, totalHeight)]
     })
 
     doc.setFontSize(10)
     doc.text(config?.name || 'DTMPos', 40, 5, { align: 'center' })
     doc.setFontSize(8)
     doc.text(`Fecha: ${formatDateTime(sale.created_at)}`, 5, 15)
     doc.text(`Venta #${sale.id}`, 5, 20)
     
     if (sale.customer_name) {
       doc.text(`Cliente: ${sale.customer_name}`, 5, 25)
     }
 
     doc.line(5, 30, 75, 30)
     
     let y = 35
     sale.items.forEach(item => {
       const lineTotal = item.unit_price * item.quantity
       doc.text(`${item.product_name.substring(0, 20)}`, 5, y)
       doc.text(`${item.quantity} x ${Number(item.unit_price).toFixed(2)}`, 50, y, { align: 'right' })
       doc.text(`${Number(lineTotal).toFixed(2)}`, 75, y, { align: 'right' })
       y += 5
     })
 
     doc.line(5, y, 75, y)
     y += 5
     doc.setFontSize(10)
     doc.text(`TOTAL: ${config?.currency} ${Number(sale.total).toFixed(2)}`, 75, y, { align: 'right' })
     
     y += 5
     doc.setFontSize(8)
     
    if (sale.payment_method === 'CASH') {
        doc.text(`Efectivo: ${Number(sale.received_amount || 0).toFixed(2)}`, 5, y)
        y += 4
        doc.text(`Cambio: ${Number(sale.change_amount || 0).toFixed(2)}`, 5, y)
    } else if (sale.payment_method === 'CARD') {
        doc.text(`Tarjeta Ref: ${sale.reference_number || ''}`, 5, y)
    } else if (sale.payment_method === 'DEPOSIT') {
        doc.text(`Depósito Ref: ${sale.reference_number || ''}`, 5, y)
    } else if (sale.payment_method === 'CREDIT' || sale.is_credit) {
        doc.text(`Venta a Crédito`, 5, y)
    }
 
     // Imprimir
     const blob = doc.output('blob')
     const blobUrl = URL.createObjectURL(blob)
     
     if (iframeRef.current) {
       iframeRef.current.src = blobUrl
       iframeRef.current.onload = () => {
         if (iframeRef.current?.contentWindow) {
           iframeRef.current.contentWindow.print()
         }
       }
     } else {
       window.open(blobUrl, '_blank')
     }
   }

  const totalPages = Math.ceil(pagination.total / pagination.limit)
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1

  return (
    <div style={{ padding: 20 }}>
      <iframe 
        ref={iframeRef} 
        style={{ 
          position: 'absolute', 
          width: '0px', 
          height: '0px', 
          border: 'none',
          visibility: 'hidden'
        }} 
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Historial de Ventas</h2>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
          <input 
            type="text" 
            placeholder="Buscar por Doc / Cliente / ID" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'inherit', minWidth: 250 }}
          />
          <button type="submit" className="primary-btn">Buscar</button>
        </form>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--modal)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: 12, textAlign: 'left' }}>ID</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Fecha</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Cliente</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Método</th>
              <th style={{ padding: 12, textAlign: 'center' }}>Estado</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Total</th>
              <th style={{ padding: 12, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Cargando...</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No se encontraron ventas</td></tr>
            ) : (
              sales.map(sale => (
                <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12 }}>#{sale.id}</td>
                  <td style={{ padding: 12 }}>{formatDateTime(sale.created_at)}</td>
                  <td style={{ padding: 12 }}>{sale.customer_name || 'General'}</td>
                  <td style={{ padding: 12 }}>
                    {sale.payment_method === 'CASH' && 'Efectivo'}
                    {sale.payment_method === 'CARD' && 'Tarjeta'}
                    {sale.payment_method === 'DEPOSIT' && 'Depósito'}
                    {(sale.payment_method === 'CREDIT' || sale.is_credit) && 'Crédito'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {sale.status === 'CANCELLED' ? (
                        <span style={{ 
                            backgroundColor: 'rgba(231, 76, 60, 0.2)', 
                            color: '#e74c3c', 
                            padding: '4px 8px', 
                            borderRadius: 12, 
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: '1px solid rgba(231, 76, 60, 0.3)'
                        }}>
                            CANCELADO
                        </span>
                    ) : (sale.payment_method === 'CREDIT' || sale.is_credit) && !sale.credit_fully_paid ? (
                        <span style={{ 
                            backgroundColor: 'rgba(231, 76, 60, 0.2)', 
                            color: '#e74c3c', 
                            padding: '4px 8px', 
                            borderRadius: 12, 
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: '1px solid rgba(231, 76, 60, 0.3)'
                        }}>
                            PENDIENTE
                        </span>
                    ) : (
                        <span style={{ 
                            backgroundColor: 'rgba(46, 204, 113, 0.2)', 
                            color: '#2ecc71', 
                            padding: '4px 8px', 
                            borderRadius: 12, 
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: '1px solid rgba(46, 204, 113, 0.3)'
                        }}>
                            PAGADO
                        </span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                    {config?.currency} {Number(sale.total).toFixed(2)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', display: 'flex', gap: 5, justifyContent: 'center' }}>
                    <button 
                      onClick={() => handleViewDetails(sale.id)}
                      className="icon-btn primary"
                      title="Ver detalles"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
                    </button>
                    {sale.status !== 'CANCELLED' && (
                        <button
                        onClick={() => handleCancelClick(sale)}
                        className="icon-btn danger"
                        title="Cancelar venta"
                        >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
        <button 
          className="icon-btn"
          disabled={pagination.offset === 0}
          onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset - prev.limit }))}
          style={{ opacity: pagination.offset === 0 ? 0.5 : 1 }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/></svg>
        </button>
        <span style={{ color: 'var(--muted)' }}>Página {currentPage} de {totalPages || 1}</span>
        <button 
          className="icon-btn"
          disabled={pagination.offset + pagination.limit >= pagination.total}
          onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
          style={{ opacity: (pagination.offset + pagination.limit >= pagination.total) ? 0.5 : 1 }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>
        </button>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Detalle de Venta #{selectedSale?.id}</h3>
              <button onClick={() => setIsModalOpen(false)} className="icon-btn" title="Cerrar">
                <svg viewBox="0 0 24 24" width="20" height="20"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {detailLoading || !selectedSale ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Cargando detalles...</p>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, background: 'var(--bg)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>Fecha</strong>
                    {formatDate(selectedSale.created_at)}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>Cliente</strong>
                    {selectedSale.customer_name || 'General'}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>Método Pago</strong>
                    {selectedSale.payment_method === 'CASH' && 'Efectivo'}
                    {selectedSale.payment_method === 'CARD' && 'Tarjeta'}
                    {selectedSale.payment_method === 'DEPOSIT' && 'Depósito'}
                    {(selectedSale.payment_method === 'CREDIT' || selectedSale.is_credit) && 'Crédito'}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>Total</strong>
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{config?.currency} {Number(selectedSale.total).toFixed(2)}</span>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Estado</strong>
                    {selectedSale.status === 'CANCELLED' ? (
                        <div>
                            <span style={{ color: '#e74c3c', fontWeight: 600 }}>CANCELADO</span>
                            {selectedSale.cancellation_reason && (
                                <div style={{ marginTop: 8, padding: 8, background: 'rgba(231, 76, 60, 0.1)', borderRadius: 6, border: '1px solid rgba(231, 76, 60, 0.2)' }}>
                                    <strong style={{ fontSize: 12, color: '#c0392b', display: 'block' }}>Motivo:</strong>
                                    <span style={{ fontSize: 13, color: '#c0392b' }}>{selectedSale.cancellation_reason}</span>
                                </div>
                            )}
                        </div>
                    ) : (selectedSale.payment_method === 'CREDIT' || selectedSale.is_credit) && !selectedSale.credit_fully_paid ? (
                        <span style={{ color: '#e74c3c', fontWeight: 600 }}>PENDIENTE DE PAGO</span>
                    ) : (
                        <span style={{ color: '#2ecc71', fontWeight: 600 }}>PAGADO</span>
                    )}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13 }}>Producto</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13 }}>Cant.</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13 }}>Precio</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 16px' }}>{item.product_name}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>{item.quantity}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(item.unit_price).toFixed(2)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                   <button 
                     onClick={() => setIsModalOpen(false)}
                     style={{ 
                       padding: '8px 16px', 
                       background: 'transparent', 
                       color: 'inherit', 
                       border: '1px solid var(--border)', 
                       borderRadius: 6, 
                       cursor: 'pointer' 
                     }}
                   >
                     Cerrar
                   </button>
                   <button 
                     onClick={() => generateTicket(selectedSale)}
                     className="primary-btn"
                     style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                   >
                     <span>🖨️</span> Reimprimir Ticket
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isCancelModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'var(--modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 500, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginTop: 0 }}>Cancelar Venta #{saleToCancel?.id}</h3>
            <p style={{ color: 'var(--muted)' }}>¿Está seguro de que desea cancelar esta venta? Esta acción restaurará el stock y no se puede deshacer.</p>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>Motivo de cancelación:</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minHeight: 80 }}
                placeholder="Especifique el motivo..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button 
                onClick={() => setIsCancelModalOpen(false)}
                className="secondary-btn"
              >
                Cerrar
              </button>
              <button 
                onClick={confirmCancel}
                className="danger-btn"
                disabled={!cancelReason.trim()}
              >
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
