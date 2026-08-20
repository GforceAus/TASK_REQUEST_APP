'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.PGHOST,
      port:     parseInt(process.env.PGPORT || '25060', 10),
      database: process.env.PGDATABASE || 'gforce',
      user:     process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl:      process.env.PGHOST === 'localhost' ? false : { rejectUnauthorized: false },
      max:      5,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => console.error('[db] Pool error:', err.message));
  }
  return pool;
}

async function getDropdowns() {
  const db = getPool();
  const [retailers, suppliers, states] = await Promise.all([
    db.query('SELECT DISTINCT retailer      FROM field_ops.call_cycles ORDER BY retailer'),
    db.query('SELECT DISTINCT supplier_name FROM field_ops.call_cycles ORDER BY supplier_name'),
    db.query('SELECT DISTINCT state         FROM field_ops.stores      ORDER BY state'),
  ]);
  return {
    retailers: retailers.rows.map(r => r.retailer).filter(Boolean),
    suppliers: suppliers.rows.map(r => r.supplier_name).filter(Boolean),
    states:    states.rows.map(r => r.state).filter(Boolean),
  };
}

async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { getPool, getDropdowns, closePool };
