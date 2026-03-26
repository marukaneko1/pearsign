/**
 * Public Document API
 * Serves the actual PDF document for signing
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { TenantObjectStorage } from "@/lib/object-storage";

interface RouteParams {
  params: Promise<{ envelopeId: string }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { envelopeId } = await context.params;

    if (process.env.NODE_ENV !== 'production') console.log('[DocumentAPI] Fetching document for envelope:', envelopeId);

    const documents = await sql`
      SELECT pdf_data, pdf_object_path, title FROM envelope_documents
      WHERE envelope_id = ${envelopeId}
    `;

    if (documents.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log('[DocumentAPI] No document found for envelope:', envelopeId);
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const doc = documents[0];

    if (!doc.pdf_data && !doc.pdf_object_path) {
      if (process.env.NODE_ENV !== 'production') console.log('[DocumentAPI] Document has no PDF data:', envelopeId);
      return NextResponse.json(
        { error: "No PDF data available" },
        { status: 404 }
      );
    }

    let pdfBuffer: Buffer;
    try {
      if (doc.pdf_object_path) {
        if (process.env.NODE_ENV !== 'production') console.log('[DocumentAPI] Loading PDF from Object Storage');
        const { data } = await TenantObjectStorage.downloadBuffer(doc.pdf_object_path as string);
        pdfBuffer = data;
      } else {
        let base64Data = doc.pdf_data as string;
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }
        pdfBuffer = Buffer.from(base64Data, 'base64');
      }
      if (process.env.NODE_ENV !== 'production') console.log('[DocumentAPI] PDF size:', pdfBuffer.length, 'bytes');
    } catch (decodeError) {
      console.error('[DocumentAPI] Failed to load PDF:', decodeError);
      return NextResponse.json(
        { error: "Invalid PDF data format" },
        { status: 500 }
      );
    }

    // Validate PDF header
    const header = pdfBuffer.slice(0, 5).toString();
    if (!header.startsWith('%PDF')) {
      console.error('[DocumentAPI] Invalid PDF header:', header);
      return NextResponse.json(
        { error: "Invalid PDF file" },
        { status: 500 }
      );
    }

    // Return the PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error("[DocumentAPI] Error serving document:", error);
    return NextResponse.json(
      { error: "Failed to load document" },
      { status: 500 }
    );
  }
}
