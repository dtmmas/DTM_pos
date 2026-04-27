import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  const [batches] = await pool.query('SELECT * FROM product_batches')
  console.log('Batches:', batches)
  const [warehouses] = await pool.query('SELECT * FROM warehouses')
  console.log('Warehouses:', warehouses)
  process.exit()
}
check()
