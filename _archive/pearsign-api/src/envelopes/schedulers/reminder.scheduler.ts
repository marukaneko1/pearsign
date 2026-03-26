import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Envelope, EnvelopeStatus } from '../entities/envelope.entity';
import { Recipient, RecipientStatus } from '../entities/recipient.entity';
import { ReminderDueEvent, EnvelopeEventType } from '../events/envelope.events';
import { ConfigService } from '@nestjs/config';

/**
 * ReminderScheduler
 *
 * Cron job that finds pending recipients and emits reminder events
 *
 * CRITICAL RULES:
 * - Only send reminders for envelopes in IN_SIGNING state
 * - Only send to recipients with status SENT or VIEWED (not PENDING or COMPLETED)
 * - Respect reminder interval (don't spam)
 * - Stop reminders when recipient completes
 * - Use events, don't call email service directly
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);
  private readonly defaultReminderInterval: number; // in hours

  constructor(
    @InjectRepository(Envelope)
    private readonly envelopeRepository: Repository<Envelope>,
    @InjectRepository(Recipient)
    private readonly recipientRepository: Repository<Recipient>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    // Default: send reminders every 24 hours
    this.defaultReminderInterval = this.configService.get<number>(
      'REMINDER_INTERVAL_HOURS',
      24,
    );
  }

  /**
   * Process reminders every 15 minutes
   *
   * This runs frequently to ensure timely reminders,
   * but respects interval settings to avoid spam
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async processReminders(): Promise<void> {
    this.logger.log('Starting reminder processing...');

    try {
      // Find all envelopes in IN_SIGNING state with reminders enabled
      const envelopes = await this.envelopeRepository.find({
        where: {
          status: EnvelopeStatus.IN_SIGNING,
        },
        select: [
          'id',
          'organizationId',
          'title',
          'createdBy',
          'settings',
          'metadata',
        ],
      });

      this.logger.log(
        `Found ${envelopes.length} envelopes in IN_SIGNING state`,
      );

      let remindersProcessed = 0;

      for (const envelope of envelopes) {
        // Skip if reminders are disabled for this envelope
        if (!envelope.settings?.enableReminders) {
          continue;
        }

        // Get reminder interval (use envelope setting or default)
        const reminderInterval =
          envelope.settings?.reminderInterval || this.defaultReminderInterval;

        // Find pending recipients who need reminders
        const recipients = await this.findRecipientsNeedingReminders(
          envelope.id,
          reminderInterval,
        );

        this.logger.log(
          `Found ${recipients.length} recipients needing reminders for envelope ${envelope.id}`,
        );

        // Emit reminder event for each recipient
        for (const recipient of recipients) {
          try {
            const event = new ReminderDueEvent(
              envelope.id,
              envelope.organizationId,
              envelope.title,
              envelope.metadata?.senderName || 'PearSign',
              envelope.metadata?.senderEmail || 'noreply@pearsign.com',
              {
                id: recipient.id,
                name: recipient.name,
                email: recipient.email,
                signingUrl: this.generateSigningUrl(recipient.accessToken),
              },
              recipient.sentAt || new Date(),
            );

            this.eventEmitter.emit(EnvelopeEventType.REMINDER_DUE, event);

            // Update last reminder timestamp
            recipient.metadata = {
              ...recipient.metadata,
              lastReminderSentAt: new Date().toISOString(),
            };
            await this.recipientRepository.save(recipient);

            remindersProcessed++;
          } catch (error) {
            this.logger.error(
              `Failed to emit reminder for recipient ${recipient.id}:`,
              error,
            );
          }
        }
      }

      this.logger.log(
        `Reminder processing complete. Processed ${remindersProcessed} reminders.`,
      );
    } catch (error) {
      this.logger.error('Failed to process reminders:', error);
    }
  }

  /**
   * Find recipients who need reminders
   *
   * Criteria:
   * - Status is SENT or VIEWED (not PENDING or COMPLETED)
   * - Last reminder was sent more than {interval} hours ago
   * - OR no reminder has been sent yet (use sentAt as baseline)
   */
  private async findRecipientsNeedingReminders(
    envelopeId: string,
    intervalHours: number,
  ): Promise<Recipient[]> {
    const allRecipients = await this.recipientRepository.find({
      where: {
        envelopeId,
      },
    });

    const now = new Date();
    const intervalMs = intervalHours * 60 * 60 * 1000;

    return allRecipients.filter((recipient) => {
      // Skip if already completed
      if (
        recipient.status === RecipientStatus.COMPLETED ||
        recipient.status === RecipientStatus.PENDING
      ) {
        return false;
      }

      // Check if it's time for a reminder
      const lastReminderSentAt = recipient.metadata?.lastReminderSentAt
        ? new Date(recipient.metadata.lastReminderSentAt)
        : null;

      const baselineDate = lastReminderSentAt || recipient.sentAt;

      if (!baselineDate) {
        // No sent date, skip
        return false;
      }

      const timeSinceLastReminder = now.getTime() - baselineDate.getTime();

      return timeSinceLastReminder >= intervalMs;
    });
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
}
