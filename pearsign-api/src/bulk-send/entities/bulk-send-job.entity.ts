import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

export enum BulkSendJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL_SUCCESS = 'partial_success',
}

/**
 * BulkSendJob Entity
 *
 * Tracks bulk envelope creation jobs
 *
 * Use Cases:
 * - HR: Send offer letters to 100 candidates
 * - Sales: Send contracts to 50 clients
 * - Real Estate: Send agreements to multiple parties
 *
 * CRITICAL RULES:
 * - One job = one CSV upload
 * - One row = one envelope
 * - Supports partial success (some succeed, some fail)
 * - Progress tracked in real-time
 */
@Entity('bulk_send_jobs')
@Index(['organizationId', 'createdAt'])
@Index(['createdBy', 'status'])
export class BulkSendJob extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @Column({ name: 'created_by' })
  @Index()
  createdBy: string;

  @Column()
  title: string; // e.g., "Q4 Offer Letters"

  @Column({ type: 'enum', enum: BulkSendJobStatus, default: BulkSendJobStatus.PENDING })
  @Index()
  status: BulkSendJobStatus;

  @Column({ type: 'int', default: 0 })
  totalRows: number; // Total rows in CSV

  @Column({ type: 'int', default: 0 })
  processedRows: number; // Rows processed so far

  @Column({ type: 'int', default: 0 })
  successfulRows: number; // Rows that succeeded

  @Column({ type: 'int', default: 0 })
  failedRows: number; // Rows that failed

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    templateId?: string; // Template to use for all envelopes
    message?: string; // Custom message for all recipients
    enableReminders?: boolean;
    reminderInterval?: number; // in hours
    expirationDays?: number; // Days until expiration
  };

  @Column({ type: 'jsonb', nullable: true })
  results: {
    envelopeIds: string[]; // Successfully created envelope IDs
    errors: Array<{
      row: number;
      recipientEmail: string;
      error: string;
    }>;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    originalFileName?: string;
    csvHeaders?: string[];
    rowCount?: number;
    [key: string]: any;
  };

  /**
   * Get progress percentage
   */
  getProgress(): number {
    if (this.totalRows === 0) return 0;
    return Math.round((this.processedRows / this.totalRows) * 100);
  }

  /**
   * Check if job is complete
   */
  isComplete(): boolean {
    return this.status === BulkSendJobStatus.COMPLETED ||
           this.status === BulkSendJobStatus.FAILED ||
           this.status === BulkSendJobStatus.PARTIAL_SUCCESS;
  }

  /**
   * Mark job as started
   */
  markAsStarted(): void {
    this.status = BulkSendJobStatus.PROCESSING;
    this.startedAt = new Date();
  }

  /**
   * Mark job as completed
   */
  markAsCompleted(): void {
    if (this.failedRows > 0) {
      this.status = BulkSendJobStatus.PARTIAL_SUCCESS;
    } else {
      this.status = BulkSendJobStatus.COMPLETED;
    }
    this.completedAt = new Date();
  }

  /**
   * Mark job as failed
   */
  markAsFailed(): void {
    this.status = BulkSendJobStatus.FAILED;
    this.completedAt = new Date();
  }

  /**
   * Increment processed rows
   */
  incrementProcessed(success: boolean): void {
    this.processedRows++;
    if (success) {
      this.successfulRows++;
    } else {
      this.failedRows++;
    }
  }

  /**
   * Add envelope ID to results
   */
  addEnvelopeId(envelopeId: string): void {
    if (!this.results) {
      this.results = { envelopeIds: [], errors: [] };
    }
    this.results.envelopeIds.push(envelopeId);
  }

  /**
   * Add error to results
   */
  addError(row: number, recipientEmail: string, error: string): void {
    if (!this.results) {
      this.results = { envelopeIds: [], errors: [] };
    }
    this.results.errors.push({ row, recipientEmail, error });
  }
}
