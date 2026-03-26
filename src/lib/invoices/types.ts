/**
 * Invoicing & Payments Module - Core Types
 *
 * This module is completely isolated from existing document/envelope/signing code.
 * Integration points are read-only invocations only.
 */

// ============================================================================
// Invoice Core Types
// ============================================================================

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  amount: number; // computed: quantity * unit_price
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  status: InvoiceStatus;

  // Customer
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  customer_country: string | null;

  // Financials
  line_items: LineItem[];
  subtotal: number;
  tax_total: number;
  discount_type: string | null;
  discount_value: number;
  discount_total: number;
  total: number;
  currency: string; // ISO 4217
  amount_paid: number;
  payment_history: unknown[];

  // Dates
  issue_date: string; // ISO date
  due_date: string; // ISO date

  // Content
  memo: string | null;
  terms: string | null;
  notes_internal: string | null;
  po_number: string | null;

  // References
  template_id: string | null;
  pdf_document_id: string | null;
  signature_envelope_id: string | null;

  // Settings
  require_signature: boolean;
  require_signature_before_payment: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  version: number;
}

export interface CreateInvoiceInput {
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_zip?: string | null;
  customer_country?: string | null;
  line_items: Omit<LineItem, 'id' | 'amount'>[];
  currency?: string;
  issue_date?: string;
  due_date: string;
  memo?: string | null;
  terms?: string | null;
  po_number?: string | null;
  discount_type?: string | null;
  discount_value?: number;
  template_id?: string | null;
  require_signature?: boolean;
  require_signature_before_payment?: boolean;
}

export interface UpdateInvoiceInput {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_zip?: string | null;
  customer_country?: string | null;
  line_items?: Omit<LineItem, 'id' | 'amount'>[];
  currency?: string;
  issue_date?: string;
  due_date?: string;
  memo?: string | null;
  terms?: string | null;
  po_number?: string | null;
  discount_type?: string | null;
  discount_value?: number;
  require_signature?: boolean;
  require_signature_before_payment?: boolean;
}

// ============================================================================
// Invoice Template Types
// ============================================================================

