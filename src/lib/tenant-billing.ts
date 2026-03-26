/**
 * Tenant Billing & Rate Limiting Service
 *
 * Production-ready SaaS billing with:
 * - Per-tenant rate limits (API, envelopes, webhooks)
 * - Custom pricing (base fee, per-envelope, overage)
 * - Stripe integration for metered billing
 * - Database-backed configuration
 *
 * All limits and pricing are stored in the database, not hardcoded.
 */

import { sql } from './db';
import { TenantPlan, PLAN_FEATURES } from './tenant';

// ============== TYPES ==============

export interface TenantLimits {
  orgId: string;
  // Rate limits
  apiPerMinute: number;
  apiPerDay: number;
  apiPerMonth: number;
  // Usage limits
  envelopesPerMonth: number;
  templatesMax: number;
  teamMembersMax: number;
  webhooksPerDay: number;
  smsPerMonth: number;
  storageGb: number;
  // Metadata
  customLimits: boolean; // true if overrides plan defaults
  updatedAt: string;
  updatedBy?: string;
}

export interface TenantPricing {
  orgId: string;
  billingMode: 'plan' | 'custom';
  // Custom pricing
  monthlyBaseFee: number; // in cents
  envelopePrice: number; // per envelope in cents
  envelopesIncluded: number; // included in base fee
  apiOveragePrice: number; // per 1000 API calls in cents
  apiCallsIncluded: number; // included in base fee
  smsPrice: number; // per SMS in cents
  discount: number; // percentage 0-100
  currency: string;
  // Stripe
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  // Billing cycle
  billingCycleDay: number; // 1-28
  nextInvoiceDate?: string;
  lastInvoiceDate?: string;
  // Metadata
  notes?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface TenantUsageCounter {
  orgId: string;
  periodStart: string;
  periodEnd: string;
  // Counters
  apiCalls: number;
  apiCallsMinute: number;
  apiCallsDay: number;
  envelopesSent: number;
  webhooksSent: number;
  smsSent: number;
  storageBytes: number;
  // Last reset timestamps
  lastMinuteReset: string;
  lastDayReset: string;
  updatedAt: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limitType: 'minute' | 'day' | 'month' | 'none';
  current: number;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp
  retryAfter?: number; // Seconds
}

export interface UsageCheckResult {
  allowed: boolean;
  usageType: 'envelopes' | 'templates' | 'team' | 'webhooks' | 'sms' | 'storage' | 'api';
  current: number;
  limit: number;
  remaining: number;
  upgradeRequired: boolean;
}

// ============== DEFAULT LIMITS BY PLAN ==============

const DEFAULT_LIMITS: Record<TenantPlan, Omit<TenantLimits, 'orgId' | 'updatedAt' | 'updatedBy' | 'customLimits'>> = {
  free: {
    apiPerMinute: 20,
    apiPerDay: 200,
    apiPerMonth: 1000,
    envelopesPerMonth: 5,
    templatesMax: 3,
    teamMembersMax: 1,
    webhooksPerDay: 50,
    smsPerMonth: 0,
    storageGb: 0.5,
  },
  starter: {
    apiPerMinute: 60,
    apiPerDay: 1000,
    apiPerMonth: 10000,
    envelopesPerMonth: 50,
    templatesMax: 10,
    teamMembersMax: 3,
    webhooksPerDay: 500,
    smsPerMonth: 50,
    storageGb: 5,
  },
  professional: {
    apiPerMinute: 200,
    apiPerDay: 5000,
    apiPerMonth: 50000,
    envelopesPerMonth: 500,
    templatesMax: 100,
    teamMembersMax: 15,
    webhooksPerDay: 2000,
    smsPerMonth: 500,
    storageGb: 25,
  },
  enterprise: {
    apiPerMinute: 1000,
    apiPerDay: 50000,
    apiPerMonth: -1, // unlimited
    envelopesPerMonth: -1,
    templatesMax: -1,
    teamMembersMax: -1,
    webhooksPerDay: -1,
    smsPerMonth: -1,
    storageGb: -1,
  },
};

// ============== DATABASE INITIALIZATION ==============

export async function initializeTenantBillingTables(): Promise<void> {
  // Tenant limits table
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_limits (
      org_id VARCHAR(255) PRIMARY KEY,
      api_per_minute INTEGER NOT NULL DEFAULT 60,
      api_per_day INTEGER NOT NULL DEFAULT 1000,
      api_per_month INTEGER NOT NULL DEFAULT 10000,
      envelopes_per_month INTEGER NOT NULL DEFAULT 50,
      templates_max INTEGER NOT NULL DEFAULT 10,
      team_members_max INTEGER NOT NULL DEFAULT 5,
      webhooks_per_day INTEGER NOT NULL DEFAULT 500,
      sms_per_month INTEGER NOT NULL DEFAULT 50,
      storage_gb DECIMAL(10,2) NOT NULL DEFAULT 5,
      custom_limits BOOLEAN DEFAULT false,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_by VARCHAR(255)
    )
  `;

  // Tenant pricing table
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_pricing (
      org_id VARCHAR(255) PRIMARY KEY,
      billing_mode VARCHAR(50) NOT NULL DEFAULT 'plan',
      monthly_base_fee INTEGER NOT NULL DEFAULT 0,
      envelope_price INTEGER NOT NULL DEFAULT 0,
      envelopes_included INTEGER NOT NULL DEFAULT 0,
      api_overage_price INTEGER NOT NULL DEFAULT 0,
      api_calls_included INTEGER NOT NULL DEFAULT 0,
      sms_price INTEGER NOT NULL DEFAULT 0,
      discount INTEGER NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'usd',
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      stripe_price_id VARCHAR(255),
      billing_cycle_day INTEGER NOT NULL DEFAULT 1,
      next_invoice_date TIMESTAMP WITH TIME ZONE,
      last_invoice_date TIMESTAMP WITH TIME ZONE,
      notes TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_by VARCHAR(255)
    )
  `;

  // Usage counters with minute/day granularity
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_usage_counters (
      org_id VARCHAR(255) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      api_calls INTEGER DEFAULT 0,
      api_calls_minute INTEGER DEFAULT 0,
      api_calls_day INTEGER DEFAULT 0,
      envelopes_sent INTEGER DEFAULT 0,
      webhooks_sent INTEGER DEFAULT 0,
      sms_sent INTEGER DEFAULT 0,
      storage_bytes BIGINT DEFAULT 0,
      last_minute_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_day_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (org_id, period_start)
    )
  `;

  // Invoice records
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_invoices (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id VARCHAR(255) NOT NULL,
      stripe_invoice_id VARCHAR(255),
      amount INTEGER NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'usd',
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      period_start TIMESTAMP WITH TIME ZONE NOT NULL,
      period_end TIMESTAMP WITH TIME ZONE NOT NULL,
      line_items JSONB DEFAULT '[]',
      pdf_url TEXT,
      hosted_url TEXT,
      paid_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_tenant_limits_org ON tenant_limits(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tenant_pricing_org ON tenant_pricing(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tenant_usage_org ON tenant_usage_counters(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tenant_invoices_org ON tenant_invoices(org_id)`;

  console.log('[TenantBilling] Tables initialized');
}

// ============== LIMITS SERVICE ==============

export const TenantLimitsService = {
  /**
   * Get limits for a tenant (custom or plan defaults)
   */
  async getLimits(orgId: string, plan?: TenantPlan): Promise<TenantLimits> {
    // First try to get custom limits
    const result = await sql`
      SELECT * FROM tenant_limits WHERE org_id = ${orgId}
    `;

    if (result.length > 0 && result[0].custom_limits) {
      return mapLimitsFromDb(result[0]);
    }

    // Fall back to plan defaults
    const tenantPlan = plan || await this.getTenantPlan(orgId);
    const defaults = DEFAULT_LIMITS[tenantPlan] || DEFAULT_LIMITS.free;

    return {
      orgId,
      ...defaults,
      customLimits: false,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Set custom limits for a tenant
   */
  async setLimits(orgId: string, limits: Partial<TenantLimits>, updatedBy?: string): Promise<TenantLimits> {
    const current = await this.getLimits(orgId);

    const result = await sql`
      INSERT INTO tenant_limits (
        org_id, api_per_minute, api_per_day, api_per_month,
        envelopes_per_month, templates_max, team_members_max,
        webhooks_per_day, sms_per_month, storage_gb,
        custom_limits, updated_by
      ) VALUES (
        ${orgId},
        ${limits.apiPerMinute ?? current.apiPerMinute},
        ${limits.apiPerDay ?? current.apiPerDay},
        ${limits.apiPerMonth ?? current.apiPerMonth},
        ${limits.envelopesPerMonth ?? current.envelopesPerMonth},
        ${limits.templatesMax ?? current.templatesMax},
        ${limits.teamMembersMax ?? current.teamMembersMax},
        ${limits.webhooksPerDay ?? current.webhooksPerDay},
        ${limits.smsPerMonth ?? current.smsPerMonth},
        ${limits.storageGb ?? current.storageGb},
        true,
        ${updatedBy || null}
      )
      ON CONFLICT (org_id) DO UPDATE SET
        api_per_minute = EXCLUDED.api_per_minute,
        api_per_day = EXCLUDED.api_per_day,
        api_per_month = EXCLUDED.api_per_month,
        envelopes_per_month = EXCLUDED.envelopes_per_month,
        templates_max = EXCLUDED.templates_max,
        team_members_max = EXCLUDED.team_members_max,
        webhooks_per_day = EXCLUDED.webhooks_per_day,
        sms_per_month = EXCLUDED.sms_per_month,
        storage_gb = EXCLUDED.storage_gb,
        custom_limits = true,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
    `;

    console.log('[TenantLimits] Set custom limits for', orgId, limits);
    return mapLimitsFromDb(result[0]);
  },

  /**
   * Clear custom limits (revert to plan defaults)
   */
  async clearLimits(orgId: string): Promise<void> {
    await sql`
      UPDATE tenant_limits
      SET custom_limits = false, updated_at = NOW()
      WHERE org_id = ${orgId}
    `;
    console.log('[TenantLimits] Cleared custom limits for', orgId);
  },

  /**
   * Get tenant plan from database
   */
  async getTenantPlan(orgId: string): Promise<TenantPlan> {
    const result = await sql`SELECT plan FROM tenants WHERE id = ${orgId}`;
    return (result[0]?.plan as TenantPlan) || 'free';
  },
};

// ============== RATE LIMITING SERVICE ==============

export const TenantRateLimiter = {
  /**
   * Check if an API request is allowed (enforces rate limits)
   */
  async checkRateLimit(orgId: string): Promise<RateLimitResult> {
    const limits = await TenantLimitsService.getLimits(orgId);
    const usage = await this.getOrCreateUsageCounter(orgId);
    const now = Date.now();

    // Check minute limit
    const minuteAge = (now - new Date(usage.lastMinuteReset).getTime()) / 1000;
    if (minuteAge > 60) {
      // Reset minute counter
      await this.resetMinuteCounter(orgId);
      usage.apiCallsMinute = 0;
    }

    if (limits.apiPerMinute !== -1 && usage.apiCallsMinute >= limits.apiPerMinute) {
      return {
        allowed: false,
        limitType: 'minute',
        current: usage.apiCallsMinute,
        limit: limits.apiPerMinute,
        remaining: 0,
        resetAt: Math.floor((new Date(usage.lastMinuteReset).getTime() + 60000) / 1000),
        retryAfter: Math.ceil(60 - minuteAge),
      };
    }

    // Check day limit
    const dayAge = (now - new Date(usage.lastDayReset).getTime()) / 1000;
    if (dayAge > 86400) {
      // Reset day counter
      await this.resetDayCounter(orgId);
      usage.apiCallsDay = 0;
    }

    if (limits.apiPerDay !== -1 && usage.apiCallsDay >= limits.apiPerDay) {
      return {
        allowed: false,
        limitType: 'day',
        current: usage.apiCallsDay,
        limit: limits.apiPerDay,
        remaining: 0,
        resetAt: Math.floor((new Date(usage.lastDayReset).getTime() + 86400000) / 1000),
        retryAfter: Math.ceil(86400 - dayAge),
      };
    }

    // Check month limit
    if (limits.apiPerMonth !== -1 && usage.apiCalls >= limits.apiPerMonth) {
      const periodEnd = new Date(usage.periodEnd);
      return {
        allowed: false,
        limitType: 'month',
        current: usage.apiCalls,
        limit: limits.apiPerMonth,
        remaining: 0,
        resetAt: Math.floor(periodEnd.getTime() / 1000),
        retryAfter: Math.ceil((periodEnd.getTime() - now) / 1000),
      };
    }

    // Increment all counters
    await this.incrementApiCounter(orgId);

    return {
      allowed: true,
      limitType: 'none',
      current: usage.apiCalls + 1,
      limit: limits.apiPerMonth,
      remaining: limits.apiPerMonth === -1 ? Infinity : limits.apiPerMonth - usage.apiCalls - 1,
      resetAt: Math.floor(new Date(usage.periodEnd).getTime() / 1000),
    };
  },

  /**
   * Check usage limit (envelopes, templates, etc.)
   */
  async checkUsageLimit(orgId: string, usageType: UsageCheckResult['usageType']): Promise<UsageCheckResult> {
    const limits = await TenantLimitsService.getLimits(orgId);
    const usage = await this.getOrCreateUsageCounter(orgId);

    let current: number;
    let limit: number;

    switch (usageType) {
      case 'envelopes':
        current = usage.envelopesSent;
        limit = limits.envelopesPerMonth;
        break;
      case 'templates':
        const templateCount = await this.getTemplateCount(orgId);
        current = templateCount;
        limit = limits.templatesMax;
        break;
      case 'team':
        const teamCount = await this.getTeamCount(orgId);
        current = teamCount;
        limit = limits.teamMembersMax;
        break;
      case 'webhooks':
        current = usage.webhooksSent;
        limit = limits.webhooksPerDay;
        break;
      case 'sms':
        current = usage.smsSent;
        limit = limits.smsPerMonth;
        break;
      case 'storage':
        current = usage.storageBytes / (1024 * 1024 * 1024); // Convert to GB
        limit = limits.storageGb;
        break;
      case 'api':
        current = usage.apiCalls;
        limit = limits.apiPerMonth;
        break;
      default:
        current = 0;
        limit = -1;
    }

    const allowed = limit === -1 || current < limit;
    const remaining = limit === -1 ? Infinity : Math.max(0, limit - current);

    return {
      allowed,
      usageType,
      current,
      limit,
      remaining,
      upgradeRequired: !allowed,
    };
  },

  /**
   * Increment usage counter
   */
  async incrementUsage(orgId: string, usageType: 'envelopes' | 'webhooks' | 'sms' | 'storage', amount: number = 1): Promise<void> {
    const field = {
      envelopes: 'envelopes_sent',
      webhooks: 'webhooks_sent',
      sms: 'sms_sent',
      storage: 'storage_bytes',
    }[usageType];

    const usage = await this.getOrCreateUsageCounter(orgId);

    await sql`
      UPDATE tenant_usage_counters
      SET ${sql.unsafe(field)} = ${sql.unsafe(field)} + ${amount}, updated_at = NOW()
      WHERE org_id = ${orgId} AND period_start = ${usage.periodStart}
    `;
  },

  /**
   * Get or create usage counter for current period
   */
  async getOrCreateUsageCounter(orgId: string): Promise<TenantUsageCounter> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const result = await sql`
      INSERT INTO tenant_usage_counters (org_id, period_start, period_end)
      VALUES (${orgId}, ${periodStart.toISOString().split('T')[0]}, ${periodEnd.toISOString().split('T')[0]})
      ON CONFLICT (org_id, period_start) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `;

    return mapUsageFromDb(result[0]);
  },

  async incrementApiCounter(orgId: string): Promise<void> {
    const usage = await this.getOrCreateUsageCounter(orgId);
    await sql`
      UPDATE tenant_usage_counters
      SET
        api_calls = api_calls + 1,
        api_calls_minute = api_calls_minute + 1,
        api_calls_day = api_calls_day + 1,
        updated_at = NOW()
      WHERE org_id = ${orgId} AND period_start = ${usage.periodStart}
    `;
  },

  async resetMinuteCounter(orgId: string): Promise<void> {
    await sql`
      UPDATE tenant_usage_counters
      SET api_calls_minute = 0, last_minute_reset = NOW()
      WHERE org_id = ${orgId}
    `;
  },

  async resetDayCounter(orgId: string): Promise<void> {
    await sql`
      UPDATE tenant_usage_counters
      SET api_calls_day = 0, webhooks_sent = 0, last_day_reset = NOW()
      WHERE org_id = ${orgId}
    `;
  },

  async getTemplateCount(orgId: string): Promise<number> {
    const result = await sql`SELECT COUNT(*) as count FROM templates WHERE org_id = ${orgId}`;
    return parseInt(result[0]?.count) || 0;
  },

  async getTeamCount(orgId: string): Promise<number> {
    const result = await sql`SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ${orgId} AND status = 'active'`;
    return parseInt(result[0]?.count) || 0;
  },

  /**
   * Get rate limit headers for response
   */
  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.resetAt),
    };

