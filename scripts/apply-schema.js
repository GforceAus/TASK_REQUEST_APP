'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'gforce_test',
  user: 'postgres',
  password: 'Jaskirats9540@#',
  ssl: false,
});

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

main().catch(err => { console.error(err.message); pool.end(); });
