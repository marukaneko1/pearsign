export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sql } = await import('./lib/db');

    async function runRaw(query: string) {
      try {
        await sql.raw(query);
      } catch {}
    }

    try {
      console.log('[AutoBootstrap] Starting database setup...');

      const { initializeAuthTables } = await import('./lib/auth-service');
      const { TenantService } = await import('./lib/tenant');

      await initializeAuthTables();
      await TenantService.initializeTables();

      try {
        const { initializeAdminTables } = await import('./lib/admin-tenant-service');
        await initializeAdminTables();
      } catch {}

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

      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(255)`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(255)`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS limits JSONB DEFAULT '{}'`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS price_monthly DECIMAL(10,2) DEFAULT 0`);
      await runRaw(`ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS price_yearly DECIMAL(10,2) DEFAULT 0`);

      console.log('[AutoBootstrap] Platform plans table ready');

      const planCount = await sql`SELECT COUNT(*) as count FROM platform_plans`;
      if (parseInt(planCount[0].count) === 0) {
        const defaultPlans = [
          { id: 'free', name: 'Free', description: 'For individuals getting started', priceMonthly: 0, priceYearly: 0, features: ['5 documents per month', '3 templates', '1 user', 'Email support'], limits: { envelopes: 5, templates: 3, teamMembers: 1, sms: 0, apiCalls: 0, storageGb: 0.5 }, featureFlags: { customBranding: false, advancedFields: false, bulkSend: false, fusionForms: false, phoneVerification: false, webhooks: false, apiAccess: false, ssoEnabled: false }, displayOrder: 1 },
          { id: 'starter', name: 'Starter', description: 'For small teams', priceMonthly: 19, priceYearly: 190, features: ['50 documents per month', '10 templates', '3 team members', 'Custom branding', 'Webhooks', 'API access'], limits: { envelopes: 50, templates: 10, teamMembers: 3, sms: 50, apiCalls: 1000, storageGb: 5 }, featureFlags: { customBranding: true, advancedFields: true, bulkSend: false, fusionForms: false, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false }, displayOrder: 2 },
          { id: 'professional', name: 'Professional', description: 'For growing businesses', priceMonthly: 49, priceYearly: 490, features: ['500 documents per month', '100 templates', '15 team members', 'Bulk send', 'FusionForms', 'Phone verification', 'All integrations'], limits: { envelopes: 500, templates: 100, teamMembers: 15, sms: 500, apiCalls: 10000, storageGb: 25 }, featureFlags: { customBranding: true, advancedFields: true, bulkSend: true, fusionForms: true, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: false }, displayOrder: 3 },
          { id: 'enterprise', name: 'Enterprise', description: 'For large organizations', priceMonthly: -1, priceYearly: -1, features: ['Unlimited everything', 'SSO/SAML', 'Custom contract', 'Dedicated support', 'On-premise option'], limits: { envelopes: -1, templates: -1, teamMembers: -1, sms: -1, apiCalls: -1, storageGb: -1 }, featureFlags: { customBranding: true, advancedFields: true, bulkSend: true, fusionForms: true, phoneVerification: true, webhooks: true, apiAccess: true, ssoEnabled: true }, displayOrder: 4 },
        ];
        for (const plan of defaultPlans) {
          await sql`
            INSERT INTO platform_plans (id, name, description, price_monthly, price_yearly, features, limits, feature_flags, display_order)
            VALUES (${plan.id}, ${plan.name}, ${plan.description}, ${plan.priceMonthly}, ${plan.priceYearly}, ${JSON.stringify(plan.features)}, ${JSON.stringify(plan.limits)}, ${JSON.stringify(plan.featureFlags)}, ${plan.displayOrder})
            ON CONFLICT (id) DO NOTHING
          `;
        }
        console.log('[AutoBootstrap] Seeded default plans');
      }

      await sql`
        CREATE TABLE IF NOT EXISTS tenant_sessions (
          id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, tenant_id VARCHAR(255) NOT NULL,
          user_email VARCHAR(255) NOT NULL, user_name VARCHAR(255), role VARCHAR(50) NOT NULL,
          permissions JSONB DEFAULT '{}', tenant_name VARCHAR(255), tenant_plan VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(), ip_address VARCHAR(50), user_agent TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id, tenant_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS tenant_onboarding (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text, tenant_id VARCHAR(255) UNIQUE NOT NULL,
          has_completed_onboarding BOOLEAN DEFAULT false, current_step INTEGER DEFAULT 0,
          steps JSONB DEFAULT '[]', has_demo_data BOOLEAN DEFAULT false, show_walkthrough BOOLEAN DEFAULT true,
          dismissed_at TIMESTAMP WITH TIME ZONE, completed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS integration_configs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id VARCHAR(255) NOT NULL, tenant_id VARCHAR(255),
          integration_type VARCHAR(100) NOT NULL, config JSONB DEFAULT '{}', enabled BOOLEAN DEFAULT false,
          last_tested_at TIMESTAMP WITHOUT TIME ZONE, test_status VARCHAR(50),
          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
          platform_fallback_enabled BOOLEAN DEFAULT false, UNIQUE(org_id, integration_type)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS signer_geo_cache (
          ip VARCHAR(50) PRIMARY KEY, city VARCHAR(255), country VARCHAR(255),
          lat DOUBLE PRECISION, lng DOUBLE PRECISION, cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS tenant_modules (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text, tenant_id VARCHAR(255) NOT NULL,
          module_id VARCHAR(100) NOT NULL, enabled BOOLEAN DEFAULT true, settings JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(tenant_id, module_id)
        )
      `;

      const adminEmail = 'admin@pearsign.com';
      const existing = await sql`SELECT id FROM auth_users WHERE email = ${adminEmail}`;
      if (existing.length === 0) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode('PearSign2026!'), 'PBKDF2', false, ['deriveBits']);
        const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
        const combined = new Uint8Array(salt.length + new Uint8Array(hash).length);
        combined.set(salt);
        combined.set(new Uint8Array(hash), salt.length);
        const binaryStr = Array.from(combined, byte => String.fromCharCode(byte)).join('');
        const passwordHash = `pbkdf2:${btoa(binaryStr)}`;

        const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await sql`INSERT INTO auth_users (id, email, password_hash, first_name, last_name, email_verified) VALUES (${userId}, ${adminEmail}, ${passwordHash}, 'Admin', 'User', true)`;

        const tenantId = `org_${Date.now()}_${Math.random().toString(36).substring(8)}`;
        await sql`INSERT INTO tenants (id, name, plan, status, created_at) VALUES (${tenantId}, 'PearSign', 'professional', 'active', NOW()) ON CONFLICT (id) DO NOTHING`;
        await sql`INSERT INTO tenant_users (id, tenant_id, user_id, role, status, joined_at) VALUES (${`tu_${Date.now()}`}, ${tenantId}, ${userId}, 'owner', 'active', NOW()) ON CONFLICT DO NOTHING`;

        console.log('[AutoBootstrap] Created admin user and tenant:', { userId, tenantId });
      } else {
        const userId = (existing[0] as any).id;
        const tenantCheck = await sql`SELECT tenant_id FROM tenant_users WHERE user_id = ${userId} AND status = 'active' LIMIT 1`;
        if (tenantCheck.length > 0) {
          await sql`UPDATE tenants SET plan = 'professional' WHERE id = ${tenantCheck[0].tenant_id} AND plan NOT IN ('professional', 'enterprise')`;
        }
      }

      console.log('[AutoBootstrap] Database setup complete');
    } catch (error) {
      console.error('[AutoBootstrap] Error during setup:', error);
    }
  }
}
