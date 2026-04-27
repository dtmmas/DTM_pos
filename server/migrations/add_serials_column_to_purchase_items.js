import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function migrate() {
  const host = process.env.DB_HOST
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME

  console.log('Connecting to DB...')
  const conn = await mysql.createConnection({ host, port, user, password, database })

  try {
    console.log('Checking purchase_items table...')
    const [columns] = await conn.query(`DESCRIBE purchase_items`)
    const hasSerials = columns.some(c => c.Field === 'serials')

    if (!hasSerials) {
        await conn.query(`ALTER TABLE purchase_items ADD COLUMN serials TEXT NULL`)
        console.log('Added serials column to purchase_items.')
    } else {
        console.log('purchase_items already has serials column.')
    }

    console.log('Migration completed successfully.')

  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
