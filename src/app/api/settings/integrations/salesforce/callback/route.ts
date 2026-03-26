/**
 * Salesforce OAuth Callback
 *
 * Multi-tenancy: Tenant ID is extracted from the OAuth state parameter
 * The state should be passed when initiating the OAuth flow
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getTenantSessionContext } from "@/lib/tenant-session";

// Default tenant ID for demo mode
const DEMO_TENANT_ID = "demo-org";

/**
 * GET /api/settings/integrations/salesforce/callback
 * Handle Salesforce OAuth callback and exchange code for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const state = searchParams.get("state");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Extract tenant ID from state parameter, or try to get from session
    let tenantId = DEMO_TENANT_ID;

    // First, try to get tenant from state (passed during OAuth initiation)
    if (state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        if (stateData.tenantId) {
          tenantId = stateData.tenantId;
        }
      } catch {
        tenantId = state;
      }
    }

    // Fall back to session if available
    if (tenantId === DEMO_TENANT_ID) {
      try {
        const sessionContext = await getTenantSessionContext();
        if (sessionContext && sessionContext.isValid) {
          tenantId = sessionContext.session.tenantId;
        }
      } catch {
        // No session available
      }
    }

    console.log("[Salesforce Callback] Processing for tenant:", tenantId);

    if (error) {
      console.error("[Salesforce Callback] OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}?integration=salesforce&error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}?integration=salesforce&error=no_code`
      );
    }

    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/settings/integrations/salesforce/callback`;
    const salesforceLoginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${baseUrl}?integration=salesforce&error=not_configured`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(`${salesforceLoginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("[Salesforce Callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}?integration=salesforce&error=token_exchange_failed`
      );
    }

    // Get user info from the id URL
    let userEmail = "";
    let userName = "";
    let salesforceOrgId = "";

    if (tokenData.id) {
      try {
        const userResponse = await fetch(tokenData.id, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        const userData = await userResponse.json();
        userEmail = userData.email || "";
        userName = userData.display_name || userData.name || "";
        salesforceOrgId = userData.organization_id || "";
      } catch (e) {
        console.error("[Salesforce Callback] Failed to get user info:", e);
      }
    }

    // Store the tokens in the integration_configs table for this tenant
    const config = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      instanceUrl: tokenData.instance_url,
      tokenType: tokenData.token_type,
      issuedAt: tokenData.issued_at,
      userEmail,
      userName,
      salesforceOrgId,
      // Salesforce-specific settings
      syncContacts: "true",
      syncDocuments: "true",
      createTasks: "false",
    };

    // Ensure table exists with tenant_id
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

    await sql`
      INSERT INTO integration_configs (org_id, tenant_id, integration_type, config, enabled, test_status, updated_at)
      VALUES (
        ${tenantId},
        ${tenantId},
        'salesforce',
        ${JSON.stringify(config)}::jsonb,
        true,
        'success',
        NOW()
      )
      ON CONFLICT (org_id, integration_type)
      DO UPDATE SET
        config = ${JSON.stringify(config)}::jsonb,
        tenant_id = ${tenantId},
        enabled = true,
        test_status = 'success',
        updated_at = NOW()
    `;

    console.log("[Salesforce Callback] Successfully connected for tenant:", tenantId, "user:", userEmail, "Instance:", tokenData.instance_url);

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      `${baseUrl}?integration=salesforce&success=true`
    );
  } catch (error) {
    console.error("[Salesforce Callback] Error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}?integration=salesforce&error=unknown`
    );
  }
}
