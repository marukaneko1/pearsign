/**
 * Self-Sign API
 * Save self-signed documents to the database
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { getCurrentTenantId, getTenantSession } from "@/lib/tenant-session";
import { TenantObjectStorage } from "@/lib/object-storage";
import { signPdfDocument } from "@/lib/pdf-digital-signature";

export const maxDuration = 60;

// GET - List self-signed documents for the tenant
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const sessionTenantId = await getCurrentTenantId();
    const effectiveTenantId = sessionTenantId || tenantId;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const documents = await sql`
      SELECT
        id,
        title,
        original_filename,
        signed_filename,
        file_size,
        page_count,
        signer_name,
        signature_style,
        signed_at,
        created_at,
        status
      FROM self_signed_documents
      WHERE org_id = ${effectiveTenantId}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json({
      success: true,
      documents,
      pagination: { limit, offset }
    });
  } catch (error) {
    console.error("[Self-Sign API] Error fetching documents:", error);
    return NextResponse.json({
      success: true,
      documents: [],
      pagination: { limit: 50, offset: 0 }
    });
  }
});

// POST - Save a new self-signed document
export const POST = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const session = await getTenantSession();
    const sessionTenantId = await getCurrentTenantId();
    const effectiveTenantId = sessionTenantId || tenantId;

    const body = await request.json();
    const {
      title,
      originalFilename,
      signedFilename,
      fileSize,
      pageCount,
      signerName,
      signatureStyle,
      fieldsCount,
      pdfBase64, // The signed PDF as base64
      fields // Array of field positions for audit
    } = body;

    if (!title || !originalFilename || !pdfBase64) {
      return NextResponse.json(
        { error: "Missing required fields: title, originalFilename, pdfBase64" },
        { status: 400 }
      );
    }

    const docId = `selfsign_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let b64 = pdfBase64;
    if (b64.startsWith('data:')) {
      b64 = b64.split(',')[1];
    }
    let pdfBuffer = Buffer.from(b64, 'base64');

    let certificateUsed: { fingerprint: string; subject: string; validTo: Date } | null = null;
    let certificateError: string | null = null;

    try {
      console.log("[Self-Sign API] Attempting digital signature...");
      console.log("[Self-Sign API] PDF buffer size:", pdfBuffer.length, "bytes");
      const pdfBytesArr = new Uint8Array(pdfBuffer);
      const result = await signPdfDocument({
        pdfBytes: pdfBytesArr,
        orgId: effectiveTenantId,
        signerName: signerName || 'Self',
        signerEmail: session?.userEmail || '',
        signedAt: new Date(),
        reason: `Self-signed by ${signerName || 'Self'}`,
      });
      pdfBuffer = Buffer.from(result.signedPdfBytes);
      certificateUsed = result.certificateInfo;
      console.log("[Self-Sign API] Digital signature applied successfully!");
      console.log("[Self-Sign API] Certificate:", certificateUsed.subject);
      console.log("[Self-Sign API] Signed PDF size:", pdfBuffer.length, "bytes");
    } catch (certErr) {
      const errMsg = certErr instanceof Error ? certErr.message : String(certErr);
      console.error("[Self-Sign API] Digital signature FAILED:", errMsg);
      if (certErr instanceof Error) console.error("[Self-Sign API] Stack:", certErr.stack);
      certificateError = errMsg;
    }

    let pdfObjectPath: string | null = null;
    let pdfDataForDb: string | null = pdfBuffer.toString('base64');

    try {
      const storageResult = await TenantObjectStorage.uploadBuffer(
        effectiveTenantId,
        `${docId}.pdf`,
        pdfBuffer,
        'application/pdf',
        'self-signed'
      );
      pdfObjectPath = storageResult.objectPath;
      pdfDataForDb = null;
      console.log("[Self-Sign API] PDF stored in Object Storage:", pdfObjectPath);
    } catch (storageErr) {
      console.warn("[Self-Sign API] Object Storage failed, storing in DB:", storageErr);
    }

    const result = await sql`
      INSERT INTO self_signed_documents (
        id,
        organization_id,
        user_id,
        title,
        file_url,
        file_data,
        pdf_object_path,
        signed_at,
        created_at,
        status
      ) VALUES (
        ${docId},
        ${effectiveTenantId},
        ${session?.userId || 'unknown'},
        ${title || originalFilename || 'Untitled'},
        ${signedFilename || originalFilename?.replace('.pdf', '_signed.pdf') || `${docId}_signed.pdf`},
        ${pdfDataForDb},
        ${pdfObjectPath},
        NOW(),
        NOW(),
        'completed'
      )
      RETURNING id, title, file_url as signed_filename, signed_at, created_at
    `;

    console.log("[Self-Sign API] Document saved:", docId);

    const signedPdfBase64 = certificateUsed ? pdfBuffer.toString('base64') : null;

    return NextResponse.json({
      success: true,
      document: result[0],
      message: "Document signed and saved successfully",
      certificateApplied: !!certificateUsed,
      certificateInfo: certificateUsed ? {
        subject: certificateUsed.subject,
        fingerprint: certificateUsed.fingerprint,
      } : null,
      certificateError: certificateError || undefined,
      signedPdfBase64,
    });
  } catch (error) {
    console.error("[Self-Sign API] Error saving document:", error);

    // If table doesn't exist, return success but with warning
    if (error instanceof Error && error.message.includes('does not exist')) {
      return NextResponse.json({
        success: true,
        document: null,
        message: "Document signed (database storage not configured)",
        warning: "self_signed_documents table not found"
      });
    }

    return NextResponse.json(
      { error: "Failed to save document", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});
