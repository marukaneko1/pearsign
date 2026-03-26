import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PdfAuditReportService } from './pdf-audit-report.service';
import { Envelope } from '../envelopes/entities/envelope.entity';

/**
 * AuditModule
 *
 * Provides audit logging, querying, and export for all system actions
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Envelope])],
  controllers: [AuditController],
  providers: [AuditService, PdfAuditReportService],
  exports: [TypeOrmModule, AuditService, PdfAuditReportService],
})
export class AuditModule {}
