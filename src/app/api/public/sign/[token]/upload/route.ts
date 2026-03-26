/**
 * Document Upload API for Signing Flow
 * Allows signers to upload supporting documents during the signing process
 * Uploaded files are stored and attached to the completion email
 *
 * Multi-tenancy: Tenant ID is extracted from the signing session.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { TenantObjectStorage } from "@/lib/object-storage";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse the signing token to extract envelope ID
function parseSigningToken(token: string): { envelopeId: string; tokenPart: string } | null {
  const parts = token.split('_');
  if (parts.length < 2) return null;
  return {
    envelopeId: parts[0],
    tokenPart: parts.slice(1).join('_'),
  };
}

// Ensure the signer_uploaded_documents table exists
async function ensureUploadsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS signer_uploaded_documents (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      envelope_id TEXT NOT NULL,
      signer_id TEXT,
      file_name TEXT NOT NULL,
      file_data TEXT,
      file_object_path TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  try {
    await sql`ALTER TABLE signer_uploaded_documents ALTER COLUMN file_data DROP NOT NULL`;
    await sql`ALTER TABLE signer_uploaded_documents ADD COLUMN IF NOT EXISTS file_object_path TEXT`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_signer_uploads_envelope
      ON signer_uploaded_documents(envelope_id)
    `;
  } catch {
  }
}

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx'];

// POST - Upload a file
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 400 }
      );
    }

    // Verify the signing session exists and is not completed - includes org_id
    const sessions = await sql`
      SELECT * FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    // Extract tenant ID from session
    const tenantId = session.org_id;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenant context' },
        { status: 400 }
      );
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: "Cannot upload files after signing is completed" },
        { status: 400 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fieldId = formData.get('fieldId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!fieldId) {
      return NextResponse.json(
        { error: "Field ID is required" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        { error: "File type not allowed. Allowed types: PDF, JPG, PNG, GIF, WebP, DOC, DOCX" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let fileObjectPath: string | null = null;
    let fileBase64: string | null = null;

    try {
      const storageResult = await TenantObjectStorage.uploadBuffer(
        tenantId,
        file.name,
        buffer,
        file.type || 'application/octet-stream',
        'signer-uploads'
      );
      fileObjectPath = storageResult.objectPath;
      console.log("[Signer Upload] Stored in Object Storage:", fileObjectPath);
    } catch (storageErr) {
      console.warn("[Signer Upload] Object Storage failed, falling back to DB:", storageErr);
      fileBase64 = buffer.toString('base64');
    }

    await ensureUploadsTable();

    const result = await sql`
      INSERT INTO signer_uploaded_documents (
        envelope_id, signer_id, file_name, file_data, file_object_path
      ) VALUES (
        ${tokenData.envelopeId},
        ${token},
        ${file.name},
        ${fileBase64},
        ${fileObjectPath}
      )
      RETURNING id, file_name, uploaded_at
    `;

    const uploadedFile = result[0];

    return NextResponse.json({
      success: true,
      file: {
        id: uploadedFile.id,
        fileName: uploadedFile.file_name,
        createdAt: uploadedFile.uploaded_at,
      },
    });
  } catch (error) {
    console.error("[Upload API] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

// GET - List uploaded files for a signing session
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 400 }
      );
    }

    await ensureUploadsTable();

    const uploads = await sql`
      SELECT id, file_name, uploaded_at
      FROM signer_uploaded_documents
      WHERE envelope_id = ${tokenData.envelopeId}
      ORDER BY uploaded_at ASC
    `;

    return NextResponse.json({
      success: true,
      files: uploads.map((u) => ({
        id: u.id,
        fileName: u.file_name,
        createdAt: u.uploaded_at,
      })),
    });
  } catch (error) {
    console.error("[Upload API] Error fetching uploads:", error);
    return NextResponse.json(
      { error: "Failed to fetch uploads", files: [] },
      { status: 500 }
    );
  }
}

// DELETE - Remove an uploaded file
export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 }
      );
    }

    const tokenData = parseSigningToken(token);
    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 400 }
      );
    }

    // Verify the signing session is not completed
    const sessions = await sql`
      SELECT status FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (sessions.length > 0 && sessions[0].status === 'completed') {
      return NextResponse.json(
        { error: "Cannot delete files after signing is completed" },
        { status: 400 }
      );
    }

    await ensureUploadsTable();

    // Delete the file (only if it belongs to this signing session)
    const result = await sql`
      DELETE FROM signer_uploaded_documents
      WHERE id = ${fileId}::uuid AND signing_token = ${token}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "File not found or already deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("[Upload API] Error deleting file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
