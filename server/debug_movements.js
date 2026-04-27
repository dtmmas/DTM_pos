import 'dotenv/config';
import { getPool } from './db.js';

async function checkMovements() {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT * FROM inventory_movements ORDER BY id DESC LIMIT 10');
    console.log('Last 10 movements:', JSON.stringify(rows, null, 2));
    
    const [sales] = await pool.query('SELECT id, created_at, total FROM sales ORDER BY id DESC LIMIT 5');
    console.log('Last 5 sales:', JSON.stringify(sales, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkMovements();
