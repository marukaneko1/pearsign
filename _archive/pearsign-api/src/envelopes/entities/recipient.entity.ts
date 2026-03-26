import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Envelope } from './envelope.entity';

/**
 * Recipient Role
 *
 * Defines what actions a recipient can take:
 * - SIGNER: Must sign, required for completion
 * - CC: Receives copy, no action required
 * - VIEWER: Can view, no signing
 * - APPROVER: Must approve before signing (future)
 */
export enum RecipientRole {
  SIGNER = 'signer',
  CC = 'cc',
  VIEWER = 'viewer',
  APPROVER = 'approver',
}

/**
 * Recipient Status
 *
 * Tracks recipient's progress through the signing workflow
 */
export enum RecipientStatus {
  PENDING = 'pending', // Waiting to receive envelope
  SENT = 'sent', // Email sent
  VIEWED = 'viewed', // Opened envelope
  SIGNING = 'signing', // Started signing
  COMPLETED = 'completed', // Finished signing
  DECLINED = 'declined', // Declined to sign
  BOUNCED = 'bounced', // Email bounced
}

/**
 * Recipient Entity
 *
 * Represents a person who receives the envelope.
 *
 * CRITICAL FEATURES:
 * - Name & email validation
 * - Role-based permissions
 * - Signing order (for sequential workflows)
 * - Status tracking
 * - Access token for signing (security)
 * - IP address & timestamp tracking (compliance)
 */
@Entity('recipients')
export class Recipient extends BaseEntity {
  @Column({ name: 'envelope_id' })
  @Index()
  envelopeId: string;

  @ManyToOne(() => Envelope, (envelope) => envelope.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'envelope_id' })
  envelope: Envelope;

  @Column()
  name: string;

  @Column()
  @Index()
  email: string;

  @Column({ type: 'enum', enum: RecipientRole, default: RecipientRole.SIGNER })
  role: RecipientRole;

  @Column({
    type: 'enum',
    enum: RecipientStatus,
    default: RecipientStatus.PENDING,
  })
  @Index()
  status: RecipientStatus;

  @Column({ name: 'signing_order', default: 1 })
  signingOrder: number; // 1, 2, 3... for sequential signing

  @Column({ name: 'access_token', nullable: true, unique: true })
  @Index()
  accessToken: string; // Unique token for signing URL

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  viewedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  signedAt?: Date;

  @Column({ type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'text', nullable: true })
  declineReason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    phoneNumber?: string;
    company?: string;
    title?: string;
    customFields?: Record<string, any>;
    lastReminderSentAt?: string; // ISO timestamp
    [key: string]: any; // Allow additional fields
  };

  /**
   * Check if recipient can sign
   */
  canSign(): boolean {
    return (
      this.role === RecipientRole.SIGNER &&
      [
        RecipientStatus.SENT,
        RecipientStatus.VIEWED,
        RecipientStatus.SIGNING,
      ].includes(this.status)
    );
  }

  /**
   * Check if recipient has completed
   */
  hasCompleted(): boolean {
    return this.status === RecipientStatus.COMPLETED;
  }

  /**
   * Check if recipient is waiting for their turn (sequential signing)
   */
  isWaitingForTurn(currentOrder: number): boolean {
    return this.signingOrder > currentOrder;
  }

  /**
   * Mark as viewed
   */
  markAsViewed(ipAddress: string, userAgent: string): void {
    if (this.status === RecipientStatus.SENT) {
      this.status = RecipientStatus.VIEWED;
      this.viewedAt = new Date();
      this.ipAddress = ipAddress;
      this.userAgent = userAgent;
    }
  }

  /**
   * Mark as completed
   */
  markAsCompleted(): void {
    this.status = RecipientStatus.COMPLETED;
    this.signedAt = new Date();
  }

  /**
   * Mark as declined
   */
  markAsDeclined(reason: string): void {
    this.status = RecipientStatus.DECLINED;
    this.declineReason = reason;
  }
}
