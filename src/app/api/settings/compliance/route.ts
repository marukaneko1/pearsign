/**
 * Compliance Settings API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated compliance settings
 *
 * HARDENED: Returns defaults on error instead of 500
 *
 * Schema matches UI expectations for:
 * - Document retention policies
 * - Audit log retention
 * - Security settings (2FA, IP restrictions)
 * - Data residency
 * - Audit trail configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext, logTenantAction } from '@/lib/tenant-middleware';

// Type definitions matching the UI
type RetentionPolicy = 'forever' | '1_year' | '3_years' | '5_years' | '7_years' | 'custom';
type AuditLogRetention = 'forever' | '1_year' | '3_years' | '5_years' | '7_years';
type DataResidency = 'us' | 'eu' | 'ap';
type AuditTrailMode = 'attached' | 'separate' | 'both';

interface ComplianceSettingsResponse {
  retentionPolicy: RetentionPolicy;
  retentionDays?: number;
  autoDeleteEnabled: boolean;
  requireTwoFactor: boolean;
  ipRestrictions: string[];
  auditLogRetention: AuditLogRetention;
  dataResidency: DataResidency;
  auditTrailEnabled: boolean;
  auditTrailMode: AuditTrailMode;
  // Legacy fields for backward compatibility
  gdprCompliant?: boolean;
  hipaaCompliant?: boolean;
  soc2Compliant?: boolean;
}

// Helper to convert retention policy to days
function retentionPolicyToDays(policy: RetentionPolicy, customDays?: number): number {
  switch (policy) {
    case 'forever': return -1; // -1 indicates forever
    case '1_year': return 365;
    case '3_years': return 1095;
    case '5_years': return 1825;
    case '7_years': return 2555;
    case 'custom': return customDays || 2555;
    default: return -1;
  }
}

// Helper to convert days to retention policy
function daysToRetentionPolicy(days: number): RetentionPolicy {
  if (days <= 0 || days === -1) return 'forever';
  if (days <= 365) return '1_year';
  if (days <= 1095) return '3_years';
  if (days <= 1825) return '5_years';
  if (days <= 2555) return '7_years';
  return 'custom';
}

/**
 * Initialize the compliance settings table with all required columns
 */
async function initializeComplianceTable(): Promise<void> {
  // Create table if not exists with all columns
  await sql`
    CREATE TABLE IF NOT EXISTS compliance_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR(255) UNIQUE NOT NULL,
      tenant_id VARCHAR(255),
      retention_policy VARCHAR(50) DEFAULT 'forever',
      retention_days INTEGER DEFAULT -1,
      auto_delete_enabled BOOLEAN DEFAULT false,
      require_two_factor BOOLEAN DEFAULT false,
      ip_restrictions TEXT[] DEFAULT '{}',
      audit_log_retention VARCHAR(50) DEFAULT 'forever',
      data_residency VARCHAR(10) DEFAULT 'us',
      audit_trail_enabled BOOLEAN DEFAULT true,
      audit_trail_mode VARCHAR(20) DEFAULT 'attached',
      gdpr_compliant BOOLEAN DEFAULT false,
      hipaa_compliant BOOLEAN DEFAULT false,
      soc2_compliant BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Drop foreign key constraint if it exists (was causing issues with tenant isolation)
  try {
    await sql`
      ALTER TABLE compliance_settings
      DROP CONSTRAINT IF EXISTS compliance_settings_organization_id_fkey
    `;
  } catch {
    // Constraint may not exist
  }

  // Add new columns if they don't exist (for existing tables)
  const columnsToAdd = [
    { name: 'retention_policy', type: "VARCHAR(50) DEFAULT 'forever'" },
    { name: 'retention_days', type: 'INTEGER DEFAULT -1' },
    { name: 'auto_delete_enabled', type: 'BOOLEAN DEFAULT false' },
    { name: 'audit_log_retention', type: "VARCHAR(50) DEFAULT 'forever'" },
    { name: 'data_residency', type: "VARCHAR(10) DEFAULT 'us'" },
    { name: 'audit_trail_enabled', type: 'BOOLEAN DEFAULT true' },
    { name: 'audit_trail_mode', type: "VARCHAR(20) DEFAULT 'attached'" },
    { name: 'tenant_id', type: 'VARCHAR(255)' },
  ];

  for (const col of columnsToAdd) {
    try {
      await sql`
        ALTER TABLE compliance_settings
        ADD COLUMN IF NOT EXISTS ${sql.unsafe(col.name)} ${sql.unsafe(col.type)}
      `;
    } catch {
      // Column may already exist
    }
  }

  // Create index for faster lookups
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_compliance_settings_org
      ON compliance_settings(organization_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_compliance_settings_tenant
      ON compliance_settings(tenant_id)
    `;
  } catch {
    // Indexes may already exist
  }
}

