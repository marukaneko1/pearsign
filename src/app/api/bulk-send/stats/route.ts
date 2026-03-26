/**
 * Bulk Send Stats API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated bulk send statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { BulkSendService } from '@/lib/bulk-send';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/bulk-send/stats
 * Get bulk send statistics and analytics for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const stats = await BulkSendService.getStats(tenantId);

      return NextResponse.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error fetching bulk send stats:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bulk send stats' },
        { status: 500 }
      );
    }
  }
);
