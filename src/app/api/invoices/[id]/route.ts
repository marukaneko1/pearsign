/**
 * Individual Invoice API Routes
 *
 * GET /api/invoices/:id - Get a single invoice
 * PUT /api/invoices/:id - Update an invoice (draft only)
 * DELETE /api/invoices/:id - Void an invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getInvoice,
  updateInvoice,
  adminUpdateInvoice,
  voidInvoice,
  type UpdateInvoiceInput,
  type AdminUpdateInvoiceInput,
} from '@/lib/invoices';

export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await getInvoice(tenantId, params.id);

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('[Invoice API] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to get invoice' },
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
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const body = await request.json() as UpdateInvoiceInput;

    const invoice = await updateInvoice(
      tenantId,
      params.id,
      body,
      context.user?.id
    );

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('[Invoice API] Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update invoice' },
      { status: 400 }
    );
  }
});

/**
 * PATCH /api/invoices/:id — Admin override update (any status, status change, amount_paid)
 */
export const PATCH = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId, context }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const body = await request.json() as AdminUpdateInvoiceInput;

    const invoice = await adminUpdateInvoice(
      tenantId,
      params.id,
      body,
      context.user?.id
    );

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('[Invoice API] Admin update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update invoice' },
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
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || undefined;

    const invoice = await voidInvoice(
      tenantId,
      params.id,
      reason,
      context.user?.id
    );

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('[Invoice API] Void error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to void invoice' },
      { status: 400 }
    );
  }
});
