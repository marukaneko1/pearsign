/**
 * PostgreSQL Row Level Security (RLS) Policies
 *
 * Defense-in-depth tenant isolation at the database level.
 * Even if application code has bugs, the database prevents cross-tenant access.
 *
 * How it works:
 * 1. Before each request, we SET a session variable: app.current_tenant_id
 * 2. RLS policies filter all queries to only return rows matching that tenant
 * 3. This is enforced by PostgreSQL itself, not application code
 *
 * Usage:
 * 1. Call initializeRLS() once to set up policies
 * 2. Call setTenantContext(tenantId) at the start of each request
 * 3. All subsequent queries are automatically filtered
 */

import { sql } from './db';

// ============================================
// RLS INITIALIZATION
// ============================================

/**
 * Initialize Row Level Security on all tenant-scoped tables.
 * This should be run once during database setup/migration.
 *
 * IMPORTANT: This creates policies that filter by the session variable
 * `app.current_tenant_id`. The application MUST set this variable
 * before executing any queries.
 */
export async function initializeRLS(): Promise<{ success: boolean; tablesProtected: string[]; errors: string[] }> {
  const tablesProtected: string[] = [];
  const errors: string[] = [];

  console.log('[RLS] Starting Row Level Security initialization...');

  // Define tables and their tenant column
  const tablesToProtect: Array<{ table: string; tenantColumn: string }> = [
    { table: 'envelope_documents', tenantColumn: 'org_id' },
    { table: 'envelope_signing_sessions', tenantColumn: 'org_id' },
    { table: 'notifications', tenantColumn: 'org_id' },
    { table: 'notification_preferences', tenantColumn: 'org_id' },
    { table: 'templates', tenantColumn: 'org_id' },
    { table: 'email_templates', tenantColumn: 'organization_id' },
    { table: 'branding_settings', tenantColumn: 'organization_id' },
    { table: 'integration_configs', tenantColumn: 'org_id' },
    { table: 'audit_logs', tenantColumn: 'org_id' },
    { table: 'webhooks', tenantColumn: 'org_id' },
    { table: 'webhook_deliveries', tenantColumn: 'org_id' },
    { table: 'fusion_forms', tenantColumn: 'org_id' },
    { table: 'fusion_form_submissions', tenantColumn: 'org_id' },
    { table: 'bulk_sends', tenantColumn: 'org_id' },
    { table: 'api_keys', tenantColumn: 'organization_id' },
    { table: 'api_logs', tenantColumn: 'organization_id' },
    { table: 'tenant_usage', tenantColumn: 'tenant_id' },
    { table: 'tenant_users', tenantColumn: 'tenant_id' },
    { table: 'template_versions', tenantColumn: 'tenant_id' },
    { table: 'signature_certificates', tenantColumn: 'org_id' },
    { table: 'phone_verifications', tenantColumn: 'org_id' },
  ];

  // First, create the function to get current tenant from session variable
  try {
    await sql`
      CREATE OR REPLACE FUNCTION current_tenant_id()
      RETURNS TEXT AS $$
      BEGIN
        RETURN COALESCE(
          current_setting('app.current_tenant_id', true),
          ''
        );
      END;
      $$ LANGUAGE plpgsql STABLE;
    `;
    console.log('[RLS] Created current_tenant_id() function');
  } catch (error) {
    const errMsg = `Failed to create current_tenant_id function: ${error}`;
    console.error('[RLS]', errMsg);
    errors.push(errMsg);
  }

  // Create a bypass function for system/admin operations
  try {
    await sql`
      CREATE OR REPLACE FUNCTION is_rls_bypassed()
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN COALESCE(
          current_setting('app.bypass_rls', true)::boolean,
          false
        );
      END;
      $$ LANGUAGE plpgsql STABLE;
    `;
    console.log('[RLS] Created is_rls_bypassed() function');
  } catch (error) {
    const errMsg = `Failed to create is_rls_bypassed function: ${error}`;
    console.error('[RLS]', errMsg);
    errors.push(errMsg);
  }

  // Apply RLS to each table
  for (const { table, tenantColumn } of tablesToProtect) {
    try {
      // Check if table exists
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = ${table}
        ) as exists
      `;

      if (!tableExists[0]?.exists) {
        console.log(`[RLS] Table ${table} does not exist, skipping`);
        continue;
      }

      // Check if column exists
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${tenantColumn}
        ) as exists
      `;

      if (!columnExists[0]?.exists) {
        console.log(`[RLS] Column ${tenantColumn} does not exist in ${table}, skipping`);
        continue;
      }

      // Enable RLS on the table
      await sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

      // Force RLS even for table owners (important for security)
      await sql.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

      // Drop existing policies if they exist (for idempotent re-runs)
      await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_select ON ${table}`);
      await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_insert ON ${table}`);
      await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_update ON ${table}`);
      await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_delete ON ${table}`);

      // Create SELECT policy - can only read rows from current tenant
      await sql.raw(`
        CREATE POLICY tenant_isolation_select ON ${table}
        FOR SELECT
        USING (
          is_rls_bypassed()
          OR ${tenantColumn} = current_tenant_id()
          OR current_tenant_id() = ''
        )
      `);

      // Create INSERT policy - can only insert rows for current tenant
      await sql.raw(`
        CREATE POLICY tenant_isolation_insert ON ${table}
        FOR INSERT
        WITH CHECK (
          is_rls_bypassed()
          OR ${tenantColumn} = current_tenant_id()
          OR current_tenant_id() = ''
        )
      `);

      // Create UPDATE policy - can only update rows from current tenant
      await sql.raw(`
        CREATE POLICY tenant_isolation_update ON ${table}
        FOR UPDATE
        USING (
          is_rls_bypassed()
          OR ${tenantColumn} = current_tenant_id()
          OR current_tenant_id() = ''
        )
        WITH CHECK (
          is_rls_bypassed()
          OR ${tenantColumn} = current_tenant_id()
          OR current_tenant_id() = ''
        )
      `);

      // Create DELETE policy - can only delete rows from current tenant
      await sql.raw(`
        CREATE POLICY tenant_isolation_delete ON ${table}
        FOR DELETE
        USING (
          is_rls_bypassed()
          OR ${tenantColumn} = current_tenant_id()
          OR current_tenant_id() = ''
        )
      `);

      tablesProtected.push(table);
      console.log(`[RLS] ✅ Protected table: ${table} (column: ${tenantColumn})`);

    } catch (error) {
      const errMsg = `Failed to protect table ${table}: ${error}`;
      console.error('[RLS]', errMsg);
      errors.push(errMsg);
    }
  }

  console.log(`[RLS] Initialization complete. Protected ${tablesProtected.length} tables.`);

  return {
    success: errors.length === 0,
    tablesProtected,
    errors,
  };
}

