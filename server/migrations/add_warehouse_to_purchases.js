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
    console.log('Updating purchases table...')
    
    const [purchaseColumns] = await conn.query(`DESCRIBE purchases`)
    const hasWarehouseId = purchaseColumns.some(c => c.Field === 'warehouse_id')

    if (!hasWarehouseId) {
        await conn.query(`ALTER TABLE purchases ADD COLUMN warehouse_id INT NULL`)
        console.log('Added warehouse_id column to purchases table.')
        
        try {
            await conn.query(`ALTER TABLE purchases ADD CONSTRAINT fk_purchases_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL`)
            console.log('Added FK for warehouse_id')
        } catch (e) { console.log('FK for warehouse_id might already exist or failed:', e.message) }
    } else {
        console.log('Purchases table already has warehouse_id.')
    }

    console.log('Migration completed successfully.')

  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
