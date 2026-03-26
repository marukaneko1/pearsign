/**
 * Tenant Session Service
 *
 * Handles tenant-scoped sessions for proper multi-tenancy isolation.
 *
 * CRITICAL: This service ensures that:
 * 1. Each user is bound to their specific tenant
 * 2. No fallback to root/demo tenant
 * 3. Session is validated on every request
 * 4. Tenant isolation is enforced server-side
 */

import { cookies } from 'next/headers';
import { sql } from './db';
import { ROLE_PERMISSIONS, type UserRole, type UserPermissions, type PlanFeatures, PLAN_FEATURES, type TenantPlan } from './tenant';

// Session cookie names
const TENANT_SESSION_COOKIE = 'pearsign_tenant_session';
const SESSION_EXPIRY_DAYS = 7;

// ============== TYPES ==============

export interface TenantSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  userEmail: string;
  userName: string;
  role: UserRole;
  permissions: UserPermissions;
  tenantName: string;
  tenantPlan: TenantPlan;
  createdAt: string;
  expiresAt: string;
}

export interface TenantSessionContext {
  session: TenantSession;
  features: PlanFeatures;
  isValid: boolean;
}

// ============== SESSION TOKEN GENERATION ==============

function generateSessionToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'sess_';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ============== DATABASE INITIALIZATION ==============

let _tableInitialized = false;

export async function initializeSessionTable(): Promise<void> {
  if (_tableInitialized) return;

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

  await sql`
    CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id, tenant_id)
  `;

  _tableInitialized = true;
  if (process.env.NODE_ENV !== 'production') console.log('[TenantSession] Table initialized');
}

// ============== SESSION CACHE ==============

const SESSION_CACHE = new Map<string, { session: TenantSession; cachedAt: number }>();
const CACHE_TTL_MS = 30_000;
const ACTIVITY_UPDATE_INTERVAL_MS = 60_000;
const _lastActivityUpdate = new Map<string, number>();

function getCachedSession(sessionId: string): TenantSession | null {
  const entry = SESSION_CACHE.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    SESSION_CACHE.delete(sessionId);
    return null;
  }
  return entry.session;
}

function setCachedSession(sessionId: string, session: TenantSession): void {
  SESSION_CACHE.set(sessionId, { session, cachedAt: Date.now() });
}

export function invalidateSessionCache(sessionId: string): void {
  SESSION_CACHE.delete(sessionId);
  _lastActivityUpdate.delete(sessionId);
}

// ============== SESSION MANAGEMENT ==============

/**
 * Create a new tenant session after successful login/activation
 * This is the ONLY way to establish a tenant session
 */
