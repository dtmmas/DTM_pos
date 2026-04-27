
// import fetch from 'node-fetch' 
// Node 18+ has fetch built-in. Using global fetch.

const BASE_URL = 'http://localhost:4003/api'
const CREDS = { email: 'admin@local', password: 'admin123' }

async function run() {
  try {
    // 1. Login
    console.log('Logging in...')
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS)
    })
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`)
    const loginData = await loginRes.json()
    const token = loginData.token
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    console.log('Logged in.')

    // 2. Get/Create Supplier
    console.log('Getting suppliers...')
    const suppRes = await fetch(`${BASE_URL}/suppliers`, { headers })
    let suppliers = await suppRes.json()
    // Handle potential array wrapper or data property
    if (suppliers.data && Array.isArray(suppliers.data)) suppliers = suppliers.data
    
    let supplier = suppliers[0]
    
    if (!supplier) {
        console.log('No suppliers found, creating one...')
        const newSuppRes = await fetch(`${BASE_URL}/suppliers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'Test Supplier', email: 'test@supplier.com', phone: '1234567890', address: '123 Test St' })
        })
        const newSuppData = await newSuppRes.json()
        supplier = { id: newSuppData.insertId || newSuppData.id, name: 'Test Supplier' }
        console.log('Created supplier:', supplier.id)
    } else {
        console.log(`Using supplier: ${supplier.id} (${supplier.name})`)
    }

    // 3. Get/Create Product
    console.log('Getting products...')
    const prodRes = await fetch(`${BASE_URL}/products`, { headers })
    let products = await prodRes.json()
    let product = products[0]
    
    if (!product) {
        console.log('No products found, creating one...')
        const newProdRes = await fetch(`${BASE_URL}/products`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'Test Product', price: 100, cost: 50, stock: 10 })
        })
        const newProdData = await newProdRes.json()
        product = { id: newProdData.id, stock: 10 } // approximation
        console.log('Created product:', product.id)
    } else {
        console.log(`Using product: ${product.id} (Current Store Stock: ${product.stock})`)
    }

    // 3. Get/Create Warehouse
    console.log('Getting warehouses...')
    const whRes = await fetch(`${BASE_URL}/warehouses`, { headers })
    let warehouses = await whRes.json()
    let warehouse = warehouses[0]

    if (!warehouse) {
        console.log('No warehouses found, creating one...')
        const newWhRes = await fetch(`${BASE_URL}/warehouses`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'Test Warehouse' })
        })
        const newWhData = await newWhRes.json()
        warehouse = { id: newWhData.id, name: 'Test Warehouse' }
        console.log('Created warehouse:', warehouse.id)
    } else {
        console.log(`Using warehouse: ${warehouse.id} (${warehouse.name})`)
    }

    // 4. Initial Stock Check
    // Store Stock
    const pRes1 = await fetch(`${BASE_URL}/products/${product.id}`, { headers })
    const pData1 = await pRes1.json()
    const initialStoreStock = pData1.stock
    console.log(`Initial Store Stock: ${initialStoreStock}`)

    // Warehouse Stock
    const whStockRes1 = await fetch(`${BASE_URL}/products/${product.id}/warehouse-stock`, { headers })
    const whStockData1 = await whStockRes1.json()
    const whItem1 = whStockData1.find(w => w.warehouseId === warehouse.id)
    const initialWhStock = whItem1 ? whItem1.quantity : 0
    console.log(`Initial Warehouse Stock: ${initialWhStock}`)

    // 6. Purchase to Warehouse
    const qty1 = 5
    console.log(`\n--- Purchasing ${qty1} items to Warehouse (${warehouse.id}) ---`)
    const purch1Res = await fetch(`${BASE_URL}/purchases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            supplierId: supplier.id,
            docNo: 'TEST-WH-001',
            total: qty1 * 50,
            notes: 'Test Warehouse Purchase',
            warehouseId: warehouse.id,
            items: [{ productId: product.id, quantity: qty1, unitCost: 50 }]
        })
    })
    if (!purch1Res.ok) {
        console.error('Purchase 1 failed:', await purch1Res.text())
    } else {
        console.log('Purchase 1 successful.')
    }

    // Verify
    const pRes2 = await fetch(`${BASE_URL}/products/${product.id}`, { headers })
    const pData2 = await pRes2.json()
    const whStockRes2 = await fetch(`${BASE_URL}/products/${product.id}/warehouse-stock`, { headers })
    const whStockData2 = await whStockRes2.json()
    const whItem2 = whStockData2.find(w => w.warehouseId === warehouse.id)
    const newWhStock = whItem2 ? whItem2.quantity : 0

    console.log(`Store Stock: ${initialStoreStock} -> ${pData2.stock} (Expected: ${initialStoreStock})`)
    console.log(`Warehouse Stock: ${initialWhStock} -> ${newWhStock} (Expected: ${initialWhStock + qty1})`)

    if (pData2.stock === initialStoreStock && newWhStock === initialWhStock + qty1) {
        console.log('SUCCESS: Warehouse purchase updated correct stock.')
    } else {
        console.error('FAILURE: Warehouse purchase stock mismatch.')
    }

    // 6. Purchase to Store
    const qty2 = 3
    console.log(`\n--- Purchasing ${qty2} items to Store (No Warehouse) ---`)
    const purch2Res = await fetch(`${BASE_URL}/purchases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            supplierId: supplier.id,
            docNo: 'TEST-STORE-001',
            total: qty2 * 50,
            notes: 'Test Store Purchase',
            warehouseId: '', // Empty
            items: [{ productId: product.id, quantity: qty2, unitCost: 50 }]
        })
    })
    if (!purch2Res.ok) {
        console.error('Purchase 2 failed:', await purch2Res.text())
    } else {
        console.log('Purchase 2 successful.')
    }

    // Verify
    const pRes3 = await fetch(`${BASE_URL}/products/${product.id}`, { headers })
    const pData3 = await pRes3.json()
    const whStockRes3 = await fetch(`${BASE_URL}/products/${product.id}/warehouse-stock`, { headers })
    const whStockData3 = await whStockRes3.json()
    const whItem3 = whStockData3.find(w => w.warehouseId === warehouse.id)
    const finalWhStock = whItem3 ? whItem3.quantity : 0

    console.log(`Store Stock: ${pData2.stock} -> ${pData3.stock} (Expected: ${pData2.stock + qty2})`)
    console.log(`Warehouse Stock: ${newWhStock} -> ${finalWhStock} (Expected: ${newWhStock})`)

    if (pData3.stock === pData2.stock + qty2 && finalWhStock === newWhStock) {
        console.log('SUCCESS: Store purchase updated correct stock.')
    } else {
        console.error('FAILURE: Store purchase stock mismatch.')
    }

  } catch (err) {
    console.error('Error:', err)
  }
}

run()
