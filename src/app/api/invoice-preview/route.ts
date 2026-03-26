/**
 * Public Invoice Preview API
 *
 * Generates a sample invoice PDF for testing/preview purposes.
 * This endpoint does not require authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePreviewInvoice } from '@/lib/invoice-pdf';

/**
 * GET /api/invoice-preview
 * Generate and view a sample invoice PDF
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';

    console.log('[Invoice Preview] Generating sample invoice PDF...');

    const pdf = await generatePreviewInvoice();

    console.log('[Invoice Preview] PDF generated, size:', pdf.length, 'bytes');

    const disposition = download ? 'attachment' : 'inline';

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="invoice-preview.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    console.error('[Invoice Preview] Error generating PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate preview invoice',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
