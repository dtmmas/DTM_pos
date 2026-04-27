import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

// List all suppliers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const [rows] = await pool.query('SELECT id, name, document, phone, email, address FROM suppliers ORDER BY name ASC')
    const items = rows.map(r => ({ id: r.id, name: r.name, document: r.document || '', phone: r.phone || '', email: r.email || '', address: r.address || '' }))
    return res.json(items)
  } catch (err) {
    console.error('Suppliers GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Create supplier (ADMIN)
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    let { name } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    const [exists] = await pool.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) LIMIT 1', [name])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' })
    }
    const [result] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [name])
    return res.json({ id: result.insertId, name })
  } catch (err) {
    console.error('Suppliers POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Update supplier (ADMIN)
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    let { name } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    const [exists] = await pool.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [name, id])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' })
    }
    await pool.query('UPDATE suppliers SET name = ? WHERE id = ?', [name, id])
    return res.json({ id, name })
  } catch (err) {
    console.error('Suppliers PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Usage count for a supplier (number of purchases)
router.get('/:id/usage', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM purchases WHERE supplier_id = ?', [id])
    const count = rows?.[0]?.c ?? 0
    return res.json({ count })
  } catch (err) {
    console.error('Suppliers usage GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Delete supplier if not used
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM purchases WHERE supplier_id = ?', [id])
    const count = rows?.[0]?.c ?? 0
    if (count > 0) {
      return res.status(409).json({ error: `No se puede eliminar: el proveedor está referenciado en ${count} compra(s).`, count })
    }
    await pool.query('DELETE FROM suppliers WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Suppliers DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router