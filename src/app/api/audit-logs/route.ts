/**
 * Audit Logs API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogService } from '@/lib/audit-log';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/audit-logs
 * Get audit logs with filtering and pagination for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const userId = searchParams.get('userId') || undefined;
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await AuditLogService.getLogs({
        orgId: tenantId,
        userId,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: result.logs,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }
  }
);
