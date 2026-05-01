import express from 'express'
import { authMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { registerMovement } from '../services/inventory.js'

const router = express.Router()

async function columnExists(db, table, column) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column])
  return Array.isArray(rows) && rows.length > 0
}

async function fkExists(db, table, fkName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, fkName]
  )
  return Number(rows?.[0]?.c || 0) > 0
}

async function ensureSalesSchema(db) {
  const hasSalesUserId = await columnExists(db, 'sales', 'user_id')
  if (!hasSalesUserId) {
    await db.query('ALTER TABLE sales ADD COLUMN user_id INT NULL')
  }

  if (!(await fkExists(db, 'sales', 'fk_sales_user'))) {
    try {
      await db.query(`
        ALTER TABLE sales
        ADD CONSTRAINT fk_sales_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      `)
    } catch (error) {
      console.warn(`Skipped fk_sales_user: ${error.message}`)
    }
  }

  // Completa ventas históricas usando primero inventory_movements y luego caja.
  await db.query(`
    UPDATE sales s
    LEFT JOIN (
      SELECT reference_id AS sale_id, MAX(user_id) AS user_id
      FROM inventory_movements
      WHERE type = 'SALE'
        AND reference_id IS NOT NULL
        AND user_id IS NOT NULL
      GROUP BY reference_id
    ) sale_inventory_user ON sale_inventory_user.sale_id = s.id
    SET s.user_id = sale_inventory_user.user_id
    WHERE (s.user_id IS NULL OR s.user_id = 0)
      AND sale_inventory_user.user_id IS NOT NULL
  `)

  await db.query(`
    UPDATE sales s
    LEFT JOIN (
      SELECT cm.ref_id AS sale_id, MAX(cs.opened_by) AS opened_by
      FROM cash_movements cm
      JOIN cashbox_shifts cs ON cs.id = cm.shift_id
      WHERE cm.ref_type = 'SALE' AND cm.ref_id IS NOT NULL
      GROUP BY cm.ref_id
    ) sale_shift ON sale_shift.sale_id = s.id
    SET s.user_id = sale_shift.opened_by
    WHERE (s.user_id IS NULL OR s.user_id = 0)
      AND sale_shift.opened_by IS NOT NULL
  `)
}

async function buildSalesContext(db) {
  await ensureSalesSchema(db)
  const hasSalesUserId = await columnExists(db, 'sales', 'user_id')

  return {
    hasSalesUserId,
    sellerIdExpr: hasSalesUserId
      ? 'COALESCE(s.user_id, sale_inventory_user.user_id, sale_shift.opened_by)'
      : 'COALESCE(sale_inventory_user.user_id, sale_shift.opened_by)',
    sellerNameExpr: hasSalesUserId
      ? "COALESCE(su.name, iu.name, cu.name, 'SIN USUARIO')"
      : "COALESCE(iu.name, cu.name, 'SIN USUARIO')",
    sellerJoin: hasSalesUserId
      ? `
        LEFT JOIN users su ON su.id = s.user_id
        LEFT JOIN users iu ON iu.id = sale_inventory_user.user_id
      `
      : 'LEFT JOIN users iu ON iu.id = sale_inventory_user.user_id',
    baseJoins: `
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN (
        SELECT sale_id, MIN(paid) AS credit_fully_paid
        FROM installments
        GROUP BY sale_id
      ) i ON i.sale_id = s.id
      LEFT JOIN (
        SELECT si.sale_id,
               COALESCE(SUM(si.quantity * COALESCE(p.cost, 0)), 0) AS cost_total,
               COALESCE(SUM(si.total - (si.quantity * COALESCE(p.cost, 0))), 0) AS profit
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        GROUP BY si.sale_id
      ) calc ON calc.sale_id = s.id
      LEFT JOIN (
        SELECT reference_id AS sale_id, MAX(user_id) AS user_id
        FROM inventory_movements
        WHERE type = 'SALE'
          AND reference_id IS NOT NULL
          AND user_id IS NOT NULL
        GROUP BY reference_id
      ) sale_inventory_user ON sale_inventory_user.sale_id = s.id
      LEFT JOIN (
        SELECT cm.ref_id AS sale_id, MAX(cs.opened_by) AS opened_by
        FROM cash_movements cm
        JOIN cashbox_shifts cs ON cs.id = cm.shift_id
        WHERE cm.ref_type = 'SALE' AND cm.ref_id IS NOT NULL
        GROUP BY cm.ref_id
      ) sale_shift ON sale_shift.sale_id = s.id
      LEFT JOIN users cu ON cu.id = sale_shift.opened_by
    `,
  }
}

