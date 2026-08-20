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
  const filePath = path.join(__dirname, '..', 'data', 'imports', 'callCycle_listing.xlsx');
  const wb = xlsx.readFile(filePath);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['data'], { defval: null });

  // ── Aggregate per supplier: distinct retailers + the (consistent) state set ──
  const bySupplier = new Map();
  for (const r of rows) {
    const username = r['Supplier Username*'];
    const retailer = r['Retailer Name*'];
    const country  = normalizeCountry(r['Country']);
    const states   = r['State'];
    if (!username || !retailer) continue;

    if (!bySupplier.has(username)) bySupplier.set(username, { retailers: new Set(), states, country });
    bySupplier.get(username).retailers.add(retailer);
  }

  let retailerRows = 0;
  let suppliersUpdated = 0;

  for (const [username, info] of bySupplier) {
    for (const retailer of info.retailers) {
      await pool.query(
        `INSERT INTO task_requests.supplier_retailers (supplier_username, retailer_name, country)
         VALUES ($1,$2,$3)
         ON CONFLICT (supplier_username, retailer_name, country) DO NOTHING`,
        [username, retailer, info.country]
      );
      retailerRows++;
    }

    const res = await pool.query(
      `UPDATE task_requests.suppliers SET operating_states = $2 WHERE username = $1`,
      [username, info.states]
    );
    suppliersUpdated += res.rowCount;
  }

  console.log(`Imported ${retailerRows} supplier-retailer links across ${bySupplier.size} suppliers.`);
  console.log(`Updated operating_states on ${suppliersUpdated} supplier rows.`);
  await pool.end();
}

main().catch(err => { console.error(err.message); pool.end(); });
