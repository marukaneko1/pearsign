/**
 * Webhook Detail API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Requires webhooks feature
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/webhooks/[id]
 * Get a specific webhook with its logs for the current tenant
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
          { success: false, error: "Webhook ID is required" },
          { status: 400 }
        );
      }

      const { id } = params;

      // Only fetch webhooks belonging to this tenant
      const webhook = await sql`
        SELECT * FROM webhooks
        WHERE id = ${id} AND (org_id = ${tenantId} OR tenant_id = ${tenantId})
      `;

      if (webhook.length === 0) {
        return NextResponse.json(
          { success: false, error: "Webhook not found" },
          { status: 404 }
        );
      }

      // Get recent logs for this webhook
      const logs = await sql`
        SELECT * FROM webhook_logs
        WHERE webhook_id = ${id}
        ORDER BY created_at DESC
        LIMIT 20
      `;

      return NextResponse.json({
        success: true,
        webhook: webhook[0],
        logs,
      });
    } catch (error) {
      console.error("[Webhook API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch webhook" },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['webhooks'],
  }
);

/**
 * PATCH /api/webhooks/[id]
 * Update a webhook for the current tenant
 */
export const PATCH = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: "Webhook ID is required" },
          { status: 400 }
        );
      }

      const { id } = params;
      const body = await request.json();
      const { name, url, events, enabled, payloadOptions } = body;

      // Build update query dynamically to handle payload_options
      // Only update webhooks belonging to this tenant
      let result;
      if (payloadOptions !== undefined) {
        result = await sql`
          UPDATE webhooks
          SET
            name = COALESCE(${name}, name),
            url = COALESCE(${url}, url),
            events = COALESCE(${events}, events),
            enabled = COALESCE(${enabled}, enabled),
            payload_options = ${JSON.stringify(payloadOptions)}::jsonb,
            updated_at = NOW()
          WHERE id = ${id} AND (org_id = ${tenantId} OR tenant_id = ${tenantId})
          RETURNING *
        `;
      } else {
        result = await sql`
          UPDATE webhooks
          SET
            name = COALESCE(${name}, name),
            url = COALESCE(${url}, url),
            events = COALESCE(${events}, events),
            enabled = COALESCE(${enabled}, enabled),
            updated_at = NOW()
          WHERE id = ${id} AND (org_id = ${tenantId} OR tenant_id = ${tenantId})
          RETURNING *
        `;
      }

      if (result.length === 0) {
        return NextResponse.json(
          { success: false, error: "Webhook not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        webhook: result[0],
      });
    } catch (error) {
      console.error("[Webhook API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update webhook" },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['webhooks'],
    requiredPermissions: ['canManageIntegrations'],
  }
);

/**
 * DELETE /api/webhooks/[id]
 * Delete a webhook for the current tenant
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
          { success: false, error: "Webhook ID is required" },
          { status: 400 }
        );
      }

      const { id } = params;

      // Only delete webhooks belonging to this tenant
      const result = await sql`
        DELETE FROM webhooks
        WHERE id = ${id} AND (org_id = ${tenantId} OR tenant_id = ${tenantId})
        RETURNING id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          { success: false, error: "Webhook not found or not authorized" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Webhook deleted",
      });
    } catch (error) {
      console.error("[Webhook API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete webhook" },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['webhooks'],
    requiredPermissions: ['canManageIntegrations'],
  }
);
