/**
 * PearSign Immutable Audit Log Service
 *
 * Provides append-only audit logging with:
 * - No DELETE operations allowed
 * - Integrity hashing for tamper detection
 * - Tenant-scoped logs (no shared logs across tenants)
 * - Timestamped entries
 */

import { sql } from './db';
import { TenantContext } from './tenant';

// ============== TYPES ==============

export type ImmutableAuditAction =
  // Document lifecycle
  | 'document.created'
  | 'document.uploaded'
  | 'document.sent'
  | 'document.viewed'
  | 'document.signed'
  | 'document.completed'
  | 'document.voided'
  | 'document.declined'
  | 'document.expired'
  | 'document.reminder_sent'
  // Security events
  | 'security.2fa_requested'
  | 'security.2fa_verified'
  | 'security.2fa_failed'
  | 'security.access_denied'
  | 'security.token_generated'
  | 'security.token_expired'
  // User actions
  | 'user.login'
  | 'user.logout'
  | 'user.invited'
  | 'user.joined'
  | 'user.role_changed'
  | 'user.deactivated'
  // Template actions
  | 'template.created'
  | 'template.updated'
  | 'template.archived'
  | 'template.used'
  // Settings changes
  | 'settings.branding_updated'
  | 'settings.email_updated'
  | 'settings.integration_connected'
  | 'settings.integration_disconnected'
  | 'settings.webhook_created'
  | 'settings.webhook_deleted'
  // Billing events
  | 'billing.plan_changed'
  | 'billing.payment_succeeded'
  | 'billing.payment_failed'
  | 'billing.subscription_cancelled'
  // API events
  | 'api.key_created'
  | 'api.key_rotated'
  | 'api.key_deleted'
  | 'api.request_made';

export interface ImmutableAuditEntry {
  id: string;
  tenantId: string;
  sequenceNumber: number;
  action: ImmutableAuditAction;
  entityType: string;
  entityId: string | null;
  actorType: 'user' | 'system' | 'api' | 'webhook';
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  details: Record<string, unknown>;
  previousHash: string;
  entryHash: string;
  timestamp: string;
}

