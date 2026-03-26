import { NextResponse } from "next/server";

/**
 * GET /api/settings/integrations/google-drive/auth
 * Generate Google OAuth authorization URL
 */
export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/settings/integrations/google-drive/callback`;

    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "Google OAuth not configured",
          message: "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables"
        },
        { status: 400 }
      );
    }

    // Build the Google OAuth URL
    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ");

    const state = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      returnUrl: "/integrations",
    })).toString("base64");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
    });
  } catch (error) {
    console.error("[Google Drive Auth] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
