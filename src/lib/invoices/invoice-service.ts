/**
 * Invoicing & Payments Module - Invoice Service
 *
 * Core service for invoice CRUD operations and business logic.
 * This service is completely isolated from existing document/envelope/signing code.
 * All data is strictly tenant-isolated.
 */

import { sql } from '../db';
import type {
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  InvoiceFilters,
  InvoiceListOptions,
  PaginatedInvoices,
  LineItem,
  InvoiceStatus,
} from './types';
import {
  validateCreateInvoiceInput,
  validateUpdateInvoiceInput,
  isInvoiceEditable,
  isInvoiceVoidable,
} from './validators';
import { createInvoiceAuditLog } from './invoice-audit';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Invoice Table Initialization
// ============================================================================

async function ensureInvoicesTable(): Promise<void> {
  await initializeInvoicingTables();
}

// ============================================================================
// Invoice Number Generation
// ============================================================================

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  await ensureInvoicesTable();

  const currentYear = new Date().getFullYear();

  // Get or create counter
  const counterRows = await sql`
    SELECT current_number, prefix
    FROM invoice_number_counters
    WHERE tenant_id = ${tenantId}
  `;

  let currentNumber = 0;
  let prefix = 'INV-';

  if (counterRows.length === 0) {
    // Create new counter
    await sql`
      INSERT INTO invoice_number_counters (tenant_id, current_number, prefix, updated_at)
      VALUES (${tenantId}, 0, 'INV-', NOW())
    `;
  } else {
    const row = counterRows[0];
    currentNumber = Number(row.current_number) || 0;
    prefix = (row.prefix as string) || 'INV-';
  }

  const nextNumber = currentNumber + 1;

  // Update counter
  await sql`
    UPDATE invoice_number_counters
    SET current_number = ${nextNumber}, updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `;

  // Build invoice number: PREFIX + YEAR + PADDED_NUMBER
  return `${prefix}${currentYear}-${nextNumber.toString().padStart(5, '0')}`;
}

// ============================================================================
// Line Item Calculations
// ============================================================================

function calculateLineItems(items: Omit<LineItem, 'id' | 'amount'>[]): {
  lineItems: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
} {
  const lineItems: LineItem[] = items.map((item) => ({
    id: generateId(),
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate ?? null,
    amount: Math.round(item.quantity * item.unit_price * 100) / 100,
  }));

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const taxTotal = lineItems.reduce((sum, item) => {
    if (item.tax_rate) {
      return sum + (item.amount * item.tax_rate) / 100;
    }
    return sum;
  }, 0);

  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  return {
    lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createInvoice(
  tenantId: string,
  input: CreateInvoiceInput,
  actorId?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  // Validate input
  const validation = validateCreateInvoiceInput(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  const id = generateId();
  const invoiceNumber = await generateInvoiceNumber(tenantId);
  const now = new Date().toISOString();
  const issueDate = input.issue_date || now.split('T')[0];

  const { lineItems, subtotal, taxTotal, total: rawTotal } = calculateLineItems(input.line_items);

  const discountType = input.discount_type || null;
  const discountValue = Number(input.discount_value) || 0;
  let discountTotal = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountTotal = Math.round((subtotal * discountValue / 100) * 100) / 100;
  } else if (discountType === 'flat' && discountValue > 0) {
    discountTotal = Math.round(discountValue * 100) / 100;
  }
  if (discountTotal > rawTotal) {
    discountTotal = rawTotal;
  }
  const total = Math.round((rawTotal - discountTotal) * 100) / 100;

  await sql`
    INSERT INTO invoices (
      id, tenant_id, invoice_number, status, customer_name, customer_email, customer_phone,
      customer_address, customer_city, customer_state, customer_zip, customer_country,
      line_items, subtotal, tax_total, discount_type, discount_value, discount_total, total, currency, amount_paid,
      issue_date, due_date, memo, terms, po_number, template_id,
      require_signature, require_signature_before_payment,
      payment_history,
      created_at, updated_at, version
    ) VALUES (
      ${id},
      ${tenantId},
      ${invoiceNumber},
      'draft',
      ${input.customer_name},
      ${input.customer_email},
      ${input.customer_phone || null},
      ${input.customer_address || null},
      ${input.customer_city || null},
      ${input.customer_state || null},
      ${input.customer_zip || null},
      ${input.customer_country || null},
      ${JSON.stringify(lineItems)},
      ${subtotal},
      ${taxTotal},
      ${discountType},
      ${discountValue},
      ${discountTotal},
      ${total},
      ${input.currency || 'USD'},
      0,
      ${issueDate},
      ${input.due_date},
      ${input.memo || null},
      ${input.terms || null},
      ${input.po_number || null},
      ${input.template_id || null},
      ${input.require_signature || false},
      ${input.require_signature_before_payment || false},
      '[]',
      NOW(),
      NOW(),
      1
    )
  `;

  // Audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: id,
    action: 'invoice_created',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { invoice_number: invoiceNumber, total },
  });

  // Return the created invoice
  const invoice = await getInvoice(tenantId, id);
  if (!invoice) {
    throw new Error('Failed to create invoice');
  }

  return invoice;
}

