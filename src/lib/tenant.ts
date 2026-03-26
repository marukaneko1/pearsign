/**
 * PearSign Multi-Tenancy System
 *
 * Core tenant management with:
 * - Tenant as the root of everything
 * - Hard tenant enforcement (server-side)
 * - Immutable data boundaries
 * - Billing & feature gating
 * - User & role isolation
 */

import { sql } from './db';
import { cookies } from 'next/headers';

// ============== TYPES ==============

export type TenantPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export type TenantStatus = 'active' | 'suspended' | 'pending' | 'cancelled';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  ownerId: string;
  settings: TenantSettings;
  billing: TenantBilling;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  companyName?: string;

  // Email settings
  fromEmail?: string;
  fromName?: string;

  // Security settings
  requireMfa?: boolean;
  allowedDomains?: string[];
  sessionTimeout?: number; // minutes

  // Feature flags (overrides)
  features?: Partial<PlanFeatures>;
}

export interface TenantBilling {
  customerId?: string; // Stripe customer ID
  subscriptionId?: string;
  currentPeriodEnd?: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  monthlyEnvelopes?: number;
  monthlySmsCount?: number;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: UserRole;
  invitedBy?: string;
  invitedAt?: string;
  joinedAt?: string;
  status: 'pending' | 'active' | 'deactivated';
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissions {
  canSendDocuments: boolean;
  canManageTemplates: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
  canManageBilling: boolean;
  canViewAuditLogs: boolean;
  canManageIntegrations: boolean;
  canUseApi: boolean;
}

export interface PlanFeatures {
  // Limits
  maxEnvelopesPerMonth: number;
  maxTemplates: number;
  maxTeamMembers: number;
  maxApiCallsPerMonth: number;
  maxSmsPerMonth: number;
  maxStorageGb: number;

  // Features
  customBranding: boolean;
  advancedFields: boolean;
  bulkSend: boolean;
  fusionForms: boolean;
  phoneVerification: boolean;
  webhooks: boolean;
  apiAccess: boolean;
  ssoEnabled: boolean;
  auditLogRetentionDays: number;

  // Integrations
  integrations: {
    googleDrive: boolean;
    dropbox: boolean;
    salesforce: boolean;
    slack: boolean;
    zapier: boolean;
    hubspot: boolean;
    teams: boolean;
    notion: boolean;
  };
}

export interface TenantContext {
  tenant: Tenant;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    permissions: UserPermissions;
  };
  features: PlanFeatures;
}

// ============== PLAN FEATURES ==============

export const PLAN_FEATURES: Record<TenantPlan, PlanFeatures> = {
  free: {
    maxEnvelopesPerMonth: 5,
    maxTemplates: 3,
    maxTeamMembers: 1,
    maxApiCallsPerMonth: 0,
    maxSmsPerMonth: 0,
    maxStorageGb: 0.5,
    customBranding: false,
    advancedFields: false,
    bulkSend: false,
    fusionForms: false,
    phoneVerification: false,
    webhooks: false,
    apiAccess: false,
    ssoEnabled: false,
    auditLogRetentionDays: 30,
    integrations: {
      googleDrive: false,
      dropbox: false,
      salesforce: false,
      slack: false,
      zapier: false,
      hubspot: false,
      teams: false,
      notion: false,
    },
  },
  starter: {
    maxEnvelopesPerMonth: 50,
    maxTemplates: 10,
    maxTeamMembers: 3,
    maxApiCallsPerMonth: 1000,
    maxSmsPerMonth: 50,
    maxStorageGb: 5,
    customBranding: true,
    advancedFields: true,
    bulkSend: false,
    fusionForms: false,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
    ssoEnabled: false,
    auditLogRetentionDays: 90,
    integrations: {
      googleDrive: true,
      dropbox: true,
      salesforce: false,
      slack: true,
      zapier: true,
      hubspot: false,
      teams: false,
      notion: false,
    },
  },
  professional: {
    maxEnvelopesPerMonth: 500,
    maxTemplates: 100,
    maxTeamMembers: 15,
    maxApiCallsPerMonth: 10000,
    maxSmsPerMonth: 500,
    maxStorageGb: 25,
    customBranding: true,
    advancedFields: true,
    bulkSend: true,
    fusionForms: true,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
    ssoEnabled: false,
    auditLogRetentionDays: 365,
    integrations: {
      googleDrive: true,
      dropbox: true,
      salesforce: true,
      slack: true,
      zapier: true,
      hubspot: true,
      teams: true,
      notion: true,
    },
  },
  enterprise: {
    maxEnvelopesPerMonth: -1, // unlimited
    maxTemplates: -1,
    maxTeamMembers: -1,
    maxApiCallsPerMonth: -1,
    maxSmsPerMonth: -1,
    maxStorageGb: -1,
    customBranding: true,
    advancedFields: true,
    bulkSend: true,
    fusionForms: true,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
    ssoEnabled: true,
    auditLogRetentionDays: -1, // unlimited
    integrations: {
      googleDrive: true,
      dropbox: true,
      salesforce: true,
      slack: true,
      zapier: true,
      hubspot: true,
      teams: true,
      notion: true,
    },
  },
};

