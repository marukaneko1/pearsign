import { sql } from "@/lib/db";

interface GoogleDriveConfig {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userEmail: string;
  folderId?: string;
  autoSave?: string;
}

/**
 * Refresh Google Drive access token if needed
 */
async function refreshTokenIfNeeded(config: GoogleDriveConfig, tenantId: string): Promise<string> {
  if (config.expiresAt > Date.now() + 300000) {
    return config.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !config.refreshToken) {
    throw new Error("Cannot refresh token: missing credentials");
  }

  if (process.env.NODE_ENV !== 'production') console.log("[Google Drive] Refreshing access token...");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[Google Drive] Token refresh failed:", data);
    throw new Error("Failed to refresh access token");
  }

  const newConfig = {
    ...config,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  await sql`
    UPDATE integration_configs
    SET config = ${JSON.stringify(newConfig)}::jsonb, updated_at = NOW()
    WHERE org_id = ${tenantId} AND integration_type = 'google-drive'
  `;

  return data.access_token;
}

/**
 * Get Google Drive config from database
 */
async function getGoogleDriveConfig(tenantId: string): Promise<GoogleDriveConfig | null> {
  try {
    const result = await sql`
      SELECT config, enabled FROM integration_configs
      WHERE org_id = ${tenantId} AND integration_type = 'google-drive' AND enabled = true
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].config as GoogleDriveConfig;
  } catch {
    return null;
  }
}

/**
 * Upload a file to Google Drive
 */
export async function uploadToGoogleDrive(
  fileName: string,
  fileContent: string,
  mimeType: string = "application/pdf",
  tenantId: string
): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  try {
    const config = await getGoogleDriveConfig(tenantId);
    if (!config) {
      return { success: false, error: "Google Drive not connected" };
    }

    const accessToken = await refreshTokenIfNeeded(config, tenantId);

    const boundary = "-------314159265358979323846";
    const metadata = {
      name: fileName,
      mimeType,
      ...(config.folderId && { parents: [config.folderId] }),
    };

    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "Content-Transfer-Encoding: base64",
      "",
      fileContent,
      `--${boundary}--`,
    ].join("\r\n");

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[Google Drive] Upload failed:", data);
      return { success: false, error: data.error?.message || "Upload failed" };
    }

    if (process.env.NODE_ENV !== 'production') console.log("[Google Drive] File uploaded:", data.name, data.id);

    return {
      success: true,
      fileId: data.id,
      webViewLink: data.webViewLink,
    };
  } catch (error) {
    console.error("[Google Drive] Upload error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if Google Drive auto-save is enabled
 */
export async function isGoogleDriveAutoSaveEnabled(tenantId: string): Promise<boolean> {
  const config = await getGoogleDriveConfig(tenantId);
  return config?.autoSave === "true";
}

/**
 * Save a signed document to Google Drive (if auto-save is enabled)
 */
export async function saveSignedDocumentToDrive(
  documentTitle: string,
  pdfBase64: string,
  signerName: string,
  tenantId: string
): Promise<void> {
  try {
    const isEnabled = await isGoogleDriveAutoSaveEnabled(tenantId);
    if (!isEnabled) {
      return;
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const fileName = `${documentTitle} - Signed by ${signerName} - ${timestamp}.pdf`;

    const result = await uploadToGoogleDrive(fileName, pdfBase64, "application/pdf", tenantId);

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log("[Google Drive] Auto-saved document:", fileName);
    } else {
      console.error("[Google Drive] Auto-save failed:", result.error);
    }
  } catch (error) {
    console.error("[Google Drive] Auto-save error:", error);
  }
}

/**
 * List folders in Google Drive (for folder picker)
 */
export async function listGoogleDriveFolders(tenantId: string): Promise<{ id: string; name: string }[]> {
  try {
    const config = await getGoogleDriveConfig(tenantId);
    if (!config) {
      return [];
    }

    const accessToken = await refreshTokenIfNeeded(config, tenantId);

    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&orderBy=name",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[Google Drive] List folders failed:", data);
      return [];
    }

    return data.files || [];
  } catch (error) {
    console.error("[Google Drive] List folders error:", error);
    return [];
  }
}
