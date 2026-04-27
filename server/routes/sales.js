import express from 'express'
import { authMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { registerMovement } from '../services/inventory.js'

const router = express.Router()

// Listar ventas (historial)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit || 50))
    const offset = Math.max(0, Number(req.query.offset || 0))
    const search = (req.query.search || '').toString().trim()

    const pool = await getPool()
    let query = `
      SELECT s.*, c.name as customer_name,
             i.paid as credit_fully_paid
      FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN installments i ON s.id = i.sale_id
    `
    const params = []

    if (search) {
      query += ` WHERE s.doc_no LIKE ? OR c.name LIKE ? OR s.id = ?`
      params.push(`%${search}%`, `%${search}%`, search)
    }

    query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const [rows] = await pool.query(query, params)
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id
    `
    const countParams = []
    if (search) {
      countQuery += ` WHERE s.doc_no LIKE ? OR c.name LIKE ? OR s.id = ?`
      countParams.push(`%${search}%`, `%${search}%`, search)
    }
    const [countRows] = await pool.query(countQuery, countParams)
    const totalRecords = countRows[0].total

    res.json({
      data: rows,
      pagination: {
        total: totalRecords,
        limit,
        offset
      }
    })
  } catch (err) {
    console.error('Sales list error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Crear nueva venta
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { customerId, items, total, isCredit, docNo, paymentMethod, receivedAmount, changeAmount, referenceNumber } = req.body
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No hay items en la venta' })
    }

    const pool = await getPool()
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const [shiftRows] = await conn.query(
        'SELECT id, opened_at, opening_balance FROM cashbox_shifts WHERE opened_by = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [req.user.id]
      )
      const shift = shiftRows?.[0]
      if (!shift) {
        await conn.rollback()
        return res.status(400).json({ error: 'Caja cerrada. Debes abrir caja para realizar ventas.' })
      }

      const finalPaymentMethod = paymentMethod || (isCredit ? 'CREDIT' : 'CASH')

      // 1. Crear Venta
      const [saleResult] = await conn.query(
        'INSERT INTO sales (customer_id, doc_no, total, is_credit, payment_method, received_amount, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [customerId || null, docNo || null, total, isCredit ? 1 : 0, finalPaymentMethod, receivedAmount || 0, changeAmount || 0, referenceNumber || null]
      )
      const saleId = saleResult.insertId

      // 1.1 Si es crédito, crear cuota inicial (installment)
      if (isCredit) {
        // Por defecto 30 días para pagar, o configurable
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 30)
        
        await conn.query(
          'INSERT INTO installments (sale_id, due_date, amount, paid) VALUES (?, ?, ?, 0)',
          [saleId, dueDate, total]
        )
      }

      // 2. Procesar items
      for (const item of items) {
        // item: { productId, quantity, price, imei, serial }
        const itemTotal = Number(item.price) * Number(item.quantity)
        
        // Insertar sale_item
        await conn.query(
          'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total, serial, imei) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [saleId, item.productId, item.quantity, item.price, itemTotal, item.serial || null, item.imei || null]
        )

        // Actualizar stock del producto (tablas específicas) y registrar movimiento
        // Asumimos venta desde Tienda (ID 1) por defecto para POS
        const saleWarehouseId = 1 

        if (item.serial) {
             await conn.query('UPDATE product_serials SET status = "SOLD" WHERE product_id = ? AND serial_no = ? AND warehouse_id = ?', [item.productId, item.serial, saleWarehouseId])
        } else if (item.imei) {
             await conn.query('UPDATE product_imeis SET status = "SOLD" WHERE product_id = ? AND imei = ? AND warehouse_id = ?', [item.productId, item.imei, saleWarehouseId])
        } else if (item.batchNo) {
            // Producto medicinal con lote
             await conn.query('UPDATE product_batches SET quantity = quantity - ? WHERE product_id = ? AND batch_no = ? AND warehouse_id = ?', [item.quantity, item.productId, item.batchNo, saleWarehouseId])
        }

        // Registrar movimiento de inventario (SALE)
        // Esto actualiza product_warehouse_stock y crea entrada en inventory_movements
        await registerMovement({
            productId: item.productId,
            warehouseId: saleWarehouseId, // Tienda
            type: 'SALE',
            quantity: item.quantity,
            referenceId: saleId,
            userId: req.user?.id,
            notes: `Venta #${saleResult.insertId}`
        }, conn)
      }

      if (finalPaymentMethod === 'CASH') {
        await conn.query(
          'INSERT INTO cash_movements (shift_id, type, concept, amount, ref_type, ref_id) VALUES (?, "IN", ?, ?, "SALE", ?)',
          [shift.id, `Venta #${saleId}`, total, saleId]
        )
      }

      await conn.commit()
      res.json({ success: true, saleId })

    } catch (err) {
      await conn.rollback()
      console.error('Error creando venta:', err)
      res.status(500).json({ error: 'Error al procesar la venta' })
    } finally {
      conn.release()
    }

  } catch (err) {
    console.error('Sales POST error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Ventas del día: suma de total por fecha
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const date = (req.query.date || '').toString().trim()
    const pool = await getPool()
    let rows
    if (date) {
      ;[rows] = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE DATE(created_at) = ?', [date])
    } else {
      ;[rows] = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE DATE(created_at) = CURDATE()')
    }
    const total = Number(rows?.[0]?.total || 0)
    return res.json({ total })
  } catch (err) {
    console.error('Sales daily GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Créditos por vencer: cuotas no pagadas con due_date dentro de un rango
router.get('/credits/upcoming', authMiddleware, async (req, res) => {
  try {
    const days = Math.max(0, Number(req.query.days || 7))
    const pool = await getPool()
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS c FROM installments WHERE paid = 0 AND due_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)',
      [days]
    )
    const count = Number(rows?.[0]?.c || 0)
    return res.json({ count, days })
  } catch (err) {
    console.error('Sales upcoming credits GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Resumen de ventas por rango de fechas (inclusive)
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const start = (req.query.start || '').toString().slice(0, 10)
    const end = (req.query.end || '').toString().slice(0, 10)
    const pool = await getPool()
    let rows
    if (start && end) {
      ;[rows] = await pool.query(
        'SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      )
    } else {
      // Fallback: hoy
      ;[rows] = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE DATE(created_at) = CURDATE()')
    }
    const total = Number(rows?.[0]?.total || 0)
    return res.json({ total, start: start || null, end: end || null })
  } catch (err) {
    console.error('Sales summary GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})
// Listado detallado de cuotas próximas a vencer
router.get('/credits/upcoming/list', authMiddleware, async (req, res) => {
  try {
    const days = Math.max(0, Number(req.query.days || 7))
    const limit = Math.max(1, Number(req.query.limit || 10))
    const pool = await getPool()
    const [rows] = await pool.query(
      `SELECT i.id AS installment_id, i.sale_id, i.due_date, i.amount,
              s.doc_no, s.total AS sale_total,
              c.name AS customer_name
         FROM installments i
         JOIN sales s ON s.id = i.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
        WHERE i.paid = 0
          AND i.due_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY i.due_date ASC, i.id ASC
        LIMIT ?`,
      [days, limit]
    )
    const items = (rows || []).map(r => ({
      id: r.installment_id,
      saleId: r.sale_id,
      dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
      amount: Number(r.amount || 0),
      docNo: r.doc_no || '',
      saleTotal: Number(r.sale_total || 0),
      customerName: r.customer_name || 'Sin cliente',
    }))
    return res.json({ days, limit, items })
  } catch (err) {
    console.error('Sales upcoming credits list GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Obtener detalle de una venta
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const saleId = req.params.id
    const pool = await getPool()
    
    // Venta header
    const [saleRows] = await pool.query(`
      SELECT s.*, c.name as customer_name, c.document as customer_document, c.address as customer_address, c.phone as customer_phone,
             i.paid as credit_fully_paid
      FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN installments i ON s.id = i.sale_id
      WHERE s.id = ?
    `, [saleId])
    
    if (saleRows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' })
    }
    const sale = saleRows[0]

    // Items
    const [items] = await pool.query(`
      SELECT si.*, p.name as product_name, p.sku
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `, [saleId])

    res.json({ ...sale, items })
  } catch (err) {
    console.error('Sale detail error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Cancelar venta
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const saleId = req.params.id
    const { reason } = req.body
    
    if (!reason) {
      return res.status(400).json({ error: 'Se requiere un motivo para la cancelación' })
    }

    const pool = await getPool()
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      // 1. Verificar estado actual
      const [saleRows] = await conn.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId])
      if (saleRows.length === 0) {
        await conn.rollback()
        return res.status(404).json({ error: 'Venta no encontrada' })
      }

      const sale = saleRows[0]
      if (sale.status === 'CANCELLED') {
        await conn.rollback()
        return res.status(400).json({ error: 'La venta ya está cancelada' })
      }

      // 2. Actualizar estado de venta
      await conn.query(
        'UPDATE sales SET status = ?, cancellation_reason = ? WHERE id = ?',
        ['CANCELLED', reason, saleId]
      )

      // 3. Restaurar stock
      const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId])
      for (const item of items) {
        // Restaurar stock usando servicio centralizado
        await registerMovement({
            productId: item.product_id,
            warehouseId: 1, // Tienda
            type: 'ADJUSTMENT',
            quantity: item.quantity,
            referenceId: saleId,
            userId: req.user?.id,
            notes: `Cancelación Venta #${saleId} - ${reason}`
        }, conn)
      }

      // 4. Si es crédito, anular cuota pendiente
      if (sale.is_credit) {
        await conn.query(
          'UPDATE installments SET paid = 1, amount = 0 WHERE sale_id = ?',
          [saleId]
        )
      }

      await conn.commit()
      res.json({ success: true, message: 'Venta cancelada exitosamente' })

    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

  } catch (err) {
    console.error('Sale cancel error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
