import express from 'express'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { authMiddleware, roleMiddleware } from '../auth.js'

dotenv.config()

const router = express.Router()

async function getConn() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'dtmpos'
  return mysql.createConnection({ host, port, user, password, database })
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const conn = await getConn()
    const [rows] = await conn.query('SELECT id, code, name FROM units ORDER BY name ASC')
    await conn.end()
    res.json(rows)
  } catch (err) {
    console.error('GET /units error', err)
    res.status(500).json({ error: 'Error obteniendo unidades' })
  }
})

// Crear unidad
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  const { code, name } = req.body || {}
  if (!code || !name) {
    return res.status(400).json({ error: 'code y name son requeridos' })
  }
  if (String(code).length > 10 || String(name).length > 100) {
    return res.status(400).json({ error: 'code<=10 y name<=100 caracteres' })
  }
  try {
    const conn = await getConn()
    const [exists] = await conn.query('SELECT id FROM units WHERE code = ? LIMIT 1', [code])
    if (exists.length) {
      await conn.end()
      return res.status(409).json({ error: 'El código ya existe' })
    }
    const [result] = await conn.execute('INSERT INTO units (code, name) VALUES (?, ?)', [code, name])
    const id = result.insertId
    await conn.end()
    res.status(201).json({ id, code, name })
  } catch (err) {
    console.error('POST /units error', err)
    res.status(500).json({ error: 'Error creando unidad' })
  }
})

// Actualizar unidad
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { code, name } = req.body || {}
  const unitId = Number(id)
  if (!unitId || !code || !name) {
    return res.status(400).json({ error: 'id, code y name son requeridos' })
  }
  if (String(code).length > 10 || String(name).length > 100) {
    return res.status(400).json({ error: 'code<=10 y name<=100 caracteres' })
  }
  try {
    const conn = await getConn()
    const [exists] = await conn.query('SELECT id FROM units WHERE code = ? AND id != ? LIMIT 1', [code, unitId])
    if (exists.length) {
      await conn.end()
      return res.status(409).json({ error: 'El código ya está en uso' })
    }
    const [result] = await conn.execute('UPDATE units SET code = ?, name = ? WHERE id = ?', [code, name, unitId])
    await conn.end()
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada' })
    }
    res.json({ id: unitId, code, name })
  } catch (err) {
    console.error('PUT /units/:id error', err)
    res.status(500).json({ error: 'Error actualizando unidad' })
  }
})

// Eliminar unidad
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const unitId = Number(id)
  if (!unitId) {
    return res.status(400).json({ error: 'id inválido' })
  }
  try {
    const conn = await getConn()
    const [result] = await conn.execute('DELETE FROM units WHERE id = ?', [unitId])
    await conn.end()
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /units/:id error', err)
    res.status(500).json({ error: 'Error eliminando unidad' })
  }
})

export default router