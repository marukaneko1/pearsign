/**
 * Billing Overview API
 *
 * Provides billing status, subscription info, and usage summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { BillingService, SUBSCRIPTION_PLANS } from '@/lib/billing-service';
import { TenantLimitsService, TenantRateLimiter, TenantPricingService } from '@/lib/tenant-billing';

/**
 * GET /api/billing
 * Get billing overview for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId, context }: TenantApiContext) => {
    try {
      // Get current plan details
      const planId = context.tenant.plan;
      const planDetails = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.free;

      // Fetch each piece of billing data independently so one missing table
      // doesn't kill the whole response.
      const subscription = await BillingService.getSubscription(tenantId).catch(() => null);
      const limits = await TenantLimitsService.getLimits(tenantId, planId).catch(() => ({
        orgId: tenantId, apiPerMinute: 0, apiPerDay: 0, apiPerMonth: 0,
        envelopesPerMonth: 0, templatesMax: 0, teamMembersMax: 0,
        webhooksPerDay: 0, smsPerMonth: 0, storageGb: 0,
        customLimits: false, updatedAt: new Date().toISOString(),
      }));
      const usage = await TenantRateLimiter.getOrCreateUsageCounter(tenantId).catch(() => ({
        orgId: tenantId, periodStart: '', periodEnd: '',
        apiCalls: 0, apiCallsMinute: 0, apiCallsDay: 0,
        envelopesSent: 0, webhooksSent: 0, smsSent: 0,
        storageBytes: 0, lastMinuteReset: '', lastDayReset: '', updatedAt: '',
      }));
      const paymentMethods = await BillingService.getPaymentMethods(tenantId).catch(() => []);
      const invoices = await BillingService.getInvoices(tenantId, 5).catch(() => []);

      // Calculate usage percentages
      const usagePercentages = {
        envelopes: limits.envelopesPerMonth > 0
          ? Math.round((usage.envelopesSent / limits.envelopesPerMonth) * 100)
          : 0,
        apiCalls: limits.apiPerMonth > 0
          ? Math.round((usage.apiCalls / limits.apiPerMonth) * 100)
          : 0,
        sms: limits.smsPerMonth > 0
          ? Math.round((usage.smsSent / limits.smsPerMonth) * 100)
          : 0,
      };

      return NextResponse.json({
        success: true,
        billing: {
          plan: {
            id: planId,
            name: planDetails.name,
            description: planDetails.description,
            priceMonthly: planDetails.priceMonthly,
            priceYearly: planDetails.priceYearly,
            features: planDetails.features,
          },
          subscription: subscription ? {
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            trialEnd: subscription.trialEnd,
          } : null,
          limits: {
            envelopes: { current: usage.envelopesSent, limit: limits.envelopesPerMonth, percentage: usagePercentages.envelopes },
            apiCalls: { current: usage.apiCalls, limit: limits.apiPerMonth, percentage: usagePercentages.apiCalls },
            sms: { current: usage.smsSent, limit: limits.smsPerMonth, percentage: usagePercentages.sms },
            templates: { limit: limits.templatesMax },
            teamMembers: { limit: limits.teamMembersMax },
            storageGb: { limit: limits.storageGb },
          },
          customLimits: limits.customLimits,
          paymentMethods: paymentMethods.map(pm => ({
            id: pm.id,
            type: pm.type,
            last4: pm.last4,
            brand: pm.brand,
            expMonth: pm.expMonth,
            expYear: pm.expYear,
            isDefault: pm.isDefault,
          })),
          recentInvoices: invoices.map(inv => ({
            id: inv.id,
            amount: inv.amount,
            amountFormatted: formatCurrency(inv.amount, inv.currency),
            status: inv.status,
            periodStart: inv.periodStart,
            periodEnd: inv.periodEnd,
            createdAt: inv.createdAt,
            pdfUrl: inv.pdfUrl,
          })),
        },
      });
    } catch (error) {
      console.error('[Billing] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch billing info' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/billing
 * Billing actions: upgrade, portal, checkout
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action, ...data } = body;

      switch (action) {
        case 'createCheckout': {
          const { plan, billingPeriod = 'monthly' } = data;

          if (!plan || !['starter', 'professional', 'enterprise'].includes(plan)) {
            return NextResponse.json(
              { error: 'Invalid plan specified' },
              { status: 400 }
            );
          }

          if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
              { error: 'Stripe billing is not configured for this installation.' },
              { status: 503 }
            );
          }

          const checkoutUrl = await BillingService.createCheckoutSession(
            tenantId,
            plan,
            billingPeriod
          );

          return NextResponse.json({
            success: true,
            checkoutUrl,
          });
        }

        case 'createSetupSession': {
          if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
              { error: 'Stripe billing is not configured for this installation.' },
              { status: 503 }
            );
          }

          const setupUrl = await BillingService.createSetupSession(tenantId);
          return NextResponse.json({ success: true, setupUrl });
        }

        case 'createPortal': {
          if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
              { error: 'Stripe billing is not configured for this installation.' },
              { status: 503 }
            );
          }

          const subscription = await BillingService.getSubscription(tenantId).catch(() => null);
          if (!subscription?.stripeCustomerId) {
            // No customer yet — fall back to setup session so the caller can redirect there
            const setupUrl = await BillingService.createSetupSession(tenantId);
            return NextResponse.json({ success: true, setupUrl });
          }

          const portalUrl = await BillingService.createPortalSession(tenantId);
          return NextResponse.json({ success: true, portalUrl });
        }

        default:
          return NextResponse.json(
            { error: 'Unknown action', validActions: ['createCheckout', 'createPortal', 'createSetupSession'] },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[Billing] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to process request' },
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
