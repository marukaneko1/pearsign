/**
 * Invoice PDF API
 *
 * GET /api/invoices/:id/pdf - Generate and download invoice PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { getInvoice } from '@/lib/invoices/invoice-service';
import { generateInvoicePDF } from '@/lib/invoices/invoice-pdf-generator';

/**
 * GET - Generate and download invoice PDF
 */
export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'download'; // 'download' | 'preview'

    // Get invoice
    const invoice = await getInvoice(tenantId, params.id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice, tenantId);

    if (format === 'preview') {
      // Return as base64 for preview
      const base64 = pdfBuffer.toString('base64');
      return NextResponse.json({
        pdf_data: `data:application/pdf;base64,${base64}`,
        filename: `invoice-${invoice.invoice_number}.pdf`,
      });
    }

    // Return as downloadable file
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Invoice PDF API] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    );
  }
});
