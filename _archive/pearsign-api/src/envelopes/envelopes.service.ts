import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Envelope, EnvelopeStatus } from './entities/envelope.entity';
import { Recipient, RecipientStatus } from './entities/recipient.entity';
import { EnvelopeDocument } from './entities/envelope-document.entity';
import { User } from '../users/entities/user.entity';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { AddRecipientDto } from './dto/add-recipient.dto';
import { AddDocumentDto } from './dto/add-document.dto';
import {
  EnvelopeSentEvent,
  EnvelopeEventType,
} from './events/envelope.events';
import * as crypto from 'crypto';

@Injectable()
export class EnvelopesService {
  constructor(
    @InjectRepository(Envelope)
    private envelopeRepository: Repository<Envelope>,
    @InjectRepository(Recipient)
    private recipientRepository: Repository<Recipient>,
    @InjectRepository(EnvelopeDocument)
    private envelopeDocumentRepository: Repository<EnvelopeDocument>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new envelope
   */
  async create(dto: CreateEnvelopeDto, user: User): Promise<Envelope> {
    const envelope = this.envelopeRepository.create({
      title: dto.title,
      description: dto.description,
      signingOrder: dto.signingOrder,
      organizationId: user.organizationId,
      createdBy: user.id,
      status: EnvelopeStatus.DRAFT,
      settings: {
        enableReminders: dto.enableReminders,
        reminderInterval: dto.reminderInterval,
        requireAuthentication: dto.requireAuthentication,
        allowDecline: dto.allowDecline,
        message: dto.message,
      },
      expiresAt: dto.expirationDate,
      metadata: {
        documentCount: 0,
        recipientCount: 0,
        fieldCount: 0,
        totalSignatures: 0,
        completedSignatures: 0,
      },
    });

    return this.envelopeRepository.save(envelope);
  }

  /**
   * Get envelope by ID
   */
  async findOne(id: string, user: User): Promise<Envelope> {
    const envelope = await this.envelopeRepository.findOne({
      where: {
        id,
        organizationId: user.organizationId,
      },
      relations: ['recipients', 'creator'],
    });

    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    return envelope;
  }

  /**
   * Add document to envelope
   */
  async addDocument(
    envelopeId: string,
    dto: AddDocumentDto,
    user: User,
  ): Promise<EnvelopeDocument> {
    const envelope = await this.findOne(envelopeId, user);

    if (!envelope.canEdit()) {
      throw new BadRequestException('Cannot add documents to locked envelope');
    }

    // Check if document already added
    const existing = await this.envelopeDocumentRepository.findOne({
      where: {
        envelopeId,
        documentId: dto.documentId,
      },
    });

    if (existing) {
      throw new BadRequestException('Document already added to envelope');
    }

    const envelopeDocument = this.envelopeDocumentRepository.create({
      envelopeId,
      documentId: dto.documentId,
      documentOrder: dto.documentOrder || 1,
      metadata: dto.metadata,
    });

    const saved = await this.envelopeDocumentRepository.save(envelopeDocument);

    // Update envelope metadata
    envelope.metadata.documentCount =
      (envelope.metadata.documentCount || 0) + 1;
    await this.envelopeRepository.save(envelope);

    return saved;
  }

  /**
   * Add recipient to envelope
   */
  async addRecipient(
    envelopeId: string,
    dto: AddRecipientDto,
    user: User,
  ): Promise<Recipient> {
    const envelope = await this.findOne(envelopeId, user);

    if (!envelope.canEdit()) {
      throw new BadRequestException('Cannot add recipients to locked envelope');
    }

    // Check for duplicate email
    const existing = await this.recipientRepository.findOne({
      where: {
        envelopeId,
        email: dto.email,
      },
    });

    if (existing) {
      throw new BadRequestException('Recipient with this email already exists');
    }

    // Generate access token
    const accessToken = this.generateAccessToken();

    const recipient = this.recipientRepository.create({
      envelopeId,
      name: dto.name,
      email: dto.email,
      role: dto.role,
      signingOrder: dto.signingOrder || 1,
      status: RecipientStatus.PENDING,
      accessToken,
      metadata: dto.metadata,
    });

    const saved = await this.recipientRepository.save(recipient);

    // Update envelope metadata
    envelope.metadata.recipientCount =
      (envelope.metadata.recipientCount || 0) + 1;
    await this.envelopeRepository.save(envelope);

    return saved;
  }

  /**
   * Move envelope to preview mode
   */
  async preview(envelopeId: string, user: User): Promise<Envelope> {
    const envelope = await this.findOne(envelopeId, user);

    // Validate envelope is ready
    this.validateEnvelopeReadyToSend(envelope);

    // Transition to preview
    envelope.transitionTo(EnvelopeStatus.READY_TO_SEND);

    return this.envelopeRepository.save(envelope);
  }

  /**
   * Send envelope to recipients
   */
  async send(envelopeId: string, user: User): Promise<Envelope> {
    const envelope = await this.findOne(envelopeId, user);

    // Validate envelope is ready
    this.validateEnvelopeReadyToSend(envelope);

    // Transition to IN_SIGNING
    envelope.transitionTo(EnvelopeStatus.IN_SIGNING);

    // Update all recipients to SENT
    const recipients = await this.recipientRepository.find({
      where: { envelopeId },
    });

    for (const recipient of recipients) {
      recipient.status = RecipientStatus.SENT;
      recipient.sentAt = new Date();
    }

    await this.recipientRepository.save(recipients);

    // Save envelope first
    const savedEnvelope = await this.envelopeRepository.save(envelope);

    // Emit ENVELOPE_SENT event (triggers signature request emails)
    const senderName = user.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : user.email;

    const event = new EnvelopeSentEvent(
      envelope.id,
      envelope.organizationId,
      envelope.title,
      senderName,
      user.email,
      recipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        signingUrl: this.generateSigningUrl(r.accessToken),
        signingOrder: r.signingOrder,
      })),
      envelope.settings?.message,
      envelope.expiresAt,
    );

    this.eventEmitter.emit(EnvelopeEventType.ENVELOPE_SENT, event);

    return savedEnvelope;
  }

  /**
   * Validate envelope is ready to send
   */
  private validateEnvelopeReadyToSend(envelope: Envelope): void {
    if (
      !envelope.metadata.documentCount ||
      envelope.metadata.documentCount === 0
    ) {
      throw new BadRequestException('Envelope must have at least one document');
    }

    if (
      !envelope.metadata.recipientCount ||
      envelope.metadata.recipientCount === 0
    ) {
      throw new BadRequestException(
        'Envelope must have at least one recipient',
      );
    }

    // TODO: Validate all required fields are assigned
  }

  /**
   * Generate unique access token for recipient
   */
  private generateAccessToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate signing URL for recipient
   */
  private generateSigningUrl(accessToken: string): string {
    const baseUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    return `${baseUrl}/sign/${accessToken}`;
  }

  /**
   * List envelopes for organization
   */
  async findAll(user: User): Promise<Envelope[]> {
    return this.envelopeRepository.find({
      where: {
        organizationId: user.organizationId,
      },
      relations: ['recipients', 'creator'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Update recipient
   */
  async updateRecipient(
    recipientId: string,
    dto: Partial<AddRecipientDto>,
    user: User,
  ): Promise<Recipient> {
    const recipient = await this.recipientRepository.findOne({
      where: { id: recipientId },
      relations: ['envelope'],
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const envelope = await this.findOne(recipient.envelopeId, user);

    if (!envelope.canEdit()) {
      throw new BadRequestException(
        'Cannot update recipient on locked envelope',
      );
    }

    Object.assign(recipient, dto);

    return this.recipientRepository.save(recipient);
  }

  /**
   * Delete recipient
   */
  async deleteRecipient(recipientId: string, user: User): Promise<void> {
    const recipient = await this.recipientRepository.findOne({
      where: { id: recipientId },
      relations: ['envelope'],
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const envelope = await this.findOne(recipient.envelopeId, user);

    if (!envelope.canEdit()) {
      throw new BadRequestException(
        'Cannot delete recipient from locked envelope',
      );
    }

    await this.recipientRepository.remove(recipient);

    // Update envelope metadata
    envelope.metadata.recipientCount =
      (envelope.metadata.recipientCount || 1) - 1;
    await this.envelopeRepository.save(envelope);
  }

  /**
   * Get download URL for final artifacts
   *
   * PUBLIC: No authentication required (envelope ID is sufficient)
   */
  async getDownloadUrl(
    envelopeId: string,
    type: 'final' | 'certificate' | 'combined',
  ): Promise<{ url: string }> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
    });

    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    if (envelope.status !== EnvelopeStatus.COMPLETED) {
      throw new BadRequestException(
        'Document is not yet completed. Downloads are only available after all signatures are collected.',
      );
    }

    let url: string | undefined;

    switch (type) {
      case 'final':
        url = envelope.metadata?.finalPdfUrl;
        break;
      case 'certificate':
        url = envelope.metadata?.certificateUrl;
        break;
      case 'combined':
        url = envelope.metadata?.combinedPdfUrl;
        break;
    }

    if (!url) {
      throw new NotFoundException(
        `${type} file not yet available. The document may still be processing.`,
      );
    }

    return { url };
  }
}