// ============================================
// TENANT CONTEXT MANAGEMENT
// ============================================

/**
 * Set the current tenant context for RLS policies.
 * MUST be called at the start of each request before any database queries.
 *
 * @param tenantId - The tenant ID to scope all queries to
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  if (!tenantId) {
    console.warn('[RLS] setTenantContext called with empty tenantId');
    return;
  }

  try {
    await sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}'`);
    console.log(`[RLS] Tenant context set to: ${tenantId}`);
  } catch (error) {
    console.error('[RLS] Failed to set tenant context:', error);
    throw new Error('Failed to set tenant security context');
  }
}

/**
 * Clear the tenant context (for admin/system operations)
 */
export async function clearTenantContext(): Promise<void> {
  try {
    await sql`SET LOCAL app.current_tenant_id = ''`;
  } catch (error) {
    console.error('[RLS] Failed to clear tenant context:', error);
  }
}

/**
 * Bypass RLS for system/admin operations.
 * Use with EXTREME caution - only for legitimate cross-tenant operations.
 */
export async function bypassRLS(): Promise<void> {
  try {
    await sql`SET LOCAL app.bypass_rls = 'true'`;
    console.log('[RLS] ⚠️ RLS bypass enabled for this transaction');
  } catch (error) {
    console.error('[RLS] Failed to enable RLS bypass:', error);
  }
}

/**
 * Disable RLS bypass
 */
export async function disableRLSBypass(): Promise<void> {
  try {
    await sql`SET LOCAL app.bypass_rls = 'false'`;
  } catch (error) {
    console.error('[RLS] Failed to disable RLS bypass:', error);
  }
}

// ============================================
// RLS STATUS CHECK
// ============================================

/**
 * Check RLS status for all tables
 */
export async function checkRLSStatus(): Promise<Array<{ table: string; rlsEnabled: boolean; rlsForced: boolean; policyCount: number }>> {
  const result = await sql`
    SELECT
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      COUNT(p.polname) as policy_count
    FROM pg_class c
    LEFT JOIN pg_policy p ON c.oid = p.polrelid
    WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname
  `;

  return result.map(row => ({
    table: row.table_name as string,
    rlsEnabled: row.rls_enabled as boolean,
    rlsForced: row.rls_forced as boolean,
    policyCount: parseInt(row.policy_count as string, 10),
  }));
}

/**
 * Get current tenant context (for debugging)
 */
export async function getCurrentTenantContext(): Promise<string | null> {
  try {
    const result = await sql`SELECT current_setting('app.current_tenant_id', true) as tenant_id`;
    return result[0]?.tenant_id || null;
  } catch {
    return null;
  }
}

// ============================================
// DISABLE RLS (for testing/development only)
// ============================================

/**
 * Disable RLS on all tables.
 * WARNING: Only use this in development/testing!
 */
export async function disableRLS(): Promise<void> {
  console.warn('[RLS] ⚠️ Disabling Row Level Security - THIS SHOULD ONLY BE USED IN DEVELOPMENT');

  const tables = [
    'envelope_documents',
    'envelope_signing_sessions',
    'notifications',
    'notification_preferences',
    'templates',
    'email_templates',
    'branding_settings',
    'integration_configs',
    'audit_logs',
    'webhooks',
    'webhook_deliveries',
    'fusion_forms',
    'fusion_form_submissions',
    'bulk_sends',
    'api_keys',
    'api_logs',
    'tenant_usage',
    'tenant_users',
    'template_versions',
    'signature_certificates',
    'phone_verifications',
  ];

  for (const table of tables) {
    try {
      await sql.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
      console.log(`[RLS] Disabled RLS on ${table}`);
    } catch {
      // Table may not exist
    }
  }
}
