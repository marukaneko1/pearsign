/**
 * Individual Payment Processor Config API Routes
 *
 * GET /api/payment-processors/:id - Get processor config
 * PUT /api/payment-processors/:id - Update processor config
 * DELETE /api/payment-processors/:id - Delete processor config
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getProcessorConfig,
  updateProcessorConfig,
  deleteProcessorConfig,
  type CreateProcessorConfigInput,
} from '@/lib/invoices';

export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Processor ID is required' }, { status: 400 });
    }

    const config = await getProcessorConfig(tenantId, params.id);

    if (!config) {
      return NextResponse.json(
        { error: 'Processor config not found' },
        { status: 404 }
      );
    }

    // Don't expose credentials
    const safeConfig = {
      ...config,
      credentials: undefined,
      has_credentials: Object.keys(config.credentials).length > 0,
    };

    return NextResponse.json(safeConfig);
  } catch (error) {
    console.error('[Payment Processors API] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to get processor config' },
      { status: 500 }
    );
  }
});

export const PUT = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId, context }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Processor ID is required' }, { status: 400 });
    }

    const body = await request.json() as Partial<CreateProcessorConfigInput>;

    const config = await updateProcessorConfig(
      tenantId,
      params.id,
      body,
      context.user?.id
    );

    // Don't expose credentials
    const safeConfig = {
      ...config,
      credentials: undefined,
      has_credentials: Object.keys(config.credentials).length > 0,
    };

    return NextResponse.json(safeConfig);
  } catch (error) {
    console.error('[Payment Processors API] Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update processor config' },
      { status: 400 }
    );
  }
});

export const DELETE = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId, context }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Processor ID is required' }, { status: 400 });
    }

    await deleteProcessorConfig(
      tenantId,
      params.id,
      context.user?.id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Payment Processors API] Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete processor config' },
      { status: 400 }
    );
  }
});
