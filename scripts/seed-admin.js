'use strict';

// Creates the first admin user.
// Usage: node scripts/seed-admin.js email "Display Name" password
//
// Example:
//   node scripts/seed-admin.js admin@gforce.co.nz "Admin" mypassword

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { getPool, closePool } = require('../db');

async function main() {
  const [,, email, displayName, password] = process.argv;
  if (!email || !displayName || !password) {
    console.error('Usage: node scripts/seed-admin.js <email> "<Display Name>" <password>');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const db = getPool();

  const res = await db.query(
    `INSERT INTO task_requests.users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, display_name = $3, role = 'admin', is_active = true
     RETURNING id, email, display_name, role`,
    [email, hash, displayName]
  );

  console.log('Admin user ready:', res.rows[0]);
  await closePool();
}

main().catch(err => { console.error(err.message); process.exit(1); });
