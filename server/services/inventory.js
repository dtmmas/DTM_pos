import { getPool } from '../db.js'

/**
 * Registra un movimiento de inventario y actualiza el stock.
 * Debe ser llamado dentro de una transacción existente (conn) o crea una nueva.
 * @param {Object} params
 * @param {number} params.productId
 * @param {number} params.warehouseId
 * @param {string} params.type - 'INITIAL', 'PURCHASE', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'
 * @param {number} params.quantity - Cantidad absoluta del movimiento (siempre positiva)
 * @param {number|null} params.referenceId - ID de venta, compra, etc.
 * @param {number|null} params.userId
 * @param {string} params.notes
 * @param {Object} [externalConn] - Conexión de BD opcional para transacción externa
 */
export async function registerMovement({ productId, warehouseId, type, quantity, referenceId, userId, notes }, externalConn = null) {
  const pool = await getPool()
  const conn = externalConn || await pool.getConnection()
  const ownTx = !externalConn

  try {
    if (ownTx) await conn.beginTransaction()

    // 1. Determinar delta (cambio de stock)
    let delta = 0
    const qty = Number(quantity)
    if (qty <= 0) throw new Error('La cantidad del movimiento debe ser mayor a 0')

    switch (type) {
      case 'INITIAL':
      case 'PURCHASE':
      case 'TRANSFER_IN':
      case 'ADJUSTMENT_IN': // Helper interno si se requiere ajuste positivo
        delta = qty
        break
      case 'SALE':
      case 'TRANSFER_OUT':
      case 'ADJUSTMENT_OUT': // Helper interno si se requiere ajuste negativo
        delta = -qty
        break
      case 'ADJUSTMENT':
        // Asumimos que AJUSTE genérico es positivo (entrada), si es salida usar ADJUSTMENT_OUT o signo negativo en caller
        delta = qty
        break
      default:
        throw new Error(`Tipo de movimiento desconocido: ${type}`)
    }

    // 2. Registrar Movimiento
    await conn.query(
      `INSERT INTO inventory_movements 
       (product_id, warehouse_id, type, quantity, reference_id, user_id, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [productId, warehouseId, type, qty, referenceId || null, userId || null, notes || null]
    )

    // 3. Actualizar Inventario (Upsert)
    // Primero aseguramos que existe la fila
    await conn.query(
      `INSERT INTO product_warehouse_stock (product_id, warehouse_id, quantity) 
       VALUES (?, ?, 0) 
       ON DUPLICATE KEY UPDATE quantity = quantity`, // No-op para asegurar existencia
      [productId, warehouseId]
    )

    // Bloquear y validar stock (para salidas)
    if (delta < 0) {
      const [rows] = await conn.query(
        'SELECT quantity FROM product_warehouse_stock WHERE product_id = ? AND warehouse_id = ? FOR UPDATE',
        [productId, warehouseId]
      )
      const current = rows[0]?.quantity || 0
      if (current + delta < 0) {
        throw new Error(`Stock insuficiente en almacén ${warehouseId}. Actual: ${current}, Requerido: ${Math.abs(delta)}`)
      }
    }

    // Aplicar cambio
    await conn.query(
      'UPDATE product_warehouse_stock SET quantity = quantity + ? WHERE product_id = ? AND warehouse_id = ?',
      [delta, productId, warehouseId]
    )

    if (ownTx) await conn.commit()
  } catch (err) {
    if (ownTx) await conn.rollback()
    throw err
  } finally {
    if (ownTx) conn.release()
  }
}
