/**
 * PearSign API Keys Service
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from "./db";
import { randomBytes, createHash } from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type ApiKeyEnvironment = "test" | "live";

export type ApiKeyPermission =
  | "envelopes:create"
  | "envelopes:read"
  | "envelopes:write"
  | "envelopes:send"
  | "envelopes:void"
  | "documents:upload"
  | "documents:read"
  | "documents:write"
  | "documents:delete"
  | "templates:read"
  | "templates:create"
  | "templates:write"
  | "templates:update"
  | "templates:delete"
  | "fusionforms:create"
  | "fusionforms:read"
  | "fusionforms:update"
  | "fusionforms:delete"
  | "webhooks:manage"
  | "audit:read"
  | "team:read"
  | "team:manage";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  hashedSecret: string;
  environment: ApiKeyEnvironment;
  permissions: ApiKeyPermission[];
  rateLimit: number; // requests per minute
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  expiresAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  metadata: Record<string, unknown>;
}

export interface ApiKeyCreateInput {
  name: string;
  environment: ApiKeyEnvironment;
  permissions: ApiKeyPermission[];
  rateLimit?: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyWithSecret extends Omit<ApiKey, "hashedSecret"> {
  rawSecret: string; // Only returned once on creation/rotation
  fullKey: string; // prefix.secret format
}

export type ApiKeyPublic = Omit<ApiKey, "hashedSecret">;

// ============================================================================
// PERMISSION GROUPS (for UI convenience)
// ============================================================================

export const PERMISSION_GROUPS = {
  envelopes: {
    label: "Envelopes",
    permissions: [
      { id: "envelopes:create" as const, label: "Create envelopes", description: "Create new signing envelopes" },
      { id: "envelopes:read" as const, label: "Read envelopes", description: "View envelope details and status" },
      { id: "envelopes:send" as const, label: "Send envelopes", description: "Send envelopes to recipients" },
      { id: "envelopes:void" as const, label: "Void envelopes", description: "Cancel and void envelopes" },
    ],
  },
  documents: {
    label: "Documents",
    permissions: [
      { id: "documents:upload" as const, label: "Upload documents", description: "Upload documents for signing" },
      { id: "documents:read" as const, label: "Read documents", description: "View and download documents" },
      { id: "documents:delete" as const, label: "Delete documents", description: "Delete documents" },
    ],
  },
  templates: {
    label: "Templates",
    permissions: [
      { id: "templates:read" as const, label: "Read templates", description: "View available templates" },
      { id: "templates:create" as const, label: "Create templates", description: "Create new templates" },
      { id: "templates:update" as const, label: "Update templates", description: "Modify existing templates" },
      { id: "templates:delete" as const, label: "Delete templates", description: "Remove templates" },
    ],
  },
  fusionforms: {
    label: "FusionForms",
    permissions: [
      { id: "fusionforms:create" as const, label: "Create forms", description: "Create new FusionForms" },
      { id: "fusionforms:read" as const, label: "Read forms", description: "View forms and submissions" },
      { id: "fusionforms:update" as const, label: "Update forms", description: "Modify existing forms" },
      { id: "fusionforms:delete" as const, label: "Delete forms", description: "Remove forms" },
    ],
  },
  advanced: {
    label: "Advanced",
    permissions: [
      { id: "webhooks:manage" as const, label: "Manage webhooks", description: "Create, update, and delete webhooks" },
      { id: "audit:read" as const, label: "Read audit logs", description: "View API audit logs" },
      { id: "team:read" as const, label: "Read team", description: "View team members" },
      { id: "team:manage" as const, label: "Manage team", description: "Invite and remove team members" },
    ],
  },
};

export const ALL_PERMISSIONS: ApiKeyPermission[] = Object.values(PERMISSION_GROUPS)
  .flatMap(group => group.permissions.map(p => p.id));

// ============================================================================
// KEY GENERATION UTILITIES
// ============================================================================

/**
 * Generate a cryptographically secure random string
 */
function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Generate a key prefix like ps_live_abc123 or ps_test_xyz789
 */
function generateKeyPrefix(environment: ApiKeyEnvironment): string {
  const envPrefix = environment === "live" ? "ps_live_" : "ps_test_";
  const suffix = generateSecureToken(6).substring(0, 8).toLowerCase();
  return envPrefix + suffix;
}

