/**
 * Bulk Send API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Requires bulkSend feature (professional+ plans)
 */

import { NextRequest, NextResponse } from 'next/server';
import { BulkSendService } from '@/lib/bulk-send';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/bulk-send
 * Get all bulk send jobs for the tenant
 */
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | 'partial_success' | null;

    const result = await BulkSendService.getJobs(tenantId, {
      limit,
      offset,
      status: status || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result.jobs,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
      tenant: {
        id: tenantId,
        plan: context.tenant.plan,
      },
    });
  } catch (error) {
    console.error('Error fetching bulk send jobs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bulk send jobs' },
      { status: 500 }
    );
  }
}, {
  requiredFeatures: ['bulkSend'],
});

/**
 * POST /api/bulk-send
 * Create a new bulk send job
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const {
        title,
        templateId,
        templateName,
        customMessage,
        recipients,
      } = body;

      // Validate required fields
      if (!title || !templateId || !templateName || !recipients || recipients.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Create the job with tenant context
      const job = await BulkSendService.createJob({
        orgId: tenantId,
        userId: context.user.id,
        title,
        templateId,
        templateName,
        customMessage,
        recipients,
      });

      // Start processing immediately
      await BulkSendService.startJob(job.id, tenantId);

      // Process first batch asynchronously
      processJobInBackground(job.id, tenantId);

      return NextResponse.json({
        success: true,
        data: job,
        message: `Bulk send job created with ${recipients.length} recipients`,
        tenant: {
          id: tenantId,
          plan: context.tenant.plan,
        },
      });
    } catch (error) {
      console.error('Error creating bulk send job:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create bulk send job' },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['bulkSend'],
    requiredPermissions: ['canSendDocuments'],
  }
);

/**
 * Process job in background (non-blocking)
 */
async function processJobInBackground(jobId: string, orgId: string) {
  let remaining = 1;
  while (remaining > 0) {
    const result = await BulkSendService.processRecipients(jobId, orgId, 5);
    remaining = result.remaining;
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