export async function createTenantSession(data: {
  userId: string;
  tenantId: string;
  userEmail: string;
  userName: string;
  role: UserRole;
  ipAddress?: string;
  userAgent?: string;
}): Promise<TenantSession> {
  if (process.env.NODE_ENV !== 'production') console.log('[TenantSession] Creating session for:', {
    userId: data.userId,
    tenantId: data.tenantId,
    userEmail: data.userEmail,
    role: data.role,
  });

  // Verify the user belongs to this tenant
  const membership = await sql`
    SELECT tu.*, t.name as tenant_name, t.plan as tenant_plan, t.status as tenant_status
    FROM tenant_users tu
    JOIN tenants t ON tu.tenant_id = t.id
    WHERE tu.user_id = ${data.userId}
      AND tu.tenant_id = ${data.tenantId}
      AND tu.status = 'active'
  `;

  if (process.env.NODE_ENV !== 'production') console.log('[TenantSession] Membership query result:', {
    found: membership.length > 0,
    count: membership.length,
    tenantName: membership[0]?.tenant_name,
    tenantStatus: membership[0]?.tenant_status,
    userRole: membership[0]?.role,
  });

  if (membership.length === 0) {
    // Debug: check what tenant_users exist for this user
    const debugMemberships = await sql`
      SELECT tu.tenant_id, tu.status, tu.role, t.name, t.status as tenant_status
      FROM tenant_users tu
      LEFT JOIN tenants t ON tu.tenant_id = t.id
      WHERE tu.user_id = ${data.userId}
    `;
    console.error('[TenantSession] User has no active membership. All memberships:', debugMemberships);

    throw new Error('User is not a member of this tenant');
  }

  const member = membership[0];

  // Check tenant is active
  if (member.tenant_status !== 'active') {
    throw new Error(`Tenant is ${member.tenant_status}`);
  }

  const sessionId = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  const permissions = ROLE_PERMISSIONS[member.role as UserRole] || ROLE_PERMISSIONS.viewer;

  await sql`
    INSERT INTO tenant_sessions (
      id, user_id, tenant_id, user_email, user_name, role, permissions,
      tenant_name, tenant_plan, expires_at, ip_address, user_agent
    ) VALUES (
      ${sessionId},
      ${data.userId},
      ${data.tenantId},
      ${data.userEmail},
      ${data.userName},
      ${member.role},
      ${JSON.stringify(permissions)},
      ${member.tenant_name},
      ${member.tenant_plan},
      ${expiresAt.toISOString()},
      ${data.ipAddress || null},
      ${data.userAgent || null}
    )
  `;

  const session: TenantSession = {
    sessionId,
    userId: data.userId,
    tenantId: data.tenantId,
    userEmail: data.userEmail,
    userName: data.userName,
    role: member.role as UserRole,
    permissions,
    tenantName: member.tenant_name,
    tenantPlan: member.tenant_plan as TenantPlan,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Set the session cookie
  const cookieStore = await cookies();
  cookieStore.set(TENANT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  if (process.env.NODE_ENV !== 'production') console.log('[TenantSession] Created session for', data.userEmail, 'in tenant', data.tenantId, 'sessionId:', sessionId.substring(0, 20) + '...');

  // Verify the session was actually inserted
  const verifyInsert = await sql`SELECT id FROM tenant_sessions WHERE id = ${sessionId}`;
  if (verifyInsert.length === 0) {
    console.error('[TenantSession] CRITICAL: Session was not inserted into database!');
  } else {
    if (process.env.NODE_ENV !== 'production') console.log('[TenantSession] Session verified in database');
  }

  return session;
}

/**
 * Get the current tenant session from cookies
 * Returns null if no valid session exists - NO FALLBACK TO DEFAULT
 */
export async function getTenantSession(): Promise<TenantSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(TENANT_SESSION_COOKIE);

    if (!sessionCookie?.value) {
      return null;
    }

    const sessionId = sessionCookie.value;

    const cached = getCachedSession(sessionId);
    if (cached) {
      if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
        invalidateSessionCache(sessionId);
        cookieStore.delete(TENANT_SESSION_COOKIE);
        return null;
      }
      const now = Date.now();
      const lastUpdate = _lastActivityUpdate.get(sessionId) || 0;
      if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL_MS) {
        _lastActivityUpdate.set(sessionId, now);
        sql`UPDATE tenant_sessions SET last_activity = NOW() WHERE id = ${sessionId}`.catch(err => console.warn('[TenantSession] Failed to update last_activity:', err));
      }
      return cached;
    }

    const result = await sql`
      SELECT * FROM tenant_sessions
      WHERE id = ${sessionId}
        AND expires_at > NOW()
    `;

    if (result.length === 0) {
      cookieStore.delete(TENANT_SESSION_COOKIE);
      return null;
    }

    const row = result[0];

    _lastActivityUpdate.set(sessionId, Date.now());
    sql`UPDATE tenant_sessions SET last_activity = NOW() WHERE id = ${sessionId}`.catch(err => console.warn('[TenantSession] Failed to update last_activity:', err));

    const session: TenantSession = {
      sessionId: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      userEmail: row.user_email,
      userName: row.user_name || '',
      role: row.role as UserRole,
      permissions: typeof row.permissions === 'string'
        ? JSON.parse(row.permissions)
        : row.permissions || ROLE_PERMISSIONS.viewer,
      tenantName: row.tenant_name || '',
      tenantPlan: (row.tenant_plan || 'free') as TenantPlan,
      createdAt: row.created_at?.toISOString() || '',
      expiresAt: row.expires_at?.toISOString() || '',
    };

    setCachedSession(sessionId, session);
    return session;
  } catch (error) {
    console.error('[TenantSession] Error getting session:', error);
    return null;
  }
}

/**
 * Get tenant session context with features
 * Returns null if no valid session - NEVER returns a default/demo context
 */
export async function getTenantSessionContext(): Promise<TenantSessionContext | null> {
  const session = await getTenantSession();

  if (!session) {
    return null;
  }

  const features = PLAN_FEATURES[session.tenantPlan] || PLAN_FEATURES.free;

  return {
    session,
    features,
    isValid: true,
  };
}

/**
 * Require a valid tenant session
 * Throws if no session exists - use this in protected routes
 */
export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getTenantSession();

  if (!session) {
    throw new Error('Unauthorized: No valid tenant session');
  }

  return session;
}

/**
 * End/logout the current session
 */
export async function endTenantSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(TENANT_SESSION_COOKIE);

    if (sessionCookie?.value) {
      invalidateSessionCache(sessionCookie.value);

      await sql`
        DELETE FROM tenant_sessions WHERE id = ${sessionCookie.value}
      `;

      cookieStore.delete(TENANT_SESSION_COOKIE);
    }
  } catch (error) {
    console.error('[TenantSession] Error ending session:', error);
  }
}

/**
 * Check if current session has a specific permission
 */
export async function hasPermission(permission: keyof UserPermissions): Promise<boolean> {
  const session = await getTenantSession();
  if (!session) return false;
  return session.permissions[permission] === true;
}

/**
 * Get the current tenant ID for use in queries
 * Returns null if no session - NEVER returns a default
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const session = await getTenantSession();
  return session?.tenantId || null;
}

/**
 * Get the current user ID for use in queries
 * Returns null if no session - NEVER returns a default
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getTenantSession();
  return session?.userId || null;
}

// ============== SESSION IDENTIFICATION ==============

/**
 * Get the current session ID from cookie
 * Returns null if no session cookie exists
 */
export async function getCurrentSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(TENANT_SESSION_COOKIE);
    return sessionCookie?.value || null;
  } catch {
    return null;
  }
}

/**
 * Alias for getTenantSession for clearer naming
 */
export const getCurrentTenantSession = getTenantSession;

// ============== CLEANUP ==============

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await sql`
    DELETE FROM tenant_sessions WHERE expires_at < NOW()
    RETURNING id
  `;
  return result.length;
}
