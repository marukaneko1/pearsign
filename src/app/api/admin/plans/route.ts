/**
 * Admin Plans API
 *
 * SaaS owner endpoint for managing subscription plans and pricing.
 * This is for the platform owner, not tenant admins.
 *
 * Requires ADMIN_SECRET_KEY environment variable for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// ============== TYPES ==============

interface PlanConfig {
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
    storageGb: number;
  };
  featureFlags: {
    customBranding: boolean;
    advancedFields: boolean;
    bulkSend: boolean;
    fusionForms: boolean;
    phoneVerification: boolean;
    webhooks: boolean;
    apiAccess: boolean;
    ssoEnabled: boolean;
  };
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============== AUTH HELPER ==============

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;

  // If no admin secret is set, deny access
  if (!adminSecret) {
    console.warn('[AdminPlans] ADMIN_SECRET_KEY not configured');
    return false;
  }

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === adminSecret) return true;
  }

  // Check X-Admin-Key header
  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

// ============== DATABASE SETUP ==============

async function ensurePlansTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS platform_plans (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price_monthly DECIMAL(10,2) DEFAULT 0,
      price_yearly DECIMAL(10,2) DEFAULT 0,
      stripe_price_id_monthly VARCHAR(255),
      stripe_price_id_yearly VARCHAR(255),
      features JSONB DEFAULT '[]',
      limits JSONB DEFAULT '{}',
      feature_flags JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Seed default plans if table is empty
  const existing = await sql`SELECT COUNT(*) as count FROM platform_plans`;
  if (parseInt(existing[0].count) === 0) {
    await seedDefaultPlans();
  }
}

async function seedDefaultPlans() {
  const defaultPlans = [
    {
      id: 'free',
      name: 'Free',
      description: 'For individuals getting started',
      priceMonthly: 0,
      priceYearly: 0,
      features: ['5 documents per month', '3 templates', '1 user', 'Email support'],
      limits: { envelopes: 5, templates: 3, teamMembers: 1, sms: 0, apiCalls: 0, storageGb: 0.5 },
      featureFlags: { customBranding: false, advancedFields: false, bulkSend: false, fusionForms: false, phoneVerification: false, webhooks: false, apiAccess: false, ssoEnabled: false },
      displayOrder: 1,
    },
    {
      id: 'starter',
      name: 'Starter',
      description: 'For small teams',
      priceMonthly: 19,
      priceYearly: 190,
      features: ['50 documents per month', '10 templates', '3 team members', 'Custom branding', 'Webhooks', 'API access'],
      limits: { envelopes: 50, templates: 10, teamMembers: 3, sms: 50, apiCalls: 1000, storageGb: 5 },
      featureFlags: { customBranding: true, advancedFields: true, bulkSend: false, fusionForms: false, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false },
      displayOrder: 2,
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'For growing businesses',
      priceMonthly: 49,
      priceYearly: 490,
      features: ['500 documents per month', '100 templates', '15 team members', 'Bulk send', 'FusionForms', 'Phone verification', 'All integrations'],
      limits: { envelopes: 500, templates: 100, teamMembers: 15, sms: 500, apiCalls: 10000, storageGb: 25 },
      featureFlags: { customBranding: true, advancedFields: true, bulkSend: true, fusionForms: true, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false },
      displayOrder: 3,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations',
      priceMonthly: -1, // Custom pricing
      priceYearly: -1,
      features: ['Unlimited everything', 'SSO/SAML', 'Custom contract', 'Dedicated support', 'On-premise option'],
      limits: { envelopes: -1, templates: -1, teamMembers: -1, sms: -1, apiCalls: -1, storageGb: -1 },
      featureFlags: { customBranding: true, advancedFields: true, bulkSend: true, fusionForms: true, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: true },
      displayOrder: 4,
    },
  ];

  for (const plan of defaultPlans) {
    await sql`
      INSERT INTO platform_plans (
        id, name, description, price_monthly, price_yearly,
        features, limits, feature_flags, display_order
      ) VALUES (
        ${plan.id},
        ${plan.name},
        ${plan.description},
        ${plan.priceMonthly},
        ${plan.priceYearly},
        ${JSON.stringify(plan.features)},
        ${JSON.stringify(plan.limits)},
        ${JSON.stringify(plan.featureFlags)},
        ${plan.displayOrder}
      )
    `;
  }

  console.log('[AdminPlans] Seeded default plans');
}

// ============== API HANDLERS ==============

/**
 * GET /api/admin/plans
 * List all plans (admin only)
 */
