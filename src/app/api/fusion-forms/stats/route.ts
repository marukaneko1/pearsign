/**
 * FusionForms Statistics API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated FusionForms statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { FusionFormsService } from '@/lib/fusion-forms';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/fusion-forms/stats
 * Get FusionForms statistics for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const stats = await FusionFormsService.getStats(tenantId);

      return NextResponse.json(stats);
    } catch (error) {
      console.error('Error fetching fusion forms stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch fusion forms stats' },
        { status: 500 }
      );
    }
  }
);
