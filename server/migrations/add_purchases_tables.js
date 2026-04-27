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
    // Purchases table
    console.log('Creating purchases table...')
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        supplier_id INT NULL,
        user_id INT NULL,
        doc_no VARCHAR(50) NULL,
        total DECIMAL(10, 2) NOT NULL DEFAULT 0,
        status ENUM('COMPLETED', 'CANCELLED') DEFAULT 'COMPLETED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        notes TEXT NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Purchase Items table
    console.log('Creating purchase_items table...')
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
        total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    console.log('Tables created successfully.')

  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await conn.end()
  }
}

migrate()
