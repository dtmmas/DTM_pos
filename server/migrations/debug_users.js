import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function check() {
  const pool = await getPool()
  const [users] = await pool.query('SELECT id, name, email, warehouse_id FROM users')
  console.log('Users:', users)
  process.exit()
}
check()
