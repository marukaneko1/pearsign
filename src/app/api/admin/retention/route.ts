/**
 * Document Retention Admin API
 *
 * Endpoints for retention enforcement and reporting.
 * Protected by admin key for scheduled task access.
 *
 * GET - Get retention status and summary
 * POST - Run retention enforcement (soft-delete expired documents)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  initializeRetentionColumns,
  getTenantRetentionSettings,
  getRetentionSummary,
  getRetentionAuditLog,
  runRetentionEnforcement,
  findExpiredDocuments,
} from '@/lib/document-retention';

// Admin key for cron job access
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

/**
 * Verify admin access for cron/scheduled tasks
 */
function verifyAdminAccess(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-Admin-Key');

  if (ADMIN_SECRET_KEY && (
    authHeader === `Bearer ${ADMIN_SECRET_KEY}` ||
    apiKey === ADMIN_SECRET_KEY
  )) {
    return true;
  }

  return false;
}

/**
 * GET /api/admin/retention
 * Get retention status for a tenant
 *
 * Query params:
 * - tenantId: (optional) specific tenant, or all tenants if admin
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

      // Get expired documents (not yet deleted)
      const expiredDocs = await findExpiredDocuments(tenantId);

      // Get recent audit log
      const auditLog = await getRetentionAuditLog(tenantId, 20);

      return NextResponse.json({
        success: true,
        tenantId,
        settings,
        summary,
        expiredDocuments: expiredDocs.length,
        expiredDocumentsList: expiredDocs.slice(0, 10), // Show first 10
        recentActions: auditLog,
      });
    } catch (error) {
      console.error('[Retention API] Error getting status:', error);
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
 * POST /api/admin/retention
 * Run retention enforcement
 *
 * Can be called:
 * 1. By authenticated user with canManageSettings permission
 * 2. By cron job with admin key
 *
 * Body:
 * - dryRun: boolean - If true, only report what would be deleted
 */
export async function POST(request: NextRequest) {
  try {
    // Check for admin key access (for cron jobs)
    const isAdmin = verifyAdminAccess(request);

    if (!isAdmin) {
      // Fall back to tenant-based auth
      return withTenantEnforcement(request);
    }

    // Admin access - run enforcement across all tenants or specific tenant
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body;

    // Initialize retention columns
    await initializeRetentionColumns();

    if (dryRun) {
      // Just report what would be deleted
      const expiredDocs = await findExpiredDocuments(tenantId);

      return NextResponse.json({
        success: true,
        dryRun: true,
        message: 'Dry run - no documents deleted',
        wouldDelete: expiredDocs.length,
        documents: expiredDocs,
      });
    }

    // Run actual enforcement
    const result = await runRetentionEnforcement(tenantId);

    return NextResponse.json({
      success: true,
      message: 'Retention enforcement completed',
      result,
    });
  } catch (error) {
    console.error('[Retention API] Enforcement error:', error);
    return NextResponse.json(
      { error: 'Failed to run retention enforcement' },
      { status: 500 }
    );
  }
}

/**
 * Wrapper to handle tenant-authenticated POST requests
 */
async function withTenantEnforcement(request: NextRequest): Promise<NextResponse> {
  // Create a wrapped handler that uses withTenant
  const handler = withTenant(
    async (req: NextRequest, { tenantId }: TenantApiContext) => {
      const body = await req.json().catch(() => ({}));
      const { dryRun = false } = body;

      // Initialize retention columns
      await initializeRetentionColumns();

      if (dryRun) {
        const expiredDocs = await findExpiredDocuments(tenantId);

        return NextResponse.json({
          success: true,
          dryRun: true,
          tenantId,
          message: 'Dry run - no documents deleted',
          wouldDelete: expiredDocs.length,
          documents: expiredDocs,
        });
      }

      // Run enforcement for this tenant only
      const result = await runRetentionEnforcement(tenantId);

      return NextResponse.json({
        success: true,
        tenantId,
        message: 'Retention enforcement completed',
        result,
      });
    },
    {
      requiredPermissions: ['canManageSettings'],
    }
  );

  return handler(request, { params: Promise.resolve({}) });
}
