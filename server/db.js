import mysql from 'mysql2/promise'

let pool = null

export async function getPool() {
  if (pool) return pool

  const host = process.env.DB_HOST
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME

  const missing = [host && 'DB_HOST', user && 'DB_USER', password && 'DB_PASSWORD', database && 'DB_NAME'].filter(Boolean).length !== 4
  if (missing) {
    throw new Error('Missing required DB env vars: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME')
  }

  pool = await mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })

  const conn = await pool.getConnection()
  conn.release()
  return pool
}