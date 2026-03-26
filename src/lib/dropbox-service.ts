import { sql, DEFAULT_ORG_ID } from "@/lib/db";

interface DropboxConfig {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  userEmail: string;
  displayName: string;
  folderPath?: string;
  autoSave?: string;
}

/**
 * Refresh Dropbox access token if needed
 */
async function refreshTokenIfNeeded(config: DropboxConfig): Promise<string> {
  // Dropbox tokens are long-lived, but we can implement refresh if needed
  if (!config.refreshToken) {
    return config.accessToken;
  }

  const clientId = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return config.accessToken;
  }

  try {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      console.log("[Dropbox] Token refresh failed, using existing token");
      return config.accessToken;
    }

    const data = await response.json();

    // Update stored config with new token
    const newConfig = {
      ...config,
      accessToken: data.access_token,
    };

    await sql`
      UPDATE integration_configs
      SET config = ${JSON.stringify(newConfig)}::jsonb, updated_at = NOW()
      WHERE org_id = ${DEFAULT_ORG_ID} AND integration_type = 'dropbox'
    `;

    return data.access_token;
  } catch (error) {
    console.error("[Dropbox] Token refresh error:", error);
    return config.accessToken;
  }
}

/**
 * Get Dropbox config from database
 */
async function getDropboxConfig(): Promise<DropboxConfig | null> {
  try {
    const result = await sql`
      SELECT config, enabled FROM integration_configs
      WHERE org_id = ${DEFAULT_ORG_ID} AND integration_type = 'dropbox' AND enabled = true
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].config as DropboxConfig;
  } catch {
    return null;
  }
}

/**
 * Ensure folder exists in Dropbox
 */
async function ensureFolderExists(accessToken: string, folderPath: string): Promise<void> {
  try {
    await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false,
      }),
    });
    // Ignore errors - folder might already exist
  } catch {
    // Folder might already exist, which is fine
  }
}

/**
 * Upload a file to Dropbox
 */
export async function uploadToDropbox(
  fileName: string,
  fileContent: string, // Base64 encoded
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const config = await getDropboxConfig();
    if (!config) {
      return { success: false, error: "Dropbox not connected" };
    }

    const accessToken = await refreshTokenIfNeeded(config);
    const folderPath = config.folderPath || "/PearSign/Signed Documents";

    // Ensure folder exists
    await ensureFolderExists(accessToken, folderPath);

    // Decode base64 content
    const binaryContent = Buffer.from(fileContent, "base64");
    const filePath = `${folderPath}/${fileName}`;

    // Upload file
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: filePath,
          mode: "add",
          autorename: true,
          mute: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: binaryContent,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Dropbox] Upload failed:", data);
      return { success: false, error: data.error_summary || "Upload failed" };
    }

    console.log("[Dropbox] File uploaded:", data.path_display);

    return {
      success: true,
      path: data.path_display,
    };
  } catch (error) {
    console.error("[Dropbox] Upload error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if Dropbox auto-save is enabled
 */
export async function isDropboxAutoSaveEnabled(): Promise<boolean> {
  const config = await getDropboxConfig();
  return config?.autoSave === "true";
}

/**
 * Save a signed document to Dropbox (if auto-save is enabled)
 */
export async function saveSignedDocumentToDropbox(
  documentTitle: string,
  pdfBase64: string,
  signerName: string
): Promise<void> {
  try {
    const isEnabled = await isDropboxAutoSaveEnabled();
    if (!isEnabled) {
      return;
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const fileName = `${documentTitle} - Signed by ${signerName} - ${timestamp}.pdf`;

    const result = await uploadToDropbox(fileName, pdfBase64);

    if (result.success) {
      console.log("[Dropbox] Auto-saved document:", result.path);
    } else {
      console.error("[Dropbox] Auto-save failed:", result.error);
    }
  } catch (error) {
    console.error("[Dropbox] Auto-save error:", error);
  }
}
