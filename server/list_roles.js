import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import path from 'path'

// Explicit path to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function listRoles() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  console.log(`Connecting to ${user}@${host}:${port}/${database}`)

  try {
      const conn = await mysql.createConnection({ host, port, user, password, database })
      const [rows] = await conn.query('SELECT * FROM roles')
      console.log('Roles found:', rows)
      await conn.end()
  } catch (err) {
      console.error('Error:', err.message)
  }
}

listRoles()
