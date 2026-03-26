/**
 * Invoicing & Payments Module - Payment Link Service
 *
 * Manages payment link generation and tracking.
 * Key principle: Link-out payment system - we facilitate payments, we don't process them.
 * All data is strictly tenant-isolated.
 */

import { sql } from '../db';
import type {
  PaymentLink,
  Invoice,
  ProcessorConfig,
  PaymentEvent,
  ProcessorType,
} from './types';
import { getPaymentProcessor } from './payment-processors';
import { getProcessorConfig, getDefaultProcessorConfig } from './processor-config-service';
import { getInvoice, recordPayment } from './invoice-service';
import { createInvoiceAuditLog } from './invoice-audit';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Table Initialization
// ============================================================================

async function ensurePaymentLinksTable(): Promise<void> {
  await initializeInvoicingTables();
}

// ============================================================================
// Payment Link Operations
// ============================================================================

export async function generatePaymentLink(
  tenantId: string,
  invoiceId: string,
  processorConfigId?: string
): Promise<PaymentLink> {
  await ensurePaymentLinksTable();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (['paid', 'void', 'draft'].includes(invoice.status)) {
    throw new Error(`Cannot generate payment link for invoice with status: ${invoice.status}`);
  }

  // Check if signature is required before payment
  if (invoice.require_signature_before_payment && !invoice.signed_at) {
    throw new Error('Invoice must be signed before payment');
  }

  // Get processor config
  let config: ProcessorConfig | null;
  if (processorConfigId) {
    config = await getProcessorConfig(tenantId, processorConfigId);
  } else {
    config = await getDefaultProcessorConfig(tenantId);
  }

  if (!config) {
    throw new Error('No payment processor configured');
  }

  // Deactivate existing payment links for this invoice
  await sql`
    UPDATE payment_links
    SET is_active = FALSE
    WHERE invoice_id = ${invoiceId}
  `;

  // Generate new payment link
  const processor = getPaymentProcessor(config.processor_type);
  const paymentLink = await processor.generatePaymentLink(invoice, config);

  // Store payment link
  await sql`
    INSERT INTO payment_links (
      id, invoice_id, processor_type, processor_config_id, payment_url, token,
      amount, expires_at, is_active, created_at, click_count
    ) VALUES (
      ${paymentLink.id},
      ${paymentLink.invoice_id},
      ${paymentLink.processor_type},
      ${paymentLink.processor_config_id},
      ${paymentLink.payment_url},
      ${paymentLink.token},
      ${paymentLink.amount},
      ${paymentLink.expires_at},
      TRUE,
      NOW(),
      0
    )
  `;

  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'payment_link_generated',
    actor_id: null,
    actor_type: 'system',
    metadata: {
      payment_link_id: paymentLink.id,
      processor_type: config.processor_type,
      amount: paymentLink.amount,
    },
  });

  return paymentLink;
}

export async function getPaymentLink(
  paymentLinkId: string
): Promise<PaymentLink | null> {
  await ensurePaymentLinksTable();

  const rows = await sql`
    SELECT * FROM payment_links WHERE id = ${paymentLinkId}
  `;

  if (rows.length === 0) return null;

  return rowToPaymentLink(rows[0]);
}

export async function getPaymentLinkByToken(
  token: string
): Promise<PaymentLink | null> {
  await ensurePaymentLinksTable();

  const rows = await sql`
    SELECT * FROM payment_links
    WHERE token = ${token} AND is_active = TRUE
  `;

  if (rows.length === 0) return null;

  return rowToPaymentLink(rows[0]);
}

export async function getActivePaymentLink(
  invoiceId: string
): Promise<PaymentLink | null> {
  await ensurePaymentLinksTable();

  const rows = await sql`
    SELECT * FROM payment_links
    WHERE invoice_id = ${invoiceId}
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  return rowToPaymentLink(rows[0]);
}

export async function recordPaymentLinkClick(
  paymentLinkId: string,
  tenantId: string
): Promise<void> {
  await ensurePaymentLinksTable();

  await sql`
    UPDATE payment_links
    SET click_count = click_count + 1, last_clicked_at = NOW()
    WHERE id = ${paymentLinkId}
  `;

  const link = await getPaymentLink(paymentLinkId);
  if (link) {
    await createInvoiceAuditLog(tenantId, {
      invoice_id: link.invoice_id,
      action: 'payment_link_clicked',
      actor_id: null,
      actor_type: 'customer',
      metadata: { payment_link_id: paymentLinkId },
    });
  }
}

export async function deactivatePaymentLink(
  paymentLinkId: string
): Promise<void> {
  await ensurePaymentLinksTable();

  await sql`
    UPDATE payment_links SET is_active = FALSE WHERE id = ${paymentLinkId}
  `;
}

// ============================================================================
// Webhook Processing
// ============================================================================

export async function processPaymentWebhook(
  tenantId: string,
  processorType: string,
  payload: unknown,
  signature?: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    const processor = getPaymentProcessor(processorType as ProcessorType);

    // Get webhook secret from tenant's config
    const configRows = await sql`
      SELECT * FROM payment_processor_configs
      WHERE tenant_id = ${tenantId}
        AND processor_type = ${processorType}
        AND is_active = TRUE
    `;

    if (configRows.length === 0) {
      return { success: false, error: 'No active processor config found' };
    }

    const webhookSecret = (configRows[0].webhook_secret as string) || '';

    // Parse and verify webhook
    const event = await processor.parseWebhook(payload, webhookSecret);

    if (!event.invoice_id) {
      return { success: false, error: 'Invoice ID not found in webhook' };
    }

    // Get invoice
    const invoice = await getInvoice(tenantId, event.invoice_id);
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Process based on status
    if (event.status === 'succeeded') {
      await recordPayment(
        tenantId,
        event.invoice_id,
        event.amount_paid,
        event.transaction_reference
      );
    }

    return { success: true, invoiceId: event.invoice_id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function rowToPaymentLink(row: Record<string, unknown>): PaymentLink {
  // Format dates
  const formatDate = (val: unknown): string | null => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  return {
    id: row.id as string,
    invoice_id: row.invoice_id as string,
    processor_type: row.processor_type as ProcessorType,
    processor_config_id: row.processor_config_id as string,
    payment_url: row.payment_url as string,
    token: row.token as string,
    amount: Number(row.amount),
    expires_at: formatDate(row.expires_at),
    is_active: Boolean(row.is_active),
    created_at: formatDate(row.created_at) || '',
  };
}
