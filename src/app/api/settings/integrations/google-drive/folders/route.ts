import { NextResponse } from "next/server";
import { listGoogleDriveFolders } from "@/lib/google-drive-service";

/**
 * GET /api/settings/integrations/google-drive/folders
 * List available Google Drive folders for the folder picker
 */
export async function GET() {
  try {
    const folders = await listGoogleDriveFolders();

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
}
