/**
 * PearSign Notification System
 * Server-side notification management with real-time support
 */

import { sql, DEFAULT_ORG_ID } from './db';
import { logNotificationEvent, logEnvelopeEvent } from './audit-log';

// ============== TYPES ==============

export type NotificationType =
  | 'envelope_sent'
  | 'envelope_viewed'
  | 'envelope_signed'
  | 'envelope_completed'
  | 'envelope_voided'
  | 'envelope_declined'
  | 'envelope_expired'
  | 'team_invite'
  | 'role_changed'
  | 'user_deactivated'
  | 'template_assigned'
  | 'reminder_sent'
  | 'document_deleted'
  | 'system_update';

export type EntityType =
  | 'ENVELOPE'
  | 'DOCUMENT'
  | 'USER'
  | 'TEMPLATE'
  | 'TEAM'
  | 'SYSTEM';

export interface Notification {
  id: string;
  orgId: string;
  userId: string | null;
  type: NotificationType;
  title: string;
  message: string | null;
  entityType: EntityType;
  entityId: string | null;
  actionUrl: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  metadata: Record<string, unknown>;
}

export interface NotificationPreferences {
  id: string;
  orgId: string;
  userId: string;
  envelopeSent: boolean;
  envelopeViewed: boolean;
  envelopeSigned: boolean;
  envelopeCompleted: boolean;
  envelopeDeclined: boolean;
  teamInvites: boolean;
  roleChanges: boolean;
  templateAssigned: boolean;
  reminders: boolean;
  systemUpdates: boolean;
  emailNotifications: boolean;
}

export interface CreateNotificationInput {
  orgId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  message?: string | null;
  entityType: EntityType;
  entityId?: string | null;
  actionUrl: string;
  metadata?: Record<string, unknown>;
}

// ============== NOTIFICATION SERVICE ==============

export const NotificationService = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await sql`
      INSERT INTO notifications (
        org_id, user_id, type, title, message,
        entity_type, entity_id, action_url, metadata
      ) VALUES (
        ${input.orgId},
        ${input.userId || null},
        ${input.type},
        ${input.title},
        ${input.message || null},
        ${input.entityType},
        ${input.entityId || null},
        ${input.actionUrl},
        ${JSON.stringify(input.metadata || {})}
      )
      RETURNING *
    `;

    const notification = mapNotificationFromDb(result[0]);

    // Audit log
    try {
      await logNotificationEvent('notification.created', {
        orgId: input.orgId,
        notificationId: notification.id,
        notificationType: input.type,
        recipientId: input.userId || undefined,
        details: { title: input.title, entityType: input.entityType, entityId: input.entityId },
      });
    } catch (e) { console.error('Audit log failed:', e); }

    return notification;
  },

  async createMany(inputs: CreateNotificationInput[]): Promise<Notification[]> {
    const notifications: Notification[] = [];
    for (const input of inputs) {
      const notification = await this.create(input);
      notifications.push(notification);
    }
    return notifications;
  },

  async getForUser(
    orgId: string,
    userId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean; } = {}
  ): Promise<{ notifications: Notification[]; total: number }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let query;
    let countQuery;

    if (options.unreadOnly) {
      query = sql`SELECT * FROM notifications WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL) AND is_read = false ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      countQuery = sql`SELECT COUNT(*) as count FROM notifications WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL) AND is_read = false`;
    } else {
      query = sql`SELECT * FROM notifications WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      countQuery = sql`SELECT COUNT(*) as count FROM notifications WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL)`;
    }

    const [results, countResult] = await Promise.all([query, countQuery]);
    return { notifications: results.map(mapNotificationFromDb), total: parseInt(countResult[0].count, 10) };
  },

  async getUnreadCount(orgId: string, userId: string): Promise<number> {
    const result = await sql`SELECT COUNT(*) as count FROM notifications WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL) AND is_read = false`;
    return parseInt(result[0].count, 10);
  },

  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    const result = await sql`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = ${notificationId}::uuid AND (user_id = ${userId} OR user_id IS NULL) RETURNING *`;
    if (result.length === 0) return null;
    const notification = mapNotificationFromDb(result[0]);

    try {
      await logNotificationEvent('notification.read', {
        orgId: notification.orgId,
        notificationId: notification.id,
        notificationType: notification.type,
        recipientId: userId,
        actorId: userId,
      });
    } catch (e) { console.error('Audit log failed:', e); }

    return notification;
  },

  async markAllAsRead(orgId: string, userId: string): Promise<number> {
    const result = await sql`UPDATE notifications SET is_read = true, read_at = NOW() WHERE org_id = ${orgId} AND (user_id = ${userId} OR user_id IS NULL) AND is_read = false RETURNING id`;

    try {
      await logNotificationEvent('notification.read_all', { orgId, recipientId: userId, actorId: userId, details: { count: result.length } });
    } catch (e) { console.error('Audit log failed:', e); }

    return result.length;
  },

  async getById(notificationId: string): Promise<Notification | null> {
    const result = await sql`SELECT * FROM notifications WHERE id = ${notificationId}::uuid`;
    if (result.length === 0) return null;
    return mapNotificationFromDb(result[0]);
  },

  async deleteOlderThan(days: number): Promise<number> {
    const result = await sql`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '${days} days' RETURNING id`;
    return result.length;
  },
};

