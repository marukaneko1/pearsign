import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Envelope } from './entities/envelope.entity';
import { Recipient } from './entities/recipient.entity';
import { Field, FieldType } from '../fields/entities/field.entity';
import {
  FinalizePdfService,
  SignatureData,
} from '../pdf-engine/finalize-pdf.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import {
  EnvelopeCompletedEvent,
  EnvelopeEventType,
} from './events/envelope.events';

/**
 * CompletionService
 *
 * Handles envelope completion:
 * - Embed all signatures
 * - Generate final PDF
 * - Generate certificate with audit trail reference
 * - Make document immutable
 *
 * CRITICAL: This service MUST be called when all recipients complete
 */
@Injectable()
export class CompletionService {
  constructor(
    @InjectRepository(Envelope)
    private envelopeRepository: Repository<Envelope>,
    @InjectRepository(Recipient)
    private recipientRepository: Repository<Recipient>,
    @InjectRepository(Field)
    private fieldRepository: Repository<Field>,
    private finalizePdfService: FinalizePdfService,
    private storageService: StorageService,
    @Inject(forwardRef(() => AuditService))
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Complete envelope and generate final documents
   *
   * Returns TWO download options:
   * - Option A: PDF with certificate appended
   * - Option B: PDF and certificate separate
   */
  async completeEnvelope(envelopeId: string): Promise<{
    finalPdfUrl: string;
    certificateUrl: string;
    combinedPdfUrl: string;
    finalPdfHash: string;
  }> {
    // Get envelope
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
    });

    if (!envelope) {
      throw new Error('Envelope not found');
    }

    // Get all recipients
    const recipients = await this.recipientRepository.find({
      where: { envelopeId },
    });

    // Get all signature fields
    const signatureFields = await this.fieldRepository.find({
      where: {
        envelopeId,
        type: FieldType.SIGNATURE,
      },
    });

    // Build signature data
    const signatures: SignatureData[] = [];

    for (const field of signatureFields) {
      if (!field.value) continue;

      const recipient = recipients.find(
        (r) =>
          r.id === field.assignedToRecipientId ||
          r.email === field.assignedToEmail,
      );

      if (!recipient) continue;

      // Convert signature data to image bytes
      const imageBytes = await this.convertSignatureToImageBytes(field.value);

      signatures.push({
        pageNumber: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        imageBytes,
        signedAt: recipient.signedAt || new Date(),
        signerName: recipient.name,
        signerEmail: recipient.email,
      });
    }

    // TODO: Load original PDF from S3
    const originalPdfBytes = new Uint8Array(); // Placeholder

    // Finalize PDF with signatures
    const { pdfBytes, hash } = await this.finalizePdfService.finalizeDocument(
      originalPdfBytes,
      signatures,
    );

    // Fetch audit trail metadata
    let auditMetadata;
    try {
      const metadata =
        await this.auditService.getAuditMetadataForCertificate(envelopeId);
      auditMetadata = {
        totalEvents: metadata.totalEvents,
        auditHash: metadata.auditHash,
        auditTrailAvailable: true,
      };
    } catch (error) {
      // If no audit logs yet, continue without metadata
      auditMetadata = undefined;
    }

    // Generate certificate with audit trail reference
    const certificateBytes =
      await this.finalizePdfService.generateCompletionCertificate({
        documentId: envelopeId,
        documentTitle: envelope.title,
        completedAt: new Date(),
        signers: recipients
          .filter((r) => r.status === 'completed')
          .map((r) => ({
            name: r.name,
            email: r.email,
            signedAt: r.signedAt || new Date(),
            viewedAt: r.viewedAt,
            ipAddress: r.ipAddress || 'unknown',
            userAgent: r.userAgent || 'unknown',
            signingOrder: r.signingOrder,
          })),
        auditTrail: [], // Event logs shown separately in audit trail
        documentHash: hash,
        auditMetadata,
      });

    // Generate combined PDF (Option A: PDF + Certificate)
    const combinedPdfBytes =
      await this.finalizePdfService.appendCertificateToPdf(
        pdfBytes,
        certificateBytes,
      );

    // Upload all final artifacts to S3
    const artifacts = await this.storageService.uploadFinalArtifacts(
      envelope.organizationId,
      envelopeId,
      {
        finalPdf: pdfBytes,
        certificate: certificateBytes,
        combinedPdf: combinedPdfBytes,
        finalPdfHash: hash,
      },
    );

    // Update envelope with artifact URLs
    envelope.metadata = {
      ...envelope.metadata,
      finalPdfUrl: artifacts.finalPdfUrl,
      certificateUrl: artifacts.certificateUrl,
      combinedPdfUrl: artifacts.combinedPdfUrl,
      finalPdfHash: artifacts.finalPdfHash,
    };

    await this.envelopeRepository.save(envelope);

    // Emit ENVELOPE_COMPLETED event (triggers completion emails)
    const event = new EnvelopeCompletedEvent(
      envelope.id,
      envelope.organizationId,
      envelope.title,
      artifacts.finalPdfUrl,
      artifacts.certificateUrl,
      artifacts.combinedPdfUrl,
      recipients.map((r) => ({
        name: r.name,
        email: r.email,
      })),
    );

    this.eventEmitter.emit(EnvelopeEventType.ENVELOPE_COMPLETED, event);

    // Return real URLs
    return {
      finalPdfUrl: artifacts.finalPdfUrl,
      certificateUrl: artifacts.certificateUrl,
      combinedPdfUrl: artifacts.combinedPdfUrl,
      finalPdfHash: artifacts.finalPdfHash,
    };
  }

  /**
   * Convert signature data to image bytes
   */
  private async convertSignatureToImageBytes(
    signatureData: string,
  ): Promise<Uint8Array> {
    // TODO: Implement conversion
    // - If SVG: convert to PNG
    // - If base64: decode
    // - If text: generate image

    // Placeholder
    return new Uint8Array();
  }
}
