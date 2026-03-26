/**
 * Billing Cron Jobs
 *
 * Automated billing tasks:
 * - Check and send usage warnings (approaching limits)
 * - Send trial ending reminders
 * - Report usage to Stripe for metered billing
 *
 * This endpoint should be called daily by a cron service.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { BillingNotificationService } from '@/lib/billing-notifications';
import { TenantPricingService } from '@/lib/tenant-billing';

// ============== AUTH ==============

function isCronAuthenticated(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret is set, only allow in development
  if (!cronSecret) {
    console.warn('[Billing Cron] No CRON_SECRET set, only allowing in development');
    return process.env.NODE_ENV === 'development';
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === cronSecret) {
    return true;
  }

  const cronHeader = request.headers.get('X-Cron-Secret');
  if (cronHeader === cronSecret) {
    return true;
  }

  return false;
}

// ============== CRON HANDLER ==============

/**
 * POST /api/cron/billing
 * Run billing cron tasks
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Valid cron secret required' },
      { status: 401 }
    );
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tasks: {},
  };

  try {
    const body = await request.json().catch(() => ({}));
    const tasks = body.tasks || ['usageWarnings', 'trialReminders', 'reportUsage'];

    // Task 1: Check usage warnings for all tenants
    if (tasks.includes('usageWarnings')) {
      if (process.env.NODE_ENV !== 'production') console.log('[Billing Cron] Starting usage warning checks...');
      const usageResult = await runUsageWarningChecks();
      results.tasks = { ...results.tasks as Record<string, unknown>, usageWarnings: usageResult };
    }

    // Task 2: Send trial ending reminders
    if (tasks.includes('trialReminders')) {
      if (process.env.NODE_ENV !== 'production') console.log('[Billing Cron] Starting trial ending checks...');
      const trialResult = await runTrialEndingChecks();
      results.tasks = { ...results.tasks as Record<string, unknown>, trialReminders: trialResult };
    }

    // Task 3: Report usage to Stripe
    if (tasks.includes('reportUsage')) {
      if (process.env.NODE_ENV !== 'production') console.log('[Billing Cron] Starting Stripe usage reporting...');
      const stripeResult = await runStripeUsageReporting();
      results.tasks = { ...results.tasks as Record<string, unknown>, reportUsage: stripeResult };
    }

    if (process.env.NODE_ENV !== 'production') console.log('[Billing Cron] All tasks completed:', results);
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('[Billing Cron] Error:', error);
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        ...results
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/billing
 * Status check for the cron endpoint
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthenticated(request)) {
    return NextResponse.json({ status: 'requires_auth' });
  }

  return NextResponse.json({
    status: 'ok',
    endpoint: 'billing-cron',
    tasks: [
      { id: 'usageWarnings', description: 'Check and notify tenants approaching usage limits' },
      { id: 'trialReminders', description: 'Send reminders for trials ending soon' },
      { id: 'reportUsage', description: 'Report metered usage to Stripe' },
    ],
    usage: 'POST with { tasks: ["usageWarnings", "trialReminders", "reportUsage"] }',
  });
}

// ============== TASK IMPLEMENTATIONS ==============

/**
 * Check all active tenants for usage warnings
 */
async function runUsageWarningChecks(): Promise<{ checked: number; notified: number; errors: number }> {
  let checked = 0;
  let notified = 0;
  let errors = 0;

  try {
    // Get all active tenants
    const tenants = await sql`
      SELECT id FROM tenants WHERE status = 'active'
    `;

    for (const tenant of tenants) {
      checked++;
      try {
        await BillingNotificationService.checkAndNotifyUsageWarnings(tenant.id as string, 80);
        notified++;
      } catch (error) {
        console.error(`[Billing Cron] Usage warning check failed for ${tenant.id}:`, error);
        errors++;
      }
    }
  } catch (error) {
    console.error('[Billing Cron] Failed to fetch tenants for usage warnings:', error);
    errors++;
  }

  return { checked, notified, errors };
}

/**
 * Check and send trial ending reminders
 */
async function runTrialEndingChecks(): Promise<{ checked: string[]; notified: number; errors: number }> {
  const checked: string[] = [];
  let notified = 0;
  let errors = 0;

  // Check for trials ending in 7 days, 3 days, and 1 day
  const reminderDays = [7, 3, 1];

  for (const days of reminderDays) {
    checked.push(`${days}_days`);
    try {
      await BillingNotificationService.checkAndNotifyTrialEnding(days);
      notified++;
    } catch (error) {
      console.error(`[Billing Cron] Trial ending check failed for ${days} days:`, error);
      errors++;
    }
  }

  return { checked, notified, errors };
}

/**
 * Report usage to Stripe for metered billing
 */
async function runStripeUsageReporting(): Promise<{ reported: number; skipped: number; errors: number }> {
  let reported = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get tenants with custom pricing and Stripe subscriptions
    const tenantsWithStripe = await sql`
      SELECT org_id
      FROM tenant_pricing
      WHERE billing_mode = 'custom'
        AND stripe_subscription_id IS NOT NULL
    `;

    for (const tenant of tenantsWithStripe) {
      try {
        await TenantPricingService.reportUsageToStripe(tenant.org_id as string);
        reported++;
      } catch (error) {
        console.error(`[Billing Cron] Stripe usage report failed for ${tenant.org_id}:`, error);
        errors++;
      }
    }

    skipped = (await sql`SELECT COUNT(*) as count FROM tenants WHERE status = 'active'`)[0]?.count - tenantsWithStripe.length;
  } catch (error) {
    console.error('[Billing Cron] Failed to report usage to Stripe:', error);
    errors++;
  }

  return { reported, skipped, errors };
}
