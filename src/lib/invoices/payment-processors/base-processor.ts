/**
 * Base Payment Processor
 *
 * Base class for all payment processor adapters.
 * Extracted to avoid circular dependencies.
 */

import type {
  PaymentProcessor,
  ProcessorType,
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';

// ============================================================================
// Payment Link Token Generation
// ============================================================================

const TOKEN_SECRET = process.env.PAYMENT_LINK_SECRET || 'pearsign-payment-link-secret';

export function generatePaymentToken(
  invoiceId: string,
  amount: number,
  tenantId: string,
  expiryHours: number = 72
): string {
  const payload = {
    inv: invoiceId,
    amt: amount,
    tid: tenantId,
    exp: Date.now() + expiryHours * 60 * 60 * 1000,
    nonce: Math.random().toString(36).substring(2),
  };

  // Simple encoding - in production use JWT or signed tokens
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = simpleHash(`${encoded}:${TOKEN_SECRET}`);

  return `${encoded}.${signature}`;
}

export function verifyPaymentToken(token: string): {
  valid: boolean;
  invoiceId?: string;
  amount?: number;
  tenantId?: string;
  expired?: boolean;
} {
  try {
    const [encoded, signature] = token.split('.');
    const expectedSignature = simpleHash(`${encoded}:${TOKEN_SECRET}`);

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());

    if (payload.exp < Date.now()) {
      return {
        valid: false,
        expired: true,
        invoiceId: payload.inv,
      };
    }

    return {
      valid: true,
      invoiceId: payload.inv,
      amount: payload.amt,
      tenantId: payload.tid,
    };
  } catch {
    return { valid: false };
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Base Processor Implementation
// ============================================================================

export abstract class BasePaymentProcessor implements PaymentProcessor {
  abstract type: ProcessorType;

  abstract generatePaymentLink(
    invoice: Invoice,
    config: ProcessorConfig
  ): Promise<PaymentLink>;

  abstract parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent>;

  abstract validateConfig(
    credentials: Record<string, unknown>
  ): Promise<boolean>;

  protected createPaymentLink(
    invoiceId: string,
    configId: string,
    paymentUrl: string,
    amount: number,
    tenantId: string,
    expiryHours?: number
  ): PaymentLink {
    return {
      id: `plink_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      invoice_id: invoiceId,
      processor_type: this.type,
      processor_config_id: configId,
      payment_url: paymentUrl,
      token: generatePaymentToken(invoiceId, amount, tenantId, expiryHours),
      amount,
      expires_at: expiryHours
        ? new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
        : null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  }
}
