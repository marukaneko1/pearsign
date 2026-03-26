/**
 * Process Reminders and Expiration Notifications API
 *
 * This is a CRON JOB endpoint that processes ALL active tenants.
 * It should be called periodically (e.g., by a cron job) to:
 * 1. Send reminders for pending signatures
 * 2. Send expiration warnings for documents about to expire
 * 3. Mark expired documents and notify senders
 *
 * Security: This endpoint should be protected by a cron secret in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  sendSignatureReminderEmail,
  sendExpirationWarningEmail,
  sendDocumentExpiredNotification,
} from "@/lib/email-service";
import { logEnvelopeEvent } from "@/lib/audit-log";

// Ensure reminder tracking table exists
async function ensureReminderTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) NOT NULL,
      session_id UUID NOT NULL,
      reminder_type VARCHAR(50) NOT NULL,
      reminder_count INTEGER DEFAULT 1,
      sent_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_id, reminder_type, sent_at::date)
    )
  `;
}

interface TenantResult {
  tenantId: string;
  remindersSent: number;
  expirationWarningsSent: number;
  expiredNotificationsSent: number;
  errors: string[];
}

interface ProcessResult {
  tenantsProcessed: number;
  totalRemindersSent: number;
  totalExpirationWarningsSent: number;
  totalExpiredNotificationsSent: number;
  tenantResults: TenantResult[];
  errors: string[];
}

async function processRemindersForTenant(
  tenantId: string,
  reminderDays: number[],
  expirationWarningDays: number[],
  dryRun: boolean,
  baseUrl: string,
  senderEmail: string,
  senderName: string
): Promise<TenantResult> {
  const result: TenantResult = {
    tenantId,
    remindersSent: 0,
    expirationWarningsSent: 0,
    expiredNotificationsSent: 0,
    errors: [],
  };

  // ============== 1. Process Signature Reminders ==============
  const pendingSessions = await sql`
    SELECT
      s.*,
      d.title as document_title,
      d.created_at as document_created_at,
      COALESCE(
        (SELECT MAX(reminder_count) FROM envelope_reminders
         WHERE session_id = s.id AND reminder_type = 'reminder'),
        0
      ) as reminder_count,
      COALESCE(
        (SELECT MAX(sent_at) FROM envelope_reminders
         WHERE session_id = s.id AND reminder_type = 'reminder'),
        s.created_at
      ) as last_reminder_at
    FROM envelope_signing_sessions s
    LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
    WHERE s.status = 'pending'
      AND s.org_id = ${tenantId}
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    ORDER BY s.created_at ASC
  `;

  for (const session of pendingSessions) {
    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(session.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastReminder = Math.floor(
      (Date.now() - new Date(session.last_reminder_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const shouldSendReminder = reminderDays.some((days: number) =>
      daysSinceCreation >= days && daysSinceLastReminder >= 2
    );

    if (shouldSendReminder) {
      const newReminderCount = (session.reminder_count || 0) + 1;
      const signingUrl = `${baseUrl}/sign/${session.token}`;

      if (!dryRun) {
        try {
          const emailResult = await sendSignatureReminderEmail({
            documentName: session.document_title || 'Document',
            recipientName: session.recipient_name,
            recipientEmail: session.recipient_email,
            senderName,
            senderEmail,
            signingUrl,
            reminderCount: newReminderCount,
            orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });

          if (emailResult.success) {
            await sql`
              INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
              VALUES (${tenantId}, ${session.envelope_id}, ${session.id}, 'reminder', ${newReminderCount})
            `;

            await logEnvelopeEvent('envelope.reminder_sent', {
              orgId: tenantId,
              envelopeId: session.envelope_id,
              envelopeTitle: session.document_title,
              recipientEmail: session.recipient_email,
              details: { reminderCount: newReminderCount },
            });

            result.remindersSent++;
          } else {
            result.errors.push(`Reminder failed for ${session.recipient_email}: ${emailResult.error}`);
          }
        } catch (err) {
          result.errors.push(`Reminder error for ${session.recipient_email}: ${err}`);
        }
      } else {
        result.remindersSent++;
      }
    }
  }

  // ============== 2. Process Expiration Warnings ==============
  const expiringSessionsQuery = await sql`
    SELECT
      s.*,
      d.title as document_title,
      EXTRACT(DAY FROM s.expires_at - NOW()) as days_remaining,
      COALESCE(
        (SELECT MAX(sent_at)::date FROM envelope_reminders
         WHERE session_id = s.id AND reminder_type = 'expiration_warning'),
        '1970-01-01'::date
      ) as last_warning_date
    FROM envelope_signing_sessions s
    LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
    WHERE s.status = 'pending'
      AND s.org_id = ${tenantId}
      AND s.expires_at IS NOT NULL
      AND s.expires_at > NOW()
      AND s.expires_at <= NOW() + INTERVAL '7 days'
    ORDER BY s.expires_at ASC
  `;

  for (const session of expiringSessionsQuery) {
    const daysRemaining = Math.ceil(Number(session.days_remaining));
    const lastWarningDate = new Date(session.last_warning_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const shouldWarn = expirationWarningDays.includes(daysRemaining) &&
      lastWarningDate < today;

    if (shouldWarn) {
      const signingUrl = `${baseUrl}/sign/${session.token}`;
      const expirationDate = new Date(session.expires_at).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!dryRun) {
        try {
          const emailResult = await sendExpirationWarningEmail({
            documentName: session.document_title || 'Document',
            recipientName: session.recipient_name,
            recipientEmail: session.recipient_email,
            senderName,
            senderEmail,
            signingUrl,
            expirationDate,
            daysRemaining,
            orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
          });

          if (emailResult.success) {
            await sql`
              INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
              VALUES (${tenantId}, ${session.envelope_id}, ${session.id}, 'expiration_warning', ${daysRemaining})
            `;

            result.expirationWarningsSent++;
          } else {
            result.errors.push(`Expiration warning failed for ${session.recipient_email}: ${emailResult.error}`);
          }
        } catch (err) {
          result.errors.push(`Expiration warning error for ${session.recipient_email}: ${err}`);
        }
      } else {
        result.expirationWarningsSent++;
      }
    }
  }

  // ============== 3. Process Expired Documents ==============
  const expiredSessions = await sql`
    SELECT
      s.*,
      d.title as document_title,
      NOT EXISTS (
        SELECT 1 FROM envelope_reminders
        WHERE session_id = s.id AND reminder_type = 'expired'
      ) as needs_notification
    FROM envelope_signing_sessions s
    LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
    WHERE s.status = 'pending'
      AND s.org_id = ${tenantId}
      AND s.expires_at IS NOT NULL
      AND s.expires_at <= NOW()
    ORDER BY s.expires_at ASC
  `;

  for (const session of expiredSessions) {
    if (!session.needs_notification) continue;

    if (!dryRun) {
      try {
        await sql`
          UPDATE envelope_signing_sessions
          SET status = 'expired'
          WHERE id = ${session.id}
        `;

        const emailResult = await sendDocumentExpiredNotification({
          documentName: session.document_title || 'Document',
          recipientName: session.recipient_name,
          recipientEmail: session.recipient_email,
          senderName,
          senderEmail,
          expiredAt: new Date(session.expires_at),
          envelopeId: session.envelope_id,
          orgId: tenantId, // TENANT ISOLATION: Pass orgId for proper credential lookup
        });

        if (emailResult.success) {
          await sql`
            INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
            VALUES (${tenantId}, ${session.envelope_id}, ${session.id}, 'expired', 1)
          `;

          await logEnvelopeEvent('envelope.expired', {
            orgId: tenantId,
            envelopeId: session.envelope_id,
            envelopeTitle: session.document_title,
            recipientEmail: session.recipient_email,
            details: { expiredAt: session.expires_at },
          });

          result.expiredNotificationsSent++;
        } else {
          result.errors.push(`Expired notification failed for ${session.envelope_id}: ${emailResult.error}`);
        }
      } catch (err) {
        result.errors.push(`Expired notification error for ${session.envelope_id}: ${err}`);
      }
    } else {
      result.expiredNotificationsSent++;
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await ensureReminderTable();

    // Get configuration from request body or use defaults
    const body = await request.json().catch(() => ({}));
    const {
      reminderDays = [3, 7],
      expirationWarningDays = [7, 3, 1],
      dryRun = false,
      tenantId: specificTenantId, // Optional: process only a specific tenant
    } = body;

    const result: ProcessResult = {
      tenantsProcessed: 0,
      totalRemindersSent: 0,
      totalExpirationWarningsSent: 0,
      totalExpiredNotificationsSent: 0,
      tenantResults: [],
      errors: [],
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
    const senderEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com';
    const senderName = 'PearSign';

    // Get all active tenants or a specific one
    let tenants: Array<{ id: string }>;
    if (specificTenantId) {
      tenants = [{ id: specificTenantId }];
    } else {
      const tenantsResult = await sql`
        SELECT id FROM tenants WHERE status = 'active'
      `;
      tenants = tenantsResult as Array<{ id: string }>;
    }

    // Process each tenant
    for (const tenant of tenants) {
      try {
        const tenantResult = await processRemindersForTenant(
          tenant.id,
          reminderDays,
          expirationWarningDays,
          dryRun,
          baseUrl,
          senderEmail,
          senderName
        );

        result.tenantResults.push(tenantResult);
        result.tenantsProcessed++;
        result.totalRemindersSent += tenantResult.remindersSent;
        result.totalExpirationWarningsSent += tenantResult.expirationWarningsSent;
        result.totalExpiredNotificationsSent += tenantResult.expiredNotificationsSent;
        result.errors.push(...tenantResult.errors);
      } catch (err) {
        result.errors.push(`Error processing tenant ${tenant.id}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      results: {
        tenantsProcessed: result.tenantsProcessed,
        totalRemindersSent: result.totalRemindersSent,
        totalExpirationWarningsSent: result.totalExpirationWarningsSent,
        totalExpiredNotificationsSent: result.totalExpiredNotificationsSent,
        errorCount: result.errors.length,
      },
      tenantResults: result.tenantResults,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Process Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process reminders" },
      { status: 500 }
    );
  }
}

// GET endpoint for status/info
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/envelopes/process-reminders',
    description: 'Process signature reminders and expiration notifications for all active tenants',
    method: 'POST',
    headers: {
      'x-cron-secret': 'Optional security header (set CRON_SECRET env var)',
    },
    body: {
      reminderDays: 'Array of days after which to send reminders (default: [3, 7])',
      expirationWarningDays: 'Array of days before expiration to warn (default: [7, 3, 1])',
      dryRun: 'If true, simulate without sending emails (default: false)',
      tenantId: 'Optional: process only a specific tenant',
    },
    usage: 'Call this endpoint periodically (e.g., daily via cron job) to send reminders for all tenants',
  });
}
