/**
 * Invoicing Module - Database Initialization
 *
 * Creates all required tables for the invoicing module.
 * Simplified schema that works reliably with Neon PostgreSQL.
 */

import { sql } from '../db';

let tablesVerified = false;
let initializationInProgress = false;
let initializationError: Error | null = null;

/**
 * Initialize all invoicing module tables
 */
export async function initializeInvoicingTables(): Promise<void> {
  // If already verified, skip
  if (tablesVerified) {
    return;
  }

  // If initialization failed previously, throw the cached error
  if (initializationError) {
    throw initializationError;
  }

  // Prevent concurrent initialization
  if (initializationInProgress) {
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 100));
    if (tablesVerified) return;
    if (initializationError) throw initializationError;
  }

  initializationInProgress = true;
  if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Starting database table initialization...');

  try {
    // Create all tables in a single transaction-like sequence
    // Each table creation is separate to handle partial success

    // 1. INVOICES TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating invoices table...');
    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT,
        line_items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE NOT NULL DEFAULT CURRENT_DATE,
        memo TEXT,
        terms TEXT,
        template_id TEXT,
        signature_envelope_id TEXT,
        require_signature BOOLEAN NOT NULL DEFAULT FALSE,
        require_signature_before_payment BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        viewed_at TIMESTAMPTZ,
        signed_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        voided_at TIMESTAMPTZ,
        void_reason TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ invoices table ready');

    try {
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_address TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_city TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_state TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_zip TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_country TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_number TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes_internal TEXT`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_history JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_config JSONB`;
      if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ invoices table columns updated');
    } catch (colError) {
      console.warn('[Invoicing] Warning adding columns (may already exist):', colError);
    }

    // 2. INVOICE NUMBER COUNTERS TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating invoice_number_counters table...');
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_number_counters (
        tenant_id TEXT PRIMARY KEY,
        current_number INTEGER NOT NULL DEFAULT 0,
        prefix TEXT DEFAULT 'INV-',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ invoice_number_counters table ready');

    // 3. INVOICE AUDIT LOGS TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating invoice_audit_logs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_id TEXT,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL DEFAULT 'system',
        metadata JSONB NOT NULL DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ invoice_audit_logs table ready');

    // 4. INVOICE TEMPLATES TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating invoice_templates table...');
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        default_terms TEXT,
        default_memo TEXT,
        default_due_days INTEGER NOT NULL DEFAULT 30,
        line_item_presets JSONB NOT NULL DEFAULT '[]',
        branding JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ invoice_templates table ready');

    // 5. PAYMENT PROCESSOR CONFIGS TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating payment_processor_configs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS payment_processor_configs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        processor_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        credentials TEXT NOT NULL,
        webhook_secret TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ payment_processor_configs table ready');

    // 6. PAYMENT LINKS TABLE
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating payment_links table...');
    await sql`
      CREATE TABLE IF NOT EXISTS payment_links (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        processor_type TEXT NOT NULL,
        processor_config_id TEXT NOT NULL,
        payment_url TEXT NOT NULL,
        token TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        click_count INTEGER NOT NULL DEFAULT 0,
        last_clicked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ payment_links table ready');

    // 7. Create indexes (safe to run multiple times)
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] Creating indexes...');
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(tenant_id, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_invoice_audit_tenant ON invoice_audit_logs(tenant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_invoice_templates_tenant ON invoice_templates(tenant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_processor_configs_tenant ON payment_processor_configs(tenant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_payment_links_invoice ON payment_links(invoice_id)`;
      if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✓ indexes ready');
    } catch (indexError) {
      // Indexes are non-critical, log and continue
      console.warn('[Invoicing] Warning creating indexes (non-fatal):', indexError);
    }

    // Mark as verified
    tablesVerified = true;
    initializationError = null;
    if (process.env.NODE_ENV !== 'production') console.log('[Invoicing] ✅ All database tables initialized successfully');

  } catch (error) {
    console.error('[Invoicing] ❌ Failed to initialize tables:', error);
    initializationError = error instanceof Error ? error : new Error(String(error));
    throw initializationError;
  } finally {
    initializationInProgress = false;
  }
}

/**
 * Reset initialization flag (for testing or retry)
 */
export function resetInitialization(): void {
  tablesVerified = false;
  initializationError = null;
}

/**
 * Force re-initialization (clears error cache and retries)
 */
export async function forceInitializeTables(): Promise<void> {
  tablesVerified = false;
  initializationError = null;
  await initializeInvoicingTables();
}

/**
 * Check if tables are initialized
 */
export function areTablesInitialized(): boolean {
  return tablesVerified;
}

/**
 * Get the last initialization error
 */
export function getInitializationError(): Error | null {
  return initializationError;
}
