import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    try {
      // Intentar consultar incluyendo department_id (DB nueva)
      const [rows] = await pool.query(
        'SELECT id, name, parent_id, department_id FROM categories ORDER BY name ASC'
      )
      return res.json(
        rows.map(r => ({
          id: r.id,
          name: r.name,
          parentId: r.parent_id ?? null,
          departmentId: r.department_id ?? null,
        }))
      )
    } catch (err2) {
      // Si la columna no existe (DB antigua), hacer fallback sin department_id
      if (err2 && (err2.code === 'ER_BAD_FIELD_ERROR' || err2.errno === 1054)) {
        console.warn(
          'categories: columna department_id ausente, usando consulta de compatibilidad.'
        )
        const [rows] = await pool.query(
          'SELECT id, name, parent_id FROM categories ORDER BY name ASC'
        )
        return res.json(
          rows.map(r => ({ id: r.id, name: r.name, parentId: r.parent_id ?? null }))
        )
      }
      console.error('Categories GET query error:', err2)
      return res.status(500).json({ error: 'Server error' })
    }
  } catch (err) {
    console.error('Categories GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const { name, parentId, departmentId } = req.body
    console.log('Categories POST received:', { name, parentId, departmentId })
    const pool = await getPool()
    const parent = parentId != null ? Number(parentId) : null
    const dept = departmentId != null ? Number(departmentId) : null
    console.log('Inserting category:', { name, parent, dept })
    try {
      const [result] = await pool.query(
        'INSERT INTO categories (name, parent_id, department_id) VALUES (?, ?, ?)',
        [name, parent, dept]
      )
      return res.json({ id: result.insertId, name, parentId: parent, departmentId: dept })
    } catch (err2) {
      if (err2 && (err2.code === 'ER_BAD_FIELD_ERROR' || err2.errno === 1054)) {
        console.warn('categories: department_id no existe, insertando sin esa columna')
        const [result] = await pool.query(
          'INSERT INTO categories (name, parent_id) VALUES (?, ?)',
          [name, parent]
        )
        return res.json({ id: result.insertId, name, parentId: parent })
      }
      throw err2
    }
  } catch (err) {
    console.error('Categories POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, parentId, departmentId } = req.body
    const pool = await getPool()
    const parent = parentId != null ? Number(parentId) : null
    const dept = departmentId != null ? Number(departmentId) : null
    try {
      await pool.query(
        'UPDATE categories SET name = ?, parent_id = ?, department_id = ? WHERE id = ?',
        [name, parent, dept, id]
      )
      return res.json({ id, name, parentId: parent, departmentId: dept })
    } catch (err2) {
      if (err2 && (err2.code === 'ER_BAD_FIELD_ERROR' || err2.errno === 1054)) {
        console.warn('categories: department_id no existe, actualizando sin esa columna')
        await pool.query('UPDATE categories SET name = ?, parent_id = ? WHERE id = ?', [name, parent, id])
        return res.json({ id, name, parentId: parent })
      }
      throw err2
    }
  } catch (err) {
    console.error('Categories PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    await pool.query('DELETE FROM categories WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Categories DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router