/**
 * Integrations API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated integration configurations
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Define all available integrations
const AVAILABLE_INTEGRATIONS = [
  // AI Integrations (for Document Center)
  {
    id: "openai",
    name: "OpenAI",
    description: "Use GPT-4 for AI-powered document generation",
    category: "AI",
    configFields: ["apiKey", "model"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Use Claude for intelligent document drafting",
    category: "AI",
    configFields: ["apiKey", "model"],
  },
  // Communication
  {
    id: "slack",
    name: "Slack",
    description: "Get notifications when documents are signed",
    category: "Communication",
    configFields: ["webhookUrl", "channel"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Automatically save completed documents to Drive",
    category: "Storage",
    configFields: ["folderId", "autoSave"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync signature requests with your CRM",
    category: "CRM",
    configFields: ["instanceUrl", "accessToken"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Store signed documents in Dropbox",
    category: "Storage",
    configFields: ["accessToken", "folderPath"],
  },
];

// Ensure the integrations table exists with tenant_id
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS integration_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255),
      integration_type VARCHAR(100) NOT NULL,
      config JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT false,
      last_tested_at TIMESTAMP,
      test_status VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, integration_type)
    )
  `;

  // Add tenant_id column if it doesn't exist
  try {
    await sql`
      ALTER TABLE integration_configs
      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)
    `;
  } catch {
    // Column might already exist
  }
}

/**
 * GET /api/settings/integrations
 * List all integrations with their connection status for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    await ensureTable();

    // Get all connected integrations for this tenant
    const connectedIntegrations = await sql`
      SELECT integration_type, config, enabled, last_tested_at, test_status, created_at
      FROM integration_configs
      WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
    `;

    // Map connected integrations by type
    const connectedMap = new Map(
      connectedIntegrations.map((i) => [i.integration_type, i])
    );

    // Build the full list with connection status
    const integrations = AVAILABLE_INTEGRATIONS.map((integration) => {
      const connected = connectedMap.get(integration.id);
      return {
        ...integration,
        connected: connected?.enabled || false,
        lastTestedAt: connected?.last_tested_at || null,
        testStatus: connected?.test_status || null,
        connectedAt: connected?.created_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      integrations,
    });
  } catch (error) {
    console.error("[Integrations API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/settings/integrations
 * Connect or disconnect an integration for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await ensureTable();

      const body = await request.json();
      const { integrationId, action, config } = body;

      // Validate integration exists
      const integrationDef = AVAILABLE_INTEGRATIONS.find((i) => i.id === integrationId);
      if (!integrationDef) {
        return NextResponse.json(
          { success: false, error: "Unknown integration" },
          { status: 400 }
        );
      }

      if (action === "connect") {
        // Upsert the integration config for this tenant
        await sql`
          INSERT INTO integration_configs (org_id, tenant_id, integration_type, config, enabled, updated_at)
          VALUES (
            ${tenantId},
            ${tenantId},
            ${integrationId},
            ${JSON.stringify(config || {})}::jsonb,
            true,
            NOW()
          )
          ON CONFLICT (org_id, integration_type)
          DO UPDATE SET
            config = ${JSON.stringify(config || {})}::jsonb,
            enabled = true,
            tenant_id = ${tenantId},
            updated_at = NOW()
        `;

        return NextResponse.json({
          success: true,
          message: `${integrationDef.name} connected successfully`,
        });
      } else if (action === "disconnect") {
        // Disable the integration for this tenant
        await sql`
          UPDATE integration_configs
          SET enabled = false, updated_at = NOW()
          WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = ${integrationId}
        `;

        return NextResponse.json({
          success: true,
          message: `${integrationDef.name} disconnected`,
        });
      } else if (action === "update") {
        // Update config for this tenant
        await sql`
          UPDATE integration_configs
          SET config = ${JSON.stringify(config || {})}::jsonb, updated_at = NOW()
          WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = ${integrationId}
        `;

        return NextResponse.json({
          success: true,
          message: `${integrationDef.name} configuration updated`,
        });
      } else {
        return NextResponse.json(
          { success: false, error: "Invalid action" },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("[Integrations API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update integration" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
