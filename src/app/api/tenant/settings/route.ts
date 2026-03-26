import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getTenantSessionContext, initializeSessionTable } from '@/lib/tenant-session';
import { logSettingsEvent } from '@/lib/audit-log';

export async function GET() {
  try {
    await initializeSessionTable();
    const context = await getTenantSessionContext();

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = context.session.tenantId;

    const rows = await sql`
      SELECT id, name, slug, plan, status, settings, created_at, updated_at
      FROM tenants WHERE id = ${tenantId}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenant = rows[0];

    const usageRows = await sql`
      SELECT envelopes_sent, sms_sent, api_calls, storage_bytes
      FROM tenant_usage
      WHERE tenant_id = ${tenantId}
        AND period_start = date_trunc('month', CURRENT_DATE)
    `.catch(() => []);

    const teamCountRows = await sql`
      SELECT COUNT(*) as count FROM tenant_users
      WHERE tenant_id = ${tenantId} AND status = 'active'
    `.catch(() => [{ count: 0 }]);

    const teamRows = await sql`
      SELECT tu.id, tu.user_id, tu.role, tu.status, tu.created_at,
             u.email, u.first_name, u.last_name
      FROM tenant_users tu
      LEFT JOIN users u ON tu.user_id = u.id
      WHERE tu.tenant_id = ${tenantId}
      ORDER BY tu.created_at ASC
    `.catch(() => []);

    const usage = usageRows.length > 0 ? {
      envelopesSent: parseInt(usageRows[0].envelopes_sent) || 0,
      smsSent: parseInt(usageRows[0].sms_sent) || 0,
      apiCalls: parseInt(usageRows[0].api_calls) || 0,
      storageBytes: parseInt(usageRows[0].storage_bytes) || 0,
    } : { envelopesSent: 0, smsSent: 0, apiCalls: 0, storageBytes: 0 };

    const team = teamRows.map((row: Record<string, unknown>) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email || 'unknown',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      role: row.role,
      status: row.status,
      joinedAt: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        settings: tenant.settings || {},
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
      },
      usage,
      teamCount: parseInt(teamCountRows[0]?.count as string) || 0,
      team,
    });
  } catch (error) {
    console.error('[TenantSettings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch tenant settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initializeSessionTable();
    const context = await getTenantSessionContext();

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = context.session.role;
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can update organization settings' }, { status: 403 });
    }

    const tenantId = context.session.tenantId;
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'updateName': {
        const { name } = body;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
        }
        if (name.trim().length > 100) {
          return NextResponse.json({ error: 'Organization name must be 100 characters or less' }, { status: 400 });
        }

        await sql`
          UPDATE tenants SET name = ${name.trim()}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        await sql`
          UPDATE tenant_sessions SET tenant_name = ${name.trim()}
          WHERE tenant_id = ${tenantId} AND expires_at > NOW()
        `.catch(err => console.warn('[TenantSettings] Failed to sync name to sessions:', err));

        logSettingsEvent({
          orgId: tenantId,
          actorId: context.session.userId,
          actorEmail: context.session.userEmail,
          details: { action: 'updateName', newName: name.trim() },
        });

        return NextResponse.json({ success: true, message: 'Organization name updated' });
      }

      case 'changePlan': {
        const { newPlan } = body;
        if (!newPlan || !['free', 'starter', 'professional', 'enterprise'].includes(newPlan)) {
          return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        if (role !== 'owner') {
          return NextResponse.json({ error: 'Only the organization owner can change the plan' }, { status: 403 });
        }

        await sql`
          UPDATE tenants SET plan = ${newPlan}, updated_at = NOW()
          WHERE id = ${tenantId}
        `;

        await sql`
          UPDATE tenant_sessions SET tenant_plan = ${newPlan}
          WHERE tenant_id = ${tenantId} AND expires_at > NOW()
        `.catch(err => console.warn('[TenantSettings] Failed to sync plan to sessions:', err));

        logSettingsEvent({
          orgId: tenantId,
          actorId: context.session.userId,
          actorEmail: context.session.userEmail,
          details: { action: 'changePlan', newPlan },
        });

        return NextResponse.json({ success: true, message: `Plan changed to ${newPlan}` });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[TenantSettings] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update tenant settings' }, { status: 500 });
  }
}
