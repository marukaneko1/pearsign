/**
 * Decline Signing API
 * Allows a signer to decline to sign a document
 *
 * Multi-tenancy: Tenant ID is extracted from the signing session.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logEnvelopeEvent } from "@/lib/audit-log";
import { triggerWebhooks } from "@/lib/webhook-service";
import { sendDocumentDeclinedEmail } from "@/lib/email-service";
import { onEnvelopeDeclined } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse the signing token
function parseSigningToken(token: string): { envelopeId: string; tokenPart: string } | null {
  const parts = token.split('_');
  if (parts.length < 2) return null;
  return {
    envelopeId: parts[0],
    tokenPart: parts.slice(1).join('_'),
  };
}

/**
 * POST /api/public/sign/[token]/decline
 * Decline to sign a document
 */
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { reason } = body;

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

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "Signing session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    // Extract tenant ID from session
    const tenantId = session.org_id || 'org-1';

    if (session.status === "completed") {
      return NextResponse.json(
        { error: "Document has already been signed" },
        { status: 400 }
      );
    }

    if (session.status === "declined") {
      return NextResponse.json(
        { error: "Document has already been declined" },
        { status: 400 }
      );
    }

    // Get document title
    const documents = await sql`
      SELECT title FROM envelope_documents
      WHERE envelope_id = ${tokenData.envelopeId}
    `;
    const documentTitle = documents[0]?.title || "Document";

    // Update session status to declined
    await sql`
      UPDATE envelope_signing_sessions
      SET
        status = 'declined',
        field_values = ${JSON.stringify({ declineReason: reason || "No reason provided" })}::jsonb,
        signed_at = NOW()
      WHERE token = ${token}
    `;

    // Log the decline event - use tenant ID from session
    await logEnvelopeEvent('envelope.declined', {
      orgId: tenantId,
      envelopeId: tokenData.envelopeId,
      envelopeTitle: documentTitle,
      actorName: session.recipient_name,
      actorEmail: session.recipient_email,
      details: {
        reason: reason || "No reason provided",
        declinedAt: new Date().toISOString(),
      },
    });

    // Trigger webhooks
    try {
      await triggerWebhooks("document.declined", {
        envelopeId: tokenData.envelopeId,
        documentTitle,
        signerEmail: session.recipient_email,
        signerName: session.recipient_name,
        reason: reason || "No reason provided",
        declinedAt: new Date().toISOString(),
      });
    } catch (webhookErr) {
      console.error("[Decline] Error triggering webhooks:", webhookErr);
    }

    // Look up the sender (document owner) using multiple fallback methods
    // This matches the pattern used in the completion route
    let senderEmail = '';
    let senderName = 'Document Owner';
    let senderId = '';

    // Method 1: Try audit log first (who sent the envelope)
    try {
      const auditResult = await sql`
        SELECT actor_name, actor_email, actor_id
        FROM audit_logs
        WHERE action = 'envelope.sent'
          AND entity_id = ${tokenData.envelopeId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (auditResult.length > 0 && auditResult[0].actor_email) {
        senderName = auditResult[0].actor_name || 'Document Owner';
        senderEmail = auditResult[0].actor_email;
        senderId = auditResult[0].actor_id || '';
        console.log("[Decline] Found sender from audit log:", senderEmail);
      }
    } catch (auditErr) {
      console.log("[Decline] Audit log lookup failed:", auditErr);
    }

    // Method 2: Fallback to user_profiles for the tenant
    if (!senderEmail) {
      try {
        const profileResult = await sql`
          SELECT user_id, first_name, last_name, email
          FROM user_profiles
          WHERE organization_id = ${tenantId}
            AND email IS NOT NULL AND email != ''
          LIMIT 1
        `;
        if (profileResult.length > 0 && profileResult[0].email) {
          senderName = `${profileResult[0].first_name || ''} ${profileResult[0].last_name || ''}`.trim() || 'Document Owner';
          senderEmail = profileResult[0].email;
          senderId = profileResult[0].user_id || '';
          console.log("[Decline] Found sender from user_profiles:", senderEmail);
        }
      } catch (profileErr) {
        console.log("[Decline] Profile lookup failed:", profileErr);
      }
    }

    // Method 3: Fallback - try any profile in the system
    if (!senderEmail) {
      try {
        const anyProfile = await sql`
          SELECT user_id, first_name, last_name, email
          FROM user_profiles
          WHERE email IS NOT NULL AND email != ''
          LIMIT 1
        `;
        if (anyProfile.length > 0 && anyProfile[0].email) {
          senderName = `${anyProfile[0].first_name || ''} ${anyProfile[0].last_name || ''}`.trim() || 'Document Owner';
          senderEmail = anyProfile[0].email;
          senderId = anyProfile[0].user_id || '';
          console.log("[Decline] Found sender from any profile:", senderEmail);
        }
      } catch {
        console.log("[Decline] Any profile lookup failed");
      }
    }

    // Create in-app notification for the sender (for real-time bell update)
    // This triggers the SSE stream to notify the sender's UI
    try {
      if (senderId || senderEmail) {
        await onEnvelopeDeclined({
          orgId: tenantId,
          senderId: senderId || 'unknown',
          signerName: session.recipient_name,
          signerEmail: session.recipient_email,
          envelopeId: tokenData.envelopeId,
          envelopeTitle: documentTitle,
          reason: reason || "No reason provided",
        });
        console.log("[Decline] Created in-app notification for sender");
      }
    } catch (notifyErr) {
      console.error("[Decline] Error creating notification:", notifyErr);
      // Don't fail the request if notification fails
    }

    // Send notification email to sender about decline
    try {
      if (senderEmail) {
        const result = await sendDocumentDeclinedEmail({
          documentName: documentTitle,
          signerName: session.recipient_name,
          signerEmail: session.recipient_email,
          senderName,
          senderEmail,
          declineReason: reason || "No reason provided",
          declinedAt: new Date(),
          orgId: tenantId,
        });

        if (result.success) {
          console.log("[Decline] Email notification sent to sender:", senderEmail);
        } else {
          console.log("[Decline] Failed to send email notification:", result.error);
        }
      } else {
        console.log("[Decline] No sender email found, skipping email notification");
      }
    } catch (emailErr) {
      console.error("[Decline] Error sending email notification:", emailErr);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      message: "Document declined successfully",
    });
  } catch (error) {
    console.error("[Decline] Error:", error);
    return NextResponse.json(
      { error: "Failed to decline document" },
      { status: 500 }
    );
  }
}
