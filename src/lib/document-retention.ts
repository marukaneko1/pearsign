/**
 * Document Retention Service
 *
 * Enforces document retention policies:
 * - Calculates retention expiry dates based on tenant compliance settings
 * - Tracks document lifecycle for retention
 * - Provides cleanup functions for expired documents
 * - Logs all retention actions to audit log
 *
 * IMPORTANT: This is a compliance-critical module.
 * All deletions are logged and documents are soft-deleted first.
 */

import { sql } from './db';

// ============== TYPES ==============

export type RetentionPolicy = 'forever' | '1_year' | '3_years' | '5_years' | '7_years' | 'custom';

export interface RetentionInfo {
  retentionPolicy: RetentionPolicy;
  retentionDays: number;
  autoDeleteEnabled: boolean;
}

export interface DocumentRetentionStatus {
  documentId: string;
  tenantId: string;
  createdAt: string;
  completedAt: string | null;
  retentionExpiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  willBeDeleted: boolean;
}

export interface RetentionCleanupResult {
  processed: number;
  softDeleted: number;
  hardDeleted: number;
  errors: string[];
}

// ============== CONSTANTS ==============

const RETENTION_DAYS: Record<RetentionPolicy, number> = {
  'forever': -1, // -1 = never expires
  '1_year': 365,
  '3_years': 1095,
  '5_years': 1825,
  '7_years': 2555,
  'custom': 0, // Use custom days
};

// ============== DATABASE INITIALIZATION ==============

/**
 * Add retention tracking columns to envelope_documents table
 */
export async function initializeRetentionColumns(): Promise<void> {
  const columnsToAdd = [
    { name: 'completed_at', type: 'TIMESTAMP WITH TIME ZONE' },
    { name: 'retention_expires_at', type: 'TIMESTAMP WITH TIME ZONE' },
    { name: 'retention_policy', type: "VARCHAR(50) DEFAULT 'forever'" },
    { name: 'retention_days', type: 'INTEGER' },
    { name: 'deleted_at', type: 'TIMESTAMP WITH TIME ZONE' },
    { name: 'deleted_by', type: 'VARCHAR(255)' },
    { name: 'deletion_reason', type: 'VARCHAR(100)' },
    { name: 'is_retained', type: 'BOOLEAN DEFAULT true' },
  ];

  for (const col of columnsToAdd) {
    try {
      await sql`
        ALTER TABLE envelope_documents
        ADD COLUMN IF NOT EXISTS ${sql.unsafe(col.name)} ${sql.unsafe(col.type)}
      `;
    } catch (error) {
      // Column may already exist or table doesn't exist yet
      console.warn(`[Retention] Could not add column ${col.name}:`, error);
    }
  }

  // Create index for retention queries
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_envelope_docs_retention
      ON envelope_documents(org_id, retention_expires_at, deleted_at)
      WHERE deleted_at IS NULL
    `;
  } catch {
    // Index may already exist
  }

  // Create retention audit log table
  await sql`
    CREATE TABLE IF NOT EXISTS document_retention_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL,
      document_id VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      retention_policy VARCHAR(50),
      retention_expires_at TIMESTAMP WITH TIME ZONE,
      performed_by VARCHAR(255),
      performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      details JSONB DEFAULT '{}'
    )
  `;

  // Create index for audit queries
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_retention_log_tenant
      ON document_retention_log(tenant_id, performed_at DESC)
    `;
  } catch {
    // Index may already exist
  }

  console.log('[Retention] Columns and tables initialized');
}

// ============== RETENTION CALCULATION ==============

/**
 * Get retention settings for a tenant
 */
