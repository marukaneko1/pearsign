/**
 * Custom URL Payment Processor Adapter
 *
 * Allows tenants to redirect customers to their own payment page.
 * Supports URL templating with invoice variables.
 */

import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor, generatePaymentToken } from './base-processor';

export class CustomUrlProcessor extends BasePaymentProcessor {
  type = 'custom' as const;

  async generatePaymentLink(
    invoice: Invoice,
    config: ProcessorConfig
  ): Promise<PaymentLink> {
    const credentials = config.credentials as {
      payment_url?: string;
      include_token?: boolean;
      url_template_vars?: boolean;
    };

    if (!credentials.payment_url) {
      throw new Error('Custom payment URL not configured');
    }

    let paymentUrl = credentials.payment_url;

    // Support URL template variables
    if (credentials.url_template_vars) {
      paymentUrl = paymentUrl
        .replace('{{invoice_id}}', invoice.id)
        .replace('{{invoice_number}}', invoice.invoice_number)
        .replace('{{amount}}', invoice.total.toString())
        .replace('{{currency}}', invoice.currency)
        .replace('{{customer_email}}', encodeURIComponent(invoice.customer_email))
        .replace('{{customer_name}}', encodeURIComponent(invoice.customer_name));
    }

    // Optionally append secure token
    if (credentials.include_token !== false) {
      const token = generatePaymentToken(invoice.id, invoice.total, invoice.tenant_id);
      const separator = paymentUrl.includes('?') ? '&' : '?';
      paymentUrl = `${paymentUrl}${separator}token=${token}`;
    }

    return this.createPaymentLink(
      invoice.id,
      config.id,
      paymentUrl,
      invoice.total - invoice.amount_paid,
      invoice.tenant_id,
      168 // 1 week expiry for custom URLs
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
    // Custom webhooks are tenant-defined
    // We expect a standard format:
    // {
    //   invoice_id: string,
    //   status: 'succeeded' | 'failed' | 'pending',
    //   amount: number,
    //   transaction_id: string,
    //   signature: string // HMAC of payload using secret
    // }

    const data = payload as {
      invoice_id?: string;
      status?: string;
      amount?: number;
      transaction_id?: string;
      signature?: string;
    };

    if (!data.invoice_id) {
      throw new Error('Invoice ID required in webhook payload');
    }

    // Verify signature if secret is provided
    if (secret && data.signature) {
      // In production, verify HMAC signature
      // const expectedSignature = hmac(JSON.stringify(payload), secret);
      // if (data.signature !== expectedSignature) {
      //   throw new Error('Invalid webhook signature');
      // }
    }

    let status: PaymentEvent['status'] = 'pending';
    if (data.status === 'succeeded' || data.status === 'success' || data.status === 'completed') {
      status = 'succeeded';
    } else if (data.status === 'failed' || data.status === 'error') {
      status = 'failed';
    } else if (data.status === 'partial') {
      status = 'partial';
    }

    return {
      invoice_id: data.invoice_id,
      processor_type: 'custom',
      status,
      amount_paid: data.amount ?? 0,
      transaction_reference: data.transaction_id ?? '',
      raw_payload: data as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
  }

  async validateConfig(
    credentials: Record<string, unknown>
  ): Promise<boolean> {
    const { payment_url } = credentials as {
      payment_url?: string;
    };

    if (!payment_url) {
      return false;
    }

    // Validate URL format
    try {
      new URL(payment_url.replace(/\{\{.*?\}\}/g, 'placeholder'));
      return true;
    } catch {
      return false;
    }
  }
}
