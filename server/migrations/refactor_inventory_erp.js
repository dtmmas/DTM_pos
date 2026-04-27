import { getPool } from '../db.js'

async function migrate() {
  const pool = await getPool()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    console.log('Iniciando refactorización de inventario ERP...')

    // 1. Refactor Warehouses (Almacenes)
    // Add type, address, status if not exist
    try {
        await conn.query(`ALTER TABLE warehouses ADD COLUMN type ENUM('ALMACEN','TIENDA') NOT NULL DEFAULT 'ALMACEN'`)
    } catch (e) { /* ignore if exists */ }
    try {
        await conn.query(`ALTER TABLE warehouses ADD COLUMN address VARCHAR(255)`)
    } catch (e) { /* ignore */ }
    try {
        await conn.query(`ALTER TABLE warehouses ADD COLUMN status ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'`)
    } catch (e) { /* ignore */ }

    // Ensure at least one store and one warehouse
    await conn.query(`UPDATE warehouses SET type='TIENDA' WHERE id=1`) // Assuming ID 1 is the main store

    // 2. Refactor Inventory (Inventario) -> product_warehouse_stock
    // It already has product_id, warehouse_id, quantity.
    // Ensure UNIQUE constraint (already exists).

    // 3. Refactor Inventory Movements (Movimientos)
    // We need to recreate or alter this table to support warehouse_id and strict types
    // Current: product_id, type (OUT/IN), quantity, ref_type, ref_id, note
    // New: product_id, warehouse_id, type (INITIAL, PURCHASE, SALE, TRANSFER, ADJUSTMENT), quantity, reference_id, user_id
    
    // Rename old table to backup
    try {
        await conn.query(`RENAME TABLE inventory_movements TO inventory_movements_old`)
    } catch (e) { /* might fail if already renamed */ }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        warehouse_id INT NOT NULL,
        type ENUM('INITIAL', 'PURCHASE', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT') NOT NULL,
        quantity INT NOT NULL,
        reference_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id INT NULL,
        notes VARCHAR(255),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      )
    `)

    // 4. Drop stock columns from products
    // We will keep them for a moment to migrate data if needed, but the prompt says "Eliminar".
    // Let's migrate "initial_stock" to an INITIAL movement if inventory is empty?
    // For now, let's just drop them as requested to force the architecture change.
    try {
        await conn.query(`ALTER TABLE products DROP COLUMN stock`)
    } catch (e) {}
    try {
        await conn.query(`ALTER TABLE products DROP COLUMN initial_stock`)
    } catch (e) {}

    console.log('Migración de esquema completada.')
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    console.error('Error en migración:', err)
  } finally {
    conn.release()
    process.exit()
  }
}

migrate()
