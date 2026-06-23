import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dtmpos',
})

try {
  await conn.query(
    'INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)',
    ['products:sensitive:read', 'Ver costos y proveedores en productos']
  )
  console.log('Permiso products:sensitive:read verificado')
} finally {
  await conn.end()
}
