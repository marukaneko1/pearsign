/**
 * API Audit Logs API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated API audit logs
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiAuditLogService } from "@/lib/api-keys";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/audit/api-logs
 * Fetch API audit logs for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const searchParams = request.nextUrl.searchParams;

      const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
      const offset = parseInt(searchParams.get("offset") || "0", 10);
      const apiKeyId = searchParams.get("apiKeyId") || undefined;
      const endpoint = searchParams.get("endpoint") || undefined;
      const method = searchParams.get("method") || undefined;
      const startDate = searchParams.get("startDate") || undefined;
      const endDate = searchParams.get("endDate") || undefined;

      const logs = await ApiAuditLogService.getAll(
        tenantId,
        { apiKeyId, endpoint, method, startDate, endDate },
        limit,
        offset
      );

      return NextResponse.json({
        data: logs,
        meta: {
          count: logs.length,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("Error fetching API audit logs:", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Failed to fetch audit logs" } },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canViewAuditLogs'],
  }
);