// ============== NOTIFICATION PREFERENCES SERVICE ==============

export const NotificationPreferencesService = {
  async get(orgId: string, userId: string): Promise<NotificationPreferences> {
    const result = await sql`SELECT * FROM notification_preferences WHERE org_id = ${orgId} AND user_id = ${userId}`;
    if (result.length === 0) {
      return { id: '', orgId, userId, envelopeSent: true, envelopeViewed: true, envelopeSigned: true, envelopeCompleted: true, envelopeDeclined: true, teamInvites: true, roleChanges: true, templateAssigned: true, reminders: true, systemUpdates: true, emailNotifications: true };
    }
    return mapPreferencesFromDb(result[0]);
  },

  async update(orgId: string, userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const current = await this.get(orgId, userId);
    const result = await sql`
      INSERT INTO notification_preferences (org_id, user_id, envelope_sent, envelope_viewed, envelope_signed, envelope_completed, envelope_declined, team_invites, role_changes, template_assigned, reminders, system_updates, email_notifications)
      VALUES (${orgId}, ${userId}, ${preferences.envelopeSent ?? current.envelopeSent}, ${preferences.envelopeViewed ?? current.envelopeViewed}, ${preferences.envelopeSigned ?? current.envelopeSigned}, ${preferences.envelopeCompleted ?? current.envelopeCompleted}, ${preferences.envelopeDeclined ?? current.envelopeDeclined}, ${preferences.teamInvites ?? current.teamInvites}, ${preferences.roleChanges ?? current.roleChanges}, ${preferences.templateAssigned ?? current.templateAssigned}, ${preferences.reminders ?? current.reminders}, ${preferences.systemUpdates ?? current.systemUpdates}, ${preferences.emailNotifications ?? current.emailNotifications})
      ON CONFLICT (org_id, user_id) DO UPDATE SET envelope_sent = EXCLUDED.envelope_sent, envelope_viewed = EXCLUDED.envelope_viewed, envelope_signed = EXCLUDED.envelope_signed, envelope_completed = EXCLUDED.envelope_completed, envelope_declined = EXCLUDED.envelope_declined, team_invites = EXCLUDED.team_invites, role_changes = EXCLUDED.role_changes, template_assigned = EXCLUDED.template_assigned, reminders = EXCLUDED.reminders, system_updates = EXCLUDED.system_updates, email_notifications = EXCLUDED.email_notifications, updated_at = NOW()
      RETURNING *
    `;
    return mapPreferencesFromDb(result[0]);
  },

  async isEnabled(orgId: string, userId: string, type: NotificationType): Promise<boolean> {
    const prefs = await this.get(orgId, userId);
    const typeToPreference: Record<NotificationType, keyof NotificationPreferences> = {
      envelope_sent: 'envelopeSent', envelope_viewed: 'envelopeViewed', envelope_signed: 'envelopeSigned', envelope_completed: 'envelopeCompleted', envelope_voided: 'envelopeCompleted', envelope_declined: 'envelopeDeclined', envelope_expired: 'envelopeCompleted', team_invite: 'teamInvites', role_changed: 'roleChanges', user_deactivated: 'roleChanges', template_assigned: 'templateAssigned', reminder_sent: 'reminders', document_deleted: 'systemUpdates', system_update: 'systemUpdates',
    };
    return prefs[typeToPreference[type]] as boolean;
  },
};