export async function GET(request: NextRequest) {
  // Authenticate admin
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    await ensurePlansTable();

    const plans = await sql`
      SELECT * FROM platform_plans
      ORDER BY display_order ASC
    `;

    const formattedPlans: PlanConfig[] = plans.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      priceMonthly: parseFloat(row.price_monthly) || 0,
      priceYearly: parseFloat(row.price_yearly) || 0,
      stripePriceIdMonthly: row.stripe_price_id_monthly || '',
      stripePriceIdYearly: row.stripe_price_id_yearly || '',
      features: row.features || [],
      limits: row.limits || {},
      featureFlags: row.feature_flags || {},
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at?.toISOString() || '',
      updatedAt: row.updated_at?.toISOString() || '',
    }));

    // Also get usage statistics
    const stats = await sql`
      SELECT
        plan,
        COUNT(*) as tenant_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM tenants
      GROUP BY plan
    `.catch(() => []);

    const planStats = stats.reduce((acc: Record<string, { count: number; active: number }>, row) => {
      acc[row.plan] = {
        count: parseInt(row.tenant_count) || 0,
        active: parseInt(row.active_count) || 0,
      };
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      plans: formattedPlans,
      stats: planStats,
    });
  } catch (error) {
    console.error('[AdminPlans] Error fetching plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/plans
 * Create a new plan (admin only)
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    await ensurePlansTable();

    const body = await request.json();
    const {
      id,
      name,
      description,
      priceMonthly,
      priceYearly,
      stripePriceIdMonthly,
      stripePriceIdYearly,
      features,
      limits,
      featureFlags,
      displayOrder,
    } = body;

    // Validate required fields
    if (!id || !name) {
      return NextResponse.json(
        { error: 'Plan ID and name are required' },
        { status: 400 }
      );
    }

    // Check if plan already exists
    const existing = await sql`SELECT id FROM platform_plans WHERE id = ${id}`;
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Plan with this ID already exists' },
        { status: 409 }
      );
    }

    await sql`
      INSERT INTO platform_plans (
        id, name, description, price_monthly, price_yearly,
        stripe_price_id_monthly, stripe_price_id_yearly,
        features, limits, feature_flags, display_order
      ) VALUES (
        ${id},
        ${name},
        ${description || ''},
        ${priceMonthly || 0},
        ${priceYearly || 0},
        ${stripePriceIdMonthly || ''},
        ${stripePriceIdYearly || ''},
        ${JSON.stringify(features || [])},
        ${JSON.stringify(limits || {})},
        ${JSON.stringify(featureFlags || {})},
        ${displayOrder || 99}
      )
    `;

    console.log('[AdminPlans] Created new plan:', id);

    return NextResponse.json({
      success: true,
      message: 'Plan created successfully',
      planId: id,
    });
  } catch (error) {
    console.error('[AdminPlans] Error creating plan:', error);
    return NextResponse.json(
      { error: 'Failed to create plan' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/plans
 * Update an existing plan (admin only)
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Check if plan exists
    const existing = await sql`SELECT id FROM platform_plans WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Build update query dynamically
    if (updates.name !== undefined) {
      await sql`UPDATE platform_plans SET name = ${updates.name} WHERE id = ${id}`;
    }
    if (updates.description !== undefined) {
      await sql`UPDATE platform_plans SET description = ${updates.description} WHERE id = ${id}`;
    }
    if (updates.priceMonthly !== undefined) {
      await sql`UPDATE platform_plans SET price_monthly = ${updates.priceMonthly} WHERE id = ${id}`;
    }
    if (updates.priceYearly !== undefined) {
      await sql`UPDATE platform_plans SET price_yearly = ${updates.priceYearly} WHERE id = ${id}`;
    }
    if (updates.stripePriceIdMonthly !== undefined) {
      await sql`UPDATE platform_plans SET stripe_price_id_monthly = ${updates.stripePriceIdMonthly} WHERE id = ${id}`;
    }
    if (updates.stripePriceIdYearly !== undefined) {
      await sql`UPDATE platform_plans SET stripe_price_id_yearly = ${updates.stripePriceIdYearly} WHERE id = ${id}`;
    }
    if (updates.features !== undefined) {
      await sql`UPDATE platform_plans SET features = ${JSON.stringify(updates.features)} WHERE id = ${id}`;
    }
    if (updates.limits !== undefined) {
      await sql`UPDATE platform_plans SET limits = ${JSON.stringify(updates.limits)} WHERE id = ${id}`;
    }
    if (updates.featureFlags !== undefined) {
      await sql`UPDATE platform_plans SET feature_flags = ${JSON.stringify(updates.featureFlags)} WHERE id = ${id}`;
    }
    if (updates.isActive !== undefined) {
      await sql`UPDATE platform_plans SET is_active = ${updates.isActive} WHERE id = ${id}`;
    }
    if (updates.displayOrder !== undefined) {
      await sql`UPDATE platform_plans SET display_order = ${updates.displayOrder} WHERE id = ${id}`;
    }

    // Update timestamp
    await sql`UPDATE platform_plans SET updated_at = NOW() WHERE id = ${id}`;

    console.log('[AdminPlans] Updated plan:', id);

    return NextResponse.json({
      success: true,
      message: 'Plan updated successfully',
      planId: id,
    });
  } catch (error) {
    console.error('[AdminPlans] Error updating plan:', error);
    return NextResponse.json(
      { error: 'Failed to update plan' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/plans
 * Delete a plan (admin only) - only if no tenants are using it
 */
export async function DELETE(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('id');

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Check if any tenants are using this plan
    const tenantsUsingPlan = await sql`
      SELECT COUNT(*) as count FROM tenants WHERE plan = ${planId}
    `.catch(() => [{ count: 0 }]);

    if (parseInt(tenantsUsingPlan[0].count) > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete plan',
          message: `${tenantsUsingPlan[0].count} tenant(s) are currently using this plan. Migrate them first.`
        },
        { status: 409 }
      );
    }

    await sql`DELETE FROM platform_plans WHERE id = ${planId}`;

    console.log('[AdminPlans] Deleted plan:', planId);

    return NextResponse.json({
      success: true,
      message: 'Plan deleted successfully',
    });
  } catch (error) {
    console.error('[AdminPlans] Error deleting plan:', error);
    return NextResponse.json(
      { error: 'Failed to delete plan' },
      { status: 500 }
    );
  }
}
