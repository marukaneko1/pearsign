import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { getInvoiceAuditHistory } from '@/lib/invoices/invoice-audit';

export const GET = withTenant<{ id: string }>(async (
  request: NextRequest,
  { tenantId }: TenantApiContext,
  params?: { id: string }
) => {
  try {
    if (!params?.id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const logs = await getInvoiceAuditHistory(tenantId, params.id);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('[Invoice Audit API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
});