export interface InvoiceTemplate {
  id: string;
  tenant_id: string;
  name: string;
  default_terms: string | null;
  default_memo: string | null;
  default_due_days: number;
  line_item_presets: Omit<LineItem, 'id' | 'amount'>[];
  branding: InvoiceBranding;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceBranding {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string | null;
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
}

export interface CreateInvoiceTemplateInput {
  name: string;
  default_terms?: string | null;
  default_memo?: string | null;
  default_due_days?: number;
  line_item_presets?: Omit<LineItem, 'id' | 'amount'>[];
  branding?: Partial<InvoiceBranding>;
}

// ============================================================================
// Payment Processor Types
// ============================================================================

export type ProcessorType = 'stripe' | 'square' | 'authorize_net' | 'custom';

export interface ProcessorConfig {
  id: string;
  tenant_id: string;
  processor_type: ProcessorType;
  display_name: string;
  credentials: Record<string, unknown>; // encrypted in DB
  webhook_secret: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProcessorConfigInput {
  processor_type: ProcessorType;
  display_name: string;
  credentials: Record<string, unknown>;
  webhook_secret?: string | null;
  is_default?: boolean;
}

// ============================================================================
// Payment Link Types
// ============================================================================

export interface PaymentLink {
  id: string;
  invoice_id: string;
  processor_type: ProcessorType;
  processor_config_id: string;
  payment_url: string;
  token: string; // signed reference token
  amount: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PaymentEvent {
  invoice_id: string;
  processor_type: ProcessorType;
  status: 'succeeded' | 'failed' | 'pending' | 'partial';
  amount_paid: number;
  transaction_reference: string;
  raw_payload: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// Payment Processor Interface
// ============================================================================

export interface PaymentProcessor {
  type: ProcessorType;
  generatePaymentLink(invoice: Invoice, config: ProcessorConfig): Promise<PaymentLink>;
  parseWebhook(payload: unknown, secret: string): Promise<PaymentEvent>;
  validateConfig(credentials: Record<string, unknown>): Promise<boolean>;
}

// ============================================================================
// Reminder Types
// ============================================================================

export type ReminderTrigger = 'before_due' | 'on_due' | 'after_due';
export type ReminderChannel = 'email' | 'sms';

export interface ReminderRule {
  trigger: ReminderTrigger;
  days: number;
  channels: ReminderChannel[];
}

export interface ReminderSchedule {
  id: string;
  invoice_id: string | null;
  template_id: string | null;
  tenant_id: string;
  rules: ReminderRule[];
  is_paused: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReminderHistory {
  id: string;
  invoice_id: string;
  schedule_id: string;
  trigger: ReminderTrigger;
  channel: ReminderChannel;
  sent_at: string;
  status: 'sent' | 'failed';
  error_message: string | null;
}

// ============================================================================
// Bulk Import Types
// ============================================================================

export type BulkImportStatus =
  | 'pending'
  | 'validating'
  | 'validated'
  | 'processing'
  | 'completed'
  | 'failed';

export interface BulkImportJob {
  id: string;
  tenant_id: string;
  status: BulkImportStatus;
  file_name: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  processed_rows: number;
  created_invoices: string[];
  errors: BulkImportError[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BulkImportError {
  row: number;
  field: string;
  message: string;
}

export interface BulkImportRow {
  customer_email: string;
  customer_name: string;
  customer_phone?: string;
  amount?: number;
  description?: string;
  quantity?: number;
  unit_price?: number;
  due_date?: string;
}

// ============================================================================
// Audit Types
// ============================================================================

export type InvoiceAuditAction =
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_sent'
  | 'invoice_viewed'
  | 'invoice_signed'
  | 'invoice_paid'
  | 'invoice_partially_paid'
  | 'invoice_voided'
  | 'payment_link_generated'
  | 'payment_link_clicked'
  | 'reminder_sent'
  | 'bulk_import_completed'
  | 'processor_config_changed'
  | 'signature_requested'
  | 'signature_cancelled'
  | 'signature_declined'
  | 'signature_expired';

export interface InvoiceAuditLog {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  action: InvoiceAuditAction;
  actor_id: string | null;
  actor_type: 'user' | 'system' | 'customer';
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================================================
// Status Transition Types
// ============================================================================

export interface StatusTransition {
  from: InvoiceStatus[];
  to: InvoiceStatus;
  trigger: string;
}

export const INVOICE_STATUS_TRANSITIONS: StatusTransition[] = [
  { from: ['draft'], to: 'sent', trigger: 'user_sends_invoice' },
  { from: ['sent'], to: 'viewed', trigger: 'recipient_opens' },
  { from: ['sent', 'viewed'], to: 'signed', trigger: 'signature_completed' },
  { from: ['sent', 'viewed', 'signed'], to: 'partially_paid', trigger: 'partial_payment' },
  { from: ['partially_paid'], to: 'paid', trigger: 'full_amount_received' },
  { from: ['sent', 'viewed', 'signed'], to: 'paid', trigger: 'full_payment' },
  { from: ['draft', 'sent', 'viewed', 'signed', 'partially_paid', 'overdue'], to: 'void', trigger: 'user_voids' },
  { from: ['sent', 'viewed'], to: 'overdue', trigger: 'due_date_passed' },
];

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface InvoiceFilters {
  status?: InvoiceStatus | InvoiceStatus[];
  customer_email?: string;
  customer_name?: string;
  from_date?: string;
  to_date?: string;
  min_amount?: number;
  max_amount?: number;
  is_overdue?: boolean;
  search?: string;
}

export interface InvoiceListOptions {
  filters?: InvoiceFilters;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'due_date' | 'total' | 'customer_name' | 'status';
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedInvoices {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ============================================================================
// Invoice Number Format Types
// ============================================================================

export interface InvoiceNumberFormat {
  prefix: string;
  suffix: string;
  padding: number;
  include_year: boolean;
  include_month: boolean;
  separator: string;
}

export const DEFAULT_INVOICE_NUMBER_FORMAT: InvoiceNumberFormat = {
  prefix: 'INV',
  suffix: '',
  padding: 5,
  include_year: true,
  include_month: false,
  separator: '-',
};
