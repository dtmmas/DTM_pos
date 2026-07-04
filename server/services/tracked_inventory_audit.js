function normalizeWarehouseMap(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const warehouseId = Number(row?.warehouse_id || 0)
    if (!warehouseId) continue
    map.set(warehouseId, {
      warehouseId,
      warehouseName: row?.warehouse_name || `Almacen ${warehouseId}`,
      count: Number(row?.count || 0),
      trackedItems: row?.tracked_items || ''
    })
  }
  return map
}

function buildTrackedConfig(productType) {
  const normalizedType = String(productType || '').toUpperCase()
  if (normalizedType === 'IMEI') {
    return {
      tableName: 'product_imeis',
      valueColumn: 'imei',
      trackedLabel: 'IMEI disponibles'
    }
  }

  if (normalizedType === 'MEDICINAL') {
    return {
      tableName: 'product_batches',
      valueColumn: 'batch_no',
      trackedLabel: 'lotes disponibles'
    }
  }

  return {
    tableName: 'product_serials',
    valueColumn: 'serial_no',
    trackedLabel: 'series disponibles'
  }
}

async function loadTrackedAuditProducts(pool) {
  const [products] = await pool.query(`
    SELECT id, name, sku, product_code, product_type
    FROM products
    WHERE UPPER(product_type) IN ('SERIAL', 'IMEI', 'MEDICINAL')
    ORDER BY name ASC, id ASC
  `)
  return Array.isArray(products) ? products : []
}

async function loadTrackedRows(pool, product) {
  const trackedConfig = buildTrackedConfig(product.product_type)

  if (trackedConfig.tableName === 'product_batches') {
    const [trackedRows] = await pool.query(`
      SELECT pb.warehouse_id, w.name AS warehouse_name, SUM(pb.quantity) AS count,
             GROUP_CONCAT(
               CONCAT(
                 pb.batch_no,
                 ' [',
                 COALESCE(DATE_FORMAT(pb.expiry_date, '%Y-%m-%d'), 'sin vencimiento'),
                 '] x',
                 pb.quantity
               )
               ORDER BY pb.expiry_date ASC, pb.id ASC
               SEPARATOR ', '
             ) AS tracked_items
      FROM product_batches pb
      JOIN warehouses w ON w.id = pb.warehouse_id
      WHERE pb.product_id = ? AND pb.quantity > 0
      GROUP BY pb.warehouse_id, w.name
      ORDER BY pb.warehouse_id ASC
    `, [product.id])

    return {
      trackedRows,
      trackedConfig
    }
  }

  const [trackedRows] = await pool.query(`
    SELECT t.warehouse_id, w.name AS warehouse_name, COUNT(*) AS count,
           GROUP_CONCAT(${trackedConfig.valueColumn} ORDER BY t.id SEPARATOR ', ') AS tracked_items
    FROM ${trackedConfig.tableName} t
    JOIN warehouses w ON w.id = t.warehouse_id
    WHERE t.product_id = ? AND t.status = 'AVAILABLE'
    GROUP BY t.warehouse_id, w.name
    ORDER BY t.warehouse_id ASC
  `, [product.id])

  return {
    trackedRows,
    trackedConfig
  }
}

async function buildProductAuditEntry(pool, product) {
  const [stockRows] = await pool.query(`
    SELECT pws.warehouse_id, w.name AS warehouse_name, pws.quantity AS count
    FROM product_warehouse_stock pws
    JOIN warehouses w ON w.id = pws.warehouse_id
    WHERE pws.product_id = ? AND pws.quantity > 0
    ORDER BY pws.warehouse_id ASC
  `, [product.id])

  const { trackedRows, trackedConfig } = await loadTrackedRows(pool, product)

  const stockMap = normalizeWarehouseMap(stockRows)
  const trackedMap = normalizeWarehouseMap(trackedRows)
  const warehouseIds = [...new Set([...stockMap.keys(), ...trackedMap.keys()])].sort((a, b) => a - b)
  const differences = []

  for (const warehouseId of warehouseIds) {
    const stockQty = Number(stockMap.get(warehouseId)?.count || 0)
    const trackedQty = Number(trackedMap.get(warehouseId)?.count || 0)
    if (stockQty === trackedQty) continue

    differences.push({
      warehouseId,
      warehouseName: stockMap.get(warehouseId)?.warehouseName || trackedMap.get(warehouseId)?.warehouseName || `Almacen ${warehouseId}`,
      stockQty,
      trackedQty,
      trackedItems: trackedMap.get(warehouseId)?.trackedItems || ''
    })
  }

  return {
    productId: Number(product.id),
    productType: String(product.product_type || '').toUpperCase(),
    productCode: product.product_code || '',
    sku: product.sku || '',
    name: product.name || '',
    differences,
    stockRows: Array.isArray(stockRows) ? stockRows.map(row => ({
      warehouseId: Number(row.warehouse_id),
      warehouseName: row.warehouse_name || `Almacen ${row.warehouse_id}`,
      count: Number(row.count || 0)
    })) : [],
    trackedRows: Array.isArray(trackedRows) ? trackedRows.map(row => ({
      warehouseId: Number(row.warehouse_id),
      warehouseName: row.warehouse_name || `Almacen ${row.warehouse_id}`,
      count: Number(row.count || 0),
      trackedItems: row.tracked_items || ''
    })) : [],
    trackedConfig
  }
}