/**
 * Generate the secret portion of the API key
 */
function generateSecret(): string {
  return generateSecureToken(32);
}

/**
 * Hash the secret using SHA-256 (bcrypt would be better but this is faster for API auth)
 * For production, consider using argon2 or bcrypt
 */
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Verify a secret against its hash
 */
export function verifySecret(secret: string, hash: string): boolean {
  const hashedInput = hashSecret(secret);
  // Use timing-safe comparison to prevent timing attacks
  if (hashedInput.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < hashedInput.length; i++) {
    result |= hashedInput.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

function mapApiKeyFromDb(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    organizationId: (row.organization_id || row.organizationId) as string,
    name: row.name as string,
    keyPrefix: (row.key_prefix || row.keyPrefix) as string,
    hashedSecret: (row.hashed_secret || row.hashedSecret) as string,
    environment: row.environment as ApiKeyEnvironment,
    permissions: (row.permissions as ApiKeyPermission[]) || [],
    rateLimit: (row.rate_limit || row.rateLimit) as number,
    status: row.status as ApiKeyStatus,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    lastUsedIp: (row.last_used_ip || row.lastUsedIp) as string | null,
    createdAt: row.created_at ? String(row.created_at) : "",
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    rotatedAt: row.rotated_at ? String(row.rotated_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    revokedReason: (row.revoked_reason || row.revokedReason) as string | null,
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function toPublicApiKey(key: ApiKey): ApiKeyPublic {
  const { hashedSecret, ...publicKey } = key;
  return publicKey;
}

// ============================================================================
// API KEY SERVICE
// ============================================================================

export const ApiKeyService = {
  /**
   * Create a new API key - returns secret ONCE
   */
  async create(
    input: ApiKeyCreateInput,
    orgId: string
  ): Promise<ApiKeyWithSecret> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const id = `apikey-${Date.now()}-${generateSecureToken(4)}`;
    const keyPrefix = generateKeyPrefix(input.environment);
    const rawSecret = generateSecret();
    const hashedSecret = hashSecret(rawSecret);
    const now = new Date().toISOString();

    await sql`
      INSERT INTO api_keys (
        id, organization_id, name, key_prefix, hashed_secret,
        environment, permissions, rate_limit, status,
        created_at, expires_at, metadata
      ) VALUES (
        ${id}, ${orgId}, ${input.name}, ${keyPrefix}, ${hashedSecret},
        ${input.environment}, ${JSON.stringify(input.permissions)}::jsonb,
        ${input.rateLimit || 60}, 'active',
        ${now}, ${input.expiresAt || null}, ${JSON.stringify(input.metadata || {})}::jsonb
      )
    `;

    const result = await sql`
      SELECT * FROM api_keys WHERE id = ${id}
    `;

    const apiKey = mapApiKeyFromDb(result[0]);
    const { hashedSecret: _, ...publicFields } = apiKey;

    return {
      ...publicFields,
      rawSecret,
      fullKey: `${keyPrefix}.${rawSecret}`,
    };
  },

  /**
   * Get all API keys for an organization (public, without secrets)
   */
  async getAll(orgId: string): Promise<ApiKeyPublic[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      SELECT * FROM api_keys
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC
    `;
    return result.map(row => toPublicApiKey(mapApiKeyFromDb(row)));
  },

  /**
   * Get a single API key by ID
   */
  async getById(id: string, orgId: string): Promise<ApiKeyPublic | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      SELECT * FROM api_keys
      WHERE id = ${id} AND organization_id = ${orgId}
    `;
    if (result.length === 0) return null;
    return toPublicApiKey(mapApiKeyFromDb(result[0]));
  },

  /**
   * Find and validate an API key by its full key string
   * Returns the full key (with hash) for auth purposes
   */
  async validateKey(fullKey: string): Promise<ApiKey | null> {
    const parts = fullKey.split(".");
    if (parts.length !== 2) return null;

    const [prefix, secret] = parts;

    // Find key by prefix
    const result = await sql`
      SELECT * FROM api_keys
      WHERE key_prefix = ${prefix} AND status = 'active'
    `;

    if (result.length === 0) return null;

    const apiKey = mapApiKeyFromDb(result[0]);

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    // Verify the secret
    if (!verifySecret(secret, apiKey.hashedSecret)) {
      return null;
    }

    return apiKey;
  },

  /**
   * Update last used timestamp and IP
   */
  async recordUsage(id: string, ip: string): Promise<void> {
    const now = new Date().toISOString();
    await sql`
      UPDATE api_keys
      SET last_used_at = ${now}, last_used_ip = ${ip}
      WHERE id = ${id}
    `;
  },

  /**
   * Update an API key (name, permissions, rate limit)
   */
  async update(
    id: string,
    updates: Partial<Pick<ApiKey, "name" | "permissions" | "rateLimit" | "expiresAt" | "metadata">>,
    orgId: string
  ): Promise<ApiKeyPublic | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const now = new Date().toISOString();

    const existing = await sql`SELECT id FROM api_keys WHERE id = ${id} AND organization_id = ${orgId}`;
    if (existing.length === 0) return null;

    await sql`
      UPDATE api_keys SET
        name = COALESCE(${updates.name || null}, name),
        permissions = COALESCE(${updates.permissions ? JSON.stringify(updates.permissions) : null}::jsonb, permissions),
        rate_limit = COALESCE(${updates.rateLimit || null}, rate_limit),
        expires_at = COALESCE(${updates.expiresAt || null}, expires_at),
        metadata = COALESCE(${updates.metadata ? JSON.stringify(updates.metadata) : null}::jsonb, metadata)
      WHERE id = ${id} AND organization_id = ${orgId}
    `;

    return this.getById(id, orgId);
  },

  /**
   * Rotate an API key - generates new secret, returns it ONCE
   */
  async rotate(id: string, orgId: string): Promise<ApiKeyWithSecret | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const existing = await sql`
      SELECT * FROM api_keys
      WHERE id = ${id} AND organization_id = ${orgId} AND status = 'active'
    `;

    if (existing.length === 0) return null;

    const apiKey = mapApiKeyFromDb(existing[0]);
    const newSecret = generateSecret();
    const newHashedSecret = hashSecret(newSecret);
    const now = new Date().toISOString();

    await sql`
      UPDATE api_keys SET
        hashed_secret = ${newHashedSecret},
        rotated_at = ${now}
      WHERE id = ${id}
    `;

    const { hashedSecret, ...publicFields } = apiKey;

    return {
      ...publicFields,
      rawSecret: newSecret,
      fullKey: `${apiKey.keyPrefix}.${newSecret}`,
    };
  },

  /**
   * Revoke an API key - immediately invalid, cannot be restored
   */
  async revoke(id: string, reason: string, orgId: string): Promise<boolean> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const now = new Date().toISOString();

    const result = await sql`
      UPDATE api_keys SET
        status = 'revoked',
        revoked_at = ${now},
        revoked_reason = ${reason}
      WHERE id = ${id} AND organization_id = ${orgId} AND status = 'active'
    `;

    return true;
  },

  /**
   * Check if a key has a specific permission
   */
  hasPermission(key: ApiKey, permission: ApiKeyPermission): boolean {
    return key.permissions.includes(permission);
  },

  /**
   * Check if a key has all of the specified permissions
   */
  hasAllPermissions(key: ApiKey, permissions: ApiKeyPermission[]): boolean {
    return permissions.every(p => key.permissions.includes(p));
  },

  /**
   * Check if a key has any of the specified permissions
   */
  hasAnyPermission(key: ApiKey, permissions: ApiKeyPermission[]): boolean {
    return permissions.some(p => key.permissions.includes(p));
  },
};

