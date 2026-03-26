/**
 * Bulk Send Job Detail API
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { BulkSendService } from '@/lib/bulk-send';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/bulk-send/:id
 * Get a specific bulk send job with recipients
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

      const job = await BulkSendService.getJob(id, tenantId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      // Get recipients
      const { searchParams } = new URL(request.url);
      const includeRecipients = searchParams.get('includeRecipients') === 'true';
      const recipientStatus = searchParams.get('recipientStatus') as
        | 'pending'
        | 'sent'
        | 'viewed'
        | 'signed'
        | 'completed'
        | 'failed'
        | null;

      let recipients = null;
      if (includeRecipients) {
        const result = await BulkSendService.getJobRecipients(id, tenantId, {
          status: recipientStatus || undefined,
          limit: 100,
        });
        recipients = result;
      }

      return NextResponse.json({
        success: true,
        data: {
          job,
          recipients: recipients?.recipients || null,
          recipientCount: recipients?.total || job.totalRecipients,
        },
      });
    } catch (error) {
      console.error('Error fetching bulk send job:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bulk send job' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/bulk-send/:id
 * Cancel a bulk send job
 */
export const DELETE = withTenant<{ id: string }>(
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

      const job = await BulkSendService.cancelJob(id, tenantId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found or cannot be cancelled' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: job,
        message: 'Job cancelled successfully',
      });
    } catch (error) {
      console.error('Error cancelling bulk send job:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to cancel bulk send job' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canSendDocuments'],
  }
);
