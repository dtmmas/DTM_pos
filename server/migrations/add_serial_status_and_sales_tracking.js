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
    // 1. Update product_serials table
    console.log('Checking product_serials table...')
    const [serialColumns] = await conn.query(`DESCRIBE product_serials`)
    const hasStatusSerial = serialColumns.some(c => c.Field === 'status')

    if (!hasStatusSerial) {
        await conn.query(`ALTER TABLE product_serials ADD COLUMN status ENUM('AVAILABLE', 'SOLD', 'RETURNED', 'DAMAGED', 'TRANSFERRED') DEFAULT 'AVAILABLE'`)
        console.log('Added status column to product_serials.')
    } else {
        console.log('product_serials already has status column.')
    }

    // 2. Update product_imeis table
    console.log('Checking product_imeis table...')
    const [imeiColumns] = await conn.query(`DESCRIBE product_imeis`)
    const hasStatusImei = imeiColumns.some(c => c.Field === 'status')

    if (!hasStatusImei) {
        await conn.query(`ALTER TABLE product_imeis ADD COLUMN status ENUM('AVAILABLE', 'SOLD', 'RETURNED', 'DAMAGED', 'TRANSFERRED') DEFAULT 'AVAILABLE'`)
        console.log('Added status column to product_imeis.')
    } else {
        console.log('product_imeis already has status column.')
    }

    // 3. Update sale_items table
    console.log('Checking sale_items table...')
    const [saleItemColumns] = await conn.query(`DESCRIBE sale_items`)
    const hasSerial = saleItemColumns.some(c => c.Field === 'serial')
    const hasImei = saleItemColumns.some(c => c.Field === 'imei')

    let alterSaleItems = []
    if (!hasSerial) alterSaleItems.push("ADD COLUMN serial VARCHAR(100) NULL")
    if (!hasImei) alterSaleItems.push("ADD COLUMN imei VARCHAR(50) NULL")

    if (alterSaleItems.length > 0) {
        await conn.query(`ALTER TABLE sale_items ${alterSaleItems.join(', ')}`)
        console.log('Added serial/imei columns to sale_items.')
    } else {
        console.log('sale_items already has serial/imei columns.')
    }

    console.log('Migration completed successfully.')

  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
