/**
 * Integration Config API
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/settings/integrations/[id]
 * Get configuration for a specific integration for the current tenant
 */
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: "Integration ID is required" },
          { status: 400 }
        );
      }

      const { id: integrationId } = params;

      const result = await sql`
        SELECT * FROM integration_configs
        WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = ${integrationId}
      `;

      if (result.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            integrationId,
            config: {},
            enabled: false,
            lastTestedAt: null,
            testStatus: null,
          },
        });
      }

      const config = result[0];
      return NextResponse.json({
        success: true,
        data: {
          integrationId,
          config: config.config || {},
          enabled: config.enabled,
          lastTestedAt: config.last_tested_at,
          testStatus: config.test_status,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        },
      });
    } catch (error) {
      console.error("[Integration Config API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch integration config" },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/settings/integrations/[id]
 * Completely remove an integration for the current tenant
 */
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: "Integration ID is required" },
          { status: 400 }
        );
      }

      const { id: integrationId } = params;

      await sql`
        DELETE FROM integration_configs
        WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = ${integrationId}
      `;

      return NextResponse.json({
        success: true,
        message: "Integration removed",
      });
    } catch (error) {
      console.error("[Integration Config API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to remove integration" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
