import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { SUBSCRIPTION_PLANS } from '@/lib/billing-service';

/**
 * GET /api/settings/billing
 * Fetch billing information for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      // First try to get from billing_info table (legacy)
      const billingData = await sql`
        SELECT
          id,
          organization_id as "organizationId",
          plan,
          billing_email as "billingEmail",
          subscription_status as "subscriptionStatus",
          cancel_at_period_end as "cancelAtPeriodEnd",
          billing_name as "billingName",
          billing_address as "billingAddress",
          payment_method as "paymentMethod",
          current_period_start as "currentPeriodStart",
          current_period_end as "currentPeriodEnd"
        FROM billing_info
        WHERE organization_id = ${tenantId}
      `.catch(() => []);

      // Get plan details
      const plan = context.tenant.plan;
      const planDetails = SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;

      // Get billing from tenant record
      const tenantBilling = context.tenant.billing || { status: 'active' };

      if (billingData.length === 0) {
        // Return billing data from tenant context
        return NextResponse.json({
          id: null,
          organizationId: tenantId,
          plan: plan,
          billingEmail: context.user.email || '',
          subscriptionStatus: tenantBilling.status || 'active',
          cancelAtPeriodEnd: false,
          billingName: context.tenant.name,
          billingAddress: null,
          paymentMethod: null,
          currentPeriodStart: null,
          currentPeriodEnd: tenantBilling.currentPeriodEnd || null,
          // Include plan details
          planDetails: {
            name: planDetails.name,
            description: planDetails.description,
            priceMonthly: planDetails.priceMonthly,
            priceYearly: planDetails.priceYearly,
            features: planDetails.features,
            limits: planDetails.limits,
          },
          // Include current usage limits
          limits: {
            envelopesPerMonth: context.features.maxEnvelopesPerMonth,
            templates: context.features.maxTemplates,
            teamMembers: context.features.maxTeamMembers,
            storageGb: context.features.maxStorageGb,
          },
        });
      }

      // Merge with plan details
      return NextResponse.json({
        ...billingData[0],
        plan: plan, // Use tenant plan as source of truth
        planDetails: {
          name: planDetails.name,
          description: planDetails.description,
          priceMonthly: planDetails.priceMonthly,
          priceYearly: planDetails.priceYearly,
          features: planDetails.features,
          limits: planDetails.limits,
        },
        limits: {
          envelopesPerMonth: context.features.maxEnvelopesPerMonth,
          templates: context.features.maxTemplates,
          teamMembers: context.features.maxTeamMembers,
          storageGb: context.features.maxStorageGb,
        },
      });
    } catch (error) {
      console.error('Error fetching billing data:', error);
      return NextResponse.json({ error: 'Failed to fetch billing data' }, { status: 500 });
    }
  }
);

/**
 * PATCH /api/settings/billing
 * Update billing information for the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { billingEmail, billingName, billingAddress } = body;
      const now = new Date().toISOString();

      // Check if billing record exists
      const existing = await sql`
        SELECT id FROM billing_info
        WHERE organization_id = ${tenantId}
      `.catch(() => []);

      if (existing.length === 0) {
        // Create new billing record
        const id = `billing-${Date.now()}`;
        await sql`
          INSERT INTO billing_info (
            id, organization_id, plan, billing_email,
            subscription_status, cancel_at_period_end,
            billing_name, billing_address, created_at, updated_at
          ) VALUES (
            ${id}, ${tenantId}, ${context.tenant.plan},
            ${billingEmail || context.user.email || ''}, 'active', false,
            ${billingName || context.tenant.name}, ${billingAddress || null},
            ${now}, ${now}
          )
        `;
      } else {
        // Update existing billing record
        await sql`
          UPDATE billing_info SET
            billing_email = COALESCE(${billingEmail}, billing_email),
            billing_name = COALESCE(${billingName}, billing_name),
            billing_address = COALESCE(${billingAddress}, billing_address),
            updated_at = ${now}
          WHERE organization_id = ${tenantId}
        `;
      }

      // Fetch and return updated billing data
      const updated = await sql`
        SELECT
          id,
          organization_id as "organizationId",
          plan,
          billing_email as "billingEmail",
          subscription_status as "subscriptionStatus",
          cancel_at_period_end as "cancelAtPeriodEnd",
          billing_name as "billingName",
          billing_address as "billingAddress",
          payment_method as "paymentMethod",
          current_period_start as "currentPeriodStart",
          current_period_end as "currentPeriodEnd"
        FROM billing_info
        WHERE organization_id = ${tenantId}
      `;

      return NextResponse.json(updated[0]);
    } catch (error) {
      console.error('Error updating billing data:', error);
      return NextResponse.json({ error: 'Failed to update billing data' }, { status: 500 });
    }
  },
  {
    // Only admins can update billing
    requiredPermissions: ['canManageSettings'],
  }
);
