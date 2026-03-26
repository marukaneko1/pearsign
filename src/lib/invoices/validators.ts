/**
 * Invoicing & Payments Module - Validators
 */

import type {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  CreateInvoiceTemplateInput,
  CreateProcessorConfigInput,
  LineItem,
  BulkImportRow,
  BulkImportError,
} from './types';

// ============================================================================
// Validation Helpers
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN', 'BRL'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function createResult(errors: string[]): ValidationResult {
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Invoice Validators
// ============================================================================

export function validateCreateInvoiceInput(input: CreateInvoiceInput): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!input.customer_name?.trim()) {
    errors.push('Customer name is required');
  }

  if (!input.customer_email?.trim()) {
    errors.push('Customer email is required');
  } else if (!EMAIL_REGEX.test(input.customer_email)) {
    errors.push('Invalid customer email format');
  }

  if (!input.due_date) {
    errors.push('Due date is required');
  } else if (!ISO_DATE_REGEX.test(input.due_date)) {
    errors.push('Due date must be in YYYY-MM-DD format');
  }

  // Optional fields validation
  if (input.customer_phone && !PHONE_REGEX.test(input.customer_phone)) {
    errors.push('Invalid phone number format');
  }

  if (input.issue_date && !ISO_DATE_REGEX.test(input.issue_date)) {
    errors.push('Issue date must be in YYYY-MM-DD format');
  }

  if (input.currency && !CURRENCY_CODES.includes(input.currency)) {
    errors.push(`Currency must be one of: ${CURRENCY_CODES.join(', ')}`);
  }

  // Line items validation
  if (!input.line_items || input.line_items.length === 0) {
    errors.push('At least one line item is required');
  } else {
    input.line_items.forEach((item, index) => {
      const itemErrors = validateLineItem(item, index);
      errors.push(...itemErrors);
    });
  }

  return createResult(errors);
}

export function validateUpdateInvoiceInput(input: UpdateInvoiceInput): ValidationResult {
  const errors: string[] = [];

  if (input.customer_email !== undefined) {
    if (!input.customer_email?.trim()) {
      errors.push('Customer email cannot be empty');
    } else if (!EMAIL_REGEX.test(input.customer_email)) {
      errors.push('Invalid customer email format');
    }
  }

  if (input.customer_name !== undefined && !input.customer_name?.trim()) {
    errors.push('Customer name cannot be empty');
  }

  if (input.customer_phone && !PHONE_REGEX.test(input.customer_phone)) {
    errors.push('Invalid phone number format');
  }

  if (input.issue_date && !ISO_DATE_REGEX.test(input.issue_date)) {
    errors.push('Issue date must be in YYYY-MM-DD format');
  }

  if (input.due_date && !ISO_DATE_REGEX.test(input.due_date)) {
    errors.push('Due date must be in YYYY-MM-DD format');
  }

  if (input.currency && !CURRENCY_CODES.includes(input.currency)) {
    errors.push(`Currency must be one of: ${CURRENCY_CODES.join(', ')}`);
  }

  if (input.line_items !== undefined) {
    if (input.line_items.length === 0) {
      errors.push('At least one line item is required');
    } else {
      input.line_items.forEach((item, index) => {
        const itemErrors = validateLineItem(item, index);
        errors.push(...itemErrors);
      });
    }
  }

  return createResult(errors);
}

function validateLineItem(
  item: Omit<LineItem, 'id' | 'amount'>,
  index: number
): string[] {
  const errors: string[] = [];
  const prefix = `Line item ${index + 1}`;

  if (!item.description?.trim()) {
    errors.push(`${prefix}: Description is required`);
  }

  if (typeof item.quantity !== 'number' || item.quantity <= 0) {
    errors.push(`${prefix}: Quantity must be a positive number`);
  }

  if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
    errors.push(`${prefix}: Unit price must be a non-negative number`);
  }

  if (item.tax_rate !== null && item.tax_rate !== undefined) {
    if (typeof item.tax_rate !== 'number' || item.tax_rate < 0 || item.tax_rate > 100) {
      errors.push(`${prefix}: Tax rate must be between 0 and 100`);
    }
  }

  return errors;
}

// ============================================================================
// Template Validators
// ============================================================================

export function validateCreateTemplateInput(input: CreateInvoiceTemplateInput): ValidationResult {
  const errors: string[] = [];

  if (!input.name?.trim()) {
    errors.push('Template name is required');
  }

  if (input.default_due_days !== undefined) {
    if (typeof input.default_due_days !== 'number' || input.default_due_days < 0) {
      errors.push('Default due days must be a non-negative number');
    }
  }

  if (input.line_item_presets) {
    input.line_item_presets.forEach((item, index) => {
      const itemErrors = validateLineItem(item, index);
      errors.push(...itemErrors);
    });
  }

  return createResult(errors);
}

// ============================================================================
// Processor Config Validators
// ============================================================================

export function validateProcessorConfigInput(input: CreateProcessorConfigInput): ValidationResult {
  const errors: string[] = [];

  if (!input.display_name?.trim()) {
    errors.push('Display name is required');
  }

  if (!['stripe', 'square', 'authorize_net', 'custom'].includes(input.processor_type)) {
    errors.push('Invalid processor type');
  }

  if (!input.credentials || typeof input.credentials !== 'object') {
    errors.push('Credentials are required');
  } else {
    const credErrors = validateProcessorCredentials(input.processor_type, input.credentials);
    errors.push(...credErrors);
  }

  return createResult(errors);
}

