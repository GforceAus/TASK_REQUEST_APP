'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { getPool } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/my-requests', requireLogin, (req, res) => {
  if (req.session.role === 'crm') return res.redirect('/admin/queue');
  const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'my-requests.html'), 'utf8')
    .replace(/\{\{DISPLAY_NAME\}\}/g, req.session.displayName)
    .replace('{{ROLE}}', req.session.role);
  res.send(html);
});

router.get('/api/my-requests', requireLogin, async (req, res) => {
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT id, task_name, supplier_name, retailer_name, country, status,
              rejection_reason, created_at, reviewed_at
       FROM task_requests.requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/my-requests/:id', requireLogin, async (req, res) => {
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT r.*, a.original_name, a.attachment_type, a.size_bytes
       FROM task_requests.requests r
       LEFT JOIN task_requests.request_attachments a ON a.request_id = r.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const row = result.rows[0];
    const attachments = result.rows
      .filter(r => r.original_name)
      .map(r => ({ name: r.original_name, type: r.attachment_type, size: r.size_bytes }));

    res.json({ ...row, attachments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
