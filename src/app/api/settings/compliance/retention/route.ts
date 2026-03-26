/**
 * Document Retention Status API
 *
 * GET - Get retention summary and upcoming expirations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  initializeRetentionColumns,
  getTenantRetentionSettings,
  getRetentionSummary,
  getRetentionAuditLog,
  findExpiredDocuments,
  getDocumentRetentionStatus,
} from '@/lib/document-retention';
import { sql } from '@/lib/db';

/**
 * GET /api/settings/compliance/retention
 * Get retention status for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      // Initialize retention columns if needed
      await initializeRetentionColumns();

      // Get retention settings
      const settings = await getTenantRetentionSettings(tenantId);

      // Get retention summary
      const summary = await getRetentionSummary(tenantId);

      // Get documents expiring soon (next 30 days)
      const expiringSoon = await sql`
        SELECT
          envelope_id as "documentId",
          title,
          completed_at as "completedAt",
          retention_expires_at as "retentionExpiresAt",
          EXTRACT(EPOCH FROM (retention_expires_at - NOW())) / 86400 as "daysUntilExpiry"
        FROM envelope_documents
        WHERE org_id = ${tenantId}
          AND deleted_at IS NULL
          AND retention_expires_at IS NOT NULL
          AND retention_expires_at > NOW()
          AND retention_expires_at < NOW() + INTERVAL '30 days'
        ORDER BY retention_expires_at ASC
        LIMIT 20
      `;

      // Get expired documents (not yet deleted)
      const expiredDocs = await findExpiredDocuments(tenantId);

      // Get recent retention actions
      const recentActions = await getRetentionAuditLog(tenantId, 10);

      return NextResponse.json({
        success: true,
        settings: {
          retentionPolicy: settings.retentionPolicy,
          retentionDays: settings.retentionDays,
          autoDeleteEnabled: settings.autoDeleteEnabled,
          policyDescription: getRetentionPolicyDescription(settings.retentionPolicy, settings.retentionDays),
        },
        summary: {
          ...summary,
          retentionActive: settings.retentionPolicy !== 'forever',
          autoDeleteActive: settings.autoDeleteEnabled,
        },
        expiringSoon: expiringSoon.map((d: Record<string, unknown>) => ({
          documentId: d.documentId,
          title: d.title,
          completedAt: (d.completedAt as Date)?.toISOString() || null,
          retentionExpiresAt: (d.retentionExpiresAt as Date)?.toISOString() || null,
          daysUntilExpiry: Math.ceil(Number(d.daysUntilExpiry) || 0),
        })),
        expiredDocuments: {
          count: expiredDocs.length,
          willBeDeleted: settings.autoDeleteEnabled,
          documents: expiredDocs.slice(0, 5),
        },
        recentActions,
      });
    } catch (error) {
      console.error('[Retention Status API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get retention status' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * Get human-readable description of retention policy
 */
function getRetentionPolicyDescription(policy: string, days: number): string {
  switch (policy) {
    case 'forever':
      return 'Documents are kept indefinitely';
    case '1_year':
      return 'Documents are retained for 1 year after completion';
    case '3_years':
      return 'Documents are retained for 3 years after completion';
    case '5_years':
      return 'Documents are retained for 5 years after completion';
    case '7_years':
      return 'Documents are retained for 7 years after completion (recommended for tax records)';
    case 'custom':
      return `Documents are retained for ${days} days after completion`;
    default:
      return 'Documents are kept indefinitely';
  }
}
