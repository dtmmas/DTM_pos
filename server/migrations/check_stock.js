import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  const [rows] = await pool.query('SELECT * FROM product_warehouse_stock LIMIT 10')
  console.log('Stock rows:', rows)
  
  const [p] = await pool.query('SELECT id, name FROM products LIMIT 5')
  console.log('Products:', p)
  
  process.exit()
}
check()
