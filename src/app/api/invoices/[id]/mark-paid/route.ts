/**
 * Mark Invoice Paid API Route
 *
 * POST /api/invoices/:id/mark-paid - Record manual payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { recordPayment, getInvoice } from '@/lib/invoices';

export const POST = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId, context }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const body = await request.json() as {
      amount?: number;
      transaction_ref?: string;
      payment_method?: string;
    };

    // Verify invoice exists
    const existing = await getInvoice(tenantId, params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Default to remaining balance if no amount specified
    const amount = body.amount ?? (existing.total - existing.amount_paid);

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid payment amount' },
        { status: 400 }
      );
    }

    const invoice = await recordPayment(
      tenantId,
      params.id,
      amount,
      body.transaction_ref,
      context.user?.id,
      body.payment_method
    );

    return NextResponse.json({
      success: true,
      invoice,
      payment_recorded: amount,
    });
  } catch (error) {
    console.error('[Invoice API] Mark paid error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record payment' },
      { status: 400 }
    );
  }
});
