/**
 * Admin Tenants API
 *
 * SaaS owner endpoint for managing all tenants.
 * - View all tenants and their usage
 * - Change tenant plans
 * - Set custom limits/overrides
 * - Suspend/reactivate tenants
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { TenantPlan, TenantStatus } from '@/lib/tenant';

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
 * GET /api/admin/tenants
 * List all tenants with usage and billing info
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
    const status = searchParams.get('status');
    const plan = searchParams.get('plan');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Note: For complex filtering, we'd normally use a query builder
    // For now, fetch all and filter in memory for simplicity
    const allTenants = await sql`
      SELECT
        t.*,
        u.envelopes_sent,
        u.sms_sent,
        u.api_calls,
        u.storage_bytes,
        (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id AND tu.status = 'active') as team_size
      FROM tenants t
      LEFT JOIN tenant_usage u ON t.id = u.tenant_id
        AND u.period_start = date_trunc('month', CURRENT_DATE)
      ORDER BY t.created_at DESC
    `.catch(() => []);

    // Filter in memory
    let filtered = allTenants;

    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }
    if (plan) {
      filtered = filtered.filter((t) => t.plan === plan);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((t) =>
        t.name?.toLowerCase().includes(searchLower) ||
        t.slug?.toLowerCase().includes(searchLower) ||
        t.id?.toLowerCase().includes(searchLower)
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    const tenants = paginated.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      status: row.status,
      ownerId: row.owner_id,
      settings: row.settings || {},
      billing: row.billing || { status: 'active' },
      usage: {
        envelopesSent: parseInt(row.envelopes_sent) || 0,
        smsSent: parseInt(row.sms_sent) || 0,
        apiCalls: parseInt(row.api_calls) || 0,
        storageBytes: parseInt(row.storage_bytes) || 0,
      },
      teamSize: parseInt(row.team_size) || 0,
      createdAt: row.created_at?.toISOString() || '',
      updatedAt: row.updated_at?.toISOString() || '',
    }));

    // Get aggregate stats
    const stats = {
      totalTenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.status === 'active').length,
      byPlan: allTenants.reduce((acc: Record<string, number>, t) => {
        acc[t.plan] = (acc[t.plan] || 0) + 1;
        return acc;
      }, {}),
      totalEnvelopes: allTenants.reduce((sum, t) => sum + (parseInt(t.envelopes_sent) || 0), 0),
    };

    return NextResponse.json({
      success: true,
      tenants,
      total,
      limit,
      offset,
      stats,
    });
  } catch (error) {
    console.error('[AdminTenants] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tenants
 * Update a tenant - change plan, status, or set custom overrides
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
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    // Check tenant exists
    const existing = await sql`SELECT * FROM tenants WHERE id = ${tenantId}`;
    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const tenant = existing[0];

    switch (action) {
      case 'changePlan': {
        const { newPlan } = data;
        if (!newPlan || !['free', 'starter', 'professional', 'enterprise'].includes(newPlan)) {
          return NextResponse.json(
            { error: 'Invalid plan' },
            { status: 400 }
          );
        }

        await sql`
          UPDATE tenants
          SET plan = ${newPlan}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        console.log('[AdminTenants] Changed plan for', tenantId, 'to', newPlan);
        return NextResponse.json({
          success: true,
          message: `Plan changed to ${newPlan}`,
        });
      }

      case 'changeStatus': {
        const { newStatus } = data;
        if (!newStatus || !['active', 'suspended', 'pending', 'cancelled'].includes(newStatus)) {
          return NextResponse.json(
            { error: 'Invalid status' },
            { status: 400 }
          );
        }

        await sql`
          UPDATE tenants
          SET status = ${newStatus}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        console.log('[AdminTenants] Changed status for', tenantId, 'to', newStatus);
        return NextResponse.json({
          success: true,
          message: `Status changed to ${newStatus}`,
        });
      }

      case 'setCustomLimits': {
        const { limits } = data;
        if (!limits || typeof limits !== 'object') {
          return NextResponse.json(
            { error: 'Limits object is required' },
            { status: 400 }
          );
        }

        // Merge custom limits into settings.features
        const currentSettings = tenant.settings || {};
        const updatedSettings = {
          ...currentSettings,
          features: {
            ...(currentSettings.features || {}),
            ...limits,
          },
          customLimitsSetBy: 'admin',
          customLimitsSetAt: new Date().toISOString(),
        };

        await sql`
          UPDATE tenants
          SET settings = ${JSON.stringify(updatedSettings)}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        console.log('[AdminTenants] Set custom limits for', tenantId, limits);
        return NextResponse.json({
          success: true,
          message: 'Custom limits applied',
          limits,
        });
      }

      case 'clearCustomLimits': {
        const currentSettings = tenant.settings || {};
        const { features, customLimitsSetBy, customLimitsSetAt, ...rest } = currentSettings;

        await sql`
          UPDATE tenants
          SET settings = ${JSON.stringify(rest)}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        console.log('[AdminTenants] Cleared custom limits for', tenantId);
        return NextResponse.json({
          success: true,
          message: 'Custom limits cleared - using plan defaults',
        });
      }

      case 'extendTrial': {
        const { days } = data;
        if (!days || typeof days !== 'number') {
          return NextResponse.json(
            { error: 'Days is required' },
            { status: 400 }
          );
        }

        const currentBilling = tenant.billing || {};
        const currentEnd = currentBilling.currentPeriodEnd
          ? new Date(currentBilling.currentPeriodEnd)
          : new Date();

        currentEnd.setDate(currentEnd.getDate() + days);

        const updatedBilling = {
          ...currentBilling,
          status: 'trialing',
          currentPeriodEnd: currentEnd.toISOString(),
        };

        await sql`
          UPDATE tenants
          SET billing = ${JSON.stringify(updatedBilling)}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        console.log('[AdminTenants] Extended trial for', tenantId, 'by', days, 'days');
        return NextResponse.json({
          success: true,
          message: `Trial extended by ${days} days`,
          newEndDate: currentEnd.toISOString(),
        });
      }

      case 'resetUsage': {
        // Reset current period usage to 0
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

        await sql`
          UPDATE tenant_usage
          SET envelopes_sent = 0, sms_sent = 0, api_calls = 0, updated_at = NOW()
          WHERE tenant_id = ${tenantId}
            AND period_start = ${periodStart.toISOString().split('T')[0]}
        `;

        console.log('[AdminTenants] Reset usage for', tenantId);
        return NextResponse.json({
          success: true,
          message: 'Usage counters reset for current period',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action', validActions: ['changePlan', 'changeStatus', 'setCustomLimits', 'clearCustomLimits', 'extendTrial', 'resetUsage'] },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AdminTenants] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update tenant' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tenants
 * Delete a tenant and all their data (DANGEROUS!)
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
    const tenantId = searchParams.get('id');
    const confirm = searchParams.get('confirm');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    if (confirm !== 'DELETE_ALL_DATA') {
      return NextResponse.json(
        {
          error: 'Confirmation required',
          message: 'Add ?confirm=DELETE_ALL_DATA to permanently delete this tenant and all their data'
        },
        { status: 400 }
      );
    }

    // Delete in order (respecting foreign keys)
    await sql`DELETE FROM tenant_usage WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM tenant_users WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;

    // Also delete their data from other tables
    await sql`DELETE FROM envelope_documents WHERE org_id = ${tenantId}`.catch(() => {});
    await sql`DELETE FROM envelope_signing_sessions WHERE org_id = ${tenantId}`.catch(() => {});
    await sql`DELETE FROM templates WHERE org_id = ${tenantId}`.catch(() => {});
    await sql`DELETE FROM audit_logs WHERE org_id = ${tenantId}`.catch(() => {});

    console.log('[AdminTenants] DELETED tenant and all data:', tenantId);

    return NextResponse.json({
      success: true,
      message: 'Tenant and all associated data permanently deleted',
      warning: 'This action cannot be undone',
    });
  } catch (error) {
    console.error('[AdminTenants] Error deleting:', error);
    return NextResponse.json(
      { error: 'Failed to delete tenant' },
      { status: 500 }
    );
  }
}
