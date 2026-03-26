import { NextRequest, NextResponse } from 'next/server';
import { BulkSendService } from '@/lib/bulk-send';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

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

      const result = await BulkSendService.retryFailedRecipients(params.id, tenantId);

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error retrying failed recipients:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to retry' },
        { status: 500 }
      );
    }
  }
);
