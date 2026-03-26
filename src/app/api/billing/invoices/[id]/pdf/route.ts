/**
 * Invoice PDF Download API
 *
 * Generates and downloads a PDF for a specific invoice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { generateInvoicePDFFromDb, generatePreviewInvoice } from '@/lib/invoice-pdf';

/**
 * GET /api/billing/invoices/[id]/pdf
 * Download invoice as PDF
 */
export const GET = withTenant(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      const invoiceId = params?.id;

      if (!invoiceId) {
        return NextResponse.json(
          { error: 'Invoice ID is required' },
          { status: 400 }
        );
      }

      // Special case: preview invoice
      if (invoiceId === 'preview') {
        const pdf = await generatePreviewInvoice();
        return new NextResponse(pdf, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="invoice-preview.pdf"',
            'Content-Length': String(pdf.length),
          },
        });
      }

      // Generate PDF from database
      const result = await generateInvoicePDFFromDb(invoiceId, tenantId);

      if (!result) {
        return NextResponse.json(
          { error: 'Invoice not found or could not generate PDF' },
          { status: 404 }
        );
      }

      const { pdf, filename } = result;

      // Check if user wants to download or view inline
      const download = request.nextUrl.searchParams.get('download') === 'true';
      const disposition = download ? 'attachment' : 'inline';

      return new NextResponse(pdf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${disposition}; filename="${filename}"`,
          'Content-Length': String(pdf.length),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (error) {
      console.error('[Invoice PDF] Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate PDF' },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ['canManageBilling'] }
);
