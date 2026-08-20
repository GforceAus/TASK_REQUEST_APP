'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const path     = require('path');
const fs       = require('fs');
const { getPool } = require('../../db');
const { requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/admin/users', requireAdmin, (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', 'users.html'), 'utf8')
    .replace(/\{\{DISPLAY_NAME\}\}/g, req.session.displayName);
  res.send(html);
});

router.get('/api/admin/suppliers', requireAdmin, async (req, res) => {
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT username, country FROM task_requests.suppliers
       WHERE status = 'active'
       ORDER BY country, username`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const db = getPool();
    const users = await db.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.created_at,
              COALESCE(
                json_agg(json_build_object('supplier_name', p.supplier_name, 'country', p.country)
                ORDER BY p.supplier_name) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS permissions
       FROM task_requests.users u
       LEFT JOIN task_requests.user_permissions p ON p.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(users.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, display_name, role, password, permissions } = req.body;
    if (!email || !display_name || !password) {
      return res.status(400).json({ error: 'email, display_name, and password are required.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const db = getPool();

    const result = await db.query(
      `INSERT INTO task_requests.users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email.trim().toLowerCase(), hash, display_name.trim(), role || 'supplier']
    );
    const userId = result.rows[0].id;

    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const p of permissions) {
        await db.query(
          `INSERT INTO task_requests.user_permissions (user_id, supplier_name, country) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [userId, p.supplier_name, p.country || 'Australia']
        );
      }
    }

    res.json({ ok: true, userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { display_name, role, is_active } = req.body;
    const db = getPool();
    await db.query(
      `UPDATE task_requests.users
       SET display_name = COALESCE($2, display_name),
           role        = COALESCE($3, role),
           is_active   = COALESCE($4, is_active),
           updated_at  = NOW()
       WHERE id = $1`,
      [req.params.id, display_name || null, role || null, is_active !== undefined ? is_active : null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/admin/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password is required.' });
    const hash = await bcrypt.hash(password, 12);
    const db = getPool();
    await db.query(
      `UPDATE task_requests.users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [req.params.id, hash]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.session.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const db = getPool();
    const result = await db.query(`DELETE FROM task_requests.users WHERE id = $1`, [targetId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'This user has reviewed/approved other users’ task requests and cannot be deleted. Set them to Inactive instead to preserve that request history.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/users/:id/permissions', requireAdmin, async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array.' });
    const db = getPool();
    await db.query(`DELETE FROM task_requests.user_permissions WHERE user_id = $1`, [req.params.id]);
    for (const p of permissions) {
      await db.query(
        `INSERT INTO task_requests.user_permissions (user_id, supplier_name, country) VALUES ($1,$2,$3)`,
        [req.params.id, p.supplier_name, p.country || 'Australia']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
