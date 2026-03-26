/**
 * Mark signing session as viewed
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendDocumentViewedNotification } from "@/lib/email-service";
import { logEnvelopeEvent } from "@/lib/audit-log";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse token to get envelope ID
function parseSigningToken(token: string): { envelopeId: string } | null {
  const parts = token.split('_');
  if (parts.length < 2) return null;
  return { envelopeId: parts[0] };
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Marking as viewed for token:", token);

    // Check if already viewed
    const existing = await sql`
      SELECT viewed_at, recipient_name, recipient_email, org_id, envelope_id
      FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (existing.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Session not found for token:", token);
      return NextResponse.json({ success: false, error: "Session not found" });
    }

    const session = existing[0];
    const isFirstView = session.viewed_at === null;
    if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Session found, isFirstView:", isFirstView);

    // Update viewed_at timestamp if not already set
    if (isFirstView) {
      await sql`
        UPDATE envelope_signing_sessions
        SET viewed_at = NOW(), status = 'viewed'
        WHERE token = ${token} AND viewed_at IS NULL
      `;
      if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Updated viewed_at timestamp");

      // Get document title
      const tokenData = parseSigningToken(token);
      const envelopeId = tokenData?.envelopeId || session.envelope_id;

      const documents = await sql`
        SELECT title FROM envelope_documents
        WHERE envelope_id = ${envelopeId}
      `;
      const documentTitle = documents[0]?.title || "Document";

      // Log the viewed event
      await logEnvelopeEvent('envelope.viewed', {
        orgId: session.org_id as string,
        envelopeId,
        envelopeTitle: documentTitle,
        actorName: session.recipient_name as string,
        actorEmail: session.recipient_email as string,
        details: {
          viewedAt: new Date().toISOString(),
        },
      });

      // Send email notification to sender
      try {
        if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Looking for sender email...");
        let senderName = 'PearSign User';
        let senderEmail = '';

        // Try audit log first
        try {
          const auditResult = await sql`
            SELECT actor_name, actor_email
            FROM audit_logs
            WHERE action = 'envelope.sent'
              AND entity_id = ${envelopeId}
            ORDER BY created_at DESC
            LIMIT 1
          `;
          if (auditResult.length > 0 && auditResult[0].actor_email) {
            senderName = auditResult[0].actor_name || 'PearSign User';
            senderEmail = auditResult[0].actor_email;
            if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Found sender from audit log:", senderEmail);
          }
        } catch (auditErr) {
          if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Audit log lookup failed:", auditErr);
        }

        // Fallback to user_profiles
        if (!senderEmail) {
          try {
            // Try session org_id first
            let profileResult = await sql`
              SELECT first_name, last_name, email
              FROM user_profiles
              WHERE organization_id = ${session.org_id as string}
              LIMIT 1
            `;

            if (profileResult.length === 0) {
              // Try any profile
              profileResult = await sql`
                SELECT first_name, last_name, email
                FROM user_profiles
                WHERE email IS NOT NULL AND email != ''
                LIMIT 1
              `;
            }

            if (profileResult.length > 0 && profileResult[0].email) {
              senderName = `${profileResult[0].first_name || ''} ${profileResult[0].last_name || ''}`.trim() || 'PearSign User';
              senderEmail = profileResult[0].email;
              if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Found sender from user_profiles:", senderEmail);
            }
          } catch (profileErr) {
            if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Profile lookup failed:", profileErr);
          }
        }

        // Method 3: Fallback to SENDGRID_FROM_EMAIL as last resort
        if (!senderEmail) {
          const fallbackEmail = process.env.SENDGRID_FROM_EMAIL;
          if (fallbackEmail && fallbackEmail !== 'no-reply@premiumcapital.com') {
            senderEmail = fallbackEmail;
            senderName = 'Document Sender';
            if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Using SENDGRID_FROM_EMAIL as fallback:", senderEmail);
          }
        }

        if (senderEmail) {
          if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Sending notification to:", senderEmail);
          const emailResult = await sendDocumentViewedNotification({
            documentName: documentTitle,
            viewerName: session.recipient_name as string,
            viewerEmail: session.recipient_email as string,
            senderName,
            senderEmail,
            viewedAt: new Date(),
            envelopeId,
            orgId: session.org_id as string, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });

          if (emailResult.success) {
            if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Email sent successfully to:", senderEmail);
          } else {
            if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] Email failed:", emailResult.error);
          }
        } else {
          if (process.env.NODE_ENV !== 'production') console.log("[Viewed POST] No sender email found, skipping notification");
        }
      } catch (emailErr) {
        console.error("[Viewed POST] Error sending email:", emailErr);
      }
    }

    return NextResponse.json({ success: true, firstView: isFirstView });
  } catch (error) {
    console.error("[Viewed POST] Error:", error);
    // Don't fail the request even if this tracking fails
    return NextResponse.json({ success: true });
  }
}
