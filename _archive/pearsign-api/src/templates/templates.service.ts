import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template, TemplateCategory } from './entities/template.entity';
import { User } from '../users/entities/user.entity';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { CreateEnvelopeDto } from '../envelopes/dto/create-envelope.dto';
import { AddRecipientDto } from '../envelopes/dto/add-recipient.dto';
import { Envelope } from '../envelopes/entities/envelope.entity';

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category: TemplateCategory;
  signingOrder: string;
  enableReminders?: boolean;
  reminderInterval?: number;
  requireAuthentication?: boolean;
  allowDecline?: boolean;
  expirationDays?: number;
  message?: string;
  recipients: Array<{
    role: string;
    name?: string;
    email?: string;
    signingOrder: number;
    placeholderLabel: string;
  }>;
  fields?: Array<any>;
  documentId?: string;
  isPublic?: boolean;
  tags?: string[];
}

export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  signingOrder?: string;
  settings?: any;
  recipients?: any;
  fields?: any;
  isPublic?: boolean;
  tags?: string[];
}

/**
 * TemplatesService
 *
 * Manages reusable document templates
 */
@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
    private envelopesService: EnvelopesService,
  ) {}

  /**
   * Create template
   */
  async create(dto: CreateTemplateDto, user: User): Promise<Template> {
    const template = this.templateRepository.create({
      organizationId: user.organizationId,
      createdBy: user.id,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      signingOrder: dto.signingOrder as any,
      settings: {
        enableReminders: dto.enableReminders,
        reminderInterval: dto.reminderInterval,
        requireAuthentication: dto.requireAuthentication,
        allowDecline: dto.allowDecline,
        expirationDays: dto.expirationDays,
        message: dto.message,
      },
      recipients: dto.recipients,
      fields: dto.fields,
      documentId: dto.documentId,
      isPublic: dto.isPublic ?? false,
      usageCount: 0,
      metadata: {
        tags: dto.tags,
      },
    });

    return this.templateRepository.save(template);
  }

  /**
   * Create template from envelope
   */
  async createFromEnvelope(
    envelopeId: string,
    templateName: string,
    user: User,
  ): Promise<Template> {
    const envelope = await this.envelopesService.findOne(envelopeId, user);

    // Map envelope to template
    const template = this.templateRepository.create({
      organizationId: user.organizationId,
      createdBy: user.id,
      name: templateName,
      description: `Created from envelope: ${envelope.title}`,
      category: TemplateCategory.CUSTOM,
      signingOrder: envelope.signingOrder,
      settings: envelope.settings,
      recipients: envelope.recipients.map((r) => ({
        role: r.role,
        name: r.name,
        email: r.email,
        signingOrder: r.signingOrder,
        placeholderLabel: r.name, // Use recipient name as placeholder
      })),
      fields: [], // TODO: Load fields from envelope
      usageCount: 0,
      isPublic: false,
    });

    return this.templateRepository.save(template);
  }

  /**
   * Get template by ID
   */
  async findOne(id: string, user: User): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check access
    if (!template.canBeUsedBy(user.id, user.organizationId)) {
      throw new ForbiddenException(
        'You do not have access to this template',
      );
    }

    return template;
  }

  /**
   * List templates
   */
  async findAll(user: User, filters?: {
    category?: TemplateCategory;
    includeArchived?: boolean;
  }): Promise<Template[]> {
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .where('template.organizationId = :organizationId', {
        organizationId: user.organizationId,
      });

    // Show public templates + user's private templates
    queryBuilder.andWhere(
      '(template.isPublic = true OR template.createdBy = :userId)',
      { userId: user.id },
    );

    // Filter by category
    if (filters?.category) {
      queryBuilder.andWhere('template.category = :category', {
        category: filters.category,
      });
    }

    // Filter archived
    if (!filters?.includeArchived) {
      queryBuilder.andWhere('template.isArchived = false');
    }

    queryBuilder.orderBy('template.usageCount', 'DESC');
    queryBuilder.addOrderBy('template.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  /**
   * Update template
   */
  async update(
    id: string,
    dto: UpdateTemplateDto,
    user: User,
  ): Promise<Template> {
    const template = await this.findOne(id, user);

    // Only creator can update
    if (template.createdBy !== user.id) {
      throw new ForbiddenException(
        'Only the template creator can update it',
      );
    }

    Object.assign(template, dto);

    if (dto.settings) {
      template.settings = { ...template.settings, ...dto.settings };
    }

    if (dto.tags) {
      template.metadata = {
        ...template.metadata,
        tags: dto.tags,
      };
    }

    return this.templateRepository.save(template);
  }

  /**
   * Archive template
   */
  async archive(id: string, user: User): Promise<Template> {
    const template = await this.findOne(id, user);

    if (template.createdBy !== user.id) {
      throw new ForbiddenException(
        'Only the template creator can archive it',
      );
    }

    template.archive();

    return this.templateRepository.save(template);
  }

  /**
   * Unarchive template
   */
  async unarchive(id: string, user: User): Promise<Template> {
    const template = await this.findOne(id, user);

    if (template.createdBy !== user.id) {
      throw new ForbiddenException(
        'Only the template creator can unarchive it',
      );
    }

    template.unarchive();

    return this.templateRepository.save(template);
  }

  /**
   * Delete template
   */
  async delete(id: string, user: User): Promise<void> {
    const template = await this.findOne(id, user);

    if (template.createdBy !== user.id) {
      throw new ForbiddenException(
        'Only the template creator can delete it',
      );
    }

    await this.templateRepository.remove(template);
  }

  /**
   * Use template to create envelope
   */
  async useTemplate(
    id: string,
    overrides: {
      title: string;
      recipients: Array<{
        placeholderLabel: string; // Which placeholder to fill
        name: string;
        email: string;
      }>;
      message?: string;
    },
    user: User,
  ): Promise<Envelope> {
    const template = await this.findOne(id, user);

    // Validate all placeholders are filled
    const requiredPlaceholders = template.recipients.map(
      (r) => r.placeholderLabel,
    );
    const providedPlaceholders = overrides.recipients.map(
      (r) => r.placeholderLabel,
    );

    const missingPlaceholders = requiredPlaceholders.filter(
      (p) => !providedPlaceholders.includes(p),
    );

    if (missingPlaceholders.length > 0) {
      throw new BadRequestException(
        `Missing recipients for placeholders: ${missingPlaceholders.join(', ')}`,
      );
    }

    // Create envelope from template
    const createEnvelopeDto: CreateEnvelopeDto = {
      title: overrides.title,
      description: `Created from template: ${template.name}`,
      signingOrder: template.signingOrder as any,
      enableReminders: template.settings?.enableReminders,
      reminderInterval: template.settings?.reminderInterval,
      requireAuthentication: template.settings?.requireAuthentication,
      allowDecline: template.settings?.allowDecline,
      message: overrides.message || template.settings?.message,
      expirationDate: template.settings?.expirationDays
        ? this.calculateExpirationDate(template.settings.expirationDays)
        : undefined,
    };

    const envelope = await this.envelopesService.create(
      createEnvelopeDto,
      user,
    );

    // Add recipients
    for (const recipientOverride of overrides.recipients) {
      const templateRecipient = template.recipients.find(
        (r) => r.placeholderLabel === recipientOverride.placeholderLabel,
      );

      if (!templateRecipient) continue;

      const addRecipientDto: AddRecipientDto = {
        name: recipientOverride.name,
        email: recipientOverride.email,
        role: templateRecipient.role as any,
        signingOrder: templateRecipient.signingOrder,
      };

      await this.envelopesService.addRecipient(
        envelope.id,
        addRecipientDto,
        user,
      );
    }

    // TODO: Add fields from template
    // TODO: Attach document if template has documentId

    // Increment usage count
    template.incrementUsage();
    await this.templateRepository.save(template);

    return envelope;
  }

  /**
   * Calculate expiration date
   */
  private calculateExpirationDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
