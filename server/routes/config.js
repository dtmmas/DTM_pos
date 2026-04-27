import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'

const router = express.Router()
const cfgPath = path.join(process.cwd(), 'server', 'data', 'config.json')
const upload = multer({ dest: path.join(process.cwd(), 'server', 'uploads') })

function ensureSeed() {
  if (!fs.existsSync(cfgPath)) {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    const seed = { name: 'DTMPos', currency: 'USD', logoUrl: 'https://placehold.co/64x64?text=LOGO' }
    fs.writeFileSync(cfgPath, JSON.stringify(seed, null, 2))
  }
}
ensureSeed()

router.get('/', async (req, res) => {
  try {
    const pool = await getPool()
    if (pool) {
      const [rows] = await pool.query('SELECT id, name, currency, logo_url FROM system_config WHERE id = 1 LIMIT 1')
      const row = rows?.[0]
      if (!row) return res.json({ name: 'DTMPos', currency: 'USD', logoUrl: '' })
      return res.json({ name: row.name, currency: row.currency, logoUrl: row.logo_url || '' })
    }
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    return res.json(cfg)
  } catch (err) {
    console.error('Config GET error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

router.put('/', authMiddleware, roleMiddleware(['ADMIN']), upload.single('logo'), async (req, res) => {
  try {
    const { name, currency } = req.body
    const file = req.file
    const pool = await getPool()
    if (pool) {
      const [rows] = await pool.query('SELECT logo_url FROM system_config WHERE id = 1 LIMIT 1')
      const current = rows?.[0]
      const nextLogo = file ? `/uploads/${file.filename}` : (req.body.logoUrl || current?.logo_url || null)
      await pool.query('UPDATE system_config SET name = ?, currency = ?, logo_url = ? WHERE id = 1', [name, currency, nextLogo])
      return res.json({ ok: true })
    }
    // Fallback a archivo JSON si USE_MOCK=true
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    const next = { ...cfg, name, currency }
    if (file) next.logoUrl = `/uploads/${file.filename}`
    else if (req.body.logoUrl !== undefined) next.logoUrl = req.body.logoUrl
    fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2))
    return res.json({ ok: true })
  } catch (err) {
    console.error('Config PUT error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router