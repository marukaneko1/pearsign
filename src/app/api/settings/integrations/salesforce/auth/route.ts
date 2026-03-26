import { NextResponse } from "next/server";

/**
 * GET /api/settings/integrations/salesforce/auth
 * Generate Salesforce OAuth authorization URL
 */
export async function GET() {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/settings/integrations/salesforce/callback`;

    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "Salesforce OAuth not configured",
          message: "Please set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET environment variables"
        },
        { status: 400 }
      );
    }

    // Salesforce OAuth scopes
    // - api: Access and manage your data
    // - refresh_token: Perform requests at any time (offline access)
    // - openid: Access your identity
    const scopes = ["api", "refresh_token", "openid", "profile", "email"].join(" ");

    const state = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      returnUrl: "/integrations",
    })).toString("base64");

    // Use login.salesforce.com for production, test.salesforce.com for sandbox
    const salesforceLoginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

    const authUrl = new URL(`${salesforceLoginUrl}/services/oauth2/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
    });
  } catch (error) {
    console.error("[Salesforce Auth] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
