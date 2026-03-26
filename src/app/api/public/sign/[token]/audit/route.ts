/**
 * Signing Audit Trail API
 * Returns the complete audit trail for a signing session
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

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

interface AuditEvent {
  id: string;
  action: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  details: string;
  ipAddress: string | null;
  userAgent: string | null;
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

    // Get the document info
    const documents = await sql`
      SELECT title, created_at FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;

    const doc = documents[0];

    // Build the audit trail from session data
    const auditEvents: AuditEvent[] = [];

    // Document created event
    if (doc) {
      auditEvents.push({
        id: `event-created-${tokenData.envelopeId}`,
        action: 'created',
        timestamp: new Date(doc.created_at).toISOString(),
        actor: 'Sender',
        actorEmail: '',
        details: `Document "${doc.title}" was created and sent for signature`,
        ipAddress: null,
        userAgent: null,
      });
    }

    // Session created (sent) event
    auditEvents.push({
      id: `event-sent-${session.id}`,
      action: 'sent',
      timestamp: new Date(session.created_at).toISOString(),
      actor: 'System',
      actorEmail: '',
      details: `Signature request sent to ${session.recipient_email}`,
      ipAddress: null,
      userAgent: null,
    });

    // Viewed event
    if (session.viewed_at) {
      auditEvents.push({
        id: `event-viewed-${session.id}`,
        action: 'viewed',
        timestamp: new Date(session.viewed_at).toISOString(),
        actor: session.recipient_name,
        actorEmail: session.recipient_email,
        details: 'Document was viewed by the signer',
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
      });
    }

    // Signed event
    if (session.signed_at && session.status === 'completed') {
      auditEvents.push({
        id: `event-signed-${session.id}`,
        action: 'signed',
        timestamp: new Date(session.signed_at).toISOString(),
        actor: session.recipient_name,
        actorEmail: session.recipient_email,
        details: `Document electronically signed by ${session.recipient_name}`,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
      });

      // Completed event
      auditEvents.push({
        id: `event-completed-${session.id}`,
        action: 'completed',
        timestamp: new Date(session.signed_at).toISOString(),
        actor: 'System',
        actorEmail: '',
        details: 'All signatures collected. Document completed.',
        ipAddress: null,
        userAgent: null,
      });
    }

    // Sort by timestamp
    auditEvents.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Get field values summary for the response
    const fieldsSummary: Array<{ name: string; type: string; value: string }> = [];
    const fieldValues = session.field_values || {};

    for (const [fieldId, value] of Object.entries(fieldValues)) {
      // Find the field definition from the document
      const docFields = doc?.signature_fields || [];
      const fieldDef = docFields.find((f: { id: string }) => f.id === fieldId);

      if (fieldDef) {
        let displayValue = value as string;
        // For signature fields, just show that it was signed
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

    return NextResponse.json({
      documentTitle: doc?.title || 'Document',
      envelopeId: tokenData.envelopeId,
      signer: {
        name: session.recipient_name,
        email: session.recipient_email,
      },
      status: session.status,
      createdAt: session.created_at,
      viewedAt: session.viewed_at,
      signedAt: session.signed_at,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      events: auditEvents,
      fieldsSummary,
    });
  } catch (error) {
    console.error("[Audit Trail] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit trail" },
      { status: 500 }
    );
  }
}
