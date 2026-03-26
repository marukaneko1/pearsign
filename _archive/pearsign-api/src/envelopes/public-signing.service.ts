import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Envelope, EnvelopeStatus } from './entities/envelope.entity';
import { Recipient, RecipientStatus } from './entities/recipient.entity';
import { Field } from '../fields/entities/field.entity';
import { CaptureSignatureDto } from './dto/capture-signature.dto';
import { CompleteSigningDto } from './dto/complete-signing.dto';
import { CompletionService } from './completion.service';
import {
  RecipientViewedEvent,
  RecipientSignedEvent,
  EnvelopeEventType,
} from './events/envelope.events';

/**
 * PublicSigningService
 *
 * Handles the public signing workflow:
 * - Token validation
 * - Field access control
 * - Signature capture
 * - Completion logic
 * - Certificate generation
 */
@Injectable()
export class PublicSigningService {
  constructor(
    @InjectRepository(Envelope)
    private envelopeRepository: Repository<Envelope>,
    @InjectRepository(Recipient)
    private recipientRepository: Repository<Recipient>,
    @InjectRepository(Field)
    private fieldRepository: Repository<Field>,
    private completionService: CompletionService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Validate token and get signing data
   */
  async validateTokenAndGetData(
    token: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    envelope: Envelope;
    recipient: Recipient;
    assignedFields: Field[];
    allFields: Field[]; // For read-only display
  }> {
    // Find recipient by access token
    const recipient = await this.recipientRepository.findOne({
      where: { accessToken: token },
      relations: ['envelope'],
    });

    if (!recipient) {
      throw new NotFoundException('Invalid or expired signing link');
    }

    // Get envelope with full data
    const envelope = await this.envelopeRepository.findOne({
      where: { id: recipient.envelopeId },
      relations: ['recipients'],
    });

    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    // Validate envelope status
    if (envelope.status !== EnvelopeStatus.IN_SIGNING) {
      throw new BadRequestException(
        `Document cannot be signed. Current status: ${envelope.status}`,
      );
    }

    // Check if envelope is expired
    if (envelope.isExpired()) {
      throw new ForbiddenException('This signing request has expired');
    }

    // Check if recipient already completed
    if (recipient.status === RecipientStatus.COMPLETED) {
      throw new BadRequestException('You have already signed this document');
    }

    // Check if recipient declined
    if (recipient.status === RecipientStatus.DECLINED) {
      throw new BadRequestException('You have declined this document');
    }

    // Get all fields for the envelope
    const allFields = await this.fieldRepository.find({
      where: { envelopeId: envelope.id },
      order: { order: 'ASC' },
    });

    // Filter fields assigned to this recipient
    const assignedFields = allFields.filter(
      (field) =>
        field.assignedToRecipientId === recipient.id ||
        field.assignedToEmail === recipient.email,
    );

    return {
      envelope,
      recipient,
      assignedFields,
      allFields,
    };
  }

  /**
   * Mark envelope as viewed
   */
  async markAsViewed(
    token: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const recipient = await this.recipientRepository.findOne({
      where: { accessToken: token },
    });

    if (!recipient) {
      throw new NotFoundException('Invalid token');
    }

    // Mark as viewed if not already
    if (recipient.status === RecipientStatus.SENT) {
      recipient.markAsViewed(ipAddress, userAgent);
      await this.recipientRepository.save(recipient);

      // Get envelope for event
      const envelope = await this.envelopeRepository.findOne({
        where: { id: recipient.envelopeId },
      });

      if (envelope) {
        // Emit RECIPIENT_VIEWED event
        const event = new RecipientViewedEvent(
          envelope.id,
          envelope.organizationId,
          recipient.id,
          recipient.name,
          recipient.email,
          ipAddress,
          userAgent,
        );

        this.eventEmitter.emit(EnvelopeEventType.RECIPIENT_VIEWED, event);
      }
    }
  }

  /**
   * Capture signature for a field
   */
  async captureSignature(
    token: string,
    dto: CaptureSignatureDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<Field> {
    const { recipient } = await this.validateTokenAndGetData(
      token,
      ipAddress,
      userAgent,
    );

    // Get field
    const field = await this.fieldRepository.findOne({
      where: { id: dto.fieldId },
    });

    if (!field) {
      throw new NotFoundException('Field not found');
    }

    // Validate field is assigned to this recipient
    if (
      field.assignedToRecipientId !== recipient.id &&
      field.assignedToEmail !== recipient.email
    ) {
      throw new ForbiddenException('You are not assigned to this field');
    }

    // Validate field can be edited
    if (!field.canBeEditedBySigner()) {
      throw new BadRequestException(
        'This field is pre-filled and cannot be edited',
      );
    }

    // Fill the field
    field.fillBySigner(dto.data, ipAddress);

    await this.fieldRepository.save(field);

    // Update recipient status to SIGNING
    if (recipient.status === RecipientStatus.VIEWED) {
      recipient.status = RecipientStatus.SIGNING;
      await this.recipientRepository.save(recipient);
    }

    // TODO: Log audit event

    return field;
  }

  /**
   * Complete signing
   */
  async completeSigning(
    token: string,
    dto: CompleteSigningDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    success: boolean;
    envelopeCompleted: boolean;
    downloadUrl?: string;
  }> {
    const { envelope, recipient, assignedFields } =
      await this.validateTokenAndGetData(token, ipAddress, userAgent);

    // Validate all required fields are filled
    const unfilledRequiredFields = assignedFields.filter(
      (field) => field.required && !field.value && !field.preFilledValue,
    );

    if (unfilledRequiredFields.length > 0) {
      throw new BadRequestException(
        `Please fill all required fields. Missing: ${unfilledRequiredFields.length} fields`,
      );
    }

    // Mark recipient as completed
    recipient.markAsCompleted();
    recipient.ipAddress = ipAddress;
    recipient.userAgent = userAgent;
    await this.recipientRepository.save(recipient);

    // Emit RECIPIENT_SIGNED event
    const signedEvent = new RecipientSignedEvent(
      envelope.id,
      envelope.organizationId,
      recipient.id,
      recipient.name,
      recipient.email,
      ipAddress,
      userAgent,
    );

    this.eventEmitter.emit(EnvelopeEventType.RECIPIENT_SIGNED, signedEvent);

    // Check if all recipients completed
    const allRecipients = await this.recipientRepository.find({
      where: { envelopeId: envelope.id },
    });

    const allCompleted = allRecipients.every(
      (r) =>
        r.status === RecipientStatus.COMPLETED ||
        r.role === 'cc' ||
        r.role === 'viewer',
    );

    let envelopeCompleted = false;
    let downloadUrl: string | undefined;

    if (allCompleted) {
      // Transition envelope to COMPLETED
      envelope.transitionTo(EnvelopeStatus.COMPLETED);
      await this.envelopeRepository.save(envelope);

      envelopeCompleted = true;

      // Generate final PDF with signatures and certificate
      try {
        const completion = await this.completionService.completeEnvelope(
          envelope.id,
        );

        downloadUrl = completion.finalPdfUrl;

        // Completion emails are sent automatically via ENVELOPE_COMPLETED event
      } catch (error) {
        console.error('Error completing envelope:', error);
        // Log error but don't fail the completion
      }
    }

    return {
      success: true,
      envelopeCompleted,
      downloadUrl,
    };
  }

  /**
   * Decline signing
   */
  async declineSigning(
    token: string,
    reason: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const recipient = await this.recipientRepository.findOne({
      where: { accessToken: token },
    });

    if (!recipient) {
      throw new NotFoundException('Invalid token');
    }

    // Mark as declined
    recipient.markAsDeclined(reason);
    recipient.ipAddress = ipAddress;
    recipient.userAgent = userAgent;
    await this.recipientRepository.save(recipient);

    // TODO: Send decline notification to sender
    // TODO: Log audit event
  }
}
