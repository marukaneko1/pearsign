/**
 * Send Invoice API Route
 *
 * POST /api/invoices/:id/send - Send invoice to customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { sendInvoice, getInvoice } from '@/lib/invoices';

export const POST = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId, context }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    // Verify invoice exists
    const existing = await getInvoice(tenantId, params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const invoice = await sendInvoice(
      tenantId,
      params.id,
      context.user?.id
    );

    // TODO: Actually send email notification
    // This would use the existing email service

    return NextResponse.json({
      success: true,
      invoice,
      message: `Invoice sent to ${invoice.customer_email}`,
    });
  } catch (error) {
    console.error('[Invoice API] Send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invoice' },
      { status: 400 }
    );
  }
});
