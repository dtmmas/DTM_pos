import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  
  // 1. Find product ID
  const [products] = await pool.query('SELECT id, name, product_code FROM products WHERE product_code = ?', ['895623'])
  if (products.length === 0) {
      console.log('Product not found')
      process.exit()
  }
  const pid = products[0].id
  console.log('Product:', products[0])

  // 2. Check Batches
  const [batches] = await pool.query('SELECT id, batch_no, quantity, warehouse_id FROM product_batches WHERE product_id = ?', [pid])
  console.log('Batches:', batches)

  // 3. Check Stock
  const [stock] = await pool.query('SELECT warehouse_id, quantity FROM product_warehouse_stock WHERE product_id = ?', [pid])
  console.log('Stock:', stock)

  process.exit()
}
check()
