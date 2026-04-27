import { useState, useEffect, type FormEvent } from 'react'
import { 
  api,
  getCashStatus, 
  openCashRegister, 
  closeCashRegister, 
  getCashSummary, 
  addCashMovement, 
  getCashMovements 
} from '../api'
import { useAuthStore } from '../store/auth'
import { formatDateTime } from '../utils/date'

export default function CashRegister() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [movements, setMovements] = useState<any[]>([])
  const [users, setUsers] = useState<Array<{ id: number; name: string; role_name?: string }>>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  
  // Forms
  const [openingAmount, setOpeningAmount] = useState('')
  const [notes, setNotes] = useState('')
  
  // Modals
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDesc, setMovementDesc] = useState('')
  
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingAmount, setClosingAmount] = useState('')
  const [closeResult, setCloseResult] = useState<any>(null)
  const selectedUser = users.find(u => u.id === (selectedUserId || user?.id))
  const isOwnCash = !selectedUserId || selectedUserId === user?.id
  const cashParams = isAdmin && selectedUserId && selectedUserId !== user?.id ? { userId: selectedUserId } : undefined

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    } else if (user?.id) {
      setSelectedUserId(user.id)
    }
  }, [isAdmin, user?.id])

  useEffect(() => {
    if (!selectedUserId && user?.id) return
    setCloseResult(null)
    fetchStatus()
  }, [selectedUserId, user?.id])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchStatus(false)
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [selectedUserId, user?.id])

  useEffect(() => {
    if (!isOpen) return
    const id = window.setInterval(() => {
      fetchDetails()
    }, 15000)
    return () => window.clearInterval(id)
  }, [isOpen, selectedUserId, user?.id])

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users')
      const list = Array.isArray(data) ? data : []
      setUsers(list)
      setSelectedUserId(current => current || user?.id || list[0]?.id || null)
    } catch (err) {
      console.error(err)
      if (user?.id) setSelectedUserId(user.id)
    }
  }

  const fetchStatus = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    try {
      const status = await getCashStatus(cashParams)
      setIsOpen(status.isOpen)
      if (status.isOpen) {
        await fetchDetails()
      } else {
        setSummary(null)
        setMovements([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  const fetchDetails = async () => {
    try {
      const [sum, movs] = await Promise.all([
        getCashSummary(cashParams),
        getCashMovements(cashParams)
      ])
      setSummary(sum)
      setMovements(movs)
    } catch (err) {
      console.error(err)
    }
  }

  const handleOpenRegister = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await openCashRegister({ 
        openingAmount: Number(openingAmount), 
        notes 
      })
      await fetchStatus()
      setOpeningAmount('')
      setNotes('')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al abrir caja')
    }
  }

  const handleAddMovement = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await addCashMovement({
        type: movementType,
        amount: Number(movementAmount),
        description: movementDesc
      })
      setShowMovementModal(false)
      setMovementAmount('')
      setMovementDesc('')
      await fetchDetails()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al registrar movimiento')
    }
  }

  const handleCloseRegister = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await closeCashRegister({
        closingAmount: Number(closingAmount),
        notes
      })
      setCloseResult(res)
      setIsOpen(false)
      setShowCloseModal(false)
      setClosingAmount('')
      setNotes('')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al cerrar caja')
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Cargando estado de caja...</div>

  // Vista: Caja Cerrada -> Formulario Apertura
  if (!isOpen && !closeResult) {
    return (
      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        <div className="card">
          <h2>{isOwnCash ? 'Apertura de Caja' : 'Caja sin apertura activa'}</h2>
          {isAdmin && users.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 5 }}>Usuario a supervisar</label>
              <select
                value={selectedUserId || user?.id || ''}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
                style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--modal)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}{u.role_name ? ` (${u.role_name})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {isOwnCash ? (
            <>
              <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
                Hola, <strong>{user?.name}</strong>. No tienes una caja abierta actualmente.
              </p>
              <form onSubmit={handleOpenRegister}>
                <div style={{ marginBottom: 15 }}>
                  <label style={{ display: 'block', marginBottom: 5 }}>Monto Inicial (Base)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={openingAmount}
                    onChange={e => setOpeningAmount(e.target.value)}
                    style={{ width: '100%', padding: 10, fontSize: '1.2rem' }}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div style={{ marginBottom: 15 }}>
                  <label style={{ display: 'block', marginBottom: 5 }}>Notas (Opcional)</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{ width: '100%', padding: 10 }}
                    rows={3}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', padding: 12 }}>
                  Abrir Caja
                </button>
              </form>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
              {selectedUser?.name || 'Este usuario'} no tiene una caja abierta en este momento. Puedes cambiar de usuario para supervisar otra caja.
            </div>
          )}
        </div>
      </div>
    )
  }

  // Vista: Resultado Cierre
  if (closeResult) {
    return (
      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Caja Cerrada Correctamente</h2>
          <div style={{ margin: '20px 0', textAlign: 'left', background: 'var(--bg)', padding: 15, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>Esperado por Sistema:</span>
              <strong>{closeResult.expected.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>Monto Real (Conteo):</span>
              <strong>{(closeResult.expected + closeResult.difference).toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', color: closeResult.difference === 0 ? 'green' : 'red' }}>
              <span>Diferencia:</span>
              <strong>{closeResult.difference > 0 ? '+' : ''}{closeResult.difference.toFixed(2)}</strong>
            </div>
          </div>
          <button onClick={() => setCloseResult(null)} className="btn-primary">
            Volver (Abrir Nueva Caja)
          </button>
        </div>
      </div>
    )
  }

  // Vista: Dashboard Caja Abierta
  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      {isAdmin && users.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: isOwnCash ? undefined : 'rgba(59, 130, 246, 0.08)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Modo Supervisión</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {isOwnCash ? 'Estás viendo tu caja activa.' : `Estás viendo la caja activa de ${selectedUser?.name || 'otro usuario'}.`}
              </div>
            </div>
            <select
              value={selectedUserId || user?.id || ''}
              onChange={(e) => setSelectedUserId(Number(e.target.value))}
              style={{ minWidth: 240, padding: 10, borderRadius: 8, background: 'var(--modal)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.role_name ? ` (${u.role_name})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Control de Caja</h2>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Abierta el: {summary ? formatDateTime(new Date(summary.openingTime)) : ''}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Responsable: {isOwnCash ? `${user?.name} (${user?.role})` : (selectedUser?.name || '-')}
          </div>
        </div>
        {isOwnCash ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              className="btn-secondary"
              onClick={() => {
                  setMovementType('IN')
                  setShowMovementModal(true)
              }}
            >
              + Entrada
            </button>
            <button 
              className="btn-secondary"
              onClick={() => {
                  setMovementType('OUT')
                  setShowMovementModal(true)
              }}
            >
              - Salida
            </button>
            <button 
              className="btn-danger"
              onClick={() => setShowCloseModal(true)}
            >
              Cerrar Caja
            </button>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(59, 130, 246, 0.08)', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Supervisando en modo lectura
          </div>
        )}
      </div>

      {/* Cards Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 15, marginBottom: 20 }}>
        <StatCard title="Saldo Inicial" value={summary?.openingAmount} color="#64748b" />
        <StatCard title="Ventas (Efectivo)" value={summary?.salesCash} color="#22c55e" />
        <StatCard title="Entradas Extra" value={summary?.movementsIn} color="#3b82f6" />
        <StatCard title="Salidas / Gastos" value={summary?.movementsOut} color="#ef4444" negative />
        <StatCard title="Total Esperado" value={summary?.expectedCash} color="#eab308" highlight />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Ventas por Método */}
        <div className="card">
          <h3>Ventas por Método</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {summary && Object.entries(summary.salesByMethod).map(([method, total]: any) => (
                <tr key={method} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{translateMethod(method)}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{Number(total).toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td style={{ padding: 8 }}>Total Ventas</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{summary?.totalSales.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Movimientos Recientes */}
        <div className="card">
          <h3>Movimientos de Efectivo</h3>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {movements.length === 0 ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Sin movimientos</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', fontSize: '0.85rem' }}>
                            <th style={{ padding: 5 }}>Hora</th>
                            <th style={{ padding: 5 }}>Tipo</th>
                            <th style={{ padding: 5 }}>Desc.</th>
                            <th style={{ padding: 5, textAlign: 'right' }}>Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {movements.map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: 5, fontSize: '0.85rem' }}>{formatDateTime(new Date(m.created_at)).split(' ')[1]}</td>
                                <td style={{ padding: 5 }}>
                                    <span style={{ 
                                        padding: '2px 6px', 
                                        borderRadius: 4, 
                                        background: m.type === 'IN' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: m.type === 'IN' ? '#22c55e' : '#ef4444',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {m.type === 'IN' ? 'ENTRADA' : 'SALIDA'}
                                    </span>
                                </td>
                                <td style={{ padding: 5, fontSize: '0.9rem' }}>{m.description}</td>
                                <td style={{ padding: 5, textAlign: 'right', fontWeight: 600 }}>{Number(m.amount).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal Movimiento */}
      {showMovementModal && (
        <Modal onClose={() => setShowMovementModal(false)} title={`Registrar ${movementType === 'IN' ? 'Entrada' : 'Salida'}`}>
          <form onSubmit={handleAddMovement}>
             <div style={{ marginBottom: 15 }}>
                <label>Monto</label>
                <input 
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    value={movementAmount}
                    onChange={e => setMovementAmount(e.target.value)}
                    style={{ width: '100%', padding: 10, fontSize: '1.2rem' }}
                    autoFocus
                    required
                />
             </div>
             <div style={{ marginBottom: 15 }}>
                <label>Descripción / Motivo</label>
                <input 
                    type="text" 
                    value={movementDesc}
                    onChange={e => setMovementDesc(e.target.value)}
                    style={{ width: '100%', padding: 10 }}
                    placeholder="Ej. Pago de luz, Cambio inicial..."
                    required
                />
             </div>
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setShowMovementModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Registrar</button>
             </div>
          </form>
        </Modal>
      )}

      {/* Modal Cierre */}
      {showCloseModal && (
        <Modal onClose={() => setShowCloseModal(false)} title="Cierre de Caja">
           <div style={{ marginBottom: 20, padding: 15, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Total Esperado en Sistema</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{summary?.expectedCash.toFixed(2)}</div>
           </div>
           <form onSubmit={handleCloseRegister}>
             <div style={{ marginBottom: 15 }}>
                <label>Monto Real (Conteo Físico)</label>
                <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={closingAmount}
                    onChange={e => setClosingAmount(e.target.value)}
                    style={{ width: '100%', padding: 10, fontSize: '1.5rem', fontWeight: 'bold' }}
                    required
                />
             </div>
             {closingAmount && (
                 <div style={{ marginBottom: 15, textAlign: 'right', fontWeight: 'bold', color: (Number(closingAmount) - (summary?.expectedCash || 0)) === 0 ? 'green' : 'red' }}>
                    Diferencia: {(Number(closingAmount) - (summary?.expectedCash || 0)).toFixed(2)}
                 </div>
             )}
             <div style={{ marginBottom: 15 }}>
                <label>Notas de Cierre</label>
                <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{ width: '100%', padding: 10 }}
                    rows={3}
                    placeholder="Observaciones..."
                />
             </div>
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setShowCloseModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-danger">Confirmar Cierre</button>
             </div>
           </form>
        </Modal>
      )}
    </div>
  )
}

function StatCard({ title, value, color, negative, highlight }: any) {
    return (
        <div className="card" style={{ borderLeft: `4px solid ${color}`, background: highlight ? 'rgba(234, 179, 8, 0.1)' : undefined }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 5 }}>{title}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: highlight ? '#000' : 'var(--text)' }}>
                {negative ? '-' : ''}{Number(value || 0).toFixed(2)}
            </div>
        </div>
    )
}

function Modal({ children, onClose, title }: any) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--modal)', padding: 20, borderRadius: 12, width: 400, maxWidth: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                </div>
                {children}
            </div>
        </div>
    )
}

function translateMethod(method: string) {
    const map: any = {
        'CASH': 'Efectivo',
        'CARD': 'Tarjeta',
        'DEPOSIT': 'Depósito',
        'CREDIT': 'Crédito'
    }
    return map[method] || method
}
