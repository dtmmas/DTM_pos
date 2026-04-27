import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  const [cols] = await pool.query('SHOW COLUMNS FROM products')
  console.log('Products columns:', cols.map(c => c.Field))
  process.exit()
}
check()
