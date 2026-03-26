/**
 * Admin Tenant Service
 *
 * ADDITIVE-ONLY: This service extends admin capabilities without modifying existing logic.
 *
 * Features:
 * - Organization (Tenant) Invite Flow
 * - Admin Sandbox / Impersonation Mode
 * - Admin Audit Logging
 * - Tenant Activation Workflow
 */

import { sql } from './db';
import { TenantPlan, TenantStatus, ROLE_PERMISSIONS, UserRole } from './tenant';

// ============== TYPES ==============

export interface OrganizationInvite {
  id: string;
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerName?: string;
  allowedDomain?: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token: string;
  plan: TenantPlan;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface AdminSandboxSession {
  id: string;
  adminId: string;
  tenantId: string;
  tenantName: string;
  startedAt: string;
  expiresAt: string;
  readOnly: boolean;
  accessToken: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: 'tenant' | 'plan' | 'invite' | 'sandbox' | 'system';
  targetId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// ============== DATABASE INITIALIZATION ==============

export async function initializeAdminTables(): Promise<void> {
  // Organization invites table
  await sql`
    CREATE TABLE IF NOT EXISTS organization_invites (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(255),
      tenant_name VARCHAR(255) NOT NULL,
      owner_email VARCHAR(255) NOT NULL,
      owner_name VARCHAR(255),
      allowed_domain VARCHAR(255),
      invited_by VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      token VARCHAR(255) UNIQUE NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'free',
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      accepted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Admin sandbox sessions table
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sandbox_sessions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      admin_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      read_only BOOLEAN DEFAULT true,
      access_token VARCHAR(255) UNIQUE NOT NULL,
      ended_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Admin audit log table (append-only for compliance)
  await sql`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      admin_id VARCHAR(255) NOT NULL,
      action VARCHAR(255) NOT NULL,
      target_type VARCHAR(50) NOT NULL,
      target_id VARCHAR(255),
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(50),
      user_agent TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Create indexes for efficient queries
  await sql`
    ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS allowed_domain VARCHAR(255)
  `.catch(() => {});

  await sql`
    CREATE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(token)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(owner_email)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_admin_sandbox_token ON admin_sandbox_sessions(access_token)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp ON admin_audit_log(timestamp DESC)
  `;

  console.log('[AdminTenantService] Tables initialized');
}

// ============== ADMIN AUDIT LOGGING ==============

export async function logAdminAction(data: {
  adminId: string;
  action: string;
  targetType: AdminAuditLog['targetType'];
  targetId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_audit_log (
        admin_id, action, target_type, target_id, details, ip_address, user_agent
      ) VALUES (
        ${data.adminId},
        ${data.action},
        ${data.targetType},
        ${data.targetId || null},
        ${JSON.stringify(data.details)},
        ${data.ipAddress || null},
        ${data.userAgent || null}
      )
    `;
  } catch (error) {
    console.error('[AdminAudit] Failed to log action:', error);
    // Don't throw - logging should not break operations
  }
}

export async function getAdminAuditLogs(options: {
  adminId?: string;
  targetType?: string;
  targetId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: AdminAuditLog[]; total: number }> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  // Fetch logs (simple query without complex filtering for reliability)
  const logs = await sql`
    SELECT * FROM admin_audit_log
    ORDER BY timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*) as count FROM admin_audit_log
  `;

  return {
    logs: logs.map(mapAuditLogFromDb),
    total: parseInt(countResult[0].count) || 0,
  };
}

// ============== ORGANIZATION INVITE SERVICE ==============

function generateInviteToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'org_inv_';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function generateSandboxToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'sandbox_';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const OrganizationInviteService = {
  /**
   * Create and send an organization invite
   */
  async createInvite(data: {
    tenantName: string;
    ownerEmail: string;
    ownerName?: string;
    allowedDomain?: string;
    plan?: TenantPlan;
    invitedBy: string;
    expirationDays?: number;
  }): Promise<OrganizationInvite> {
    const token = generateInviteToken();
    const expirationDays = data.expirationDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Generate a slug from tenant name
    const slug = data.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // Check if email already has a pending invite
    const existingInvite = await sql`
      SELECT id FROM organization_invites
      WHERE owner_email = ${data.ownerEmail.toLowerCase()}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    if (existingInvite.length > 0) {
      // Cancel existing invite
      await sql`
        UPDATE organization_invites
        SET status = 'cancelled'
        WHERE id = ${existingInvite[0].id}
      `;
    }

    const normalizedDomain = data.allowedDomain
      ? data.allowedDomain.toLowerCase().replace(/^@/, '')
      : null;

    const result = await sql`
      INSERT INTO organization_invites (
        tenant_name, owner_email, owner_name, allowed_domain, invited_by, token, plan, expires_at
      ) VALUES (
        ${data.tenantName},
        ${data.ownerEmail.toLowerCase()},
        ${data.ownerName || null},
        ${normalizedDomain},
        ${data.invitedBy},
        ${token},
        ${data.plan || 'free'},
        ${expiresAt.toISOString()}
      )
      RETURNING *
    `;

    return mapInviteFromDb(result[0]);
  },

  /**
   * Get invite by token
   */
  async getInviteByToken(token: string): Promise<OrganizationInvite | null> {
    const result = await sql`
      SELECT * FROM organization_invites WHERE token = ${token}
    `;

    if (result.length === 0) return null;
    return mapInviteFromDb(result[0]);
  },

  /**
   * Get all pending invites
   */
  async getPendingInvites(): Promise<OrganizationInvite[]> {
    const result = await sql`
      SELECT * FROM organization_invites
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `;

    return result.map(mapInviteFromDb);
  },

  /**
   * Accept invite and create tenant
   */
  async acceptInvite(token: string, ownerData: {
    userId: string;
    password?: string;
  }): Promise<{ tenant: { id: string; name: string; slug: string }; invite: OrganizationInvite }> {
    const invite = await this.getInviteByToken(token);

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error(`Invite is ${invite.status}`);
    }

    if (new Date(invite.expiresAt) < new Date()) {
      await sql`UPDATE organization_invites SET status = 'expired' WHERE id = ${invite.id}`;
      throw new Error('Invite has expired');
    }

    // Create slug
    const slug = invite.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // Check if slug is unique
    const existingSlug = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
    const finalSlug = existingSlug.length > 0 ? `${slug}-${Date.now()}` : slug;

    // Create the tenant
    const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await sql`
      INSERT INTO tenants (id, name, slug, plan, status, owner_id)
      VALUES (${tenantId}, ${invite.tenantName}, ${finalSlug}, ${invite.plan}, 'active', ${ownerData.userId})
    `;

    // Add owner as tenant user
    await sql`
      INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at, permissions)
      VALUES (
        ${tenantId},
        ${ownerData.userId},
        'owner',
        'active',
        NOW(),
        ${JSON.stringify(ROLE_PERMISSIONS.owner)}
      )
    `;

    // Initialize usage tracking
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await sql`
      INSERT INTO tenant_usage (tenant_id, period_start, period_end)
      VALUES (${tenantId}, ${periodStart.toISOString()}, ${periodEnd.toISOString()})
    `;

    // Update invite status
    await sql`
      UPDATE organization_invites
      SET status = 'accepted', tenant_id = ${tenantId}, accepted_at = NOW()
      WHERE id = ${invite.id}
    `;

    const updatedInvite = { ...invite, status: 'accepted' as const, tenantId, acceptedAt: new Date().toISOString() };

    return {
      tenant: { id: tenantId, name: invite.tenantName, slug: finalSlug },
      invite: updatedInvite,
    };
  },

