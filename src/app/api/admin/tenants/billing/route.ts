/**
 * Admin Tenant Billing API
 *
 * Manage tenant billing, limits, and custom pricing.
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TenantLimitsService,
  TenantRateLimiter,
  TenantPricingService,
  initializeTenantBillingTables,
  DEFAULT_LIMITS,
} from '@/lib/tenant-billing';
import { logAdminAction } from '@/lib/admin-tenant-service';

// ============== AUTH HELPER ==============

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

// ============== API HANDLERS ==============

/**
 * GET /api/admin/tenants/billing
 * Get billing info for a tenant or list of all billing summaries
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const action = searchParams.get('action');

    // Initialize tables if needed
    if (action === 'init') {
      await initializeTenantBillingTables();
      return NextResponse.json({ success: true, message: 'Billing tables initialized' });
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId parameter' },
        { status: 400 }
      );
    }

    // Get full billing summary for a specific tenant
    const summary = await TenantPricingService.getBillingSummary(tenantId);
    const limits = await TenantLimitsService.getLimits(tenantId);

    return NextResponse.json({
      success: true,
      tenantId,
      limits,
      pricing: summary.pricing,
      currentUsage: summary.currentUsage,
      projectedInvoice: summary.projectedInvoice,
      invoices: summary.invoices,
      defaultLimits: DEFAULT_LIMITS,
    });
  } catch (error) {
    console.error('[AdminBilling] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get billing info', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tenants/billing
 * Update tenant limits or pricing
 */
export async function PUT(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { tenantId, action, ...data } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'setLimits': {
        const limits = await TenantLimitsService.setLimits(tenantId, {
          apiPerMinute: data.apiPerMinute,
          apiPerDay: data.apiPerDay,
          apiPerMonth: data.apiPerMonth,
          envelopesPerMonth: data.envelopesPerMonth,
          templatesMax: data.templatesMax,
          teamMembersMax: data.teamMembersMax,
          webhooksPerDay: data.webhooksPerDay,
          smsPerMonth: data.smsPerMonth,
          storageGb: data.storageGb,
        }, 'admin');

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.limits.set',
          targetType: 'tenant',
          targetId: tenantId,
          details: { limits: data },
        });

        return NextResponse.json({
          success: true,
          message: 'Custom limits applied',
          limits,
        });
      }

      case 'clearLimits': {
        await TenantLimitsService.clearLimits(tenantId);

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.limits.cleared',
          targetType: 'tenant',
          targetId: tenantId,
          details: {},
        });

        return NextResponse.json({
          success: true,
          message: 'Custom limits cleared - using plan defaults',
        });
      }

      case 'setPricing': {
        const pricing = await TenantPricingService.setPricing(tenantId, {
          billingMode: data.billingMode,
          monthlyBaseFee: data.monthlyBaseFee,
          envelopePrice: data.envelopePrice,
          envelopesIncluded: data.envelopesIncluded,
          apiOveragePrice: data.apiOveragePrice,
          apiCallsIncluded: data.apiCallsIncluded,
          smsPrice: data.smsPrice,
          discount: data.discount,
          currency: data.currency,
          billingCycleDay: data.billingCycleDay,
          notes: data.notes,
        }, 'admin');

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.pricing.set',
          targetType: 'tenant',
          targetId: tenantId,
          details: { pricing: data },
        });

        return NextResponse.json({
          success: true,
          message: 'Custom pricing applied',
          pricing,
        });
      }

      case 'createStripeCustomer': {
        const customerId = await TenantPricingService.createStripeCustomer(
          tenantId,
          data.tenantName || tenantId,
          data.email
        );

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.stripe.customer.created',
          targetType: 'tenant',
          targetId: tenantId,
          details: { stripeCustomerId: customerId },
        });

        return NextResponse.json({
          success: true,
          message: 'Stripe customer created',
          stripeCustomerId: customerId,
        });
      }

      case 'linkStripe': {
        const pricing = await TenantPricingService.setPricing(tenantId, {
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripePriceId: data.stripePriceId,
        }, 'admin');

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.stripe.linked',
          targetType: 'tenant',
          targetId: tenantId,
          details: {
            stripeCustomerId: data.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Stripe account linked',
          pricing,
        });
      }

      case 'reportUsage': {
        await TenantPricingService.reportUsageToStripe(tenantId);

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.usage.reported',
          targetType: 'tenant',
          targetId: tenantId,
          details: {},
        });

        return NextResponse.json({
          success: true,
          message: 'Usage reported to Stripe',
        });
      }

      case 'calculateInvoice': {
        const invoice = await TenantPricingService.calculateInvoice(tenantId);

        return NextResponse.json({
          success: true,
          invoice,
        });
      }

      default:
        return NextResponse.json(
          {
            error: 'Unknown action',
            validActions: [
              'setLimits',
              'clearLimits',
              'setPricing',
              'createStripeCustomer',
              'linkStripe',
              'reportUsage',
              'calculateInvoice',
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AdminBilling] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update billing', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants/billing
 * Initialize billing tables or create invoice
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action, tenantId } = body;

    switch (action) {
      case 'init': {
        await initializeTenantBillingTables();

        await logAdminAction({
          adminId: 'admin',
          action: 'billing.tables.initialized',
          targetType: 'system',
          details: {},
        });

        return NextResponse.json({
          success: true,
          message: 'Billing tables initialized',
        });
      }

      case 'generateInvoice': {
        if (!tenantId) {
          return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
        }

        const invoice = await TenantPricingService.calculateInvoice(tenantId);

        await logAdminAction({
          adminId: 'admin',
          action: 'tenant.invoice.generated',
          targetType: 'tenant',
          targetId: tenantId,
          details: { total: invoice.total },
        });

        return NextResponse.json({
          success: true,
          invoice,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action', validActions: ['init', 'generateInvoice'] },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AdminBilling] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
