import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

dotenv.config()

async function run() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  console.log('Connecting to MySQL...', { host, port, user, database })
  const adminConn = await mysql.createConnection({ host, port, user, password, multipleStatements: true })
  await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  await adminConn.end()

  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true })

  const schemaPath = path.resolve(process.cwd(), '..', 'db', 'schema.sql')
  const sql = fs.readFileSync(schemaPath, 'utf-8')
  console.log('Applying schema from', schemaPath)
  try {
    await conn.query(sql)
  } catch (e) {
    console.warn('Schema apply error:', e.message)
    console.warn('Retrying without CREATE INDEX statements...')
    const safeSql = sql.split('\n').filter(line => !line.trim().toUpperCase().startsWith('CREATE INDEX')).join('\n')
    await conn.query(safeSql)
  }

  const email = 'admin@local'
  const name = 'Admin'
  const role = 'ADMIN'
  const hash = await bcrypt.hash('admin123', 10)

  await conn.query(
    'INSERT IGNORE INTO users (name, email, password, role, active) VALUES (?, ?, ?, ?, 1)',
    [name, email, hash, role]
  )

  console.log('Seeded user: admin@local / admin123')

  // Seed default brands if none exist
  try {
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM brands')
    const count = rows?.[0]?.c || 0
    if (count === 0) {
      await conn.query('INSERT INTO brands (name) VALUES (?), (?), (?)', ['Genérica', 'Acme', 'Contoso'])
      console.log('Seeded default brands: Genérica, Acme, Contoso')
    } else {
      console.log('Brands already present, skipping brand seeding.')
    }
  } catch (e) {
    console.warn('Brand seeding error:', e.message)
  }

  // Seed default suppliers if none exist
  try {
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM suppliers')
    const count = rows?.[0]?.c || 0
    if (count === 0) {
      await conn.query('INSERT INTO suppliers (name) VALUES (?), (?), (?)', ['Proveedor Genérico', 'Distribuidora Acme', 'Mayorista Contoso'])
      console.log('Seeded default suppliers: Proveedor Genérico, Distribuidora Acme, Mayorista Contoso')
    } else {
      console.log('Suppliers already present, skipping supplier seeding.')
    }
  } catch (e) {
    console.warn('Supplier seeding error:', e.message)
  }

  // Seed default departments
  try {
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM departments')
    const count = rows?.[0]?.c || 0
    if (count === 0) {
      await conn.query('INSERT INTO departments (name) VALUES (?), (?), (?)', ['INFORMÁTICA', 'FARMACIA', 'FERRETERÍA'])
      console.log('Seeded default departments: Informática, Farmacia, Ferretería')
    } else {
      console.log('Departments already present, skipping department seeding.')
    }
  } catch (e) {
    console.warn('Departments seeding error:', e.message)
  }

  // Ensure shelves table and seed default shelves
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS shelves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE
    )`)
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM shelves')
    const count = rows?.[0]?.c || 0
    if (count === 0) {
      const defaults = ['A1','A2','B1','B2','C1','C2','D1','D2']
      const placeholders = defaults.map(() => '(?)').join(', ')
      await conn.query(`INSERT INTO shelves (name) VALUES ${placeholders}`, defaults)
      console.log(`Seeded default shelves: ${defaults.join(', ')}`)
    } else {
      console.log('Shelves already present, skipping shelves seeding.')
    }
  } catch (e) {
    console.warn('Shelves seeding error:', e.message)
  }

  // Seed products from existing JSON if present
  const productsPath = path.resolve(process.cwd(), 'server', 'data', 'products.json')
  let inserted = 0
  if (fs.existsSync(productsPath)) {
    try {
      const raw = fs.readFileSync(productsPath, 'utf-8')
      const items = JSON.parse(raw)
      console.log(`Found ${items.length} products in JSON. Migrating to MySQL...`)
      for (const p of items) {
        const name = p.name
        const sku = p.sku || null
        const price = Number(p.price) || 0
        const stock = Number(p.stock) || 0
        const imageUrl = p.imageUrl || null
        // If JSON has brandId, attempt to use it, else null
        const brandId = p.brandId ? Number(p.brandId) : null
        try {
          await conn.query(
            'INSERT INTO products (name, sku, brand_id, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), brand_id=VALUES(brand_id), price=VALUES(price), stock=VALUES(stock), image_url=VALUES(image_url)',
            [name, sku, brandId, price, stock, imageUrl]
          )
          inserted++
        } catch (e) {
          console.warn('Product insert skipped:', e.message)
        }
      }
      console.log(`Seeded ${inserted} products into MySQL.`)
    } catch (e) {
      console.error('Error seeding products:', e)
    }
  } else {
    console.log('No products.json found, skipping product seeding.')
  }

  await conn.end()
}

run().catch(err => {
  console.error('Seed error:', err)
  process.exit(1)
})