export async function getInvoice(
  tenantId: string,
  invoiceId: string
): Promise<Invoice | null> {
  await ensureInvoicesTable();

  // CRITICAL: Always filter by tenant_id for isolation
  const rows = await sql`
    SELECT * FROM invoices
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  if (rows.length === 0) return null;

  return rowToInvoice(rows[0]);
}

export async function getInvoiceByNumber(
  tenantId: string,
  invoiceNumber: string
): Promise<Invoice | null> {
  await ensureInvoicesTable();

  const rows = await sql`
    SELECT * FROM invoices
    WHERE invoice_number = ${invoiceNumber} AND tenant_id = ${tenantId}
  `;

  if (rows.length === 0) return null;

  return rowToInvoice(rows[0]);
}

export async function listInvoices(
  tenantId: string,
  options: InvoiceListOptions = {}
): Promise<PaginatedInvoices> {
  await ensureInvoicesTable();

  const {
    filters = {},
    page = 1,
    limit = 20,
    sort_by = 'created_at',
    sort_order = 'desc',
  } = options;

  // Build WHERE conditions
  const conditions: string[] = [`tenant_id = '${tenantId}'`];

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(`status IN (${statuses.map(s => `'${s}'`).join(',')})`);
  }

  if (filters.search) {
    const searchTerm = filters.search.replace(/'/g, "''");
    conditions.push(`(
      customer_name ILIKE '%${searchTerm}%' OR
      customer_email ILIKE '%${searchTerm}%' OR
      invoice_number ILIKE '%${searchTerm}%'
    )`);
  }

  if (filters.customer_email) {
    conditions.push(`customer_email ILIKE '%${filters.customer_email.replace(/'/g, "''")}%'`);
  }

  if (filters.customer_name) {
    conditions.push(`customer_name ILIKE '%${filters.customer_name.replace(/'/g, "''")}%'`);
  }

  if (filters.from_date) {
    conditions.push(`issue_date >= '${filters.from_date}'`);
  }

  if (filters.to_date) {
    conditions.push(`issue_date <= '${filters.to_date}'`);
  }

  if (filters.min_amount !== undefined) {
    conditions.push(`total >= ${filters.min_amount}`);
  }

  if (filters.max_amount !== undefined) {
    conditions.push(`total <= ${filters.max_amount}`);
  }

  if (filters.is_overdue) {
    const today = new Date().toISOString().split('T')[0];
    conditions.push(`due_date < '${today}' AND status NOT IN ('paid', 'void', 'cancelled')`);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  // Map sort_by to actual column names
  const sortColumn = sort_by === 'customer_name' ? 'customer_name' : sort_by;
  const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

  // Get total count
  const countResult = (await sql.raw(`SELECT COUNT(*) as count FROM invoices WHERE ${whereClause}`)) as unknown as Record<string, unknown>[];
  const total = Number(countResult[0]?.count) || 0;

  // Get paginated results
  const rows = (await sql.raw(`
    SELECT * FROM invoices
    WHERE ${whereClause}
    ORDER BY ${sortColumn} ${sortDir}
    LIMIT ${limit} OFFSET ${offset}
  `)) as unknown as Record<string, unknown>[];

  const invoices = rows.map(rowToInvoice);

  return {
    invoices,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}

export async function updateInvoice(
  tenantId: string,
  invoiceId: string,
  input: UpdateInvoiceInput,
  actorId?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const existing = await getInvoice(tenantId, invoiceId);
  if (!existing) {
    throw new Error('Invoice not found');
  }

  if (!isInvoiceEditable(existing.status)) {
    throw new Error(`Cannot edit invoice with status: ${existing.status}`);
  }

  const validation = validateUpdateInvoiceInput(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  const customerName = input.customer_name ?? existing.customer_name;
  const customerEmail = input.customer_email ?? existing.customer_email;
  const customerPhone = input.customer_phone !== undefined ? input.customer_phone : existing.customer_phone;
  const customerAddress = input.customer_address !== undefined ? input.customer_address : existing.customer_address;
  const customerCity = input.customer_city !== undefined ? input.customer_city : existing.customer_city;
  const customerState = input.customer_state !== undefined ? input.customer_state : existing.customer_state;
  const customerZip = input.customer_zip !== undefined ? input.customer_zip : existing.customer_zip;
  const customerCountry = input.customer_country !== undefined ? input.customer_country : existing.customer_country;
  const issueDate = input.issue_date ?? existing.issue_date;
  const dueDate = input.due_date ?? existing.due_date;
  const memo = input.memo !== undefined ? input.memo : existing.memo;
  const terms = input.terms !== undefined ? input.terms : existing.terms;
  const poNumber = input.po_number !== undefined ? input.po_number : existing.po_number;
  const currency = input.currency ?? existing.currency;
  const requireSignature = input.require_signature ?? existing.require_signature;
  const requireSignatureBeforePayment = input.require_signature_before_payment ?? existing.require_signature_before_payment;

  let lineItems = existing.line_items;
  let subtotal = existing.subtotal;
  let taxTotal = existing.tax_total;
  let rawTotal = existing.total;

  if (input.line_items !== undefined) {
    const calc = calculateLineItems(input.line_items);
    lineItems = calc.lineItems;
    subtotal = calc.subtotal;
    taxTotal = calc.taxTotal;
    rawTotal = calc.total;
  }

  const discountType = input.discount_type !== undefined ? input.discount_type : existing.discount_type;
  const discountValue = input.discount_value !== undefined ? Number(input.discount_value) || 0 : Number(existing.discount_value) || 0;
  let discountTotal = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountTotal = Math.round((subtotal * discountValue / 100) * 100) / 100;
  } else if (discountType === 'flat' && discountValue > 0) {
    discountTotal = Math.round(discountValue * 100) / 100;
  }
  if (discountTotal > rawTotal) {
    discountTotal = rawTotal;
  }
  const total = Math.round((rawTotal - discountTotal) * 100) / 100;

  await sql`
    UPDATE invoices SET
      customer_name = ${customerName},
      customer_email = ${customerEmail},
      customer_phone = ${customerPhone},
      customer_address = ${customerAddress},
      customer_city = ${customerCity},
      customer_state = ${customerState},
      customer_zip = ${customerZip},
      customer_country = ${customerCountry},
      issue_date = ${issueDate},
      due_date = ${dueDate},
      memo = ${memo},
      terms = ${terms},
      po_number = ${poNumber},
      currency = ${currency},
      require_signature = ${requireSignature},
      require_signature_before_payment = ${requireSignatureBeforePayment},
      line_items = ${JSON.stringify(lineItems)},
      subtotal = ${subtotal},
      tax_total = ${taxTotal},
      discount_type = ${discountType},
      discount_value = ${discountValue},
      discount_total = ${discountTotal},
      total = ${total},
      updated_at = NOW(),
      version = version + 1
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  // Audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_updated',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { changes: Object.keys(input) },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) {
    throw new Error('Failed to retrieve updated invoice');
  }

  return updated;
}

// ============================================================================
// Admin / Override Update (bypasses draft-only restriction)
// ============================================================================

export interface AdminUpdateInvoiceInput extends UpdateInvoiceInput {
  status?: InvoiceStatus;
  amount_paid?: number;
}

/**
 * Force-update an invoice regardless of its current status.
 * Intended for internal admin use only — allows changing status, amount paid,
 * line items, dates, and customer details on any non-voided invoice.
 */
export async function adminUpdateInvoice(
  tenantId: string,
  invoiceId: string,
  input: AdminUpdateInvoiceInput,
  actorId?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const existing = await getInvoice(tenantId, invoiceId);
  if (!existing) {
    throw new Error('Invoice not found');
  }

  const customerName = input.customer_name ?? existing.customer_name;
  const customerEmail = input.customer_email ?? existing.customer_email;
  const customerPhone = input.customer_phone !== undefined ? input.customer_phone : existing.customer_phone;
  const customerAddress = input.customer_address !== undefined ? input.customer_address : existing.customer_address;
  const customerCity = input.customer_city !== undefined ? input.customer_city : existing.customer_city;
  const customerState = input.customer_state !== undefined ? input.customer_state : existing.customer_state;
  const customerZip = input.customer_zip !== undefined ? input.customer_zip : existing.customer_zip;
  const customerCountry = input.customer_country !== undefined ? input.customer_country : existing.customer_country;
  const issueDate = input.issue_date ?? existing.issue_date;
  const dueDate = input.due_date ?? existing.due_date;
  const memo = input.memo !== undefined ? input.memo : existing.memo;
  const terms = input.terms !== undefined ? input.terms : existing.terms;
  const poNumber = input.po_number !== undefined ? input.po_number : existing.po_number;
  const currency = input.currency ?? existing.currency;
  const requireSignature = input.require_signature ?? existing.require_signature;
  const requireSignatureBeforePayment = input.require_signature_before_payment ?? existing.require_signature_before_payment;

  let lineItems = existing.line_items;
  let subtotal = existing.subtotal;
  let taxTotal = existing.tax_total;
  let rawTotal = existing.total;

  if (input.line_items !== undefined) {
    const calc = calculateLineItems(input.line_items);
    lineItems = calc.lineItems;
    subtotal = calc.subtotal;
    taxTotal = calc.taxTotal;
    rawTotal = calc.total;
  }

  const discountType = input.discount_type !== undefined ? input.discount_type : existing.discount_type;
  const discountValue = input.discount_value !== undefined ? Number(input.discount_value) || 0 : Number(existing.discount_value) || 0;
  let discountTotal = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountTotal = Math.round((subtotal * discountValue / 100) * 100) / 100;
  } else if (discountType === 'flat' && discountValue > 0) {
    discountTotal = Math.round(discountValue * 100) / 100;
  }
  if (discountTotal > rawTotal) discountTotal = rawTotal;
  const total = Math.round((rawTotal - discountTotal) * 100) / 100;

  // Status and amount_paid overrides
  const newStatus: InvoiceStatus = input.status ?? existing.status;
  const amountPaid = input.amount_paid !== undefined ? Math.max(0, Number(input.amount_paid)) : existing.amount_paid;

  await sql`
    UPDATE invoices SET
      customer_name = ${customerName},
      customer_email = ${customerEmail},
      customer_phone = ${customerPhone},
      customer_address = ${customerAddress},
      customer_city = ${customerCity},
      customer_state = ${customerState},
      customer_zip = ${customerZip},
      customer_country = ${customerCountry},
      issue_date = ${issueDate},
      due_date = ${dueDate},
      memo = ${memo},
      terms = ${terms},
      po_number = ${poNumber},
      currency = ${currency},
      require_signature = ${requireSignature},
      require_signature_before_payment = ${requireSignatureBeforePayment},
      line_items = ${JSON.stringify(lineItems)},
      subtotal = ${subtotal},
      tax_total = ${taxTotal},
      discount_type = ${discountType},
      discount_value = ${discountValue},
      discount_total = ${discountTotal},
      total = ${total},
      amount_paid = ${amountPaid},
      status = ${newStatus},
      paid_at = CASE WHEN ${newStatus} = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
      updated_at = NOW(),
      version = version + 1
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_updated',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { admin_edit: true, changes: Object.keys(input) },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) throw new Error('Failed to retrieve updated invoice');
  return updated;
}

export async function sendInvoice(
  tenantId: string,
  invoiceId: string,
  actorId?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw new Error(`Cannot send invoice with status: ${invoice.status}`);
  }

  await sql`
    UPDATE invoices SET
      status = 'sent',
      sent_at = NOW(),
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_sent',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { sent_to: invoice.customer_email },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) {
    throw new Error('Failed to retrieve updated invoice');
  }

  return updated;
}

export async function markInvoiceViewed(
  tenantId: string,
  invoiceId: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.viewed_at) {
    return invoice;
  }

  const newStatus = invoice.status === 'sent' ? 'viewed' : invoice.status;

  await sql`
    UPDATE invoices SET
      status = ${newStatus},
      viewed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_viewed',
    actor_id: null,
    actor_type: 'customer',
    metadata: {},
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) {
    throw new Error('Failed to retrieve updated invoice');
  }

  return updated;
}

