/**
 * Individual Invoice Template API Routes
 *
 * GET /api/invoice-templates/:id - Get template
 * PUT /api/invoice-templates/:id - Update template
 * DELETE /api/invoice-templates/:id - Delete template
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getInvoiceTemplate,
  updateInvoiceTemplate,
  deleteInvoiceTemplate,
  type CreateInvoiceTemplateInput,
} from '@/lib/invoices';

export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const template = await getInvoiceTemplate(tenantId, params.id);

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error('[Invoice Templates API] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to get template' },
      { status: 500 }
    );
  }
});

export const PUT = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const body = await request.json() as Partial<CreateInvoiceTemplateInput>;

    const template = await updateInvoiceTemplate(tenantId, params.id, body);

    return NextResponse.json(template);
  } catch (error) {
    console.error('[Invoice Templates API] Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 400 }
    );
  }
});

export const DELETE = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    await deleteInvoiceTemplate(tenantId, params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Invoice Templates API] Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 400 }
    );
  }
});
