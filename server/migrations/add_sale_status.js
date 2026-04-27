import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function migrate() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  const conn = await mysql.createConnection({ host, port, user, password, database })

  try {
    // Check if status column exists
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'status'`,
      [database]
    )
    
    if ((rows?.[0]?.c || 0) === 0) {
      await conn.query(`ALTER TABLE sales ADD COLUMN status VARCHAR(20) DEFAULT 'COMPLETED'`)
      console.log('Added status column to sales')
    } else {
      console.log('status column already exists')
    }

    // Check if cancellation_reason column exists
    const [rows2] = await conn.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'cancellation_reason'`,
      [database]
    )

    if ((rows2?.[0]?.c || 0) === 0) {
      await conn.query(`ALTER TABLE sales ADD COLUMN cancellation_reason TEXT DEFAULT NULL`)
      console.log('Added cancellation_reason column to sales')
    } else {
        console.log('cancellation_reason column already exists')
    }
    
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
