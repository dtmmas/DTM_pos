import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  const productId = 4

  const [serials] = await conn.query(
    `SELECT id, serial_no, status, warehouse_id
     FROM product_serials
     WHERE product_id = ?
     ORDER BY id ASC`,
    [productId]
  )
  console.log('SERIALS')
  console.log(JSON.stringify(serials, null, 2))

  const [stocks] = await conn.query(
    `SELECT warehouse_id, quantity
     FROM product_warehouse_stock
     WHERE product_id = ?
     ORDER BY warehouse_id ASC`,
    [productId]
  )
  console.log('STOCKS')
  console.log(JSON.stringify(stocks, null, 2))

  const [movements] = await conn.query(
    `SELECT id, type, quantity, warehouse_id, reference_id, notes
     FROM inventory_movements
     WHERE product_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [productId]
  )
  console.log('MOVEMENTS')
  console.log(JSON.stringify(movements, null, 2))

  const [transfers] = await conn.query(
    `SELECT id, status, notes
     FROM transfers
     WHERE id = 2`
  )
  console.log('TRANSFER')
  console.log(JSON.stringify(transfers, null, 2))
} finally {
  await conn.end()
}
