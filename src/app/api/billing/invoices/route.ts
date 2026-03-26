/**
 * Billing Invoices API
 *
 * Allows authenticated users to view their organization's invoices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { BillingService } from '@/lib/billing-service';

/**
 * GET /api/billing/invoices
 * Get invoices for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const status = searchParams.get('status'); // draft, open, paid, void, uncollectible

      let invoices = await BillingService.getInvoices(tenantId, limit);

      // Filter by status if provided
      if (status) {
        invoices = invoices.filter(inv => inv.status === status);
      }

      return NextResponse.json({
        success: true,
        invoices: invoices.map(inv => ({
          id: inv.id,
          stripeInvoiceId: inv.stripeInvoiceId,
          amount: inv.amount,
          amountFormatted: formatCurrency(inv.amount, inv.currency),
          currency: inv.currency,
          status: inv.status,
          pdfUrl: inv.pdfUrl,
          hostedInvoiceUrl: inv.hostedInvoiceUrl,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          createdAt: inv.createdAt,
        })),
      });
    } catch (error) {
      console.error('[Billing Invoices] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch invoices' },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ['canManageBilling'] }
);

/**
 * Format currency amount
 */
function formatCurrency(cents: number, currency: string = 'usd'): string {
  const amount = cents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return formatter.format(amount);
}
