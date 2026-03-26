import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Document } from './document.entity';
import { User } from '../../users/entities/user.entity';

@Entity('document_versions')
@Index(['documentId', 'version'], { unique: true })
export class DocumentVersion extends BaseEntity {
  @Column({ name: 'document_id' })
  @Index()
  documentId: string;

  @ManyToOne(() => Document, (document) => document.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column()
  version: number;

  @Column({ name: 's3_key' })
  s3Key: string; // S3 object key for this version

  @Column({ name: 'file_hash' })
  fileHash: string; // SHA-256 hash for integrity

  @Column({ name: 'file_size' })
  fileSize: number;

  @Column({ type: 'text', nullable: true })
  changeLog: string; // What changed in this version

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    editedText?: Array<{
      page: number;
      original: string;
      edited: string;
    }>;
    [key: string]: any;
  };

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
