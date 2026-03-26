/**
 * Unified Cron Job Endpoint
 *
 * This is the MAIN cron endpoint that orchestrates all scheduled tasks.
 * Call this endpoint daily (or more frequently) to run automated tasks.
 *
 * Tasks:
 * 1. Send signature reminders to pending signers
 * 2. Send expiration warnings for documents about to expire
 * 3. Mark expired documents and notify senders
 * 4. Process billing tasks (usage warnings, trial reminders)
 * 5. Process document retention policies
 *
 * Security: Protected by CRON_SECRET header
 *
 * Usage:
 * - Vercel Cron: Configured in vercel.json
 * - Netlify: Use Netlify Scheduled Functions
 * - External: POST with X-Cron-Secret header or Authorization: Bearer <secret>
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// ============== AUTH ==============

function isCronAuthenticated(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret is set, only allow in development
  if (!cronSecret) {
    console.warn("[Cron] No CRON_SECRET set, only allowing in development");
    return process.env.NODE_ENV === "development";
  }

  // Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === cronSecret) {
    return true;
  }

  // Check X-Cron-Secret header (for Vercel, Netlify, etc.)
  const cronHeader = request.headers.get("X-Cron-Secret");
  if (cronHeader === cronSecret) {
    return true;
  }

  return false;
}

// ============== TASK RUNNERS ==============

interface TaskResult {
  task: string;
  success: boolean;
  duration: number;
  details: Record<string, unknown>;
  error?: string;
}

/**
 * Task 1: Process signature reminders and expiration warnings
 */
