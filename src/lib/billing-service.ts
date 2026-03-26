/**
 * PearSign Billing Service
 *
 * Stripe integration for:
 * - Subscription management
 * - Payment processing
 * - Usage-based billing
 * - Invoicing
 *
 * Billing is tied to tenant_id, not users.
 */

import { sql } from './db';
import { TenantService, TenantPlan, TenantBilling } from './tenant';
import { BillingNotificationService } from './billing-notifications';

// ============== TYPES ==============

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];
  limits: {
    envelopes: number;
    templates: number;
    teamMembers: number;
    sms: number;
    apiCalls: number;
  };
}

export interface Subscription {
  id: string;
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: TenantPlan;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'incomplete';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  pdfUrl?: string;
  hostedInvoiceUrl?: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  stripePaymentMethodId: string;
  type: 'card' | 'sepa_debit' | 'us_bank_account';
  last4: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  metric: 'envelopes' | 'sms' | 'api_calls' | 'storage';
  quantity: number;
  timestamp: string;
  stripeUsageRecordId?: string;
}

// ============== PLAN DEFINITIONS ==============

export const SUBSCRIPTION_PLANS: Record<TenantPlan, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Trial',
    description: 'Try PearSign with 5 free sends',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    features: [
      '5 document sends total',
      '3 templates',
      '1 user',
      'Email support',
    ],
    limits: {
      envelopes: 5,
      templates: 3,
      teamMembers: 1,
      sms: 0,
      apiCalls: 0,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams',
    priceMonthly: 19,
    priceYearly: 190,
    stripePriceIdMonthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || 'price_starter_monthly',
    stripePriceIdYearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID || 'price_starter_yearly',
    features: [
      '50 documents per month',
      '10 templates',
      '3 team members',
      'Custom branding',
      'Webhooks',
      'API access',
      'Priority email support',
    ],
    limits: {
      envelopes: 50,
      templates: 10,
      teamMembers: 3,
      sms: 50,
      apiCalls: 1000,
    },
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'For growing businesses',
    priceMonthly: 49,
    priceYearly: 490,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
    stripePriceIdYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
    features: [
      '500 documents per month',
      '100 templates',
      '15 team members',
      'Bulk send',
      'FusionForms',
      'Phone verification (2FA)',
      'All integrations',
      'Chat support',
    ],
    limits: {
      envelopes: 500,
      templates: 100,
      teamMembers: 15,
      sms: 500,
      apiCalls: 10000,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthly: -1, // Custom pricing
    priceYearly: -1,
    stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    stripePriceIdYearly: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    features: [
      'Unlimited documents',
      'Unlimited templates',
      'Unlimited team members',
      'SSO/SAML',
      'Custom contract',
      'Dedicated support',
      'SLA guarantee',
      'On-premise option',
    ],
    limits: {
      envelopes: -1, // unlimited
      templates: -1,
      teamMembers: -1,
      sms: -1,
      apiCalls: -1,
    },
  },
};

// ============== BILLING SERVICE ==============

// Lazy one-time guard so tables are created on first use even before instrumentation runs
let _tablesReady = false;
async function ensureBillingTables() {
  if (_tablesReady) return;
  await BillingService.initializeTables();
  _tablesReady = true;
}

