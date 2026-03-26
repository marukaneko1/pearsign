import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { FusionForm } from './fusionform.entity';

export enum SubmissionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('fusionform_submissions')
export class FusionFormSubmission extends BaseEntity {
  @Column({ name: 'fusionform_id' })
  @Index()
  fusionFormId: string;

  @ManyToOne(() => FusionForm, (fusionForm) => fusionForm.submissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fusionform_id' })
  fusionForm: FusionForm;

  @Column({ name: 'document_id', nullable: true })
  @Index()
  documentId: string; // Created document from this submission

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  status: SubmissionStatus;

  @Column({ nullable: true })
  submitterEmail: string;

  @Column({ nullable: true })
  submitterName: string;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'jsonb', nullable: true })
  formData: {
    [fieldName: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  queryParams: {
    [param: string]: string;
  };

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;
}
