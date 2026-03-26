/**
 * Check Expired Envelopes API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Check for expired signing sessions and trigger notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logEnvelopeEvent } from "@/lib/audit-log";
import { notifyDocumentExpired } from "@/lib/webhook-service";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * POST /api/envelopes/check-expired
 * Check for expired signing sessions and trigger notifications
 * This can be called by a cron job or manually
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      // Find all expired signing sessions that haven't been marked as expired yet
      const expiredSessions = await sql`
        SELECT
          s.envelope_id,
          s.expires_at,
          d.title as document_title,
          COUNT(*) as pending_count
        FROM envelope_signing_sessions s
        LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
        WHERE s.org_id = ${tenantId}
          AND s.status IN ('pending', 'sent')
          AND s.expires_at IS NOT NULL
          AND s.expires_at < NOW()
        GROUP BY s.envelope_id, s.expires_at, d.title
      `;

      const processedEnvelopes: string[] = [];

      for (const session of expiredSessions) {
        const envelopeId = session.envelope_id as string;
        const documentTitle = (session.document_title as string) || "Document";
        const pendingCount = parseInt(session.pending_count as string) || 0;

        // Update all pending sessions for this envelope to expired
        await sql`
          UPDATE envelope_signing_sessions
          SET status = 'expired'
          WHERE envelope_id = ${envelopeId}
            AND org_id = ${tenantId}
            AND status IN ('pending', 'sent')
            AND expires_at < NOW()
        `;

        // Log the expiration event
        await logEnvelopeEvent('envelope.expired', {
          orgId: tenantId,
          envelopeId,
          envelopeTitle: documentTitle,
          actorName: 'System',
          details: {
            expiredAt: new Date().toISOString(),
            pendingRecipients: pendingCount,
          },
        });

        // Trigger webhook notification
        try {
          await notifyDocumentExpired({
            envelopeId,
            documentTitle,
            expiredAt: new Date().toISOString(),
            recipientCount: pendingCount,
          });
        } catch (webhookErr) {
          console.error("[Check Expired] Error triggering webhook:", webhookErr);
        }

        processedEnvelopes.push(envelopeId);
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${processedEnvelopes.length} expired envelopes`,
        expiredEnvelopes: processedEnvelopes,
      });
    } catch (error) {
      console.error("[Check Expired] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to check expired documents" },
        { status: 500 }
      );
    }
  }
);

/**
 * GET /api/envelopes/check-expired
 * Get count of documents that will expire soon
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      // Find sessions expiring in the next 24 hours
      const expiringSoon = await sql`
        SELECT COUNT(DISTINCT envelope_id) as count
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND status IN ('pending', 'sent')
          AND expires_at IS NOT NULL
          AND expires_at > NOW()
          AND expires_at < NOW() + INTERVAL '24 hours'
      `;

      // Find already expired sessions
      const alreadyExpired = await sql`
        SELECT COUNT(DISTINCT envelope_id) as count
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND status IN ('pending', 'sent')
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      `;

      return NextResponse.json({
        success: true,
        expiringSoon: parseInt(expiringSoon[0]?.count as string) || 0,
        alreadyExpired: parseInt(alreadyExpired[0]?.count as string) || 0,
      });
    } catch (error) {
      console.error("[Check Expired] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to check expiring documents" },
        { status: 500 }
      );
    }
  }
);
