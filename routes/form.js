'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { getPool, getDropdowns } = require('../db');
const { requireLogin }  = require('../middleware/auth');
const { uploadFields }  = require('../middleware/upload');

const router = express.Router();

// ── GET /api/dropdowns ────────────────────────────────────────────────────────
router.get('/api/dropdowns', requireLogin, async (req, res) => {
  try {
    res.json(await getDropdowns());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/supplier-scope?supplier=WHITES-NZ ──────────────────────────────────
// Retailers + states valid for a given supplier (per-supplier call cycle data),
// used to filter the submit form's Retailer/State fields once a permission is active.
router.get('/api/supplier-scope', requireLogin, async (req, res) => {
  try {
    const { supplier } = req.query;
    if (!supplier) return res.status(400).json({ error: 'supplier is required.' });

    const db = getPool();
    const [retailers, supplierRow] = await Promise.all([
      db.query(
        `SELECT DISTINCT retailer_name FROM task_requests.supplier_retailers
         WHERE supplier_username = $1 ORDER BY retailer_name`,
        [supplier]
      ),
      db.query(
        `SELECT operating_states FROM task_requests.suppliers WHERE username = $1 LIMIT 1`,
        [supplier]
      ),
    ]);

    const states = supplierRow.rows[0]?.operating_states
      ? supplierRow.rows[0].operating_states.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    res.json({
      retailers: retailers.rows.map(r => r.retailer_name),
      states,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /submit ───────────────────────────────────────────────────────────────
router.get('/submit', requireLogin, async (req, res) => {
  if (req.session.role === 'crm') return res.redirect('/admin/queue');
  try {
    const db = getPool();
    const perms = await db.query(
      `SELECT supplier_name, country FROM task_requests.user_permissions WHERE user_id = $1 ORDER BY supplier_name`,
      [req.session.userId]
    );
    const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'submit.html'), 'utf8')
      .replace('{{DISPLAY_NAME}}', req.session.displayName)
      .replace('{{USER_PERMS_JSON}}', JSON.stringify(perms.rows));
    res.send(html);
  } catch (err) {
    console.error('[form] GET /submit error:', err.message);
    res.status(500).send('Server error');
  }
});

// ── POST /submit ──────────────────────────────────────────────────────────────
router.post('/submit', requireLogin, uploadFields, async (req, res) => {
  if (req.session.role === 'crm') return res.status(403).json({ error: 'CRM accounts cannot submit task requests.' });
  try {
    const db = getPool();
    const {
      country, supplier_name, retailer_name,
      state_json, week_start_date,
      task_name, task_priority, task_description,
      approval_required, photo_required, comment_required,
      import_store_enabled, dropdowns_json,
      client_photos_shareable, client_comments_shareable, question_shareable,
    } = req.body;

    // ── Server-side permission check ──────────────────────────────────────────
    const permCheck = await db.query(
      `SELECT 1 FROM task_requests.user_permissions
       WHERE user_id = $1 AND supplier_name = $2 AND country = $3`,
      [req.session.userId, supplier_name, country]
    );
    if (permCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have permission to submit for this supplier/country.' });
    }

    // ── Validate task name format ─────────────────────────────────────────────
    if (!/^\d{2}-\d{2}-\d{2}\s+\S/.test(task_name)) {
      return res.status(400).json({ error: 'Task name must start with DD-MM-YY followed by a space and text.' });
    }

    // ── Parse fields ──────────────────────────────────────────────────────────
    const stateValue   = JSON.parse(state_json || '"all"');
    const dropdowns    = JSON.parse(dropdowns_json || '[]');
    const storeEnabled = import_store_enabled === 'true';
    const approvalReq  = approval_required === 'true';

    const storeFile = req.files?.store_file?.[0] || null;
    const docFiles  = req.files?.doc_files  || [];

    // ── Portal date format DD/MM/YYYY ─────────────────────────────────────────
    const [yyyy, mm, dd] = week_start_date.split('-');
    const portalDate = `${dd}/${mm}/${yyyy}`;
    const displayDate = `${dd}-${mm}-${yyyy.slice(2)}`;

    // ── Build schema 2.0 payload ──────────────────────────────────────────────
    const photoMap    = { required: 'Required', optional: 'Optional', not_required: 'Not Required' };
    const photoDisplay = photoMap[photo_required] || 'Required';
    const commentDisplay = photoMap[comment_required] || 'Required';

    const payload = {
      _meta: {
        schema_version: '2.0',
        generated_at:   new Date().toISOString(),
        form_source:    'web_task_request',
      },
      header: {
        load_from_date_display: displayDate,
        supplier:               supplier_name,
        approval_required:      approvalReq,
        photo_required:         photo_required,
        comment_required:       comment_required,
        attachment_count:       docFiles.length + (storeFile ? 1 : 0),
        dropdown_count:         dropdowns.length,
        import_store: {
          enabled:              storeEnabled,
          filename:             storeFile ? storeFile.originalname : null,
          resolved_attachment:  storeFile ? storeFile.originalname : null,
        },
      },
      attachments: {
        store_listing: {
          enabled:  storeEnabled,
          filename: storeFile ? storeFile.originalname : null,
          type:     'store_listing',
        },
        task_attachments: docFiles.map(f => ({ filename: f.originalname, type: 'task_document' })),
      },
      tasks: [{
        task_name,
        task_name_overridden: false,
        task_priority,
        frequency:        'oneOff',
        task_description,
        dropdowns,
      }],
      portal_field_map: {
        country,
        state:                  stateValue,
        retailer_name,
        supplier_name,
        week_start_date_portal: portalDate,
        task_approval:          approvalReq ? 'required' : 'not_required',
        photo_name:             photoDisplay,
        comment:                commentDisplay,
        frequency:              'oneOff',
        task_name,
        task_priority,
        import_store_file:      storeFile ? storeFile.originalname : null,
        document_files:         docFiles.map(f => f.originalname),
        client_photos_shareable:   client_photos_shareable === 'true',
        client_comments_shareable: client_comments_shareable === 'true',
        question_shareable:        question_shareable === 'true',
      },
      pipeline_flags: {
        requires_manual_review:   false,
        task_name_was_overridden: false,
        multi_task_email:         false,
        task_count:               1,
        unmatched_attachments:    [],
      },
    };

    // ── Insert request ────────────────────────────────────────────────────────
    const result = await db.query(
      `INSERT INTO task_requests.requests
         (user_id, supplier_name, country, retailer_name, state, week_start_date,
          task_name, task_priority, task_description, approval_required,
          photo_required, comment_required, import_store_enabled, dropdowns, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        req.session.userId, supplier_name, country, retailer_name,
        JSON.stringify(stateValue), week_start_date,
        task_name, task_priority, task_description, approvalReq,
        photo_required, comment_required, storeEnabled,
        JSON.stringify(dropdowns), JSON.stringify(payload),
      ]
    );
    const requestId = result.rows[0].id;

    // ── Insert attachments ────────────────────────────────────────────────────
    if (storeFile) {
      await db.query(
        `INSERT INTO task_requests.request_attachments (request_id, attachment_type, original_name, stored_path, size_bytes)
         VALUES ($1, 'store_listing', $2, $3, $4)`,
        [requestId, storeFile.originalname, storeFile.path, storeFile.size]
      );
    }
    for (const f of docFiles) {
      await db.query(
        `INSERT INTO task_requests.request_attachments (request_id, attachment_type, original_name, stored_path, size_bytes)
         VALUES ($1, 'task_document', $2, $3, $4)`,
        [requestId, f.originalname, f.path, f.size]
      );
    }

    res.json({ ok: true, requestId });
  } catch (err) {
    console.error('[form] POST /submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
