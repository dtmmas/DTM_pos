import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

async function ensureWarehousesTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    type ENUM('ALMACEN','TIENDA') NOT NULL DEFAULT 'ALMACEN',
    address VARCHAR(255),
    status ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'
  )`)
}

// Listar almacenes
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    await ensureWarehousesTable(pool)
    const [rows] = await pool.query('SELECT id, name, type, address, status FROM warehouses ORDER BY name ASC')
    return res.json(rows)
  } catch (err) {
    console.error('Warehouses GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Crear almacén
router.post('/', authMiddleware, roleMiddleware(['ADMIN','ALMACEN']), async (req, res) => {
  try {
    let { name, type, address, status } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    
    const pool = await getPool()
    await ensureWarehousesTable(pool)
    
    const [exists] = await pool.query('SELECT id FROM warehouses WHERE LOWER(name) = LOWER(?) LIMIT 1', [name])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un almacén con ese nombre' })
    }
    
    const [result] = await pool.query(
      'INSERT INTO warehouses (name, type, address, status) VALUES (?, ?, ?, ?)',
      [name, type || 'ALMACEN', address || null, status || 'ACTIVO']
    )
    return res.status(201).json({ id: result.insertId, name, type, address, status })
  } catch (err) {
    console.error('Warehouses POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Actualizar almacén
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN','ALMACEN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    let { name, type, address, status } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    
    const pool = await getPool()
    await ensureWarehousesTable(pool)
    
    const [exists] = await pool.query('SELECT id FROM warehouses WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [name, id])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un almacén con ese nombre' })
    }
    
    await pool.query(
      'UPDATE warehouses SET name = ?, type = ?, address = ?, status = ? WHERE id = ?',
      [name, type || 'ALMACEN', address || null, status || 'ACTIVO', id]
    )
    return res.json({ id, name, type, address, status })
  } catch (err) {
    console.error('Warehouses PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Eliminar almacén
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN','ALMACEN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    await ensureWarehousesTable(pool)
    await pool.query('DELETE FROM warehouses WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Warehouses DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router