/**
 * GET /api/settings/compliance
 * Get compliance settings for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    // Initialize table with all required columns
    await initializeComplianceTable();

    // Try to find settings by tenant_id or organization_id
    const settings = await sql`
      SELECT * FROM compliance_settings
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (settings.length === 0) {
      // Create default settings for this tenant
      await sql`
        INSERT INTO compliance_settings (
          id,
          organization_id,
          tenant_id,
          retention_policy,
          retention_days,
          auto_delete_enabled,
          require_two_factor,
          ip_restrictions,
          audit_log_retention,
          data_residency,
          audit_trail_enabled,
          audit_trail_mode
        )
        VALUES (
          gen_random_uuid(),
          ${tenantId},
          ${tenantId},
          'forever',
          -1,
          false,
          false,
          '{}',
          'forever',
          'us',
          true,
          'attached'
        )
      `;

      // Return default settings
      const response: ComplianceSettingsResponse = {
        retentionPolicy: 'forever',
        autoDeleteEnabled: false,
        requireTwoFactor: false,
        ipRestrictions: [],
        auditLogRetention: 'forever',
        dataResidency: 'us',
        auditTrailEnabled: true,
        auditTrailMode: 'attached',
      };

      return NextResponse.json(response);
    }

    const s = settings[0];

    // Map database fields to API response
    // Handle both old schema (data_retention_days) and new schema (retention_policy)
    let retentionPolicy: RetentionPolicy = 'forever';
    let retentionDays: number | undefined;

    if (s.retention_policy) {
      retentionPolicy = s.retention_policy as RetentionPolicy;
      if (retentionPolicy === 'custom' && s.retention_days) {
        retentionDays = s.retention_days;
      }
    } else if (s.data_retention_days) {
      // Migrate from old schema
      retentionPolicy = daysToRetentionPolicy(s.data_retention_days);
      if (retentionPolicy === 'custom') {
        retentionDays = s.data_retention_days;
      }
    }

    const response: ComplianceSettingsResponse = {
      retentionPolicy,
      retentionDays,
      autoDeleteEnabled: s.auto_delete_enabled ?? (retentionPolicy !== 'forever'),
      requireTwoFactor: s.require_two_factor ?? s.require_2fa ?? false,
      ipRestrictions: s.ip_restrictions ?? s.ip_whitelist ?? [],
      auditLogRetention: (s.audit_log_retention as AuditLogRetention) ?? 'forever',
      dataResidency: (s.data_residency as DataResidency) ?? 'us',
      auditTrailEnabled: s.audit_trail_enabled ?? true,
      auditTrailMode: (s.audit_trail_mode as AuditTrailMode) ?? 'attached',
      // Legacy fields
      gdprCompliant: s.gdpr_compliant ?? false,
      hipaaCompliant: s.hipaa_compliant ?? false,
      soc2Compliant: s.soc2_compliant ?? false,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Compliance API] Error fetching settings:', error);
    // Return defaults instead of 500 error
    const defaultResponse: ComplianceSettingsResponse = {
      retentionPolicy: 'forever',
      autoDeleteEnabled: false,
      requireTwoFactor: false,
      ipRestrictions: [],
      auditLogRetention: 'forever',
      dataResidency: 'us',
      auditTrailEnabled: true,
      auditTrailMode: 'attached',
    };
    return NextResponse.json(defaultResponse);
  }
});

/**
 * PATCH /api/settings/compliance
 * Update compliance settings for the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { context, tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      // Initialize table with all required columns
      await initializeComplianceTable();

      const body = await request.json();
      const {
        retentionPolicy,
        retentionDays,
        autoDeleteEnabled,
        requireTwoFactor,
        ipRestrictions,
        auditLogRetention,
        dataResidency,
        auditTrailEnabled,
        auditTrailMode,
        // Legacy fields
        gdprCompliant,
        hipaaCompliant,
        soc2Compliant,
      } = body;

      const now = new Date().toISOString();

      // Check if settings exist
      const existing = await sql`
        SELECT id FROM compliance_settings
        WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
        LIMIT 1
      `;

      if (existing.length === 0) {
        // Insert new settings
        await sql`
          INSERT INTO compliance_settings (
            id,
            organization_id,
            tenant_id,
            retention_policy,
            retention_days,
            auto_delete_enabled,
            require_two_factor,
            ip_restrictions,
            audit_log_retention,
            data_residency,
            audit_trail_enabled,
            audit_trail_mode,
            gdpr_compliant,
            hipaa_compliant,
            soc2_compliant,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            ${tenantId},
            ${tenantId},
            ${retentionPolicy || 'forever'},
            ${retentionDays || retentionPolicyToDays(retentionPolicy || 'forever')},
            ${autoDeleteEnabled ?? false},
            ${requireTwoFactor ?? false},
            ${ipRestrictions || []},
            ${auditLogRetention || 'forever'},
            ${dataResidency || 'us'},
            ${auditTrailEnabled ?? true},
            ${auditTrailMode || 'attached'},
            ${gdprCompliant ?? false},
            ${hipaaCompliant ?? false},
            ${soc2Compliant ?? false},
            ${now},
            ${now}
          )
        `;
      } else {
        // Update existing settings
        await sql`
          UPDATE compliance_settings SET
            retention_policy = COALESCE(${retentionPolicy}, retention_policy),
            retention_days = COALESCE(${retentionDays !== undefined ? retentionDays : (retentionPolicy ? retentionPolicyToDays(retentionPolicy, retentionDays) : null)}, retention_days),
            auto_delete_enabled = COALESCE(${autoDeleteEnabled}, auto_delete_enabled),
            require_two_factor = COALESCE(${requireTwoFactor}, require_two_factor),
            ip_restrictions = COALESCE(${ipRestrictions}, ip_restrictions),
            audit_log_retention = COALESCE(${auditLogRetention}, audit_log_retention),
            data_residency = COALESCE(${dataResidency}, data_residency),
            audit_trail_enabled = COALESCE(${auditTrailEnabled}, audit_trail_enabled),
            audit_trail_mode = COALESCE(${auditTrailMode}, audit_trail_mode),
            gdpr_compliant = COALESCE(${gdprCompliant}, gdpr_compliant),
            hipaa_compliant = COALESCE(${hipaaCompliant}, hipaa_compliant),
            soc2_compliant = COALESCE(${soc2Compliant}, soc2_compliant),
            updated_at = ${now}
          WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
        `;
      }

      // Log the compliance settings change to audit log
      try {
        await logTenantAction(
          context,
          'settings.compliance_updated',
          'compliance_settings',
          tenantId,
          {
            updatedBy: userId,
            updatedByEmail: userEmail,
            changes: {
              retentionPolicy,
              autoDeleteEnabled,
              requireTwoFactor,
              dataResidency,
              auditTrailEnabled,
              auditTrailMode,
            },
          }
        );
      } catch (auditError) {
        console.warn('[Compliance API] Failed to log audit event:', auditError);
        // Continue even if audit logging fails
      }

      // Fetch updated settings
      const updated = await sql`
        SELECT * FROM compliance_settings
        WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
        LIMIT 1
      `;

      const s = updated[0];

      const response: ComplianceSettingsResponse = {
        retentionPolicy: (s.retention_policy as RetentionPolicy) ?? 'forever',
        retentionDays: s.retention_days > 0 ? s.retention_days : undefined,
        autoDeleteEnabled: s.auto_delete_enabled ?? false,
        requireTwoFactor: s.require_two_factor ?? false,
        ipRestrictions: s.ip_restrictions ?? [],
        auditLogRetention: (s.audit_log_retention as AuditLogRetention) ?? 'forever',
        dataResidency: (s.data_residency as DataResidency) ?? 'us',
        auditTrailEnabled: s.audit_trail_enabled ?? true,
        auditTrailMode: (s.audit_trail_mode as AuditTrailMode) ?? 'attached',
        gdprCompliant: s.gdpr_compliant ?? false,
        hipaaCompliant: s.hipaa_compliant ?? false,
        soc2Compliant: s.soc2_compliant ?? false,
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('[Compliance API] Error updating settings:', error);
      return NextResponse.json(
        { error: 'Failed to update compliance settings' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
