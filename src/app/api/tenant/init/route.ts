/**
 * Tenant System Initialization API
 *
 * Initializes the multi-tenancy system:
 * - Creates tenant tables
 * - Adds tenant_id columns to existing tables
 * - Migrates existing data to default tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { TenantService } from '@/lib/tenant';
import { ImmutableAuditLogService } from '@/lib/immutable-audit-log';

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key') || new URL(request.url).searchParams.get('adminKey');
    const requiredKey = process.env.ADMIN_SECRET_KEY;
    if (!requiredKey || adminKey !== requiredKey) {
      return NextResponse.json({ error: 'Unauthorized: Admin key required' }, { status: 401 });
    }

    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Starting multi-tenancy system initialization...');

    // Generate unique seed IDs at runtime instead of using hardcoded demo values
    const DEFAULT_TENANT_ID = `tenant-${crypto.randomUUID()}`;
    const DEFAULT_TENANT_NAME = 'Default Organization';
    const DEFAULT_TENANT_SLUG = `org-${Date.now()}`;
    const DEFAULT_USER_ID = `user-${crypto.randomUUID()}`;

    // 0. Only drop old UUID-based tenant tables when explicitly forced
    const forceRecreate = new URL(request.url).searchParams.get('force') === 'true';
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Checking tenant tables (force=' + forceRecreate + ')...');
    try {
      const checkResult = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'id'
      `;

      if (checkResult.length > 0 && checkResult[0].data_type === 'uuid') {
        if (forceRecreate) {
          console.warn('[TenantInit] WARNING: force=true — dropping old UUID-based tables');
          await sql`DROP TABLE IF EXISTS tenant_usage CASCADE`;
          await sql`DROP TABLE IF EXISTS tenant_users CASCADE`;
          await sql`DROP TABLE IF EXISTS tenants CASCADE`;
          await sql`DROP TABLE IF EXISTS template_versions CASCADE`;
        } else {
          console.warn(
            '[TenantInit] Tenant tables use UUID type and may need migration. ' +
            'Pass ?force=true to drop and recreate them. Skipping destructive operation.'
          );
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] No existing tables to check');
    }

    // 1. Initialize tenant tables
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Creating tenant tables...');
    await TenantService.initializeTables();

    // 2. Initialize immutable audit log table
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Creating immutable audit log table...');
    await ImmutableAuditLogService.initializeTable();

    // 3. Create default tenant if it doesn't exist
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Creating default tenant...');
    try {
      await sql`
        INSERT INTO tenants (id, name, slug, plan, status, owner_id, settings, billing)
        VALUES (
          ${DEFAULT_TENANT_ID},
          ${DEFAULT_TENANT_NAME},
          ${DEFAULT_TENANT_SLUG},
          'professional',
          'active',
          ${DEFAULT_USER_ID},
          '{}',
          '{"status": "active"}'
        )
        ON CONFLICT (id) DO NOTHING
      `;

      // Add default user to tenant
      await sql`
        INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at, permissions)
        VALUES (
          ${DEFAULT_TENANT_ID},
          ${DEFAULT_USER_ID},
          'owner',
          'active',
          NOW(),
          '{"canSendDocuments":true,"canManageTemplates":true,"canManageTeam":true,"canManageSettings":true,"canManageBilling":true,"canViewAuditLogs":true,"canManageIntegrations":true,"canUseApi":true}'
        )
        ON CONFLICT (tenant_id, user_id) DO NOTHING
      `;
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Default tenant may already exist:', e);
    }

    // 4. Add tenant_id column to all existing tables
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Adding tenant_id to existing tables...');

    const tablesToMigrate = [
      'envelope_documents',
      'envelope_signing_sessions',
      'document_templates',
      'bulk_send_jobs',
      'bulk_send_recipients',
      'fusion_forms',
      'fusion_form_submissions',
      'audit_logs',
      'notifications',
      'contacts',
      'branding_settings',
      'integration_configs',
      'webhooks',
      'webhook_deliveries',
      'api_keys',
      'api_logs',
      'email_templates',
      'sms_usage_log',
    ];

    for (const tableName of tablesToMigrate) {
      try {
        // Check if table exists
        const tableExists = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = ${tableName}
          ) as exists
        `;

        if (!tableExists[0]?.exists) {
          if (process.env.NODE_ENV !== 'production') console.log(`[TenantInit] Table ${tableName} does not exist, skipping...`);
          continue;
        }

        // Check if tenant_id column already exists
        const columnExists = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = ${tableName} AND column_name = 'tenant_id'
          ) as exists
        `;

        if (!columnExists[0]?.exists) {
          // Add tenant_id column
          await sql.raw(`
            ALTER TABLE ${tableName}
            ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)
          `);
          if (process.env.NODE_ENV !== 'production') console.log(`[TenantInit] Added tenant_id to ${tableName}`);

          // Migrate existing data to default tenant
          await sql.raw(`
            UPDATE ${tableName}
            SET tenant_id = '${DEFAULT_TENANT_ID}'
            WHERE tenant_id IS NULL
          `);
          if (process.env.NODE_ENV !== 'production') console.log(`[TenantInit] Migrated existing ${tableName} data to default tenant`);

          // Make tenant_id NOT NULL (after migration)
          try {
            await sql.raw(`
              ALTER TABLE ${tableName}
              ALTER COLUMN tenant_id SET NOT NULL
            `);
          } catch {
            // Column might have rows with NULL, which would fail
            if (process.env.NODE_ENV !== 'production') console.log(`[TenantInit] Could not set NOT NULL on ${tableName}.tenant_id`);
          }

          // Create index on tenant_id
          await sql.raw(`
            CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_id
            ON ${tableName}(tenant_id)
          `);
        } else {
          if (process.env.NODE_ENV !== 'production') console.log(`[TenantInit] tenant_id already exists on ${tableName}`);
        }
      } catch (tableError) {
        console.error(`[TenantInit] Error migrating ${tableName}:`, tableError);
      }
    }

    // 5. Create envelope_template_snapshots table if not exists
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Creating envelope_template_snapshots table...');
    await sql`
      CREATE TABLE IF NOT EXISTS envelope_template_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        envelope_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) NOT NULL,
        template_id UUID,
        version_id UUID,
        version INTEGER,
        name VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        fields JSONB DEFAULT '[]',
        signer_roles JSONB DEFAULT '[]',
        document_data TEXT,
        frozen_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // 6. Create tenant usage tracking
    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Setting up usage tracking...');
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await sql`
      INSERT INTO tenant_usage (tenant_id, period_start, period_end)
      VALUES (${DEFAULT_TENANT_ID}, ${periodStart.toISOString().split('T')[0]}, ${periodEnd.toISOString().split('T')[0]})
      ON CONFLICT (tenant_id, period_start) DO NOTHING
    `;

    // 7. Log the initialization
    await ImmutableAuditLogService.append({
      tenantId: DEFAULT_TENANT_ID,
      action: 'settings.branding_updated',
      entityType: 'system',
      entityId: 'multi-tenancy',
      actorType: 'system',
      details: {
        event: 'multi_tenancy_initialized',
        migratedTables: tablesToMigrate,
        timestamp: new Date().toISOString(),
      },
    });

    if (process.env.NODE_ENV !== 'production') console.log('[TenantInit] Multi-tenancy system initialized successfully!');

    return NextResponse.json({
      success: true,
      message: 'Multi-tenancy system initialized',
      defaultTenant: {
        id: DEFAULT_TENANT_ID,
        name: DEFAULT_TENANT_NAME,
        slug: DEFAULT_TENANT_SLUG,
      },
      migratedTables: tablesToMigrate,
    });

  } catch (error) {
    console.error('[TenantInit] Error initializing tenant system:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to initialize tenant system',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Check if multi-tenancy is initialized
    const tenantTableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'tenants'
      ) as exists
    `;

    if (!tenantTableExists[0]?.exists) {
      return NextResponse.json({
        initialized: false,
        message: 'Multi-tenancy system not initialized. POST to this endpoint to initialize.',
      });
    }

    // Get tenant count
    const tenantCount = await sql`
      SELECT COUNT(*) as count FROM tenants
    `;

    // Get audit log status
    const auditLogExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'immutable_audit_logs'
      ) as exists
    `;

    return NextResponse.json({
      initialized: true,
      tenantCount: parseInt(tenantCount[0]?.count as string) || 0,
      immutableAuditLogEnabled: auditLogExists[0]?.exists || false,
    });

  } catch (error) {
    console.error('[TenantInit] Error checking status:', error);
    return NextResponse.json(
      {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
