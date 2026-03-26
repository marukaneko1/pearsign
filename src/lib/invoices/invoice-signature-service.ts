/**
 * Invoice E-Signature Service
 *
 * Integrates invoices with PearSign's envelope/signing system.
 * Flow:
 * 1. Generate invoice PDF
 * 2. Create envelope with invoice as document
 * 3. Add customer as signer
 * 4. Send for signature
 * 5. Track signature status
 */

import { sql } from '../db';
import type { Invoice } from './types';
import { generateInvoicePDF } from './invoice-pdf-generator';
import { getInvoice } from './invoice-service';
import { createInvoiceAuditLog } from './invoice-audit';
import { initializeInvoicingTables } from './db-init';

// ============================================================================
// Types
// ============================================================================

export interface SignatureRequest {
  invoiceId: string;
  message?: string;
  expirationDays?: number;
  enableReminders?: boolean;
  reminderInterval?: number;
}

export interface SignatureStatus {
  invoiceId: string;
  envelopeId: string | null;
  status: 'not_requested' | 'pending' | 'viewed' | 'signed' | 'declined' | 'expired';
  signedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  declineReason: string | null;
}

export interface EnvelopeWebhookPayload {
  envelopeId: string;
  status: string;
  signedAt?: string;
  declineReason?: string;
}

// ============================================================================
// Invoice PDF Generation (Wrapper)
// ============================================================================

/**
 * Generate a PDF for an invoice
 */
export async function generateInvoicePDFForSignature(
  tenantId: string,
  invoiceId: string
): Promise<{ pdfBuffer: Buffer; filename: string }> {
  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Generate the PDF using the invoice PDF generator
  const pdfBuffer = await generateInvoicePDF(invoice, tenantId);
  const filename = `invoice-${invoice.invoice_number}.pdf`;

  return { pdfBuffer, filename };
}

// ============================================================================
// Envelope Creation for Invoice
// ============================================================================

/**
 * Create a signing envelope for an invoice
 * This creates the envelope but doesn't send it yet
 */
export async function createInvoiceEnvelope(
  tenantId: string,
  invoiceId: string,
  options: {
    message?: string;
    expirationDays?: number;
    enableReminders?: boolean;
  } = {}
): Promise<{ envelopeId: string; status: string }> {
  await initializeInvoicingTables();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.signature_envelope_id) {
    // Already has an envelope - return existing
    return {
      envelopeId: invoice.signature_envelope_id,
      status: 'existing',
    };
  }

  // Generate invoice PDF
  const { pdfBuffer, filename } = await generateInvoicePDFForSignature(tenantId, invoiceId);

  // Create envelope via internal API
  const envelopeId = `env_inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Store envelope reference
  // In a real implementation, this would call the PearSign API to:
  // 1. Upload the PDF as a document
  // 2. Create an envelope with that document
  // 3. Add the customer as a signer

  // For now, we'll store the envelope reference in the invoice
  await sql`
    UPDATE invoices SET
      signature_envelope_id = ${envelopeId},
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  // Create audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'signature_requested',
    actor_id: null,
    actor_type: 'system',
    metadata: {
      envelope_id: envelopeId,
      customer_email: invoice.customer_email,
    },
  });

  return {
    envelopeId,
    status: 'created',
  };
}

/**
 * Send an invoice envelope for signature
 */
