import dotenv from 'dotenv'
import path from 'path'
import mysql from 'mysql2/promise'
import { registerMovement } from './services/inventory.js'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  await conn.beginTransaction()

  const productId = 4
  const sourceWarehouseId = 2
  const destinationWarehouseId = 3
  const transferId = 2

  const [sourceStockRows] = await conn.query(
    'SELECT quantity FROM product_warehouse_stock WHERE product_id = ? AND warehouse_id = ? FOR UPDATE',
    [productId, sourceWarehouseId]
  )
  const [destinationStockRows] = await conn.query(
    'SELECT quantity FROM product_warehouse_stock WHERE product_id = ? AND warehouse_id = ? FOR UPDATE',
    [productId, destinationWarehouseId]
  )

  if (Number(destinationStockRows?.[0]?.quantity || 0) < 1) {
    throw new Error('La tienda destino ya no tiene stock suficiente para revertir el traslado de SSS1')
  }

  await conn.query(
    `UPDATE product_serials
     SET status = 'DAMAGED'
     WHERE product_id = ? AND warehouse_id = ? AND serial_no IN (?, ?) AND status = 'AVAILABLE'`,
    [productId, sourceWarehouseId, 'S1', 'S2']
  )

  await conn.query(
    `UPDATE product_serials
     SET warehouse_id = ?, status = 'DAMAGED'
     WHERE product_id = ? AND serial_no = ?`,
    [sourceWarehouseId, productId, 'SSS1']
  )

  await registerMovement({
    productId,
    warehouseId: destinationWarehouseId,
    type: 'TRANSFER_OUT',
    quantity: 1,
    referenceId: transferId,
    userId: null,
    notes: 'Reversión transferencia #2 por serie SSS1 ajustada como dañada'
  }, conn)

  await registerMovement({
    productId,
    warehouseId: sourceWarehouseId,
    type: 'TRANSFER_IN',
    quantity: 1,
    referenceId: transferId,
    userId: null,
    notes: 'Reversión transferencia #2 por serie SSS1 ajustada como dañada'
  }, conn)

  const [transferItems] = await conn.query(
    'SELECT id, product_id, quantity FROM transfer_items WHERE transfer_id = ?',
    [transferId]
  )

  if (Array.isArray(transferItems) && transferItems.length === 1 && Number(transferItems[0].product_id) === productId && Number(transferItems[0].quantity) === 1) {
    await conn.query(
      `UPDATE transfers
       SET status = 'CANCELLED',
           notes = TRIM(CONCAT(COALESCE(notes, ''), ' | Revertida: la serie SSS1 ya había sido ajustada como salida/daño'))
       WHERE id = ?`,
      [transferId]
    )
  } else {
    await conn.query(
      `UPDATE transfers
       SET notes = TRIM(CONCAT(COALESCE(notes, ''), ' | Parcialmente revertida: la serie SSS1 ya había sido ajustada como salida/daño'))
       WHERE id = ?`,
      [transferId]
    )
  }

  const [finalSerials] = await conn.query(
    `SELECT serial_no, status, warehouse_id
     FROM product_serials
     WHERE product_id = ?
     ORDER BY id ASC`,
    [productId]
  )
  const [finalStocks] = await conn.query(
    `SELECT warehouse_id, quantity
     FROM product_warehouse_stock
     WHERE product_id = ?
     ORDER BY warehouse_id ASC`,
    [productId]
  )

  await conn.commit()

  console.log('FINAL_SERIALS')
  console.log(JSON.stringify(finalSerials, null, 2))
  console.log('FINAL_STOCKS')
  console.log(JSON.stringify(finalStocks, null, 2))
} catch (error) {
  await conn.rollback()
  console.error(error)
  process.exitCode = 1
} finally {
  await conn.end()
}
