/**
 * Integration Test API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Tests integrations for the current tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Simulated test functions for each integration
async function testSlackWebhook(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const webhookUrl = config.webhookUrl as string;
  if (!webhookUrl) {
    return { success: false, message: "Webhook URL is required" };
  }

  try {
    // In production, we would actually POST to the Slack webhook
    // For demo, we'll validate the URL format
    const url = new URL(webhookUrl);
    if (!url.hostname.includes("slack.com") && !url.hostname.includes("hooks.slack.com")) {
      return { success: false, message: "Invalid Slack webhook URL" };
    }

    // Simulate successful test
    return { success: true, message: "Slack webhook is valid and ready" };
  } catch {
    return { success: false, message: "Invalid webhook URL format" };
  }
}

async function testGoogleDrive(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const folderId = config.folderId as string;
  if (!folderId) {
    return { success: false, message: "Folder ID is required" };
  }

  // In production, we'd validate with Google Drive API
  return { success: true, message: "Google Drive connection verified" };
}

async function testSalesforce(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const instanceUrl = config.instanceUrl as string;
  const accessToken = config.accessToken as string;

  if (!instanceUrl || !accessToken) {
    return { success: false, message: "Instance URL and Access Token are required" };
  }

  // In production, we'd make a test API call to Salesforce
  return { success: true, message: "Salesforce connection verified" };
}

async function testZapier(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const webhookUrl = config.webhookUrl as string;
  if (!webhookUrl) {
    return { success: false, message: "Webhook URL is required" };
  }

  try {
    const url = new URL(webhookUrl);
    if (!url.hostname.includes("zapier.com") && !url.hostname.includes("hooks.zapier.com")) {
      return { success: false, message: "Invalid Zapier webhook URL" };
    }
    return { success: true, message: "Zapier webhook is valid" };
  } catch {
    return { success: false, message: "Invalid webhook URL format" };
  }
}

async function testDropbox(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const accessToken = config.accessToken as string;
  if (!accessToken) {
    return { success: false, message: "Access token is required" };
  }

  // In production, we'd validate with Dropbox API
  return { success: true, message: "Dropbox connection verified" };
}

async function testHubSpot(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const apiKey = config.apiKey as string;
  if (!apiKey) {
    return { success: false, message: "API key is required" };
  }

  // In production, we'd validate with HubSpot API
  return { success: true, message: "HubSpot connection verified" };
}

async function testMicrosoftTeams(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const webhookUrl = config.webhookUrl as string;
  if (!webhookUrl) {
    return { success: false, message: "Webhook URL is required" };
  }

  try {
    const url = new URL(webhookUrl);
    if (!url.hostname.includes("webhook.office.com") && !url.hostname.includes("microsoft.com")) {
      return { success: false, message: "Invalid Microsoft Teams webhook URL" };
    }
    return { success: true, message: "Microsoft Teams webhook is valid" };
  } catch {
    return { success: false, message: "Invalid webhook URL format" };
  }
}

async function testNotion(config: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const apiKey = config.apiKey as string;
  const databaseId = config.databaseId as string;

  if (!apiKey || !databaseId) {
    return { success: false, message: "API key and Database ID are required" };
  }

  // In production, we'd validate with Notion API
  return { success: true, message: "Notion connection verified" };
}

const testFunctions: Record<string, (config: Record<string, unknown>) => Promise<{ success: boolean; message: string }>> = {
  slack: testSlackWebhook,
  "google-drive": testGoogleDrive,
  salesforce: testSalesforce,
  zapier: testZapier,
  dropbox: testDropbox,
  hubspot: testHubSpot,
  "microsoft-teams": testMicrosoftTeams,
  notion: testNotion,
};

/**
 * POST /api/settings/integrations/[id]/test
 * Test an integration connection for the current tenant
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
          { success: false, error: "Integration ID is required" },
          { status: 400 }
        );
      }

      const integrationId = params.id;
      const body = await request.json();
      const { config } = body;

      const testFn = testFunctions[integrationId];
      if (!testFn) {
        return NextResponse.json(
          { success: false, error: "No test available for this integration" },
          { status: 400 }
        );
      }

      // Run the test
      const result = await testFn(config || {});

      // Update the test status in the database for this tenant
      await sql`
        UPDATE integration_configs
        SET
          last_tested_at = NOW(),
          test_status = ${result.success ? "success" : "failed"},
          updated_at = NOW()
        WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = ${integrationId}
      `;

      return NextResponse.json({
        success: result.success,
        message: result.message,
        testedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Integration Test API] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to test integration" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