export async function voidInvoice(
  tenantId: string,
  invoiceId: string,
  reason?: string,
  actorId?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!isInvoiceVoidable(invoice.status)) {
    throw new Error(`Cannot void invoice with status: ${invoice.status}`);
  }

  await sql`
    UPDATE invoices SET
      status = 'void',
      voided_at = NOW(),
      void_reason = ${reason || null},
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_voided',
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { reason: reason ?? 'No reason provided' },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) {
    throw new Error('Failed to retrieve updated invoice');
  }

  return updated;
}

export async function recordPayment(
  tenantId: string,
  invoiceId: string,
  amount: number,
  transactionRef?: string,
  actorId?: string,
  paymentMethod?: string
): Promise<Invoice> {
  await ensureInvoicesTable();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (['paid', 'void'].includes(invoice.status)) {
    throw new Error(`Cannot record payment for invoice with status: ${invoice.status}`);
  }

  const newAmountPaid = invoice.amount_paid + amount;

  let newStatus: InvoiceStatus = invoice.status;
  let markPaid = false;

  if (newAmountPaid >= invoice.total) {
    newStatus = 'paid';
    markPaid = true;
  } else if (newAmountPaid > 0) {
    newStatus = 'partially_paid';
  }

  const paymentRecord = {
    id: generateId(),
    amount,
    date: new Date().toISOString(),
    method: paymentMethod || 'manual',
    transaction_ref: transactionRef || null,
    recorded_by: actorId || null,
  };

  if (markPaid) {
    await sql`
      UPDATE invoices SET
        status = ${newStatus},
        amount_paid = ${newAmountPaid},
        payment_history = COALESCE(payment_history, '[]'::jsonb) || ${JSON.stringify([paymentRecord])}::jsonb,
        paid_at = NOW(),
        updated_at = NOW()
      WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
    `;
  } else {
    await sql`
      UPDATE invoices SET
        status = ${newStatus},
        amount_paid = ${newAmountPaid},
        payment_history = COALESCE(payment_history, '[]'::jsonb) || ${JSON.stringify([paymentRecord])}::jsonb,
        updated_at = NOW()
      WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
    `;
  }

  const action = newStatus === 'paid' ? 'invoice_paid' : 'invoice_partially_paid';
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action,
    actor_id: actorId ?? null,
    actor_type: actorId ? 'user' : 'system',
    metadata: { amount, transaction_ref: transactionRef, new_total_paid: newAmountPaid },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  if (!updated) {
    throw new Error('Failed to retrieve updated invoice');
  }

  return updated;
}

export async function updateOverdueInvoices(tenantId?: string): Promise<number> {
  await ensureInvoicesTable();

  const today = new Date().toISOString().split('T')[0];

  if (tenantId) {
    const result = await sql`
      UPDATE invoices
      SET status = 'overdue', updated_at = NOW()
      WHERE due_date < ${today}
        AND status IN ('sent', 'viewed')
        AND tenant_id = ${tenantId}
    `;
    return result.length;
  } else {
    const result = await sql`
      UPDATE invoices
      SET status = 'overdue', updated_at = NOW()
      WHERE due_date < ${today}
        AND status IN ('sent', 'viewed')
    `;
    return result.length;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function rowToInvoice(row: Record<string, unknown>): Invoice {
  // Parse line_items - could be string or already parsed
  let lineItems: LineItem[] = [];
  if (typeof row.line_items === 'string') {
    try {
      lineItems = JSON.parse(row.line_items);
    } catch {
      lineItems = [];
    }
  } else if (Array.isArray(row.line_items)) {
    lineItems = row.line_items as LineItem[];
  }

  // Format dates to ISO strings
  const formatDate = (val: unknown): string | null => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  let paymentHistory: unknown[] = [];
  if (typeof row.payment_history === 'string') {
    try { paymentHistory = JSON.parse(row.payment_history); } catch { paymentHistory = []; }
  } else if (Array.isArray(row.payment_history)) {
    paymentHistory = row.payment_history;
  }

  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    invoice_number: row.invoice_number as string,
    status: row.status as InvoiceStatus,
    customer_name: row.customer_name as string,
    customer_email: row.customer_email as string,
    customer_phone: (row.customer_phone as string) ?? null,
    customer_address: (row.customer_address as string) ?? null,
    customer_city: (row.customer_city as string) ?? null,
    customer_state: (row.customer_state as string) ?? null,
    customer_zip: (row.customer_zip as string) ?? null,
    customer_country: (row.customer_country as string) ?? null,
    line_items: lineItems,
    subtotal: Number(row.subtotal) || 0,
    tax_total: Number(row.tax_total) || 0,
    discount_type: (row.discount_type as string) ?? null,
    discount_value: Number(row.discount_value) || 0,
    discount_total: Number(row.discount_total) || 0,
    total: Number(row.total) || 0,
    currency: (row.currency as string) || 'USD',
    amount_paid: Number(row.amount_paid) || 0,
    issue_date: formatDate(row.issue_date) || new Date().toISOString().split('T')[0],
    due_date: formatDate(row.due_date) || new Date().toISOString().split('T')[0],
    memo: (row.memo as string) ?? null,
    terms: (row.terms as string) ?? null,
    po_number: (row.po_number as string) ?? null,
    notes_internal: (row.notes_internal as string) ?? null,
    template_id: (row.template_id as string) ?? null,
    pdf_document_id: (row.pdf_url as string) ?? null,
    signature_envelope_id: (row.signature_envelope_id as string) ?? null,
    require_signature: Boolean(row.require_signature),
    require_signature_before_payment: Boolean(row.require_signature_before_payment),
    payment_history: paymentHistory,
    created_at: formatDate(row.created_at) || '',
    updated_at: formatDate(row.updated_at) || '',
    sent_at: formatDate(row.sent_at),
    viewed_at: formatDate(row.viewed_at),
    signed_at: formatDate(row.signed_at),
    paid_at: formatDate(row.paid_at),
    voided_at: formatDate(row.voided_at),
    void_reason: (row.void_reason as string) ?? null,
    version: Number(row.version) || 1,
  };
}

// ============================================================================
// Invoice Stats
// ============================================================================

export interface InvoiceStats {
  total_invoices: number;
  total_amount: number;
  total_paid: number;
  total_outstanding: number;
  by_status: Record<InvoiceStatus, number>;
  overdue_count: number;
  overdue_amount: number;
}

export async function getInvoiceStats(tenantId: string): Promise<InvoiceStats> {
  await ensureInvoicesTable();

  const today = new Date().toISOString().split('T')[0];

  // Get totals - filtered by tenant_id
  const totalsRows = await sql`
    SELECT
      COUNT(*) as total_invoices,
      COALESCE(SUM(total), 0) as total_amount,
      COALESCE(SUM(amount_paid), 0) as total_paid
    FROM invoices
    WHERE tenant_id = ${tenantId} AND status != 'void'
  `;

  const totals = totalsRows[0] || { total_invoices: 0, total_amount: 0, total_paid: 0 };

  // Get status counts
  const statusRows = await sql`
    SELECT status, COUNT(*) as count
    FROM invoices
    WHERE tenant_id = ${tenantId}
    GROUP BY status
  `;

  // Get overdue info
  const overdueRows = await sql`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(total - amount_paid), 0) as amount
    FROM invoices
    WHERE tenant_id = ${tenantId}
      AND due_date < ${today}
      AND status NOT IN ('paid', 'void')
  `;

  const overdue = overdueRows[0] || { count: 0, amount: 0 };

  const byStatus: Record<InvoiceStatus, number> = {
    draft: 0,
    sent: 0,
    viewed: 0,
    signed: 0,
    partially_paid: 0,
    paid: 0,
    overdue: 0,
    void: 0,
  };

  for (const row of statusRows) {
    byStatus[row.status as InvoiceStatus] = Number(row.count);
  }

  return {
    total_invoices: Number(totals.total_invoices),
    total_amount: Number(totals.total_amount),
    total_paid: Number(totals.total_paid),
    total_outstanding: Number(totals.total_amount) - Number(totals.total_paid),
    by_status: byStatus,
    overdue_count: Number(overdue.count),
    overdue_amount: Number(overdue.amount),
  };
}
