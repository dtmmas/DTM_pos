import 'dotenv/config';
import { getPool } from './db.js';

async function debugStock() {
  const pool = await getPool();
  
  console.log('--- PRODUCTS ---');
  const [products] = await pool.query('SELECT id, name, product_code, sku FROM products ORDER BY id DESC LIMIT 5');
  console.table(products);

  console.log('--- WAREHOUSE STOCK ---');
  const [stock] = await pool.query('SELECT * FROM product_warehouse_stock ORDER BY id DESC LIMIT 10');
  console.table(stock);

  console.log('--- INVENTORY MOVEMENTS ---');
  const [movements] = await pool.query('SELECT * FROM inventory_movements ORDER BY id DESC LIMIT 10');
  console.table(movements);
  
  process.exit();
}

debugStock();
