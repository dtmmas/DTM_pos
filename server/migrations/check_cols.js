import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  const [b] = await pool.query('SHOW COLUMNS FROM product_batches LIKE "warehouse_id"')
  console.log('Batches:', b)
  const [i] = await pool.query('SHOW COLUMNS FROM product_imeis LIKE "warehouse_id"')
  console.log('IMEIs:', i)
  const [s] = await pool.query('SHOW COLUMNS FROM product_serials LIKE "warehouse_id"')
  console.log('Serials:', s)
  process.exit()
}
check()
