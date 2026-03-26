import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailRecipient {
  name: string;
  email: string;
}

export interface SignatureRequestEmail {
  recipient: EmailRecipient;
  sender: EmailRecipient;
  documentTitle: string;
  signingUrl: string;
  message?: string;
  expiresAt?: Date;
}

export interface ReminderEmail {
  recipient: EmailRecipient;
  sender: EmailRecipient;
  documentTitle: string;
  signingUrl: string;
  sentAt: Date;
}

export interface CompletionEmail {
  recipient: EmailRecipient;
  documentTitle: string;
  completedAt: Date;
  downloadUrl: string;
  certificateUrl: string;
}

/**
 * EmailService
 *
 * Sends transactional emails for signing workflow
 *
 * CRITICAL RULES:
 * - Triggered by state changes only
 * - Logged to audit trail (caller's responsibility)
 * - Retry-safe (same email can be sent multiple times safely)
 * - Bulk-safe (can send to multiple recipients)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter(): void {
    const smtpHost = this.configService.get<string>(
      'SMTP_HOST',
      'smtp.mailtrap.io',
    );
    const smtpPort = this.configService.get<number>('SMTP_PORT', 2525);
    const smtpUser = this.configService.get<string>('SMTP_USER', '');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD', '');
    const smtpFrom = this.configService.get<string>(
      'SMTP_FROM',
      'noreply@pearsign.com',
    );

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth:
        smtpUser && smtpPassword
          ? {
              user: smtpUser,
              pass: smtpPassword,
            }
          : undefined,
    });

    this.logger.log(`Email transporter initialized: ${smtpHost}:${smtpPort}`);
  }

  /**
   * Send signature request email
   *
   * Triggered when: Envelope status changes to IN_SIGNING
   */
  async sendSignatureRequest(data: SignatureRequestEmail): Promise<void> {
    const subject = `${data.sender.name} has requested your signature on "${data.documentTitle}"`;

    const html = this.generateSignatureRequestHtml(data);

    await this.sendEmail({
      to: data.recipient.email,
      subject,
      html,
    });

    this.logger.log(
      `Signature request sent to ${data.recipient.email} for ${data.documentTitle}`,
    );
  }

  /**
   * Send reminder email
   *
   * Triggered when: Envelope still pending after reminder interval
   */
  async sendReminder(data: ReminderEmail): Promise<void> {
    const subject = `Reminder: Please sign "${data.documentTitle}"`;

    const html = this.generateReminderHtml(data);

    await this.sendEmail({
      to: data.recipient.email,
      subject,
      html,
    });

    this.logger.log(
      `Reminder sent to ${data.recipient.email} for ${data.documentTitle}`,
    );
  }

  /**
   * Send completion email
   *
   * Triggered when: Envelope status changes to COMPLETED
   */
  async sendCompletion(data: CompletionEmail): Promise<void> {
    const subject = `"${data.documentTitle}" has been completed`;

    const html = this.generateCompletionHtml(data);

    await this.sendEmail({
      to: data.recipient.email,
      subject,
      html,
    });

    this.logger.log(
      `Completion email sent to ${data.recipient.email} for ${data.documentTitle}`,
    );
  }

  /**
   * Send bulk signature requests
   *
   * CRITICAL: One email ≠ one envelope (bulk-safe)
   */
  async sendBulkSignatureRequests(
    requests: SignatureRequestEmail[],
  ): Promise<void> {
    const promises = requests.map((request) =>
      this.sendSignatureRequest(request).catch((err) => {
        this.logger.error(
          `Failed to send signature request to ${request.recipient.email}:`,
          err,
        );
      }),
    );

    await Promise.all(promises);

    this.logger.log(`Bulk signature requests sent: ${requests.length} emails`);
  }

  /**
   * Internal: Send email
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const from = this.configService.get<string>(
      'SMTP_FROM',
      'PearSign <noreply@pearsign.com>',
    );

    try {
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  /**
   * Generate signature request email HTML
   */
  private generateSignatureRequestHtml(data: SignatureRequestEmail): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signature Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0d9488 0%, #10b981 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Signature Requested</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hello <strong>${data.recipient.name}</strong>,
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${data.sender.name}</strong> has requested your signature on the following document:
    </p>

    <div style="background: white; border-left: 4px solid #0d9488; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0d9488;">${data.documentTitle}</h2>
      ${data.message ? `<p style="margin: 10px 0; color: #666; font-style: italic;">"${data.message}"</p>` : ''}
    </div>

    ${
      data.expiresAt
        ? `
    <p style="font-size: 14px; color: #dc2626; margin-bottom: 20px;">
      ⏰ This request expires on ${data.expiresAt.toLocaleDateString()}
    </p>
    `
        : ''
    }

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.signingUrl}"
         style="display: inline-block; background: #0d9488; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
        Review &amp; Sign Document
      </a>
    </div>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      If you're unable to click the button, copy and paste this link into your browser:
    </p>
    <p style="font-size: 12px; color: #0d9488; word-break: break-all;">
      ${data.signingUrl}
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This email was sent by PearSign on behalf of ${data.sender.name}.
      <br>
      Questions? Contact ${data.sender.email}
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate reminder email HTML
   */
  private generateReminderHtml(data: ReminderEmail): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signature Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Reminder: Signature Pending</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hello <strong>${data.recipient.name}</strong>,
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      This is a friendly reminder that <strong>${data.sender.name}</strong> is still waiting for your signature on:
    </p>

    <div style="background: white; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #f59e0b;">${data.documentTitle}</h2>
      <p style="margin: 5px 0; color: #666; font-size: 14px;">
        Sent ${this.getTimeAgo(data.sentAt)}
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.signingUrl}"
         style="display: inline-block; background: #f59e0b; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
        Sign Now
      </a>
    </div>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      If you're unable to click the button, copy and paste this link into your browser:
    </p>
    <p style="font-size: 12px; color: #f59e0b; word-break: break-all;">
      ${data.signingUrl}
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This is an automated reminder from PearSign on behalf of ${data.sender.name}.
      <br>
      Questions? Contact ${data.sender.email}
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate completion email HTML
   */
  private generateCompletionHtml(data: CompletionEmail): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Completed</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">✅ Document Completed</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hello <strong>${data.recipient.name}</strong>,
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! The following document has been signed by all parties and is now complete:
    </p>

    <div style="background: white; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #10b981;">${data.documentTitle}</h2>
      <p style="margin: 5px 0; color: #666; font-size: 14px;">
        Completed on ${data.completedAt.toLocaleDateString()} at ${data.completedAt.toLocaleTimeString()}
      </p>
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Download your signed documents below:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.downloadUrl}"
         style="display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; margin-bottom: 10px;">
        Download Signed PDF
      </a>
      <br>
      <a href="${data.certificateUrl}"
         style="display: inline-block; background: white; color: #10b981; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 14px; border: 2px solid #10b981; margin-top: 10px;">
        Download Certificate
      </a>
    </div>

    <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 5px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #059669;">
        <strong>📋 What's included:</strong>
        <br>
        • Signed PDF with all signatures
        <br>
        • Certificate of Completion with audit trail
        <br>
        • SHA-256 hash for tamper detection
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This document was electronically signed using PearSign.
      <br>
      It is legally binding under the U.S. ESIGN Act and UETA.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get human-readable time ago
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  }
}
