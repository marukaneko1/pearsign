import { Injectable, BadRequestException } from '@nestjs/common';

export interface BulkSendRow {
  recipientName: string;
  recipientEmail: string;
  documentTitle: string;
  customMessage?: string;
  expirationDays?: number;
  customFields?: Record<string, string>; // For pre-filling fields
}

export interface ParsedCsv {
  headers: string[];
  rows: BulkSendRow[];
  totalRows: number;
}

/**
 * CsvParserService
 *
 * Parses and validates CSV files for bulk send
 *
 * Required CSV Format:
 * recipient_name,recipient_email,document_title,custom_message
 *
 * Optional CSV Columns:
 * - expiration_days
 * - Any custom field name (for pre-filling)
 *
 * CRITICAL RULES:
 * - Email validation
 * - Duplicate email detection
 * - Row limit enforcement
 * - Header validation
 */
@Injectable()
export class CsvParserService {
  private readonly MAX_ROWS = 1000; // Prevent abuse
  private readonly REQUIRED_HEADERS = ['recipient_email', 'recipient_name', 'document_title'];

  /**
   * Parse CSV string to rows
   */
  async parseCsv(csvContent: string): Promise<ParsedCsv> {
    const lines = csvContent.split('\n').filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      throw new BadRequestException('CSV must contain header row and at least one data row');
    }

    // Parse header
    const headers = this.parseRow(lines[0]);

    // Validate required headers
    this.validateHeaders(headers);

    // Parse data rows
    const rows: BulkSendRow[] = [];
    const seenEmails = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const lineNumber = i + 1;

      if (rows.length >= this.MAX_ROWS) {
        throw new BadRequestException(
          `CSV exceeds maximum of ${this.MAX_ROWS} rows. Please split into multiple files.`,
        );
      }

      try {
        const values = this.parseRow(lines[i]);

        if (values.length !== headers.length) {
          throw new Error(`Row has ${values.length} columns, expected ${headers.length}`);
        }

        const row = this.mapRowToObject(headers, values);

        // Validate email
        this.validateEmail(row.recipientEmail, lineNumber);

        // Check for duplicates
        if (seenEmails.has(row.recipientEmail.toLowerCase())) {
          throw new Error(`Duplicate email: ${row.recipientEmail}`);
        }
        seenEmails.add(row.recipientEmail.toLowerCase());

        rows.push(row);
      } catch (error) {
        throw new BadRequestException(
          `Error on line ${lineNumber}: ${error.message}`,
        );
      }
    }

    return {
      headers,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Parse CSV row (handles quoted fields)
   */
  private parseRow(row: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        if (insideQuotes && row[i + 1] === '"') {
          // Escaped quote
          currentValue += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Field separator
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last value
    values.push(currentValue.trim());

    return values;
  }

  /**
   * Validate required headers
   */
  private validateHeaders(headers: string[]): void {
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    for (const required of this.REQUIRED_HEADERS) {
      if (!lowerHeaders.includes(required)) {
        throw new BadRequestException(
          `Missing required column: ${required}. Required columns: ${this.REQUIRED_HEADERS.join(', ')}`,
        );
      }
    }
  }

  /**
   * Map CSV row to BulkSendRow object
   */
  private mapRowToObject(headers: string[], values: string[]): BulkSendRow {
    const row: any = {};

    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase();
      const value = values[index];

      if (headerLower === 'recipient_name') {
        row.recipientName = value;
      } else if (headerLower === 'recipient_email') {
        row.recipientEmail = value;
      } else if (headerLower === 'document_title') {
        row.documentTitle = value;
      } else if (headerLower === 'custom_message') {
        row.customMessage = value;
      } else if (headerLower === 'expiration_days') {
        row.expirationDays = parseInt(value, 10);
      } else {
        // Custom field for pre-filling
        if (!row.customFields) {
          row.customFields = {};
        }
        row.customFields[header] = value;
      }
    });

    // Validate required fields
    if (!row.recipientName || !row.recipientEmail || !row.documentTitle) {
      throw new Error('Missing required field(s): recipient_name, recipient_email, or document_title');
    }

    return row as BulkSendRow;
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string, lineNumber: number): void {
    if (!email || email.trim() === '') {
      throw new Error(`Empty email on line ${lineNumber}`);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
  }

  /**
   * Generate example CSV
   */
  generateExampleCsv(): string {
    const headers = ['recipient_name', 'recipient_email', 'document_title', 'custom_message'];
    const examples = [
      ['John Doe', 'john@example.com', 'Employment Agreement', 'Welcome to the team!'],
      ['Jane Smith', 'jane@example.com', 'NDA', 'Please review and sign'],
      ['Bob Johnson', 'bob@example.com', 'Sales Contract', ''],
    ];

    const rows = [headers, ...examples].map((row) =>
      row.map((cell) => (cell.includes(',') ? `"${cell}"` : cell)).join(','),
    );

    return rows.join('\n');
  }
}
