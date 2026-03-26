import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AuditService } from './audit.service';

/**
 * PdfAuditReportService
 *
 * Generates professional PDF audit reports for legal teams
 *
 * Used for:
 * - Legal discovery
 * - Compliance audits
 * - Court submissions
 * - Regulatory reporting
 */
@Injectable()
export class PdfAuditReportService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Generate PDF audit report
   */
  async generateAuditReport(envelopeId: string): Promise<Uint8Array> {
    const summary = await this.auditService.generateAuditSummary(envelopeId);

    const pdfDoc = await PDFDocument.create();

    // Embed fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let currentPage = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = currentPage.getSize();
    const margin = 50;
    let yPosition = height - margin;

    // === COVER PAGE ===
    currentPage.drawText('AUDIT TRAIL REPORT', {
      x: margin,
      y: yPosition,
      size: 24,
      font: helveticaBold,
    });

    yPosition -= 15;

    currentPage.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 3,
      color: rgb(0, 0.5, 0.5), // Teal
    });

    yPosition -= 40;

    // Envelope metadata
    currentPage.drawText('Envelope Information', {
      x: margin,
      y: yPosition,
      size: 16,
      font: helveticaBold,
    });

    yPosition -= 25;

    const metadata = [
      `Envelope ID: ${summary.envelope.id}`,
      `Title: ${summary.envelope.title}`,
      `Status: ${summary.envelope.status}`,
      `Created: ${summary.envelope.createdAt.toISOString()}`,
      `Organization ID: ${summary.envelope.organizationId}`,
    ];

    for (const line of metadata) {
      currentPage.drawText(line, {
        x: margin + 10,
        y: yPosition,
        size: 11,
        font: helvetica,
      });
      yPosition -= 18;
    }

    yPosition -= 30;

    // Summary statistics
    currentPage.drawText('Audit Summary', {
      x: margin,
      y: yPosition,
      size: 16,
      font: helveticaBold,
    });

    yPosition -= 25;

    const stats = [
      `Total Events: ${summary.summary.totalEvents}`,
      `Emails Sent: ${summary.summary.emailsSent}`,
      `Recipients Viewed: ${summary.summary.recipientsViewed}`,
      `Recipients Signed: ${summary.summary.recipientsSigned}`,
      `Reminders Sent: ${summary.summary.reminders}`,
      summary.summary.completedAt
        ? `Completed: ${summary.summary.completedAt.toISOString()}`
        : 'Status: In Progress',
    ];

    for (const line of stats) {
      currentPage.drawText(line, {
        x: margin + 10,
        y: yPosition,
        size: 11,
        font: helvetica,
      });
      yPosition -= 18;
    }

    yPosition -= 30;

    // Recipients list
    currentPage.drawText('Recipients', {
      x: margin,
      y: yPosition,
      size: 16,
      font: helveticaBold,
    });

    yPosition -= 25;

    for (const recipient of summary.envelope.recipients) {
      if (yPosition < margin + 50) {
        currentPage = pdfDoc.addPage([612, 792]);
        yPosition = height - margin;
      }

      currentPage.drawText(
        `• ${recipient.name} (${recipient.email}) - ${recipient.status}`,
        {
          x: margin + 10,
          y: yPosition,
          size: 10,
          font: helvetica,
        },
      );
      yPosition -= 15;
    }

    yPosition -= 30;

    // === NEW PAGE: COMPLETE EVENT LOG ===
    currentPage = pdfDoc.addPage([612, 792]);
    yPosition = height - margin;

    currentPage.drawText('Complete Event Log', {
      x: margin,
      y: yPosition,
      size: 18,
      font: helveticaBold,
    });

    yPosition -= 10;

    currentPage.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 2,
    });

    yPosition -= 30;

    // Event log
    for (const log of summary.logs) {
      if (yPosition < margin + 80) {
        currentPage = pdfDoc.addPage([612, 792]);
        yPosition = height - margin;
      }

      // Timestamp
      currentPage.drawText(log.timestamp.toISOString(), {
        x: margin,
        y: yPosition,
        size: 8,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });

      yPosition -= 12;

      // Event
      currentPage.drawText(`Event: ${log.action}`, {
        x: margin + 10,
        y: yPosition,
        size: 10,
        font: helveticaBold,
      });

      yPosition -= 14;

      // Actor
      if (log.actor) {
        currentPage.drawText(`Actor: ${log.actor}`, {
          x: margin + 10,
          y: yPosition,
          size: 9,
          font: helvetica,
        });
        yPosition -= 12;
      }

      // Email
      if (log.userEmail || log.details?.recipientEmail) {
        const email = log.userEmail || log.details?.recipientEmail;
        currentPage.drawText(`Email: ${email}`, {
          x: margin + 10,
          y: yPosition,
          size: 9,
          font: helvetica,
        });
        yPosition -= 12;
      }

      // IP Address
      if (log.ipAddress) {
        currentPage.drawText(`IP: ${log.ipAddress}`, {
          x: margin + 10,
          y: yPosition,
          size: 9,
          font: helvetica,
        });
        yPosition -= 12;
      }

      // Details
      if (log.details && Object.keys(log.details).length > 0) {
        const detailsStr = this.formatDetails(log.details);
        if (detailsStr) {
          currentPage.drawText(`Details: ${detailsStr}`, {
            x: margin + 10,
            y: yPosition,
            size: 8,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
          yPosition -= 12;
        }
      }

      // Separator
      currentPage.drawLine({
        start: { x: margin + 10, y: yPosition - 5 },
        end: { x: width - margin, y: yPosition - 5 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      yPosition -= 20;
    }

    // === FINAL PAGE: INTEGRITY & LEGAL NOTICE ===
    currentPage = pdfDoc.addPage([612, 792]);
    yPosition = height - margin;

    currentPage.drawText('Audit Trail Integrity', {
      x: margin,
      y: yPosition,
      size: 18,
      font: helveticaBold,
    });

    yPosition -= 30;

    currentPage.drawText('Audit Hash (SHA-256):', {
      x: margin + 10,
      y: yPosition,
      size: 12,
      font: helveticaBold,
    });

    yPosition -= 18;

    // Split hash into multiple lines
    const hashChunks = this.chunkString(summary.auditHash, 64);
    for (const chunk of hashChunks) {
      currentPage.drawText(chunk, {
        x: margin + 10,
        y: yPosition,
        size: 9,
        font: helvetica,
      });
      yPosition -= 12;
    }

    yPosition -= 30;

    currentPage.drawText('Immutability Statement', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
    });

    yPosition -= 20;

    const immutabilityStatement = [
      'This audit trail is cryptographically hashed to ensure immutability.',
      'Any modification to the audit logs will invalidate the SHA-256 hash',
      'shown above. All events are append-only and cannot be altered or',
      'deleted. This audit trail is legally admissible under the U.S. ESIGN',
      'Act and UETA for digital signature compliance.',
    ];

    for (const line of immutabilityStatement) {
      currentPage.drawText(line, {
        x: margin + 10,
        y: yPosition,
        size: 10,
        font: helvetica,
      });
      yPosition -= 15;
    }

    yPosition -= 30;

    currentPage.drawText('Legal Notice', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
    });

    yPosition -= 20;

    const legalNotice = [
      'This audit trail report was automatically generated by PearSign and',
      'contains a complete record of all actions related to this envelope.',
      'This report is suitable for legal discovery, compliance audits, and',
      'regulatory reporting. For questions or verification, contact the',
      'organization that initiated this document.',
    ];

    for (const line of legalNotice) {
      currentPage.drawText(line, {
        x: margin + 10,
        y: yPosition,
        size: 10,
        font: helvetica,
      });
      yPosition -= 15;
    }

    yPosition -= 40;

    // Footer
    currentPage.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 1,
    });

    yPosition -= 20;

    currentPage.drawText('Generated by PearSign', {
      x: margin,
      y: yPosition,
      size: 9,
      font: helvetica,
    });

    currentPage.drawText(
      `Report Generated: ${new Date().toISOString()}`,
      {
        x: width - margin - 200,
        y: yPosition,
        size: 9,
        font: helvetica,
      },
    );

    return pdfDoc.save();
  }

  /**
   * Format details object for display
   */
  private formatDetails(details: Record<string, any>): string {
    try {
      const keys = Object.keys(details).filter(
        (k) => !['recipientEmail', 'recipientId'].includes(k),
      );
      if (keys.length === 0) return '';

      return keys
        .map((key) => `${key}: ${JSON.stringify(details[key])}`)
        .join(', ');
    } catch {
      return '';
    }
  }

  /**
   * Split string into chunks
   */
  private chunkString(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }
}
