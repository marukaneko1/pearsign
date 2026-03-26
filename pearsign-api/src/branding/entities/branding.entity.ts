import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('branding')
export class Branding extends BaseEntity {
  @Column({ name: 'organization_id', unique: true })
  @Index()
  organizationId: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ nullable: true })
  companyName: string;

  @Column({ name: 'logo_s3_key', nullable: true })
  logoS3Key: string;

  @Column({ nullable: true })
  primaryColor: string; // Hex color

  @Column({ nullable: true })
  secondaryColor: string;

  @Column({ type: 'jsonb', nullable: true })
  emailTemplates: {
    signatureRequest?: {
      subject: string;
      body: string;
      footerText?: string;
    };
    documentCompleted?: {
      subject: string;
      body: string;
    };
    reminder?: {
      subject: string;
      body: string;
    };
    [key: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  signingPageSettings: {
    headerText?: string;
    footerText?: string;
    backgroundColor?: string;
    showCompanyLogo?: boolean;
    customCss?: string;
    [key: string]: any;
  };

  @Column({ type: 'text', nullable: true })
  termsOfServiceUrl: string;

  @Column({ type: 'text', nullable: true })
  privacyPolicyUrl: string;

  @Column({ type: 'text', nullable: true })
  supportEmail: string;

  @Column({ type: 'text', nullable: true })
  supportUrl: string;
}
