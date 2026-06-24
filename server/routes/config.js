import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import multer from 'multer'
import mysql from 'mysql2'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { authMiddleware, roleMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { dataDir, uploadsDir } from '../paths.js'

const router = express.Router()
const cfgPath = path.join(dataDir, 'config.json')
const backupsDir = path.join(dataDir, 'backups')
const upload = multer({ dest: uploadsDir })
const execFileAsync = promisify(execFile)

function ensureSeed() {
  if (!fs.existsSync(cfgPath)) {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    const seed = { name: 'DTMPos', currency: 'USD', logoUrl: 'https://placehold.co/64x64?text=LOGO' }
    fs.writeFileSync(cfgPath, JSON.stringify(seed, null, 2))
  }
}
ensureSeed()

function buildBackupFilename() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-') + '_' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('-')

  return `backup-${stamp}.sql`
}

function buildArchiveFilename(prefix) {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-') + '_' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('-')

  return `${prefix}-${stamp}.tar.gz`
}

async function createTarGz({ cwd, outputPath, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('No hay archivos para incluir en el backup')
  }

  try {
    await execFileAsync('tar', ['-czf', outputPath, ...entries], {
      cwd,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('La utilidad tar no está disponible en el servidor')
    }
    throw error
  }
}

async function generateDatabaseDump(pool) {
  const [tableRows] = await pool.query('SHOW TABLES')
  const tables = (tableRows || []).map(row => Object.values(row)[0]).filter(Boolean)
  const lines = [
    '-- DTMPos database backup',
    `-- Generated at ${new Date().toISOString()}`,
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    ''
  ]

  for (const tableName of tables) {
    const safeTableName = String(tableName).replace(/`/g, '``')
    const [createRows] = await pool.query(`SHOW CREATE TABLE \`${safeTableName}\``)
    const createRow = createRows?.[0]
    const createSql = createRow?.['Create Table']

    if (!createSql) continue

    lines.push(`-- Table structure for \`${safeTableName}\``)
    lines.push(`DROP TABLE IF EXISTS \`${safeTableName}\`;`)
    lines.push(`${createSql};`)
    lines.push('')

    const [dataRows] = await pool.query(`SELECT * FROM \`${safeTableName}\``)
    if (!Array.isArray(dataRows) || dataRows.length === 0) {
      continue
    }

    const columns = Object.keys(dataRows[0]).map(column => `\`${String(column).replace(/`/g, '``')}\``).join(', ')
    lines.push(`-- Data for \`${safeTableName}\``)

    for (let index = 0; index < dataRows.length; index += 100) {
      const batch = dataRows.slice(index, index + 100)
      const valuesSql = batch.map(row => {
        const values = Object.values(row).map(value => mysql.escape(value)).join(', ')
        return `(${values})`
      }).join(',\n')

      lines.push(`INSERT INTO \`${safeTableName}\` (${columns}) VALUES`)
      lines.push(`${valuesSql};`)
    }

    lines.push('')
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;')
  lines.push('')
  return lines.join('\n')
}

async function buildFullBackupArchive(pool) {
  fs.mkdirSync(backupsDir, { recursive: true })

  const archiveName = buildArchiveFilename('backup-completo')
  const archivePath = path.join(backupsDir, archiveName)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dtmpos-backup-'))
  const packageDir = path.join(tempRoot, 'backup-completo')

  try {
    fs.mkdirSync(packageDir, { recursive: true })

    const dumpContent = await generateDatabaseDump(pool)
    fs.writeFileSync(path.join(packageDir, 'database.sql'), dumpContent, 'utf-8')

    if (fs.existsSync(uploadsDir)) {
      fs.cpSync(uploadsDir, path.join(packageDir, 'uploads'), { recursive: true })
    }

    if (fs.existsSync(cfgPath)) {
      fs.copyFileSync(cfgPath, path.join(packageDir, 'config.json'))
    }

    fs.writeFileSync(
      path.join(packageDir, 'README.txt'),
      [
        'DTMPos backup completo',
        `Generado: ${new Date().toISOString()}`,
        '',
        'Contenido:',
        '- database.sql: respaldo de la base de datos',
        '- uploads/: imagenes y archivos subidos',
        '- config.json: configuracion del sistema',
        '',
        'Para restaurar las imagenes, copia la carpeta uploads dentro de server/uploads del proyecto.'
      ].join('\n'),
      'utf-8'
    )

    await createTarGz({
      cwd: tempRoot,
      outputPath: archivePath,
      entries: ['backup-completo']
    })

    return { archiveName, archivePath }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

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

router.get('/backup', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const pool = await getPool()
    const filename = buildBackupFilename()
    const dumpContent = await generateDatabaseDump(pool)

    fs.mkdirSync(backupsDir, { recursive: true })
    fs.writeFileSync(path.join(backupsDir, filename), dumpContent, 'utf-8')

    res.setHeader('Content-Type', 'application/sql; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(dumpContent)
  } catch (err) {
    console.error('Config BACKUP error:', err)
    const reason = err?.message ? `: ${err.message}` : ''
    return res.status(500).json({ error: `No se pudo generar el backup de la base de datos${reason}` })
  }
})

router.get('/backup/full', authMiddleware, roleMiddleware(['ADMIN']), async (req, res) => {
  try {
    const pool = await getPool()
    const { archiveName, archivePath } = await buildFullBackupArchive(pool)
    return res.download(archivePath, archiveName)
  } catch (err) {
    console.error('Config FULL BACKUP error:', err)
    const reason = err?.message ? `: ${err.message}` : ''
    return res.status(500).json({ error: `No se pudo generar el backup completo${reason}` })
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
