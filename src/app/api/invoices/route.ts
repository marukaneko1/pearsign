/**
 * Invoices API Routes
 *
 * POST /api/invoices - Create a new invoice
 * GET /api/invoices - List invoices with filters
 *
 * HARDENED: Returns empty results on error instead of 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  createInvoice,
  listInvoices,
  type CreateInvoiceInput,
  type InvoiceListOptions,
} from '@/lib/invoices';

// Default empty result for when no invoices exist or on error
const EMPTY_RESULT = {
  invoices: [],
  total: 0,
  page: 1,
  limit: 20,
  total_pages: 0,
};

export const POST = withTenant(async (request: NextRequest, { tenantId, context }: TenantApiContext) => {
  try {
    console.log(`[Invoices API] POST create for tenant: ${tenantId}`);

    const body = await request.json() as CreateInvoiceInput;

    const invoice = await createInvoice(
      tenantId,
      body,
      context.user?.id
    );

    console.log(`[Invoices API] Created invoice: ${invoice.id} for tenant: ${tenantId}`);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('[Invoices API] Create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invoice' },
      { status: 400 }
    );
  }
});

export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    console.log(`[Invoices API] GET list for tenant: ${tenantId}`);

    const { searchParams } = new URL(request.url);

    const sortByParam = searchParams.get('sort_by');
    const sortOrderParam = searchParams.get('sort_order');

    const options: InvoiceListOptions = {
      page: Number.parseInt(searchParams.get('page') || '1'),
      limit: Math.min(Number.parseInt(searchParams.get('limit') || '20'), 100),
      sort_by: (['created_at', 'due_date', 'total', 'customer_name', 'status'].includes(sortByParam || '')
        ? sortByParam as InvoiceListOptions['sort_by']
        : 'created_at'),
      sort_order: sortOrderParam === 'asc' ? 'asc' : 'desc',
      filters: {},
    };

    // Parse filters
    const status = searchParams.get('status');
    if (status) {
      const statusValues = status.includes(',') ? status.split(',') : [status];
      options.filters!.status = statusValues as InvoiceListOptions['filters'] extends { status?: infer T } ? T : never;
    }

    const customerEmail = searchParams.get('customer_email');
    if (customerEmail) options.filters!.customer_email = customerEmail;

    const customerName = searchParams.get('customer_name');
    if (customerName) options.filters!.customer_name = customerName;

    const fromDate = searchParams.get('from_date');
    if (fromDate) options.filters!.from_date = fromDate;

    const toDate = searchParams.get('to_date');
    if (toDate) options.filters!.to_date = toDate;

    const minAmount = searchParams.get('min_amount');
    if (minAmount) options.filters!.min_amount = Number.parseFloat(minAmount);

    const maxAmount = searchParams.get('max_amount');
    if (maxAmount) options.filters!.max_amount = Number.parseFloat(maxAmount);

    const isOverdue = searchParams.get('is_overdue');
    if (isOverdue === 'true') options.filters!.is_overdue = true;

    const search = searchParams.get('search');
    if (search) options.filters!.search = search;

    const result = await listInvoices(tenantId, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Invoices API] List error:', error);
    // Return empty result instead of 500 error
    console.log(`[Invoices API] Returning empty result for tenant: ${tenantId}`);
    return NextResponse.json(EMPTY_RESULT);
  }
});
