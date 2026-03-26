/**
 * Bulk Send Void API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Void all envelopes from a bulk send job
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { AuditLogService } from '@/lib/audit-log';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * POST /api/bulk-send/:id/void
 * Void all envelopes from a bulk send job
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
      const body = await request.json();
      const { reason } = body;

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'Reason is required' },
          { status: 400 }
        );
      }

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

      // Get all envelope IDs from this job
      const recipientsResult = await sql`
        SELECT envelope_id FROM bulk_send_recipients
        WHERE job_id = ${id}::uuid
        AND envelope_id IS NOT NULL
      `;

      const envelopeIds = recipientsResult
        .map((r) => (r as { envelope_id: string | null }).envelope_id)
        .filter((id): id is string => id !== null);

      if (envelopeIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No envelopes found for this job' },
          { status: 400 }
        );
      }

      // Void all envelopes that are not already completed or voided
      let voidedCount = 0;
      let alreadyVoidedCount = 0;
      let completedCount = 0;

      for (const envelopeId of envelopeIds) {
        // Check current status
        const envelopeResult = await sql`
          SELECT id, status, name FROM envelopes WHERE id = ${envelopeId} AND organization_id = ${tenantId}
        `;

        if (envelopeResult.length === 0) continue;

        const envelope = envelopeResult[0];

        if (envelope.status === 'voided') {
          alreadyVoidedCount++;
          continue;
        }

        if (envelope.status === 'completed') {
          completedCount++;
          continue;
        }

        // Void the envelope
        await sql`
          UPDATE envelopes
          SET status = 'voided', updated_at = NOW()
          WHERE id = ${envelopeId} AND organization_id = ${tenantId}
        `;

        // Update signing sessions to declined
        await sql`
          UPDATE envelope_signing_sessions
          SET status = 'declined', updated_at = NOW()
          WHERE envelope_id = ${envelopeId}
          AND status NOT IN ('completed', 'declined')
        `;

        // Log the audit event
        await AuditLogService.log({
          orgId: tenantId,
          action: 'envelope.voided',
          entityType: 'ENVELOPE',
          entityId: envelopeId,
          details: {
            envelopeName: envelope.name,
            reason: reason.trim(),
            bulkSendJobId: id,
            bulkSendJobTitle: job.title,
          },
        });

        voidedCount++;
      }

      // Update the bulk send job status if all envelopes are voided
      if (voidedCount > 0) {
        await sql`
          UPDATE bulk_send_jobs
          SET status = 'failed', completed_at = NOW()
          WHERE id = ${id}::uuid AND org_id = ${tenantId}
        `;
      }

      return NextResponse.json({
        success: true,
        data: {
          jobId: id,
          jobTitle: job.title,
          totalEnvelopes: envelopeIds.length,
          voidedCount,
          alreadyVoidedCount,
          completedCount,
          skippedCount: completedCount, // Completed envelopes can't be voided
        },
        message: `Voided ${voidedCount} envelope(s) from bulk send job`,
      });
    } catch (error) {
      console.error('Error voiding bulk send job envelopes:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to void envelopes' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canSendDocuments'],
  }
);

/**
 * GET /api/bulk-send/:id/void
 * Get void status and eligible envelopes for a bulk send job
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

      // Get envelope statuses for this job - scoped to tenant
      const result = await sql`
        SELECT
          e.id,
          e.name,
          e.status,
          bsr.name as recipient_name,
          bsr.email as recipient_email
        FROM bulk_send_recipients bsr
        JOIN envelopes e ON e.id = bsr.envelope_id
        WHERE bsr.job_id = ${id}::uuid
        AND bsr.envelope_id IS NOT NULL
        AND e.organization_id = ${tenantId}
      `;

      const envelopes = result.map((r) => {
        const row = r as {
          id: string;
          name: string;
          status: string;
          recipient_name: string;
          recipient_email: string;
        };
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          recipientName: row.recipient_name,
          recipientEmail: row.recipient_email,
          canVoid: row.status !== 'completed' && row.status !== 'voided',
        };
      });

      const canVoidCount = envelopes.filter((e) => e.canVoid).length;
      const completedCount = envelopes.filter((e) => e.status === 'completed').length;
      const voidedCount = envelopes.filter((e) => e.status === 'voided').length;

      return NextResponse.json({
        success: true,
        data: {
          envelopes,
          summary: {
            total: envelopes.length,
            canVoid: canVoidCount,
            completed: completedCount,
            voided: voidedCount,
          },
        },
      });
    } catch (error) {
      console.error('Error getting bulk send void status:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to get void status' },
        { status: 500 }
      );
    }
  }
);
