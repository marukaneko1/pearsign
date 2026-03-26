import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

export enum AuditAction {
  // Document actions
  DOCUMENT_CREATED = 'document.created',
  DOCUMENT_VIEWED = 'document.viewed',
  DOCUMENT_EDITED = 'document.edited',
  DOCUMENT_SENT = 'document.sent',
  DOCUMENT_SIGNED = 'document.signed',
  DOCUMENT_COMPLETED = 'document.completed',
  DOCUMENT_CANCELLED = 'document.cancelled',
  DOCUMENT_DELETED = 'document.deleted',

  // Field actions
  FIELD_CREATED = 'field.created',
  FIELD_UPDATED = 'field.updated',
  FIELD_FILLED = 'field.filled',
  FIELD_DELETED = 'field.deleted',

  // User actions
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',

  // Organization actions
  ORG_CREATED = 'org.created',
  ORG_UPDATED = 'org.updated',
  ORG_DELETED = 'org.deleted',
}

@Entity('audit_logs')
@Index(['documentId', 'createdAt'])
@Index(['envelopeId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['organizationId', 'createdAt'])
export class AuditLog extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  @Index()
  action: string; // Changed from enum to string for flexibility

  @Column({ name: 'organization_id', nullable: true })
  @Index()
  organizationId: string;

  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId: string;

  @Column({ nullable: true })
  userEmail: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  actor: string; // 'system', 'user', 'admin', etc.

  @Column({ name: 'document_id', nullable: true })
  @Index()
  documentId: string;

  @Column({ name: 'envelope_id', nullable: true })
  @Index()
  envelopeId: string;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    before?: any;
    after?: any;
    fieldId?: string;
    fieldType?: string;
    reason?: string;
    [key: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>; // Generic details object for events

  @Column({ type: 'text', nullable: true })
  description: string; // Human-readable description

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  timestamp: Date;
}
