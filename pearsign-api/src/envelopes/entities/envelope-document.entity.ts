import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Envelope } from './envelope.entity';
import { Document } from '../../documents/entities/document.entity';

/**
 * EnvelopeDocument Entity
 *
 * Links documents to envelopes.
 * An envelope can contain multiple documents.
 *
 * ARCHITECTURE PRINCIPLE:
 * - Envelope is the unit of signing
 * - Documents are the content
 * - This is the many-to-many relationship
 */
@Entity('envelope_documents')
@Index(['envelopeId', 'documentId'], { unique: true })
export class EnvelopeDocument extends BaseEntity {
  @Column({ name: 'envelope_id' })
  @Index()
  envelopeId: string;

  @ManyToOne(() => Envelope, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envelope_id' })
  envelope: Envelope;

  @Column({ name: 'document_id' })
  @Index()
  documentId: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ name: 'document_order', default: 1 })
  documentOrder: number; // Order of documents in envelope (1, 2, 3...)

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    pageRange?: string; // e.g., "1-5" or "all"
    includeInCertificate?: boolean;
    [key: string]: any;
  };
}
