import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const [rows] = await pool.query('SELECT id, name FROM departments ORDER BY name ASC')
    return res.json(rows.map(r => ({ id: r.id, name: r.name })))
  } catch (err) {
    console.error('Departments GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const { name } = req.body
    const pool = await getPool()
    const [result] = await pool.query('INSERT INTO departments (name) VALUES (?)', [name])
    return res.json({ id: result.insertId, name })
  } catch (err) {
    console.error('Departments POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name } = req.body
    const pool = await getPool()
    await pool.query('UPDATE departments SET name = ? WHERE id = ?', [name, id])
    return res.json({ id, name })
  } catch (err) {
    console.error('Departments PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    await pool.query('DELETE FROM departments WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Departments DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router