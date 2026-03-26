/**
 * Invoicing & Payments Module - Audit Logging
 *
 * Captures all invoice-related events for compliance review.
 * All data is strictly tenant-isolated.
 */

import { sql } from '../db';
import type { InvoiceAuditLog, InvoiceAuditAction } from './types';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Audit Table Initialization
// ============================================================================

async function ensureAuditTable(): Promise<void> {
  await initializeInvoicingTables();
}

// ============================================================================
// Audit Log Operations
// ============================================================================

export interface CreateAuditLogInput {
  invoice_id: string | null;
  action: InvoiceAuditAction;
  actor_id: string | null;
  actor_type: 'user' | 'system' | 'customer';
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function createInvoiceAuditLog(
  tenantId: string,
  input: CreateAuditLogInput
): Promise<InvoiceAuditLog> {
  await ensureAuditTable();

  const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  await sql`
    INSERT INTO invoice_audit_logs (
      id, tenant_id, invoice_id, action, actor_id, actor_type,
      metadata, ip_address, user_agent, created_at
    ) VALUES (
      ${id},
      ${tenantId},
      ${input.invoice_id},
      ${input.action},
      ${input.actor_id},
      ${input.actor_type},
      ${JSON.stringify(input.metadata || {})},
      ${input.ip_address || null},
      ${input.user_agent || null},
      NOW()
    )
  `;

  // Return the created log
  const rows = await sql`
    SELECT * FROM invoice_audit_logs WHERE id = ${id}
  `;

  return rowToAuditLog(rows[0]);
}

export interface AuditLogFilters {
  invoice_id?: string;
  action?: InvoiceAuditAction | InvoiceAuditAction[];
  actor_id?: string;
  actor_type?: 'user' | 'system' | 'customer';
  from_date?: string;
  to_date?: string;
}

export interface AuditLogListOptions {
  filters?: AuditLogFilters;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLogs {
  logs: InvoiceAuditLog[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function listInvoiceAuditLogs(
  tenantId: string,
  options: AuditLogListOptions = {}
): Promise<PaginatedAuditLogs> {
  await ensureAuditTable();

  const { filters = {}, page = 1, limit = 50 } = options;

  // Fetch all logs for the tenant and filter in memory
  // In production, you'd build dynamic SQL more carefully
  const allRows = await sql`
    SELECT * FROM invoice_audit_logs
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
  `;

  // Apply filters
  const filteredRows = allRows.filter((row) => {
    if (filters.invoice_id && row.invoice_id !== filters.invoice_id) return false;
    if (filters.action) {
      const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
      if (!actions.includes(row.action as InvoiceAuditAction)) return false;
    }
    if (filters.actor_id && row.actor_id !== filters.actor_id) return false;
    if (filters.actor_type && row.actor_type !== filters.actor_type) return false;
    if (filters.from_date && (row.created_at as string) < filters.from_date) return false;
    if (filters.to_date && (row.created_at as string) > filters.to_date) return false;
    return true;
  });

  const total = filteredRows.length;
  const offset = (page - 1) * limit;
  const paginatedRows = filteredRows.slice(offset, offset + limit);

  const logs = paginatedRows.map(rowToAuditLog);

  return {
    logs,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}

export async function getInvoiceAuditHistory(
  tenantId: string,
  invoiceId: string
): Promise<InvoiceAuditLog[]> {
  await ensureAuditTable();

  const rows = await sql`
    SELECT * FROM invoice_audit_logs
    WHERE tenant_id = ${tenantId} AND invoice_id = ${invoiceId}
    ORDER BY created_at ASC
  `;

  return rows.map(rowToAuditLog);
}

function rowToAuditLog(row: Record<string, unknown>): InvoiceAuditLog {
  // Parse metadata - could be string or already parsed
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata === 'string') {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }
  } else if (row.metadata && typeof row.metadata === 'object') {
    metadata = row.metadata as Record<string, unknown>;
  }

  // Format date
  const formatDate = (val: unknown): string => {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    invoice_id: (row.invoice_id as string) ?? null,
    action: row.action as InvoiceAuditAction,
    actor_id: (row.actor_id as string) ?? null,
    actor_type: row.actor_type as 'user' | 'system' | 'customer',
    metadata,
    ip_address: (row.ip_address as string) ?? null,
    user_agent: (row.user_agent as string) ?? null,
    created_at: formatDate(row.created_at),
  };
}
