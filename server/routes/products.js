import express from 'express'
import multer from 'multer'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { registerMovement } from '../services/inventory.js'
import { uploadsDir } from '../paths.js'

const router = express.Router()
const upload = multer({ dest: uploadsDir })

// Ensure warehouse stock table and default warehouse id=1
async function ensureWarehouseStockTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS product_warehouse_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_product_warehouse (product_id, warehouse_id),
    CONSTRAINT fk_pws_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_pws_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
  )`)
}

async function ensureDefaultWarehouseId1(pool) {
  // Create warehouses table if missing
  await pool.query(`CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
  )`)
  // Ensure a warehouse with id=1 exists
  const [rows] = await pool.query('SELECT id FROM warehouses WHERE id = 1 LIMIT 1')
  if (!Array.isArray(rows) || rows.length === 0) {
    // Try to insert with explicit id=1; if duplicate on name, adjust
    try {
      await pool.query('INSERT INTO warehouses (id, name) VALUES (1, ?)', ['PRINCIPAL'])
    } catch (err) {
      // If explicit id insert fails due to constraints, create a row and then set id if needed
      await pool.query('INSERT INTO warehouses (name) VALUES (?)', ['PRINCIPAL'])
    }
  }
}

// Helpers para parsear JSON de FormData y sumar cantidades
function hasNum(v) {
  return v !== null && v !== undefined && !Number.isNaN(Number(v)) && String(v).trim() !== ''
}
function parseJsonArrayField(body, key) {
  const raw = body?.[key]
  if (!raw || typeof raw !== 'string') return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function sumQuantity(arr, quantityKey = 'quantity') {
  return arr.reduce((acc, v) => acc + Number(v?.[quantityKey] || 0), 0)
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { warehouseId } = req.query
    const pool = await getPool()
    
    // Si se especifica warehouseId, calculamos stock local y 'otros'
    // Si no, stock es global y other_stock es 0
    let selectStock = `COALESCE(SUM(pws.quantity), 0) as stock, 0 as other_stock`
    const params = []

    if (warehouseId) {
      selectStock = `
        COALESCE(SUM(CASE WHEN pws.warehouse_id = ? THEN pws.quantity ELSE 0 END), 0) as stock,
        COALESCE(SUM(CASE WHEN pws.warehouse_id != ? THEN pws.quantity ELSE 0 END), 0) as other_stock
      `
      params.push(warehouseId, warehouseId)
    }

    let query = `
      SELECT p.id, p.name, p.sku, p.product_code, p.category_id, p.brand_id, p.supplier_id, p.price, p.price2, p.price3, p.cost, 
              ${selectStock}, 
              (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements WHERE product_id = p.id AND type = 'INITIAL') as initial_stock, 
              p.min_stock, p.unit, p.description, p.image_url, p.product_type, p.alt_name, p.generic_name, p.shelf_location 
       FROM products p 
       LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id`
    
    // No filtramos en el JOIN para poder calcular 'other_stock'
    
    query += ` GROUP BY p.id ORDER BY p.id DESC`

    const [rows] = await pool.query(query, params)

    const items = rows.map(r => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      productCode: r.product_code || undefined,
      categoryId: r.category_id ?? undefined,
      brandId: r.brand_id ?? undefined,
      supplierId: r.supplier_id ?? undefined,
      price: Number(r.price ?? 0),
      price2: Number(r.price2 ?? 0),
      price3: Number(r.price3 ?? 0),
      cost: Number(r.cost ?? 0),
      stock: Number(r.stock ?? 0),
      otherStock: Number(r.other_stock ?? 0),
      initialStock: Number(r.initial_stock ?? 0),
      minStock: Number(r.min_stock ?? 0),
      unit: r.unit || undefined,
      description: r.description || undefined,
      imageUrl: r.image_url || undefined,
      productType: r.product_type || undefined,
      altName: r.alt_name || undefined,
      genericName: r.generic_name || undefined,
      shelfLocation: r.shelf_location || undefined,
    }))
    return res.json(items)
  } catch (err) {
    console.error('Products GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// NEW: get product with arrays for editing
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { warehouseId } = req.query
    const pool = await getPool()
    
    let selectStock = `COALESCE(SUM(pws.quantity), 0) as stock, 0 as other_stock`
    const params = []

    if (warehouseId) {
      selectStock = `
        COALESCE(SUM(CASE WHEN pws.warehouse_id = ? THEN pws.quantity ELSE 0 END), 0) as stock,
        COALESCE(SUM(CASE WHEN pws.warehouse_id != ? THEN pws.quantity ELSE 0 END), 0) as other_stock
      `
      params.push(warehouseId, warehouseId)
    }
    
    params.push(id)

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.sku, p.product_code, p.category_id, p.brand_id, p.supplier_id, p.price, p.price2, p.price3, p.cost, 
              ${selectStock}, 
              (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements WHERE product_id = p.id AND type = 'INITIAL') as initial_stock,
              p.min_stock, p.unit, p.description, p.image_url, p.product_type, p.alt_name, p.generic_name, p.shelf_location 
       FROM products p 
       LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id
       WHERE p.id = ?
       GROUP BY p.id
       LIMIT 1`,
      params
    )
    const r = rows?.[0]
    if (!r) return res.status(404).json({ error: 'Not found' })

    const type = String(r.product_type || 'GENERAL').toUpperCase()
    let batches = []
    let imeis = []
    let serials = []

    if (type === 'MEDICINAL') {
      let query = 'SELECT batch_no, expiry_date, quantity FROM product_batches WHERE product_id = ?'
      const qParams = [id]
      if (warehouseId) {
        query += ' AND warehouse_id = ?'
        qParams.push(warehouseId)
      }
      query += ' ORDER BY expiry_date ASC'
      const [batchRows] = await pool.query(query, qParams)
      batches = (batchRows || []).map(b => ({
        batchNo: b.batch_no || '',
        expiryDate: b.expiry_date ? String(b.expiry_date).slice(0, 10) : '',
        quantity: Number(b.quantity || 0),
      }))
    } else if (type === 'IMEI') {
      let query = 'SELECT imei FROM product_imeis WHERE product_id = ?'
      const qParams = [id]
      if (warehouseId) {
        query += ' AND warehouse_id = ?'
        qParams.push(warehouseId)
      }
      query += ' ORDER BY id ASC'
      const [imeiRows] = await pool.query(query, qParams)
      imeis = (imeiRows || []).map(rw => rw.imei || '')
    } else if (type === 'SERIAL') {
      let query = 'SELECT serial_no FROM product_serials WHERE product_id = ?'
      const qParams = [id]
      if (warehouseId) {
        query += ' AND warehouse_id = ?'
        qParams.push(warehouseId)
      }
      query += ' ORDER BY id ASC'
      const [serialRows] = await pool.query(query, qParams)
      serials = (serialRows || []).map(rw => rw.serial_no || '')
    }

    return res.json({
      id: r.id,
      name: r.name,
      sku: r.sku,
      productCode: r.product_code || undefined,
      categoryId: r.category_id ?? undefined,
      brandId: r.brand_id ?? undefined,
      supplierId: r.supplier_id ?? undefined,
      price: Number(r.price ?? 0),
      price2: Number(r.price2 ?? 0),
      price3: Number(r.price3 ?? 0),
      cost: Number(r.cost ?? 0),
      stock: Number(r.stock ?? 0),
      otherStock: Number(r.other_stock ?? 0),
      initialStock: Number(r.initial_stock ?? 0),
      minStock: Number(r.min_stock ?? 0),
      unit: r.unit || undefined,
      description: r.description || undefined,
      imageUrl: r.image_url || undefined,
      productType: type,
      altName: r.alt_name || undefined,
      genericName: r.generic_name || undefined,
      shelfLocation: r.shelf_location || undefined,
      batches,
      imeis,
      serials,
    })
  } catch (err) {
    console.error('Products GET by id error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Obtener stock por almacén para un producto
router.get('/:id/warehouse-stock', authMiddleware, async (req, res) => {
  try {
    const productId = Number(req.params.id)
    if (!productId || Number.isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto inválido' })
    }
    const pool = await getPool()
    await ensureDefaultWarehouseId1(pool)
    await ensureWarehouseStockTable(pool)
    const [rows] = await pool.query(
      'SELECT pws.warehouse_id AS warehouseId, w.name AS warehouseName, pws.quantity AS quantity FROM product_warehouse_stock pws JOIN warehouses w ON w.id = pws.warehouse_id WHERE pws.product_id = ? ORDER BY w.name ASC',
      [productId]
    )
    const items = (rows || []).map(r => ({
      warehouseId: Number(r.warehouseId),
      warehouseName: r.warehouseName,
      quantity: Number(r.quantity || 0),
    }))
    return res.json(items)
  } catch (err) {
    console.error('Products GET warehouse-stock error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Transferir stock entre almacenes para un producto
router.post('/:id/warehouse-stock/transfer', authMiddleware, roleMiddleware(['ADMIN', 'ALMACEN']), async (req, res) => {
  try {
    const productId = Number(req.params.id)
    const { fromWarehouseId, toWarehouseId, quantity } = req.body || {}
    const fromId = Number(fromWarehouseId)
    const toId = Number(toWarehouseId)
    const qty = Number(quantity)

    if (!productId || Number.isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto inválido' })
    }
    if (!fromId || !toId || Number.isNaN(fromId) || Number.isNaN(toId)) {
      return res.status(400).json({ error: 'IDs de almacén inválidos' })
    }
    if (fromId === toId) {
      return res.status(400).json({ error: 'El almacén origen y destino deben ser distintos' })
    }
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Cantidad inválida' })
    }

    const pool = await getPool()
    await ensureDefaultWarehouseId1(pool)
    await ensureWarehouseStockTable(pool)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      
      // Registrar salida del origen
      await registerMovement({
        productId,
        warehouseId: fromId,
        type: 'TRANSFER_OUT',
        quantity: qty,
        notes: `Transferencia a almacén ${toId}`,
        userId: req.user?.id
      }, conn)

      // Registrar entrada al destino
      await registerMovement({
        productId,
        warehouseId: toId,
        type: 'TRANSFER_IN',
        quantity: qty,
        notes: `Transferencia desde almacén ${fromId}`,
        userId: req.user?.id
      }, conn)

      await conn.commit()
      return res.json({ ok: true })
    } catch (err) {
      try { await conn.rollback() } catch {}
      console.error('Products POST warehouse-stock/transfer txn error:', err)
      return res.status(400).json({ error: err.message || 'Error realizando transferencia' })
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error('Products POST warehouse-stock/transfer error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, sku, productCode, categoryId, brandId, supplierId, price, price2, price3, cost, stock, initialStock, minStock, unit, description, productType, altName, genericName, shelfLocation } = req.body
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null
    const pool = await getPool()

    // Sanear arrays recibidos
    const rawBatches = parseJsonArrayField(req.body, 'batches')
    const batches = rawBatches
      .map(b => ({
        batch_no: String(b?.batch_no ?? b?.batchNo ?? '').trim(),
        expiry_date: b?.expiry_date ?? b?.expiryDate ?? null,
        quantity: Number(b?.quantity ?? 0),
      }))
      .filter(b => b.batch_no.length > 0 && b.quantity > 0)
    const rawImeis = parseJsonArrayField(req.body, 'imeis')
    const imeis = rawImeis.map(x => String(x || '').trim()).filter(s => s.length > 0)
    const rawSerials = parseJsonArrayField(req.body, 'serials')
    const serials = rawSerials.map(x => String(x || '').trim()).filter(s => s.length > 0)
    const type = String(productType || 'GENERAL').toUpperCase()
    let derivedStock = hasNum(stock) ? Number(stock) : 0
    if (type === 'MEDICINAL') derivedStock = sumQuantity(batches, 'quantity')
    else if (type === 'IMEI') derivedStock = imeis.length
    else if (type === 'SERIAL') derivedStock = serials.length

    // Reglas de conteo para IMEI/SERIAL: requerir cantidad exacta según stock inicial
    // REMOVED: Stock logic is now handled via purchases/adjustments
    
    // Validar duplicados dentro del mismo envío (protección backend)
    if (type === 'IMEI' && imeis.length) {
      const dupList = [...new Set(imeis.filter((v, i, arr) => arr.indexOf(v) !== i))]
      if (dupList.length > 0) {
        return res.status(409).json({ error: 'Valores duplicados detectados en IMEIs', duplicate: dupList.join(', ') })
      }
    } else if (type === 'SERIAL' && serials.length) {
      const dupList = [...new Set(serials.filter((v, i, arr) => arr.indexOf(v) !== i))]
      if (dupList.length > 0) {
        return res.status(409).json({ error: 'Valores duplicados detectados en series', duplicate: dupList.join(', ') })
      }
    }

    // Verificar duplicados ANTES de crear nada contra la base de datos
    if (type === 'IMEI' && imeis.length) {
      for (const imei of imeis) {
        const [dupRows] = await pool.query('SELECT id FROM product_imeis WHERE imei = ? LIMIT 1', [imei])
        if (dupRows.length > 0) {
          throw { code: 'ER_DUP_ENTRY', sqlMessage: `Duplicate entry '${imei}' for key 'uniq_imei'`, message: 'IMEI duplicado' }
        }
      }
    }

    // Asegurar tablas auxiliares y almacén por defecto
    await ensureDefaultWarehouseId1(pool)
    await ensureWarehouseStockTable(pool)

      // Usar una sola conexión en transacción para crear todo atómicamente
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const initialStockValue = Number(initialStock ?? derivedStock ?? 0)

      const [result] = await conn.query(
        'INSERT INTO products (name, sku, product_code, category_id, brand_id, supplier_id, price, price2, price3, cost, min_stock, unit, description, image_url, product_type, alt_name, generic_name, shelf_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          name,
          sku || null,
          productCode || null,
          categoryId ? Number(categoryId) : null,
          brandId ? Number(brandId) : null,
          supplierId ? Number(supplierId) : null,
          Number(price || 0),
          Number(price2 || 0),
          Number(price3 || 0),
          Number(cost || 0),
          Number(minStock || 0),
          unit || null,
          description || null,
          imageUrl,
          type,
          altName || null,
          genericName || null,
          shelfLocation || null,
        ]
      )
      const id = result.insertId


      if (type === 'MEDICINAL' && batches.length) {
        await Promise.all(
          batches.map(b =>
            conn.query('INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity) VALUES (?, ?, ?, ?)', [id, b.batch_no, b.expiry_date, Number(b.quantity || 0)])
          )
        )
      } else if (type === 'IMEI' && imeis.length) {
        await Promise.all(imeis.map(imei => conn.query('INSERT INTO product_imeis (product_id, imei) VALUES (?, ?)', [id, String(imei || '')])))
      } else if (type === 'SERIAL' && serials.length) {
        await Promise.all(serials.map(serial => conn.query('INSERT INTO product_serials (product_id, serial_no) VALUES (?, ?)', [id, String(serial || '')])))
      }

      // Registrar movimiento INICIAL si hay stock
      if (initialStockValue > 0) {
        // Usamos el almacén ID 1 por defecto para la creación inicial, o lógica futura para elegir almacén
        // Asignar los detalles (lotes, series, imeis) al almacén ID 1 por defecto
        if (type === 'MEDICINAL' && batches.length) {
          await conn.query('UPDATE product_batches SET warehouse_id = 1 WHERE product_id = ?', [id])
        } else if (type === 'IMEI' && imeis.length) {
          await conn.query('UPDATE product_imeis SET warehouse_id = 1 WHERE product_id = ?', [id])
        } else if (type === 'SERIAL' && serials.length) {
          await conn.query('UPDATE product_serials SET warehouse_id = 1 WHERE product_id = ?', [id])
        }

        await registerMovement({
            productId: id,
            warehouseId: 1, // Default TIENDA/PRINCIPAL
            type: 'INITIAL',
            quantity: initialStockValue,
            notes: 'Inventario inicial al crear producto',
            userId: req.user?.id
        }, conn)
      }

      await conn.commit()

      return res.json({
        id,
        name,
        sku,
        productCode: productCode || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        brandId: brandId ? Number(brandId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        price: Number(price || 0),
        price2: Number(price2 || 0),
        price3: Number(price3 || 0),
        cost: Number(cost || 0),
        stock: initialStockValue, // Return computed for frontend convenience
        initialStock: initialStockValue,
        minStock: Number(minStock || 0),
        unit: unit || undefined,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        productType: type,
        altName: altName || undefined,
        genericName: genericName || undefined,
        shelfLocation: shelfLocation || undefined,
      })
    } catch (txErr) {
      await conn.rollback()
      throw txErr
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error('Products POST error:', err)
    const isDup = err?.code === 'ER_DUP_ENTRY'
    if (isDup) {
      const m = String(err?.sqlMessage || err?.message || '')
      const match = m.match(/Duplicate entry '(.+?)' for key/i)
      const duplicate = match?.[1]
      if (m.includes('product_serials') || m.toLowerCase().includes('serial_no')) {
        return res.status(409).json({ error: 'Serial duplicado', duplicate })
      }
      if (m.includes('product_imeis') || m.toLowerCase().includes('imei')) {
        return res.status(409).json({ error: 'IMEI duplicado', duplicate })
      }
      if (m.includes('products') || m.toLowerCase().includes('sku')) {
        return res.status(409).json({ error: 'SKU duplicado', duplicate })
      }
      return res.status(409).json({ error: 'Registro duplicado', duplicate })
    }
    return res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, sku, productCode, categoryId, brandId, supplierId, price, price2, price3, cost, stock, initialStock, minStock, unit, description, productType, altName, genericName, shelfLocation } = req.body
    const pool = await getPool()
    let nextImage = null
    if (req.file) nextImage = `/uploads/${req.file.filename}`
    else {
      const [rows] = await pool.query('SELECT image_url FROM products WHERE id = ? LIMIT 1', [id])
      nextImage = rows?.[0]?.image_url ?? null
    }
    const [currRows] = await pool.query(
      `SELECT p.id, p.name, p.sku, p.product_code, p.category_id, p.brand_id, p.supplier_id, p.price, p.price2, p.price3, p.cost, 
              COALESCE(SUM(pws.quantity), 0) as stock, 
              (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements WHERE product_id = p.id AND type = 'INITIAL') as initial_stock,
              p.min_stock, p.unit, p.description, p.image_url, p.product_type, p.alt_name, p.generic_name, p.shelf_location 
       FROM products p 
       LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id
       WHERE p.id = ?
       GROUP BY p.id
       LIMIT 1`,
      [id]
    )
    const current = currRows?.[0]
    if (!current) return res.status(404).json({ error: 'Not found' })
    const has = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
    const hasNum = (v) => has(v) && !isNaN(Number(v))

    // Sanear arrays recibidos
    const rawBatches = parseJsonArrayField(req.body, 'batches')
    const batches = rawBatches
      .map(b => ({
        batch_no: String(b?.batch_no ?? b?.batchNo ?? '').trim(),
        expiry_date: b?.expiry_date ?? b?.expiryDate ?? null,
        quantity: Number(b?.quantity ?? 0),
      }))
      .filter(b => b.batch_no.length > 0 && b.quantity > 0)
    const rawImeis = parseJsonArrayField(req.body, 'imeis')
    const imeis = rawImeis.map(x => String(x || '').trim()).filter(s => s.length > 0)
    const rawSerials = parseJsonArrayField(req.body, 'serials')
    const serials = rawSerials.map(x => String(x || '').trim()).filter(s => s.length > 0)
    const nextType = has(productType) ? String(productType).toUpperCase() : (current.product_type || 'GENERAL')
    let derivedStock = hasNum(stock) ? Number(stock) : Number(current.stock || 0)
    if (nextType === 'MEDICINAL') derivedStock = sumQuantity(batches, 'quantity')
    else if (nextType === 'IMEI') derivedStock = imeis.length
    else if (nextType === 'SERIAL') derivedStock = serials.length

    const nextName = has(name) ? name : current.name
    const nextSku = has(sku) ? sku : (current.sku || null)
    const nextProductCode = has(productCode) ? productCode : (current.product_code || null)
    const nextCategoryId = hasNum(categoryId) ? Number(categoryId) : (current.category_id ?? null)
    const nextBrandId = hasNum(brandId) ? Number(brandId) : (current.brand_id ?? null)
    const nextSupplierId = hasNum(supplierId) ? Number(supplierId) : (current.supplier_id ?? null)
    const nextPrice = hasNum(price) ? Number(price) : Number(current.price ?? 0)
    const nextPrice2 = hasNum(price2) ? Number(price2) : Number(current.price2 ?? 0)
    const nextPrice3 = hasNum(price3) ? Number(price3) : Number(current.price3 ?? 0)
    const nextCost = hasNum(cost) ? Number(cost) : Number(current.cost ?? 0)
    const nextStock = Number(derivedStock)
    const nextInitialStock = hasNum(initialStock) ? Number(initialStock) : Number((current.initial_stock ?? current.stock ?? 0))
    const nextMinStock = hasNum(minStock) ? Number(minStock) : Number(current.min_stock ?? 0)
    const nextUnit = has(unit) ? unit : (current.unit || null)
    const nextDescription = has(description) ? description : (current.description || null)
    const nextAltName = has(altName) ? altName : (current.alt_name || null)
    const nextGenericName = has(genericName) ? genericName : (current.generic_name || null)
    const nextShelfLocation = has(shelfLocation) ? shelfLocation : (current.shelf_location || null)

    // Reglas de conteo para IMEI/SERIAL: requerir cantidad exacta según stock inicial
    // REMOVED: Stock logic is now handled via purchases/adjustments

    // Validar duplicados dentro del mismo envío (protección backend)
    if (nextType === 'IMEI' && imeis.length) {
      const dupList = [...new Set(imeis.filter((v, i, arr) => arr.indexOf(v) !== i))]
      if (dupList.length > 0) {
        return res.status(409).json({ error: 'Valores duplicados detectados en IMEIs', duplicate: dupList.join(', ') })
      }
    } else if (nextType === 'SERIAL' && serials.length) {
      const dupList = [...new Set(serials.filter((v, i, arr) => arr.indexOf(v) !== i))]
      if (dupList.length > 0) {
        return res.status(409).json({ error: 'Valores duplicados detectados en series', duplicate: dupList.join(', ') })
      }
    }

    // Verificar duplicados ANTES de hacer cualquier cambio contra la base de datos
    if (nextType === 'IMEI' && imeis.length) {
      for (const imei of imeis) {
        const [dupRows] = await pool.query('SELECT id FROM product_imeis WHERE imei = ? AND product_id != ?', [imei, id])
        if (dupRows.length > 0) {
          throw { code: 'ER_DUP_ENTRY', sqlMessage: `Duplicate entry '${imei}' for key 'uniq_imei'`, message: 'IMEI duplicado' }
        }
      }
    }

    // Usar una sola conexión para la transacción completa
    // Asegurar tablas auxiliares y almacén por defecto
    await ensureDefaultWarehouseId1(pool)
    await ensureWarehouseStockTable(pool)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      // Actualizar tabla products con stock tienda/bodega
      await conn.query(
        'UPDATE products SET name = ?, sku = ?, product_code = ?, category_id = ?, brand_id = ?, supplier_id = ?, price = ?, price2 = ?, price3 = ?, cost = ?, min_stock = ?, unit = ?, description = ?, image_url = ?, product_type = ?, alt_name = ?, generic_name = ?, shelf_location = ? WHERE id = ?',
        [
          nextName,
          nextSku,
          nextProductCode,
          nextCategoryId,
          nextBrandId,
          nextSupplierId,
          nextPrice,
          nextPrice2,
          nextPrice3,
          nextCost,
          nextMinStock,
          nextUnit,
          nextDescription,
          nextImage,
          nextType,
          nextAltName,
          nextGenericName,
          nextShelfLocation,
          id,
        ]
      )

      // NOTA: No sobrescribimos product_warehouse_stock con initial_stock aquí porque
      // eso resetearía el stock real del almacén al valor inicial cada vez que se edita el producto.
      // Solo actualizamos si es un producto nuevo o si queremos forzar el reinicio (lo cual debería ser otra operación).
      // Si se desea actualizar el stock del almacén 1 al editar el "initial_stock", descomentar con precaución.
      /*
      await conn.query(
        'INSERT INTO product_warehouse_stock (product_id, warehouse_id, quantity) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
        [id, Number(nextInitialStock || 0)]
      )
      */


      await conn.query('DELETE FROM product_batches WHERE product_id = ?', [id])
      await conn.query('DELETE FROM product_imeis WHERE product_id = ?', [id])
      await conn.query('DELETE FROM product_serials WHERE product_id = ?', [id])
      await conn.query('DELETE FROM product_variants WHERE product_id = ?', [id])

      if (nextType === 'MEDICINAL' && batches.length) {
        await Promise.all(
          batches.map(b =>
            conn.query('INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity) VALUES (?, ?, ?, ?)', [id, b.batch_no, b.expiry_date, Number(b.quantity || 0)])
          )
        )
      } else if (nextType === 'IMEI' && imeis.length) {
        await Promise.all(imeis.map(imei => conn.query('INSERT INTO product_imeis (product_id, imei) VALUES (?, ?)', [id, String(imei || '')])))
      } else if (nextType === 'SERIAL' && serials.length) {
        await Promise.all(serials.map(serial => conn.query('INSERT INTO product_serials (product_id, serial_no) VALUES (?, ?)', [id, String(serial || '')])))
      }

      // Confirmar transacción
      await conn.commit()

      const [rows2] = await conn.query(
        `SELECT p.id, p.name, p.sku, p.product_code, p.category_id, p.brand_id, p.supplier_id, p.price, p.price2, p.price3, p.cost, 
                COALESCE(SUM(pws.quantity), 0) as stock, 
                (SELECT COALESCE(SUM(quantity), 0) FROM inventory_movements WHERE product_id = p.id AND type = 'INITIAL') as initial_stock,
                p.min_stock, p.unit, p.description, p.image_url, p.product_type, p.alt_name, p.generic_name, p.shelf_location 
         FROM products p 
         LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id
         WHERE p.id = ?
         GROUP BY p.id
         LIMIT 1`,
        [id]
      )
      const r = rows2?.[0]
      if (!r) return res.status(404).json({ error: 'Not found' })
      return res.json({
        id: r.id,
        name: r.name,
        sku: r.sku,
        productCode: r.product_code || undefined,
        categoryId: r.category_id ?? undefined,
        brandId: r.brand_id ?? undefined,
        supplierId: r.supplier_id ?? undefined,
        price: Number(r.price ?? 0),
        price2: Number(r.price2 ?? 0),
        price3: Number(r.price3 ?? 0),
        cost: Number(r.cost ?? 0),
        stock: Number(r.stock ?? 0),
        initialStock: Number(r.initial_stock ?? 0),
        minStock: Number(r.min_stock ?? 0),
        unit: r.unit || undefined,
        description: r.description || undefined,
        imageUrl: r.image_url || undefined,
        productType: r.product_type || undefined,
        altName: r.alt_name || undefined,
        genericName: r.generic_name || undefined,
        shelfLocation: r.shelf_location || undefined,
      })
    } catch (transactionErr) {
      // Rollback en caso de error dentro de la transacción
      await conn.rollback()
      throw transactionErr
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error('Products PUT error:', err)
    const isDup = err?.code === 'ER_DUP_ENTRY'
    if (isDup) {
      const m = String(err?.sqlMessage || err?.message || '')
      const match = m.match(/Duplicate entry '(.+?)' for key/i)
      const duplicate = match?.[1]
      if (m.includes('product_serials') || m.toLowerCase().includes('serial_no')) {
        return res.status(409).json({ error: 'Serial duplicado', duplicate })
      }
      if (m.includes('product_imeis') || m.toLowerCase().includes('imei')) {
        return res.status(409).json({ error: 'IMEI duplicado', duplicate })
      }
      if (m.includes('products') || m.toLowerCase().includes('sku')) {
        return res.status(409).json({ error: 'SKU duplicado', duplicate })
      }
      return res.status(409).json({ error: 'Registro duplicado', duplicate })
    }
    return res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const pool = await getPool()
    await pool.query('DELETE FROM products WHERE id = ?', [id])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Products DELETE error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
