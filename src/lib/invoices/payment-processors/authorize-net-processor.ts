/**
 * Authorize.Net Payment Processor Adapter
 *
 * Generates Authorize.Net Accept Hosted links for invoices.
 * No card data ever touches our system - redirects to Authorize.Net's hosted page.
 */

import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor, generatePaymentToken } from './base-processor';

export class AuthorizeNetProcessor extends BasePaymentProcessor {
  type = 'authorize_net' as const;

  async generatePaymentLink(
    invoice: Invoice,
    config: ProcessorConfig
  ): Promise<PaymentLink> {
    const credentials = config.credentials as {
      api_login_id?: string;
      transaction_key?: string;
      is_sandbox?: boolean;
    };

    if (!credentials.api_login_id || !credentials.transaction_key) {
      throw new Error('Authorize.Net credentials not properly configured');
    }

    // In production, this would call Authorize.Net API to get a hosted payment page token
    // Using Accept Hosted approach:
    // 1. Create a getHostedPaymentPageRequest
    // 2. Get the token from response
    // 3. Redirect to hosted payment page with token

    // const merchantAuth = {
    //   name: credentials.api_login_id,
    //   transactionKey: credentials.transaction_key,
    // };
    //
    // const transactionRequest = {
    //   transactionType: 'authCaptureTransaction',
    //   amount: invoice.total.toFixed(2),
    //   order: {
    //     invoiceNumber: invoice.invoice_number,
    //     description: `Invoice payment for ${invoice.customer_name}`,
    //   },
    // };

    // For demo, generate a placeholder URL
    const token = generatePaymentToken(invoice.id, invoice.total, invoice.tenant_id);
    const baseUrl = credentials.is_sandbox
      ? 'https://test.authorize.net/payment'
      : 'https://accept.authorize.net/payment';
    const paymentUrl = `${baseUrl}/payment?token=${token}&invoice=${invoice.invoice_number}`;

    return this.createPaymentLink(
      invoice.id,
      config.id,
      paymentUrl,
      invoice.total - invoice.amount_paid,
      invoice.tenant_id,
      24 // Authorize.Net tokens typically expire in 24 hours
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
    // Authorize.Net uses webhooks with HMAC-SHA512 signature verification

    const data = payload as {
      eventType?: string;
      payload?: {
        id?: string;
        authAmount?: number;
        invoiceNumber?: string;
        responseCode?: number;
      };
    };

    const eventType = data.eventType;
    let status: PaymentEvent['status'] = 'pending';

    if (eventType === 'net.authorize.payment.authcapture.created') {
      if (data.payload?.responseCode === 1) {
        status = 'succeeded';
      } else {
        status = 'failed';
      }
    } else if (eventType === 'net.authorize.payment.refund.created') {
      // Handle refunds separately if needed
      status = 'succeeded';
    }

    return {
      invoice_id: '', // Would be looked up from invoiceNumber
      processor_type: 'authorize_net',
      status,
      amount_paid: data.payload?.authAmount ?? 0,
      transaction_reference: data.payload?.id ?? '',
      raw_payload: data as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
  }

  async validateConfig(
    credentials: Record<string, unknown>
  ): Promise<boolean> {
    const { api_login_id, transaction_key } = credentials as {
      api_login_id?: string;
      transaction_key?: string;
    };

    if (!api_login_id || !transaction_key) {
      return false;
    }

    // Basic format validation
    if (api_login_id.length < 5 || transaction_key.length < 10) {
      return false;
    }

    // In production, make a test API call to validate credentials
    // using getMerchantDetailsRequest

    return true;
  }
}
