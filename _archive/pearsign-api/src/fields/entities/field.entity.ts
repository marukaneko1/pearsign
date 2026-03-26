import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Document } from '../../documents/entities/document.entity';

export enum FieldType {
  SIGNATURE = 'signature',
  INITIALS = 'initials',
  DATE_SIGNED = 'date_signed',
  TEXT = 'text',
  CHECKBOX = 'checkbox',
  DROPDOWN = 'dropdown',
  RADIO = 'radio',
}

@Entity('fields')
export class Field extends BaseEntity {
  @Column({ name: 'envelope_id', nullable: true })
  @Index()
  envelopeId?: string; // Link to envelope (if part of signing workflow)

  @Column({ name: 'document_id' })
  @Index()
  documentId: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ type: 'enum', enum: FieldType })
  type: FieldType;

  @Column()
  label: string;

  @Column({ nullable: true })
  placeholder: string;

  @Column({ default: false })
  required: boolean;

  @Column({ type: 'int' })
  page: number; // Page number (1-indexed)

  @Column({ type: 'float' })
  x: number; // X coordinate (normalized 0-1)

  @Column({ type: 'float' })
  y: number; // Y coordinate (normalized 0-1)

  @Column({ type: 'float' })
  width: number; // Width (normalized 0-1)

  @Column({ type: 'float' })
  height: number; // Height (normalized 0-1)

  @Column({ name: 'assigned_to_recipient_id', nullable: true })
  @Index()
  assignedToRecipientId?: string; // Recipient who should fill this field

  @Column({ name: 'assigned_to_email', nullable: true })
  @Index()
  assignedToEmail: string; // Email of the person who should fill this field (legacy)

  @Column({ type: 'text', nullable: true })
  value: string; // Filled value (or pre-filled value)

  @Column({ type: 'text', nullable: true })
  preFilledValue?: string; // Admin-provided default value

  @Column({ default: false })
  isPreFilled: boolean; // If true, signer cannot edit this field

  @Column({ nullable: true })
  preFilledBy?: string; // User ID who pre-filled the field

  @Column({ type: 'text', nullable: true })
  tooltipText?: string; // Helper text shown during mapping

  @Column({ type: 'timestamp', nullable: true })
  filledAt: Date;

  @Column({ name: 'filled_by_ip', nullable: true })
  filledByIp: string;

  @Column({ type: 'jsonb', nullable: true })
  options: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    alignment?: 'left' | 'center' | 'right';
    dropdownOptions?: string[];
    [key: string]: any;
  };

  @Column({ default: 1 })
  order: number; // Tab order

  /**
   * Check if field can be edited by signer
   */
  canBeEditedBySigner(): boolean {
    return !this.isPreFilled;
  }

  /**
   * Get the display value (pre-filled or filled)
   */
  getDisplayValue(): string | null {
    if (this.isPreFilled && this.preFilledValue) {
      return this.preFilledValue;
    }
    return this.value || null;
  }

  /**
   * Pre-fill the field with admin-provided value
   */
  preFill(value: string, adminUserId: string, tooltip?: string): void {
    this.preFilledValue = value;
    this.isPreFilled = true;
    this.preFilledBy = adminUserId;
    if (tooltip) {
      this.tooltipText = tooltip;
    }
  }

  /**
   * Fill the field by a signer
   */
  fillBySigner(value: string, ipAddress: string): void {
    if (this.isPreFilled) {
      throw new Error('Cannot edit pre-filled field');
    }
    this.value = value;
    this.filledAt = new Date();
    this.filledByIp = ipAddress;
  }
}
