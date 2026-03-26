import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BulkSendJob, BulkSendJobStatus } from '../entities/bulk-send-job.entity';
import { CsvParserService, BulkSendRow } from './csv-parser.service';
import { EnvelopesService } from '../../envelopes/envelopes.service';
import { User } from '../../users/entities/user.entity';
import { CreateEnvelopeDto } from '../../envelopes/dto/create-envelope.dto';
import { AddRecipientDto } from '../../envelopes/dto/add-recipient.dto';
import { SigningOrder } from '../../envelopes/entities/envelope.entity';
import { RecipientRole } from '../../envelopes/entities/recipient.entity';

export interface CreateBulkSendJobDto {
  title: string;
  csvContent: string;
  templateId?: string;
  documentId?: string; // Document to attach to all envelopes
  message?: string;
  enableReminders?: boolean;
  reminderInterval?: number;
  expirationDays?: number;
}

/**
 * BulkSendService
 *
 * Orchestrates bulk envelope creation from CSV
 *
 * Process:
 * 1. Parse CSV
 * 2. Create bulk send job
 * 3. Process each row (create envelope)
 * 4. Track progress
 * 5. Handle errors gracefully (partial success)
 *
 * CRITICAL RULES:
 * - One row = one envelope
 * - Partial success allowed (some succeed, some fail)
 * - Errors don't stop processing
 * - All errors logged with row numbers
 */
@Injectable()
export class BulkSendService {
  private readonly logger = new Logger(BulkSendService.name);

  constructor(
    @InjectRepository(BulkSendJob)
    private bulkSendJobRepository: Repository<BulkSendJob>,
    private csvParserService: CsvParserService,
    private envelopesService: EnvelopesService,
  ) {}

  /**
   * Create and start bulk send job
   */
  async createBulkSendJob(
    dto: CreateBulkSendJobDto,
    user: User,
  ): Promise<BulkSendJob> {
    this.logger.log(`Creating bulk send job: ${dto.title} for user ${user.id}`);

    // Parse CSV
    const parsedCsv = await this.csvParserService.parseCsv(dto.csvContent);

    // Create job
    const job = this.bulkSendJobRepository.create({
      organizationId: user.organizationId,
      createdBy: user.id,
      title: dto.title,
      status: BulkSendJobStatus.PENDING,
      totalRows: parsedCsv.totalRows,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      settings: {
        templateId: dto.templateId,
        message: dto.message,
        enableReminders: dto.enableReminders,
        reminderInterval: dto.reminderInterval,
        expirationDays: dto.expirationDays,
      },
      metadata: {
        csvHeaders: parsedCsv.headers,
        rowCount: parsedCsv.totalRows,
      },
      results: {
        envelopeIds: [],
        errors: [],
      },
    });

    const savedJob = await this.bulkSendJobRepository.save(job);

    // Start processing asynchronously
    this.processBulkSendJob(savedJob.id, parsedCsv.rows, dto.documentId, user).catch(
      (error) => {
        this.logger.error(`Failed to process bulk send job ${savedJob.id}:`, error);
      },
    );

    return savedJob;
  }

  /**
   * Process bulk send job (async)
   */
  private async processBulkSendJob(
    jobId: string,
    rows: BulkSendRow[],
    documentId: string | undefined,
    user: User,
  ): Promise<void> {
    const job = await this.bulkSendJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Bulk send job not found');
    }

    this.logger.log(
      `Starting processing of bulk send job ${jobId} with ${rows.length} rows`,
    );

    // Mark as started
    job.markAsStarted();
    await this.bulkSendJobRepository.save(job);

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      try {
        // Create envelope for this row
        const envelopeId = await this.createEnvelopeForRow(
          row,
          documentId,
          job.settings,
          user,
        );

        // Success
        job.addEnvelopeId(envelopeId);
        job.incrementProcessed(true);

        this.logger.log(
          `Row ${rowNumber}/${rows.length} succeeded: Envelope ${envelopeId} created for ${row.recipientEmail}`,
        );
      } catch (error) {
        // Failure - log but continue
        job.addError(rowNumber, row.recipientEmail, error.message);
        job.incrementProcessed(false);

        this.logger.error(
          `Row ${rowNumber}/${rows.length} failed: ${error.message}`,
        );
      }

      // Save progress every 10 rows
      if (rowNumber % 10 === 0) {
        await this.bulkSendJobRepository.save(job);
      }
    }

    // Mark as completed
    job.markAsCompleted();
    await this.bulkSendJobRepository.save(job);

    this.logger.log(
      `Bulk send job ${jobId} completed: ${job.successfulRows} succeeded, ${job.failedRows} failed`,
    );
  }

  /**
   * Create envelope for a single CSV row
   */
  private async createEnvelopeForRow(
    row: BulkSendRow,
    documentId: string | undefined,
    settings: any,
    user: User,
  ): Promise<string> {
    // Create envelope
    const createEnvelopeDto: CreateEnvelopeDto = {
      title: row.documentTitle,
      description: `Bulk send to ${row.recipientEmail}`,
      signingOrder: SigningOrder.SEQUENTIAL,
      enableReminders: settings.enableReminders ?? true,
      reminderInterval: settings.reminderInterval ?? 24,
      requireAuthentication: false,
      allowDecline: true,
      message: row.customMessage || settings.message,
      expirationDate: settings.expirationDays
        ? this.calculateExpirationDate(settings.expirationDays)
        : undefined,
    };

    const envelope = await this.envelopesService.create(createEnvelopeDto, user);

    // TODO: Attach document if documentId provided
    // if (documentId) {
    //   await this.envelopesService.addDocument(envelope.id, { documentId }, user);
    // }

    // Add recipient
    const addRecipientDto: AddRecipientDto = {
      name: row.recipientName,
      email: row.recipientEmail,
      role: RecipientRole.SIGNER,
      signingOrder: 1,
    };

    await this.envelopesService.addRecipient(envelope.id, addRecipientDto, user);

    // TODO: Pre-fill custom fields
    // if (row.customFields) {
    //   await this.preFillCustomFields(envelope.id, row.customFields);
    // }

    // Send envelope
    await this.envelopesService.send(envelope.id, user);

    return envelope.id;
  }

  /**
   * Calculate expiration date
   */
  private calculateExpirationDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  /**
   * Get bulk send job status
   */
  async getJobStatus(jobId: string, user: User): Promise<BulkSendJob> {
    const job = await this.bulkSendJobRepository.findOne({
      where: {
        id: jobId,
        organizationId: user.organizationId,
      },
    });

    if (!job) {
      throw new NotFoundException('Bulk send job not found');
    }

    return job;
  }

  /**
   * List bulk send jobs for organization
   */
  async listJobs(user: User): Promise<BulkSendJob[]> {
    return this.bulkSendJobRepository.find({
      where: {
        organizationId: user.organizationId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 50, // Limit to 50 most recent
    });
  }

  /**
   * Get example CSV
   */
  getExampleCsv(): string {
    return this.csvParserService.generateExampleCsv();
  }
}