// ============================================================================
// API AUDIT LOG
// ============================================================================

export interface ApiAuditLog {
  id: string;
  apiKeyId: string;
  organizationId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ip: string;
  userAgent: string;
  requestBody: Record<string, unknown> | null;
  responseTime: number; // milliseconds
  errorMessage: string | null;
  createdAt: string;
}

export const ApiAuditLogService = {
  async log(entry: Omit<ApiAuditLog, "id" | "createdAt">): Promise<void> {
    const id = `apilog-${Date.now()}-${generateSecureToken(4)}`;
    const now = new Date().toISOString();

    await sql`
      INSERT INTO api_audit_logs (
        id, api_key_id, organization_id, endpoint, method,
        status_code, ip, user_agent, request_body,
        response_time, error_message, created_at
      ) VALUES (
        ${id}, ${entry.apiKeyId}, ${entry.organizationId},
        ${entry.endpoint}, ${entry.method}, ${entry.statusCode},
        ${entry.ip}, ${entry.userAgent},
        ${entry.requestBody ? JSON.stringify(entry.requestBody) : null}::jsonb,
        ${entry.responseTime}, ${entry.errorMessage || null}, ${now}
      )
    `;
  },

  async getByApiKey(
    apiKeyId: string,
    orgId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ApiAuditLog[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      SELECT * FROM api_audit_logs
      WHERE api_key_id = ${apiKeyId} AND organization_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return result.map(row => ({
      id: row.id as string,
      apiKeyId: (row.api_key_id || row.apiKeyId) as string,
      organizationId: (row.organization_id || row.organizationId) as string,
      endpoint: row.endpoint as string,
      method: row.method as string,
      statusCode: (row.status_code || row.statusCode) as number,
      ip: row.ip as string,
      userAgent: (row.user_agent || row.userAgent) as string,
      requestBody: row.request_body as Record<string, unknown> | null,
      responseTime: (row.response_time || row.responseTime) as number,
      errorMessage: (row.error_message || row.errorMessage) as string | null,
      createdAt: row.created_at ? String(row.created_at) : "",
    }));
  },

  async getAll(
    orgId: string,
    filters?: {
      apiKeyId?: string;
      endpoint?: string;
      method?: string;
      startDate?: string;
      endDate?: string;
    },
    limit: number = 100,
    offset: number = 0
  ): Promise<ApiAuditLog[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    // Build dynamic query based on filters
    let query = `
      SELECT * FROM api_audit_logs
      WHERE organization_id = $1
    `;
    const params: unknown[] = [orgId];
    let paramIndex = 2;

    if (filters?.apiKeyId) {
      query += ` AND api_key_id = $${paramIndex}`;
      params.push(filters.apiKeyId);
      paramIndex++;
    }

    if (filters?.endpoint) {
      query += ` AND endpoint LIKE $${paramIndex}`;
      params.push(`%${filters.endpoint}%`);
      paramIndex++;
    }

    if (filters?.method) {
      query += ` AND method = $${paramIndex}`;
      params.push(filters.method);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // For now, use simpler query without dynamic filters
    const result = await sql`
      SELECT * FROM api_audit_logs
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return result.map(row => ({
      id: row.id as string,
      apiKeyId: (row.api_key_id || row.apiKeyId) as string,
      organizationId: (row.organization_id || row.organizationId) as string,
      endpoint: row.endpoint as string,
      method: row.method as string,
      statusCode: (row.status_code || row.statusCode) as number,
      ip: row.ip as string,
      userAgent: (row.user_agent || row.userAgent) as string,
      requestBody: row.request_body as Record<string, unknown> | null,
      responseTime: (row.response_time || row.responseTime) as number,
      errorMessage: (row.error_message || row.errorMessage) as string | null,
      createdAt: row.created_at ? String(row.created_at) : "",
    }));
  },

  async getStats(orgId: string, days: number = 30): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsByEndpoint: Record<string, number>;
    requestsByDay: { date: string; count: number }[];
  }> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await sql`
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 400) as successful_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
        AVG(response_time) as avg_response_time
      FROM api_audit_logs
      WHERE organization_id = ${orgId}
        AND created_at >= ${startDate.toISOString()}
    `;

    const endpointStats = await sql`
      SELECT endpoint, COUNT(*) as count
      FROM api_audit_logs
      WHERE organization_id = ${orgId}
        AND created_at >= ${startDate.toISOString()}
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 10
    `;

    const dailyStats = await sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM api_audit_logs
      WHERE organization_id = ${orgId}
        AND created_at >= ${startDate.toISOString()}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const stats = result[0] || {};

    return {
      totalRequests: Number(stats.total_requests) || 0,
      successfulRequests: Number(stats.successful_requests) || 0,
      failedRequests: Number(stats.failed_requests) || 0,
      averageResponseTime: Number(stats.avg_response_time) || 0,
      requestsByEndpoint: Object.fromEntries(
        endpointStats.map(r => [r.endpoint as string, Number(r.count)])
      ),
      requestsByDay: dailyStats.map(r => ({
        date: String(r.date),
        count: Number(r.count),
      })),
    };
  },
};
