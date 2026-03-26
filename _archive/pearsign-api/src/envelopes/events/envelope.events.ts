/**
 * Envelope Lifecycle Events
 *
 * These events are emitted by business logic (services) to trigger side effects
 * like emails, webhooks, audit logging, etc.
 *
 * CRITICAL RULES:
 * - Events are emitted AFTER state changes are persisted
 * - Events are idempotent (can be processed multiple times safely)
 * - Events contain all data needed for processing (no DB lookups in listeners)
 */

export enum EnvelopeEventType {
  ENVELOPE_CREATED = 'envelope.created',
  ENVELOPE_SENT = 'envelope.sent',
  RECIPIENT_VIEWED = 'recipient.viewed',
  RECIPIENT_SIGNED = 'recipient.signed',
  ENVELOPE_COMPLETED = 'envelope.completed',
  ENVELOPE_VOIDED = 'envelope.voided',
  ENVELOPE_DECLINED = 'envelope.declined',
  REMINDER_DUE = 'envelope.reminder.due',
}

/**
 * Base event interface
 */
export interface EnvelopeEvent {
  envelopeId: string;
  organizationId: string;
  timestamp: Date;
}

/**
 * Envelope created event
 */
export class EnvelopeCreatedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly createdBy: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Envelope sent event
 *
 * Triggers: Signature request emails to all recipients
 */
export class EnvelopeSentEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly senderName: string,
    public readonly senderEmail: string,
    public readonly recipients: Array<{
      id: string;
      name: string;
      email: string;
      signingUrl: string;
      signingOrder: number;
    }>,
    public readonly message?: string,
    public readonly expiresAt?: Date,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Recipient viewed envelope event
 */
export class RecipientViewedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly recipientId: string,
    public readonly recipientName: string,
    public readonly recipientEmail: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Recipient signed envelope event
 */
export class RecipientSignedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly recipientId: string,
    public readonly recipientName: string,
    public readonly recipientEmail: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Envelope completed event
 *
 * Triggers: Completion emails to all recipients and sender
 */
export class EnvelopeCompletedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly finalPdfUrl: string,
    public readonly certificateUrl: string,
    public readonly combinedPdfUrl: string,
    public readonly recipients: Array<{
      name: string;
      email: string;
    }>,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Envelope voided event
 */
export class EnvelopeVoidedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly voidedBy: string,
    public readonly reason?: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Envelope declined event
 */
export class EnvelopeDeclinedEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly recipientName: string,
    public readonly recipientEmail: string,
    public readonly reason?: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

/**
 * Reminder due event
 *
 * Triggers: Reminder emails to pending recipients
 */
export class ReminderDueEvent implements EnvelopeEvent {
  constructor(
    public readonly envelopeId: string,
    public readonly organizationId: string,
    public readonly title: string,
    public readonly senderName: string,
    public readonly senderEmail: string,
    public readonly recipient: {
      id: string;
      name: string;
      email: string;
      signingUrl: string;
    },
    public readonly sentAt: Date,
    public readonly timestamp: Date = new Date(),
  ) {}
}
