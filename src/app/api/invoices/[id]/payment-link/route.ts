/**
 * Payment Link API Route
 *
 * POST /api/invoices/:id/payment-link - Generate a payment link
 * GET /api/invoices/:id/payment-link - Get active payment link
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  generatePaymentLink,
  getActivePaymentLink,
  getInvoice,
} from '@/lib/invoices';

export const POST = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const body = await request.json() as {
      processor_config_id?: string;
    };

    // Verify invoice exists
    const existing = await getInvoice(tenantId, params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const paymentLink = await generatePaymentLink(
      tenantId,
      params.id,
      body.processor_config_id
    );

    return NextResponse.json(paymentLink, { status: 201 });
  } catch (error) {
    console.error('[Invoice API] Payment link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate payment link' },
      { status: 400 }
    );
  }
});

export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const paymentLink = await getActivePaymentLink(params.id);

    if (!paymentLink) {
      return NextResponse.json(
        { error: 'No active payment link' },
        { status: 404 }
      );
    }

    return NextResponse.json(paymentLink);
  } catch (error) {
    console.error('[Invoice API] Get payment link error:', error);
    return NextResponse.json(
      { error: 'Failed to get payment link' },
      { status: 500 }
    );
  }
});
