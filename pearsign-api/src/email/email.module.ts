import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * EmailModule
 *
 * Handles all email notifications:
 * - Signature request emails
 * - Reminder emails
 * - Completion emails
 *
 * CRITICAL RULES:
 * - Triggered by state changes only
 * - Logged to audit trail
 * - Retry-safe (idempotent)
 * - One email ≠ one envelope (bulk-safe)
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
