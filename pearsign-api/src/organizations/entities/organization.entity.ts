import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ unique: true })
  @Index()
  name: string;

  @Column({ nullable: true })
  domain: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    allowedDomains?: string[];
    enableSSO?: boolean;
    maxUsers?: number;
    features?: string[];
  };

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt?: Date;

  @Column({ nullable: true })
  plan: string; // 'free', 'pro', 'enterprise'

  @OneToMany(() => User, (user) => user.organization)
  users: User[];
}
