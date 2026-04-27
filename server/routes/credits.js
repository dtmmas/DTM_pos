import express from 'express'
import multer from 'multer'
import path from 'path'
import { authMiddleware } from '../auth.js'
import { getPool } from '../db.js'
import { uploadsDir } from '../paths.js'

const router = express.Router()

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  }
})

const upload = multer({ storage: storage })

// Listar créditos pendientes
router.get('/', authMiddleware, async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim()
    const status = (req.query.status || '').toString().trim() // 'PENDING', 'PAID'
    const startDate = (req.query.startDate || '').toString().trim()
    const endDate = (req.query.endDate || '').toString().trim()
    
    const pool = await getPool()
    
    let query = `
      SELECT 
        i.id, 
        i.sale_id, 
        i.due_date, 
        i.amount as total_amount, 
        i.paid,
        s.doc_no, 
        s.created_at as sale_date,
        c.name as customer_name,
        (SELECT COALESCE(SUM(amount), 0) FROM credit_payments cp WHERE cp.installment_id = i.id) as paid_amount
      FROM installments i 
      JOIN sales s ON i.sale_id = s.id 
      LEFT JOIN customers c ON s.customer_id = c.id 
      WHERE s.status != 'CANCELLED'
    `
    
    const params = []

    if (search) {
      query += ` AND (c.name LIKE ? OR s.doc_no LIKE ? OR s.id = ?)`
      params.push(`%${search}%`, `%${search}%`, search)
    }

    if (status === 'PENDING' || status === 'PENDIENTE') {
      query += ` AND i.paid = 0`
    } else if (status === 'PAID' || status === 'PAGADO' || status === 'PAGADOS') {
      query += ` AND i.paid = 1`
    }

    if (startDate) {
      query += ` AND DATE(s.created_at) >= ?`
      params.push(startDate)
    }

    if (endDate) {
      query += ` AND DATE(s.created_at) <= ?`
      params.push(endDate)
    }

    query += ` ORDER BY i.paid ASC, i.due_date ASC`

    const [rows] = await pool.query(query, params)
    res.json(rows)
  } catch (err) {
    console.error('Credits list error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Listar historial de pagos de un crédito
router.get('/:id/payments', authMiddleware, async (req, res) => {
  try {
    const installmentId = req.params.id
    const pool = await getPool()
    
    const [rows] = await pool.query(
      `SELECT id, amount, payment_method, reference, paid_at as created_at, received_by, document_url 
       FROM credit_payments 
       WHERE installment_id = ? 
       ORDER BY paid_at DESC`,
      [installmentId]
    )
    
    res.json(rows)
  } catch (err) {
    console.error('Payments history error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Registrar pago
router.post('/pay', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    const { installmentId, amount, paymentMethod, reference, responsible, paymentDate } = req.body
    const documentUrl = req.file ? `/uploads/${req.file.filename}` : null
    
    if (!installmentId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Datos inválidos' })
    }

    if ((paymentMethod === 'CARD' || paymentMethod === 'DEPOSIT') && !reference) {
      return res.status(400).json({ error: 'Referencia requerida para Tarjeta/Depósito' })
    }

    // Determinar fecha de pago
    let finalPaymentDate = new Date()
    if (paymentMethod !== 'CASH' && paymentDate) {
      finalPaymentDate = new Date(paymentDate)
    }

    const pool = await getPool()
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      // 1. Verificar deuda actual
      const [rows] = await conn.query(
        `SELECT 
          i.id, i.amount, i.paid,
          (SELECT COALESCE(SUM(amount), 0) FROM credit_payments cp WHERE cp.installment_id = i.id) as paid_so_far
         FROM installments i 
         WHERE i.id = ? FOR UPDATE`,
        [installmentId]
      )

      if (rows.length === 0) {
        throw new Error('Cuota no encontrada')
      }

      const installment = rows[0]
      if (installment.paid) {
        throw new Error('Esta cuota ya está pagada')
      }

      const currentDebt = Number(installment.amount) - Number(installment.paid_so_far)
      if (Number(amount) > currentDebt) {
        throw new Error(`El monto excede la deuda pendiente (${currentDebt})`)
      }

      // 2. Registrar pago
      const [result] = await conn.query(
        'INSERT INTO credit_payments (installment_id, amount, payment_method, reference, document_url, received_by, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [installmentId, amount, paymentMethod || 'CASH', reference || null, documentUrl, responsible || null, finalPaymentDate]
      )
      const paymentId = result.insertId

      // 3. Verificar si se completó el pago
      const newPaidAmount = Number(installment.paid_so_far) + Number(amount)
      // Usamos un pequeño margen por errores de punto flotante
      if (Math.abs(newPaidAmount - Number(installment.amount)) < 0.01) {
        await conn.query(
          'UPDATE installments SET paid = 1, paid_at = NOW() WHERE id = ?',
          [installmentId]
        )
      }

      await conn.commit()
      res.json({ success: true, paymentId })

    } catch (err) {
      await conn.rollback()
      console.error('Error registrando pago:', err)
      res.status(400).json({ error: err.message || 'Error al registrar pago' })
    } finally {
      conn.release()
    }

  } catch (err) {
    console.error('Credit pay error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
