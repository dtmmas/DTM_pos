import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function run() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true })

  // Ensure shelves table exists
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
    console.log(`Seeded shelves: ${defaults.join(', ')}`)
  } else {
    console.log('Shelves already present, skipping.')
  }

  await conn.end()
}

run().catch(err => {
  console.error('Seed shelves error:', err)
  process.exit(1)
})