export async function getTenantRetentionSettings(tenantId: string): Promise<RetentionInfo> {
  try {
    const settings = await sql`
      SELECT retention_policy, retention_days, auto_delete_enabled
      FROM compliance_settings
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (settings.length === 0) {
      // Default: keep forever
      return {
        retentionPolicy: 'forever',
        retentionDays: -1,
        autoDeleteEnabled: false,
      };
    }

    const s = settings[0];
    const policy = (s.retention_policy || 'forever') as RetentionPolicy;
    let days = RETENTION_DAYS[policy];

    if (policy === 'custom' && s.retention_days) {
      days = s.retention_days;
    }

    return {
      retentionPolicy: policy,
      retentionDays: days,
      autoDeleteEnabled: s.auto_delete_enabled ?? false,
    };
  } catch (error) {
    console.error('[Retention] Error getting tenant settings:', error);
    return {
      retentionPolicy: 'forever',
      retentionDays: -1,
      autoDeleteEnabled: false,
    };
  }
}

/**
 * Calculate retention expiry date based on policy
 */
export function calculateRetentionExpiry(
  completedAt: Date,
  retentionDays: number
): Date | null {
  if (retentionDays <= 0) {
    return null; // Never expires
  }

  const expiryDate = new Date(completedAt);
  expiryDate.setDate(expiryDate.getDate() + retentionDays);
  return expiryDate;
}

// ============== DOCUMENT LIFECYCLE ==============

/**
 * Mark document as completed and set retention expiry
 * Called when all signers have signed
 */
export async function markDocumentCompleted(
  tenantId: string,
  documentId: string,
  completedBy?: string
): Promise<{ success: boolean; retentionExpiresAt: Date | null }> {
  try {
    await initializeRetentionColumns();

    // Get tenant's retention settings
    const retention = await getTenantRetentionSettings(tenantId);

    const completedAt = new Date();
    const retentionExpiresAt = calculateRetentionExpiry(completedAt, retention.retentionDays);

    // Update document with completion and retention info
    await sql`
      UPDATE envelope_documents
      SET
        completed_at = ${completedAt.toISOString()},
        retention_policy = ${retention.retentionPolicy},
        retention_days = ${retention.retentionDays},
        retention_expires_at = ${retentionExpiresAt?.toISOString() || null}
      WHERE envelope_id = ${documentId}
        AND (org_id = ${tenantId} OR org_id = ${tenantId})
    `;

    // Log retention assignment
    await sql`
      INSERT INTO document_retention_log (
        tenant_id, document_id, action, retention_policy,
        retention_expires_at, performed_by, details
      ) VALUES (
        ${tenantId},
        ${documentId},
        'retention_assigned',
        ${retention.retentionPolicy},
        ${retentionExpiresAt?.toISOString() || null},
        ${completedBy || 'system'},
        ${JSON.stringify({
          retentionDays: retention.retentionDays,
          autoDeleteEnabled: retention.autoDeleteEnabled,
          completedAt: completedAt.toISOString(),
        })}
      )
    `;

    console.log(`[Retention] Document ${documentId} marked completed, expires: ${retentionExpiresAt || 'never'}`);

    return {
      success: true,
      retentionExpiresAt,
    };
  } catch (error) {
    console.error('[Retention] Error marking document completed:', error);
    return {
      success: false,
      retentionExpiresAt: null,
    };
  }
}

/**
 * Get retention status for a document
 */
export async function getDocumentRetentionStatus(
  tenantId: string,
  documentId: string
): Promise<DocumentRetentionStatus | null> {
  try {
    const docs = await sql`
      SELECT
        envelope_id,
        org_id,
        created_at,
        completed_at,
        retention_expires_at,
        deleted_at,
        retention_policy
      FROM envelope_documents
      WHERE envelope_id = ${documentId}
        AND (org_id = ${tenantId} OR org_id = ${tenantId})
      LIMIT 1
    `;

    if (docs.length === 0) {
      return null;
    }

    const doc = docs[0];
    const now = new Date();
    const expiresAt = doc.retention_expires_at ? new Date(doc.retention_expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;

    let daysUntilExpiry: number | null = null;
    if (expiresAt && !isExpired) {
      daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Get auto-delete setting
    const retention = await getTenantRetentionSettings(tenantId);

    return {
      documentId: doc.envelope_id,
      tenantId: doc.org_id,
      createdAt: doc.created_at?.toISOString() || '',
      completedAt: doc.completed_at?.toISOString() || null,
      retentionExpiresAt: doc.retention_expires_at?.toISOString() || null,
      isExpired,
      daysUntilExpiry,
      willBeDeleted: isExpired && retention.autoDeleteEnabled && !doc.deleted_at,
    };
  } catch (error) {
    console.error('[Retention] Error getting document status:', error);
    return null;
  }
}

// ============== RETENTION ENFORCEMENT ==============

/**
 * Find all documents that have exceeded their retention period
 * Only returns documents where auto-delete is enabled
 */
export async function findExpiredDocuments(tenantId?: string): Promise<Array<{
  tenantId: string;
  documentId: string;
  title: string;
  completedAt: string;
  retentionExpiresAt: string;
}>> {
  try {
    await initializeRetentionColumns();

    let query;
    if (tenantId) {
      query = sql`
        SELECT
          d.org_id as tenant_id,
          d.envelope_id as document_id,
          d.title,
          d.completed_at,
          d.retention_expires_at
        FROM envelope_documents d
        JOIN compliance_settings c ON (c.organization_id = d.org_id OR c.tenant_id = d.org_id)
        WHERE d.org_id = ${tenantId}
          AND d.deleted_at IS NULL
          AND d.retention_expires_at IS NOT NULL
          AND d.retention_expires_at < NOW()
          AND c.auto_delete_enabled = true
        ORDER BY d.retention_expires_at ASC
        LIMIT 1000
      `;
    } else {
      query = sql`
        SELECT
          d.org_id as tenant_id,
          d.envelope_id as document_id,
          d.title,
          d.completed_at,
          d.retention_expires_at
        FROM envelope_documents d
        JOIN compliance_settings c ON (c.organization_id = d.org_id OR c.tenant_id = d.org_id)
        WHERE d.deleted_at IS NULL
          AND d.retention_expires_at IS NOT NULL
          AND d.retention_expires_at < NOW()
          AND c.auto_delete_enabled = true
        ORDER BY d.retention_expires_at ASC
        LIMIT 1000
      `;
    }

    const results = await query;

    return results.map((r: Record<string, unknown>) => ({
      tenantId: r.tenant_id as string,
      documentId: r.document_id as string,
      title: r.title as string,
      completedAt: (r.completed_at as Date)?.toISOString() || '',
      retentionExpiresAt: (r.retention_expires_at as Date)?.toISOString() || '',
    }));
  } catch (error) {
    console.error('[Retention] Error finding expired documents:', error);
    return [];
  }
}

/**
 * Soft delete a document (marks as deleted but preserves data)
 * Required for compliance - allows recovery within grace period
 */
export async function softDeleteDocument(
  tenantId: string,
  documentId: string,
  deletedBy: string,
  reason: 'retention_expired' | 'manual' | 'compliance'
): Promise<boolean> {
  try {
    await sql`
      UPDATE envelope_documents
      SET
        deleted_at = NOW(),
        deleted_by = ${deletedBy},
        deletion_reason = ${reason},
        is_retained = false
      WHERE envelope_id = ${documentId}
        AND (org_id = ${tenantId} OR org_id = ${tenantId})
        AND deleted_at IS NULL
    `;

    // Log the deletion
    await sql`
      INSERT INTO document_retention_log (
        tenant_id, document_id, action, performed_by, details
      ) VALUES (
        ${tenantId},
        ${documentId},
        'soft_deleted',
        ${deletedBy},
        ${JSON.stringify({ reason })}
      )
    `;

    console.log(`[Retention] Document ${documentId} soft-deleted (${reason})`);
    return true;
  } catch (error) {
    console.error('[Retention] Error soft-deleting document:', error);
    return false;
  }
}

/**
 * Permanently delete documents that have been soft-deleted for over 30 days
 * This is the final cleanup - data is unrecoverable after this
 */
export async function hardDeleteExpiredDocuments(
  gracePeriodDays: number = 30
): Promise<RetentionCleanupResult> {
  const result: RetentionCleanupResult = {
    processed: 0,
    softDeleted: 0,
    hardDeleted: 0,
    errors: [],
  };

  try {
    // Find documents soft-deleted more than grace period ago
    const toDelete = await sql`
      SELECT envelope_id, org_id, title
      FROM envelope_documents
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '${sql.unsafe(String(gracePeriodDays))} days'
      LIMIT 100
    `;

    result.processed = toDelete.length;

    for (const doc of toDelete) {
      try {
        // Delete associated signing sessions first
        await sql`
          DELETE FROM envelope_signing_sessions
          WHERE envelope_id = ${doc.envelope_id}
        `;

        // Delete the document
        await sql`
          DELETE FROM envelope_documents
          WHERE envelope_id = ${doc.envelope_id}
        `;

        // Log permanent deletion
        await sql`
          INSERT INTO document_retention_log (
            tenant_id, document_id, action, performed_by, details
          ) VALUES (
            ${doc.org_id},
            ${doc.envelope_id},
            'hard_deleted',
            'retention_system',
            ${JSON.stringify({
              title: doc.title,
              gracePeriodDays,
            })}
          )
        `;

        result.hardDeleted++;
      } catch (error) {
        result.errors.push(`Failed to delete ${doc.envelope_id}: ${error}`);
      }
    }

    console.log(`[Retention] Hard delete complete: ${result.hardDeleted}/${result.processed}`);
    return result;
  } catch (error) {
    console.error('[Retention] Error in hard delete:', error);
    result.errors.push(`System error: ${error}`);
    return result;
  }
}

/**
 * Run the full retention enforcement process
 * 1. Find expired documents
 * 2. Soft delete them
 * 3. Hard delete documents past grace period
 */
export async function runRetentionEnforcement(
  tenantId?: string
): Promise<RetentionCleanupResult> {
  const result: RetentionCleanupResult = {
    processed: 0,
    softDeleted: 0,
    hardDeleted: 0,
    errors: [],
  };

  try {
    console.log(`[Retention] Starting enforcement${tenantId ? ` for tenant ${tenantId}` : ''}`);

    // Step 1: Find and soft-delete expired documents
    const expired = await findExpiredDocuments(tenantId);
    result.processed = expired.length;

    for (const doc of expired) {
      const success = await softDeleteDocument(
        doc.tenantId,
        doc.documentId,
        'retention_system',
        'retention_expired'
      );
      if (success) {
        result.softDeleted++;
      } else {
        result.errors.push(`Failed to soft-delete ${doc.documentId}`);
      }
    }

    // Step 2: Hard delete documents past grace period
    const hardDeleteResult = await hardDeleteExpiredDocuments(30);
    result.hardDeleted = hardDeleteResult.hardDeleted;
    result.errors.push(...hardDeleteResult.errors);

    console.log(`[Retention] Enforcement complete: ${result.softDeleted} soft-deleted, ${result.hardDeleted} hard-deleted`);
    return result;
  } catch (error) {
    console.error('[Retention] Enforcement error:', error);
    result.errors.push(`System error: ${error}`);
    return result;
  }
}

// ============== RETENTION REPORTING ==============

/**
 * Get retention summary for a tenant
 */
export async function getRetentionSummary(tenantId: string): Promise<{
  totalDocuments: number;
  completedDocuments: number;
  documentsWithRetention: number;
  expiringIn30Days: number;
  expiringIn90Days: number;
  expired: number;
  softDeleted: number;
}> {
  try {
    await initializeRetentionColumns();

    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as completed,
        COUNT(CASE WHEN retention_expires_at IS NOT NULL THEN 1 END) as with_retention,
        COUNT(CASE WHEN retention_expires_at IS NOT NULL
          AND retention_expires_at < NOW() + INTERVAL '30 days'
          AND retention_expires_at > NOW()
          AND deleted_at IS NULL THEN 1 END) as expiring_30,
        COUNT(CASE WHEN retention_expires_at IS NOT NULL
          AND retention_expires_at < NOW() + INTERVAL '90 days'
          AND retention_expires_at > NOW()
          AND deleted_at IS NULL THEN 1 END) as expiring_90,
        COUNT(CASE WHEN retention_expires_at IS NOT NULL
          AND retention_expires_at < NOW()
          AND deleted_at IS NULL THEN 1 END) as expired,
        COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as soft_deleted
      FROM envelope_documents
      WHERE org_id = ${tenantId}
    `;

    const s = stats[0];
    return {
      totalDocuments: parseInt(s.total) || 0,
      completedDocuments: parseInt(s.completed) || 0,
      documentsWithRetention: parseInt(s.with_retention) || 0,
      expiringIn30Days: parseInt(s.expiring_30) || 0,
      expiringIn90Days: parseInt(s.expiring_90) || 0,
      expired: parseInt(s.expired) || 0,
      softDeleted: parseInt(s.soft_deleted) || 0,
    };
  } catch (error) {
    console.error('[Retention] Error getting summary:', error);
    return {
      totalDocuments: 0,
      completedDocuments: 0,
      documentsWithRetention: 0,
      expiringIn30Days: 0,
      expiringIn90Days: 0,
      expired: 0,
      softDeleted: 0,
    };
  }
}

/**
 * Get retention audit log for a tenant
 */
export async function getRetentionAuditLog(
  tenantId: string,
  limit: number = 100
): Promise<Array<{
  id: string;
  documentId: string;
  action: string;
  retentionPolicy: string | null;
  retentionExpiresAt: string | null;
  performedBy: string;
  performedAt: string;
  details: Record<string, unknown>;
}>> {
  try {
    const logs = await sql`
      SELECT *
      FROM document_retention_log
      WHERE tenant_id = ${tenantId}
      ORDER BY performed_at DESC
      LIMIT ${limit}
    `;

    return logs.map((l: Record<string, unknown>) => ({
      id: l.id as string,
      documentId: l.document_id as string,
      action: l.action as string,
      retentionPolicy: l.retention_policy as string | null,
      retentionExpiresAt: (l.retention_expires_at as Date)?.toISOString() || null,
      performedBy: l.performed_by as string,
      performedAt: (l.performed_at as Date)?.toISOString() || '',
      details: (l.details as Record<string, unknown>) || {},
    }));
  } catch (error) {
    console.error('[Retention] Error getting audit log:', error);
    return [];
  }
}
