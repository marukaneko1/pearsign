/**
 * Audit Trail PDF Download API
 * Generates and serves the audit trail as a PDF document
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateAuditTrailPDF } from "@/lib/signed-pdf-generator";

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

    // Get the signing session
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

    if (session.status !== 'completed') {
      return NextResponse.json(
        { error: "Document has not been signed yet" },
        { status: 400 }
      );
    }

    // Get the document info
    const documents = await sql`
      SELECT title, created_at, signature_fields FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;

    const doc = documents[0];
    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Build audit events
    const events: Array<{ action: string; timestamp: string; actor: string; details: string }> = [];

    // Created event
    events.push({
      action: 'created',
      timestamp: new Date(doc.created_at).toISOString(),
      actor: 'Sender',
      details: 'Document created',
    });

    // Sent event
    events.push({
      action: 'sent',
      timestamp: new Date(session.created_at).toISOString(),
      actor: 'System',
      details: `Sent to ${session.recipient_email}`,
    });

    // Viewed event
    if (session.viewed_at) {
      events.push({
        action: 'viewed',
        timestamp: new Date(session.viewed_at).toISOString(),
        actor: session.recipient_name,
        details: 'Document opened',
      });
    }

    // Signed event
    events.push({
      action: 'signed',
      timestamp: new Date(session.signed_at).toISOString(),
      actor: session.recipient_name,
      details: 'Electronically signed',
    });

    // Completed event
    events.push({
      action: 'completed',
      timestamp: new Date(session.signed_at).toISOString(),
      actor: 'System',
      details: 'All signatures collected',
    });

    // Build fields summary
    const fieldsSummary: Array<{ name: string; type: string; value: string }> = [];
    const fieldValues = session.field_values || {};
    const docFields = doc.signature_fields || [];

    for (const [fieldId, value] of Object.entries(fieldValues)) {
      const fieldDef = docFields.find((f: { id: string }) => f.id === fieldId);
      if (fieldDef) {
        let displayValue = value as string;
        if (fieldDef.type === 'signature' || fieldDef.type === 'initials') {
          displayValue = '[Signed]';
        }
        fieldsSummary.push({
          name: fieldDef.type.charAt(0).toUpperCase() + fieldDef.type.slice(1),
          type: fieldDef.type,
          value: displayValue,
        });
      }
    }

    // Generate the audit trail PDF
    const auditPdfBytes = await generateAuditTrailPDF({
      documentTitle: doc.title,
      documentId: tokenData.envelopeId.slice(0, 20).toUpperCase(),
      envelopeId: tokenData.envelopeId,
      signerName: session.recipient_name,
      signerEmail: session.recipient_email,
      signedAt: new Date(session.signed_at),
      viewedAt: session.viewed_at ? new Date(session.viewed_at) : undefined,
      createdAt: new Date(doc.created_at),
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      events,
      fieldsSummary,
    });

    // Return the PDF
    const filename = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}_audit_trail.pdf`;

    return new NextResponse(auditPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': auditPdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("[Audit Trail PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate audit trail PDF" },
      { status: 500 }
    );
  }
}
