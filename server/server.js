import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import authRouter from './routes/auth.js'
import configRouter from './routes/config.js'
import productsRouter from './routes/products.js'
import categoriesRouter from './routes/categories.js'
import brandsRouter from './routes/brands.js'
import suppliersRouter from './routes/suppliers.js'
import unitsRouter from './routes/units.js'
import departmentsRouter from './routes/departments.js'
import shelvesRouter from './routes/shelves.js'
import warehousesRouter from './routes/warehouses.js'
import { getPool } from './db.js'
import salesRouter from './routes/sales.js'
import purchasesRouter from './routes/purchases.js'
import inventoryRouter from './routes/inventory.js'
import customersRouter from './routes/customers.js'
import creditsRouter from './routes/credits.js'
import rolesRouter from './routes/roles.js'
import usersRouter from './routes/users.js'
import transfersRouter from './routes/transfers.js'
import cashRegistersRouter from './routes/cash_registers.js'

dotenv.config()
const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

// ensure uploads dir exists
const uploadsDir = path.join(process.cwd(), 'server', 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/roles', rolesRouter)
app.use('/api/users', usersRouter)
app.use('/api/config', configRouter)
app.use('/api/products', productsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/brands', brandsRouter)
app.use('/api/suppliers', suppliersRouter)
app.use('/api/units', unitsRouter)
app.use('/api/departments', departmentsRouter)
app.use('/api/shelves', shelvesRouter)
app.use('/api/warehouses', warehousesRouter)
app.use('/api/sales', salesRouter)
app.use('/api/purchases', purchasesRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/customers', customersRouter)
app.use('/api/credits', creditsRouter)
app.use('/api/transfers', transfersRouter)
app.use('/api/cash-registers', cashRegistersRouter)

// Start server only if DB connects
;(async () => {
  try {
    await getPool()
    console.log('MySQL connected')
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
  } catch (err) {
    console.error('Failed to connect to MySQL:', err?.message || err)
    process.exit(1)
  }
})()