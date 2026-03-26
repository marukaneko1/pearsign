/**
 * Invoice Stats API Route
 *
 * GET /api/invoices/stats - Get invoice statistics
 *
 * HARDENED: Returns empty stats on error instead of 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { getInvoiceStats } from '@/lib/invoices';

// Default empty stats for when no invoices exist or on error
const EMPTY_STATS = {
  total_invoices: 0,
  total_amount: 0,
  total_paid: 0,
  outstanding_amount: 0,
  draft_count: 0,
  sent_count: 0,
  viewed_count: 0,
  signed_count: 0,
  partially_paid_count: 0,
  paid_count: 0,
  overdue_count: 0,
  overdue_amount: 0,
};

export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    console.log(`[Invoice Stats API] GET for tenant: ${tenantId}`);

    const stats = await getInvoiceStats(tenantId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Invoice Stats API] Error:', error);
    // Return empty stats instead of 500 error
    console.log(`[Invoice Stats API] Returning empty stats for tenant: ${tenantId}`);
    return NextResponse.json(EMPTY_STATS);
  }
});
