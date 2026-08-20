'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const { getPool } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

function landingPage(role) { return (role === 'admin' || role === 'crm') ? '/admin/queue' : '/submit'; }

router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect(landingPage(req.session.role));
  }
  const error = req.query.error ? 'Invalid email or password.' : null;
  res.send(renderLogin(error));
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.redirect('/login?error=1');

    const db = getPool();
    const result = await db.query(
      `SELECT id, password_hash, display_name, role
       FROM task_requests.users
       WHERE email = $1 AND is_active = true`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.redirect('/login?error=1');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.redirect('/login?error=1');

    req.session.regenerate((err) => {
      if (err) return res.redirect('/login?error=1');
      req.session.userId      = user.id;
      req.session.role        = user.role;
      req.session.displayName = user.display_name;
      req.session.email       = email.trim().toLowerCase();
      res.redirect(landingPage(user.role));
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    res.redirect('/login?error=1');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/api/me', requireLogin, async (req, res) => {
  try {
    const db = getPool();
    const perms = await db.query(
      `SELECT supplier_name, country FROM task_requests.user_permissions WHERE user_id = $1 ORDER BY supplier_name`,
      [req.session.userId]
    );
    res.json({
      userId:      req.session.userId,
      displayName: req.session.displayName,
      role:        req.session.role,
      permissions: perms.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HTML ──────────────────────────────────────────────────────────────────────

function renderLogin(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GForce Task Portal — Login</title>
<link rel="stylesheet" href="/css/styles.css">
</head>
<body class="login-page">
<div class="login-card">
  <div class="login-logo">
    <span class="logo-gf">GF</span>
    <span class="logo-title">Task Portal</span>
  </div>
  ${error ? `<div class="alert alert-error">${error}</div>` : ''}
  <form method="POST" action="/login" class="login-form">
    <div class="field-group">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@gforce.co.nz" required autofocus>
    </div>
    <div class="field-group">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Password" required>
    </div>
    <button type="submit" class="btn btn-primary btn-full">Sign In</button>
  </form>
</div>
</body>
</html>`;
}

module.exports = router;
