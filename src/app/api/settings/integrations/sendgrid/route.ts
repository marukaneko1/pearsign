/**
 * SendGrid Integration API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Stores SendGrid API keys per tenant
 *
 * TENANT ISOLATION: Each tenant must configure their own SendGrid credentials.
 * Platform fallback can be enabled per-tenant for backward compatibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { clearSendGridCache } from "@/lib/email-service";

// Ensure the integrations table exists with all required columns
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS integration_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255),
      integration_type VARCHAR(100) NOT NULL,
      config JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT false,
      platform_fallback_enabled BOOLEAN DEFAULT false,
      last_tested_at TIMESTAMP,
      test_status VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, integration_type)
    )
  `;

  // Add columns if they don't exist (for existing installations)
  try {
    await sql`
      ALTER TABLE integration_configs
      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)
    `;
    await sql`
      ALTER TABLE integration_configs
      ADD COLUMN IF NOT EXISTS platform_fallback_enabled BOOLEAN DEFAULT false
    `;
  } catch {
    // Columns might already exist
  }
}

// Mask API key for display (show first 4 and last 4 chars)
function maskApiKey(key: string): string {
  if (!key || key.length < 12) return "••••••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

/**
 * GET /api/settings/integrations/sendgrid
 * Get SendGrid configuration for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    await ensureTable();

    const result = await sql`
      SELECT * FROM integration_configs
      WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = 'sendgrid'
    `;

    if (result.length === 0) {
      return NextResponse.json({
        data: {
          apiKey: "",
          fromEmail: "",
          fromName: "PearSign",
          enabled: false,
          platformFallbackEnabled: false,
          hasCredentials: false,
          status: "not_configured",
          lastTestedAt: null,
          testStatus: null,
        }
      });
    }

    const config = result[0];
    const configData = config.config as { apiKey?: string; fromEmail?: string; fromName?: string } || {};
    const hasCredentials = !!(configData.apiKey && configData.fromEmail);

    // Determine status
    let status: "connected" | "not_configured" | "invalid" = "not_configured";
    if (hasCredentials && config.enabled) {
      status = config.test_status === "success" ? "connected" : "invalid";
    } else if (hasCredentials) {
      status = "not_configured"; // Has credentials but not enabled
    }

    return NextResponse.json({
      data: {
        // Mask the API key for security
        apiKey: configData.apiKey ? maskApiKey(configData.apiKey) : "",
        fromEmail: configData.fromEmail || "",
        fromName: configData.fromName || "PearSign",
        enabled: config.enabled,
        platformFallbackEnabled: config.platform_fallback_enabled || false,
        hasCredentials,
        status,
        lastTestedAt: config.last_tested_at,
        testStatus: config.test_status,
      }
    });
  } catch (error) {
    console.error("Error fetching SendGrid config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/settings/integrations/sendgrid
 * Save SendGrid configuration for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await ensureTable();

      const body = await request.json();
      const { apiKey, fromEmail, fromName, enabled, platformFallbackEnabled } = body;

      // If apiKey contains mask characters, don't update it
      let finalApiKey = apiKey;
      if (apiKey && apiKey.includes("••")) {
        // Get existing API key from database
        const existing = await sql`
          SELECT config FROM integration_configs
          WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = 'sendgrid'
        `;
        if (existing.length > 0) {
          const existingConfig = existing[0].config as { apiKey?: string } || {};
          finalApiKey = existingConfig.apiKey || "";
        } else {
          finalApiKey = "";
        }
      }

      // Upsert the config for this tenant
      await sql`
        INSERT INTO integration_configs (
          org_id, tenant_id, integration_type, config, enabled,
          platform_fallback_enabled, updated_at
        )
        VALUES (
          ${tenantId},
          ${tenantId},
          'sendgrid',
          ${JSON.stringify({ apiKey: finalApiKey, fromEmail, fromName })}::jsonb,
          ${enabled},
          ${platformFallbackEnabled || false},
          NOW()
        )
        ON CONFLICT (org_id, integration_type)
        DO UPDATE SET
          config = ${JSON.stringify({ apiKey: finalApiKey, fromEmail, fromName })}::jsonb,
          enabled = ${enabled},
          platform_fallback_enabled = ${platformFallbackEnabled || false},
          tenant_id = ${tenantId},
          updated_at = NOW()
      `;

      // Clear the email service cache so new config is used immediately
      clearSendGridCache(tenantId);

      if (process.env.NODE_ENV !== 'production') console.log(`[SendGrid] Settings saved for tenant: ${tenantId}, enabled: ${enabled}, fallback: ${platformFallbackEnabled}`);

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error saving SendGrid config:", error);
      return NextResponse.json(
        { error: "Failed to save configuration" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
