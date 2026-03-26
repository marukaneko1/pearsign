import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { initializeAuthTables } from '@/lib/auth-service';
import { TenantService } from '@/lib/tenant';
import { initializeAdminTables } from '@/lib/admin-tenant-service';

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const combined = new Uint8Array(salt.length + new Uint8Array(hash).length);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);

  const binaryStr = Array.from(combined, byte => String.fromCharCode(byte)).join('');
  return `pbkdf2:${btoa(binaryStr)}`;
}

async function fixAllSchemas() {
  const migrations = [
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(255)`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(255)`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS limits JSONB DEFAULT '{}'`,
    `ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'`,
  ];

  for (const migration of migrations) {
    try {
      await sql.unsafe(migration);
    } catch {
      // column may already exist or table doesn't exist yet
    }
  }
}

async function ensurePlatformPlans() {
  try {
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

    const existing = await sql`SELECT COUNT(*) as count FROM platform_plans`;
    if (parseInt(existing[0].count) === 0) {
      const defaultPlans = [
        {
          id: 'free', name: 'Free', description: 'For individuals getting started',
          priceMonthly: 0, priceYearly: 0,
          features: ['5 documents per month', '3 templates', '1 user', 'Email support'],
          limits: { envelopes: 5, templates: 3, teamMembers: 1, sms: 0, apiCalls: 0, storageGb: 0.5 },
          featureFlags: { customBranding: false, advancedFields: false, bulkSend: false, fusionForms: false, phoneVerification: false, webhooks: false, apiAccess: false, ssoEnabled: false },
          displayOrder: 1,
        },
        {
          id: 'starter', name: 'Starter', description: 'For small teams',
          priceMonthly: 19, priceYearly: 190,
          features: ['50 documents per month', '10 templates', '3 team members', 'Custom branding', 'Webhooks', 'API access'],
          limits: { envelopes: 50, templates: 10, teamMembers: 3, sms: 50, apiCalls: 1000, storageGb: 5 },
          featureFlags: { customBranding: true, advancedFields: true, bulkSend: false, fusionForms: false, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false },
          displayOrder: 2,
        },
        {
          id: 'professional', name: 'Professional', description: 'For growing businesses',
          priceMonthly: 49, priceYearly: 490,
          features: ['500 documents per month', '100 templates', '15 team members', 'Bulk send', 'FusionForms', 'Phone verification', 'All integrations'],
          limits: { envelopes: 500, templates: 100, teamMembers: 15, sms: 500, apiCalls: 10000, storageGb: 25 },
          featureFlags: { customBranding: true, advancedFields: true, bulkSend: true, fusionForms: true, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false },
          displayOrder: 3,
        },
        {
          id: 'enterprise', name: 'Enterprise', description: 'For large organizations',
          priceMonthly: -1, priceYearly: -1,
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
            ${plan.id}, ${plan.name}, ${plan.description},
            ${plan.priceMonthly}, ${plan.priceYearly},
            ${JSON.stringify(plan.features)}, ${JSON.stringify(plan.limits)},
            ${JSON.stringify(plan.featureFlags)}, ${plan.displayOrder}
          )
        `;
      }
      console.log('[Bootstrap] Seeded default plans');
    }
  } catch (error) {
    console.error('[Bootstrap] Error with platform_plans:', error);
  }
}

async function ensureAdditionalTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        user_name VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        permissions JSONB DEFAULT '{}',
        tenant_name VARCHAR(255),
        tenant_plan VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ip_address VARCHAR(50),
        user_agent TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id, tenant_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS tenant_onboarding (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) UNIQUE NOT NULL,
        has_completed_onboarding BOOLEAN DEFAULT false,
        current_step INTEGER DEFAULT 0,
        steps JSONB DEFAULT '[]',
        has_demo_data BOOLEAN DEFAULT false,
        show_walkthrough BOOLEAN DEFAULT true,
        dismissed_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant ON tenant_onboarding(tenant_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255),
        integration_type VARCHAR(100) NOT NULL,
        config JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT false,
        last_tested_at TIMESTAMP WITHOUT TIME ZONE,
        test_status VARCHAR(50),
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
        platform_fallback_enabled BOOLEAN DEFAULT false,
        UNIQUE(org_id, integration_type)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS signer_geo_cache (
        ip VARCHAR(50) PRIMARY KEY,
        city VARCHAR(255),
        country VARCHAR(255),
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tenant_modules (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL,
        module_id VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, module_id)
      )
    `;
  } catch (error) {
    console.error('[Bootstrap] Error creating additional tables:', error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    let body: { email?: string; password?: string } = {};
    try {
      body = await request.json();
    } catch {
      // no body provided, use defaults
    }

    const email = (body.email || 'admin@pearsign.com').toLowerCase().trim();
    const password = body.password || 'PearSign2026!';

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    console.log('[Bootstrap] Starting full bootstrap...');

    await initializeAuthTables();
    await TenantService.initializeTables();
    await initializeAdminTables();
    await ensurePlatformPlans();
    await fixAllSchemas();
    await ensureAdditionalTables();

    console.log('[Bootstrap] All tables initialized');

    const existing = await sql`
      SELECT id FROM auth_users WHERE email = ${email}
    `;

    const passwordHash = await hashPassword(password);

    let userId: string;
    let created = false;
    if (existing.length > 0) {
      userId = (existing[0] as any).id;
      await sql`
        UPDATE auth_users
        SET password_hash = ${passwordHash}, email_verified = true, updated_at = NOW()
        WHERE email = ${email}
      `;
    } else {
      userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await sql`
        INSERT INTO auth_users (id, email, password_hash, first_name, last_name, email_verified)
        VALUES (${userId}, ${email}, ${passwordHash}, 'Admin', 'User', true)
      `;
      created = true;
    }

    const tenantCheck = await sql`
      SELECT id FROM tenants WHERE id IN (
        SELECT tenant_id FROM tenant_users WHERE user_id = ${userId} AND status = 'active'
      ) AND status = 'active'
      LIMIT 1
    `;

    let tenantId: string;
    if (tenantCheck.length > 0) {
      tenantId = (tenantCheck[0] as any).id;
    } else {
      tenantId = `org_${Date.now()}_${Math.random().toString(36).substring(8)}`;
      await sql`
        INSERT INTO tenants (id, name, plan, status, created_at)
        VALUES (${tenantId}, 'PearSign', 'professional', 'active', NOW())
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO tenant_users (id, tenant_id, user_id, role, status, joined_at)
        VALUES (${`tu_${Date.now()}`}, ${tenantId}, ${userId}, 'owner', 'active', NOW())
        ON CONFLICT DO NOTHING
      `;
    }

    await sql`
      UPDATE tenants SET plan = 'professional' WHERE id = ${tenantId} AND plan != 'professional'
    `;

    console.log('[Bootstrap] Complete:', { userId, tenantId, email });

    return NextResponse.json({
      success: true,
      message: created ? 'Admin user created' : 'Admin user updated',
      email,
      tenantId,
    });
  } catch (error) {
    console.error('[Bootstrap] Error:', error);
    return NextResponse.json(
      { error: 'Bootstrap failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
