import { NextRequest, NextResponse } from "next/server";
import { listGoogleDriveFolders } from "@/lib/google-drive-service";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * GET /api/settings/integrations/google-drive/folders
 * List available Google Drive folders for the folder picker
 */
export const GET = withTenant(async (_request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const folders = await listGoogleDriveFolders(tenantId);

    return NextResponse.json({
      success: true,
      folders,
    });
  } catch (error) {
    console.error("[Google Drive Folders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list folders" },
      { status: 500 }
    );
  }
});
