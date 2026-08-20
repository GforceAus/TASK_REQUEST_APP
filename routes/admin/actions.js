'use strict';

const express  = require('express');
const { getPool } = require('../../db');
const { sendTaskEmail, sendRejectionEmail } = require('../../mailer');
const { requireApprover } = require('../../middleware/auth');

const router = express.Router();

async function checkCrmPermission(db, req, request) {
  if (req.session.role !== 'crm') return true;
  const permCheck = await db.query(
    `SELECT 1 FROM task_requests.user_permissions WHERE user_id = $1 AND supplier_name = $2 AND country = $3`,
    [req.session.userId, request.supplier_name, request.country]
  );
  return permCheck.rows.length > 0;
}

// ── POST /api/admin/requests/:id/approve ──────────────────────────────────────
router.post('/api/admin/requests/:id/approve', requireApprover, async (req, res) => {
  const db = getPool();
  try {
    // Load request (must be pending)
    const reqRow = await db.query(
      `SELECT * FROM task_requests.requests WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (reqRow.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already reviewed.' });
    }
    const request = reqRow.rows[0];

    if (!(await checkCrmPermission(db, req, request))) {
      return res.status(403).json({ error: 'You do not have permission to approve this request.' });
    }

    const payload = request.payload;

    // Load attachment paths (store_listing first)
    const attRows = await db.query(
      `SELECT stored_path FROM task_requests.request_attachments
       WHERE request_id = $1
       ORDER BY attachment_type DESC`,
      [req.params.id]
    );
    const attachmentPaths = attRows.rows.map(r => r.stored_path);

    // Build email
    const task    = payload.tasks[0];
    const pfm     = payload.portal_field_map;
    const subject = `[GFORCE-TASK] ${task.task_name} | ${pfm.supplier_name} | ${pfm.retailer_name}`;
    const body    = `GFORCE_TASK_PAYLOAD_START\n${JSON.stringify(payload, null, 2)}\nGFORCE_TASK_PAYLOAD_END`;

    // Send to support@ — if this throws, request stays pending and admin can retry
    await sendTaskEmail({ subject, body, attachmentPaths });

    // Mark approved
    await db.query(
      `UPDATE task_requests.requests
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
           email_sent_at = NOW(), email_subject = $3, updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, req.session.userId, subject]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/approve] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/requests/:id/reject ───────────────────────────────────────
router.post('/api/admin/requests/:id/reject', requireApprover, async (req, res) => {
  const db = getPool();
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    // Load request (must be pending) and submitter email
    const reqRow = await db.query(
      `SELECT r.task_name, r.supplier_name, r.country, u.email AS submitter_email
       FROM task_requests.requests r
       JOIN task_requests.users u ON u.id = r.user_id
       WHERE r.id = $1 AND r.status = 'pending'`,
      [req.params.id]
    );
    if (reqRow.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already reviewed.' });
    }
    const { task_name, submitter_email } = reqRow.rows[0];

    if (!(await checkCrmPermission(db, req, reqRow.rows[0]))) {
      return res.status(403).json({ error: 'You do not have permission to reject this request.' });
    }

    // Update status
    await db.query(
      `UPDATE task_requests.requests
       SET status = 'rejected', rejection_reason = $2,
           reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, reason.trim(), req.session.userId]
    );

    // Notify the submitter — fire-and-forget (don't block the response on email failure)
    sendRejectionEmail({ toEmail: submitter_email, taskName: task_name, reason: reason.trim() })
      .catch(err => console.warn('[admin/reject] Notification email failed:', err.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/reject] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
