/**
 * Invoicing & Payments Module
 *
 * Standalone module for invoice creation, payment processing, and tracking.
 *
 * Key principles:
 * - Completely isolated from existing document/envelope/signing code
 * - Link-out payment system - we facilitate payments, we don't process them
 * - No payment card data ever touches our system
 * - Additive database changes only
 */

// Types
export * from './types';

// Validators
export * from './validators';

// Invoice Service
export {
  createInvoice,
  getInvoice,
  getInvoiceByNumber,
  listInvoices,
  updateInvoice,
  sendInvoice,
  markInvoiceViewed,
  voidInvoice,
  recordPayment,
  updateOverdueInvoices,
  getInvoiceStats,
  type InvoiceStats,
} from './invoice-service';

// Invoice Audit
export {
  createInvoiceAuditLog,
  listInvoiceAuditLogs,
  getInvoiceAuditHistory,
  type CreateAuditLogInput,
  type AuditLogFilters,
  type AuditLogListOptions,
  type PaginatedAuditLogs,
} from './invoice-audit';

// Invoice Templates
export {
  createInvoiceTemplate,
  getInvoiceTemplate,
  listInvoiceTemplates,
  updateInvoiceTemplate,
  deleteInvoiceTemplate,
  templateToInvoiceInput,
  processTemplateVariables,
  getDefaultTemplateVariables,
  saveInvoiceAsTemplate,
} from './invoice-template-service';

// Payment Processors
export {
  getPaymentProcessor,
  getAllProcessorTypes,
  getProcessorDisplayInfo,
  generatePaymentToken,
  verifyPaymentToken,
} from './payment-processors';

// Processor Config Service
export {
  createProcessorConfig,
  getProcessorConfig,
  getDefaultProcessorConfig,
  listProcessorConfigs,
  updateProcessorConfig,
  deleteProcessorConfig,
} from './processor-config-service';

// Payment Link Service
export {
  generatePaymentLink,
  getPaymentLink,
  getPaymentLinkByToken,
  getActivePaymentLink,
  recordPaymentLinkClick,
  deactivatePaymentLink,
  processPaymentWebhook,
} from './payment-link-service';