export const BillingService = {
  /**
   * Initialize billing tables
   */
  async initializeTables(): Promise<void> {
    // Subscriptions table
    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL UNIQUE,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        current_period_start TIMESTAMP WITH TIME ZONE,
        current_period_end TIMESTAMP WITH TIME ZONE,
        cancel_at_period_end BOOLEAN DEFAULT false,
        trial_end TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Billing invoices table (Stripe billing records, separate from tenant invoicing module)
    await sql`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL,
        stripe_invoice_id VARCHAR(255),
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        status VARCHAR(50) NOT NULL,
        pdf_url TEXT,
        hosted_invoice_url TEXT,
        period_start TIMESTAMP WITH TIME ZONE,
        period_end TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Payment methods table
    await sql`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL,
        stripe_payment_method_id VARCHAR(255),
        type VARCHAR(50) NOT NULL,
        last4 VARCHAR(4),
        brand VARCHAR(50),
        exp_month INTEGER,
        exp_year INTEGER,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Usage records table
    await sql`
      CREATE TABLE IF NOT EXISTS billing_usage_records (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL,
        metric VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        stripe_usage_record_id VARCHAR(255),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON billing_invoices(tenant_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant ON payment_methods(tenant_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON billing_usage_records(tenant_id)
    `;

    if (process.env.NODE_ENV !== 'production') console.log('[BillingService] Tables initialized');
  },

  /**
   * Get subscription for tenant
   */
  async getSubscription(tenantId: string): Promise<Subscription | null> {
    await ensureBillingTables();
    const result = await sql`
      SELECT * FROM subscriptions WHERE tenant_id = ${tenantId}
    `;

    if (result.length === 0) return null;
    return mapSubscriptionFromDb(result[0]);
  },

  /**
   * Create or update subscription
   */
  async upsertSubscription(tenantId: string, data: Partial<Subscription>): Promise<Subscription> {
    await ensureBillingTables();
    const result = await sql`
      INSERT INTO subscriptions (
        tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
        current_period_start, current_period_end, cancel_at_period_end, trial_end
      ) VALUES (
        ${tenantId},
        ${data.stripeCustomerId || null},
        ${data.stripeSubscriptionId || null},
        ${data.plan || 'free'},
        ${data.status || 'active'},
        ${data.currentPeriodStart || null},
        ${data.currentPeriodEnd || null},
        ${data.cancelAtPeriodEnd || false},
        ${data.trialEnd || null}
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
        plan = COALESCE(EXCLUDED.plan, subscriptions.plan),
        status = COALESCE(EXCLUDED.status, subscriptions.status),
        current_period_start = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
        current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
        cancel_at_period_end = COALESCE(EXCLUDED.cancel_at_period_end, subscriptions.cancel_at_period_end),
        trial_end = COALESCE(EXCLUDED.trial_end, subscriptions.trial_end),
        updated_at = NOW()
      RETURNING *
    `;

    return mapSubscriptionFromDb(result[0]);
  },

  /**
   * Get invoices for tenant
   */
  async getInvoices(tenantId: string, limit = 10): Promise<Invoice[]> {
    await ensureBillingTables();
    const result = await sql`
      SELECT * FROM billing_invoices
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return result.map(mapInvoiceFromDb);
  },

  /**
   * Add invoice
   */
  async addInvoice(data: Omit<Invoice, 'id' | 'createdAt'>): Promise<Invoice> {
    const result = await sql`
      INSERT INTO billing_invoices (
        tenant_id, stripe_invoice_id, amount, currency, status,
        pdf_url, hosted_invoice_url, period_start, period_end
      ) VALUES (
        ${data.tenantId},
        ${data.stripeInvoiceId},
        ${data.amount},
        ${data.currency},
        ${data.status},
        ${data.pdfUrl || null},
        ${data.hostedInvoiceUrl || null},
        ${data.periodStart},
        ${data.periodEnd}
      )
      RETURNING *
    `;

    return mapInvoiceFromDb(result[0]);
  },

  /**
   * Get payment methods for tenant
   */
  async getPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
    await ensureBillingTables();
    const result = await sql`
      SELECT * FROM payment_methods
      WHERE tenant_id = ${tenantId}
      ORDER BY is_default DESC, created_at DESC
    `;

    return result.map(mapPaymentMethodFromDb);
  },

  /**
   * Add payment method
   */
  async addPaymentMethod(data: Omit<PaymentMethod, 'id' | 'createdAt'>): Promise<PaymentMethod> {
    // If this is default, remove default from others
    if (data.isDefault) {
      await sql`
        UPDATE payment_methods SET is_default = false
        WHERE tenant_id = ${data.tenantId}
      `;
    }

    const result = await sql`
      INSERT INTO payment_methods (
        tenant_id, stripe_payment_method_id, type, last4, brand, exp_month, exp_year, is_default
      ) VALUES (
        ${data.tenantId},
        ${data.stripePaymentMethodId},
        ${data.type},
        ${data.last4},
        ${data.brand || null},
        ${data.expMonth || null},
        ${data.expYear || null},
        ${data.isDefault}
      )
      RETURNING *
    `;

    return mapPaymentMethodFromDb(result[0]);
  },

  /**
   * Record usage for metered billing
   */
  async recordUsage(tenantId: string, metric: UsageRecord['metric'], quantity: number): Promise<void> {
    await sql`
      INSERT INTO billing_usage_records (tenant_id, metric, quantity)
      VALUES (${tenantId}, ${metric}, ${quantity})
    `;

    // Report to Stripe for metered billing when configured
    // Requires a Stripe subscription item ID stored per-tenant for metered pricing
  },

  /**
   * Get usage summary for current period
   */
  async getUsageSummary(tenantId: string): Promise<Record<string, number>> {
    const subscription = await this.getSubscription(tenantId);

    const periodStart = subscription?.currentPeriodStart
      ? new Date(subscription.currentPeriodStart)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const result = await sql`
      SELECT metric, SUM(quantity) as total
      FROM billing_usage_records
      WHERE tenant_id = ${tenantId}
        AND timestamp >= ${periodStart.toISOString()}
      GROUP BY metric
    `;

    const summary: Record<string, number> = {};
    for (const row of result) {
      summary[row.metric as string] = parseInt(row.total as string) || 0;
    }

    return summary;
  },

  /**
   * Check if tenant can perform action based on limits
   */
  async checkLimit(tenantId: string, metric: 'envelopes' | 'sms' | 'api_calls'): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
  }> {
    // Get tenant plan
    const tenant = await TenantService.getTenantById(tenantId);
    if (!tenant) {
      return { allowed: false, current: 0, limit: 0, remaining: 0 };
    }

    const plan = SUBSCRIPTION_PLANS[tenant.plan];
    const limit = plan.limits[metric === 'api_calls' ? 'apiCalls' : metric];

    // Get current usage
    const usage = await this.getUsageSummary(tenantId);
    const current = usage[metric] || 0;

    // -1 means unlimited
    const allowed = limit === -1 || current < limit;
    const remaining = limit === -1 ? Infinity : Math.max(0, limit - current);

    return { allowed, current, limit, remaining };
  },

  /**
   * Create Stripe checkout session for plan upgrade
   */
  async createCheckoutSession(
    tenantId: string,
    plan: TenantPlan,
    billingPeriod: 'monthly' | 'yearly',
    options?: { successUrl?: string; cancelUrl?: string }
  ): Promise<string> {
    const planInfo = SUBSCRIPTION_PLANS[plan];
    const priceId = billingPeriod === 'monthly'
      ? planInfo.stripePriceIdMonthly
      : planInfo.stripePriceIdYearly;

    if (process.env.NODE_ENV !== 'production') console.log(`[Billing] Creating checkout for tenant ${tenantId}:`, {
      plan,
      billingPeriod,
      priceId,
    });

    // Check if Stripe is configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured. Please set the STRIPE_SECRET_KEY environment variable.');
    }

    // Real Stripe integration
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

    // Get or create Stripe customer
    const subscription = await this.getSubscription(tenantId);
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      // Get tenant info for customer creation
      const tenant = await TenantService.getTenantById(tenantId);
      if (!tenant) throw new Error('Tenant not found');

      const customer = await stripe.customers.create({
        metadata: { tenantId },
        name: tenant.name,
      });
      customerId = customer.id;

      // Save customer ID
      await this.upsertSubscription(tenantId, { stripeCustomerId: customerId });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = options?.successUrl || `${baseUrl}/settings?tab=billing&success=true`;
    const cancelUrl = options?.cancelUrl || `${baseUrl}/settings?tab=billing&cancelled=true`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { tenantId, plan },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session');
    }

    return session.url;
  },

  /**
   * Create a Stripe Checkout session in "setup" mode to collect a payment method.
   * Creates a Stripe customer for the tenant if one doesn't exist yet.
   */
  async createSetupSession(tenantId: string): Promise<string> {
    await ensureBillingTables();
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured. Please set the STRIPE_SECRET_KEY environment variable.');
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

    // Get or create Stripe customer
    const subscription = await this.getSubscription(tenantId).catch(() => null);
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const tenant = await TenantService.getTenantById(tenantId);
      if (!tenant) throw new Error('Tenant not found');

      const customer = await stripe.customers.create({
        metadata: { tenantId },
        name: tenant.name,
      });
      customerId = customer.id;

      // Persist the new customer ID
      await this.upsertSubscription(tenantId, {
        stripeCustomerId: customerId,
        plan: 'free',
        status: 'active',
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: `${baseUrl}/settings?tab=billing&setup=success`,
      cancel_url: `${baseUrl}/settings?tab=billing`,
    });

    if (!session.url) throw new Error('Failed to create setup session');
    return session.url;
  },

  /**
   * Create Stripe customer portal session
   */
  async createPortalSession(tenantId: string): Promise<string> {
    const subscription = await this.getSubscription(tenantId);

    // Check if Stripe is configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured. Please set the STRIPE_SECRET_KEY environment variable.');
    }

    if (!subscription?.stripeCustomerId) {
      throw new Error('No Stripe customer found for tenant. Please subscribe to a plan first.');
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/settings?tab=billing`,
    });

    return session.url;
  },

  /**
   * Handle Stripe webhook event
   */
  async handleWebhookEvent(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }): Promise<void> {
    const { type, data } = event;

    switch (type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = data.object as Record<string, unknown>;
        const metadata = subscription.metadata as Record<string, string> | undefined;
        const tenantId = metadata?.tenantId;

        if (tenantId) {
          // Get previous subscription to detect plan changes
          const previousSub = await this.getSubscription(tenantId);
          const previousPlan = previousSub?.plan || 'free';

          await this.upsertSubscription(tenantId, {
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id as string,
            status: subscription.status as Subscription['status'],
            currentPeriodStart: new Date((subscription.current_period_start as number) * 1000).toISOString(),
            currentPeriodEnd: new Date((subscription.current_period_end as number) * 1000).toISOString(),
            cancelAtPeriodEnd: subscription.cancel_at_period_end as boolean,
          });

          // Update tenant plan
          const items = subscription.items as { data: Array<{ price: { lookup_key?: string } }> };
          const priceKey = items?.data?.[0]?.price?.lookup_key;
          if (priceKey) {
            const plan = priceKey.replace('_monthly', '').replace('_yearly', '') as TenantPlan;
            await TenantService.updateTenant(tenantId, { plan });

            // Send notification if plan changed
            if (type === 'customer.subscription.updated' && previousPlan !== plan) {
              try {
                await BillingNotificationService.notifySubscriptionUpdated({
                  orgId: tenantId,
                  previousPlan: previousPlan.charAt(0).toUpperCase() + previousPlan.slice(1),
                  newPlan: plan.charAt(0).toUpperCase() + plan.slice(1),
                });
              } catch (e) {
                console.error('[Billing] Failed to send subscription update notification:', e);
              }
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = data.object as Record<string, unknown>;
        const metadata = subscription.metadata as Record<string, string> | undefined;
        const tenantId = metadata?.tenantId;

        if (tenantId) {
          await this.upsertSubscription(tenantId, {
            status: 'cancelled',
          });

          // Downgrade to free plan
          await TenantService.updateTenant(tenantId, { plan: 'free' });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = data.object as Record<string, unknown>;
        const metadata = invoice.metadata as Record<string, string> | undefined;
        const tenantId = metadata?.tenantId;

        if (tenantId) {
          await this.addInvoice({
            tenantId,
            stripeInvoiceId: invoice.id as string,
            amount: invoice.amount_paid as number,
            currency: invoice.currency as string,
            status: 'paid',
            pdfUrl: invoice.invoice_pdf as string,
            hostedInvoiceUrl: invoice.hosted_invoice_url as string,
            periodStart: new Date((invoice.period_start as number) * 1000).toISOString(),
            periodEnd: new Date((invoice.period_end as number) * 1000).toISOString(),
          });

          // Send payment received notification
          try {
            const charge = invoice.charge as Record<string, unknown> | undefined;
            const paymentMethodDetails = charge?.payment_method_details as Record<string, unknown> | undefined;
            const card = paymentMethodDetails?.card as Record<string, unknown> | undefined;
            const paymentMethod = card
              ? `${(card.brand as string || 'Card').charAt(0).toUpperCase() + (card.brand as string || 'card').slice(1)} ending in ${card.last4 || '****'}`
              : 'Card';

            await BillingNotificationService.notifyPaymentReceived({
              orgId: tenantId,
              invoiceNumber: invoice.number as string || invoice.id as string,
              amount: invoice.amount_paid as number,
              currency: invoice.currency as string,
              paymentMethod,
              receiptUrl: invoice.hosted_invoice_url as string,
            });
          } catch (e) {
            console.error('[Billing] Failed to send payment received notification:', e);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = data.object as Record<string, unknown>;
        const metadata = invoice.metadata as Record<string, string> | undefined;
        const tenantId = metadata?.tenantId;

        if (tenantId) {
          await this.upsertSubscription(tenantId, {
            status: 'past_due',
          });

          // Update tenant billing status
          await TenantService.updateTenant(tenantId, {
            billing: { status: 'past_due' },
          });

          // Send payment failed notification
          try {
            const lastError = (invoice.last_finalization_error as Record<string, unknown>)?.message as string;
            const failureReason = lastError || 'Payment was declined by your card issuer';

            await BillingNotificationService.notifyPaymentFailed({
              orgId: tenantId,
              invoiceNumber: invoice.number as string || invoice.id as string,
              amount: invoice.amount_due as number,
              currency: invoice.currency as string,
              failureReason,
            });
          } catch (e) {
            console.error('[Billing] Failed to send payment failed notification:', e);
          }
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = data.object;
        const sessionMetadata = session.metadata as Record<string, string> | undefined;
        const sessionTenantId = sessionMetadata?.tenantId;
        const plan = sessionMetadata?.plan;
        if (sessionTenantId && plan) {
          await TenantService.updateTenant(sessionTenantId, { plan: plan as TenantPlan });
          if (process.env.NODE_ENV !== 'production') console.log(`[Stripe] Checkout completed: tenant ${sessionTenantId} upgraded to ${plan}`);
        }
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized': {
        const invoice = data.object as Record<string, unknown>;
        const metadata = invoice.metadata as Record<string, string> | undefined;
        const tenantId = metadata?.tenantId;
        const status = invoice.status as string;

        if (tenantId) {
          // Store the invoice in database (upsert to handle both created and finalized)
          try {
            await sql`
              INSERT INTO billing_invoices (
                tenant_id, stripe_invoice_id, amount, currency, status,
                pdf_url, hosted_invoice_url, period_start, period_end
              ) VALUES (
                ${tenantId},
                ${invoice.id as string},
                ${(invoice.amount_due as number) || 0},
                ${(invoice.currency as string) || 'usd'},
                ${status},
                ${(invoice.invoice_pdf as string) || null},
                ${(invoice.hosted_invoice_url as string) || null},
                ${invoice.period_start ? new Date((invoice.period_start as number) * 1000).toISOString() : new Date().toISOString()},
                ${invoice.period_end ? new Date((invoice.period_end as number) * 1000).toISOString() : new Date().toISOString()}
              )
              ON CONFLICT (stripe_invoice_id) DO UPDATE SET
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                pdf_url = EXCLUDED.pdf_url,
                hosted_invoice_url = EXCLUDED.hosted_invoice_url
            `.catch(async () => {
              // If conflict on stripe_invoice_id fails (column may not have unique constraint), try regular insert
              const existing = await sql`SELECT id FROM billing_invoices WHERE stripe_invoice_id = ${invoice.id as string}`;
              if (existing.length === 0) {
                await this.addInvoice({
                  tenantId,
                  stripeInvoiceId: invoice.id as string,
                  amount: (invoice.amount_due as number) || 0,
                  currency: (invoice.currency as string) || 'usd',
                  status: status as Invoice['status'],
                  pdfUrl: invoice.invoice_pdf as string,
                  hostedInvoiceUrl: invoice.hosted_invoice_url as string,
                  periodStart: invoice.period_start ? new Date((invoice.period_start as number) * 1000).toISOString() : new Date().toISOString(),
                  periodEnd: invoice.period_end ? new Date((invoice.period_end as number) * 1000).toISOString() : new Date().toISOString(),
                });
              }
            });
            if (process.env.NODE_ENV !== 'production') console.log('[Billing] Stored invoice:', invoice.id, 'status:', status);
          } catch (e) {
            console.error('[Billing] Failed to store invoice:', e);
          }

          // Send notification for open invoices (ready for payment)
          if (status === 'open') {
            try {
              const dueDate = invoice.due_date
                ? new Date((invoice.due_date as number) * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              await BillingNotificationService.notifyInvoiceReady({
                orgId: tenantId,
                invoiceNumber: invoice.number as string || invoice.id as string,
                amount: invoice.amount_due as number,
                currency: invoice.currency as string,
                dueDate,
                invoiceUrl: invoice.hosted_invoice_url as string,
              });
            } catch (e) {
              console.error('[Billing] Failed to send invoice ready notification:', e);
            }
          }
        }
        break;
      }

      default:
        if (process.env.NODE_ENV !== 'production') console.log(`[Billing] Unhandled webhook event: ${type}`);
    }
  },
};

// ============== HELPER FUNCTIONS ==============

function mapSubscriptionFromDb(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    stripeCustomerId: row.stripe_customer_id as string,
    stripeSubscriptionId: row.stripe_subscription_id as string,
    plan: row.plan as TenantPlan,
    status: row.status as Subscription['status'],
    currentPeriodStart: row.current_period_start ? (row.current_period_start as Date).toISOString() : '',
    currentPeriodEnd: row.current_period_end ? (row.current_period_end as Date).toISOString() : '',
    cancelAtPeriodEnd: row.cancel_at_period_end as boolean,
    trialEnd: row.trial_end ? (row.trial_end as Date).toISOString() : undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function mapInvoiceFromDb(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    stripeInvoiceId: row.stripe_invoice_id as string,
    amount: parseInt(row.amount as string) || 0,
    currency: row.currency as string,
    status: row.status as Invoice['status'],
    pdfUrl: row.pdf_url as string | undefined,
    hostedInvoiceUrl: row.hosted_invoice_url as string | undefined,
    periodStart: row.period_start ? (row.period_start as Date).toISOString() : '',
    periodEnd: row.period_end ? (row.period_end as Date).toISOString() : '',
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function mapPaymentMethodFromDb(row: Record<string, unknown>): PaymentMethod {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    stripePaymentMethodId: row.stripe_payment_method_id as string,
    type: row.type as PaymentMethod['type'],
    last4: row.last4 as string,
    brand: row.brand as string | undefined,
    expMonth: row.exp_month ? parseInt(row.exp_month as string) : undefined,
    expYear: row.exp_year ? parseInt(row.exp_year as string) : undefined,
    isDefault: row.is_default as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
