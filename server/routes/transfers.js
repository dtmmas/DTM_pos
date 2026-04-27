import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { registerMovement } from '../services/inventory.js'

const router = express.Router()

// Helper to check numeric validity
function isValidNumber(n) {
  return typeof n === 'number' && !isNaN(n) && n > 0
}

// GET /transfers - List all transfers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const { limit = 50, offset = 0 } = req.query
    
    // Admins see all, others might see only involved warehouses? 
    // For now, let's allow viewing history if you have permission.
    
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
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [Number(limit), Number(offset)])
    
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
    `, [id])
    
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
    console.log('Transfer Request Body:', req.body) // DEBUG
    // Frontend sends snake_case in payload now, but let's support both or fix destructuring
    const { source_warehouse_id, destination_warehouse_id, items, notes } = req.body
    
    // Fallback if frontend sends camelCase
    const sourceWarehouseId = source_warehouse_id || req.body.sourceWarehouseId
    const destinationWarehouseId = destination_warehouse_id || req.body.destinationWarehouseId
    
    if (!sourceWarehouseId || !destinationWarehouseId) {
      return res.status(400).json({ error: 'Source and Destination warehouses are required' })
    }
    if (Number(sourceWarehouseId) === Number(destinationWarehouseId)) {
      return res.status(400).json({ error: 'Source and Destination must be different' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items list is empty' })
    }
    
    const pool = await getPool()
    const conn = await pool.getConnection()
    
    try {
      await conn.beginTransaction()
      
      // 1. Create Transfer Record
      const [resHeader] = await conn.query(`
        INSERT INTO transfers (source_warehouse_id, destination_warehouse_id, status, user_id, notes)
        VALUES (?, ?, 'COMPLETED', ?, ?)
      `, [sourceWarehouseId, destinationWarehouseId, req.user.id, notes || ''])
      
      const transferId = resHeader.insertId
      
      // 2. Process Items
      for (const item of items) {
        // Frontend sends snake_case now? Or camel? Let's normalize
        const productId = item.product_id || item.productId
        const quantity = item.quantity
        const batchNo = item.batch_no || item.batchNo
        const imei = item.imei
        const serial = item.serial

        if (!isValidNumber(quantity)) continue
        
        // Insert Transfer Item
        // We need to store details in transfer_items if possible, or just rely on movements.
        // Current transfer_items table only has quantity. 
        // Ideally we should add batch_no, imei, serial columns to transfer_items for audit.
        // For now, we just insert basic info and rely on inventory_movements for detailed history?
        // Wait, inventory_movements also doesn't store batch/imei natively in separate columns, just notes/ref?
        // Actually, for strict audit, we should alter transfer_items.
        
        await conn.query(`
          INSERT INTO transfer_items (transfer_id, product_id, quantity)
          VALUES (?, ?, ?)
        `, [transferId, productId, quantity])
        
        // Handle specific stock details (Batch, IMEI, Serial)
        // 1. Move OUT from Source
        if (batchNo) {
             await conn.query('UPDATE product_batches SET quantity = quantity - ? WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [quantity, productId, batchNo, sourceWarehouseId])
        } else if (imei) {
             await conn.query('UPDATE product_imeis SET warehouse_id = ? WHERE product_id = ? AND imei = ?', [destinationWarehouseId, productId, imei])
        } else if (serial) {
             await conn.query('UPDATE product_serials SET warehouse_id = ? WHERE product_id = ? AND serial_no = ?', [destinationWarehouseId, productId, serial])
        }

        // 2. Move IN to Destination
        if (batchNo) {
             // Check if batch exists in destination
             const [destBatch] = await conn.query('SELECT id, quantity FROM product_batches WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [productId, batchNo, destinationWarehouseId])
             
             if (destBatch.length > 0) {
                 await conn.query('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?', [quantity, destBatch[0].id])
             } else {
                 // Get expiry from source batch
                 const [srcBatch] = await conn.query('SELECT expiry_date FROM product_batches WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [productId, batchNo, sourceWarehouseId])
                 
                 // If source batch not found (maybe fully depleted in same transaction?), try to find any batch with same number
                 let expiry = srcBatch.length > 0 ? srcBatch[0].expiry_date : null
                 
                 if (!expiry) {
                     const [anyBatch] = await conn.query('SELECT expiry_date FROM product_batches WHERE product_id = ? AND batch_no = ? LIMIT 1', [productId, batchNo])
                     if (anyBatch.length > 0) expiry = anyBatch[0].expiry_date
                 }

                 if (expiry) {
                     await conn.query('INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity, warehouse_id) VALUES (?, ?, ?, ?, ?)', 
                         [productId, batchNo, expiry, quantity, destinationWarehouseId])
                 }
             }
        }
        // IMEI/Serial are already moved by UPDATE warehouse_id above

        // Register OUT movement (Source)
        await registerMovement({
          productId,
          warehouseId: sourceWarehouseId,
          type: 'TRANSFER_OUT',
          quantity: quantity,
          referenceId: transferId, 
          notes: `Transferencia #${transferId} a almacén ${destinationWarehouseId} ${batchNo ? `(Lote: ${batchNo})` : ''} ${imei ? `(IMEI: ${imei})` : ''} ${serial ? `(SN: ${serial})` : ''}`,
          userId: req.user.id
        }, conn)
        
        // Register IN movement (Destination)
        await registerMovement({
          productId,
          warehouseId: destinationWarehouseId,
          type: 'TRANSFER_IN',
          quantity: quantity,
          referenceId: transferId, 
          notes: `Transferencia #${transferId} desde almacén ${sourceWarehouseId} ${batchNo ? `(Lote: ${batchNo})` : ''} ${imei ? `(IMEI: ${imei})` : ''} ${serial ? `(SN: ${serial})` : ''}`,
          userId: req.user.id
        }, conn)
      }
      
      await conn.commit()
      return res.json({ success: true, transferId })
      
    } catch (err) {
      await conn.rollback()
      console.error('Transfer Transaction Error:', err)
      // Check for custom errors from registerMovement (e.g., insufficient stock)
      if (err.message && err.message.includes('Stock insuficiente')) {
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
