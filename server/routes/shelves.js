import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

async function ensureShelvesTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS shelves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
  )`)
  // Ensure warehouse_id column exists and FK to warehouses
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shelves' AND COLUMN_NAME = 'warehouse_id'`
  )
  if (rows[0]?.count === 0) {
    await pool.query('ALTER TABLE shelves ADD COLUMN warehouse_id INT NULL')
    try {
      await pool.query('ALTER TABLE shelves ADD CONSTRAINT fk_shelves_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL')
    } catch (err) {
      // FK may already exist or warehouses table missing; ignore and rely on schema/migrations
      console.warn('shelves: could not add FK warehouse_id -> warehouses(id):', err?.message || err)
    }
  }
}

// Many-to-many: shelf can belong to multiple warehouses
async function ensureWarehouseShelvesTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS warehouse_shelves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    warehouse_id INT NOT NULL,
    shelf_id INT NOT NULL,
    UNIQUE KEY uniq_wh_shelf (warehouse_id, shelf_id),
    CONSTRAINT fk_ws_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ws_shelf FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
  )`)
}

// Listar estantes
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    await ensureShelvesTable(pool)
    await ensureWarehouseShelvesTable(pool)
    const [rows] = await pool.query(`
      SELECT s.id, s.name, s.warehouse_id,
             GROUP_CONCAT(ws.warehouse_id) AS wid_list
      FROM shelves s
      LEFT JOIN warehouse_shelves ws ON ws.shelf_id = s.id
      GROUP BY s.id, s.name, s.warehouse_id
      ORDER BY s.name ASC
    `)
    const result = rows.map(r => {
      const ids = (r.wid_list ? String(r.wid_list).split(',').map(x => Number(x)) : [])
      const first = ids.length > 0 ? ids[0] : (r.warehouse_id ?? null)
      return { id: r.id, name: r.name, warehouseId: first ?? null, warehouseIds: ids }
    })
    return res.json(result)
  } catch (err) {
    console.error('Shelves GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Crear estante
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    let { name, warehouseId } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    await ensureShelvesTable(pool)
    await ensureWarehouseShelvesTable(pool)
    const [exists] = await pool.query('SELECT id FROM shelves WHERE LOWER(name) = LOWER(?) LIMIT 1', [name])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un estante con ese nombre' })
    }
    const wid = warehouseId != null ? Number(warehouseId) : null
    // Opcional: validar existencia del almacén si se proporciona
    if (wid != null) {
      const [wexists] = await pool.query('SELECT id FROM warehouses WHERE id = ? LIMIT 1', [wid])
      if (!Array.isArray(wexists) || wexists.length === 0) {
        return res.status(400).json({ error: 'Almacén no válido' })
      }
    }
    const [result] = await pool.query('INSERT INTO shelves (name, warehouse_id) VALUES (?, ?)', [name, wid])
    const shelfId = result.insertId
    if (wid != null) {
      try { await pool.query('INSERT IGNORE INTO warehouse_shelves (warehouse_id, shelf_id) VALUES (?, ?)', [wid, shelfId]) } catch {}
    }
    return res.status(201).json({ id: shelfId, name, warehouseId: wid, warehouseIds: wid != null ? [wid] : [] })
  } catch (err) {
    console.error('Shelves POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Actualizar estante
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    let { name, warehouseId } = req.body
    name = (name || '').trim()
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const pool = await getPool()
    await ensureShelvesTable(pool)
    await ensureWarehouseShelvesTable(pool)
    const [exists] = await pool.query('SELECT id FROM shelves WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [name, id])
    if (Array.isArray(exists) && exists.length > 0) {
      return res.status(409).json({ error: 'Ya existe un estante con ese nombre' })
    }
    const wid = warehouseId != null ? Number(warehouseId) : null
    if (wid != null) {
      const [wexists] = await pool.query('SELECT id FROM warehouses WHERE id = ? LIMIT 1', [wid])
      if (!Array.isArray(wexists) || wexists.length === 0) {
        return res.status(400).json({ error: 'Almacén no válido' })
      }
    }
    await pool.query('UPDATE shelves SET name = ?, warehouse_id = ? WHERE id = ?', [name, wid, id])
    if (wid != null) {
      try { await pool.query('INSERT IGNORE INTO warehouse_shelves (warehouse_id, shelf_id) VALUES (?, ?)', [wid, id]) } catch {}
    }
    const [assoc] = await pool.query('SELECT warehouse_id FROM warehouse_shelves WHERE shelf_id = ?', [id])
    const warehouseIds = Array.isArray(assoc) ? assoc.map(r => Number(r.warehouse_id)) : []
    return res.json({ id, name, warehouseId: wid ?? (warehouseIds[0] ?? null), warehouseIds })
  } catch (err) {
    console.error('Shelves PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Asignar estante a almacén adicional
router.post('/:id/assign', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const shelfId = Number(req.params.id)
    const { warehouseId } = req.body
    const wid = Number(warehouseId)
    const pool = await getPool()
    await ensureShelvesTable(pool)
    await ensureWarehouseShelvesTable(pool)
    const [sExists] = await pool.query('SELECT id FROM shelves WHERE id = ? LIMIT 1', [shelfId])
    if (!Array.isArray(sExists) || sExists.length === 0) return res.status(404).json({ error: 'Estante no encontrado' })
    const [wExists] = await pool.query('SELECT id FROM warehouses WHERE id = ? LIMIT 1', [wid])
    if (!Array.isArray(wExists) || wExists.length === 0) return res.status(400).json({ error: 'Almacén no válido' })
    await pool.query('INSERT IGNORE INTO warehouse_shelves (warehouse_id, shelf_id) VALUES (?, ?)', [wid, shelfId])
    const [assoc] = await pool.query('SELECT warehouse_id FROM warehouse_shelves WHERE shelf_id = ?', [shelfId])
    const warehouseIds = Array.isArray(assoc) ? assoc.map(r => Number(r.warehouse_id)) : []
    return res.json({ id: shelfId, warehouseIds })
  } catch (err) {
    console.error('Shelves ASSIGN error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Eliminar estante
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    await ensureShelvesTable(pool)
    await pool.query('DELETE FROM shelves WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Shelves DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router