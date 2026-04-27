import dotenv from 'dotenv'
import { getPool } from '../db.js'

// Cargar variables de entorno
dotenv.config()

async function addProductTables() {
  try {
    const pool = await getPool()
    
    console.log('Adding missing product columns and tables...')
    
    // Añadir columnas faltantes a products
    const columns = [
      { name: 'product_type', sql: 'ALTER TABLE products ADD COLUMN product_type VARCHAR(20) DEFAULT "GENERAL"' },
      { name: 'alt_name', sql: 'ALTER TABLE products ADD COLUMN alt_name VARCHAR(160) NULL' },
      { name: 'generic_name', sql: 'ALTER TABLE products ADD COLUMN generic_name VARCHAR(160) NULL' },
      { name: 'shelf_location', sql: 'ALTER TABLE products ADD COLUMN shelf_location VARCHAR(100) NULL' }
    ]
    
    for (const col of columns) {
      try {
        const [rows] = await pool.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = ?`,
          [col.name]
        )
        if (rows[0].count === 0) {
          await pool.query(col.sql)
          console.log(`✓ Added column: ${col.name}`)
        } else {
          console.log(`- Column ${col.name} already exists`)
        }
      } catch (err) {
        console.error(`Error adding column ${col.name}:`, err.message)
      }
    }
    
    // Crear tablas para productos especializados
    const tables = [
      {
        name: 'product_batches',
        sql: `CREATE TABLE IF NOT EXISTS product_batches (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          batch_no VARCHAR(100) NOT NULL,
          expiry_date DATE,
          quantity INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`
      },
      {
        name: 'product_imeis',
        sql: `CREATE TABLE IF NOT EXISTS product_imeis (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          imei VARCHAR(50) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`
      },
      {
        name: 'product_serials',
        sql: `CREATE TABLE IF NOT EXISTS product_serials (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          serial_no VARCHAR(100) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`
      },
      {
        name: 'product_variants',
        sql: `CREATE TABLE IF NOT EXISTS product_variants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          name VARCHAR(160) NOT NULL,
          sku VARCHAR(80) UNIQUE,
          stock INT NOT NULL DEFAULT 0,
          price DECIMAL(12,2) NOT NULL DEFAULT 0,
          cost DECIMAL(12,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`
      }
    ]
    
    for (const table of tables) {
      try {
        await pool.query(table.sql)
        console.log(`✓ Created table: ${table.name}`)
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`- Table ${table.name} already exists`)
        } else {
          console.error(`Error creating table ${table.name}:`, err.message)
        }
      }
    }
    
    console.log('Migration completed successfully!')
    process.exit(0)
    
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

addProductTables()