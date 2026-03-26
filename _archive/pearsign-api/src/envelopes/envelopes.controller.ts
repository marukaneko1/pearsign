import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { EnvelopesService } from './envelopes.service';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { AddRecipientDto } from './dto/add-recipient.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/envelopes')
export class EnvelopesController {
  constructor(private readonly envelopesService: EnvelopesService) {}

  /**
   * Create new envelope
   * POST /api/v1/envelopes
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEnvelopeDto, @CurrentUser() user: User) {
    return this.envelopesService.create(dto, user);
  }

  /**
   * Get all envelopes
   * GET /api/v1/envelopes
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: User) {
    return this.envelopesService.findAll(user);
  }

  /**
   * Get envelope by ID
   * GET /api/v1/envelopes/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.envelopesService.findOne(id, user);
  }

  /**
   * Add document to envelope
   * POST /api/v1/envelopes/:id/documents
   *
   * TODO: Implement after Documents module is created
   */
  // @Post(':id/documents')
  // @HttpCode(HttpStatus.CREATED)
  // async addDocument(
  //   @Param('id') id: string,
  //   @Body() dto: any,
  //   @CurrentUser() user: User,
  // ) {
  //   return this.envelopesService.addDocument(id, dto, user);
  // }

  /**
   * Add recipient to envelope
   * POST /api/v1/envelopes/:id/recipients
   */
  @Post(':id/recipients')
  @HttpCode(HttpStatus.CREATED)
  async addRecipient(
    @Param('id') id: string,
    @Body() dto: AddRecipientDto,
    @CurrentUser() user: User,
  ) {
    return this.envelopesService.addRecipient(id, dto, user);
  }

  /**
   * Update recipient
   * PATCH /api/v1/envelopes/:id/recipients/:recipientId
   */
  @Patch(':id/recipients/:recipientId')
  @HttpCode(HttpStatus.OK)
  async updateRecipient(
    @Param('recipientId') recipientId: string,
    @Body() dto: Partial<AddRecipientDto>,
    @CurrentUser() user: User,
  ) {
    return this.envelopesService.updateRecipient(recipientId, dto, user);
  }

  /**
   * Delete recipient
   * DELETE /api/v1/envelopes/:id/recipients/:recipientId
   */
  @Delete(':id/recipients/:recipientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecipient(
    @Param('recipientId') recipientId: string,
    @CurrentUser() user: User,
  ) {
    await this.envelopesService.deleteRecipient(recipientId, user);
  }

  /**
   * Preview envelope (validation checkpoint)
   * POST /api/v1/envelopes/:id/preview
   */
  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Param('id') id: string, @CurrentUser() user: User) {
    return this.envelopesService.preview(id, user);
  }

  /**
   * Send envelope
   * POST /api/v1/envelopes/:id/send
   */
  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(@Param('id') id: string, @CurrentUser() user: User) {
    return this.envelopesService.send(id, user);
  }

  /**
   * Download final signed PDF
   * GET /api/v1/envelopes/:id/download/final
   *
   * PUBLIC: No authentication required
   */
  @Get(':id/download/final')
  @Public()
  @HttpCode(HttpStatus.OK)
  async downloadFinalPdf(@Param('id') id: string) {
    return this.envelopesService.getDownloadUrl(id, 'final');
  }

  /**
   * Download certificate
   * GET /api/v1/envelopes/:id/download/certificate
   *
   * PUBLIC: No authentication required
   */
  @Get(':id/download/certificate')
  @Public()
  @HttpCode(HttpStatus.OK)
  async downloadCertificate(@Param('id') id: string) {
    return this.envelopesService.getDownloadUrl(id, 'certificate');
  }

  /**
   * Download combined PDF (with certificate appended)
   * GET /api/v1/envelopes/:id/download/combined
   *
   * PUBLIC: No authentication required
   */
  @Get(':id/download/combined')
  @Public()
  @HttpCode(HttpStatus.OK)
  async downloadCombinedPdf(@Param('id') id: string) {
    return this.envelopesService.getDownloadUrl(id, 'combined');
  }
}
