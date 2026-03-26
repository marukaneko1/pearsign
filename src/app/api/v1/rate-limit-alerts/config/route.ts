/**
 * Rate Limit Alert Config API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated rate limit alert configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { RateLimitAlertConfigService } from "@/lib/rate-limit-alerts";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/rate-limit-alerts/config
 * Get rate limit alert configuration for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const config = await RateLimitAlertConfigService.getConfig(tenantId);
      return NextResponse.json({ data: config });
    } catch (error) {
      console.error("Error fetching rate limit config:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to fetch config" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * PATCH /api/v1/rate-limit-alerts/config
 * Update rate limit alert configuration for the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const config = await RateLimitAlertConfigService.updateConfig(body, tenantId);
      return NextResponse.json({ data: config });
    } catch (error) {
      console.error("Error updating rate limit config:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to update config" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