// ============== EVENT HANDLERS ==============

export async function onEnvelopeSent(params: { orgId: string; senderId: string; senderName: string; envelopeId: string; envelopeTitle: string; recipientCount: number; }): Promise<Notification> {
  // Audit log the envelope send
  await logEnvelopeEvent('envelope.sent', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorId: params.senderId, actorName: params.senderName, details: { recipientCount: params.recipientCount } });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_sent',
    title: 'Document Sent Successfully',
    message: `"${params.envelopeTitle}" was sent to ${params.recipientCount} recipient${params.recipientCount > 1 ? 's' : ''}.`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { recipientCount: params.recipientCount },
  });
}

export async function onEnvelopeViewed(params: { orgId: string; senderId: string; viewerName: string; viewerEmail: string; envelopeId: string; envelopeTitle: string; }): Promise<Notification> {
  await logEnvelopeEvent('envelope.viewed', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorName: params.viewerName, actorEmail: params.viewerEmail, recipientEmail: params.viewerEmail });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_viewed',
    title: 'Document Viewed',
    message: `${params.viewerName || params.viewerEmail} viewed "${params.envelopeTitle}".`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { viewerEmail: params.viewerEmail },
  });
}

export async function onEnvelopeSigned(params: { orgId: string; senderId: string; signerName: string; signerEmail: string; envelopeId: string; envelopeTitle: string; }): Promise<Notification> {
  await logEnvelopeEvent('envelope.signed', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorName: params.signerName, actorEmail: params.signerEmail, recipientEmail: params.signerEmail });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_signed',
    title: 'Document Signed',
    message: `${params.signerName || params.signerEmail} signed "${params.envelopeTitle}".`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { signerEmail: params.signerEmail },
  });
}

export async function onEnvelopeCompleted(params: { orgId: string; senderId: string; recipientIds: string[]; envelopeId: string; envelopeTitle: string; }): Promise<Notification[]> {
  await logEnvelopeEvent('envelope.completed', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorId: params.senderId, details: { recipientCount: params.recipientIds.length } });

  const notifications: Notification[] = [];
  notifications.push(await NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_completed',
    title: 'Document Completed', message: `All parties have signed "${params.envelopeTitle}".`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
  }));

  for (const recipientId of params.recipientIds) {
    notifications.push(await NotificationService.create({
      orgId: params.orgId, userId: recipientId, type: 'envelope_completed',
      title: 'Document Completed', message: `"${params.envelopeTitle}" has been fully signed by all parties.`,
      entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    }));
  }
  return notifications;
}

export async function onEnvelopeVoided(params: { orgId: string; senderId: string; envelopeId: string; envelopeTitle: string; reason?: string; }): Promise<Notification> {
  await logEnvelopeEvent('envelope.voided', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorId: params.senderId, details: { reason: params.reason } });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_voided',
    title: 'Document Voided',
    message: `"${params.envelopeTitle}" was voided.${params.reason ? ` Reason: ${params.reason}` : ''}`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { reason: params.reason },
  });
}

export async function onEnvelopeDeclined(params: { orgId: string; senderId: string; signerName: string; signerEmail: string; envelopeId: string; envelopeTitle: string; reason?: string; }): Promise<Notification> {
  await logEnvelopeEvent('envelope.declined', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorName: params.signerName, actorEmail: params.signerEmail, details: { reason: params.reason } });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'envelope_declined',
    title: 'Document Declined',
    message: `${params.signerName || params.signerEmail} declined to sign "${params.envelopeTitle}".${params.reason ? ` Reason: ${params.reason}` : ''}`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { signerEmail: params.signerEmail, reason: params.reason },
  });
}

export async function onTeamInvite(params: { orgId: string; inviteeId: string; inviterName: string; inviteToken: string; teamName: string; }): Promise<Notification> {
  return NotificationService.create({
    orgId: params.orgId, userId: params.inviteeId, type: 'team_invite',
    title: 'Team Invitation', message: `${params.inviterName} invited you to join ${params.teamName}.`,
    entityType: 'TEAM', entityId: params.inviteToken, actionUrl: `/invite/${params.inviteToken}`,
    metadata: { inviterName: params.inviterName, teamName: params.teamName },
  });
}

