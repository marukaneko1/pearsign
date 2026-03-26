/**
 * Send Invoice API Route
 *
 * POST /api/invoices/:id/send - Send invoice to customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { sendInvoice, getInvoice } from '@/lib/invoices';
import { sendInvoiceReadyEmail } from '@/lib/email-service';

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

    // Send email notification to customer
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pearsign.com';
    const invoiceUrl = `${appUrl}/invoices/${invoice.id}`;

    try {
      const dueDate = invoice.due_date
        ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Upon receipt';

      const invoiceDate = invoice.created_at
        ? new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const amount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: invoice.currency || 'USD',
      }).format(invoice.total);

      await sendInvoiceReadyEmail({
        organizationName: context.tenant.name,
        contactName: invoice.customer_name,
        contactEmail: invoice.customer_email,
        invoiceNumber: invoice.invoice_number,
        invoiceAmount: amount,
        invoiceDate,
        dueDate,
        invoiceUrl,
        billingPortalUrl: invoiceUrl,
        orgId: tenantId,
      });
    } catch (emailError) {
      // Log email failure but don't fail the overall send operation
      console.error('[Invoice API] Email send failed:', emailError);
    }

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
