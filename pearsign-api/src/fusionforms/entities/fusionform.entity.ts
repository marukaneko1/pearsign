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
import { FusionFormSubmission } from './fusionform-submission.entity';

export enum FusionFormLinkType {
  ONE_TIME = 'one_time', // Link expires after first use
  REUSABLE = 'reusable', // Link can be used multiple times
  GATED = 'gated', // Requires authentication or specific conditions
}

@Entity('fusionforms')
export class FusionForm extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'template_s3_key' })
  templateS3Key: string; // S3 key for the template document

  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: 'enum', enum: FusionFormLinkType })
  linkType: FusionFormLinkType;

  @Column({ unique: true })
  @Index()
  token: string; // Unique token for the public link

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  fields: Array<{
    type: string;
    label: string;
    placeholder?: string;
    required: boolean;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    assignedToRole?: string; // e.g., 'signer', 'witness'
    options?: any;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  prefillParams: {
    allowedParams?: string[]; // Query params that can be used to prefill fields
    mapping?: Record<string, string>; // Map query param to field name
  };

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    requireAuth?: boolean;
    allowedDomains?: string[];
    redirectUrl?: string;
    successMessage?: string;
    maxSubmissions?: number;
    [key: string]: any;
  };

  @OneToMany(() => FusionFormSubmission, (submission) => submission.fusionForm)
  submissions: FusionFormSubmission[];

  @Column({ default: 0 })
  submissionCount: number;
}
