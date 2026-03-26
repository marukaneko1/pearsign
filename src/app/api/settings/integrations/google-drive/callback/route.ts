/**
 * Google Drive OAuth Callback
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
 * GET /api/settings/integrations/google-drive/callback
 * Handle Google OAuth callback and exchange code for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Extract tenant ID from state parameter, or try to get from session
    let tenantId = DEMO_TENANT_ID;

    // First, try to get tenant from state (passed during OAuth initiation)
    if (state) {
      try {
        // State can be JSON with tenant info
        const stateData = JSON.parse(decodeURIComponent(state));
        if (stateData.tenantId) {
          tenantId = stateData.tenantId;
        }
      } catch {
        // State might just be the tenant ID directly
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

    console.log("[Google Drive Callback] Processing for tenant:", tenantId);

    if (error) {
      console.error("[Google Drive Callback] OAuth error:", error);
      return NextResponse.redirect(
        `${baseUrl}?integration=google-drive&error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}?integration=google-drive&error=no_code`
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/settings/integrations/google-drive/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${baseUrl}?integration=google-drive&error=not_configured`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("[Google Drive Callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}?integration=google-drive&error=token_exchange_failed`
      );
    }

    // Get user info
    let userEmail = "";
    try {
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json();
      userEmail = userData.email || "";
    } catch (e) {
      console.error("[Google Drive Callback] Failed to get user info:", e);
    }

    // Store the tokens in the integration_configs table for this tenant
    const config = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      userEmail,
      folderId: "", // User can set this later
      autoSave: "true",
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
        'google-drive',
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

    console.log("[Google Drive Callback] Successfully connected for tenant:", tenantId, "user:", userEmail);

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      `${baseUrl}?integration=google-drive&success=true`
    );
  } catch (error) {
    console.error("[Google Drive Callback] Error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}?integration=google-drive&error=unknown`
    );
  }
}
