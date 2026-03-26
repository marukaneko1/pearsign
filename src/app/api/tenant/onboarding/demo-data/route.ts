/**
 * Demo Data API
 *
 * POST - Create demo data for tenant
 * DELETE - Remove demo data
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  TenantOnboardingService,
  initializeOnboardingTable
} from '@/lib/tenant-onboarding';

/**
 * POST /api/tenant/onboarding/demo-data
 * Create demo data for the tenant
 */
export const POST = withTenant(
  async (_request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await initializeOnboardingTable();
      const result = await TenantOnboardingService.createDemoData(tenantId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('[DemoData] Error creating:', error);
      return NextResponse.json(
        { error: 'Failed to create demo data' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/tenant/onboarding/demo-data
 * Remove demo data from tenant
 */
export const DELETE = withTenant(
  async (_request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await initializeOnboardingTable();
      const result = await TenantOnboardingService.removeDemoData(tenantId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('[DemoData] Error removing:', error);
      return NextResponse.json(
        { error: 'Failed to remove demo data' },
        { status: 500 }
      );
    }
  }
);
