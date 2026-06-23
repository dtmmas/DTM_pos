import express from 'express'
import { authMiddleware, getUserWarehouseId, isAdminUser, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { registerMovement } from '../services/inventory.js'

const router = express.Router()

// Helper to check numeric validity
function isValidNumber(n) {
  return typeof n === 'number' && !isNaN(n) && n > 0
}

async function getAllowedTrackedValues(conn, { productId, warehouseId, table, valueColumn }) {
  const [[stockRow]] = await conn.query(
    'SELECT quantity FROM product_warehouse_stock WHERE product_id = ? AND warehouse_id = ? LIMIT 1',
    [productId, warehouseId]
  )
  const stockQty = Math.max(0, Number(stockRow?.quantity || 0))

  const [rows] = await conn.query(
    `SELECT ${valueColumn} AS tracked_value
     FROM ${table}
     WHERE product_id = ? AND warehouse_id = ? AND status = "AVAILABLE"
     ORDER BY id ASC`,
    [productId, warehouseId]
  )

  return (rows || [])
    .map(row => row.tracked_value)
    .filter(Boolean)
    .slice(0, stockQty)
}

// GET /transfers - List all transfers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const { limit = 50, offset = 0 } = req.query

    const isAdmin = isAdminUser(req.user)
    const userWarehouseId = getUserWarehouseId(req.user)
    const whereClause = !isAdmin
      ? (userWarehouseId ? 'WHERE t.source_warehouse_id = ? OR t.destination_warehouse_id = ?' : 'WHERE 1 = 0')
      : ''
    const params = !isAdmin
      ? (userWarehouseId ? [userWarehouseId, userWarehouseId, Number(limit), Number(offset)] : [Number(limit), Number(offset)])
      : [Number(limit), Number(offset)]

    const [rows] = await pool.query(`
      SELECT t.*, 
             ws.name as source_warehouse_name,
             wd.name as destination_warehouse_name,
             u.name as created_by_user,
             (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id) as item_count,
             (SELECT SUM(quantity) FROM transfer_items ti WHERE ti.transfer_id = t.id) as total_quantity
      FROM transfers t
      JOIN warehouses ws ON t.source_warehouse_id = ws.id
      JOIN warehouses wd ON t.destination_warehouse_id = wd.id
      LEFT JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, params)
    
    return res.json(rows)
  } catch (err) {
    console.error('Transfers GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// GET /transfers/:id - Get details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    const isAdmin = isAdminUser(req.user)
    const userWarehouseId = getUserWarehouseId(req.user)
    const whereClause = !isAdmin
      ? (userWarehouseId ? 'AND (t.source_warehouse_id = ? OR t.destination_warehouse_id = ?)' : 'AND 1 = 0')
      : ''
    const params = !isAdmin
      ? (userWarehouseId ? [id, userWarehouseId, userWarehouseId] : [id])
      : [id]
    
    const [rows] = await pool.query(`
      SELECT t.*, 
             ws.name as source_warehouse_name,
             wd.name as destination_warehouse_name,
             u.name as created_by_user
      FROM transfers t
      JOIN warehouses ws ON t.source_warehouse_id = ws.id
      JOIN warehouses wd ON t.destination_warehouse_id = wd.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
      ${whereClause}
    `, params)
    
    if (rows.length === 0) return res.status(404).json({ error: 'Transfer not found' })
    const transfer = rows[0]
    
    const [items] = await pool.query(`
      SELECT ti.*, p.name as product_name, p.sku, p.image_url
      FROM transfer_items ti
      JOIN products p ON ti.product_id = p.id
      WHERE ti.transfer_id = ?
    `, [id])
    
    return res.json({ ...transfer, items })
  } catch (err) {
    console.error('Transfers GET details error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// POST /transfers - Create new transfer
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'ALMACEN']), async (req, res) => {
  try {
    const { source_warehouse_id, destination_warehouse_id, items, notes } = req.body

    const sourceWarehouseId = source_warehouse_id || req.body.sourceWarehouseId
    const destinationWarehouseId = destination_warehouse_id || req.body.destinationWarehouseId

    const isAdmin = isAdminUser(req.user)
    const userWarehouseId = getUserWarehouseId(req.user)
    const finalSourceWarehouseId = isAdmin ? Number(sourceWarehouseId) : Number(userWarehouseId || 0)
    const finalDestinationWarehouseId = Number(destinationWarehouseId)

    if (!isAdmin && !userWarehouseId) {
      return res.status(400).json({ error: 'El usuario no tiene una tienda asignada para transferir' })
    }
    if (!finalSourceWarehouseId || !finalDestinationWarehouseId) {
      return res.status(400).json({ error: 'Origen y destino son requeridos' })
    }
    if (!isAdmin && userWarehouseId && Number(sourceWarehouseId) && Number(sourceWarehouseId) !== Number(userWarehouseId)) {
      return res.status(403).json({ error: 'Solo puedes transferir desde tu tienda asignada' })
    }
    if (finalSourceWarehouseId === finalDestinationWarehouseId) {
      return res.status(400).json({ error: 'La tienda origen y destino deben ser diferentes' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'La lista de productos esta vacia' })
    }
    
    const pool = await getPool()
    const conn = await pool.getConnection()
    
    try {
      await conn.beginTransaction()

      const [warehouseRows] = await conn.query(
        'SELECT id, status FROM warehouses WHERE id IN (?, ?)',
        [finalSourceWarehouseId, finalDestinationWarehouseId]
      )
      const sourceWarehouse = warehouseRows.find(row => Number(row.id) === finalSourceWarehouseId)
      const destinationWarehouse = warehouseRows.find(row => Number(row.id) === finalDestinationWarehouseId)
      if (!sourceWarehouse || !destinationWarehouse) {
        await conn.rollback()
        return res.status(404).json({ error: 'La tienda origen o destino no existe' })
      }
      if (String(sourceWarehouse.status || '').toUpperCase() !== 'ACTIVO' || String(destinationWarehouse.status || '').toUpperCase() !== 'ACTIVO') {
        await conn.rollback()
        return res.status(400).json({ error: 'Solo se puede transferir entre tiendas activas' })
      }
      
      const [resHeader] = await conn.query(`
        INSERT INTO transfers (source_warehouse_id, destination_warehouse_id, status, user_id, notes)
        VALUES (?, ?, 'COMPLETED', ?, ?)
      `, [finalSourceWarehouseId, finalDestinationWarehouseId, req.user.id, notes || ''])
      
      const transferId = resHeader.insertId
      
      for (const item of items) {
        const productId = item.product_id || item.productId
        const quantity = Number(item.quantity || 0)
        const batchNo = item.batch_no || item.batchNo
        const imei = item.imei
        const serial = item.serial

        if (!isValidNumber(quantity)) continue

        await conn.query(`
          INSERT INTO transfer_items (transfer_id, product_id, quantity)
          VALUES (?, ?, ?)
        `, [transferId, productId, quantity])
        
        if (batchNo) {
             const [batchResult] = await conn.query(
               'UPDATE product_batches SET quantity = quantity - ? WHERE product_id = ? AND batch_no = ? AND warehouse_id = ? AND quantity >= ?',
               [quantity, productId, batchNo, finalSourceWarehouseId, quantity]
             )
             if (!batchResult.affectedRows) {
               throw new Error(`Stock insuficiente o lote no disponible para el producto ${productId} en la tienda origen`)
             }
        } else if (imei) {
             const allowedImeis = await getAllowedTrackedValues(conn, {
               productId,
               warehouseId: finalSourceWarehouseId,
               table: 'product_imeis',
               valueColumn: 'imei'
             })
             if (!allowedImeis.includes(imei)) {
               throw new Error(`IMEI no disponible para transferir en la tienda origen para el producto ${productId}`)
             }
             const [imeiResult] = await conn.query(
               'UPDATE product_imeis SET warehouse_id = ? WHERE product_id = ? AND imei = ? AND warehouse_id = ? AND status = "AVAILABLE"',
               [finalDestinationWarehouseId, productId, imei, finalSourceWarehouseId]
             )
             if (!imeiResult.affectedRows) {
               throw new Error(`IMEI no disponible en la tienda origen para el producto ${productId}`)
             }
        } else if (serial) {
             const allowedSerials = await getAllowedTrackedValues(conn, {
               productId,
               warehouseId: finalSourceWarehouseId,
               table: 'product_serials',
               valueColumn: 'serial_no'
             })
             if (!allowedSerials.includes(serial)) {
               throw new Error(`Serie no disponible para transferir en la tienda origen para el producto ${productId}`)
             }
             const [serialResult] = await conn.query(
               'UPDATE product_serials SET warehouse_id = ? WHERE product_id = ? AND serial_no = ? AND warehouse_id = ? AND status = "AVAILABLE"',
               [finalDestinationWarehouseId, productId, serial, finalSourceWarehouseId]
             )
             if (!serialResult.affectedRows) {
               throw new Error(`Serie no disponible en la tienda origen para el producto ${productId}`)
             }
        }

        if (batchNo) {
             const [destBatch] = await conn.query('SELECT id, quantity FROM product_batches WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [productId, batchNo, finalDestinationWarehouseId])
             
             if (destBatch.length > 0) {
                 await conn.query('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?', [quantity, destBatch[0].id])
             } else {
                 const [srcBatch] = await conn.query('SELECT expiry_date FROM product_batches WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [productId, batchNo, finalSourceWarehouseId])
                 let expiry = srcBatch.length > 0 ? srcBatch[0].expiry_date : null

                 if (!expiry) {
                     const [anyBatch] = await conn.query('SELECT expiry_date FROM product_batches WHERE product_id = ? AND batch_no = ? LIMIT 1', [productId, batchNo])
                     if (anyBatch.length > 0) expiry = anyBatch[0].expiry_date
                 }

                 if (expiry) {
                     await conn.query('INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity, warehouse_id) VALUES (?, ?, ?, ?, ?)', 
                         [productId, batchNo, expiry, quantity, finalDestinationWarehouseId])
                 }
             }
        }

        await registerMovement({
          productId,
          warehouseId: finalSourceWarehouseId,
          type: 'TRANSFER_OUT',
          quantity: quantity,
          referenceId: transferId, 
          notes: `Transferencia #${transferId} a almacén ${finalDestinationWarehouseId} ${batchNo ? `(Lote: ${batchNo})` : ''} ${imei ? `(IMEI: ${imei})` : ''} ${serial ? `(SN: ${serial})` : ''}`,
          userId: req.user.id
        }, conn)
        
        await registerMovement({
          productId,
          warehouseId: finalDestinationWarehouseId,
          type: 'TRANSFER_IN',
          quantity: quantity,
          referenceId: transferId, 
          notes: `Transferencia #${transferId} desde almacén ${finalSourceWarehouseId} ${batchNo ? `(Lote: ${batchNo})` : ''} ${imei ? `(IMEI: ${imei})` : ''} ${serial ? `(SN: ${serial})` : ''}`,
          userId: req.user.id
        }, conn)
      }
      
      await conn.commit()
      return res.json({ success: true, transferId })
      
    } catch (err) {
      await conn.rollback()
      console.error('Transfer Transaction Error:', err)
      if (err.message && err.message.includes('Stock insuficiente')) {
         return res.status(400).json({ error: err.message })
      }
      if (err.message && (
        err.message.includes('lote no disponible') ||
        err.message.includes('IMEI no disponible') ||
        err.message.includes('Serie no disponible')
      )) {
         return res.status(400).json({ error: err.message })
      }
      return res.status(500).json({ error: 'Error processing transfer' })
    } finally {
      conn.release()
    }
    
  } catch (err) {
    console.error('Transfers POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
