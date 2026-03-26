/**
 * Invoice Signature API
 *
 * POST /api/invoices/:id/signature - Request signature for invoice
 * GET /api/invoices/:id/signature - Get signature status
 * DELETE /api/invoices/:id/signature - Cancel signature request
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  sendInvoiceForSignature,
  getInvoiceSignatureStatus,
  cancelSignatureRequest,
} from '@/lib/invoices/invoice-signature-service';

/**
 * POST - Request signature for an invoice
 */
export const POST = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const body = await request.json();

    const result = await sendInvoiceForSignature(tenantId, params.id, {
      invoiceId: params.id,
      message: body.message,
      expirationDays: body.expiration_days || 30,
      enableReminders: body.enable_reminders ?? true,
      reminderInterval: body.reminder_interval || 3,
    });

    return NextResponse.json({
      success: true,
      envelope_id: result.envelopeId,
      signing_url: result.signingUrl,
      message: 'Signature request sent successfully',
    });
  } catch (error) {
    console.error('[Invoice Signature API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to request signature' },
      { status: 400 }
    );
  }
});

/**
 * GET - Get signature status for an invoice
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

    const status = await getInvoiceSignatureStatus(tenantId, params.id);

    return NextResponse.json(status);
  } catch (error) {
    console.error('[Invoice Signature API] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get signature status' },
      { status: 400 }
    );
  }
});

/**
 * DELETE - Cancel a signature request
 */
export const DELETE = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || undefined;

    await cancelSignatureRequest(tenantId, params.id, reason);

    return NextResponse.json({
      success: true,
      message: 'Signature request cancelled',
    });
  } catch (error) {
    console.error('[Invoice Signature API] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel signature request' },
      { status: 400 }
    );
  }
});
