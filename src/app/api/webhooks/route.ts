/**
 * Webhooks API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Requires webhooks feature (starter+ plans)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Ensure webhooks table exists
async function ensureTable() {
  // Use VARCHAR for id to maintain compatibility with existing data
  await sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      secret VARCHAR(255),
      events TEXT[] DEFAULT '{}',
      payload_options JSONB DEFAULT '{"includePdf": false, "includeFieldValues": true, "includeAuditTrail": false}',
      enabled BOOLEAN DEFAULT true,
      last_triggered_at TIMESTAMP,
      last_status VARCHAR(50),
      failure_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add tenant_id and payload_options columns if they don't exist
  try {
    await sql`
      ALTER TABLE webhooks
      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)
    `;
    await sql`
      ALTER TABLE webhooks
      ADD COLUMN IF NOT EXISTS payload_options JSONB DEFAULT '{"includePdf": false, "includeFieldValues": true, "includeAuditTrail": false}'
    `;
  } catch {
    // Columns might already exist
  }

  // Also create webhook logs table (no foreign key to avoid type mismatch issues)
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id VARCHAR(255),
      tenant_id VARCHAR(255),
      event_type VARCHAR(100) NOT NULL,
      payload JSONB,
      response_status INTEGER,
      response_body TEXT,
      success BOOLEAN,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add index for faster lookups
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant_id ON webhook_logs(tenant_id)`;
  } catch {
    // Index might already exist
  }
}

/**
 * GET /api/webhooks
 * List all webhooks for the tenant
 */
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    await ensureTable();

    // Filter by tenant_id (falling back to org_id for backwards compatibility)
    const webhooks = await sql`
      SELECT * FROM webhooks
      WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({
      success: true,
      webhooks,
      tenant: {
        id: tenantId,
        plan: context.tenant.plan,
      },
    });
  } catch (error) {
    console.error("[Webhooks API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch webhooks" },
      { status: 500 }
    );
  }
}, {
  requiredFeatures: ['webhooks'],
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      await ensureTable();

      const body = await request.json();
      const { name, url, secret, events, payloadOptions } = body;

      if (!name || !url) {
        return NextResponse.json(
          { success: false, error: "Name and URL are required" },
          { status: 400 }
        );
      }

      // Generate a random secret if not provided
      const webhookSecret = secret || `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

      // Default payload options
      const defaultPayloadOptions = {
        includePdf: false,
        includeFieldValues: true,
        includeAuditTrail: false,
      };

      const result = await sql`
        INSERT INTO webhooks (org_id, tenant_id, name, url, secret, events, payload_options)
        VALUES (
          ${tenantId},
          ${tenantId},
          ${name},
          ${url},
          ${webhookSecret},
          ${events || ["document.signed", "document.completed"]},
          ${JSON.stringify(payloadOptions || defaultPayloadOptions)}::jsonb
        )
        RETURNING *
      `;

      return NextResponse.json({
        success: true,
        webhook: result[0],
        tenant: {
          id: tenantId,
          plan: context.tenant.plan,
        },
      });
    } catch (error) {
      console.error("[Webhooks API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create webhook" },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['webhooks'],
    requiredPermissions: ['canManageIntegrations'],
  }
);
