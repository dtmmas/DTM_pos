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

function buildTrackedQuery(productType) {
  const normalizedType = String(productType || '').toUpperCase()
  if (normalizedType === 'IMEI') {
    return {
      tableName: 'product_imeis',
      valueColumn: 'imei'
    }
  }

  return {
    tableName: 'product_serials',
    valueColumn: 'serial_no'
  }
}

export async function auditTrackedInventoryConsistency(pool) {
  const [products] = await pool.query(`
    SELECT id, name, sku, product_code, product_type
    FROM products
    WHERE UPPER(product_type) IN ('SERIAL', 'IMEI')
    ORDER BY name ASC, id ASC
  `)

  const mismatches = []

  for (const product of products || []) {
    const { tableName, valueColumn } = buildTrackedQuery(product.product_type)

    const [stockRows] = await pool.query(`
      SELECT pws.warehouse_id, w.name AS warehouse_name, pws.quantity AS count
      FROM product_warehouse_stock pws
      JOIN warehouses w ON w.id = pws.warehouse_id
      WHERE pws.product_id = ? AND pws.quantity > 0
      ORDER BY pws.warehouse_id ASC
    `, [product.id])

    const [trackedRows] = await pool.query(`
      SELECT t.warehouse_id, w.name AS warehouse_name, COUNT(*) AS count,
             GROUP_CONCAT(${valueColumn} ORDER BY t.id SEPARATOR ', ') AS tracked_items
      FROM ${tableName} t
      JOIN warehouses w ON w.id = t.warehouse_id
      WHERE t.product_id = ? AND t.status = 'AVAILABLE'
      GROUP BY t.warehouse_id, w.name
      ORDER BY t.warehouse_id ASC
    `, [product.id])

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

    if (differences.length === 0) continue

    mismatches.push({
      productId: Number(product.id),
      productType: String(product.product_type || '').toUpperCase(),
      productCode: product.product_code || '',
      sku: product.sku || '',
      name: product.name || '',
      differences
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    productCount: Array.isArray(products) ? products.length : 0,
    mismatchCount: mismatches.length,
    mismatches
  }
}

export function logTrackedInventoryAudit(result) {
  const mismatchCount = Number(result?.mismatchCount || 0)
  if (mismatchCount === 0) {
    console.log('[tracked-audit] Sin inconsistencias entre stock y series/IMEI disponibles.')
    return
  }

  console.warn(`[tracked-audit] Se detectaron ${mismatchCount} productos con inconsistencias de stock y series/IMEI.`)
  for (const mismatch of result?.mismatches || []) {
    const productLabel = [
      mismatch.productCode || mismatch.sku || `ID ${mismatch.productId}`,
      mismatch.name
    ].filter(Boolean).join(' | ')
    console.warn(`[tracked-audit] ${productLabel}`)
    for (const diff of mismatch.differences || []) {
      console.warn(
        `[tracked-audit]   ${diff.warehouseName}: stock=${diff.stockQty}, disponibles=${diff.trackedQty}${diff.trackedItems ? `, items=${diff.trackedItems}` : ''}`
      )
    }
  }
}
