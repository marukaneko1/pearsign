import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { Document } from '../../documents/entities/document.entity';
import { Recipient } from './recipient.entity';
import { BadRequestException } from '@nestjs/common';

/**
 * Envelope Status - The Core Signing Workflow State Machine
 *
 * CRITICAL: Envelope is the unit of sending & signing (not Document)
 *
 * State Machine:
 * DRAFT → READY_TO_SEND → IN_SIGNING → COMPLETED → VOIDED
 *
 * Rules:
 * - DRAFT: Building envelope, adding documents, recipients, fields
 * - READY_TO_SEND: Preview mode, validation checkpoint
 * - IN_SIGNING: Sent to recipients, read-only, signatures being collected
 * - COMPLETED: All signatures collected, certificate generated
 * - VOIDED: Cancelled, no further actions
 */
export enum EnvelopeStatus {
  DRAFT = 'draft', // Building envelope
  READY_TO_SEND = 'ready_to_send', // Preview/validation
  IN_SIGNING = 'in_signing', // Sent, collecting signatures
  COMPLETED = 'completed', // All signatures collected
  VOIDED = 'voided', // Cancelled
}

/**
 * Signing Order Strategy
 */
export enum SigningOrder {
  PARALLEL = 'parallel', // All recipients sign simultaneously
  SEQUENTIAL = 'sequential', // Recipients sign in order
}

/**
 * Envelope Entity
 *
 * The envelope is the core unit of the signing workflow.
 * It contains:
 * - One or more documents
 * - One or more recipients
 * - Field mappings
 * - Signing order
 * - Status tracking
 *
 * ARCHITECTURE PRINCIPLE:
 * Envelope is the boundary of a signing transaction.
 * All audit, status, and workflow logic happens at envelope level.
 */
@Entity('envelopes')
export class Envelope extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: EnvelopeStatus, default: EnvelopeStatus.DRAFT })
  @Index()
  status: EnvelopeStatus;

  @Column({ type: 'enum', enum: SigningOrder, default: SigningOrder.PARALLEL })
  signingOrder: SigningOrder;

  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'created_by' })
  @Index()
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => Recipient, (recipient) => recipient.envelope)
  recipients: Recipient[];

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    enableReminders?: boolean;
    reminderInterval?: number; // hours
    expirationDate?: Date;
    requireAuthentication?: boolean;
    allowDecline?: boolean;
    message?: string; // Custom message to recipients
  };

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastReminderAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    documentCount?: number;
    recipientCount?: number;
    fieldCount?: number;
    totalSignatures?: number;
    completedSignatures?: number;
    [key: string]: any;
  };

  /**
   * Validate and transition to a new state
   * Enforces envelope workflow state machine
   */
  transitionTo(newStatus: EnvelopeStatus): void {
    const validTransitions: Record<EnvelopeStatus, EnvelopeStatus[]> = {
      [EnvelopeStatus.DRAFT]: [
        EnvelopeStatus.READY_TO_SEND,
        EnvelopeStatus.VOIDED,
      ],
      [EnvelopeStatus.READY_TO_SEND]: [
        EnvelopeStatus.IN_SIGNING,
        EnvelopeStatus.DRAFT,
        EnvelopeStatus.VOIDED,
      ],
      [EnvelopeStatus.IN_SIGNING]: [
        EnvelopeStatus.COMPLETED,
        EnvelopeStatus.VOIDED,
      ],
      [EnvelopeStatus.COMPLETED]: [], // Terminal state
      [EnvelopeStatus.VOIDED]: [], // Terminal state
    };

    const allowed = validTransitions[this.status] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid envelope state transition: ${this.status} → ${newStatus}. ` +
          `Allowed transitions: ${allowed.join(', ')}`,
      );
    }

    this.status = newStatus;

    // Update timestamps based on state
    if (newStatus === EnvelopeStatus.IN_SIGNING) {
      this.sentAt = new Date();
    } else if (newStatus === EnvelopeStatus.COMPLETED) {
      this.completedAt = new Date();
    }
  }

  /**
   * Check if envelope can be edited
   */
  canEdit(): boolean {
    return this.status === EnvelopeStatus.DRAFT;
  }

  /**
   * Check if envelope is locked (read-only)
   */
  isLocked(): boolean {
    return [
      EnvelopeStatus.IN_SIGNING,
      EnvelopeStatus.COMPLETED,
      EnvelopeStatus.VOIDED,
    ].includes(this.status);
  }

  /**
   * Check if envelope is in preview mode
   */
  isInPreview(): boolean {
    return this.status === EnvelopeStatus.READY_TO_SEND;
  }

  /**
   * Check if envelope is immutable
   *
   * CRITICAL: Once COMPLETED, document is frozen forever
   * - No editable layers
   * - No fields
   * - No re-open
   * - New change = new envelope
   */
  isImmutable(): boolean {
    return [EnvelopeStatus.COMPLETED, EnvelopeStatus.VOIDED].includes(
      this.status,
    );
  }

  /**
   * Enforce immutability - throws if document is completed
   */
  enforceNotCompleted(): void {
    if (this.isImmutable()) {
      throw new Error(
        `Envelope is ${this.status} and cannot be modified. ` +
          `To make changes, create a new envelope.`,
      );
    }
  }

  /**
   * Check if envelope is expired
   */
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  /**
   * Check if envelope needs a reminder
   */
  needsReminder(): boolean {
    if (this.status !== EnvelopeStatus.IN_SIGNING) return false;
    if (!this.settings?.enableReminders) return false;

    const interval = this.settings.reminderInterval || 24; // Default 24 hours
    const lastReminder = this.lastReminderAt || this.sentAt;

    if (!lastReminder) return false;

    const hoursSinceLastReminder =
      (new Date().getTime() - lastReminder.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastReminder >= interval;
  }
}
