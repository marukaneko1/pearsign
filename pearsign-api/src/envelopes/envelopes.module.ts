import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvelopesController } from './envelopes.controller';
import { PublicSigningController } from './public-signing.controller';
import { EnvelopesService } from './envelopes.service';
import { PublicSigningService } from './public-signing.service';
import { CompletionService } from './completion.service';
import { Envelope } from './entities/envelope.entity';
import { Recipient } from './entities/recipient.entity';
import { EnvelopeDocument } from './entities/envelope-document.entity';
import { Field } from '../fields/entities/field.entity';
import { PdfEngineModule } from '../pdf-engine/pdf-engine.module';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { EmailEventListener } from './listeners/email-event.listener';
import { ReminderScheduler } from './schedulers/reminder.scheduler';

/**
 * EnvelopesModule
 *
 * Provides the core signing workflow:
 * - Envelope creation
 * - Document attachment
 * - Recipient management
 * - Field mapping
 * - Send workflow
 * - Public signing experience
 * - Completion & finalization
 * - Certificate generation
 * - Status tracking
 *
 * ARCHITECTURE PRINCIPLE:
 * Envelope is the unit of signing, not Document.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Envelope, Recipient, EnvelopeDocument, Field]),
    PdfEngineModule, // For PDF finalization
    StorageModule, // For S3 uploads
    EmailModule, // For sending emails
    AuditModule, // For audit logging
  ],
  controllers: [EnvelopesController, PublicSigningController],
  providers: [
    EnvelopesService,
    PublicSigningService,
    CompletionService,
    EmailEventListener, // Event listener for emails
    ReminderScheduler, // Cron job for reminders
  ],
  exports: [EnvelopesService, PublicSigningService, CompletionService],
})
export class EnvelopesModule {}
