import express from 'express'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()

// Listar movimientos de inventario
router.get('/movements', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    
    // Filtros opcionales (query params)
    const { productId, warehouseId, type, limit = 100, startDate, endDate, kardex } = req.query
    
    let query = `
      SELECT 
        im.id,
        im.created_at as date,
        im.type,
        im.quantity,
        im.reference_id,
        im.notes,
        p.name as product_name,
        p.product_code,
        p.price,
        p.cost,
        w.name as warehouse_name,
        u.name as user_name
      FROM inventory_movements im
      JOIN products p ON im.product_id = p.id
      JOIN warehouses w ON im.warehouse_id = w.id
      LEFT JOIN users u ON im.user_id = u.id
      WHERE 1=1
    `
    const params = []
    
    if (productId) {
      query += ` AND im.product_id = ?`
      params.push(productId)
    }
    
    if (warehouseId) {
      query += ` AND im.warehouse_id = ?`
      params.push(warehouseId)
    }
    
    if (type) {
      query += ` AND im.type = ?`
      params.push(type)
    }

    if (startDate) {
      query += ` AND im.created_at >= ?`
      params.push(startDate + ' 00:00:00')
    }

    if (endDate) {
      query += ` AND im.created_at <= ?`
      params.push(endDate + ' 23:59:59')
    }
    
    if (kardex === 'true') {
      query += ` ORDER BY im.created_at ASC`
      // No limit for kardex (or very high)
    } else {
      query += ` ORDER BY im.created_at DESC LIMIT ?`
      params.push(Number(limit))
    }
    
    const [rows] = await pool.query(query, params)
    return res.json(rows)
  } catch (err) {
    console.error('Inventory Movements GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Obtener stock actual (resumen)
router.get('/stock', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool()
    const { warehouseId } = req.query
    
    // 1. Obtener stock base (product_warehouse_stock)
    let query = `
      SELECT 
        i.id,
        i.product_id,
        i.quantity,
        i.warehouse_id,
        p.name as product_name,
        p.product_code,
        p.cost,
        p.price,
        p.product_type,
        w.name as warehouse_name
      FROM product_warehouse_stock i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE 1=1
    `
    const params = []
    
    if (warehouseId) {
      query += ` AND i.warehouse_id = ?`
      params.push(warehouseId)
    }
    
    query += ` ORDER BY p.name ASC`
    
    const [rows] = await pool.query(query, params)
    
    // 2. Enriquecer con detalles (IMEI, Serial, Lote) si corresponde
    // Para no hacer N queries, podemos hacer una segunda query masiva o hacerlo on-demand.
    // Dado que es un reporte, intentaremos agrupar.
    
    // Filtramos productos que requieren detalle
    const productsWithDetails = rows.filter(r => ['IMEI', 'SERIAL', 'MEDICINAL'].includes(r.product_type))
    
    if (productsWithDetails.length > 0) {
        // Extraer IDs únicos para evitar duplicados en la cláusula IN
        const productIds = [...new Set(productsWithDetails.map(r => r.product_id))]
        
        if (productIds.length > 0) {
          // Fetch IMEIs
          const [imeis] = await pool.query(
              `SELECT product_id, imei, status, warehouse_id FROM product_imeis WHERE product_id IN (?) AND status = 'AVAILABLE'`,
              [productIds]
          )
          
          // Fetch Serials
          const [serials] = await pool.query(
              `SELECT product_id, serial_no, status, warehouse_id FROM product_serials WHERE product_id IN (?) AND status = 'AVAILABLE'`,
              [productIds]
          )
          
          // Fetch Batches (Lotes) - MEDICINAL
          const [batches] = await pool.query(
              `SELECT product_id, batch_no, quantity, expiry_date, warehouse_id FROM product_batches WHERE product_id IN (?) AND quantity > 0`,
              [productIds]
          )

          // Asignar a cada row
          for (const row of rows) {
              // Filter details by the row's warehouse_id
              const currentWarehouseId = row.warehouse_id ? Number(row.warehouse_id) : 1 // Default to 1 if null
              const stockQty = Number(row.quantity || 0)

              if (row.product_type === 'IMEI') {
                  const filtered = imeis
                    .filter(x => x.product_id === row.product_id && (x.warehouse_id ? Number(x.warehouse_id) : 1) === currentWarehouseId)
                  
                  const items = filtered.map(x => x.imei)
                  const detailQty = items.length
                  
                  let detailStr = items.length > 0 ? items.join('\n') : ''
                  if (detailQty !== stockQty) {
                      detailStr += `\n[⚠️ Mismatch: ${detailQty} IMEIs vs Stock ${stockQty}]`
                  }
                  row.details = detailStr

              } else if (row.product_type === 'SERIAL') {
                  const filtered = serials
                    .filter(x => x.product_id === row.product_id && (x.warehouse_id ? Number(x.warehouse_id) : 1) === currentWarehouseId)
                  
                  const items = filtered.map(x => x.serial_no)
                  const detailQty = items.length

                  let detailStr = items.length > 0 ? items.join('\n') : ''
                  if (detailQty !== stockQty) {
                      detailStr += `\n[⚠️ Mismatch: ${detailQty} Series vs Stock ${stockQty}]`
                  }
                  row.details = detailStr

              } else if (row.product_type === 'MEDICINAL') {
                  const filtered = batches
                      .filter(x => x.product_id === row.product_id && (x.warehouse_id ? Number(x.warehouse_id) : 1) === currentWarehouseId)
                  
                  const detailQty = filtered.reduce((sum, b) => sum + Number(b.quantity), 0)
                  const items = filtered.map(x => `Lote: ${x.batch_no} (${x.quantity}) [Vence: ${x.expiry_date ? new Date(x.expiry_date).toISOString().slice(0,10) : 'N/A'}]`)
                  
                  let detailStr = items.length > 0 ? items.join('\n') : ''
                  if (detailQty !== stockQty) {
                       detailStr += `\n[⚠️ Mismatch: Lotes suman ${detailQty} vs Stock ${stockQty}]`
                  }
                  row.details = detailStr

              } else {
                  row.details = ''
              }
          }
        }
    } else {
        // Asegurar que todos tengan la propiedad details aunque sea vacía
        for (const row of rows) {
            row.details = ''
        }
    }

    return res.json(rows)
  } catch (err) {
    console.error('Inventory Stock GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

import { registerMovement } from '../services/inventory.js'

// Crear movimiento manual (Ajuste)
router.post('/adjust', authMiddleware, async (req, res) => {
  try {
    const { productId, warehouseId, type, quantity, notes, batches, imeis, serials } = req.body
    
    if (!productId || !warehouseId || !type || !quantity) {
      return res.status(400).json({ error: 'Faltan datos requeridos' })
    }

    // Validar tipo
    if (!['INITIAL', 'ADJUSTMENT'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de movimiento inválido para ajuste manual' })
    }

    const qty = Number(quantity)
    if (qty === 0) return res.status(400).json({ error: 'La cantidad no puede ser 0' })

    const pool = await getPool()
    const conn = await pool.getConnection()
    
    try {
      await conn.beginTransaction()

      // Determinar tipo real para el servicio (ADJUSTMENT_IN o ADJUSTMENT_OUT)
      // Si el usuario seleccionó INITIAL, siempre es positivo (entrada)
      // Si es ADJUSTMENT, depende del signo
      let realType = type
      let absQty = Math.abs(qty)

      if (type === 'ADJUSTMENT') {
        realType = qty > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'
      } else if (type === 'INITIAL') {
        if (qty < 0) throw new Error('El stock inicial no puede ser negativo')
      }

      await registerMovement({
        productId,
        warehouseId,
        type: realType,
        quantity: absQty,
        userId: req.user?.id,
        notes: notes || 'Ajuste manual de inventario'
      }, conn)

      // Si es una entrada (qty > 0), registrar detalles
      if (qty > 0) {
        // 1. Lotes (Medicinal)
        if (batches && Array.isArray(batches) && batches.length > 0) {
          for (const batch of batches) {
            if (batch.batchNo && batch.expiryDate && batch.quantity > 0) {
              await conn.query(
                'INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity) VALUES (?, ?, ?, ?)',
                [productId, batch.batchNo, batch.expiryDate, batch.quantity]
              )
            }
          }
        }

        // 2. IMEIs
        if (imeis && Array.isArray(imeis) && imeis.length > 0) {
          // Validar cantidad
          if (imeis.length !== absQty) {
             // Opcional: permitir parciales? Mejor estricto.
             // throw new Error(`La cantidad de IMEIs (${imeis.length}) no coincide con la cantidad del ajuste (${absQty})`)
          }
          for (const imei of imeis) {
            if (!imei) continue
            // Verificar duplicados
            const [existing] = await conn.query('SELECT id FROM product_imeis WHERE product_id = ? AND imei = ?', [productId, imei])
            if (existing.length > 0) throw new Error(`El IMEI ${imei} ya existe`)
            
            await conn.query(
              'INSERT INTO product_imeis (product_id, imei, status) VALUES (?, ?, "AVAILABLE")',
              [productId, imei]
            )
          }
        }

        // 3. Series
        if (serials && Array.isArray(serials) && serials.length > 0) {
          if (serials.length !== absQty) {
             // throw new Error(`La cantidad de series (${serials.length}) no coincide con la cantidad del ajuste (${absQty})`)
          }
          for (const serial of serials) {
            if (!serial) continue
            // Verificar duplicados
            const [existing] = await conn.query('SELECT id FROM product_serials WHERE product_id = ? AND serial_no = ?', [productId, serial])
            if (existing.length > 0) throw new Error(`La serie ${serial} ya existe`)

            await conn.query(
              'INSERT INTO product_serials (product_id, serial_no, status) VALUES (?, ?, "AVAILABLE")',
              [productId, serial]
            )
          }
        }
      }

      await conn.commit()
      return res.json({ success: true })
    } catch (err) {
      await conn.rollback()
      console.error('Inventory Adjust Transaction Error:', err)
      return res.status(500).json({ error: err.message || 'Error al procesar ajuste' })
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error('Inventory Adjust POST error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
