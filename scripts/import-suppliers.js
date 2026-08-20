'use strict';

const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'gforce_test',
  user: 'postgres',
  password: 'Jaskirats9540@#',
  ssl: false,
});

function normalizeCountry(c) {
  const trimmed = (c || '').trim();
  return trimmed.toLowerCase() === 'new zealand' ? 'New Zealand' : trimmed;
}

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'imports', 'supplier_listing.xlsx');
  const wb = xlsx.readFile(filePath);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['data'], { defval: null });

  let imported = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO task_requests.suppliers (supplier_id, username, short_name, full_name, state, country, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (username, country) DO UPDATE SET
         supplier_id = $1, short_name = $3, full_name = $4, state = $5, status = $7`,
      [
        r['Supplier ID*'],
        r['Username*'],
        r['Short Name'],
        r['Full Company Name*'],
        r['State*'],
        normalizeCountry(r['Country*']),
        r['Status'] || 'active',
      ]
    );
    imported++;
  }

  console.log(`Imported/updated ${imported} suppliers.`);
  await pool.end();
}

main().catch(err => { console.error(err.message); pool.end(); });
