'use strict';

require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const PgSession  = require('connect-pg-simple')(session);
const { getPool, closePool } = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  store: new PgSession({
    pool:       getPool(),
    schemaName: 'task_requests',
    tableName:  'sessions',
  }),
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/',      require('./routes/auth'));
app.use('/',      require('./routes/form'));
app.use('/',      require('./routes/requests'));
app.use('/', require('./routes/admin/queue'));
app.use('/', require('./routes/admin/actions'));
app.use('/', require('./routes/admin/users'));

// Root redirect
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.redirect(req.session.role === 'admin' ? '/admin/queue' : '/submit');
});

// 404
app.use((req, res) => res.status(404).send('<h2>404 — Page not found</h2>'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(PORT, () => {
  console.log(`[server] GForce Task Portal running at http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => closePool());
});

module.exports = app;
