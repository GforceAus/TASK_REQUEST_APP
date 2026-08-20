'use strict';

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Admin (unrestricted) or CRM (approve/reject only, scoped to their permitted suppliers).
function requireApprover(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.role !== 'admin' && req.session.role !== 'crm') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin, requireApprover };
