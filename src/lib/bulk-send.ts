/**
 * PearSign Bulk Send Service
 * Server-side bulk send management with database persistence
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from './db';
import { onEnvelopeSent } from './notifications';
import { logEnvelopeEvent } from './audit-log';
import { sendSignatureRequestEmail } from './email-service';

// ============== TYPES ==============

export type BulkSendJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial_success';
export type BulkSendRecipientStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'completed' | 'failed';

export interface BulkSendJob {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  templateId: string;
  templateName: string;
  status: BulkSendJobStatus;
  totalRecipients: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  customMessage: string | null;
  avgSignTimeHours: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface BulkSendRecipient {
  id: string;
  jobId: string;
  envelopeId: string | null;
  name: string;
  email: string;
  fieldValues: Record<string, string>;
  status: BulkSendRecipientStatus;
  errorMessage: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CreateBulkSendJobInput {
  orgId: string; // REQUIRED - tenant isolation
  userId: string;
  title: string;
  templateId: string;
  templateName: string;
  customMessage?: string;
  recipients: Array<{
    name: string;
    email: string;
    fieldValues: Record<string, string>;
  }>;
}

export interface BulkSendStats {
  totalJobs: number;
  totalDocumentsSent: number;
  successRate: number;
  avgSignTimeHours: number;
  activeJobs: number;
  completedJobs: number;
  monthlyTrend: Array<{ month: string; sent: number; completed: number }>;
  templateUsage: Array<{ templateName: string; count: number }>;
}

// ============== BULK SEND SERVICE ==============

export const BulkSendService = {
  /**
   * Create a new bulk send job with recipients
   */
  async createJob(input: CreateBulkSendJobInput): Promise<BulkSendJob> {
    const orgId = input.orgId; // Required, no fallback

    // Create the job
    const jobResult = await sql`
      INSERT INTO bulk_send_jobs (
        org_id, user_id, title, template_id, template_name,
        status, total_recipients, custom_message
      ) VALUES (
        ${orgId},
        ${input.userId},
        ${input.title},
        ${input.templateId},
        ${input.templateName},
        'pending',
        ${input.recipients.length},
        ${input.customMessage || null}
      )
      RETURNING *
    `;

    const job = mapJobFromDb(jobResult[0]);

    // Create all recipients
    for (const recipient of input.recipients) {
      await sql`
        INSERT INTO bulk_send_recipients (
          job_id, name, email, field_values, status
        ) VALUES (
          ${job.id}::uuid,
          ${recipient.name},
          ${recipient.email},
          ${JSON.stringify(recipient.fieldValues)},
          'pending'
        )
      `;
    }

    return job;
  },

  /**
   * Start processing a bulk send job
   */
  async startJob(jobId: string, orgId: string): Promise<BulkSendJob> {
    const result = await sql`
      UPDATE bulk_send_jobs
      SET status = 'processing', started_at = NOW()
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Job not found');
    }

    return mapJobFromDb(result[0]);
  },

  /**
   * Process the next batch of recipients for a job
   */
  async processRecipients(
    jobId: string,
    orgId: string,
    batchSize: number = 5
  ): Promise<{ processed: number; remaining: number }> {
    // Get pending recipients
    const pendingRecipients = await sql`
      SELECT * FROM bulk_send_recipients
      WHERE job_id = ${jobId}::uuid AND status = 'pending'
      LIMIT ${batchSize}
    `;

    if (pendingRecipients.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Get job details
    const jobResult = await sql`
      SELECT * FROM bulk_send_jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}
    `;
    if (jobResult.length === 0) {
      throw new Error('Job not found');
    }
    const job = mapJobFromDb(jobResult[0]);

    // Get template PDF and fields
    const templateResult = await sql`
      SELECT * FROM templates WHERE id = ${job.templateId}::uuid AND org_id = ${orgId}
    `;

    if (templateResult.length === 0) {
      console.error('[Bulk Send] Template not found:', job.templateId);
      // Mark all pending as failed
      await sql`
        UPDATE bulk_send_recipients
        SET status = 'failed', error_message = 'Template not found'
        WHERE job_id = ${jobId}::uuid AND status = 'pending'
      `;
      return { processed: 0, remaining: 0 };
    }

    const template = templateResult[0];
    const pdfData = template.document_data as string;
    const signatureFields = (template.fields as Array<Record<string, unknown>>) || [];

    if (!pdfData) {
      console.error('[Bulk Send] Template has no document data:', job.templateId);
      // Mark all pending as failed
      await sql`
        UPDATE bulk_send_recipients
        SET status = 'failed', error_message = 'Template has no document'
        WHERE job_id = ${jobId}::uuid AND status = 'pending'
      `;
      return { processed: 0, remaining: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    // Process each recipient
    for (const recipientRow of pendingRecipients) {
      const recipient = mapRecipientFromDb(recipientRow);

      try {
        // Generate envelope ID and signing token
        const envelopeId = `env-bulk-${job.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const signingToken = `${envelopeId}_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;

        // Ensure envelope_documents table exists
        await sql`
          CREATE TABLE IF NOT EXISTS envelope_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id VARCHAR(255) NOT NULL,
            envelope_id VARCHAR(255) UNIQUE NOT NULL,
            title VARCHAR(500) NOT NULL,
            pdf_data TEXT,
            signature_fields JSONB DEFAULT '[]',
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        // Ensure envelope_signing_sessions table exists
        await sql`
          CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id VARCHAR(255) NOT NULL,
            envelope_id VARCHAR(255) NOT NULL,
            token VARCHAR(255) UNIQUE NOT NULL,
            recipient_name VARCHAR(255) NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            field_values JSONB DEFAULT '{}',
            signature_data TEXT,
            ip_address VARCHAR(100),
            user_agent TEXT,
            viewed_at TIMESTAMP,
            signed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP
          )
        `;

        // Store the envelope document with template PDF
        await sql`
          INSERT INTO envelope_documents (org_id, envelope_id, title, pdf_data, signature_fields, message)
          VALUES (
            ${job.orgId},
            ${envelopeId},
            ${`${job.title} - ${recipient.name}`},
            ${pdfData},
            ${JSON.stringify(signatureFields)}::jsonb,
            ${job.customMessage || ''}
          )
          ON CONFLICT (envelope_id) DO NOTHING
        `;

        // Create signing session
        await sql`
          INSERT INTO envelope_signing_sessions (
            org_id, envelope_id, token, recipient_name, recipient_email, status, field_values
          ) VALUES (
            ${job.orgId},
            ${envelopeId},
            ${signingToken},
            ${recipient.name},
            ${recipient.email},
            'pending',
            ${JSON.stringify(recipient.fieldValues)}::jsonb
          )
        `;

        // Build signing URL using the regular signing page
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const signingUrl = `${baseUrl}/sign/${signingToken}`;

        // Send the signature request email
        const emailResult = await sendSignatureRequestEmail({
          documentName: `${job.title} - ${recipient.name}`,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          senderName: 'PearSign',
          senderEmail: process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com',
          message: job.customMessage || undefined,
          signingUrl,
        });

        if (!emailResult.success) {
          throw new Error(emailResult.error || 'Failed to send email');
        }

        // Update recipient as sent
        await sql`
          UPDATE bulk_send_recipients
          SET status = 'sent', envelope_id = ${envelopeId}, sent_at = NOW()
          WHERE id = ${recipient.id}::uuid
        `;

        successCount++;

        // Log the envelope send
        await logEnvelopeEvent('envelope.sent', {
          orgId: job.orgId,
          envelopeId,
          envelopeTitle: `${job.title} - ${recipient.name}`,
          actorId: job.userId,
          recipientEmail: recipient.email,
          details: { bulkJobId: job.id, templateId: job.templateId, emailSent: true, signingUrl },
        });

      } catch (error) {
        console.error('[Bulk Send] Error processing recipient:', recipient.email, error);
        // Mark recipient as failed
        await sql`
          UPDATE bulk_send_recipients
          SET status = 'failed', error_message = ${error instanceof Error ? error.message : 'Unknown error'}
          WHERE id = ${recipient.id}::uuid
        `;

        failedCount++;
      }
    }

    // Update job counters
    await sql`
      UPDATE bulk_send_jobs
      SET
        processed_count = processed_count + ${successCount + failedCount},
        success_count = success_count + ${successCount},
        failed_count = failed_count + ${failedCount}
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}
    `;

    // Check remaining
    const remainingResult = await sql`
      SELECT COUNT(*) as count FROM bulk_send_recipients
      WHERE job_id = ${jobId}::uuid AND status = 'pending'
    `;
    const remaining = parseInt(remainingResult[0].count, 10);

    // If no more pending, mark job as complete
    if (remaining === 0) {
      const finalJob = await sql`SELECT * FROM bulk_send_jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}`;
      const jobData = mapJobFromDb(finalJob[0]);

      const finalStatus: BulkSendJobStatus =
        jobData.failedCount === 0 ? 'completed' :
        jobData.successCount === 0 ? 'failed' : 'partial_success';

      await sql`
        UPDATE bulk_send_jobs
        SET status = ${finalStatus}, completed_at = NOW()
        WHERE id = ${jobId}::uuid AND org_id = ${orgId}
      `;

      // Create notification for job completion
      await onEnvelopeSent({
        orgId: job.orgId,
        senderId: job.userId,
        senderName: 'Bulk Send',
        envelopeId: job.id,
        envelopeTitle: `Bulk Send: ${job.title}`,
        recipientCount: jobData.successCount,
      });
    }

    return { processed: successCount + failedCount, remaining };
  },

  /**
   * Get job by ID
   */
  async getJob(jobId: string, orgId: string): Promise<BulkSendJob | null> {
    const result = await sql`
      SELECT * FROM bulk_send_jobs WHERE id = ${jobId}::uuid AND org_id = ${orgId}
    `;
    if (result.length === 0) return null;
    return mapJobFromDb(result[0]);
  },

  /**
   * Get all jobs for an organization
   */
  async getJobs(
    orgId: string,
    options: { limit?: number; offset?: number; status?: BulkSendJobStatus } = {}
  ): Promise<{ jobs: BulkSendJob[]; total: number }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let jobs;
    let countResult;

    if (options.status) {
      jobs = await sql`
        SELECT * FROM bulk_send_jobs
        WHERE org_id = ${orgId} AND status = ${options.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM bulk_send_jobs
        WHERE org_id = ${orgId} AND status = ${options.status}
      `;
    } else {
      jobs = await sql`
        SELECT * FROM bulk_send_jobs
        WHERE org_id = ${orgId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM bulk_send_jobs
        WHERE org_id = ${orgId}
      `;
    }

    return {
      jobs: jobs.map(mapJobFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Get recipients for a job
   */
  async getJobRecipients(
    jobId: string,
    orgId: string,
    options: { limit?: number; offset?: number; status?: BulkSendRecipientStatus } = {}
  ): Promise<{ recipients: BulkSendRecipient[]; total: number }> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    let recipients;
    let countResult;

    if (options.status) {
      recipients = await sql`
        SELECT * FROM bulk_send_recipients
        WHERE job_id = ${jobId}::uuid AND status = ${options.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM bulk_send_recipients
        WHERE job_id = ${jobId}::uuid AND status = ${options.status}
      `;
    } else {
      recipients = await sql`
        SELECT * FROM bulk_send_recipients
        WHERE job_id = ${jobId}::uuid
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as count FROM bulk_send_recipients
        WHERE job_id = ${jobId}::uuid
      `;
    }

    return {
      recipients: recipients.map(mapRecipientFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Get bulk send statistics
   */
  async getStats(orgId: string): Promise<BulkSendStats> {
    // Get basic counts
    const jobStats = await sql`
      SELECT
        COUNT(*) as total_jobs,
        SUM(success_count) as total_sent,
        SUM(CASE WHEN status IN ('completed', 'partial_success') THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as active_jobs,
        AVG(avg_sign_time_hours) as avg_sign_time
      FROM bulk_send_jobs
      WHERE org_id = ${orgId}
    `;

    const stats = jobStats[0];
    const totalSent = parseInt(stats.total_sent || '0', 10);
    const totalRecipients = await sql`
      SELECT SUM(total_recipients) as total FROM bulk_send_jobs WHERE org_id = ${orgId}
    `;
    const totalRecipientsCount = parseInt(totalRecipients[0].total || '0', 10);

    // Get monthly trend (last 4 months)
    const monthlyTrend = await sql`
      SELECT
        TO_CHAR(created_at, 'Mon') as month,
        SUM(success_count) as sent,
        SUM(CASE WHEN status = 'completed' THEN success_count ELSE 0 END) as completed
      FROM bulk_send_jobs
      WHERE org_id = ${orgId} AND created_at > NOW() - INTERVAL '4 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `;

    // Get template usage
    const templateUsage = await sql`
      SELECT template_name, SUM(success_count) as count
      FROM bulk_send_jobs
      WHERE org_id = ${orgId}
      GROUP BY template_name
      ORDER BY count DESC
      LIMIT 5
    `;

    return {
      totalJobs: parseInt(stats.total_jobs || '0', 10),
      totalDocumentsSent: totalSent,
      successRate: totalRecipientsCount > 0 ? Math.round((totalSent / totalRecipientsCount) * 100) : 0,
      avgSignTimeHours: parseFloat(stats.avg_sign_time || '0'),
      activeJobs: parseInt(stats.active_jobs || '0', 10),
      completedJobs: parseInt(stats.completed_jobs || '0', 10),
      monthlyTrend: monthlyTrend.map(m => ({
        month: m.month,
        sent: parseInt(m.sent || '0', 10),
        completed: parseInt(m.completed || '0', 10),
      })),
      templateUsage: templateUsage.map(t => ({
        templateName: t.template_name,
        count: parseInt(t.count || '0', 10),
      })),
    };
  },

  /**
   * Update recipient status (for webhook callbacks)
   */
  async updateRecipientStatus(
    recipientId: string,
    status: BulkSendRecipientStatus
  ): Promise<BulkSendRecipient | null> {
    let result;

    // Use separate queries for each status to properly set the timestamp field
    switch (status) {
      case 'sent':
        result = await sql`
          UPDATE bulk_send_recipients
          SET status = ${status}, sent_at = NOW()
          WHERE id = ${recipientId}::uuid
          RETURNING *
        `;
        break;
      case 'viewed':
        result = await sql`
          UPDATE bulk_send_recipients
          SET status = ${status}, viewed_at = NOW()
          WHERE id = ${recipientId}::uuid
          RETURNING *
        `;
        break;
      case 'signed':
        result = await sql`
          UPDATE bulk_send_recipients
          SET status = ${status}, signed_at = NOW()
          WHERE id = ${recipientId}::uuid
          RETURNING *
        `;
        break;
      case 'completed':
        result = await sql`
          UPDATE bulk_send_recipients
          SET status = ${status}, completed_at = NOW()
          WHERE id = ${recipientId}::uuid
          RETURNING *
        `;
        break;
      default:
        result = await sql`
          UPDATE bulk_send_recipients
          SET status = ${status}
          WHERE id = ${recipientId}::uuid
          RETURNING *
        `;
    }

    if (result.length === 0) return null;
    return mapRecipientFromDb(result[0]);
  },

  /**
   * Cancel a pending or processing job
   */
  async retryFailedRecipients(jobId: string, orgId: string): Promise<{ retriedCount: number }> {
    const job = await this.getJob(jobId, orgId);
    if (!job) throw new Error('Job not found');

    const failedRecipients = await sql`
      SELECT COUNT(*) as count FROM bulk_send_recipients
      WHERE job_id = ${jobId}::uuid AND status = 'failed'
    `;

    const failedCount = parseInt(failedRecipients[0].count, 10);
    if (failedCount === 0) {
      return { retriedCount: 0 };
    }

    await sql`
      UPDATE bulk_send_recipients
      SET status = 'pending', error_message = NULL
      WHERE job_id = ${jobId}::uuid AND status = 'failed'
    `;

    await sql`
      UPDATE bulk_send_jobs
      SET
        status = 'processing',
        processed_count = processed_count - ${failedCount},
        failed_count = 0,
        completed_at = NULL
      WHERE id = ${jobId}::uuid AND org_id = ${orgId}
    `;

    const self = this;
    (async () => {
      try {
        let result = await self.processRecipients(jobId, orgId, 5);
        while (result.remaining > 0) {
          result = await self.processRecipients(jobId, orgId, 5);
        }
      } catch (err) {
        console.error('[Bulk Send] Retry processing error:', err);
      }
    })();

    return { retriedCount: failedCount };
  },

  async cancelJob(jobId: string, orgId: string): Promise<BulkSendJob | null> {
    // Only cancel if pending or processing
    const result = await sql`
      UPDATE bulk_send_jobs
      SET status = 'failed', completed_at = NOW()
      WHERE id = ${jobId}::uuid AND org_id = ${orgId} AND status IN ('pending', 'processing')
      RETURNING *
    `;

    if (result.length === 0) return null;
    return mapJobFromDb(result[0]);
  },
};

// ============== HELPER FUNCTIONS ==============

function mapJobFromDb(row: Record<string, unknown>): BulkSendJob {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string,
    title: row.title as string,
    templateId: row.template_id as string,
    templateName: row.template_name as string,
    status: row.status as BulkSendJobStatus,
    totalRecipients: row.total_recipients as number,
    processedCount: row.processed_count as number,
    successCount: row.success_count as number,
    failedCount: row.failed_count as number,
    customMessage: row.custom_message as string | null,
    avgSignTimeHours: row.avg_sign_time_hours ? parseFloat(row.avg_sign_time_hours as string) : null,
    createdAt: (row.created_at as Date).toISOString(),
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapRecipientFromDb(row: Record<string, unknown>): BulkSendRecipient {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    envelopeId: row.envelope_id as string | null,
    name: row.name as string,
    email: row.email as string,
    fieldValues: (row.field_values as Record<string, string>) || {},
    status: row.status as BulkSendRecipientStatus,
    errorMessage: row.error_message as string | null,
    sentAt: row.sent_at ? (row.sent_at as Date).toISOString() : null,
    viewedAt: row.viewed_at ? (row.viewed_at as Date).toISOString() : null,
    signedAt: row.signed_at ? (row.signed_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
