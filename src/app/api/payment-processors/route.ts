/**
 * Payment Processors API Routes
 *
 * GET /api/payment-processors - List tenant's configured processors
 * POST /api/payment-processors - Add new processor config
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  listProcessorConfigs,
  createProcessorConfig,
  getAllProcessorTypes,
  getProcessorDisplayInfo,
  type CreateProcessorConfigInput,
} from '@/lib/invoices';

export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    const configs = await listProcessorConfigs(tenantId, includeInactive);

    // Also include available processor types
    const availableTypes = getAllProcessorTypes().map((type) => ({
      type,
      ...getProcessorDisplayInfo(type),
    }));

    return NextResponse.json({
      configs,
      available_types: availableTypes,
    });
  } catch (error) {
    console.error('[Payment Processors API] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list payment processors' },
      { status: 500 }
    );
  }
});

export const POST = withTenant(async (request: NextRequest, { tenantId, context }: TenantApiContext) => {
  try {
    const body = await request.json() as CreateProcessorConfigInput;

    const config = await createProcessorConfig(
      tenantId,
      body,
      context.user?.id
    );

    // Don't expose credentials in response
    const safeConfig = {
      ...config,
      credentials: undefined,
      has_credentials: true,
    };

    return NextResponse.json(safeConfig, { status: 201 });
  } catch (error) {
    console.error('[Payment Processors API] Create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create processor config' },
      { status: 400 }
    );
  }
});
