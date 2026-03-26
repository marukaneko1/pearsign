/**
 * Rate Limit Alerts API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated rate limit alerts
 */

import { NextRequest, NextResponse } from "next/server";
import { RateLimitAlertService, RateLimitMonitorService } from "@/lib/rate-limit-alerts";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/v1/rate-limit-alerts
 * Get rate limit alerts for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const type = searchParams.get("type") || "alerts";
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const unreadOnly = searchParams.get("unreadOnly") === "true";

      if (type === "usage") {
        const usageStatus = await RateLimitMonitorService.getAllKeyUsageStatus(tenantId);
        return NextResponse.json({ data: usageStatus, meta: { count: usageStatus.length } });
      }

      if (type === "unread-count") {
        const count = await RateLimitAlertService.getUnreadCount(tenantId);
        return NextResponse.json({ data: { count } });
      }

      const alerts = await RateLimitAlertService.getAlerts(tenantId, limit, unreadOnly);
      const unreadCount = await RateLimitAlertService.getUnreadCount(tenantId);
      return NextResponse.json({ data: alerts, meta: { count: alerts.length, unreadCount } });
    } catch (error) {
      console.error("Error fetching rate limit alerts:", error);
      return NextResponse.json({ error: { code: "internal_error", message: "Failed to fetch alerts" } }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canViewAuditLogs'],
  }
);

/**
 * POST /api/v1/rate-limit-alerts
 * Mark alerts as read for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action, alertId } = body;

      if (action === "mark-read" && alertId) {
        await RateLimitAlertService.markAsRead(alertId, tenantId);
        return NextResponse.json({ data: { success: true } });
      }

      if (action === "mark-all-read") {
        await RateLimitAlertService.markAllAsRead(tenantId);
        return NextResponse.json({ data: { success: true } });
      }

      return NextResponse.json({ error: { code: "invalid_request", message: "Invalid action" } }, { status: 400 });
    } catch (error) {
      console.error("Error updating rate limit alerts:", error);
      return NextResponse.json({ error: { code: "internal_error", message: "Failed to update alerts" } }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canViewAuditLogs'],
  }
);
