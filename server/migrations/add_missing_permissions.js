import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function addMissingPermissions() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'

  console.log('Connecting to DB...')
  const conn = await mysql.createConnection({ host, port, user, password, database })

  const newPermissions = [
    { code: 'purchases:read', desc: 'Ver compras' },
    { code: 'purchases:write', desc: 'Crear/Editar compras' },
    { code: 'logs:read', desc: 'Ver logs del sistema' }
  ]

  for (const p of newPermissions) {
    try {
      await conn.query('INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)', [p.code, p.desc])
      console.log(`Added permission: ${p.code}`)
    } catch (e) {
      console.error(`Error adding ${p.code}:`, e.message)
    }
  }

  // Assign these new permissions to ADMIN role
  const [adminRows] = await conn.query('SELECT id FROM roles WHERE name = "ADMIN"')
  if (adminRows.length > 0) {
    const adminId = adminRows[0].id
    for (const p of newPermissions) {
      const [permRows] = await conn.query('SELECT id FROM permissions WHERE code = ?', [p.code])
      if (permRows.length > 0) {
        const permId = permRows[0].id
        await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminId, permId])
        console.log(`Assigned ${p.code} to ADMIN`)
      }
    }
  }

  // Assign purchases:read to ALMACEN
  const [almacenRows] = await conn.query('SELECT id FROM roles WHERE name = "ALMACEN"')
  if (almacenRows.length > 0) {
    const almacenId = almacenRows[0].id
    const purchasesRead = newPermissions.find(p => p.code === 'purchases:read')
    if (purchasesRead) {
        const [permRows] = await conn.query('SELECT id FROM permissions WHERE code = ?', [purchasesRead.code])
        if (permRows.length > 0) {
            await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [almacenId, permRows[0].id])
            console.log(`Assigned purchases:read to ALMACEN`)
        }
    }
  }

  await conn.end()
  console.log('Done.')
}

addMissingPermissions().catch(console.error)