export async function onRoleChanged(params: { orgId: string; userId: string; oldRole: string; newRole: string; changedBy: string; }): Promise<Notification> {
  return NotificationService.create({
    orgId: params.orgId, userId: params.userId, type: 'role_changed',
    title: 'Role Updated', message: `Your role was changed from ${params.oldRole} to ${params.newRole} by ${params.changedBy}.`,
    entityType: 'USER', entityId: params.userId, actionUrl: '/settings',
    metadata: { oldRole: params.oldRole, newRole: params.newRole },
  });
}

export async function onTemplateAssigned(params: { orgId: string; userId: string; templateId: string; templateName: string; assignedBy: string; }): Promise<Notification> {
  return NotificationService.create({
    orgId: params.orgId, userId: params.userId, type: 'template_assigned',
    title: 'Template Assigned', message: `"${params.templateName}" was assigned to you by ${params.assignedBy}.`,
    entityType: 'TEMPLATE', entityId: params.templateId, actionUrl: `/templates`,
    metadata: { assignedBy: params.assignedBy },
  });
}

export async function onReminderSent(params: { orgId: string; senderId: string; envelopeId: string; envelopeTitle: string; recipientEmail: string; }): Promise<Notification> {
  await logEnvelopeEvent('envelope.reminder_sent', { orgId: params.orgId, envelopeId: params.envelopeId, envelopeTitle: params.envelopeTitle, actorId: params.senderId, recipientEmail: params.recipientEmail });

  return NotificationService.create({
    orgId: params.orgId, userId: params.senderId, type: 'reminder_sent',
    title: 'Reminder Sent', message: `Reminder sent to ${params.recipientEmail} for "${params.envelopeTitle}".`,
    entityType: 'ENVELOPE', entityId: params.envelopeId, actionUrl: `/sent`,
    metadata: { recipientEmail: params.recipientEmail },
  });
}

// ============== HELPER FUNCTIONS ==============

function mapNotificationFromDb(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string, orgId: row.org_id as string, userId: row.user_id as string | null,
    type: row.type as NotificationType, title: row.title as string, message: row.message as string | null,
    entityType: row.entity_type as EntityType, entityId: row.entity_id as string | null,
    actionUrl: row.action_url as string, isRead: row.is_read as boolean,
    createdAt: (row.created_at as Date).toISOString(), readAt: row.read_at ? (row.read_at as Date).toISOString() : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapPreferencesFromDb(row: Record<string, unknown>): NotificationPreferences {
  return {
    id: row.id as string, orgId: row.org_id as string, userId: row.user_id as string,
    envelopeSent: row.envelope_sent as boolean, envelopeViewed: row.envelope_viewed as boolean,
    envelopeSigned: row.envelope_signed as boolean, envelopeCompleted: row.envelope_completed as boolean,
    envelopeDeclined: (row.envelope_declined as boolean) ?? true,
    teamInvites: row.team_invites as boolean, roleChanges: row.role_changes as boolean,
    templateAssigned: row.template_assigned as boolean, reminders: row.reminders as boolean,
    systemUpdates: row.system_updates as boolean, emailNotifications: row.email_notifications as boolean,
  };
}

export const NOTIFICATION_CONFIG: Record<NotificationType, { icon: string; color: string; bgColor: string; }> = {
  envelope_sent: { icon: 'Send', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  envelope_viewed: { icon: 'Eye', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  envelope_signed: { icon: 'PenTool', color: 'text-green-600', bgColor: 'bg-green-100' },
  envelope_completed: { icon: 'CheckCircle2', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  envelope_voided: { icon: 'XCircle', color: 'text-red-600', bgColor: 'bg-red-100' },
  envelope_declined: { icon: 'XCircle', color: 'text-red-600', bgColor: 'bg-red-100' },
  envelope_expired: { icon: 'Clock', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  team_invite: { icon: 'UserPlus', color: 'text-violet-600', bgColor: 'bg-violet-100' },
  role_changed: { icon: 'Shield', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  user_deactivated: { icon: 'UserX', color: 'text-red-600', bgColor: 'bg-red-100' },
  template_assigned: { icon: 'FileText', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  reminder_sent: { icon: 'Bell', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  document_deleted: { icon: 'Trash2', color: 'text-red-600', bgColor: 'bg-red-100' },
  system_update: { icon: 'Info', color: 'text-slate-600', bgColor: 'bg-slate-100' },
};
