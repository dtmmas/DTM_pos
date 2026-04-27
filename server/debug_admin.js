const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dtmpos_db'
};

async function checkAdmin() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // 1. Check admin user
    const [users] = await conn.query('SELECT * FROM users WHERE username = ?', ['admin']);
    if (users.length === 0) {
      console.log('User admin not found');
      return;
    }
    const admin = users[0];
    console.log('Admin user:', admin);

    if (!admin.role_id) {
      console.log('Admin has no role_id!');
    } else {
      // 2. Check role
      const [roles] = await conn.query('SELECT * FROM roles WHERE id = ?', [admin.role_id]);
      if (roles.length === 0) {
        console.log('Role not found for id:', admin.role_id);
      } else {
        console.log('Admin role:', roles[0]);
        
        // 3. Check permissions
        const [perms] = await conn.query(`
          SELECT p.code 
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          WHERE rp.role_id = ?
        `, [admin.role_id]);
        
        console.log('Permissions count:', perms.length);
        console.log('Permissions:', perms.map(p => p.code));
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

checkAdmin();