export async function sendInvoiceForSignature(
  tenantId: string,
  invoiceId: string,
  request: SignatureRequest
): Promise<{ envelopeId: string; signingUrl: string }> {
  await initializeInvoicingTables();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Check invoice status - must be sent or later (not draft)
  if (invoice.status === 'draft') {
    throw new Error('Invoice must be sent before requesting signature');
  }

  if (invoice.status === 'void') {
    throw new Error('Cannot request signature on voided invoice');
  }

  // Create envelope if not exists
  let envelopeId = invoice.signature_envelope_id;
  if (!envelopeId) {
    const result = await createInvoiceEnvelope(tenantId, invoiceId, {
      message: request.message,
      expirationDays: request.expirationDays,
      enableReminders: request.enableReminders,
    });
    envelopeId = result.envelopeId;
  }

  // Generate signing URL
  // In production, this would call PearSign API to get the actual signing URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const signingToken = Buffer.from(JSON.stringify({
    invoiceId,
    envelopeId,
    email: invoice.customer_email,
    exp: Date.now() + (request.expirationDays || 30) * 24 * 60 * 60 * 1000,
  })).toString('base64url');

  const signingUrl = `${baseUrl}/sign/invoice/${signingToken}`;

  // Update invoice status to indicate signature is pending
  await sql`
    UPDATE invoices SET
      require_signature = TRUE,
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  // Create audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'signature_requested',
    actor_id: null,
    actor_type: 'system',
    metadata: {
      envelope_id: envelopeId,
      message: request.message,
      expiration_days: request.expirationDays,
    },
  });

  return {
    envelopeId: envelopeId!,
    signingUrl,
  };
}

// ============================================================================
// Signature Status Tracking
// ============================================================================

/**
 * Get signature status for an invoice
 */
export async function getInvoiceSignatureStatus(
  tenantId: string,
  invoiceId: string
): Promise<SignatureStatus> {
  await initializeInvoicingTables();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!invoice.signature_envelope_id) {
    return {
      invoiceId,
      envelopeId: null,
      status: 'not_requested',
      signedAt: null,
      signerName: null,
      signerEmail: null,
      declineReason: null,
    };
  }

  // Determine status based on invoice state
  let status: SignatureStatus['status'] = 'pending';
  if (invoice.signed_at) {
    status = 'signed';
  } else if (invoice.viewed_at) {
    status = 'viewed';
  }

  return {
    invoiceId,
    envelopeId: invoice.signature_envelope_id,
    status,
    signedAt: invoice.signed_at,
    signerName: invoice.customer_name,
    signerEmail: invoice.customer_email,
    declineReason: null,
  };
}

/**
 * Mark invoice as signed (called by webhook or signing completion)
 */
export async function markInvoiceSigned(
  tenantId: string,
  invoiceId: string,
  signedAt?: string
): Promise<Invoice> {
  await initializeInvoicingTables();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Update invoice status
  const newStatus = invoice.require_signature_before_payment ? 'signed' : invoice.status;

  await sql`
    UPDATE invoices SET
      status = ${newStatus},
      signed_at = ${signedAt || new Date().toISOString()},
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  // Create audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'invoice_signed',
    actor_id: null,
    actor_type: 'customer',
    metadata: {
      signed_at: signedAt || new Date().toISOString(),
      customer_email: invoice.customer_email,
    },
  });

  const updated = await getInvoice(tenantId, invoiceId);
  return updated!;
}

/**
 * Cancel a signature request
 */
export async function cancelSignatureRequest(
  tenantId: string,
  invoiceId: string,
  reason?: string
): Promise<void> {
  await initializeInvoicingTables();

  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!invoice.signature_envelope_id) {
    throw new Error('No signature request to cancel');
  }

  if (invoice.signed_at) {
    throw new Error('Invoice is already signed');
  }

  // Clear envelope reference
  await sql`
    UPDATE invoices SET
      signature_envelope_id = NULL,
      require_signature = FALSE,
      updated_at = NOW()
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `;

  // In production, also cancel the envelope via PearSign API

  // Create audit log
  await createInvoiceAuditLog(tenantId, {
    invoice_id: invoiceId,
    action: 'signature_cancelled',
    actor_id: null,
    actor_type: 'system',
    metadata: { reason },
  });
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * Handle envelope status webhook from PearSign
 */
export async function handleEnvelopeWebhook(
  payload: EnvelopeWebhookPayload
): Promise<{ processed: boolean; invoiceId?: string }> {
  // Find invoice by envelope ID
  const rows = await sql`
    SELECT id, tenant_id FROM invoices
    WHERE signature_envelope_id = ${payload.envelopeId}
  `;

  if (rows.length === 0) {
    return { processed: false };
  }

  const { id: invoiceId, tenant_id: tenantId } = rows[0] as { id: string; tenant_id: string };

  // Handle based on status
  switch (payload.status) {
    case 'signed':
    case 'completed':
      await markInvoiceSigned(tenantId, invoiceId, payload.signedAt);
      break;

    case 'declined':
      await createInvoiceAuditLog(tenantId, {
        invoice_id: invoiceId,
        action: 'signature_declined',
        actor_id: null,
        actor_type: 'customer',
        metadata: { reason: payload.declineReason },
      });
      break;

    case 'expired':
      await createInvoiceAuditLog(tenantId, {
        invoice_id: invoiceId,
        action: 'signature_expired',
        actor_id: null,
        actor_type: 'system',
        metadata: {},
      });
      break;

    case 'viewed':
      // Update viewed_at if not already set
      await sql`
        UPDATE invoices SET
          viewed_at = COALESCE(viewed_at, NOW()),
          updated_at = NOW()
        WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
      `;
      break;
  }

  return { processed: true, invoiceId };
}
