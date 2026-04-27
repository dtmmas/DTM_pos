import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function migrate() {
  const pool = await getPool()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    console.log('Adding warehouse_id to users table...')
    
    // Check if exists first (though we know it likely doesn't)
    try {
        await conn.query(`ALTER TABLE users ADD COLUMN warehouse_id INT NULL DEFAULT 1`)
        await conn.query(`ALTER TABLE users ADD CONSTRAINT fk_users_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)`)
        console.log('Column warehouse_id added to users.')
    } catch (e) {
        console.log('Column might exist or error:', e.message)
    }

    // Move some batches to Bodega (ID 3) for testing
    // Product 53 (has 4 batches). Move 2 of them to Warehouse 3.
    console.log('Moving some batches to Bodega (ID 3)...')
    const [batches] = await conn.query('SELECT id FROM product_batches WHERE product_id = 53 LIMIT 2')
    if (batches.length > 0) {
        const ids = batches.map(b => b.id)
        await conn.query(`UPDATE product_batches SET warehouse_id = 3 WHERE id IN (?)`, [ids])
        console.log(`Moved batches ${ids.join(',')} to Warehouse 3`)
    }

    await conn.commit()
    console.log('Migration done.')
  } catch (err) {
    await conn.rollback()
    console.error('Migration error:', err)
  } finally {
    conn.release()
    process.exit()
  }
}

migrate()
