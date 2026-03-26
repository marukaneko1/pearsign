/**
 * Webhook Test API
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import crypto from "crypto";

/**
 * POST /api/webhooks/[id]/test
 * Send a test webhook to verify the endpoint works
 */
export const POST = withTenant<{ id: string }>(
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

      // Get the webhook - only if it belongs to this tenant
      const webhooks = await sql`
        SELECT * FROM webhooks
        WHERE id = ${id} AND (org_id = ${tenantId} OR tenant_id = ${tenantId})
      `;

      if (webhooks.length === 0) {
        return NextResponse.json(
          { success: false, error: "Webhook not found" },
          { status: 404 }
        );
      }

      const webhook = webhooks[0];
      const testPayload = {
        event: "test",
        timestamp: new Date().toISOString(),
        data: {
          message: "This is a test webhook from PearSign",
          webhookId: id,
          tenantId: tenantId,
        },
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac("sha256", webhook.secret as string)
        .update(payloadString)
        .digest("hex");

      // Send the test webhook
      const response = await fetch(webhook.url as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PearSign-Signature": signature,
          "X-PearSign-Event": "test",
          "X-PearSign-Timestamp": testPayload.timestamp,
        },
        body: payloadString,
      });

      const responseBody = await response.text();

      // Log the test with tenant_id
      await sql`
        INSERT INTO webhook_logs (webhook_id, tenant_id, event_type, payload, response_status, response_body, success)
        VALUES (
          ${id},
          ${tenantId},
          'test',
          ${JSON.stringify(testPayload)}::jsonb,
          ${response.status},
          ${responseBody.substring(0, 1000)},
          ${response.ok}
        )
      `;

      // Update webhook status
      await sql`
        UPDATE webhooks
        SET last_triggered_at = NOW(), last_status = ${response.ok ? "success" : "failed"}
        WHERE id = ${id}
      `;

      return NextResponse.json({
        success: response.ok,
        status: response.status,
        message: response.ok
          ? "Test webhook sent successfully"
          : `Webhook returned status ${response.status}`,
      });
    } catch (error) {
      console.error("[Webhook Test] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to send test webhook" },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['webhooks'],
    requiredPermissions: ['canManageIntegrations'],
  }
);
