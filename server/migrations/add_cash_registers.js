import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function migrateCashRegisters() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  console.log('Connecting to DB...')
  const conn = await mysql.createConnection({ host, port, user, password, database })

  // 1. Create cash_registers table
  await conn.query(`CREATE TABLE IF NOT EXISTS cash_registers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    opening_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    closing_amount DECIMAL(12, 2) NULL,
    calculated_amount DECIMAL(12, 2) NULL,
    opening_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closing_time TIMESTAMP NULL,
    status ENUM('OPEN', 'CLOSED') DEFAULT 'OPEN',
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`)
  console.log('Ensured cash_registers table')

  // 2. Create cash_movements table
  await conn.query(`CREATE TABLE IF NOT EXISTS cash_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cash_register_id INT NOT NULL,
    type ENUM('IN', 'OUT') NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description VARCHAR(255),
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`)
  console.log('Ensured cash_movements table')

  // 3. Add permissions
  const newPermissions = [
    { code: 'cash:open', desc: 'Abrir caja' },
    { code: 'cash:close', desc: 'Cerrar caja' },
    { code: 'cash:movements', desc: 'Registrar entradas/salidas de efectivo' },
    { code: 'cash:view', desc: 'Ver estado de caja' }
  ]

  for (const p of newPermissions) {
    await conn.query('INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)', [p.code, p.desc])
  }

  // Assign to roles
  // Get IDs
  const [roles] = await conn.query('SELECT id, name FROM roles')
  const adminRole = roles.find(r => r.name === 'ADMIN')
  const cajeroRole = roles.find(r => r.name === 'CAJERO')

  const [perms] = await conn.query('SELECT id, code FROM permissions WHERE code LIKE "cash:%"')
  
  if (adminRole) {
    for (const p of perms) {
        await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRole.id, p.id])
    }
    console.log('Assigned cash permissions to ADMIN')
  }

  if (cajeroRole) {
    for (const p of perms) {
        await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [cajeroRole.id, p.id])
    }
    console.log('Assigned cash permissions to CAJERO')
  }

  conn.end()
}

migrateCashRegisters().catch(console.error)
