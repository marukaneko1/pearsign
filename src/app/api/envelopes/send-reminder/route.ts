/**
 * Send Manual Reminder API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Allows sending a reminder to a specific signer
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendSignatureReminderEmail } from "@/lib/email-service";
import { logEnvelopeEvent } from "@/lib/audit-log";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Ensure reminders table exists
async function ensureRemindersTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS envelope_reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR(255) NOT NULL,
        envelope_id VARCHAR(255) NOT NULL,
        session_id UUID,
        reminder_type VARCHAR(50) DEFAULT 'reminder',
        reminder_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  } catch (err) {
    console.log("[Send Reminder] Table creation skipped:", err);
  }
}

/**
 * POST /api/envelopes/send-reminder
 * Send a reminder to a signer
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { envelopeId, recipientEmail, token } = body;

      console.log("[Send Reminder] Request received:", { envelopeId, recipientEmail, token, tenantId });

      if (!envelopeId && !token) {
        return NextResponse.json(
          { error: "Either envelopeId or token is required" },
          { status: 400 }
        );
      }

      // Ensure table exists
      await ensureRemindersTable();

      // Find the signing session - scoped to tenant
      let sessions;
      if (token) {
        sessions = await sql`
          SELECT s.*, d.title as document_title
          FROM envelope_signing_sessions s
          LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
          WHERE s.token = ${token} AND s.org_id = ${tenantId}
        `;
      } else {
        sessions = await sql`
          SELECT s.*, d.title as document_title
          FROM envelope_signing_sessions s
          LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
          WHERE s.envelope_id = ${envelopeId} AND s.org_id = ${tenantId}
          ${recipientEmail ? sql`AND s.recipient_email = ${recipientEmail.toLowerCase()}` : sql``}
          AND s.status IN ('pending', 'sent', 'viewed')
        `;
      }

      console.log("[Send Reminder] Found sessions:", sessions.length);

      if (sessions.length === 0) {
        return NextResponse.json(
          { error: "No pending signing session found for this envelope" },
          { status: 404 }
        );
      }

      const session = sessions[0];
      console.log("[Send Reminder] Session:", {
        id: session.id,
        status: session.status,
        recipient: session.recipient_email,
        title: session.document_title
      });

      // Only allow reminders for pending, sent, or viewed sessions
      if (!['pending', 'sent', 'viewed'].includes(session.status)) {
        return NextResponse.json(
          { error: `Cannot send reminder: document is already ${session.status}` },
          { status: 400 }
        );
      }

      // Check if session has expired
      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Cannot send reminder: session has expired" },
          { status: 400 }
        );
      }

      // Get reminder count (with fallback if table query fails)
      let currentReminderCount = 0;
      try {
        const reminderCountResult = await sql`
          SELECT COALESCE(MAX(reminder_count), 0) as count
          FROM envelope_reminders
          WHERE session_id = ${session.id}::uuid AND reminder_type = 'reminder'
        `;
        currentReminderCount = parseInt(reminderCountResult[0]?.count) || 0;
      } catch (err) {
        console.log("[Send Reminder] Could not get reminder count, using 0:", err);
      }
      const newReminderCount = currentReminderCount + 1;

      console.log("[Send Reminder] Sending to:", session.recipient_email, "count:", newReminderCount);

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
      const senderEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com';
      const senderName = 'PearSign';
      const signingUrl = `${baseUrl}/sign/${session.token}`;

      // Calculate expiration date if exists
      let expirationDate: string | undefined;
      if (session.expires_at) {
        expirationDate = new Date(session.expires_at).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }

      // Send the reminder email
      const emailResult = await sendSignatureReminderEmail({
        documentName: session.document_title || 'Document',
        recipientName: session.recipient_name,
        recipientEmail: session.recipient_email,
        senderName,
        senderEmail,
        signingUrl,
        expirationDate,
        reminderCount: newReminderCount,
        orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
      });

      if (!emailResult.success) {
        return NextResponse.json(
          { error: `Failed to send reminder: ${emailResult.error}` },
          { status: 500 }
        );
      }

      // Record the reminder (don't fail if this fails)
      try {
        await sql`
          INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
          VALUES (${tenantId}, ${session.envelope_id}, ${session.id}::uuid, 'reminder', ${newReminderCount})
        `;
      } catch (err) {
        console.log("[Send Reminder] Could not record reminder:", err);
      }

      // Log the event
      await logEnvelopeEvent('envelope.reminder_sent', {
        orgId: tenantId,
        envelopeId: session.envelope_id,
        envelopeTitle: session.document_title,
        recipientEmail: session.recipient_email,
        details: {
          reminderCount: newReminderCount,
          manual: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Reminder sent to ${session.recipient_email}`,
        reminderCount: newReminderCount,
      });
    } catch (error) {
      console.error("[Send Reminder] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: `Failed to send reminder: ${errorMessage}` },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canSendDocuments'],
  }
);
