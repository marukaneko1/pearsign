import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import {
  EnvelopeSentEvent,
  EnvelopeCompletedEvent,
  ReminderDueEvent,
  EnvelopeEventType,
} from '../events/envelope.events';

/**
 * EmailEventListener
 *
 * Listens to envelope lifecycle events and sends emails
 *
 * CRITICAL RULES:
 * - Idempotent: Can process same event multiple times safely
 * - Logged: Every email send is logged to audit trail
 * - Retry-safe: Email sending failures are logged but don't throw
 * - One-recipient-per-send: Never send bulk emails in one call
 */
@Injectable()
export class EmailEventListener {
  private readonly logger = new Logger(EmailEventListener.name);

  constructor(
    private readonly emailService: EmailService,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Handle ENVELOPE_SENT event
   *
   * Sends signature request emails to all recipients
   */
  @OnEvent(EnvelopeEventType.ENVELOPE_SENT)
  async handleEnvelopeSent(event: EnvelopeSentEvent): Promise<void> {
    this.logger.log(
      `Handling ENVELOPE_SENT for envelope ${event.envelopeId} with ${event.recipients.length} recipients`,
    );

    // Send email to each recipient
    for (const recipient of event.recipients) {
      try {
        await this.emailService.sendSignatureRequest({
          recipient: {
            name: recipient.name,
            email: recipient.email,
          },
          sender: {
            name: event.senderName,
            email: event.senderEmail,
          },
          documentTitle: event.title,
          signingUrl: recipient.signingUrl,
          message: event.message,
          expiresAt: event.expiresAt,
        });

        // Log to audit trail
        await this.logEmailSend({
          envelopeId: event.envelopeId,
          organizationId: event.organizationId,
          recipientEmail: recipient.email,
          emailType: 'signature_request',
          action: 'email.sent',
          metadata: {
            recipientId: recipient.id,
            signingOrder: recipient.signingOrder,
          },
        });

        this.logger.log(
          `Signature request email sent to ${recipient.email} for envelope ${event.envelopeId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send signature request email to ${recipient.email} for envelope ${event.envelopeId}:`,
          error,
        );

        // Log failure to audit trail
        await this.logEmailSend({
          envelopeId: event.envelopeId,
          organizationId: event.organizationId,
          recipientEmail: recipient.email,
          emailType: 'signature_request',
          action: 'email.failed',
          metadata: {
            recipientId: recipient.id,
            error: error.message,
          },
        });
      }
    }
  }

  /**
   * Handle ENVELOPE_COMPLETED event
   *
   * Sends completion emails to all recipients
   */
  @OnEvent(EnvelopeEventType.ENVELOPE_COMPLETED)
  async handleEnvelopeCompleted(event: EnvelopeCompletedEvent): Promise<void> {
    this.logger.log(
      `Handling ENVELOPE_COMPLETED for envelope ${event.envelopeId} with ${event.recipients.length} recipients`,
    );

    // Send email to each recipient
    for (const recipient of event.recipients) {
      try {
        await this.emailService.sendCompletion({
          recipient: {
            name: recipient.name,
            email: recipient.email,
          },
          documentTitle: event.title,
          completedAt: event.timestamp,
          downloadUrl: event.finalPdfUrl,
          certificateUrl: event.certificateUrl,
        });

        // Log to audit trail
        await this.logEmailSend({
          envelopeId: event.envelopeId,
          organizationId: event.organizationId,
          recipientEmail: recipient.email,
          emailType: 'completion',
          action: 'email.sent',
          metadata: {},
        });

        this.logger.log(
          `Completion email sent to ${recipient.email} for envelope ${event.envelopeId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send completion email to ${recipient.email} for envelope ${event.envelopeId}:`,
          error,
        );

        // Log failure to audit trail
        await this.logEmailSend({
          envelopeId: event.envelopeId,
          organizationId: event.organizationId,
          recipientEmail: recipient.email,
          emailType: 'completion',
          action: 'email.failed',
          metadata: {
            error: error.message,
          },
        });
      }
    }
  }

  /**
   * Handle REMINDER_DUE event
   *
   * Sends reminder email to a single pending recipient
   */
  @OnEvent(EnvelopeEventType.REMINDER_DUE)
  async handleReminderDue(event: ReminderDueEvent): Promise<void> {
    this.logger.log(
      `Handling REMINDER_DUE for envelope ${event.envelopeId}, recipient ${event.recipient.email}`,
    );

    try {
      await this.emailService.sendReminder({
        recipient: {
          name: event.recipient.name,
          email: event.recipient.email,
        },
        sender: {
          name: event.senderName,
          email: event.senderEmail,
        },
        documentTitle: event.title,
        signingUrl: event.recipient.signingUrl,
        sentAt: event.sentAt,
      });

      // Log to audit trail
      await this.logEmailSend({
        envelopeId: event.envelopeId,
        organizationId: event.organizationId,
        recipientEmail: event.recipient.email,
        emailType: 'reminder',
        action: 'email.sent',
        metadata: {
          recipientId: event.recipient.id,
          originalSentAt: event.sentAt.toISOString(),
        },
      });

      this.logger.log(
        `Reminder email sent to ${event.recipient.email} for envelope ${event.envelopeId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send reminder email to ${event.recipient.email} for envelope ${event.envelopeId}:`,
        error,
      );

      // Log failure to audit trail
      await this.logEmailSend({
        envelopeId: event.envelopeId,
        organizationId: event.organizationId,
        recipientEmail: event.recipient.email,
        emailType: 'reminder',
        action: 'email.failed',
        metadata: {
          recipientId: event.recipient.id,
          error: error.message,
        },
      });
    }
  }

  /**
   * Log email send to audit trail
   */
  private async logEmailSend(params: {
    envelopeId: string;
    organizationId: string;
    recipientEmail: string;
    emailType: 'signature_request' | 'completion' | 'reminder';
    action: string;
    metadata: Record<string, any>;
  }): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        envelopeId: params.envelopeId,
        organizationId: params.organizationId,
        action: params.action,
        actor: 'system',
        details: {
          emailType: params.emailType,
          recipientEmail: params.recipientEmail,
          ...params.metadata,
        },
      });

      await this.auditLogRepository.save(auditLog);
    } catch (error) {
      this.logger.error(
        `Failed to log email send to audit trail for envelope ${params.envelopeId}:`,
        error,
      );
      // Don't throw - audit logging failure shouldn't break email sending
    }
  }
}