export interface CreateAuditEntryInput {
  tenantId: string;
  action: ImmutableAuditAction;
  entityType: string;
  entityId?: string | null;
  actorType?: 'user' | 'system' | 'api' | 'webhook';
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorIp?: string | null;
  actorUserAgent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  action?: ImmutableAuditAction;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ============== IMMUTABLE AUDIT LOG SERVICE ==============

export const ImmutableAuditLogService = {
  /**
   * Initialize the audit log table
   */
  async initializeTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS immutable_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        sequence_number BIGINT NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255),
        actor_type VARCHAR(50) NOT NULL DEFAULT 'user',
        actor_id VARCHAR(255),
        actor_name VARCHAR(255),
        actor_email VARCHAR(255),
        actor_ip VARCHAR(45),
        actor_user_agent TEXT,
        details JSONB DEFAULT '{}',
        previous_hash VARCHAR(64) NOT NULL,
        entry_hash VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create indexes for efficient querying
    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON immutable_audit_logs(tenant_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON immutable_audit_logs(tenant_id, entity_type, entity_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON immutable_audit_logs(tenant_id, timestamp DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_sequence ON immutable_audit_logs(tenant_id, sequence_number DESC)
    `;

    // Create a rule to prevent DELETE operations
    try {
      await sql`
        CREATE OR REPLACE RULE prevent_delete AS ON DELETE TO immutable_audit_logs
        DO INSTEAD NOTHING
      `;
    } catch {
      // Rule might already exist or be unsupported
    }

    // Create a rule to prevent UPDATE operations
    try {
      await sql`
        CREATE OR REPLACE RULE prevent_update AS ON UPDATE TO immutable_audit_logs
        DO INSTEAD NOTHING
      `;
    } catch {
      // Rule might already exist or be unsupported
    }

    if (process.env.NODE_ENV !== 'production') console.log('[ImmutableAuditLog] Table initialized with protection rules');
  },

  /**
   * Append a new audit log entry
   * This is the ONLY way to add entries - no updates or deletes allowed
   */
  async append(input: CreateAuditEntryInput): Promise<ImmutableAuditEntry> {
    // Get the previous entry for hash chaining
    const previousEntry = await sql`
      SELECT sequence_number, entry_hash
      FROM immutable_audit_logs
      WHERE tenant_id = ${input.tenantId}
      ORDER BY sequence_number DESC
      LIMIT 1
    `;

    const previousHash = previousEntry.length > 0
      ? previousEntry[0].entry_hash as string
      : 'GENESIS';
    const sequenceNumber = previousEntry.length > 0
      ? (parseInt(previousEntry[0].sequence_number as string) || 0) + 1
      : 1;

    // Create the entry data
    const timestamp = new Date().toISOString();
    const entryData = {
      tenantId: input.tenantId,
      sequenceNumber,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      actorType: input.actorType || 'user',
      actorId: input.actorId || null,
      actorName: input.actorName || null,
      actorEmail: input.actorEmail || null,
      actorIp: input.actorIp || null,
      actorUserAgent: input.actorUserAgent || null,
      details: input.details || {},
      previousHash,
      timestamp,
    };

    // Calculate entry hash (SHA-256 of entry data + previous hash)
    const entryHash = await calculateHash(entryData);

    // Insert the entry
    const result = await sql`
      INSERT INTO immutable_audit_logs (
        tenant_id, sequence_number, action, entity_type, entity_id,
        actor_type, actor_id, actor_name, actor_email, actor_ip, actor_user_agent,
        details, previous_hash, entry_hash, timestamp
      ) VALUES (
        ${entryData.tenantId},
        ${entryData.sequenceNumber},
        ${entryData.action},
        ${entryData.entityType},
        ${entryData.entityId},
        ${entryData.actorType},
        ${entryData.actorId},
        ${entryData.actorName},
        ${entryData.actorEmail},
        ${entryData.actorIp},
        ${entryData.actorUserAgent},
        ${JSON.stringify(entryData.details)},
        ${entryData.previousHash},
        ${entryHash},
        ${entryData.timestamp}
      )
      RETURNING *
    `;

    return mapAuditEntryFromDb(result[0]);
  },

  /**
   * Query audit logs for a tenant
   */
  async query(options: AuditQueryOptions): Promise<{
    entries: ImmutableAuditEntry[];
    total: number;
    integrityValid: boolean;
  }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Build the query
    let entries;

    if (options.entityType && options.entityId) {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${options.tenantId}
          AND entity_type = ${options.entityType}
          AND entity_id = ${options.entityId}
        ORDER BY sequence_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (options.action) {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${options.tenantId}
          AND action = ${options.action}
        ORDER BY sequence_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (options.actorId) {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${options.tenantId}
          AND actor_id = ${options.actorId}
        ORDER BY sequence_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${options.tenantId}
        ORDER BY sequence_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as count FROM immutable_audit_logs
      WHERE tenant_id = ${options.tenantId}
    `;

    // Verify integrity of returned entries
    const mappedEntries = entries.map(mapAuditEntryFromDb);
    const integrityValid = await this.verifyChainIntegrity(options.tenantId, mappedEntries);

    return {
      entries: mappedEntries,
      total: parseInt(countResult[0].count as string) || 0,
      integrityValid,
    };
  },

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<ImmutableAuditEntry[]> {
    const result = await sql`
      SELECT * FROM immutable_audit_logs
      WHERE tenant_id = ${tenantId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
      ORDER BY sequence_number ASC
    `;

    return result.map(mapAuditEntryFromDb);
  },

  /**
   * Verify the integrity of the audit chain
   */
  async verifyChainIntegrity(
    tenantId: string,
    entries?: ImmutableAuditEntry[]
  ): Promise<boolean> {
    // If no entries provided, fetch them
    if (!entries) {
      const result = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${tenantId}
        ORDER BY sequence_number ASC
      `;
      entries = result.map(mapAuditEntryFromDb);
    }

    if (entries.length === 0) return true;

    // Verify chain
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // First entry should have GENESIS as previous hash
      if (i === 0) {
        if (entry.previousHash !== 'GENESIS') {
          console.error(`[AuditIntegrity] First entry has invalid previous hash`);
          return false;
        }
      } else {
        // Verify previous hash matches previous entry's hash
        const previousEntry = entries[i - 1];
        if (entry.previousHash !== previousEntry.entryHash) {
          console.error(`[AuditIntegrity] Chain broken at sequence ${entry.sequenceNumber}`);
          return false;
        }
      }

      // Verify entry hash
      const expectedHash = await calculateHash({
        tenantId: entry.tenantId,
        sequenceNumber: entry.sequenceNumber,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorType: entry.actorType as 'user' | 'system' | 'api' | 'webhook',
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorEmail: entry.actorEmail,
        actorIp: entry.actorIp,
        actorUserAgent: entry.actorUserAgent,
        details: entry.details,
        previousHash: entry.previousHash,
        timestamp: entry.timestamp,
      });

      if (entry.entryHash !== expectedHash) {
        console.error(`[AuditIntegrity] Hash mismatch at sequence ${entry.sequenceNumber}`);
        return false;
      }
    }

    return true;
  },

  /**
   * Get audit summary for a tenant
   */
  async getTenantAuditSummary(tenantId: string): Promise<{
    totalEntries: number;
    firstEntry: string | null;
    lastEntry: string | null;
    entriesByAction: Record<string, number>;
    integrityStatus: 'valid' | 'invalid' | 'unknown';
  }> {
    const summary = await sql`
      SELECT
        COUNT(*) as total,
        MIN(timestamp) as first_entry,
        MAX(timestamp) as last_entry
      FROM immutable_audit_logs
      WHERE tenant_id = ${tenantId}
    `;

    const actionCounts = await sql`
      SELECT action, COUNT(*) as count
      FROM immutable_audit_logs
      WHERE tenant_id = ${tenantId}
      GROUP BY action
    `;

    const entriesByAction: Record<string, number> = {};
    for (const row of actionCounts) {
      entriesByAction[row.action as string] = parseInt(row.count as string) || 0;
    }

    // Spot-check integrity (check last 100 entries)
    const recentEntries = await sql`
      SELECT * FROM immutable_audit_logs
      WHERE tenant_id = ${tenantId}
      ORDER BY sequence_number DESC
      LIMIT 100
    `;

    const isValid = await this.verifyChainIntegrity(
      tenantId,
      recentEntries.map(mapAuditEntryFromDb).reverse()
    );

    return {
      totalEntries: parseInt(summary[0].total as string) || 0,
      firstEntry: summary[0].first_entry?.toISOString() || null,
      lastEntry: summary[0].last_entry?.toISOString() || null,
      entriesByAction,
      integrityStatus: recentEntries.length === 0 ? 'unknown' : (isValid ? 'valid' : 'invalid'),
    };
  },

  /**
   * Export audit trail for compliance
   */
  async exportAuditTrail(
    tenantId: string,
    options?: {
      entityType?: string;
      entityId?: string;
      startDate?: Date;
      endDate?: Date;
      format?: 'json' | 'csv';
    }
  ): Promise<string> {
    let entries;

    if (options?.entityType && options?.entityId) {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${tenantId}
          AND entity_type = ${options.entityType}
          AND entity_id = ${options.entityId}
        ORDER BY sequence_number ASC
      `;
    } else {
      entries = await sql`
        SELECT * FROM immutable_audit_logs
        WHERE tenant_id = ${tenantId}
        ORDER BY sequence_number ASC
        LIMIT 10000
      `;
    }

    const mappedEntries = entries.map(mapAuditEntryFromDb);

    if (options?.format === 'csv') {
      return exportToCsv(mappedEntries);
    }

    return JSON.stringify({
      tenantId,
      exportedAt: new Date().toISOString(),
      totalEntries: mappedEntries.length,
      integrityValid: await this.verifyChainIntegrity(tenantId, mappedEntries),
      entries: mappedEntries,
    }, null, 2);
  },
};

// ============== HELPER FUNCTIONS ==============

function mapAuditEntryFromDb(row: Record<string, unknown>): ImmutableAuditEntry {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    sequenceNumber: parseInt(row.sequence_number as string) || 0,
    action: row.action as ImmutableAuditAction,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | null,
    actorType: row.actor_type as 'user' | 'system' | 'api' | 'webhook',
    actorId: row.actor_id as string | null,
    actorName: row.actor_name as string | null,
    actorEmail: row.actor_email as string | null,
    actorIp: row.actor_ip as string | null,
    actorUserAgent: row.actor_user_agent as string | null,
    details: typeof row.details === 'string'
      ? JSON.parse(row.details)
      : (row.details as Record<string, unknown>) || {},
    previousHash: row.previous_hash as string,
    entryHash: row.entry_hash as string,
    timestamp: (row.timestamp as Date).toISOString(),
  };
}

async function calculateHash(data: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const dataString = JSON.stringify(data, Object.keys(data).sort());
  const dataBuffer = encoder.encode(dataString);

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function exportToCsv(entries: ImmutableAuditEntry[]): string {
  const headers = [
    'Sequence',
    'Timestamp',
    'Action',
    'Entity Type',
    'Entity ID',
    'Actor Type',
    'Actor ID',
    'Actor Name',
    'Actor Email',
    'Actor IP',
    'Details',
    'Entry Hash',
  ];

  const rows = entries.map(entry => [
    entry.sequenceNumber.toString(),
    entry.timestamp,
    entry.action,
    entry.entityType,
    entry.entityId || '',
    entry.actorType,
    entry.actorId || '',
    entry.actorName || '',
    entry.actorEmail || '',
    entry.actorIp || '',
    JSON.stringify(entry.details),
    entry.entryHash,
  ]);

  const escapeCsvField = (field: string) => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  return [
    headers.join(','),
    ...rows.map(row => row.map(escapeCsvField).join(',')),
  ].join('\n');
}

// ============== CONVENIENCE LOGGING FUNCTIONS ==============

/**
 * Log document event with tenant context
 */
export async function logDocumentEvent(
  context: TenantContext,
  action: ImmutableAuditAction,
  documentId: string,
  details: Record<string, unknown> = {},
  request?: Request
): Promise<ImmutableAuditEntry> {
  return ImmutableAuditLogService.append({
    tenantId: context.tenant.id,
    action,
    entityType: 'document',
    entityId: documentId,
    actorType: 'user',
    actorId: context.user.id,
    actorName: context.user.name,
    actorEmail: context.user.email,
    actorIp: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
    actorUserAgent: request?.headers.get('user-agent') || null,
    details,
  });
}

/**
 * Log security event with tenant context
 */
export async function logSecurityEvent(
  tenantId: string,
  action: ImmutableAuditAction,
  details: Record<string, unknown> = {},
  request?: Request
): Promise<ImmutableAuditEntry> {
  return ImmutableAuditLogService.append({
    tenantId,
    action,
    entityType: 'security',
    entityId: null,
    actorType: 'system',
    actorIp: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
    actorUserAgent: request?.headers.get('user-agent') || null,
    details,
  });
}

/**
 * Log API event
 */
export async function logApiEvent(
  tenantId: string,
  action: ImmutableAuditAction,
  apiKeyId: string,
  details: Record<string, unknown> = {},
  request?: Request
): Promise<ImmutableAuditEntry> {
  return ImmutableAuditLogService.append({
    tenantId,
    action,
    entityType: 'api',
    entityId: apiKeyId,
    actorType: 'api',
    actorIp: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
    actorUserAgent: request?.headers.get('user-agent') || null,
    details,
  });
}
