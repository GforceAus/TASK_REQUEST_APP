'use strict';

const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'gforce_test',
  user: 'postgres',
  password: 'Jaskirats9540@#',
  ssl: false,
});

async function main() {
  const hash = await bcrypt.hash('admin123', 12);
  const res = await pool.query(
    `INSERT INTO task_requests.users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin', is_active = true
     RETURNING id, email, display_name, role`,
    ['j.singh@gforce.co.nz', hash, 'J Singh']
  );
  console.log('Admin created:', res.rows[0]);
  await pool.end();
}

main().catch(err => { console.error(err.message); pool.end(); });
