-- PearSign Baseline Schema Migration
-- This file represents the canonical database schema.
-- All future schema changes should be added as new numbered migration files.
-- 
-- To apply: Run this SQL against your PostgreSQL database.
-- Tables use CREATE TABLE IF NOT EXISTS for safe re-runs.
--
-- IMPORTANT: After creating tables, run the bootstrap endpoint
-- POST /api/admin/bootstrap with your ADMIN_SECRET_KEY to seed
-- required data (plans, admin user, etc.)

-- ============================================================
-- AUTH & IDENTITY
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    first_name TEXT,
    last_name  TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TENANTS & MULTI-TENANCY
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT UNIQUE,
    plan       TEXT DEFAULT 'free',
    status     TEXT DEFAULT 'active',
    owner_id   TEXT,
    settings   JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id),
    user_id    TEXT NOT NULL REFERENCES auth_users(id),
    role       TEXT DEFAULT 'member',
    status     TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_sessions (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    user_email  TEXT,
    user_name   TEXT,
    role        TEXT,
    tenant_name TEXT,
    tenant_plan TEXT,
    permissions JSONB DEFAULT '{}',
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_usage (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL UNIQUE,
    envelopes_used  INTEGER DEFAULT 0,
    templates_used  INTEGER DEFAULT 0,
    api_calls       INTEGER DEFAULT 0,
    storage_used_mb NUMERIC DEFAULT 0,
    period_start    TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLATFORM PLANS & BILLING
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_plans (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    display_name  TEXT,
    price_monthly INTEGER DEFAULT 0,
    price_yearly  INTEGER DEFAULT 0,
    limits        JSONB DEFAULT '{}',
    features      JSONB DEFAULT '{}',
    is_active     BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS billing_invoices (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         TEXT NOT NULL,
    stripe_invoice_id TEXT,
    amount            INTEGER DEFAULT 0,
    currency          TEXT DEFAULT 'usd',
    status            TEXT DEFAULT 'draft',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- E-SIGNATURE: ENVELOPES & SIGNING
-- ============================================================

CREATE TABLE IF NOT EXISTS envelope_documents (
    id           TEXT PRIMARY KEY,
    org_id       TEXT NOT NULL,
    name         TEXT,
    status       TEXT DEFAULT 'draft',
    sender_email TEXT,
    sender_name  TEXT,
    document_url TEXT,
    fields       JSONB DEFAULT '[]',
    signers      JSONB DEFAULT '[]',
    is_demo      BOOLEAN DEFAULT false,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
    id           TEXT PRIMARY KEY,
    org_id       TEXT NOT NULL,
    envelope_id  TEXT,
    signer_email TEXT,
    signer_name  TEXT,
    token        TEXT UNIQUE,
    status       TEXT DEFAULT 'pending',
    ip_address   TEXT,
    signed_at    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS templates (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT,
    fields      JSONB DEFAULT '[]',
    signer_roles JSONB DEFAULT '[]',
    is_demo     BOOLEAN DEFAULT false,
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    org_id         TEXT NOT NULL,
    invoice_number TEXT,
    client_name    TEXT,
    client_email   TEXT,
    line_items     JSONB DEFAULT '[]',
    subtotal       NUMERIC(12,2) DEFAULT 0,
    tax            NUMERIC(12,2) DEFAULT 0,
    total          NUMERIC(12,2) DEFAULT 0,
    status         TEXT DEFAULT 'draft',
    due_date       DATE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     TEXT NOT NULL,
    user_id    TEXT,
    type       TEXT,
    title      TEXT,
    message    TEXT,
    link       TEXT,
    is_read    BOOLEAN DEFAULT false,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WEBHOOKS & INTEGRATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS webhooks (
    id         TEXT PRIMARY KEY,
    org_id     TEXT NOT NULL,
    url        TEXT NOT NULL,
    events     JSONB DEFAULT '[]',
    secret     TEXT,
    enabled    BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_configs (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    org_id           TEXT,
    tenant_id        TEXT,
    integration_type TEXT NOT NULL,
    config           JSONB DEFAULT '{}',
    enabled          BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT & COMPLIANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    org_id     TEXT NOT NULL,
    event_type TEXT,
    actor_id   TEXT,
    details    JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_settings (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id   TEXT,
    tenant_id         TEXT,
    require_two_factor BOOLEAN DEFAULT false,
    ip_restrictions   TEXT[] DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_envelope_docs_org ON envelope_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_envelope_sessions_org ON envelope_signing_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_envelope_sessions_token ON envelope_signing_sessions(token);
CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_tenant ON tenant_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_configs_org ON integration_configs(org_id);
