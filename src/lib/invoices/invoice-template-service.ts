/**
 * Invoicing & Payments Module - Invoice Template Service
 *
 * Manages invoice templates for quick invoice creation.
 * All data is strictly tenant-isolated.
 */

import { sql } from '../db';
import type {
  InvoiceTemplate,
  CreateInvoiceTemplateInput,
  InvoiceBranding,
  CreateInvoiceInput,
  LineItem,
} from './types';
import { validateCreateTemplateInput } from './validators';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Table Initialization
// ============================================================================

async function ensureTemplateTable(): Promise<void> {
  await initializeInvoicingTables();
}

// ============================================================================
// Default Branding
// ============================================================================

const DEFAULT_BRANDING: InvoiceBranding = {
  logo_url: null,
  primary_color: '#1a1a1a',
  secondary_color: '#666666',
  footer_text: null,
  company_name: null,
  company_address: null,
  company_phone: null,
  company_email: null,
};

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createInvoiceTemplate(
  tenantId: string,
  input: CreateInvoiceTemplateInput
): Promise<InvoiceTemplate> {
  await ensureTemplateTable();

  const validation = validateCreateTemplateInput(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  const id = `invtpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const branding = { ...DEFAULT_BRANDING, ...input.branding };

  await sql`
    INSERT INTO invoice_templates (
      id, tenant_id, name, default_terms, default_memo, default_due_days,
      line_item_presets, branding, is_active, created_at, updated_at
    ) VALUES (
      ${id},
      ${tenantId},
      ${input.name},
      ${input.default_terms || null},
      ${input.default_memo || null},
      ${input.default_due_days || 30},
      ${JSON.stringify(input.line_item_presets || [])},
      ${JSON.stringify(branding)},
      TRUE,
      NOW(),
      NOW()
    )
  `;

  const template = await getInvoiceTemplate(tenantId, id);
  if (!template) {
    throw new Error('Failed to create template');
  }

  return template;
}

export async function getInvoiceTemplate(
  tenantId: string,
  templateId: string
): Promise<InvoiceTemplate | null> {
  await ensureTemplateTable();

  // CRITICAL: Always filter by tenant_id for isolation
  const rows = await sql`
    SELECT * FROM invoice_templates
    WHERE id = ${templateId} AND tenant_id = ${tenantId}
  `;

  if (rows.length === 0) return null;

  return rowToTemplate(rows[0]);
}

export async function listInvoiceTemplates(
  tenantId: string,
  includeInactive: boolean = false
): Promise<InvoiceTemplate[]> {
  await ensureTemplateTable();

  let rows;
  if (includeInactive) {
    rows = await sql`
      SELECT * FROM invoice_templates
      WHERE tenant_id = ${tenantId}
      ORDER BY name ASC
    `;
  } else {
    rows = await sql`
      SELECT * FROM invoice_templates
      WHERE tenant_id = ${tenantId} AND is_active = TRUE
      ORDER BY name ASC
    `;
  }

  return rows.map(rowToTemplate);
}

export async function updateInvoiceTemplate(
  tenantId: string,
  templateId: string,
  updates: Partial<CreateInvoiceTemplateInput>
): Promise<InvoiceTemplate> {
  await ensureTemplateTable();

  const existing = await getInvoiceTemplate(tenantId, templateId);
  if (!existing) {
    throw new Error('Template not found');
  }

  const name = updates.name ?? existing.name;
  const defaultTerms = updates.default_terms !== undefined ? updates.default_terms : existing.default_terms;
  const defaultMemo = updates.default_memo !== undefined ? updates.default_memo : existing.default_memo;
  const defaultDueDays = updates.default_due_days ?? existing.default_due_days;
  const lineItemPresets = updates.line_item_presets ?? existing.line_item_presets;
  const branding = updates.branding ? { ...existing.branding, ...updates.branding } : existing.branding;

  await sql`
    UPDATE invoice_templates SET
      name = ${name},
      default_terms = ${defaultTerms},
      default_memo = ${defaultMemo},
      default_due_days = ${defaultDueDays},
      line_item_presets = ${JSON.stringify(lineItemPresets)},
      branding = ${JSON.stringify(branding)},
      updated_at = NOW()
    WHERE id = ${templateId} AND tenant_id = ${tenantId}
  `;

  const updated = await getInvoiceTemplate(tenantId, templateId);
  if (!updated) {
    throw new Error('Failed to retrieve updated template');
  }

  return updated;
}

export async function deleteInvoiceTemplate(
  tenantId: string,
  templateId: string
): Promise<void> {
  await ensureTemplateTable();

  // Soft delete
  await sql`
    UPDATE invoice_templates
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${templateId} AND tenant_id = ${tenantId}
  `;
}

// ============================================================================
// Template to Invoice Conversion
// ============================================================================

export function templateToInvoiceInput(
  template: InvoiceTemplate,
  customer: { name: string; email: string; phone?: string }
): Omit<CreateInvoiceInput, 'line_items'> & { line_items: Omit<LineItem, 'id' | 'amount'>[] } {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + template.default_due_days);

  return {
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    line_items: template.line_item_presets,
    due_date: dueDate.toISOString().split('T')[0],
    memo: template.default_memo,
    terms: template.default_terms,
    template_id: template.id,
  };
}

// ============================================================================
// Dynamic Field Support
// ============================================================================

export function processTemplateVariables(
  text: string,
  variables: Record<string, string>
): string {
  let result = text;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

export function getDefaultTemplateVariables(
  invoice: {
    customer_name: string;
    invoice_number: string;
    total: number;
    due_date: string;
  }
): Record<string, string> {
  return {
    customer_name: invoice.customer_name,
    invoice_number: invoice.invoice_number,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: invoice.due_date,
    total: invoice.total.toFixed(2),
    year: new Date().getFullYear().toString(),
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
  };
}

// ============================================================================
// Save Invoice as Template
// ============================================================================

export async function saveInvoiceAsTemplate(
  tenantId: string,
  invoice: {
    line_items: LineItem[];
    memo: string | null;
    terms: string | null;
    due_date: string;
    issue_date: string;
  },
  templateName: string,
  branding?: Partial<InvoiceBranding>
): Promise<InvoiceTemplate> {
  // Calculate default due days from invoice dates
  const issueDate = new Date(invoice.issue_date);
  const dueDate = new Date(invoice.due_date);
  const dueDays = Math.ceil((dueDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));

  return createInvoiceTemplate(tenantId, {
    name: templateName,
    default_terms: invoice.terms,
    default_memo: invoice.memo,
    default_due_days: Math.max(0, dueDays),
    line_item_presets: invoice.line_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
    })),
    branding,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function rowToTemplate(row: Record<string, unknown>): InvoiceTemplate {
  // Parse JSON fields
  let lineItemPresets: Omit<LineItem, 'id' | 'amount'>[] = [];
  if (typeof row.line_item_presets === 'string') {
    lineItemPresets = JSON.parse(row.line_item_presets);
  } else if (Array.isArray(row.line_item_presets)) {
    lineItemPresets = row.line_item_presets as Omit<LineItem, 'id' | 'amount'>[];
  }

  let branding: InvoiceBranding = DEFAULT_BRANDING;
  if (typeof row.branding === 'string') {
    branding = JSON.parse(row.branding);
  } else if (row.branding && typeof row.branding === 'object') {
    branding = row.branding as InvoiceBranding;
  }

  // Format dates
  const formatDate = (val: unknown): string => {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    default_terms: (row.default_terms as string) ?? null,
    default_memo: (row.default_memo as string) ?? null,
    default_due_days: Number(row.default_due_days),
    line_item_presets: lineItemPresets,
    branding,
    is_active: Boolean(row.is_active),
    created_at: formatDate(row.created_at),
    updated_at: formatDate(row.updated_at),
  };
}
