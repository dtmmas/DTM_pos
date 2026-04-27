import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const [rows] = await pool.query('SELECT id, name FROM brands ORDER BY name ASC')
    return res.json(rows.map(r => ({ id: r.id, name: r.name })))
  } catch (err) {
    console.error('Brands GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    let { name } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    const [exists] = await pool.query('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) LIMIT 1', [name])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe una marca con ese nombre' })
    }
    const [result] = await pool.query('INSERT INTO brands (name) VALUES (?)', [name])
    return res.json({ id: result.insertId, name })
  } catch (err) {
    console.error('Brands POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    let { name } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    const [exists] = await pool.query('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [name, id])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe una marca con ese nombre' })
    }
    await pool.query('UPDATE brands SET name = ? WHERE id = ?', [name, id])
    return res.json({ id, name })
  } catch (err) {
    console.error('Brands PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// New endpoint: usage count for a brand
router.get('/:id/usage', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM products WHERE brand_id = ?', [id])
    const count = rows?.[0]?.c ?? 0
    return res.json({ count })
  } catch (err) {
    console.error('Brands usage GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM products WHERE brand_id = ?', [id])
    const count = rows?.[0]?.c ?? 0
    if (count > 0) {
      return res.status(409).json({ error: `No se puede eliminar: la marca está asignada a ${count} producto(s).`, count })
    }
    await pool.query('DELETE FROM brands WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Brands DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router