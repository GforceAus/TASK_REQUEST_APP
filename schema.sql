-- Run this once to create the task_requests schema and all tables.
-- Does NOT touch field_ops schema.

CREATE SCHEMA IF NOT EXISTS task_requests;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_requests.users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'crm',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User permissions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_requests.user_permissions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES task_requests.users(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'Australia',
  UNIQUE(user_id, supplier_name, country)
);

-- ── Sessions (connect-pg-simple) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_requests.sessions (
  sid    TEXT PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON task_requests.sessions(expire);

-- ── Task requests ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_requests.requests (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES task_requests.users(id) ON DELETE CASCADE,
  supplier_name        TEXT NOT NULL,
  country              TEXT NOT NULL,
  retailer_name        TEXT NOT NULL,
  state                JSONB NOT NULL,
  week_start_date      DATE NOT NULL,
  task_name            TEXT NOT NULL,
  task_priority        TEXT NOT NULL DEFAULT 'High',
  task_description     TEXT NOT NULL,
  approval_required    BOOLEAN NOT NULL DEFAULT false,
  photo_required       TEXT NOT NULL DEFAULT 'required',
  comment_required     TEXT NOT NULL DEFAULT 'required',
  import_store_enabled BOOLEAN NOT NULL DEFAULT false,
  dropdowns            JSONB NOT NULL DEFAULT '[]',
  payload              JSONB NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  rejection_reason     TEXT,
  reviewed_by          INTEGER REFERENCES task_requests.users(id),
  reviewed_at          TIMESTAMPTZ,
  email_sent_at        TIMESTAMPTZ,
  email_subject        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS requests_user_id_idx ON task_requests.requests(user_id);
CREATE INDEX IF NOT EXISTS requests_status_idx  ON task_requests.requests(status);

-- ── Attachments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_requests.request_attachments (
  id              SERIAL PRIMARY KEY,
  request_id      INTEGER NOT NULL REFERENCES task_requests.requests(id) ON DELETE CASCADE,
  attachment_type TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  stored_path     TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attachments_request_id_idx ON task_requests.request_attachments(request_id);

-- ── Supplier listing (imported from supplier_listing.xlsx via scripts/import-suppliers.js) ──
CREATE TABLE IF NOT EXISTS task_requests.suppliers (
  id          SERIAL PRIMARY KEY,
  supplier_id TEXT,
  username    TEXT NOT NULL,
  short_name  TEXT,
  full_name   TEXT,
  state       TEXT,
  country     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  UNIQUE(username, country)
);
CREATE INDEX IF NOT EXISTS suppliers_country_idx ON task_requests.suppliers(country);

-- ── Supplier operating states (aggregate list per supplier, derived from callCycle_listing.xlsx) ──
ALTER TABLE task_requests.suppliers ADD COLUMN IF NOT EXISTS operating_states TEXT;

-- ── Supplier -> Retailer scope (imported from callCycle_listing.xlsx via scripts/import-call-cycles.js) ──
-- A supplier is usually tied to exactly one retailer, but some span several (e.g. ARLO-NZ).
-- This table lets the submit form filter the retailer dropdown to only valid options per supplier.
CREATE TABLE IF NOT EXISTS task_requests.supplier_retailers (
  id            SERIAL PRIMARY KEY,
  supplier_username TEXT NOT NULL,
  retailer_name TEXT NOT NULL,
  country       TEXT NOT NULL,
  UNIQUE(supplier_username, retailer_name, country)
);
CREATE INDEX IF NOT EXISTS supplier_retailers_username_idx ON task_requests.supplier_retailers(supplier_username);