  /**
   * Cancel invite
   */
  async cancelInvite(inviteId: string): Promise<void> {
    await sql`
      UPDATE organization_invites SET status = 'cancelled' WHERE id = ${inviteId}
    `;
  },

  /**
   * Resend invite (create new token)
   */
  async resendInvite(inviteId: string, invitedBy: string): Promise<OrganizationInvite> {
    const existing = await sql`SELECT * FROM organization_invites WHERE id = ${inviteId}`;

    if (existing.length === 0) {
      throw new Error('Invite not found');
    }

    const invite = mapInviteFromDb(existing[0]);

    // Cancel old invite
    await sql`UPDATE organization_invites SET status = 'cancelled' WHERE id = ${inviteId}`;

    return this.createInvite({
      tenantName: invite.tenantName,
      ownerEmail: invite.ownerEmail,
      ownerName: invite.ownerName,
      allowedDomain: invite.allowedDomain,
      plan: invite.plan,
      invitedBy,
    });
  },
};

// ============== ADMIN SANDBOX SERVICE ==============

export const AdminSandboxService = {
  /**
   * Create a sandbox session for admin to view tenant environment
   */
  async createSession(data: {
    adminId: string;
    tenantId: string;
    durationMinutes?: number;
    readOnly?: boolean;
  }): Promise<AdminSandboxSession> {
    // Verify tenant exists
    const tenant = await sql`SELECT id, name FROM tenants WHERE id = ${data.tenantId}`;
    if (tenant.length === 0) {
      throw new Error('Tenant not found');
    }

    // End any existing sessions for this admin
    await sql`
      UPDATE admin_sandbox_sessions
      SET ended_at = NOW()
      WHERE admin_id = ${data.adminId} AND ended_at IS NULL
    `;

    const accessToken = generateSandboxToken();
    const durationMinutes = data.durationMinutes || 60; // Default 1 hour
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

    const result = await sql`
      INSERT INTO admin_sandbox_sessions (
        admin_id, tenant_id, expires_at, read_only, access_token
      ) VALUES (
        ${data.adminId},
        ${data.tenantId},
        ${expiresAt.toISOString()},
        ${data.readOnly !== false},
        ${accessToken}
      )
      RETURNING *
    `;

    return {
      ...mapSandboxSessionFromDb(result[0]),
      tenantName: tenant[0].name,
    };
  },

  /**
   * Validate and get sandbox session by access token
   */
  async validateSession(accessToken: string): Promise<AdminSandboxSession | null> {
    const result = await sql`
      SELECT s.*, t.name as tenant_name
      FROM admin_sandbox_sessions s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE s.access_token = ${accessToken}
        AND s.ended_at IS NULL
        AND s.expires_at > NOW()
    `;

    if (result.length === 0) return null;
    return mapSandboxSessionFromDb(result[0]);
  },

  /**
   * End a sandbox session
   */
  async endSession(sessionId: string): Promise<void> {
    await sql`
      UPDATE admin_sandbox_sessions
      SET ended_at = NOW()
      WHERE id = ${sessionId}
    `;
  },

  /**
   * Get all active sandbox sessions
   */
  async getActiveSessions(): Promise<AdminSandboxSession[]> {
    const result = await sql`
      SELECT s.*, t.name as tenant_name
      FROM admin_sandbox_sessions s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE s.ended_at IS NULL AND s.expires_at > NOW()
      ORDER BY s.started_at DESC
    `;

    return result.map(mapSandboxSessionFromDb);
  },

  /**
   * Get tenant data as seen by admin in sandbox mode
   * This is READ-ONLY observation of the tenant's environment
   */
  async getTenantSandboxData(tenantId: string): Promise<{
    tenant: Record<string, unknown>;
    stats: {
      envelopes: number;
      templates: number;
      teamMembers: number;
      storageUsed: number;
    };
    recentActivity: Array<Record<string, unknown>>;
    teamMembers: Array<Record<string, unknown>>;
  }> {
    // Get tenant info
    const tenantResult = await sql`
      SELECT * FROM tenants WHERE id = ${tenantId}
    `;

    if (tenantResult.length === 0) {
      throw new Error('Tenant not found');
    }

    // Get stats
    const envelopeCount = await sql`
      SELECT COUNT(*) as count FROM envelope_documents WHERE org_id = ${tenantId}
    `.catch(() => [{ count: 0 }]);

    const templateCount = await sql`
      SELECT COUNT(*) as count FROM templates WHERE org_id = ${tenantId}
    `.catch(() => [{ count: 0 }]);

    const teamCount = await sql`
      SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ${tenantId} AND status = 'active'
    `.catch(() => [{ count: 0 }]);

    const usageResult = await sql`
      SELECT * FROM tenant_usage
      WHERE tenant_id = ${tenantId}
      ORDER BY period_start DESC
      LIMIT 1
    `.catch(() => []);

    // Get recent activity (audit logs)
    const recentActivity = await sql`
      SELECT * FROM audit_log
      WHERE org_id = ${tenantId}
      ORDER BY timestamp DESC
      LIMIT 20
    `.catch(() => []);

    // Get team members
    const teamMembers = await sql`
      SELECT tu.*, up.first_name, up.last_name, up.email
      FROM tenant_users tu
      LEFT JOIN user_profiles up ON tu.user_id = up.user_id
      WHERE tu.tenant_id = ${tenantId}
      ORDER BY tu.role, tu.created_at
    `.catch(() => []);

    return {
      tenant: {
        id: tenantResult[0].id,
        name: tenantResult[0].name,
        slug: tenantResult[0].slug,
        plan: tenantResult[0].plan,
        status: tenantResult[0].status,
        settings: tenantResult[0].settings || {},
        billing: tenantResult[0].billing || {},
        createdAt: tenantResult[0].created_at?.toISOString(),
      },
      stats: {
        envelopes: parseInt(envelopeCount[0].count) || 0,
        templates: parseInt(templateCount[0].count) || 0,
        teamMembers: parseInt(teamCount[0].count) || 0,
        storageUsed: parseInt(usageResult[0]?.storage_bytes) || 0,
      },
      recentActivity: recentActivity.map((log: Record<string, unknown>) => ({
        id: log.id,
        action: log.action,
        actor: log.actor,
        timestamp: log.timestamp ? (log.timestamp as Date).toISOString() : null,
        details: log.details,
      })),
      teamMembers: teamMembers.map((member: Record<string, unknown>) => ({
        id: member.id,
        userId: member.user_id,
        role: member.role,
        status: member.status,
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email,
        joinedAt: member.joined_at ? (member.joined_at as Date).toISOString() : null,
      })),
    };
  },
};

