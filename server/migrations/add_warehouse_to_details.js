import { getPool } from '../db.js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

async function migrate() {
  const pool = await getPool()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    console.log('Adding warehouse_id to inventory detail tables...')

    // 1. product_batches
    try {
        await conn.query(`ALTER TABLE product_batches ADD COLUMN warehouse_id INT NOT NULL DEFAULT 1`)
        await conn.query(`ALTER TABLE product_batches ADD CONSTRAINT fk_batches_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)`)
        await conn.query(`CREATE INDEX idx_batches_warehouse ON product_batches(warehouse_id)`)
    } catch (e) { console.log('batches column might exist', e.message) }

    // 2. product_imeis
    try {
        await conn.query(`ALTER TABLE product_imeis ADD COLUMN warehouse_id INT NOT NULL DEFAULT 1`)
        await conn.query(`ALTER TABLE product_imeis ADD CONSTRAINT fk_imeis_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)`)
        await conn.query(`CREATE INDEX idx_imeis_warehouse ON product_imeis(warehouse_id)`)
    } catch (e) { console.log('imeis column might exist', e.message) }

    // 3. product_serials
    try {
        await conn.query(`ALTER TABLE product_serials ADD COLUMN warehouse_id INT NOT NULL DEFAULT 1`)
        await conn.query(`ALTER TABLE product_serials ADD CONSTRAINT fk_serials_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)`)
        await conn.query(`CREATE INDEX idx_serials_warehouse ON product_serials(warehouse_id)`)
    } catch (e) { console.log('serials column might exist', e.message) }

    console.log('Migration completed.')
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    console.error('Error in migration:', err)
  } finally {
    conn.release()
    process.exit()
  }
}

migrate()
