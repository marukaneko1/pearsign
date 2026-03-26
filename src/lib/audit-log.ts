/**
 * PearSign Audit Log Service
 * Tracks all notification events and system actions for compliance
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from './db';

// ============== TYPES ==============

export type AuditAction =
  // Notification actions
  | 'notification.created'
  | 'notification.read'
  | 'notification.read_all'
  | 'notification.deleted'
  // Envelope actions
  | 'envelope.created'
  | 'envelope.sent'
  | 'envelope.viewed'
  | 'envelope.signed'
  | 'envelope.completed'
  | 'envelope.voided'
  | 'envelope.declined'
  | 'envelope.expired'
  | 'envelope.reminder_sent'
  | 'envelope.2fa_code_sent'
  | 'envelope.2fa_verified'
  // User actions
  | 'user.invited'
  | 'user.joined'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  // Template actions
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'template.assigned'
  | 'template.activated'
  | 'template.deactivated'
  | 'template.duplicated'
  // Invoice actions
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.sent'
  | 'invoice.paid'
  | 'invoice.voided'
  // API key actions
  | 'api_key.created'
  | 'api_key.revoked'
  // Settings actions
  | 'settings.updated'
  | 'preferences.updated'
  // Auth / account actions
  | 'auth.password_changed'
  | 'auth.2fa_enabled'
  | 'auth.2fa_disabled'
  // System actions
  | 'system.login'
  | 'system.logout'
  | 'system.error';

export type AuditEntityType =
  | 'NOTIFICATION'
  | 'ENVELOPE'
  | 'DOCUMENT'
  | 'USER'
  | 'TEMPLATE'
  | 'TEAM'
  | 'SETTINGS'
  | 'SYSTEM';

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface CreateAuditLogInput {
  orgId: string; // REQUIRED - tenant isolation
  userId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ============== TABLE GUARD ==============

let auditTableReady = false;
async function ensureAuditTable(): Promise<void> {
  if (auditTableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id VARCHAR(255),
      actor_id VARCHAR(255),
      actor_name VARCHAR(255),
      actor_email VARCHAR(255),
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(100),
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id    ON audit_logs(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_org_ts    ON audit_logs(org_id, created_at DESC)`;
  auditTableReady = true;
}

// ============== AUDIT LOG SERVICE ==============

export const AuditLogService = {
  /**
   * Create a new audit log entry
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    if (!input.orgId) {
      throw new Error('orgId is required for audit logging');
    }

    await ensureAuditTable().catch(() => {});

    const result = await sql`
      INSERT INTO audit_logs (
        org_id, user_id, action, entity_type, entity_id,
        actor_id, actor_name, actor_email, details, ip_address, user_agent
      ) VALUES (
        ${input.orgId},
        ${input.userId || null},
        ${input.action},
        ${input.entityType},
        ${input.entityId || null},
        ${input.actorId || null},
        ${input.actorName || null},
        ${input.actorEmail || null},
        ${JSON.stringify(input.details || {})},
        ${input.ipAddress || null},
        ${input.userAgent || null}
      )
      RETURNING *
    `;

    return mapAuditLogFromDb(result[0]);
  },

  /**
   * Get audit logs with filtering
   */
  async getLogs(options: {
    orgId: string; // REQUIRED
    userId?: string;
    action?: AuditAction;
    entityType?: AuditEntityType;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    if (!options.orgId) {
      throw new Error('orgId is required');
    }

    await ensureAuditTable().catch(() => {});

    const orgId = options.orgId;
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const results = await sql`
      SELECT * FROM audit_logs
      WHERE org_id = ${orgId}
        AND (${options.userId ?? null}::text IS NULL OR user_id     = ${options.userId     ?? null}::text)
        AND (${options.action ?? null}::text IS NULL OR action      = ${options.action     ?? null}::text)
        AND (${options.entityType ?? null}::text IS NULL OR entity_type = ${options.entityType ?? null}::text)
        AND (${options.entityId   ?? null}::text IS NULL OR entity_id   = ${options.entityId   ?? null}::text)
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as count FROM audit_logs
      WHERE org_id = ${orgId}
        AND (${options.userId ?? null}::text IS NULL OR user_id     = ${options.userId     ?? null}::text)
        AND (${options.action ?? null}::text IS NULL OR action      = ${options.action     ?? null}::text)
        AND (${options.entityType ?? null}::text IS NULL OR entity_type = ${options.entityType ?? null}::text)
        AND (${options.entityId   ?? null}::text IS NULL OR entity_id   = ${options.entityId   ?? null}::text)
    `;

    return {
      logs: results.map(mapAuditLogFromDb),
      total: parseInt(countResult[0].count, 10),
    };
  },

  /**
   * Get audit logs for a specific entity
   */
  async getEntityHistory(
    entityType: AuditEntityType,
    entityId: string,
    orgId: string
  ): Promise<AuditLog[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const results = await sql`
      SELECT * FROM audit_logs
      WHERE org_id = ${orgId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return results.map(mapAuditLogFromDb);
  },

  /**
   * Get recent activity for a user
   */
  async getUserActivity(userId: string, orgId: string, limit = 20): Promise<AuditLog[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const results = await sql`
      SELECT * FROM audit_logs
      WHERE org_id = ${orgId}
        AND (user_id = ${userId} OR actor_id = ${userId})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return results.map(mapAuditLogFromDb);
  },

  /**
   * Delete old audit logs (for compliance/cleanup)
   */
  async deleteOlderThan(days: number, orgId: string): Promise<number> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      DELETE FROM audit_logs
      WHERE org_id = ${orgId}
        AND created_at < NOW() - INTERVAL '1 day' * ${days}
      RETURNING id
    `;
    return result.length;
  },
};

// ============== HELPER FUNCTIONS ==============

function mapAuditLogFromDb(row: Record<string, unknown>): AuditLog {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string | null,
    action: row.action as AuditAction,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id as string | null,
    actorId: row.actor_id as string | null,
    actorName: row.actor_name as string | null,
    actorEmail: row.actor_email as string | null,
    details: (row.details as Record<string, unknown>) || {},
    ipAddress: row.ip_address as string | null,
    userAgent: row.user_agent as string | null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ============== CONVENIENCE LOGGING FUNCTIONS ==============

/**
 * Log a notification event
 */
export async function logNotificationEvent(
  action: 'notification.created' | 'notification.read' | 'notification.read_all',
  params: {
    orgId: string; // REQUIRED
    userId?: string;
    notificationId?: string;
    notificationType?: string;
    recipientId?: string;
    actorId?: string;
    actorName?: string;
    details?: Record<string, unknown>;
  }
): Promise<AuditLog> {
  if (!params.orgId) {
    throw new Error('orgId is required');
  }

  return AuditLogService.log({
    orgId: params.orgId,
    userId: params.recipientId || params.userId,
    action,
    entityType: 'NOTIFICATION',
    entityId: params.notificationId,
    actorId: params.actorId,
    actorName: params.actorName,
    details: {
      notificationType: params.notificationType,
      ...params.details,
    },
  });
}

/**
 * Log an envelope event
 */
export async function logEnvelopeEvent(
  action: AuditAction,
  params: {
    orgId: string; // REQUIRED
    envelopeId: string;
    envelopeTitle?: string;
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    recipientId?: string;
    recipientEmail?: string;
    details?: Record<string, unknown>;
  }
): Promise<AuditLog> {
  if (!params.orgId) {
    throw new Error('orgId is required');
  }

  return AuditLogService.log({
    orgId: params.orgId,
    userId: params.recipientId,
    action,
    entityType: 'ENVELOPE',
    entityId: params.envelopeId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorEmail: params.actorEmail,
    details: {
      envelopeTitle: params.envelopeTitle,
      recipientEmail: params.recipientEmail,
      ...params.details,
    },
  });
}

/**
 * Log a template event
 */
export async function logTemplateEvent(
  action: AuditAction,
  params: {
    orgId: string;
    templateId: string;
    templateName?: string;
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!params.orgId) return;
  await AuditLogService.log({
    orgId: params.orgId,
    action,
    entityType: 'TEMPLATE',
    entityId: params.templateId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorEmail: params.actorEmail,
    details: {
      templateName: params.templateName,
      ...params.details,
    },
  }).catch(err => console.warn('[AuditLog] logTemplateEvent failed:', err));
}

/**
 * Log a system / auth event (login, logout, password change, etc.)
 */
export async function logSystemEvent(
  action: AuditAction,
  params: {
    orgId: string;
    userId?: string;
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!params.orgId) return;
  await AuditLogService.log({
    orgId: params.orgId,
    userId: params.userId,
    action,
    entityType: 'SYSTEM',
    actorId: params.actorId,
    actorName: params.actorName,
    actorEmail: params.actorEmail,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details: params.details || {},
  }).catch(err => console.warn('[AuditLog] logSystemEvent failed:', err));
}

/**
 * Log a settings change event
 */
export async function logSettingsEvent(
  params: {
    orgId: string;
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!params.orgId) return;
  await AuditLogService.log({
    orgId: params.orgId,
    action: 'settings.updated',
    entityType: 'SETTINGS',
    actorId: params.actorId,
    actorName: params.actorName,
    actorEmail: params.actorEmail,
    details: params.details || {},
  }).catch(err => console.warn('[AuditLog] logSettingsEvent failed:', err));
}

/**
 * Log a user/team event
 */
export async function logUserEvent(
  action: AuditAction,
  params: {
    orgId: string; // REQUIRED
    userId: string;
    userName?: string;
    userEmail?: string;
    actorId?: string;
    actorName?: string;
    details?: Record<string, unknown>;
  }
): Promise<AuditLog> {
  if (!params.orgId) {
    throw new Error('orgId is required');
  }

  return AuditLogService.log({
    orgId: params.orgId,
    userId: params.userId,
    action,
    entityType: 'USER',
    entityId: params.userId,
    actorId: params.actorId,
    actorName: params.actorName,
    details: {
      userName: params.userName,
      userEmail: params.userEmail,
      ...params.details,
    },
  });
}