function getSalesFilters(req, context, forceUserId = null) {
  const search = (req.query.search || '').toString().trim()
  const startDate = (req.query.startDate || '').toString().slice(0, 10)
  const endDate = (req.query.endDate || '').toString().slice(0, 10)
  const requestedUserId = Number(req.query.userId || 0)
  const effectiveUserId = forceUserId || (req.user?.role === 'ADMIN' ? requestedUserId : Number(req.user?.id || 0))
  const where = []
  const params = []

  if (search) {
    where.push(`(s.doc_no LIKE ? OR c.name LIKE ? OR s.id = ? OR ${context.sellerNameExpr} LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, Number(search) || 0, `%${search}%`)
  }
  if (startDate) {
    where.push('DATE(s.created_at) >= ?')
    params.push(startDate)
  }
  if (endDate) {
    where.push('DATE(s.created_at) <= ?')
    params.push(endDate)
  }
  if (effectiveUserId > 0) {
    where.push(`${context.sellerIdExpr} = ?`)
    params.push(effectiveUserId)
  }

  return {
    whereClause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

function buildSalesSelect(context, canSeeProfit) {
  return `
    SELECT s.*, c.name AS customer_name,
           i.credit_fully_paid,
           ${canSeeProfit ? 'COALESCE(calc.cost_total, 0)' : 'NULL'} AS cost_total,
           ${canSeeProfit ? "CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE COALESCE(calc.profit, 0) END" : 'NULL'} AS profit,
           ${context.sellerIdExpr} AS seller_id,
           ${context.sellerNameExpr} AS seller_name
    FROM sales s
    ${context.baseJoins}
    ${context.sellerJoin}
  `
}

// Listar ventas (historial)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit || 50))
    const offset = Math.max(0, Number(req.query.offset || 0))
    const pool = await getPool()
    await ensureSalesSchema(pool)
    const context = await buildSalesContext(pool)
    const canSeeProfit = req.user?.role === 'ADMIN'
    const { whereClause, params } = getSalesFilters(req, context)
    const query = `
      ${buildSalesSelect(context, canSeeProfit)}
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
    const rowsParams = [...params, limit, offset]
    const [rows] = await pool.query(query, rowsParams)

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM sales s
      ${context.baseJoins}
      ${context.sellerJoin}
      ${whereClause}
    `
    const [countRows] = await pool.query(countQuery, params)
    const totalRecords = Number(countRows?.[0]?.total || 0)

    const [summaryRows] = await pool.query(
      `
        SELECT COUNT(*) AS records,
               COALESCE(SUM(s.total), 0) AS gross_total,
               COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE s.total END), 0) AS net_total,
               COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE COALESCE(calc.profit, 0) END), 0) AS total_profit,
               COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_count
        FROM sales s
        ${context.baseJoins}
        ${context.sellerJoin}
        ${whereClause}
      `,
      params
    )

    const byUserRows = canSeeProfit
      ? (await pool.query(
          `
            SELECT ${context.sellerIdExpr} AS user_id,
                   ${context.sellerNameExpr} AS user_name,
                   COUNT(*) AS sales_count,
                   COALESCE(SUM(s.total), 0) AS gross_total,
                   COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE s.total END), 0) AS total,
                   COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE COALESCE(calc.profit, 0) END), 0) AS profit,
                   COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_count
            FROM sales s
            ${context.baseJoins}
            ${context.sellerJoin}
            ${whereClause}
            GROUP BY ${context.sellerIdExpr}, ${context.sellerNameExpr}
            ORDER BY total DESC, sales_count DESC, user_name ASC
          `,
          params
        ))[0]
      : []

    return res.json({
      data: rows,
      pagination: {
        total: totalRecords,
        limit,
        offset,
      },
      summary: {
        records: Number(summaryRows?.[0]?.records || 0),
        grossTotal: Number(summaryRows?.[0]?.gross_total || 0),
        netTotal: Number(summaryRows?.[0]?.net_total || 0),
        totalProfit: canSeeProfit ? Number(summaryRows?.[0]?.total_profit || 0) : 0,
        cancelledCount: Number(summaryRows?.[0]?.cancelled_count || 0),
      },
      byUser: (byUserRows || []).map(row => ({
        userId: row.user_id ? Number(row.user_id) : null,
        userName: row.user_name || 'SIN USUARIO',
        salesCount: Number(row.sales_count || 0),
        grossTotal: Number(row.gross_total || 0),
        total: Number(row.total || 0),
        profit: Number(row.profit || 0),
        cancelledCount: Number(row.cancelled_count || 0),
      })),
    })
  } catch (err) {
    console.error('Sales list error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/my-report', authMiddleware, async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit || 50))
    const offset = Math.max(0, Number(req.query.offset || 0))
    const pool = await getPool()
    await ensureSalesSchema(pool)
    const context = await buildSalesContext(pool)
    const { whereClause, params } = getSalesFilters(req, context, Number(req.user?.id || 0))
    const query = `
      ${buildSalesSelect(context, false)}
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
    const [rows] = await pool.query(query, [...params, limit, offset])
    const [countRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM sales s
        ${context.baseJoins}
        ${context.sellerJoin}
        ${whereClause}
      `,
      params
    )
    const [summaryRows] = await pool.query(
      `
        SELECT COUNT(*) AS records,
               COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE s.total END), 0) AS net_total,
               COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_count
        FROM sales s
        ${context.baseJoins}
        ${context.sellerJoin}
        ${whereClause}
      `,
      params
    )

    return res.json({
      data: rows,
      pagination: {
        total: Number(countRows?.[0]?.total || 0),
        limit,
        offset,
      },
      summary: {
        records: Number(summaryRows?.[0]?.records || 0),
        netTotal: Number(summaryRows?.[0]?.net_total || 0),
        cancelledCount: Number(summaryRows?.[0]?.cancelled_count || 0),
      },
    })
  } catch (err) {
    console.error('My sales report error:', err)
    return res.status(500).json({ error: 'Server error' })
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
      await ensureSalesSchema(conn)
      const hasSalesUserId = await columnExists(conn, 'sales', 'user_id')

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
      const saleInsertSql = hasSalesUserId
        ? 'INSERT INTO sales (customer_id, user_id, doc_no, total, is_credit, payment_method, received_amount, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        : 'INSERT INTO sales (customer_id, doc_no, total, is_credit, payment_method, received_amount, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      const saleInsertParams = hasSalesUserId
        ? [customerId || null, req.user.id, docNo || null, total, isCredit ? 1 : 0, finalPaymentMethod, receivedAmount || 0, changeAmount || 0, referenceNumber || null]
        : [customerId || null, docNo || null, total, isCredit ? 1 : 0, finalPaymentMethod, receivedAmount || 0, changeAmount || 0, referenceNumber || null]
      const [saleResult] = await conn.query(saleInsertSql, saleInsertParams)
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
    await ensureSalesSchema(pool)
    const context = await buildSalesContext(pool)
    const canSeeProfit = req.user?.role === 'ADMIN'
    const ownerFilter = canSeeProfit ? '' : ` AND ${context.sellerIdExpr} = ?`
    const saleParams = canSeeProfit ? [saleId] : [saleId, Number(req.user?.id || 0)]
    
    // Venta header
    const [saleRows] = await pool.query(
      `
        SELECT s.*, c.name AS customer_name, c.document AS customer_document, c.address AS customer_address, c.phone AS customer_phone,
               i.credit_fully_paid,
               ${canSeeProfit ? 'COALESCE(calc.cost_total, 0)' : 'NULL'} AS cost_total,
               ${canSeeProfit ? "CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE COALESCE(calc.profit, 0) END" : 'NULL'} AS profit,
               ${context.sellerIdExpr} AS seller_id,
               ${context.sellerNameExpr} AS seller_name
        FROM sales s
        ${context.baseJoins}
        ${context.sellerJoin}
        WHERE s.id = ?${ownerFilter}
      `,
      saleParams
    )
    
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