// ============== HELPER FUNCTIONS ==============

function mapInviteFromDb(row: Record<string, unknown>): OrganizationInvite {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    tenantName: row.tenant_name as string,
    ownerEmail: row.owner_email as string,
    ownerName: row.owner_name as string | undefined,
    allowedDomain: row.allowed_domain as string | undefined,
    invitedBy: row.invited_by as string,
    status: row.status as OrganizationInvite['status'],
    token: row.token as string,
    plan: row.plan as TenantPlan,
    expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : '',
    acceptedAt: row.accepted_at ? (row.accepted_at as Date).toISOString() : undefined,
    createdAt: row.created_at ? (row.created_at as Date).toISOString() : '',
  };
}

function mapSandboxSessionFromDb(row: Record<string, unknown>): AdminSandboxSession {
  return {
    id: row.id as string,
    adminId: row.admin_id as string,
    tenantId: row.tenant_id as string,
    tenantName: (row.tenant_name as string) || '',
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : '',
    expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : '',
    readOnly: row.read_only as boolean,
    accessToken: row.access_token as string,
  };
}

function mapAuditLogFromDb(row: Record<string, unknown>): AdminAuditLog {
  return {
    id: row.id as string,
    adminId: row.admin_id as string,
    action: row.action as string,
    targetType: row.target_type as AdminAuditLog['targetType'],
    targetId: row.target_id as string | undefined,
    details: (row.details as Record<string, unknown>) || {},
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    timestamp: row.timestamp ? (row.timestamp as Date).toISOString() : '',
  };
}
