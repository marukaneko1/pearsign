import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { SigningOrder } from '../../envelopes/entities/envelope.entity';

export enum TemplateCategory {
  LEGAL = 'legal',
  HR = 'hr',
  SALES = 'sales',
  REAL_ESTATE = 'real_estate',
  FINANCE = 'finance',
  CUSTOM = 'custom',
}

/**
 * Template Entity
 *
 * Reusable document configurations
 *
 * Use Cases:
 * - HR: Offer Letter template with standard fields
 * - Sales: Sales Contract template with pricing fields
 * - Legal: NDA template with confidentiality clauses
 *
 * CRITICAL RULES:
 * - Templates are organization-scoped
 * - Templates can be cloned to create envelopes
 * - Templates track usage count
 * - Templates can be shared across organization
 */
@Entity('templates')
@Index(['organizationId', 'createdAt'])
@Index(['createdBy', 'category'])
export class Template extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'created_by' })
  @Index()
  createdBy: string;

  @Column()
  name: string; // e.g., "Standard NDA"

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TemplateCategory, default: TemplateCategory.CUSTOM })
  @Index()
  category: TemplateCategory;

  @Column({ type: 'enum', enum: SigningOrder, default: SigningOrder.SEQUENTIAL })
  signingOrder: SigningOrder;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    enableReminders?: boolean;
    reminderInterval?: number; // in hours
    requireAuthentication?: boolean;
    allowDecline?: boolean;
    expirationDays?: number;
    message?: string; // Default message for all envelopes
  };

  @Column({ type: 'jsonb', nullable: true })
  recipients: Array<{
    role: string; // 'signer', 'cc', 'viewer', 'approver'
    name?: string; // Optional pre-filled name
    email?: string; // Optional pre-filled email
    signingOrder: number;
    placeholderLabel: string; // e.g., "Employee", "Manager", "HR Director"
  }>;

  @Column({ type: 'jsonb', nullable: true })
  fields: Array<{
    type: string; // 'signature', 'text', 'date', 'checkbox'
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    assignedTo: string; // Placeholder label (e.g., "Employee")
    label: string; // Field label
    required: boolean;
    preFilledValue?: string; // Optional pre-filled value
  }>;

  @Column({ name: 'document_id', nullable: true })
  documentId?: string; // Associated document (optional)

  @Column({ type: 'int', default: 0 })
  usageCount: number; // How many times this template has been used

  @Column({ type: 'boolean', default: false })
  isPublic: boolean; // Can be used by all users in organization

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    tags?: string[]; // For categorization
    color?: string; // UI color
    icon?: string; // UI icon
    [key: string]: any;
  };

  /**
   * Increment usage count
   */
  incrementUsage(): void {
    this.usageCount++;
  }

  /**
   * Check if user can use template
   */
  canBeUsedBy(userId: string, userOrgId: string): boolean {
    // Must be in same organization
    if (this.organizationId !== userOrgId) {
      return false;
    }

    // Public templates can be used by anyone in org
    if (this.isPublic) {
      return true;
    }

    // Private templates can only be used by creator
    return this.createdBy === userId;
  }

  /**
   * Archive template
   */
  archive(): void {
    this.isArchived = true;
  }

  /**
   * Unarchive template
   */
  unarchive(): void {
    this.isArchived = false;
  }
}
