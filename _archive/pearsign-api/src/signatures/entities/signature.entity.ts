import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

export enum SignatureType {
  DRAWN = 'drawn',
  TYPED = 'typed',
  UPLOADED = 'uploaded',
}

@Entity('signatures')
export class Signature extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'enum', enum: SignatureType })
  type: SignatureType;

  @Column({ type: 'text', nullable: true })
  svgData: string; // For drawn signatures (vector)

  @Column({ name: 's3_key', nullable: true })
  s3Key: string; // For uploaded signatures

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    fontFamily?: string; // For typed signatures
    fontSize?: number;
    color?: string;
    width?: number;
    height?: number;
    [key: string]: any;
  };

  @Column({ default: false })
  isDefault: boolean; // User's default signature

  @Column({ nullable: true })
  name: string; // Optional name for the signature

  @Column({ type: 'text', nullable: true })
  initialsData: string; // Auto-generated initials from this signature
}
