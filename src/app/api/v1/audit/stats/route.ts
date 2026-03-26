/**
 * API Usage Stats API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated API usage statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiAuditLogService } from "@/lib/api-keys";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/audit/stats
 * Fetch API usage statistics for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const days = parseInt(searchParams.get("days") || "30", 10);

      const stats = await ApiAuditLogService.getStats(tenantId, days);

      return NextResponse.json({
        data: stats,
        meta: {
          period: `${days} days`,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error fetching API stats:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to fetch API stats" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canViewAuditLogs'],
  }
);
