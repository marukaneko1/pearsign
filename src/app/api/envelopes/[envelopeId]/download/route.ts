/**
 * Envelope Download API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Download the signed PDF for a completed envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { TenantObjectStorage } from "@/lib/object-storage";

/**
 * GET /api/envelopes/[envelopeId]/download
 * Download the signed or original PDF for an envelope
 */
export const GET = withTenant<{ envelopeId: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { envelopeId: string }
  ) => {
    try {
      if (!params?.envelopeId) {
        return NextResponse.json(
          { error: "Envelope ID is required" },
          { status: 400 }
        );
      }

      const { envelopeId } = params;

      if (process.env.NODE_ENV !== 'production') console.log('[Envelope Download] Fetching signed PDF for:', envelopeId, 'Tenant:', tenantId);

      const sessions = await sql`
        SELECT signed_pdf_data, signed_pdf_object_path, recipient_name
        FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId}
          AND org_id = ${tenantId}
          AND status = 'completed'
          AND (signed_pdf_data IS NOT NULL OR signed_pdf_object_path IS NOT NULL)
        ORDER BY signed_at DESC
        LIMIT 1
      `;

      if (sessions.length > 0) {
        const session = sessions[0];
        if (process.env.NODE_ENV !== 'production') console.log('[Envelope Download] Found signed PDF');

        const docs = await sql`
          SELECT title FROM envelope_documents WHERE envelope_id = ${envelopeId}
        `;
        const title = docs.length > 0 ? docs[0].title : 'document';

        let pdfBuffer: Buffer;

        if (session.signed_pdf_object_path) {
          const { data } = await TenantObjectStorage.downloadBuffer(session.signed_pdf_object_path as string);
          pdfBuffer = data;
        } else {
          let base64Data = session.signed_pdf_data as string;
          if (base64Data.startsWith('data:')) {
            base64Data = base64Data.split(',')[1];
          }
          pdfBuffer = Buffer.from(base64Data, 'base64');
        }

        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${(title as string).replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf"`,
            'Cache-Control': 'private, max-age=0',
          },
        });
      }

      const documents = await sql`
        SELECT pdf_data, pdf_object_path, title FROM envelope_documents
        WHERE envelope_id = ${envelopeId}
      `;

      if (documents.length === 0 || (!documents[0].pdf_data && !documents[0].pdf_object_path)) {
        if (process.env.NODE_ENV !== 'production') console.log('[Envelope Download] No document found');
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 }
        );
      }

      const doc = documents[0];
      if (process.env.NODE_ENV !== 'production') console.log('[Envelope Download] Returning original PDF');

      let pdfBuffer: Buffer;

      if (doc.pdf_object_path) {
        const { data } = await TenantObjectStorage.downloadBuffer(doc.pdf_object_path as string);
        pdfBuffer = data;
      } else {
        let base64Data = doc.pdf_data as string;
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }
        pdfBuffer = Buffer.from(base64Data, 'base64');
      }

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${(doc.title as string).replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
          'Cache-Control': 'private, max-age=0',
        },
      });
    } catch (error) {
      console.error("[Envelope Download] Error:", error);
      return NextResponse.json(
        { error: "Failed to download document" },
        { status: 500 }
      );
    }
  }
);
