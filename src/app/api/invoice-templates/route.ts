/**
 * Invoice Templates API Routes
 *
 * GET /api/invoice-templates - List templates
 * POST /api/invoice-templates - Create template
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  listInvoiceTemplates,
  createInvoiceTemplate,
  type CreateInvoiceTemplateInput,
} from '@/lib/invoices';

export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    const templates = await listInvoiceTemplates(tenantId, includeInactive);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[Invoice Templates API] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list invoice templates' },
      { status: 500 }
    );
  }
});

export const POST = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const body = await request.json() as CreateInvoiceTemplateInput;

    const template = await createInvoiceTemplate(tenantId, body);

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('[Invoice Templates API] Create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 400 }
    );
  }
});
