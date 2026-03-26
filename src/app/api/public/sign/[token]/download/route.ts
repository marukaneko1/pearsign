/**
 * Download Signed PDF API
 * Generates and serves the signed PDF with all signatures overlaid
 *
 * Multi-tenancy: Tenant ID is extracted from the signing session.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateSignedPDF } from "@/lib/signed-pdf-generator";

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

    // Get the signing session - includes org_id (tenant ID)
    const sessions = await sql`
      SELECT * FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    const session = sessions[0];
    if (!session) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    // Extract tenant ID from session
    const tenantId = session.org_id;

    if (session.status !== 'completed') {
      return NextResponse.json(
        { error: "Document has not been signed yet" },
        { status: 400 }
      );
    }

    // Get the document
    const documents = await sql`
      SELECT * FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const doc = documents[0];

    // Fetch compliance settings using tenant ID
    let includeAuditOnDocument = true;
    try {
      if (tenantId) {
        const complianceSettings = await sql`
          SELECT
            COALESCE(audit_trail_enabled, true) as audit_enabled,
            COALESCE(audit_trail_mode, 'attached') as audit_mode
          FROM compliance_settings
          WHERE organization_id = ${tenantId}
        `;
        if (complianceSettings.length > 0) {
          const auditEnabled = complianceSettings[0].audit_enabled === true;
          // If audit is disabled or mode is 'separate', don't include full audit on document
          if (!auditEnabled) {
            includeAuditOnDocument = false;
          } else {
            includeAuditOnDocument = complianceSettings[0].audit_mode === 'attached';
          }
          console.log('[Download] Compliance settings:', {
            auditEnabled,
            auditMode: complianceSettings[0].audit_mode,
            includeAuditOnDocument
          });
        }
      }
    } catch (err) {
      console.log('[Download] Could not fetch compliance settings, using defaults');
    }

    // Generate the signed PDF with PKI digital signature
    const signedPdfBytes = await generateSignedPDF({
      originalPdfBase64: doc.pdf_data,
      signatureFields: doc.signature_fields || [],
      fieldValues: session.field_values || {},
      signerName: session.recipient_name,
      signerEmail: session.recipient_email,
      signedAt: new Date(session.signed_at),
      ipAddress: session.ip_address,
      documentId: tokenData.envelopeId,
      documentTitle: doc.title,
      includeAuditOnDocument,
      // Enable PKI digital signature for Adobe Acrobat recognition
      orgId: tenantId,
      applyDigitalSignature: true,
      signatureReason: `Document "${doc.title}" electronically signed by ${session.recipient_name}`,
    });

    // Return the PDF
    const filename = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;

    return new NextResponse(signedPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': signedPdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("[Download Signed PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate signed PDF" },
      { status: 500 }
    );
  }
}
