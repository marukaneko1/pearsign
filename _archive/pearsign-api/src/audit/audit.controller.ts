import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  Header,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { PdfAuditReportService } from './pdf-audit-report.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Envelope } from '../envelopes/entities/envelope.entity';

/**
 * AuditController
 *
 * REST API for querying and exporting audit trails
 *
 * CRITICAL RULES:
 * - Read-only (no POST/PUT/DELETE)
 * - Access control (admin/owner only)
 * - Immutable (cannot alter audit logs)
 * - Court-grade (comprehensive, timestamped, hashed)
 */
@Controller('v1/audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly pdfAuditReportService: PdfAuditReportService,
    @InjectRepository(Envelope)
    private readonly envelopeRepository: Repository<Envelope>,
  ) {}

  /**
   * Get audit trail for envelope
   *
   * GET /api/v1/audit/envelopes/:id
   *
   * Query params:
   * - actionFilter: Filter by action types (comma-separated)
   * - actorFilter: Filter by actor types (comma-separated)
   * - limit: Page size (default: 100)
   * - offset: Pagination offset (default: 0)
   * - sortOrder: ASC or DESC (default: ASC)
   */
  @Get('envelopes/:id')
  @HttpCode(HttpStatus.OK)
  async getEnvelopeAuditTrail(
    @Param('id') envelopeId: string,
    @Query('actionFilter') actionFilter?: string,
    @Query('actorFilter') actorFilter?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @CurrentUser() user?: User,
  ) {
    // Verify user has access to envelope
    await this.verifyEnvelopeAccess(envelopeId, user);

    // Parse query params
    const query = {
      envelopeId,
      actionFilter: actionFilter ? actionFilter.split(',') : undefined,
      actorFilter: actorFilter ? actorFilter.split(',') : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
      sortOrder: sortOrder || ('ASC' as const),
    };

    return this.auditService.queryAuditLogs(query);
  }

  /**
   * Export audit trail as CSV
   *
   * GET /api/v1/audit/envelopes/:id/export/csv
   */
  @Get('envelopes/:id/export/csv')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-trail.csv"')
  async exportAuditTrailCsv(
    @Param('id') envelopeId: string,
    @CurrentUser() user?: User,
  ) {
    // Verify user has access to envelope
    await this.verifyEnvelopeAccess(envelopeId, user);

    return this.auditService.exportAuditTrailCsv(envelopeId);
  }

  /**
   * Get audit trail summary
   *
   * GET /api/v1/audit/envelopes/:id/summary
   *
   * Used for PDF report generation and certificate enhancement
   */
  @Get('envelopes/:id/summary')
  @HttpCode(HttpStatus.OK)
  async getAuditTrailSummary(
    @Param('id') envelopeId: string,
    @CurrentUser() user?: User,
  ) {
    // Verify user has access to envelope
    await this.verifyEnvelopeAccess(envelopeId, user);

    return this.auditService.generateAuditSummary(envelopeId);
  }

  /**
   * Export audit trail as PDF
   *
   * GET /api/v1/audit/envelopes/:id/export/pdf
   *
   * Generates professional PDF audit report for legal teams
   */
  @Get('envelopes/:id/export/pdf')
  @HttpCode(HttpStatus.OK)
  async exportAuditTrailPdf(
    @Param('id') envelopeId: string,
    @CurrentUser() user: User | undefined,
    @Res() res: Response,
  ) {
    // Verify user has access to envelope
    await this.verifyEnvelopeAccess(envelopeId, user);

    const pdfBytes =
      await this.pdfAuditReportService.generateAuditReport(envelopeId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-report-${envelopeId}.pdf"`,
    );
    res.send(Buffer.from(pdfBytes));
  }

  /**
   * Verify user has access to envelope
   *
   * Rules:
   * - Owner role can access any envelope in their org
   * - Admin role can access any envelope in their org
   * - Regular users can only access their own envelopes
   */
  private async verifyEnvelopeAccess(
    envelopeId: string,
    user?: User,
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
    });

    if (!envelope) {
      throw new ForbiddenException('Envelope not found');
    }

    // Check organization match
    if (envelope.organizationId !== user.organizationId) {
      throw new ForbiddenException(
        'You do not have access to this envelope',
      );
    }

    // Owner and Admin can access any envelope in their org
    if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) {
      return;
    }

    // Regular users can only access envelopes they created
    if (envelope.createdBy !== user.id) {
      throw new ForbiddenException(
        'You do not have access to this envelope',
      );
    }
  }
}
