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
import { DocumentVersion } from './document-version.entity';
import { BadRequestException } from '@nestjs/common';

/**
 * Document State Machine - Single Source of Truth
 *
 * CRITICAL RULES (NON-NEGOTIABLE):
 * - DRAFT: Initial upload, no modifications yet
 * - EDITABLE: Inline text editing allowed, layout can change
 * - READY_TO_SEND: Layout frozen, fields can be added, NO text editing
 * - IN_SIGNING: Read-only document, only field filling allowed
 * - COMPLETED: Flattened PDF with signatures, hashed, immutable
 * - VOIDED: Cancelled, no further actions allowed
 *
 * State Transitions:
 * DRAFT → EDITABLE (user clicks "Edit Document")
 * EDITABLE → READY_TO_SEND (user clicks "Done Editing")
 * READY_TO_SEND → IN_SIGNING (document sent to recipients)
 * IN_SIGNING → COMPLETED (all signatures collected)
 * Any state → VOIDED (document cancelled)
 *
 * Edit Rules:
 * - Inline PDF text editing ONLY allowed in EDITABLE state
 * - Any edit after READY_TO_SEND creates new DocumentVersion
 * - Signing PDFs are NEVER edited in-place
 * - COMPLETED documents are immutable forever
 */
export enum DocumentStatus {
  DRAFT = 'draft', // Initial upload
  EDITABLE = 'editable', // Inline editing allowed
  READY_TO_SEND = 'ready_to_send', // Layout frozen
  IN_SIGNING = 'in_signing', // Read-only, fields only
  COMPLETED = 'completed', // Flattened + hashed
  VOIDED = 'voided', // Cancelled
}

@Entity('documents')
export class Document extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'original_filename' })
  originalFilename: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'file_size' })
  fileSize: number;

  @Column({ name: 'file_hash' })
  @Index()
  fileHash: string; // SHA-256 hash of original file

  @Column({ name: 's3_key' })
  s3Key: string; // S3 object key for original file

  @Column({ name: 's3_bucket' })
  s3Bucket: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column({ default: 1 })
  currentVersion: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    pageCount?: number;
    hasTextLayer?: boolean;
    [key: string]: any;
  };

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

  @OneToMany(() => DocumentVersion, (version) => version.document)
  versions: DocumentVersion[];

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  /**
   * Validate and transition to a new state
   * Enforces state machine rules
   */
  transitionTo(newStatus: DocumentStatus): void {
    const validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
      [DocumentStatus.DRAFT]: [DocumentStatus.EDITABLE, DocumentStatus.VOIDED],
      [DocumentStatus.EDITABLE]: [
        DocumentStatus.READY_TO_SEND,
        DocumentStatus.VOIDED,
      ],
      [DocumentStatus.READY_TO_SEND]: [
        DocumentStatus.IN_SIGNING,
        DocumentStatus.EDITABLE,
        DocumentStatus.VOIDED,
      ],
      [DocumentStatus.IN_SIGNING]: [
        DocumentStatus.COMPLETED,
        DocumentStatus.VOIDED,
      ],
      [DocumentStatus.COMPLETED]: [], // Terminal state (except VOIDED)
      [DocumentStatus.VOIDED]: [], // Terminal state
    };

    const allowed = validTransitions[this.status] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid state transition: ${this.status} → ${newStatus}. ` +
          `Allowed transitions: ${allowed.join(', ')}`,
      );
    }

    this.status = newStatus;
  }

  /**
   * Check if document can be edited (inline text editing)
   */
  canEdit(): boolean {
    return this.status === DocumentStatus.EDITABLE;
  }

  /**
   * Check if document layout is frozen
   */
  isLayoutFrozen(): boolean {
    return [
      DocumentStatus.READY_TO_SEND,
      DocumentStatus.IN_SIGNING,
      DocumentStatus.COMPLETED,
    ].includes(this.status);
  }

  /**
   * Check if document is immutable
   */
  isImmutable(): boolean {
    return [DocumentStatus.COMPLETED, DocumentStatus.VOIDED].includes(
      this.status,
    );
  }
}
