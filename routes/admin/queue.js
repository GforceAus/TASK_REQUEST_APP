'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { getPool } = require('../../db');
const { requireApprover } = require('../../middleware/auth');

const router = express.Router();

router.get('/admin/queue', requireApprover, (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', 'queue.html'), 'utf8')
    .replace(/\{\{DISPLAY_NAME\}\}/g, req.session.displayName)
    .replace('{{ROLE}}', req.session.role);
  res.send(html);
});

router.get('/api/admin/queue', requireApprover, async (req, res) => {
  try {
    const db = getPool();
    const isCrm = req.session.role === 'crm';
    const result = await db.query(
      `SELECT r.id, r.task_name, r.supplier_name, r.retailer_name, r.country,
              r.status, r.created_at, u.email AS submitter_email, u.display_name AS submitter_name
       FROM task_requests.requests r
       JOIN task_requests.users u ON u.id = r.user_id
       WHERE r.status = 'pending'
         AND ($1 = false OR EXISTS (
           SELECT 1 FROM task_requests.user_permissions p
           WHERE p.user_id = $2 AND p.supplier_name = r.supplier_name AND p.country = r.country
         ))
       ORDER BY r.created_at ASC`,
      [isCrm, req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/requests/:id', requireApprover, async (req, res) => {
  try {
    const db = getPool();
    const [reqRow, attRows] = await Promise.all([
      db.query(
        `SELECT r.*, u.email AS submitter_email, u.display_name AS submitter_name
         FROM task_requests.requests r
         JOIN task_requests.users u ON u.id = r.user_id
         WHERE r.id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT original_name, attachment_type, size_bytes
         FROM task_requests.request_attachments
         WHERE request_id = $1
         ORDER BY attachment_type DESC`,
        [req.params.id]
      ),
    ]);
    if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const request = reqRow.rows[0];

    if (req.session.role === 'crm') {
      const permCheck = await db.query(
        `SELECT 1 FROM task_requests.user_permissions WHERE user_id = $1 AND supplier_name = $2 AND country = $3`,
        [req.session.userId, request.supplier_name, request.country]
      );
      if (permCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have permission to view this request.' });
      }
    }

    res.json({ ...request, attachments: attRows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
