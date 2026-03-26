import { NextResponse } from "next/server";

/**
 * GET /api/settings/integrations/dropbox/auth
 * Generate Dropbox OAuth authorization URL
 */
export async function GET() {
  try {
    const clientId = process.env.DROPBOX_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/settings/integrations/dropbox/callback`;

    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "Dropbox OAuth not configured",
          message: "Please set DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET environment variables"
        },
        { status: 400 }
      );
    }

    // Build the Dropbox OAuth URL
    const state = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      returnUrl: "/integrations",
    })).toString("base64");

    const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("token_access_type", "offline");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
    });
  } catch (error) {
    console.error("[Dropbox Auth] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