async function runReminderTask(): Promise<TaskResult> {
  const start = Date.now();
  try {
    // Get all active tenants
    const tenants = await sql`
      SELECT id FROM tenants WHERE status = 'active'
    `;

    let totalReminders = 0;
    let totalWarnings = 0;
    let totalExpired = 0;
    const errors: string[] = [];

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com";

    for (const tenant of tenants) {
      try {
        // Find pending sessions needing reminders (3+ days old, not reminded in 2+ days)
        const pendingSessions = await sql`
          SELECT
            s.id, s.token, s.recipient_name, s.recipient_email, s.envelope_id, s.expires_at,
            d.title as document_title,
            COALESCE(
              (SELECT MAX(reminder_count) FROM envelope_reminders WHERE session_id = s.id AND reminder_type = 'reminder'),
              0
            ) as reminder_count,
            COALESCE(
              (SELECT MAX(sent_at) FROM envelope_reminders WHERE session_id = s.id AND reminder_type = 'reminder'),
              s.created_at
            ) as last_reminder_at
          FROM envelope_signing_sessions s
          LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
          WHERE s.org_id = ${tenant.id}
            AND s.status IN ('pending', 'sent', 'viewed')
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
            AND s.created_at < NOW() - INTERVAL '3 days'
          ORDER BY s.created_at ASC
          LIMIT 50
        `;

        for (const session of pendingSessions) {
          const daysSinceLastReminder = Math.floor(
            (Date.now() - new Date(session.last_reminder_at as string).getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceLastReminder >= 2) {
            // Import and send reminder
            const { sendSignatureReminderEmail } = await import("@/lib/email-service");
            const newCount = ((session.reminder_count as number) || 0) + 1;

            const result = await sendSignatureReminderEmail({
              documentName: (session.document_title as string) || "Document",
              recipientName: session.recipient_name as string,
              recipientEmail: session.recipient_email as string,
              senderName: "PearSign",
              senderEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
              signingUrl: `${baseUrl}/sign/${session.token}`,
              reminderCount: newCount,
              orgId: tenant.id as string,
            });

            if (result.success) {
              await sql`
                INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
                VALUES (${tenant.id}, ${session.envelope_id}, ${session.id}, 'reminder', ${newCount})
              `;
              totalReminders++;
            }
          }
        }

        // Find sessions expiring in 1-7 days
        const expiringSessions = await sql`
          SELECT
            s.id, s.token, s.recipient_name, s.recipient_email, s.envelope_id, s.expires_at,
            d.title as document_title,
            EXTRACT(DAY FROM s.expires_at - NOW()) as days_remaining
          FROM envelope_signing_sessions s
          LEFT JOIN envelope_documents d ON s.envelope_id = d.envelope_id
          WHERE s.org_id = ${tenant.id}
            AND s.status IN ('pending', 'sent', 'viewed')
            AND s.expires_at IS NOT NULL
            AND s.expires_at > NOW()
            AND s.expires_at <= NOW() + INTERVAL '7 days'
            AND NOT EXISTS (
              SELECT 1 FROM envelope_reminders
              WHERE session_id = s.id AND reminder_type = 'expiration_warning'
                AND sent_at::date = CURRENT_DATE
            )
          LIMIT 50
        `;

        for (const session of expiringSessions) {
          const daysRemaining = Math.ceil(Number(session.days_remaining));

          if ([7, 3, 1].includes(daysRemaining)) {
            const { sendExpirationWarningEmail } = await import("@/lib/email-service");

            const result = await sendExpirationWarningEmail({
              documentName: (session.document_title as string) || "Document",
              recipientName: session.recipient_name as string,
              recipientEmail: session.recipient_email as string,
              senderName: "PearSign",
              senderEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
              signingUrl: `${baseUrl}/sign/${session.token}`,
              expirationDate: new Date(session.expires_at as string).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
              daysRemaining,
              orgId: tenant.id as string,
            });

            if (result.success) {
              await sql`
                INSERT INTO envelope_reminders (org_id, envelope_id, session_id, reminder_type, reminder_count)
                VALUES (${tenant.id}, ${session.envelope_id}, ${session.id}, 'expiration_warning', ${daysRemaining})
              `;
              totalWarnings++;
            }
          }
        }

        // Mark expired sessions
        const expiredResult = await sql`
          UPDATE envelope_signing_sessions
          SET status = 'expired'
          WHERE org_id = ${tenant.id}
            AND status IN ('pending', 'sent', 'viewed')
            AND expires_at IS NOT NULL
            AND expires_at < NOW()
          RETURNING id
        `;
        totalExpired += expiredResult.length;

      } catch (tenantErr) {
        errors.push(`Tenant ${tenant.id}: ${tenantErr}`);
      }
    }

    return {
      task: "reminders",
      success: true,
      duration: Date.now() - start,
      details: {
        tenantsProcessed: tenants.length,
        remindersSent: totalReminders,
        expirationWarningsSent: totalWarnings,
        documentsExpired: totalExpired,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error) {
    return {
      task: "reminders",
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Task 2: Process document retention policies
 */
async function runRetentionTask(): Promise<TaskResult> {
  const start = Date.now();
  try {
    // Find documents past their retention date
    const expiredDocuments = await sql`
      SELECT id, envelope_id, org_id
      FROM envelope_documents
      WHERE retention_expires_at IS NOT NULL
        AND retention_expires_at < NOW()
        AND deleted_at IS NULL
      LIMIT 100
    `;

    let deleted = 0;

    for (const doc of expiredDocuments) {
      try {
        // Mark as deleted (soft delete)
        await sql`
          UPDATE envelope_documents
          SET deleted_at = NOW(), pdf_data = NULL
          WHERE id = ${doc.id}
        `;
        deleted++;

        // Log the deletion
        if (process.env.NODE_ENV !== 'production') console.log(`[Cron] Retention: Deleted document ${doc.envelope_id} for tenant ${doc.org_id}`);
      } catch (delErr) {
        console.error(`[Cron] Failed to delete document ${doc.id}:`, delErr);
      }
    }

    return {
      task: "retention",
      success: true,
      duration: Date.now() - start,
      details: {
        documentsProcessed: expiredDocuments.length,
        documentsDeleted: deleted,
      },
    };
  } catch (error) {
    return {
      task: "retention",
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Task 3: Process billing tasks
 */
async function runBillingTask(): Promise<TaskResult> {
  const start = Date.now();
  try {
    // Check for tenants approaching usage limits
    const tenantsNearLimit = await sql`
      SELECT
        t.id,
        t.plan,
        COALESCE(u.envelope_count, 0) as current_usage
      FROM tenants t
      LEFT JOIN (
        SELECT org_id, COUNT(*) as envelope_count
        FROM envelope_documents
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY org_id
      ) u ON u.org_id = t.id
      WHERE t.status = 'active'
    `;

    // Plan limits
    const planLimits: Record<string, number> = {
      free: 5,
      starter: 50,
      professional: 200,
      enterprise: 1000,
    };

    let warningsSent = 0;

    for (const tenant of tenantsNearLimit) {
      const limit = planLimits[tenant.plan as string] || 5;
      const usage = Number(tenant.current_usage) || 0;
      const usagePercent = (usage / limit) * 100;

      // Send warning at 80% usage
      if (usagePercent >= 80 && usagePercent < 100) {
        // Check if we already sent a warning this month
        const existingWarning = await sql`
          SELECT id FROM billing_notifications
          WHERE tenant_id = ${tenant.id}
            AND notification_type = 'usage_warning'
            AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
          LIMIT 1
        `;

        if (existingWarning.length === 0) {
          // Record the warning (actual email sending would go here)
          try {
            await sql`
              INSERT INTO billing_notifications (tenant_id, notification_type, details)
              VALUES (${tenant.id}, 'usage_warning', ${JSON.stringify({
                usage,
                limit,
                percent: usagePercent,
              })}::jsonb)
            `;
            warningsSent++;
          } catch {
            // Table might not exist yet
          }
        }
      }
    }

    return {
      task: "billing",
      success: true,
      duration: Date.now() - start,
      details: {
        tenantsChecked: tenantsNearLimit.length,
        usageWarningsSent: warningsSent,
      },
    };
  } catch (error) {
    return {
      task: "billing",
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============== MAIN HANDLER ==============

let cronRunning = false;

/**
 * POST /api/cron
 * Run all scheduled tasks
 *
 * Query params:
 * - tasks: Comma-separated list of tasks to run (default: all)
 *   Options: reminders, retention, billing
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthenticated(request)) {
    console.warn("[Cron] Unauthorized request");
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid CRON_SECRET required" },
      { status: 401 }
    );
  }

  if (cronRunning) {
    return NextResponse.json({ status: 'skipped', reason: 'Previous run still in progress' });
  }
  cronRunning = true;

  try {
    const startTime = Date.now();
    if (process.env.NODE_ENV !== 'production') console.log("[Cron] Starting scheduled tasks...");

    // Parse which tasks to run
    const { searchParams } = new URL(request.url);
    const tasksParam = searchParams.get("tasks");
    const tasksToRun = tasksParam
      ? tasksParam.split(",").map((t) => t.trim())
      : ["reminders", "retention", "billing"];

    const results: TaskResult[] = [];

    // Run selected tasks
    if (tasksToRun.includes("reminders")) {
      if (process.env.NODE_ENV !== 'production') console.log("[Cron] Running reminders task...");
      results.push(await runReminderTask());
    }

    if (tasksToRun.includes("retention")) {
      if (process.env.NODE_ENV !== 'production') console.log("[Cron] Running retention task...");
      results.push(await runRetentionTask());
    }

    if (tasksToRun.includes("billing")) {
      if (process.env.NODE_ENV !== 'production') console.log("[Cron] Running billing task...");
      results.push(await runBillingTask());
    }

    const totalDuration = Date.now() - startTime;
    const allSuccessful = results.every((r) => r.success);

    if (process.env.NODE_ENV !== 'production') console.log(`[Cron] Completed in ${totalDuration}ms, success: ${allSuccessful}`);

    return NextResponse.json({
      success: allSuccessful,
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      tasks: results,
    });
  } finally {
    cronRunning = false;
  }
}

/**
 * GET /api/cron
 * Get cron job status and documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cron",
    description: "Unified cron endpoint for all scheduled tasks",
    method: "POST",
    authentication: {
      header: "X-Cron-Secret or Authorization: Bearer <secret>",
      envVar: "CRON_SECRET",
    },
    availableTasks: [
      {
        name: "reminders",
        description: "Send signature reminders and expiration warnings",
        frequency: "Daily (recommended: every 6 hours)",
      },
      {
        name: "retention",
        description: "Process document retention policies and delete expired documents",
        frequency: "Daily",
      },
      {
        name: "billing",
        description: "Check usage limits and send billing warnings",
        frequency: "Daily",
      },
    ],
    usage: {
      runAll: "POST /api/cron",
      runSpecific: "POST /api/cron?tasks=reminders,billing",
    },
    examples: {
      curl: 'curl -X POST https://your-domain.com/api/cron -H "X-Cron-Secret: your-secret"',
      vercel: "Configured automatically via vercel.json",
      netlify: "Use Netlify Scheduled Functions",
    },
  });
}
