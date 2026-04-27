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
    // 1. Update purchases table
    console.log('Updating purchases table...')
    
    // Check if columns exist before adding/modifying
    const [purchaseColumns] = await conn.query(`DESCRIBE purchases`)
    const hasUserId = purchaseColumns.some(c => c.Field === 'user_id')
    const hasStatus = purchaseColumns.some(c => c.Field === 'status')
    const hasNotes = purchaseColumns.some(c => c.Field === 'notes')
    const hasUpdatedAt = purchaseColumns.some(c => c.Field === 'updated_at')

    let alterPurchases = []
    if (!hasUserId) alterPurchases.push("ADD COLUMN user_id INT NULL")
    if (!hasStatus) alterPurchases.push("ADD COLUMN status ENUM('COMPLETED', 'CANCELLED') DEFAULT 'COMPLETED'")
    if (!hasNotes) alterPurchases.push("ADD COLUMN notes TEXT NULL")
    if (!hasUpdatedAt) alterPurchases.push("ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
    
    // Also ensure foreign keys exist
    // We'll add FK for user_id if we added the column
    
    if (alterPurchases.length > 0) {
        await conn.query(`ALTER TABLE purchases ${alterPurchases.join(', ')}`)
        console.log('Added missing columns to purchases table.')
        
        if (!hasUserId) {
            try {
                await conn.query(`ALTER TABLE purchases ADD CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`)
                console.log('Added FK for user_id')
            } catch (e) { console.log('FK for user_id might already exist or failed:', e.message) }
        }
    } else {
        console.log('Purchases table seems to have all columns.')
    }

    // 2. Update purchase_items table
    console.log('Updating purchase_items table...')
    const [itemColumns] = await conn.query(`DESCRIBE purchase_items`)
    const hasTotalCost = itemColumns.some(c => c.Field === 'total_cost')
    const hasTotal = itemColumns.some(c => c.Field === 'total')

    if (hasTotal && !hasTotalCost) {
        // Rename total to total_cost
        await conn.query(`ALTER TABLE purchase_items CHANGE COLUMN total total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0`)
        console.log('Renamed total to total_cost in purchase_items.')
    } else if (!hasTotalCost) {
        await conn.query(`ALTER TABLE purchase_items ADD COLUMN total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0`)
        console.log('Added total_cost to purchase_items.')
    } else {
        console.log('purchase_items table seems correct.')
    }

    console.log('Migration completed successfully.')

  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