// ============== ROLE PERMISSIONS ==============

export const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  owner: {
    canSendDocuments: true,
    canManageTemplates: true,
    canManageTeam: true,
    canManageSettings: true,
    canManageBilling: true,
    canViewAuditLogs: true,
    canManageIntegrations: true,
    canUseApi: true,
  },
  admin: {
    canSendDocuments: true,
    canManageTemplates: true,
    canManageTeam: true,
    canManageSettings: true,
    canManageBilling: false,
    canViewAuditLogs: true,
    canManageIntegrations: true,
    canUseApi: true,
  },
  member: {
    canSendDocuments: true,
    canManageTemplates: true,
    canManageTeam: false,
    canManageSettings: false,
    canManageBilling: false,
    canViewAuditLogs: false,
    canManageIntegrations: false,
    canUseApi: true,
  },
  viewer: {
    canSendDocuments: false,
    canManageTemplates: false,
    canManageTeam: false,
    canManageSettings: false,
    canManageBilling: false,
    canViewAuditLogs: false,
    canManageIntegrations: false,
    canUseApi: false,
  },
};

// ============== DATABASE OPERATIONS ==============

export const TenantService = {
  /**
   * Initialize tenant tables in the database
   * Uses VARCHAR for IDs for compatibility with existing string-based IDs
   */
  async initializeTables(): Promise<void> {
    // Create tenants table - using VARCHAR for flexibility with existing systems
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        owner_id VARCHAR(255) NOT NULL,
        settings JSONB DEFAULT '{}',
        billing JSONB DEFAULT '{"status": "active"}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create tenant_users table (user-tenant relationship)
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_users (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        invited_by VARCHAR(255),
        invited_at TIMESTAMP WITH TIME ZONE,
        joined_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, user_id)
      )
    `;

    // Create index for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id)
    `;

    // Create tenant usage tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_usage (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        envelopes_sent INTEGER DEFAULT 0,
        sms_sent INTEGER DEFAULT 0,
        api_calls INTEGER DEFAULT 0,
        storage_bytes BIGINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, period_start)
      )
    `;

    // Create template_versions table for versioning
    await sql`
      CREATE TABLE IF NOT EXISTS template_versions (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        template_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255) NOT NULL,
        version INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        fields JSONB DEFAULT '[]',
        signer_roles JSONB DEFAULT '[]',
        document_data TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(template_id, version)
      )
    `;

    console.log('[TenantService] Tables initialized');
  },

  /**
   * Create a new tenant
   */
  async createTenant(data: {
    name: string;
    slug: string;
    ownerId: string;
    ownerEmail: string;
    plan?: TenantPlan;
  }): Promise<Tenant> {
    // Create the tenant
    const result = await sql`
      INSERT INTO tenants (name, slug, owner_id, plan)
      VALUES (${data.name}, ${data.slug}, ${data.ownerId}, ${data.plan || 'free'})
      RETURNING *
    `;

    const tenant = mapTenantFromDb(result[0]);

    // Add owner as tenant user
    await sql`
      INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at, permissions)
      VALUES (
        ${tenant.id},
        ${data.ownerId},
        'owner',
        'active',
        NOW(),
        ${JSON.stringify(ROLE_PERMISSIONS.owner)}
      )
    `;

    // Initialize usage tracking for current period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await sql`
      INSERT INTO tenant_usage (tenant_id, period_start, period_end)
      VALUES (${tenant.id}, ${periodStart.toISOString()}, ${periodEnd.toISOString()})
    `;

    return tenant;
  },

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const result = await sql`
      SELECT * FROM tenants WHERE id = ${tenantId}
    `;

    if (result.length === 0) return null;
    return mapTenantFromDb(result[0]);
  },

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const result = await sql`
      SELECT * FROM tenants WHERE slug = ${slug}
    `;

    if (result.length === 0) return null;
    return mapTenantFromDb(result[0]);
  },

  /**
   * Get user's tenant membership
   */
  async getUserTenants(userId: string): Promise<Array<{ tenant: Tenant; role: UserRole }>> {
    const result = await sql`
      SELECT t.*, tu.role
      FROM tenants t
      JOIN tenant_users tu ON t.id = tu.tenant_id
      WHERE tu.user_id = ${userId} AND tu.status = 'active'
      ORDER BY t.name
    `;

    return result.map((row) => ({
      tenant: mapTenantFromDb(row),
      role: row.role as UserRole,
    }));
  },

  /**
   * Get tenant user
   */
  async getTenantUser(tenantId: string, userId: string): Promise<TenantUser | null> {
    const result = await sql`
      SELECT * FROM tenant_users
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
    `;

    if (result.length === 0) return null;
    return mapTenantUserFromDb(result[0]);
  },

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, updates: Partial<{
    name: string;
    settings: TenantSettings;
    plan: TenantPlan;
    status: TenantStatus;
    billing: TenantBilling;
  }>): Promise<Tenant | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.settings !== undefined) {
      setClauses.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.plan !== undefined) {
      setClauses.push(`plan = $${paramIndex++}`);
      values.push(updates.plan);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.billing !== undefined) {
      setClauses.push(`billing = $${paramIndex++}`);
      values.push(JSON.stringify(updates.billing));
    }

    if (setClauses.length === 0) return this.getTenantById(tenantId);

    setClauses.push(`updated_at = NOW()`);

    // Use tagged template for updates
    const result = await sql`
      UPDATE tenants
      SET ${sql.unsafe(setClauses.join(', '))}
      WHERE id = ${tenantId}
      RETURNING *
    `.catch(async () => {
      // Fallback: do individual updates
      if (updates.name !== undefined) {
        await sql`UPDATE tenants SET name = ${updates.name} WHERE id = ${tenantId}`;
      }
      if (updates.settings !== undefined) {
        await sql`UPDATE tenants SET settings = ${JSON.stringify(updates.settings)} WHERE id = ${tenantId}`;
      }
      if (updates.plan !== undefined) {
        await sql`UPDATE tenants SET plan = ${updates.plan} WHERE id = ${tenantId}`;
      }
      if (updates.status !== undefined) {
        await sql`UPDATE tenants SET status = ${updates.status} WHERE id = ${tenantId}`;
      }
      if (updates.billing !== undefined) {
        await sql`UPDATE tenants SET billing = ${JSON.stringify(updates.billing)} WHERE id = ${tenantId}`;
      }
      await sql`UPDATE tenants SET updated_at = NOW() WHERE id = ${tenantId}`;
      return sql`SELECT * FROM tenants WHERE id = ${tenantId}`;
    });

    if (result.length === 0) return null;
    return mapTenantFromDb(result[0]);
  },

  /**
   * Invite user to tenant
   */
  async inviteUser(tenantId: string, data: {
    userId: string;
    email: string;
    role: UserRole;
    invitedBy: string;
  }): Promise<TenantUser> {
    const permissions = ROLE_PERMISSIONS[data.role];

    const result = await sql`
      INSERT INTO tenant_users (tenant_id, user_id, role, invited_by, invited_at, status, permissions)
      VALUES (
        ${tenantId},
        ${data.userId},
        ${data.role},
        ${data.invitedBy},
        NOW(),
        'pending',
        ${JSON.stringify(permissions)}
      )
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        invited_at = EXCLUDED.invited_at,
        status = 'pending',
        permissions = EXCLUDED.permissions,
        updated_at = NOW()
      RETURNING *
    `;

    return mapTenantUserFromDb(result[0]);
  },

  /**
   * Update user role
   */
  async updateUserRole(tenantId: string, userId: string, role: UserRole): Promise<TenantUser | null> {
    const permissions = ROLE_PERMISSIONS[role];

    const result = await sql`
      UPDATE tenant_users
      SET role = ${role}, permissions = ${JSON.stringify(permissions)}, updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
      RETURNING *
    `;

    if (result.length === 0) return null;
    return mapTenantUserFromDb(result[0]);
  },

  /**
   * Deactivate user from tenant
   */
  async deactivateUser(tenantId: string, userId: string): Promise<void> {
    await sql`
      UPDATE tenant_users
      SET status = 'deactivated', updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
    `;
  },

  /**
   * Get tenant features (plan + overrides)
   */
  async getTenantFeatures(tenantId: string): Promise<PlanFeatures> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      return PLAN_FEATURES.free;
    }

    const planFeatures = PLAN_FEATURES[tenant.plan];
    const overrides = tenant.settings.features || {};

    return {
      ...planFeatures,
      ...overrides,
      integrations: {
        ...planFeatures.integrations,
        ...(overrides.integrations || {}),
      },
    };
  },

  /**
   * Check if tenant has feature
   */
  async hasFeature(tenantId: string, feature: keyof PlanFeatures): Promise<boolean> {
    const features = await this.getTenantFeatures(tenantId);
    const value = features[feature];

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return !!value;
  },

  /**
   * Get current usage for tenant
   */
  async getCurrentUsage(tenantId: string): Promise<{
    envelopesSent: number;
    smsSent: number;
    apiCalls: number;
    storageBytes: number;
  }> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await sql`
      SELECT * FROM tenant_usage
      WHERE tenant_id = ${tenantId}
        AND period_start = ${periodStart.toISOString().split('T')[0]}
    `;

    if (result.length === 0) {
      return { envelopesSent: 0, smsSent: 0, apiCalls: 0, storageBytes: 0 };
    }

    return {
      envelopesSent: parseInt(result[0].envelopes_sent) || 0,
      smsSent: parseInt(result[0].sms_sent) || 0,
      apiCalls: parseInt(result[0].api_calls) || 0,
      storageBytes: parseInt(result[0].storage_bytes) || 0,
    };
  },

  /**
   * Increment usage counter
   */
  async incrementUsage(tenantId: string, field: 'envelopes_sent' | 'sms_sent' | 'api_calls', amount: number = 1): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await sql`
      INSERT INTO tenant_usage (tenant_id, period_start, period_end, ${sql.unsafe(field)})
      VALUES (${tenantId}, ${periodStart.toISOString().split('T')[0]}, ${periodEnd.toISOString().split('T')[0]}, ${amount})
      ON CONFLICT (tenant_id, period_start)
      DO UPDATE SET ${sql.unsafe(field)} = tenant_usage.${sql.unsafe(field)} + ${amount}, updated_at = NOW()
    `;
  },

  /**
   * Check if within limits
   */
  async checkLimit(tenantId: string, limitType: 'envelopes' | 'sms' | 'api'): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
  }> {
    const [usage, features] = await Promise.all([
      this.getCurrentUsage(tenantId),
      this.getTenantFeatures(tenantId),
    ]);

    let current: number;
    let limit: number;

    switch (limitType) {
      case 'envelopes':
        current = usage.envelopesSent;
        limit = features.maxEnvelopesPerMonth;
        break;
      case 'sms':
        current = usage.smsSent;
        limit = features.maxSmsPerMonth;
        break;
      case 'api':
        current = usage.apiCalls;
        limit = features.maxApiCallsPerMonth;
        break;
    }

    // -1 means unlimited
    const allowed = limit === -1 || current < limit;
    const remaining = limit === -1 ? Infinity : Math.max(0, limit - current);

    return { allowed, current, limit, remaining };
  },
};

// ============== HELPER FUNCTIONS ==============

function mapTenantFromDb(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    plan: row.plan as TenantPlan,
    status: row.status as TenantStatus,
    ownerId: row.owner_id as string,
    settings: typeof row.settings === 'string'
      ? JSON.parse(row.settings)
      : (row.settings as TenantSettings) || {},
    billing: typeof row.billing === 'string'
      ? JSON.parse(row.billing)
      : (row.billing as TenantBilling) || { status: 'active' },
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function mapTenantUserFromDb(row: Record<string, unknown>): TenantUser {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string,
    role: row.role as UserRole,
    invitedBy: row.invited_by as string | undefined,
    invitedAt: row.invited_at ? (row.invited_at as Date).toISOString() : undefined,
    joinedAt: row.joined_at ? (row.joined_at as Date).toISOString() : undefined,
    status: row.status as 'pending' | 'active' | 'deactivated',
    permissions: typeof row.permissions === 'string'
      ? JSON.parse(row.permissions)
      : (row.permissions as UserPermissions) || ROLE_PERMISSIONS.member,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ============== TENANT CONTEXT ==============

/**
 * LEGACY FUNCTION - Use tenant-session.ts instead
 *
 * Get tenant context from request.
 *
 * TENANT ISOLATION: This is the LEGACY context resolver.
 * The new session-based system in tenant-session.ts should be used instead.
 * This function now returns null if no valid context can be resolved from the database.
 *
 * No more demo fallback - proper tenant isolation requires explicit authentication.
 */
export async function getTenantContext(request?: Request): Promise<TenantContext | null> {
  try {
    // TENANT ISOLATION: No more hardcoded demo tenant
    // Must resolve from valid tenant session or database lookup

    let tenantId: string | null = null;
    let userId: string | null = null;

    // Try to get from request headers (for API requests)
    if (request) {
      const headerTenant = request.headers.get('X-Tenant-ID');
      if (headerTenant) {
        tenantId = headerTenant;
      }
    }

    // Try to get from cookies (legacy)
    try {
      const cookieStore = await cookies();
      const tenantCookie = cookieStore.get('tenant_id');
      const userCookie = cookieStore.get('user_id');

      if (tenantCookie?.value) tenantId = tenantCookie.value;
      if (userCookie?.value) userId = userCookie.value;
    } catch {
      // Cookies not available (e.g., in API routes without cookie context)
    }

    // TENANT ISOLATION: If no tenant ID found, return null instead of demo context
    if (!tenantId) {
      console.log('[Tenant] TENANT ISOLATION: No tenant ID found in headers or cookies - returning null');
      return null;
    }

    // TENANT ISOLATION: Validate tenant exists in database
    const tenantResult = await sql`
      SELECT * FROM tenants WHERE id = ${tenantId} AND status = 'active'
    `;

    if (tenantResult.length === 0) {
      console.log('[Tenant] TENANT ISOLATION: Tenant not found or inactive:', tenantId);
      return null;
    }

    const tenant = mapTenantFromDb(tenantResult[0]);

    // Get user info if we have userId
    let user = {
      id: userId || 'unknown',
      email: '',
      name: 'Unknown User',
      role: 'viewer' as UserRole,
      permissions: ROLE_PERMISSIONS.viewer,
    };

    if (userId) {
      const userResult = await sql`
        SELECT tu.*, up.email, up.first_name, up.last_name
        FROM tenant_users tu
        LEFT JOIN user_profiles up ON tu.user_id = up.user_id
        WHERE tu.tenant_id = ${tenantId} AND tu.user_id = ${userId} AND tu.status = 'active'
      `;

      if (userResult.length > 0) {
        const row = userResult[0];
        user = {
          id: userId,
          email: row.email || '',
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown User',
          role: row.role as UserRole,
          permissions: typeof row.permissions === 'string'
            ? JSON.parse(row.permissions)
            : row.permissions || ROLE_PERMISSIONS.viewer,
        };
      }
    }

    return {
      tenant,
      user,
      features: PLAN_FEATURES[tenant.plan] || PLAN_FEATURES.free,
    };
  } catch (error) {
    console.error('[Tenant] Error getting tenant context:', error);
    return null;
  }
}

/**
 * Require tenant context (throws if not found)
 */
export async function requireTenantContext(request?: Request): Promise<TenantContext> {
  const context = await getTenantContext(request);

  if (!context) {
    throw new Error('Unauthorized: No tenant context');
  }

  if (context.tenant.status !== 'active') {
    throw new Error(`Tenant is ${context.tenant.status}`);
  }

  return context;
}

/**
 * Check permission for current user
 */
export function checkPermission(
  context: TenantContext,
  permission: keyof UserPermissions
): boolean {
  return context.user.permissions[permission] === true;
}

/**
 * Require permission (throws if not allowed)
 */
export function requirePermission(
  context: TenantContext,
  permission: keyof UserPermissions
): void {
  if (!checkPermission(context, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

/**
 * Check feature access
 */
export function checkFeature(
  context: TenantContext,
  feature: keyof PlanFeatures
): boolean {
  const value = context.features[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && value !== -1;
  return !!value;
}

/**
 * Require feature access (throws if not available)
 */
export function requireFeature(
  context: TenantContext,
  feature: keyof PlanFeatures
): void {
  if (!checkFeature(context, feature)) {
    throw new Error(`Feature not available on ${context.tenant.plan} plan: ${feature}`);
  }
}
