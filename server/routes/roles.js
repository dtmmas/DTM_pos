import express from 'express'
import { getPool } from '../db.js'
import { authMiddleware, permissionMiddleware } from '../auth.js'

const router = express.Router()

router.use(authMiddleware)

// List all roles
router.get('/', permissionMiddleware('roles:read'), async (req, res) => {
  try {
    const pool = await getPool()
    const [roles] = await pool.query('SELECT * FROM roles')
    
    // Fetch permissions for each role
    for (const role of roles) {
      const [perms] = await pool.query(
        'SELECT p.code FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?',
        [role.id]
      )
      role.permissions = perms.map(p => p.code)
    }
    
    res.json(roles)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List all available permissions
router.get('/permissions', permissionMiddleware('roles:read'), async (req, res) => {
  try {
    const pool = await getPool()
    const [perms] = await pool.query('SELECT * FROM permissions')
    res.json(perms)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Create role
router.post('/', permissionMiddleware('roles:write'), async (req, res) => {
  const { name, description, permissions, code } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })

  try {
    const pool = await getPool()
    // Generate code if not provided
    const roleCode = code || name.toUpperCase().replace(/[^A-Z0-9]/g, '_')

    const [resRole] = await pool.query('INSERT INTO roles (code, name, description) VALUES (?, ?, ?)', [roleCode, name, description])
    const roleId = resRole.insertId
    
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      // permissions is array of codes
      const [permRows] = await pool.query('SELECT id, code FROM permissions WHERE code IN (?)', [permissions])
      for (const p of permRows) {
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, p.id])
      }
    }
    
    res.json({ id: roleId, code: roleCode, name, description, permissions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update role
router.put('/:id', permissionMiddleware('roles:write'), async (req, res) => {
  const { id } = req.params
  const { name, description, permissions, code } = req.body
  
  try {
    const pool = await getPool()
    
    if (code) {
      await pool.query('UPDATE roles SET code = ?, name = ?, description = ? WHERE id = ?', [code, name, description, id])
    } else {
      await pool.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id])
    }
    
    if (permissions && Array.isArray(permissions)) {
      await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [id])
      if (permissions.length > 0) {
        const [permRows] = await pool.query('SELECT id, code FROM permissions WHERE code IN (?)', [permissions])
        for (const p of permRows) {
            await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, p.id])
        }
      }
    }
    
    res.json({ id, code, name, description, permissions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete role
router.delete('/:id', permissionMiddleware('roles:write'), async (req, res) => {
  const { id } = req.params
  try {
    const pool = await getPool()
    // Check if used by users
    const [users] = await pool.query('SELECT COUNT(*) as c FROM users WHERE role_id = ?', [id])
    if (users[0].c > 0) return res.status(400).json({ error: 'Cannot delete role assigned to users' })
    
    await pool.query('DELETE FROM roles WHERE id = ?', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
