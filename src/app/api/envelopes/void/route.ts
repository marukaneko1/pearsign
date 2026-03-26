/**
 * Void Envelope API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Marks an envelope as voided and sends notification emails
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logEnvelopeEvent } from "@/lib/audit-log";
import { sendDocumentVoidedEmail } from "@/lib/email-service";
import { notifyDocumentVoided } from "@/lib/webhook-service";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { onEnvelopeVoided } from "@/lib/notifications";

interface VoidEnvelopeRequest {
  envelopeId: string;
  reason: string;
}

/**
 * POST /api/envelopes/void
 * Void an envelope and notify recipients
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId, userId, context }: TenantApiContext) => {
    let step = "start";
    try {
      step = "parsing body";
      const body: VoidEnvelopeRequest = await request.json();
      const { envelopeId, reason } = body;

      if (!envelopeId) {
        return NextResponse.json(
          { success: false, error: "Envelope ID is required" },
          { status: 400 }
        );
      }

      console.log("[Void Envelope] Step:", step, "envelopeId:", envelopeId, "tenantId:", tenantId, "userId:", userId);

      step = "fetching envelope";
      // Get envelope details from envelope_documents table (main app table)
      const envelopeDocs = await sql`
        SELECT envelope_id, title, org_id FROM envelope_documents WHERE envelope_id = ${envelopeId}
      `;
      console.log("[Void Envelope] Step:", step, "found in envelope_documents:", envelopeDocs.length);

      if (envelopeDocs.length === 0) {
        console.error("[Void Envelope] Envelope not found in envelope_documents:", envelopeId);
        return NextResponse.json(
          { success: false, error: "Envelope not found" },
          { status: 404 }
        );
      }

      // Check if envelope belongs to this tenant
      if (envelopeDocs[0].org_id !== tenantId) {
        console.error("[Void Envelope] Envelope belongs to different tenant:", envelopeDocs[0].org_id, "vs", tenantId);
        return NextResponse.json(
          { success: false, error: "Envelope not found" },
          { status: 404 }
        );
      }

      const documentTitle = envelopeDocs[0]?.title || "Document for Signature";
      // Use the envelope's actual org_id for consistency
      const envelopeOrgId = envelopeDocs[0].org_id;

      console.log("[Void Envelope] Using envelopeOrgId:", envelopeOrgId, "tenantId from session:", tenantId);

      // Check if all sessions are already voided (query by envelope_id only for robustness)
      const existingStatus = await sql`
        SELECT status FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId}
        LIMIT 1
      `;
      if (existingStatus.length > 0 && existingStatus[0].status === 'voided') {
        console.log("[Void Envelope] Envelope already voided:", envelopeId);
        return NextResponse.json(
          { success: true, message: "Envelope already voided" }
        );
      }

      step = "fetching sessions";
      // Get all signing sessions for this envelope (using envelope's org_id)
      let sessions = await sql`
        SELECT * FROM envelope_signing_sessions
        WHERE envelope_id = ${envelopeId} AND org_id = ${envelopeOrgId}
      `;
      console.log("[Void Envelope] Step:", step, "sessions found:", sessions.length, "using org_id:", envelopeOrgId);

      // Fallback: If no sessions found with org_id, try without org_id filter
      // This handles potential org_id mismatch between envelope_documents and signing_sessions
      if (sessions.length === 0) {
        console.log("[Void Envelope] No sessions with org_id, trying fallback query without org_id filter");
        sessions = await sql`
          SELECT * FROM envelope_signing_sessions
          WHERE envelope_id = ${envelopeId}
        `;
        console.log("[Void Envelope] Fallback query found:", sessions.length, "sessions");
      }

      // Debug: Log session details
      if (sessions.length > 0) {
        console.log("[Void Envelope] Session emails:", sessions.map(s => s.recipient_email));
        console.log("[Void Envelope] Session statuses:", sessions.map(s => s.status));
      } else {
        console.log("[Void Envelope] WARNING: No sessions found for envelope even with fallback");
      }

      step = "updating sessions";
      // Update all sessions to voided status
      // Use envelope_id only to ensure we update even if org_id doesn't match
      await sql`
        UPDATE envelope_signing_sessions
        SET status = 'voided'
        WHERE envelope_id = ${envelopeId}
      `;
      console.log("[Void Envelope] Step:", step, "done");

      step = "updating envelope";
      // Note: The main app computes envelope status from signing sessions,
      // so we only need to update signing_sessions. But we also try to update
      // the envelopes table in case it exists (for V1 API compatibility)
      try {
        await sql`
          UPDATE envelopes
          SET status = 'voided'
          WHERE id = ${envelopeId} AND organization_id = ${tenantId}
        `;
        console.log("[Void Envelope] Step:", step, "updated envelopes table");
      } catch (envUpdateErr) {
        // This is OK - envelopes table may not exist for main app documents
        console.log("[Void Envelope] Step:", step, "envelopes table update skipped (may not exist)");
      }

      step = "logging event";
      // Log the void event
      try {
        await logEnvelopeEvent("envelope.voided", {
          orgId: tenantId,
          envelopeId,
          envelopeTitle: documentTitle,
          actorId: userId,
          actorName: context.user.name,
          details: { reason, sessionCount: sessions.length },
        });
        console.log("[Void Envelope] Step:", step, "done");
      } catch (logErr) {
        console.error("[Void Envelope] Error logging event (non-fatal):", logErr);
      }

      step = "sending notifications";
      // Trigger webhook and Slack notifications
      try {
        await notifyDocumentVoided({
          envelopeId,
          documentTitle,
          reason: reason || "No reason provided",
          orgId: envelopeOrgId, // Use envelope's org
        });
        console.log("[Void Envelope] Step:", step, "done");
      } catch (notifyErr) {
        console.error("[Void Envelope] Error sending notifications (non-fatal):", notifyErr);
      }

      // Create in-app notification for the sender (for real-time bell update)
      try {
        await onEnvelopeVoided({
          orgId: tenantId,
          senderId: userId,
          envelopeId,
          envelopeTitle: documentTitle,
          reason: reason || "No reason provided",
        });
        console.log("[Void Envelope] Created in-app notification for sender");
      } catch (notifyErr) {
        console.error("[Void Envelope] Error creating in-app notification (non-fatal):", notifyErr);
      }

      step = "sending emails";
      // Send void notification emails to all pending recipients
      const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];

      console.log("[Void Envelope] Sessions to notify:", sessions.length);
      console.log("[Void Envelope] Session statuses:", sessions.map((s) => ({ email: s.recipient_email, status: s.status })));

      for (const session of sessions) {
        // Send void email to sessions that are still pending action (pending, sent, viewed)
        // Skip: completed (already signed), declined (already took action), voided (already notified)
        const shouldNotify = ["pending", "sent", "viewed"].includes(session.status);
        console.log("[Void Envelope] Checking session:", session.recipient_email, "status:", session.status, "shouldNotify:", shouldNotify);
        if (shouldNotify) {
          try {
            const result = await sendDocumentVoidedEmail({
              recipientName: session.recipient_name,
              recipientEmail: session.recipient_email,
              documentName: documentTitle,
              senderName: context.user.name,
              voidReason: reason,
              orgId: envelopeOrgId, // Use envelope's org for correct SendGrid config
            });

            emailResults.push({
              email: session.recipient_email,
              success: result.success,
              error: result.error,
            });

            console.log("[Void Envelope] Sent void email to:", session.recipient_email, result);
          } catch (emailErr) {
            console.error("[Void Envelope] Error sending email (non-fatal):", emailErr);
            emailResults.push({
              email: session.recipient_email,
              success: false,
              error: emailErr instanceof Error ? emailErr.message : "Unknown error",
            });
          }
        }
      }

      console.log("[Void Envelope] Completed successfully. Email results:", emailResults);

      // Summarize email results
      const emailsSent = emailResults.filter(r => r.success).length;
      const emailsFailed = emailResults.filter(r => !r.success).length;

      return NextResponse.json({
        success: true,
        message: `Envelope voided successfully. ${emailsSent} email(s) sent, ${emailsFailed} failed.`,
        emailResults,
        emailSummary: {
          total: emailResults.length,
          sent: emailsSent,
          failed: emailsFailed,
        },
        debug: {
          sessionsFound: sessions.length,
          tenantId,
          envelopeId,
        },
      });
    } catch (error) {
      console.error("[Void Envelope] FATAL Error at step:", step, "error:", error);
      return NextResponse.json(
        { success: false, error: `Failed to void envelope at step: ${step}` },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canSendDocuments'],
  }
);
