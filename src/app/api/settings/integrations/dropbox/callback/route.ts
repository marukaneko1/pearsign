/**
 * Dropbox OAuth Callback
 *
 * Multi-tenancy: Tenant ID is extracted from the OAuth state parameter
 * The state should be passed when initiating the OAuth flow
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getTenantSessionContext } from "@/lib/tenant-session";

/**
 * GET /api/settings/integrations/dropbox/callback
 * Handle Dropbox OAuth callback and exchange code for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    let tenantId: string | null = null;

    // First, try to get tenant from state (passed during OAuth initiation)
    if (state) {
      try {
        const decoded = Buffer.from(state, 'base64').toString();
        const parsed = JSON.parse(decoded);
        tenantId = parsed.tenantId || null;
      } catch {
        try {
          const parsed = JSON.parse(decodeURIComponent(state));
          tenantId = parsed.tenantId || null;
        } catch {
          tenantId = state;
        }
      }
    }

    // Fall back to session if available
    if (!tenantId) {
      try {
        const sessionContext = await getTenantSessionContext();
        if (sessionContext && sessionContext.isValid) {
          tenantId = sessionContext.session.tenantId;
        }
      } catch {
        // No session available
      }
    }

    if (!tenantId) {
      return NextResponse.redirect(
        `${baseUrl}?integration=dropbox&error=missing_tenant`
      );
    }

    if (process.env.NODE_ENV !== 'production') console.log("[Dropbox Callback] Processing for tenant:", tenantId);

    if (error) {
      console.error("[Dropbox Callback] OAuth error:", error);
      return NextResponse.redirect(
        `${baseUrl}?integration=dropbox&error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}?integration=dropbox&error=no_code`
      );
    }

    const clientId = process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/settings/integrations/dropbox/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${baseUrl}?integration=dropbox&error=not_configured`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("[Dropbox Callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}?integration=dropbox&error=token_exchange_failed`
      );
    }

    // Get user info
    let userEmail = "";
    let displayName = "";
    try {
      const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: "null",
      });
      const userData = await userResponse.json();
      userEmail = userData.email || "";
      displayName = userData.name?.display_name || "";
    } catch (e) {
      console.error("[Dropbox Callback] Failed to get user info:", e);
    }

    // Store the tokens in the integration_configs table for this tenant
    const config = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      userEmail,
      displayName,
      folderPath: "/PearSign/Signed Documents",
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
        'dropbox',
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

    if (process.env.NODE_ENV !== 'production') console.log("[Dropbox Callback] Successfully connected for tenant:", tenantId, "user:", userEmail);

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      `${baseUrl}?integration=dropbox&success=true`
    );
  } catch (error) {
    console.error("[Dropbox Callback] Error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}?integration=dropbox&error=unknown`
    );
  }
}
