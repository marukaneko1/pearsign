import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Envelope } from '../envelopes/entities/envelope.entity';
import * as crypto from 'crypto';

export interface AuditLogQuery {
  envelopeId: string;
  actionFilter?: string[]; // e.g., ['email.sent', 'recipient.viewed']
  actorFilter?: string[]; // e.g., ['system', 'user']
  limit?: number;
  offset?: number;
  sortOrder?: 'ASC' | 'DESC';
}

export interface AuditLogResponse {
  total: number;
  logs: AuditLog[];
  hash: string; // Hash of all logs for immutability verification
}

export interface AuditCsvRow {
  timestamp: string;
  event: string;
  actor: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  details: string;
}

/**
 * AuditService
 *
 * Provides queryable, immutable audit trail for envelopes
 *
 * CRITICAL RULES:
 * - Read-only (no updates or deletes)
 * - Immutable (append-only)
 * - Court-grade (comprehensive, timestamped, hashed)
 * - Access controlled (admin/owner only)
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Envelope)
    private envelopeRepository: Repository<Envelope>,
  ) {}

  /**
   * Query audit logs for an envelope
   *
   * Returns paginated, filtered, sorted audit trail
   */
  async queryAuditLogs(query: AuditLogQuery): Promise<AuditLogResponse> {
    const {
      envelopeId,
      actionFilter,
      actorFilter,
      limit = 100,
      offset = 0,
      sortOrder = 'ASC',
    } = query;

    // Build query
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.envelopeId = :envelopeId', { envelopeId });

    // Apply filters
    if (actionFilter && actionFilter.length > 0) {
      queryBuilder.andWhere('audit.action IN (:...actions)', {
        actions: actionFilter,
      });
    }

    if (actorFilter && actorFilter.length > 0) {
      queryBuilder.andWhere('audit.actor IN (:...actors)', {
        actors: actorFilter,
      });
    }

    // Sort by timestamp
    queryBuilder.orderBy('audit.timestamp', sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const logs = await queryBuilder.skip(offset).take(limit).getMany();

    // Generate hash of all logs for immutability verification
    const hash = this.generateAuditHash(logs);

    return {
      total,
      logs,
      hash,
    };
  }

  /**
   * Get all audit logs for an envelope (no pagination)
   *
   * Used for exports
   */
  async getAllAuditLogs(envelopeId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { envelopeId },
      order: { timestamp: 'ASC' },
    });
  }

  /**
   * Export audit trail as CSV
   */
  async exportAuditTrailCsv(envelopeId: string): Promise<string> {
    const logs = await this.getAllAuditLogs(envelopeId);

    // CSV header
    const header = [
      'Timestamp (UTC)',
      'Event',
      'Actor',
      'Email',
      'IP Address',
      'User Agent',
      'Details',
    ].join(',');

    // CSV rows
    const rows = logs.map((log) => {
      const row: AuditCsvRow = {
        timestamp: log.timestamp.toISOString(),
        event: log.action,
        actor: log.actor || 'unknown',
        email: log.userEmail || log.details?.recipientEmail || '',
        ipAddress: log.ipAddress || '',
        userAgent: log.userAgent || '',
        details: this.formatDetailsForCsv(log.details),
      };

      return [
        this.escapeCsvField(row.timestamp),
        this.escapeCsvField(row.event),
        this.escapeCsvField(row.actor),
        this.escapeCsvField(row.email),
        this.escapeCsvField(row.ipAddress),
        this.escapeCsvField(row.userAgent),
        this.escapeCsvField(row.details),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Get audit trail metadata for certificate
   */
  async getAuditMetadataForCertificate(envelopeId: string): Promise<{
    totalEvents: number;
    firstEvent: Date;
    lastEvent: Date;
    auditHash: string;
  }> {
    const logs = await this.getAllAuditLogs(envelopeId);

    if (logs.length === 0) {
      throw new NotFoundException('No audit logs found for envelope');
    }

    const hash = this.generateAuditHash(logs);

    return {
      totalEvents: logs.length,
      firstEvent: logs[0].timestamp,
      lastEvent: logs[logs.length - 1].timestamp,
      auditHash: hash,
    };
  }

  /**
   * Generate audit trail summary for PDF export
   */
  async generateAuditSummary(envelopeId: string): Promise<{
    envelope: Envelope;
    logs: AuditLog[];
    summary: {
      totalEvents: number;
      emailsSent: number;
      recipientsViewed: number;
      recipientsSigned: number;
      reminders: number;
      completedAt?: Date;
    };
    auditHash: string;
  }> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
      relations: ['recipients'],
    });

    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    const logs = await this.getAllAuditLogs(envelopeId);

    // Calculate summary stats
    const emailsSent = logs.filter((l) => l.action === 'email.sent').length;
    const recipientsViewed = logs.filter(
      (l) => l.action === 'recipient.viewed',
    ).length;
    const recipientsSigned = logs.filter(
      (l) => l.action === 'recipient.signed',
    ).length;
    const reminders = logs.filter((l) =>
      l.details?.emailType?.includes('reminder'),
    ).length;

    const completedLog = logs.find((l) => l.action === 'envelope.completed');

    const hash = this.generateAuditHash(logs);

    return {
      envelope,
      logs,
      summary: {
        totalEvents: logs.length,
        emailsSent,
        recipientsViewed,
        recipientsSigned,
        reminders,
        completedAt: completedLog?.timestamp,
      },
      auditHash: hash,
    };
  }

  /**
   * Generate SHA-256 hash of all audit logs
   *
   * Used for immutability verification
   */
  private generateAuditHash(logs: AuditLog[]): string {
    const data = logs
      .map(
        (log) =>
          `${log.id}:${log.action}:${log.timestamp.toISOString()}:${log.actor}`,
      )
      .join('|');

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Format details object for CSV
   */
  private formatDetailsForCsv(details: Record<string, any> | null): string {
    if (!details) return '';

    try {
      return JSON.stringify(details);
    } catch {
      return '';
    }
  }

  /**
   * Escape CSV field
   */
  private escapeCsvField(value: string): string {
    if (!value) return '';

    // If field contains comma, newline, or quote, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  /**
   * Create audit log entry
   *
   * Helper method for other services to log events
   */
  async createAuditLog(data: {
    envelopeId: string;
    organizationId: string;
    action: string;
    actor: string;
    userId?: string;
    userEmail?: string;
    userName?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
    description?: string;
  }): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      envelopeId: data.envelopeId,
      organizationId: data.organizationId,
      action: data.action,
      actor: data.actor,
      userId: data.userId,
      userEmail: data.userEmail,
      userName: data.userName,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details,
      description: data.description,
      timestamp: new Date(),
    });

    return this.auditLogRepository.save(auditLog);
  }
}