    if (result.retryAfter) {
      headers['Retry-After'] = String(result.retryAfter);
    }

    return headers;
  },
};

// ============== PRICING SERVICE ==============

// Type for the pricing service to avoid circular reference
interface IPricingService {
  getPricing(orgId: string): Promise<TenantPricing>;
  setPricing(orgId: string, pricing: Partial<TenantPricing>, updatedBy?: string): Promise<TenantPricing>;
  calculateInvoice(orgId: string): Promise<{
    baseFee: number;
    envelopeCharges: number;
    apiOverageCharges: number;
    smsCharges: number;
    discount: number;
    total: number;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  }>;
  createStripeCustomer(orgId: string, tenantName: string, email?: string): Promise<string>;
  reportUsageToStripe(orgId: string): Promise<void>;
  getBillingSummary(orgId: string): Promise<{
    pricing: TenantPricing;
    currentUsage: TenantUsageCounter;
    projectedInvoice: Awaited<ReturnType<IPricingService['calculateInvoice']>>;
    invoices: Array<{
      id: string;
      amount: number;
      status: string;
      periodStart: string;
      periodEnd: string;
      createdAt: string;
    }>;
  }>;
}

export const TenantPricingService: IPricingService = {
  /**
   * Get pricing for a tenant
   */
  async getPricing(orgId: string): Promise<TenantPricing> {
    const result = await sql`SELECT * FROM tenant_pricing WHERE org_id = ${orgId}`;

    if (result.length > 0) {
      return mapPricingFromDb(result[0]);
    }

    // Return default (plan-based pricing)
    return {
      orgId,
      billingMode: 'plan',
      monthlyBaseFee: 0,
      envelopePrice: 0,
      envelopesIncluded: 0,
      apiOveragePrice: 0,
      apiCallsIncluded: 0,
      smsPrice: 0,
      discount: 0,
      currency: 'usd',
      billingCycleDay: 1,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Set custom pricing for a tenant
   */
  async setPricing(orgId: string, pricing: Partial<TenantPricing>, updatedBy?: string): Promise<TenantPricing> {
    const current = await this.getPricing(orgId);

    const result = await sql`
      INSERT INTO tenant_pricing (
        org_id, billing_mode, monthly_base_fee, envelope_price, envelopes_included,
        api_overage_price, api_calls_included, sms_price, discount, currency,
        stripe_customer_id, stripe_subscription_id, stripe_price_id,
        billing_cycle_day, next_invoice_date, last_invoice_date, notes, updated_by
      ) VALUES (
        ${orgId},
        ${pricing.billingMode ?? current.billingMode},
        ${pricing.monthlyBaseFee ?? current.monthlyBaseFee},
        ${pricing.envelopePrice ?? current.envelopePrice},
        ${pricing.envelopesIncluded ?? current.envelopesIncluded},
        ${pricing.apiOveragePrice ?? current.apiOveragePrice},
        ${pricing.apiCallsIncluded ?? current.apiCallsIncluded},
        ${pricing.smsPrice ?? current.smsPrice},
        ${pricing.discount ?? current.discount},
        ${pricing.currency ?? current.currency},
        ${pricing.stripeCustomerId ?? current.stripeCustomerId ?? null},
        ${pricing.stripeSubscriptionId ?? current.stripeSubscriptionId ?? null},
        ${pricing.stripePriceId ?? current.stripePriceId ?? null},
        ${pricing.billingCycleDay ?? current.billingCycleDay},
        ${pricing.nextInvoiceDate ?? current.nextInvoiceDate ?? null},
        ${pricing.lastInvoiceDate ?? current.lastInvoiceDate ?? null},
        ${pricing.notes ?? current.notes ?? null},
        ${updatedBy || null}
      )
      ON CONFLICT (org_id) DO UPDATE SET
        billing_mode = EXCLUDED.billing_mode,
        monthly_base_fee = EXCLUDED.monthly_base_fee,
        envelope_price = EXCLUDED.envelope_price,
        envelopes_included = EXCLUDED.envelopes_included,
        api_overage_price = EXCLUDED.api_overage_price,
        api_calls_included = EXCLUDED.api_calls_included,
        sms_price = EXCLUDED.sms_price,
        discount = EXCLUDED.discount,
        currency = EXCLUDED.currency,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        billing_cycle_day = EXCLUDED.billing_cycle_day,
        next_invoice_date = EXCLUDED.next_invoice_date,
        last_invoice_date = EXCLUDED.last_invoice_date,
        notes = EXCLUDED.notes,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
    `;

    console.log('[TenantPricing] Set custom pricing for', orgId, pricing);
    return mapPricingFromDb(result[0]);
  },

  /**
   * Calculate invoice amount for current period
   */
  async calculateInvoice(orgId: string): Promise<{
    baseFee: number;
    envelopeCharges: number;
    apiOverageCharges: number;
    smsCharges: number;
    discount: number;
    total: number;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  }> {
    const pricing = await this.getPricing(orgId);
    const usage = await TenantRateLimiter.getOrCreateUsageCounter(orgId);

    const lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = [];

    // Base fee
    const baseFee = pricing.monthlyBaseFee;
    if (baseFee > 0) {
      lineItems.push({
        description: 'Monthly subscription',
        quantity: 1,
        unitPrice: baseFee,
        amount: baseFee,
      });
    }

    // Envelope charges (over included amount)
    const envelopesOverage = Math.max(0, usage.envelopesSent - pricing.envelopesIncluded);
    const envelopeCharges = envelopesOverage * pricing.envelopePrice;
    if (envelopeCharges > 0) {
      lineItems.push({
        description: `Additional envelopes (${envelopesOverage} @ $${(pricing.envelopePrice / 100).toFixed(2)})`,
        quantity: envelopesOverage,
        unitPrice: pricing.envelopePrice,
        amount: envelopeCharges,
      });
    }

    // API overage charges
    const apiOverage = Math.max(0, usage.apiCalls - pricing.apiCallsIncluded);
    const apiOverageUnits = Math.ceil(apiOverage / 1000);
    const apiOverageCharges = apiOverageUnits * pricing.apiOveragePrice;
    if (apiOverageCharges > 0) {
      lineItems.push({
        description: `API overage (${apiOverageUnits}k calls @ $${(pricing.apiOveragePrice / 100).toFixed(2)}/k)`,
        quantity: apiOverageUnits,
        unitPrice: pricing.apiOveragePrice,
        amount: apiOverageCharges,
      });
    }

    // SMS charges
    const smsCharges = usage.smsSent * pricing.smsPrice;
    if (smsCharges > 0) {
      lineItems.push({
        description: `SMS notifications (${usage.smsSent} @ $${(pricing.smsPrice / 100).toFixed(2)})`,
        quantity: usage.smsSent,
        unitPrice: pricing.smsPrice,
        amount: smsCharges,
      });
    }

    // Calculate subtotal and discount
    const subtotal = baseFee + envelopeCharges + apiOverageCharges + smsCharges;
    const discountAmount = Math.round(subtotal * (pricing.discount / 100));
    const total = subtotal - discountAmount;

    if (discountAmount > 0) {
      lineItems.push({
        description: `Discount (${pricing.discount}%)`,
        quantity: 1,
        unitPrice: -discountAmount,
        amount: -discountAmount,
      });
    }

    return {
      baseFee,
      envelopeCharges,
      apiOverageCharges,
      smsCharges,
      discount: discountAmount,
      total,
      lineItems,
    };
  },

  /**
   * Create Stripe customer for tenant
   */
  async createStripeCustomer(orgId: string, tenantName: string, email?: string): Promise<string> {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.warn('[TenantPricing] Stripe not configured');
      return '';
    }

    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

      const customer = await stripe.customers.create({
        name: tenantName,
        email,
        metadata: { orgId },
      });

      await this.setPricing(orgId, { stripeCustomerId: customer.id });

      console.log('[TenantPricing] Created Stripe customer for', orgId, customer.id);
      return customer.id;
    } catch (error) {
      console.error('[TenantPricing] Failed to create Stripe customer:', error);
      throw error;
    }
  },

  /**
   * Report usage to Stripe for metered billing
   */
  async reportUsageToStripe(orgId: string): Promise<void> {
    const pricing = await this.getPricing(orgId);

    if (!pricing.stripeSubscriptionId) {
      console.log('[TenantPricing] No Stripe subscription for', orgId);
      return;
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return;

    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

      const usage = await TenantRateLimiter.getOrCreateUsageCounter(orgId);

      // Get subscription items
      const subscription = await stripe.subscriptions.retrieve(pricing.stripeSubscriptionId);

      for (const item of subscription.items.data) {
        if (item.price.recurring?.usage_type === 'metered') {
          // Report usage based on lookup_key
          const lookupKey = item.price.lookup_key;
          let quantity = 0;

          if (lookupKey?.includes('envelope')) {
            quantity = Math.max(0, usage.envelopesSent - pricing.envelopesIncluded);
          } else if (lookupKey?.includes('api')) {
            quantity = Math.max(0, Math.ceil((usage.apiCalls - pricing.apiCallsIncluded) / 1000));
          } else if (lookupKey?.includes('sms')) {
            quantity = usage.smsSent;
          }

          if (quantity > 0) {
            // Use meter events for newer Stripe API
            await stripe.billing.meterEvents.create({
              event_name: lookupKey || 'usage',
              payload: {
                stripe_customer_id: pricing.stripeCustomerId || '',
                value: String(quantity),
              },
            });
            console.log('[TenantPricing] Reported usage to Stripe:', { orgId, lookupKey, quantity });
          }
        }
      }
    } catch (error) {
      console.error('[TenantPricing] Failed to report usage to Stripe:', error);
    }
  },

  /**
   * Get billing summary for admin
   */
  async getBillingSummary(orgId: string): Promise<{
    pricing: TenantPricing;
    currentUsage: TenantUsageCounter;
    projectedInvoice: Awaited<ReturnType<typeof TenantPricingService.calculateInvoice>>;
    invoices: Array<{
      id: string;
      amount: number;
      status: string;
      periodStart: string;
      periodEnd: string;
      createdAt: string;
    }>;
  }> {
    const [pricing, usage, invoice] = await Promise.all([
      this.getPricing(orgId),
      TenantRateLimiter.getOrCreateUsageCounter(orgId),
      this.calculateInvoice(orgId),
    ]);

    // Query both invoice tables (tenant_invoices and billing_invoices from billing-service)
    // and combine results
    const [tenantInvoices, billingInvoices] = await Promise.all([
      sql`
        SELECT id, amount, currency, status, period_start, period_end, pdf_url, hosted_url, created_at, NULL as stripe_invoice_id
        FROM tenant_invoices
        WHERE org_id = ${orgId}
        ORDER BY created_at DESC
        LIMIT 12
      `.catch(() => []),
      sql`
        SELECT id, amount, currency, status, period_start, period_end, pdf_url, hosted_invoice_url as hosted_url, created_at, stripe_invoice_id
        FROM billing_invoices
        WHERE tenant_id = ${orgId}
        ORDER BY created_at DESC
        LIMIT 12
      `.catch(() => []),
    ]);

    // Combine and deduplicate by stripe_invoice_id or id
    const allInvoices = [...tenantInvoices, ...billingInvoices];
    const seenIds = new Set<string>();
    const uniqueInvoices = allInvoices.filter((inv) => {
      const key = (inv.stripe_invoice_id as string) || (inv.id as string);
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    // Sort by created_at descending and limit to 12
    uniqueInvoices.sort((a, b) => {
      const dateA = new Date(a.created_at as string).getTime();
      const dateB = new Date(b.created_at as string).getTime();
      return dateB - dateA;
    });

    return {
      pricing,
      currentUsage: usage,
      projectedInvoice: invoice,
      invoices: uniqueInvoices.slice(0, 12).map((row) => ({
        id: row.id as string,
        stripeInvoiceId: row.stripe_invoice_id as string | undefined,
        amount: parseInt(row.amount as string) || 0,
        currency: (row.currency as string) || 'usd',
        status: row.status as string,
        periodStart: row.period_start ? (row.period_start as Date).toISOString() : '',
        periodEnd: row.period_end ? (row.period_end as Date).toISOString() : '',
        pdfUrl: row.pdf_url as string | undefined,
        hostedUrl: row.hosted_url as string | undefined,
        createdAt: (row.created_at as Date).toISOString(),
      })),
    };
  },
};

// ============== HELPER FUNCTIONS ==============

function mapLimitsFromDb(row: Record<string, unknown>): TenantLimits {
  return {
    orgId: row.org_id as string,
    apiPerMinute: parseInt(row.api_per_minute as string) || 60,
    apiPerDay: parseInt(row.api_per_day as string) || 1000,
    apiPerMonth: parseInt(row.api_per_month as string) || 10000,
    envelopesPerMonth: parseInt(row.envelopes_per_month as string) || 50,
    templatesMax: parseInt(row.templates_max as string) || 10,
    teamMembersMax: parseInt(row.team_members_max as string) || 5,
    webhooksPerDay: parseInt(row.webhooks_per_day as string) || 500,
    smsPerMonth: parseInt(row.sms_per_month as string) || 50,
    storageGb: parseFloat(row.storage_gb as string) || 5,
    customLimits: row.custom_limits as boolean,
    updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : new Date().toISOString(),
    updatedBy: row.updated_by as string | undefined,
  };
}

function mapPricingFromDb(row: Record<string, unknown>): TenantPricing {
  return {
    orgId: row.org_id as string,
    billingMode: (row.billing_mode as 'plan' | 'custom') || 'plan',
    monthlyBaseFee: parseInt(row.monthly_base_fee as string) || 0,
    envelopePrice: parseInt(row.envelope_price as string) || 0,
    envelopesIncluded: parseInt(row.envelopes_included as string) || 0,
    apiOveragePrice: parseInt(row.api_overage_price as string) || 0,
    apiCallsIncluded: parseInt(row.api_calls_included as string) || 0,
    smsPrice: parseInt(row.sms_price as string) || 0,
    discount: parseInt(row.discount as string) || 0,
    currency: (row.currency as string) || 'usd',
    stripeCustomerId: row.stripe_customer_id as string | undefined,
    stripeSubscriptionId: row.stripe_subscription_id as string | undefined,
    stripePriceId: row.stripe_price_id as string | undefined,
    billingCycleDay: parseInt(row.billing_cycle_day as string) || 1,
    nextInvoiceDate: row.next_invoice_date ? (row.next_invoice_date as Date).toISOString() : undefined,
    lastInvoiceDate: row.last_invoice_date ? (row.last_invoice_date as Date).toISOString() : undefined,
    notes: row.notes as string | undefined,
    updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : new Date().toISOString(),
    updatedBy: row.updated_by as string | undefined,
  };
}

function mapUsageFromDb(row: Record<string, unknown>): TenantUsageCounter {
  return {
    orgId: row.org_id as string,
    periodStart: row.period_start ? (row.period_start as Date).toISOString().split('T')[0] : '',
    periodEnd: row.period_end ? (row.period_end as Date).toISOString().split('T')[0] : '',
    apiCalls: parseInt(row.api_calls as string) || 0,
    apiCallsMinute: parseInt(row.api_calls_minute as string) || 0,
    apiCallsDay: parseInt(row.api_calls_day as string) || 0,
    envelopesSent: parseInt(row.envelopes_sent as string) || 0,
    webhooksSent: parseInt(row.webhooks_sent as string) || 0,
    smsSent: parseInt(row.sms_sent as string) || 0,
    storageBytes: parseInt(row.storage_bytes as string) || 0,
    lastMinuteReset: row.last_minute_reset ? (row.last_minute_reset as Date).toISOString() : new Date().toISOString(),
    lastDayReset: row.last_day_reset ? (row.last_day_reset as Date).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : new Date().toISOString(),
  };
}

export { DEFAULT_LIMITS };