export async function auditTrackedInventoryConsistency(pool) {
  const products = await loadTrackedAuditProducts(pool)
  const mismatches = []

  for (const product of products) {
    const auditEntry = await buildProductAuditEntry(pool, product)
    const { differences, ...publicEntry } = auditEntry
    if (differences.length === 0) continue

    mismatches.push({
      ...publicEntry,
      differences
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    mismatchCount: mismatches.length,
    mismatches: mismatches.map(({ stockRows, trackedRows, trackedConfig, ...item }) => item)
  }
}

export async function autoCorrectTrackedInventoryEasyCases(pool) {
  const products = await loadTrackedAuditProducts(pool)
  const corrected = []
  const skipped = []

  for (const product of products) {
    const auditEntry = await buildProductAuditEntry(pool, product)
    if (auditEntry.differences.length === 0) continue

    const positiveStockRows = auditEntry.stockRows.filter(row => row.count > 0)
    const totalTrackedAvailable = auditEntry.trackedRows.reduce((sum, row) => sum + Number(row.count || 0), 0)

    if (positiveStockRows.length !== 1) {
      skipped.push({
        productId: auditEntry.productId,
        productCode: auditEntry.productCode,
        sku: auditEntry.sku,
        name: auditEntry.name,
        reason: `Se esperaban 1 almacén con stock positivo y se encontraron ${positiveStockRows.length}`
      })
      continue
    }

    const targetStock = positiveStockRows[0]
    const rowsOutsideTarget = auditEntry.trackedRows.filter(row => row.warehouseId !== targetStock.warehouseId)
    const isMedicinal = auditEntry.trackedConfig.tableName === 'product_batches'

    if (isMedicinal && rowsOutsideTarget.length === 0 && Number(targetStock.count || 0) !== totalTrackedAvailable) {
      const [updateResult] = await pool.query(
        `UPDATE product_warehouse_stock
         SET quantity = ?
         WHERE product_id = ? AND warehouse_id = ?`,
        [totalTrackedAvailable, auditEntry.productId, targetStock.warehouseId]
      )

      corrected.push({
        productId: auditEntry.productId,
        productType: auditEntry.productType,
        productCode: auditEntry.productCode,
        sku: auditEntry.sku,
        name: auditEntry.name,
        targetWarehouseId: targetStock.warehouseId,
        targetWarehouseName: targetStock.warehouseName,
        previousStockQty: Number(targetStock.count || 0),
        correctedStockQty: totalTrackedAvailable,
        movedCount: Number(updateResult?.affectedRows || 0),
        trackedItems: auditEntry.trackedRows.flatMap(row => String(row.trackedItems || '').split(',').map(item => item.trim()).filter(Boolean))
      })
      continue
    }

    if (Number(targetStock.count || 0) !== totalTrackedAvailable) {
      skipped.push({
        productId: auditEntry.productId,
        productCode: auditEntry.productCode,
        sku: auditEntry.sku,
        name: auditEntry.name,
        reason: `La cantidad disponible (${totalTrackedAvailable}) no coincide con el stock positivo (${targetStock.count})`
      })
      continue
    }

    if (rowsOutsideTarget.length === 0) continue

    let updateResult
    if (auditEntry.trackedConfig.tableName === 'product_batches') {
      ;[updateResult] = await pool.query(
        `UPDATE ${auditEntry.trackedConfig.tableName}
         SET warehouse_id = ?
         WHERE product_id = ? AND quantity > 0`,
        [targetStock.warehouseId, auditEntry.productId]
      )
    } else {
      ;[updateResult] = await pool.query(
        `UPDATE ${auditEntry.trackedConfig.tableName}
         SET warehouse_id = ?
         WHERE product_id = ? AND status = 'AVAILABLE'`,
        [targetStock.warehouseId, auditEntry.productId]
      )
    }

    corrected.push({
      productId: auditEntry.productId,
      productType: auditEntry.productType,
      productCode: auditEntry.productCode,
      sku: auditEntry.sku,
      name: auditEntry.name,
      targetWarehouseId: targetStock.warehouseId,
      targetWarehouseName: targetStock.warehouseName,
      movedCount: Number(updateResult?.affectedRows || 0),
      trackedItems: auditEntry.trackedRows.flatMap(row => String(row.trackedItems || '').split(',').map(item => item.trim()).filter(Boolean))
    })
  }

  const auditAfter = await auditTrackedInventoryConsistency(pool)

  return {
    generatedAt: new Date().toISOString(),
    correctedCount: corrected.length,
    skippedCount: skipped.length,
    corrected,
    skipped,
    auditAfter
  }
}

export function logTrackedInventoryAudit(result) {
  const mismatchCount = Number(result?.mismatchCount || 0)
  if (mismatchCount === 0) {
    console.log('[tracked-audit] Sin inconsistencias entre stock y trazabilidad disponible.')
    return
  }

  console.warn(`[tracked-audit] Se detectaron ${mismatchCount} productos con inconsistencias de stock y trazabilidad.`)
  for (const mismatch of result?.mismatches || []) {
    const productLabel = [
      mismatch.productCode || mismatch.sku || `ID ${mismatch.productId}`,
      mismatch.name
    ].filter(Boolean).join(' | ')
    console.warn(`[tracked-audit] ${productLabel}`)
    for (const diff of mismatch.differences || []) {
      console.warn(
        `[tracked-audit]   ${diff.warehouseName}: stock=${diff.stockQty}, trazabilidad=${diff.trackedQty}${diff.trackedItems ? `, items=${diff.trackedItems}` : ''}`
      )
    }
  }
}
