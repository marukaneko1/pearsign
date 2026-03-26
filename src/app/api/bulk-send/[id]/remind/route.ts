/**
 * Bulk Send Remind API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Send reminders to all pending envelopes in a bulk send job
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendSignatureReminderEmail } from '@/lib/email-service';
import { AuditLogService } from '@/lib/audit-log';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * POST /api/bulk-send/:id/remind
 * Send reminders to all pending envelopes in a bulk send job
 */
export const POST = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: 'Job ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

      // Get the bulk send job - scoped to tenant
      const jobResult = await sql`
        SELECT * FROM bulk_send_jobs WHERE id = ${id}::uuid AND org_id = ${tenantId}
      `;

      if (jobResult.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Bulk send job not found' },
          { status: 404 }
        );
      }

      const job = jobResult[0];

      // Get all pending signing sessions for envelopes in this job - scoped to tenant
      const sessionsResult = await sql`
        SELECT
          s.id,
          s.token,
          s.recipient_name,
          s.recipient_email,
          s.envelope_id,
          s.expires_at,
          d.title as document_title
        FROM bulk_send_recipients bsr
        JOIN envelope_signing_sessions s ON s.envelope_id = bsr.envelope_id
        LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
        WHERE bsr.job_id = ${id}::uuid
        AND s.status = 'pending'
        AND s.org_id = ${tenantId}
        AND bsr.envelope_id IS NOT NULL
      `;

      if (sessionsResult.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            jobId: id,
            sentCount: 0,
            failedCount: 0,
            alreadySignedCount: 0,
          },
          message: 'No pending signatures found to remind',
        });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
      const senderEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com';
      const senderName = 'PearSign';

      let sentCount = 0;
      let failedCount = 0;
      const failedRecipients: string[] = [];

      for (const session of sessionsResult) {
        try {
          const typedSession = session as {
            id: string;
            token: string;
            recipient_name: string;
            recipient_email: string;
            envelope_id: string;
            expires_at: string | null;
            document_title: string | null;
          };

          // Skip expired sessions
          if (typedSession.expires_at && new Date(typedSession.expires_at) < new Date()) {
            failedCount++;
            failedRecipients.push(`${typedSession.recipient_email} (expired)`);
            continue;
          }

          // Get current reminder count
          const reminderCountResult = await sql`
            SELECT COALESCE(MAX(reminder_count), 0) as count
            FROM envelope_reminders
            WHERE session_id = ${typedSession.id}::uuid AND reminder_type = 'reminder'
          `;
          const currentReminderCount = (reminderCountResult[0] as { count: number })?.count || 0;
          const newReminderCount = currentReminderCount + 1;

          const signingUrl = `${baseUrl}/sign/${typedSession.token}`;

          // Calculate expiration date if exists
          let expirationDate: string | undefined;
          if (typedSession.expires_at) {
            expirationDate = new Date(typedSession.expires_at).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          }

          // Send the reminder email
          const emailResult = await sendSignatureReminderEmail({
            documentName: typedSession.document_title || 'Document',
            recipientName: typedSession.recipient_name,
            recipientEmail: typedSession.recipient_email,
            senderName,
            senderEmail,
            signingUrl,
            expirationDate,
            reminderCount: newReminderCount,
            orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });

          if (emailResult.success) {
            // Record the reminder - scoped to tenant
            await sql`
              INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
              VALUES (${tenantId}, ${typedSession.envelope_id}::uuid, ${typedSession.id}::uuid, 'reminder', ${newReminderCount})
            `;

            sentCount++;
          } else {
            failedCount++;
            failedRecipients.push(typedSession.recipient_email);
          }
        } catch (error) {
          console.error(`Failed to send reminder to ${(session as { recipient_email: string }).recipient_email}:`, error);
          failedCount++;
          failedRecipients.push((session as { recipient_email: string }).recipient_email);
        }
      }

      // Log the bulk reminder event
      await AuditLogService.log({
        orgId: tenantId,
        action: 'envelope.reminder_sent',
        entityType: 'ENVELOPE',
        details: {
          bulkSendJobId: id,
          bulkSendJobTitle: job.title,
          totalPending: sessionsResult.length,
          sentCount,
          failedCount,
          bulkReminder: true,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          jobId: id,
          jobTitle: job.title,
          totalPending: sessionsResult.length,
          sentCount,
          failedCount,
          failedRecipients: failedRecipients.length > 0 ? failedRecipients : undefined,
        },
        message: `Sent ${sentCount} reminder(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
      });
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to send reminders' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canSendDocuments'],
  }
);

/**
 * GET /api/bulk-send/:id/remind
 * Get reminder status for all envelopes in a bulk send job
 */
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: 'Job ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

      // Get pending count and last reminder info - scoped to tenant
      const result = await sql`
        SELECT
          COUNT(*) FILTER (WHERE s.status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE s.status = 'completed') as completed_count,
          MAX(r.created_at) as last_reminder_sent
        FROM bulk_send_recipients bsr
        LEFT JOIN envelope_signing_sessions s ON s.envelope_id = bsr.envelope_id AND s.org_id = ${tenantId}
        LEFT JOIN envelope_reminders r ON r.session_id = s.id
        WHERE bsr.job_id = ${id}::uuid
        AND bsr.envelope_id IS NOT NULL
      `;

      const stats = result[0] as {
        pending_count: string;
        completed_count: string;
        last_reminder_sent: string | null;
      };

      return NextResponse.json({
        success: true,
        data: {
          pendingCount: parseInt(stats.pending_count || '0', 10),
          completedCount: parseInt(stats.completed_count || '0', 10),
          lastReminderSent: stats.last_reminder_sent,
        },
      });
    } catch (error) {
      console.error('Error getting reminder status:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to get reminder status' },
        { status: 500 }
      );
    }
  }
);
