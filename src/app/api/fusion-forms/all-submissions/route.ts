/**
 * GET /api/fusion-forms/all-submissions
 * Returns all submissions across every form for the current tenant.
 * Used by the dashboard "Submissions" stat card detail view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FusionFormsService } from '@/lib/fusion-forms';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const limit = parseInt(searchParams.get('limit') || '100', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await FusionFormsService.getAllSubmissionsForOrg(tenantId, {
        limit,
        offset,
      });

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error fetching all submissions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      );
    }
  }
);
