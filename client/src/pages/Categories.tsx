import { useEffect, useMemo, useState } from 'react'
import { api, getDepartments } from '../api'

interface Category { id: number; name: string; parentId?: number | null; departmentId?: number | null }
interface Department { id: number; name: string }

export default function Categories() {
  const [items, setItems] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)
  const [createMode, setCreateMode] = useState<'parent' | 'child'>('parent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [section, setSection] = useState<'general' | 'sub'>('general')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [showEdit, setShowEdit] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [editParentId, setEditParentId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [createDepartmentId, setCreateDepartmentId] = useState<number | null>(null)
  const [editDepartmentId, setEditDepartmentId] = useState<number | null>(null)
  

  const load = async () => {
    const { data } = await api.get('/categories')
    const sorted = [...data].sort((a: Category, b: Category) => a.name.localeCompare(b.name))
    setItems(sorted)
    try {
      const deps = await getDepartments()
      setDepartments(deps)
    } catch (e) {
      // ignore
    }
  }
  useEffect(() => { load() }, [])

  const parentMap = useMemo(() => {
    const map: Record<number, string> = {}
    for (const c of items) { map[c.id] = c.name }
    return map
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(c => {
      const matchesQuery = !q || c.name.toLowerCase().includes(q) || (!!c.parentId && (parentMap[c.parentId] || '').toLowerCase().includes(q))
      return matchesQuery
    })
  }, [items, query, parentMap])

  const generals = useMemo(() => filtered.filter(c => !c.parentId), [filtered])
  const subs = useMemo(() => filtered.filter(c => !!c.parentId), [filtered])

  const childrenByParent = useMemo(() => {
    const map: Record<number, Category[]> = {}
    for (const s of subs) {
      const pid = s.parentId as number
      if (!map[pid]) map[pid] = []
      map[pid].push(s)
    }
    return map
  }, [subs])

  const toggleExpand = (id: number) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const startCreateParent = () => { setCreateName(''); setParentId(null); setCreateDepartmentId(null); setCreateMode('parent'); setShowCreate(true) }
  const startCreateChild = () => { setCreateName(''); setParentId(null); setCreateDepartmentId(null); setCreateMode('child'); setShowCreate(true) }
  const cancelCreate = () => { setShowCreate(false); setCreateName(''); setParentId(null); setCreateDepartmentId(null); setCreateMode('parent') }
  const saveCreate = async () => {
    const trimmed = createName.trim()
    if (!trimmed) return
    if (items.some(x => x.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Ya existe una categoría con ese nombre')
      return
    }
    if (createMode === 'child' && !parentId) {
      alert('Selecciona un padre para la subcategoría')
      return
    }
    if (createMode === 'parent' && !createDepartmentId) {
      alert('Selecciona el departamento para la categoría general')
      return
    }
    setLoading(true)
    try {
      const inheritedDept = createMode === 'child' ? (items.find(c => c.id === (parentId as number))?.departmentId ?? null) : null
      const payload = {
        name: trimmed,
        parentId: createMode === 'parent' ? null : parentId,
        departmentId: createMode === 'parent' ? createDepartmentId : inheritedDept
      }
      await api.post('/categories', payload)
      setCreateName('')
      setParentId(null)
      setCreateDepartmentId(null)
      setCreateMode('parent')
      setShowCreate(false)
      await load()
      alert('Categoría creada correctamente')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (c: Category) => {
    setEditTarget(c)
    setEditName(c.name)
    setEditParentId(c.parentId ?? null)
    // Si es general, permitir editar su departamento; si es subcategoría, heredará del padre
    setEditDepartmentId(c.parentId ? (items.find(x => x.id === (c.parentId as number))?.departmentId ?? null) : (c.departmentId ?? null))
    setShowEdit(true)
  }

  const cancelEdit = () => {
    setShowEdit(false)
    setEditTarget(null)
    setEditName('')
    setEditParentId(null)
  }

  const saveEdit = async () => {
    const trimmed = editName.trim()
    if (!trimmed || !editTarget) return
    if (items.some(x => x.id !== editTarget.id && x.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Ya existe una categoría con ese nombre')
      return
    }
    if (editTarget.id === editParentId) {
      alert('Una categoría no puede ser su propio padre')
      return
    }
    setLoading(true)
    try {
      const inheritedDept = editParentId ? (items.find(c => c.id === (editParentId as number))?.departmentId ?? null) : null
      const payload = {
        name: trimmed,
        parentId: editParentId ?? null,
        departmentId: editParentId ? inheritedDept : (editDepartmentId ?? null)
      }
      await api.put(`/categories/${editTarget.id}`, payload)
      setShowEdit(false)
      setEditTarget(null)
      setEditName('')
      setEditDepartmentId(null)
      setEditParentId(null)
      await load()
      alert('Categoría actualizada correctamente')
    } finally {
      setLoading(false)
    }
  }

  const removeCategory = async (id: number) => {
    const target = items.find(c => c.id === id) || null
    setDeleteTarget(target)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setLoading(true)
      await api.delete(`/categories/${deleteTarget.id}`)
      await load()
      setDeleteTarget(null)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'No se pudo eliminar la categoría.'
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Categorías</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} style={{ width: 280 }} />
          {section === 'general' ? (
            <button className="primary-btn" onClick={startCreateParent}>Nueva categoría general</button>
          ) : (
            <button className="primary-btn" onClick={startCreateChild}>Nueva subcategoría</button>
          )}
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
          <div className="view-toggle">
            <button
              className={`toggle-btn ${section === 'general' ? 'active' : ''}`}
              onClick={() => setSection('general')}
            >
              Generales
            </button>
            <button
              className={`toggle-btn ${section === 'sub' ? 'active' : ''}`}
              onClick={() => setSection('sub')}
            >
              Subcategorías
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {(section === 'general' ? generals : subs).map(c => (
            <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>
                  {c.parentId ? 'Subcategoría' : 'Categoría general'}
                </span>
                
              </div>
              {section === 'sub' && (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Padre: {c.parentId ? parentMap[c.parentId] || '—' : '—'}</div>
              )}
              {section === 'general' && (
                <div>
                  <button className="small-btn" onClick={() => toggleExpand(c.id)}>{expanded[c.id] ? 'Contraer subcategorías' : 'Mostrar subcategorías'}</button>
                  {expanded[c.id] && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {(childrenByParent[c.id] || []).length === 0 ? (
                        <li style={{ opacity: 0.8 }}>Sin subcategorías</li>
                      ) : (
                        childrenByParent[c.id].map(sc => (
                          <li key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{sc.name}</span>
                            <span style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>Subcategoría</span>
                            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                              <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(sc)}>
                                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                              </button>
                              <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeCategory(sc.id)}>
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                  <path d="M3 6h18" stroke="currentColor" strokeWidth="2"/>
                                  <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2"/>
                                  <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2"/>
                                  <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2"/>
                                </svg>
                              </button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 'auto', alignItems: 'center' }}>
                <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(c)}>
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                </button>
                <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeCategory(c.id)}>
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
                {section === 'general' ? (
                  <>
                    <th style={{ textAlign: 'left', padding: 8 }}>Categoría</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
                  </>
                ) : (
                  <>
                    <th style={{ textAlign: 'left', padding: 8 }}>Subcategoría</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Padre</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {section === 'general'
                ? generals.map(c => (
                    <>
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>
                          <button className="icon-btn" title={expanded[c.id] ? 'Contraer' : 'Expandir'} aria-label="Expandir/Contraer" onClick={() => toggleExpand(c.id)} style={{ marginRight: 8 }}>
                            <svg viewBox="0 0 24 24" width="16" height="16">
                              {expanded[c.id] ? (
                                <path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2"/>
                              ) : (
                                <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2"/>
                              )}
                            </svg>
                          </button>
                          <span>{c.name}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>
                            Categoría general
                          </span>
                        </td>
                        <td style={{ padding: 8 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(c)}>
                              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                            </button>
                            <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeCategory(c.id)}>
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
                      {expanded[c.id] && (
                        <tr>
                          <td colSpan={2} style={{ padding: 8, background: 'var(--bg)' }}>
                            {(childrenByParent[c.id] || []).length === 0 ? (
                              <div style={{ opacity: 0.8 }}>Sin subcategorías</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', padding: 6 }}>Subcategoría</th>
                                    <th style={{ textAlign: 'left', padding: 6 }}>Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {childrenByParent[c.id].map(sc => (
                                    <tr key={sc.id}>
                                      <td style={{ padding: 6 }}>
                                        <span>{sc.name}</span>
                                        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>Subcategoría</span>
                                      </td>
                                      <td style={{ padding: 6 }}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(sc)}>
                                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                                          </button>
                                          <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeCategory(sc.id)}>
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
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                : subs.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>
                        <span>{c.name}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>
                          Subcategoría
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{c.parentId ? parentMap[c.parentId] || '—' : '—'}</td>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="icon-btn primary" title="Editar" aria-label="Editar" onClick={() => startEdit(c)}>
                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94a1 1 0 0 0 0-1.41l-3.34-3.34a1 1 0 0 0-1.41 0L3 16.59z" fill="currentColor"/></svg>
                          </button>
                          <button className="icon-btn danger" title="Eliminar" aria-label="Eliminar" onClick={() => removeCategory(c.id)}>
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
            <h3 style={{ margin: 0, marginBottom: 12 }}>{createMode === 'parent' ? 'Nueva categoría general' : 'Nueva subcategoría'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input value={createName} onChange={e => setCreateName(e.target.value)} />
              </div>
              
              {createMode === 'child' && (
                <div>
                  <label>Padre</label>
                  <select value={parentId ?? ''} onChange={e => setParentId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Selecciona un padre…</option>
                    {items.filter(c => !c.parentId).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                    Departamento del padre: {(() => {
                      const pid = parentId ?? null
                      const deptId = pid ? (items.find(c => c.id === pid)?.departmentId ?? null) : null
                      return deptId ? (departments.find(d => d.id === deptId)?.name || '—') : '—'
                    })()}
                  </div>
                </div>
              )}
              {createMode === 'parent' && (
                <div>
                  <label>Departamento</label>
                  <select value={createDepartmentId ?? ''} onChange={e => setCreateDepartmentId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Selecciona un departamento…</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
            <h3 style={{ margin: 0, marginBottom: 12 }}>Editar categoría</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              
              {editTarget?.parentId ? (
                <div>
                  <label>Padre</label>
                  <select value={editParentId ?? ''} onChange={e => setEditParentId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Sin padre —</option>
                    {items.filter(c => !c.parentId && (!editTarget || c.id !== editTarget.id)).map(c => (
                      <option key={c.id} value={c.id} disabled={editTarget ? c.id === editTarget.id : false}>{c.name}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                    Departamento heredado: {(() => {
                      const pid = editParentId ?? null
                      const deptId = pid ? (items.find(c => c.id === pid)?.departmentId ?? null) : null
                      return deptId ? (departments.find(d => d.id === deptId)?.name || '—') : '—'
                    })()}
                  </div>
                </div>
              ) : (
                <div>
                  <label>Departamento</label>
                  <select value={editDepartmentId ?? ''} onChange={e => setEditDepartmentId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Selecciona un departamento…</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
              Esta acción eliminará la categoría <strong>{deleteTarget.name}</strong> de forma permanente. ¿Confirmar?
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