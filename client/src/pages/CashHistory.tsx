import { useEffect, useMemo, useState } from 'react'
import { getCashHistoryShifts, getCashHistorySummary } from '../api'
import { useConfigStore } from '../store/config'
import { formatMoney } from '../utils/currency'
import { formatDateTime } from '../utils/date'

type Period = 'day' | 'month' | 'year'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function CashHistory() {
  const currency = useConfigStore(s => s.config?.currency || 'USD')
  const [period, setPeriod] = useState<Period>('day')
  const [start, setStart] = useState(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return isoDate(first)
  })
  const [end, setEnd] = useState(() => isoDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Array<any>>([])
  const [shifts, setShifts] = useState<Array<any>>([])

  const params = useMemo(() => ({ start, end }), [start, end])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [s, list] = await Promise.all([
          getCashHistorySummary({ period, ...params }),
          getCashHistoryShifts({ ...params, limit: 200 }),
        ])
        setSummary(Array.isArray(s?.summary) ? s.summary : [])
        setShifts(Array.isArray(list?.items) ? list.items : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period, params])

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Historial de Cierre de Caja</h2>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Resumen por día, mes o año, y detalle de cierres
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--modal)', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontWeight: 600 }}
          >
            <option value="day">Diario</option>
            <option value="month">Mensual</option>
            <option value="year">Anual</option>
          </select>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px' }}
          />
          <span style={{ color: 'var(--muted)' }}>a</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
          <div className="card">
            <h3>Resumen</h3>
            {summary.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>Sin cierres en el rango seleccionado.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', fontSize: '0.85rem' }}>
                    <th style={{ padding: 8 }}>{period === 'day' ? 'Día' : period === 'month' ? 'Mes' : 'Año'}</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Cierres</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Esperado</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Real</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r: any) => (
                    <tr key={r.period} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8, fontWeight: 600 }}>{r.period}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.shifts}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(Number(r.expected || 0), currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(Number(r.closing || 0), currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: Number(r.difference || 0) === 0 ? '#22c55e' : Number(r.difference || 0) > 0 ? '#3b82f6' : '#ef4444' }}>
                        {formatMoney(Number(r.difference || 0), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Detalle de Cierres</h3>
            {shifts.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>Sin cierres en el rango seleccionado.</div>
            ) : (
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', fontSize: '0.85rem' }}>
                      <th style={{ padding: 8 }}>Cierre</th>
                      <th style={{ padding: 8 }}>Responsable</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Inicial</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Esperado</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Real</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Dif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s: any) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{formatDateTime(s.closedAt)}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Apertura: {formatDateTime(s.openedAt)}
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{s.closedByName || '-'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Abrió: {s.openedByName || '-'}
                          </div>
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(Number(s.openingBalance || 0), currency)}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(Number(s.expected || 0), currency)}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(Number(s.closingBalance || 0), currency)}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: Number(s.difference || 0) === 0 ? '#22c55e' : Number(s.difference || 0) > 0 ? '#3b82f6' : '#ef4444' }}>
                          {formatMoney(Number(s.difference || 0), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
