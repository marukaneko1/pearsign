/**
 * Self-Sign Document API
 * Get, download, or delete a specific self-signed document
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { getCurrentTenantId } from "@/lib/tenant-session";
import { TenantObjectStorage } from "@/lib/object-storage";

// GET - Get a specific self-signed document
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: "Document ID is required" },
          { status: 400 }
        );
      }

      const { id } = params;
      const sessionTenantId = await getCurrentTenantId();
      const effectiveTenantId = sessionTenantId || tenantId;

      const { searchParams } = new URL(request.url);
      const download = searchParams.get('download') === 'true';

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
          status,
          ${download ? sql`pdf_data` : sql`NULL as pdf_data`},
          pdf_object_path
        FROM self_signed_documents
        WHERE id = ${id} AND org_id = ${effectiveTenantId}
      `;

      if (documents.length === 0) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 }
        );
      }

      const doc = documents[0] as {
        id: string;
        title: string;
        signed_filename: string;
        pdf_data: string | null;
        pdf_object_path: string | null;
      };

      if (download && (doc.pdf_data || doc.pdf_object_path)) {
        let pdfBuffer: Buffer;

        if (doc.pdf_object_path) {
          const { data } = await TenantObjectStorage.downloadBuffer(doc.pdf_object_path);
          pdfBuffer = data;
        } else {
          pdfBuffer = Buffer.from(doc.pdf_data!, 'base64');
        }

        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${doc.signed_filename}"`,
            'Content-Length': pdfBuffer.length.toString(),
          },
        });
      }

      const { pdf_data, pdf_object_path, ...metadata } = doc;
      return NextResponse.json({
        success: true,
        document: metadata
      });
    } catch (error) {
      console.error("[Self-Sign API] Error fetching document:", error);
      return NextResponse.json(
        { error: "Failed to fetch document" },
        { status: 500 }
      );
    }
  }
);

// DELETE - Delete a self-signed document
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: "Document ID is required" },
          { status: 400 }
        );
      }

      const { id } = params;
      const sessionTenantId = await getCurrentTenantId();
      const effectiveTenantId = sessionTenantId || tenantId;

      const docs = await sql`
        SELECT pdf_object_path FROM self_signed_documents
        WHERE id = ${id} AND org_id = ${effectiveTenantId}
      `;

      if (docs.length === 0) {
        return NextResponse.json(
          { error: "Document not found or already deleted" },
          { status: 404 }
        );
      }

      if (docs[0].pdf_object_path) {
        try {
          await TenantObjectStorage.deleteObject(effectiveTenantId, docs[0].pdf_object_path as string);
        } catch (err) {
          console.warn("[Self-Sign API] Failed to delete from Object Storage:", err);
        }
      }

      await sql`
        DELETE FROM self_signed_documents
        WHERE id = ${id} AND org_id = ${effectiveTenantId}
      `;

      return NextResponse.json({
        success: true,
        message: "Document deleted successfully"
      });
    } catch (error) {
      console.error("[Self-Sign API] Error deleting document:", error);
      return NextResponse.json(
        { error: "Failed to delete document" },
        { status: 500 }
      );
    }
  }
);
