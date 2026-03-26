import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BulkSendService } from './services/bulk-send.service';
import type { CreateBulkSendJobDto } from './services/bulk-send.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * BulkSendController
 *
 * REST API for bulk envelope creation
 *
 * Use Cases:
 * - HR: Send offer letters to 100 candidates
 * - Sales: Send contracts to 50 clients
 * - Real Estate: Send agreements to multiple parties
 */
@Controller('v1/bulk-send')
export class BulkSendController {
  constructor(private readonly bulkSendService: BulkSendService) {}

  /**
   * Create bulk send job
   *
   * POST /api/v1/bulk-send
   *
   * Body:
   * - title: Job title
   * - csvContent: CSV file content (as string)
   * - documentId: Document to attach (optional)
   * - message: Custom message (optional)
   * - enableReminders: Enable reminders (optional)
   * - reminderInterval: Reminder interval in hours (optional)
   * - expirationDays: Days until expiration (optional)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBulkSendJob(
    @Body() dto: CreateBulkSendJobDto,
    @CurrentUser() user: User,
  ) {
    return this.bulkSendService.createBulkSendJob(dto, user);
  }

  /**
   * Upload CSV file
   *
   * POST /api/v1/bulk-send/upload
   *
   * Multipart form data:
   * - file: CSV file
   * - title: Job title
   * - documentId: Document to attach (optional)
   * - message: Custom message (optional)
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsvFile(
    @UploadedFile() file: any,
    @Body('title') title: string,
    @Body('documentId') documentId: string | undefined,
    @Body('message') message: string | undefined,
    @Body('enableReminders') enableReminders: string | undefined,
    @Body('reminderInterval') reminderInterval: string | undefined,
    @Body('expirationDays') expirationDays: string | undefined,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!title) {
      throw new BadRequestException('Title is required');
    }

    // Convert file buffer to string
    const csvContent = file.buffer.toString('utf-8');

    const dto: CreateBulkSendJobDto = {
      title,
      csvContent,
      documentId,
      message,
      enableReminders: enableReminders === 'true',
      reminderInterval: reminderInterval ? parseInt(reminderInterval, 10) : undefined,
      expirationDays: expirationDays ? parseInt(expirationDays, 10) : undefined,
    };

    return this.bulkSendService.createBulkSendJob(dto, user);
  }

  /**
   * Get bulk send job status
   *
   * GET /api/v1/bulk-send/:jobId/status
   */
  @Get(':jobId/status')
  @HttpCode(HttpStatus.OK)
  async getJobStatus(@Param('jobId') jobId: string, @CurrentUser() user: User) {
    return this.bulkSendService.getJobStatus(jobId, user);
  }

  /**
   * List bulk send jobs
   *
   * GET /api/v1/bulk-send/jobs
   */
  @Get('jobs')
  @HttpCode(HttpStatus.OK)
  async listJobs(@CurrentUser() user: User) {
    return this.bulkSendService.listJobs(user);
  }

  /**
   * Get example CSV
   *
   * GET /api/v1/bulk-send/example-csv
   */
  @Get('example-csv')
  @HttpCode(HttpStatus.OK)
  getExampleCsv() {
    return {
      csv: this.bulkSendService.getExampleCsv(),
      headers: ['recipient_name', 'recipient_email', 'document_title', 'custom_message'],
      description: 'Upload a CSV file with these headers to bulk send envelopes',
    };
  }
}