function validateProcessorCredentials(
  type: string,
  credentials: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  switch (type) {
    case 'stripe':
      if (!credentials.publishable_key || typeof credentials.publishable_key !== 'string') {
        errors.push('Stripe publishable key is required');
      }
      if (!credentials.secret_key || typeof credentials.secret_key !== 'string') {
        errors.push('Stripe secret key is required');
      }
      break;

    case 'square':
      if (!credentials.application_id || typeof credentials.application_id !== 'string') {
        errors.push('Square application ID is required');
      }
      if (!credentials.access_token || typeof credentials.access_token !== 'string') {
        errors.push('Square access token is required');
      }
      if (!credentials.location_id || typeof credentials.location_id !== 'string') {
        errors.push('Square location ID is required');
      }
      break;

    case 'authorize_net':
      if (!credentials.api_login_id || typeof credentials.api_login_id !== 'string') {
        errors.push('Authorize.Net API login ID is required');
      }
      if (!credentials.transaction_key || typeof credentials.transaction_key !== 'string') {
        errors.push('Authorize.Net transaction key is required');
      }
      break;

    case 'custom':
      if (!credentials.payment_url || typeof credentials.payment_url !== 'string') {
        errors.push('Custom payment URL is required');
      }
      try {
        new URL(credentials.payment_url as string);
      } catch {
        errors.push('Custom payment URL must be a valid URL');
      }
      break;
  }

  return errors;
}

// ============================================================================
// Bulk Import Validators
// ============================================================================

export function validateBulkImportRow(
  row: Record<string, unknown>,
  rowIndex: number
): { data: BulkImportRow | null; errors: BulkImportError[] } {
  const errors: BulkImportError[] = [];

  // Required fields
  const customer_email = String(row.customer_email || '').trim();
  if (!customer_email) {
    errors.push({ row: rowIndex, field: 'customer_email', message: 'Customer email is required' });
  } else if (!EMAIL_REGEX.test(customer_email)) {
    errors.push({ row: rowIndex, field: 'customer_email', message: 'Invalid email format' });
  }

  const customer_name = String(row.customer_name || '').trim();
  if (!customer_name) {
    errors.push({ row: rowIndex, field: 'customer_name', message: 'Customer name is required' });
  }

  // Parse optional fields
  let amount: number | undefined;
  if (row.amount !== undefined && row.amount !== '') {
    amount = Number.parseFloat(String(row.amount));
    if (Number.isNaN(amount) || amount <= 0) {
      errors.push({ row: rowIndex, field: 'amount', message: 'Amount must be a positive number' });
      amount = undefined;
    }
  }

  let quantity: number | undefined;
  if (row.quantity !== undefined && row.quantity !== '') {
    quantity = Number.parseFloat(String(row.quantity));
    if (Number.isNaN(quantity) || quantity <= 0) {
      errors.push({ row: rowIndex, field: 'quantity', message: 'Quantity must be a positive number' });
      quantity = undefined;
    }
  }

  let unit_price: number | undefined;
  if (row.unit_price !== undefined && row.unit_price !== '') {
    unit_price = Number.parseFloat(String(row.unit_price));
    if (Number.isNaN(unit_price) || unit_price < 0) {
      errors.push({ row: rowIndex, field: 'unit_price', message: 'Unit price must be a non-negative number' });
      unit_price = undefined;
    }
  }

  let due_date: string | undefined;
  if (row.due_date !== undefined && row.due_date !== '') {
    due_date = String(row.due_date).trim();
    if (!ISO_DATE_REGEX.test(due_date)) {
      // Try to parse common date formats
      const parsed = parseLooseDate(due_date);
      if (parsed) {
        due_date = parsed;
      } else {
        errors.push({ row: rowIndex, field: 'due_date', message: 'Due date must be in YYYY-MM-DD format' });
        due_date = undefined;
      }
    }
  }

  // Must have either amount or (quantity + unit_price)
  if (!amount && (!quantity || unit_price === undefined)) {
    errors.push({
      row: rowIndex,
      field: 'amount',
      message: 'Either amount or both quantity and unit_price are required'
    });
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return {
    data: {
      customer_email,
      customer_name,
      customer_phone: row.customer_phone ? String(row.customer_phone).trim() : undefined,
      amount,
      description: row.description ? String(row.description).trim() : undefined,
      quantity,
      unit_price,
      due_date,
    },
    errors: [],
  };
}

function parseLooseDate(dateStr: string): string | null {
  // Try MM/DD/YYYY
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try DD/MM/YYYY (European format)
  const ddmmyyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dateStr);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try ISO format with time
  const isoWithTime = /^(\d{4}-\d{2}-\d{2})T/.exec(dateStr);
  if (isoWithTime) {
    return isoWithTime[1];
  }

  return null;
}

// ============================================================================
// Business Rule Validators
// ============================================================================

export function canTransitionStatus(
  currentStatus: string,
  newStatus: string
): boolean {
  const transitions: Record<string, string[]> = {
    draft: ['sent', 'void'],
    sent: ['viewed', 'signed', 'partially_paid', 'paid', 'overdue', 'void'],
    viewed: ['signed', 'partially_paid', 'paid', 'overdue', 'void'],
    signed: ['partially_paid', 'paid', 'void'],
    partially_paid: ['paid', 'void'],
    overdue: ['viewed', 'signed', 'partially_paid', 'paid', 'void'],
    paid: [], // Terminal state
    void: [], // Terminal state
  };

  return transitions[currentStatus]?.includes(newStatus) ?? false;
}

export function isInvoiceEditable(status: string): boolean {
  return status === 'draft';
}

export function isInvoiceSendable(status: string): boolean {
  return status === 'draft';
}

export function isInvoiceVoidable(status: string): boolean {
  return !['paid', 'void'].includes(status);
}
