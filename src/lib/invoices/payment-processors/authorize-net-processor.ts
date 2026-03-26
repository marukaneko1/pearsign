/**
 * Authorize.Net Payment Processor Adapter
 *
 * Generates Authorize.Net Accept Hosted links for invoices.
 * No card data ever touches our system — redirects to Authorize.Net's hosted page.
 * Webhook payloads are verified via HMAC-SHA512 using AUTHORIZENET_SIGNATURE_KEY.
 */

import crypto from 'crypto';
import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor } from './base-processor';

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

    const apiUrl = credentials.is_sandbox
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pearsign.com';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        getHostedPaymentPageRequest: {
          merchantAuthentication: {
            name: credentials.api_login_id,
            transactionKey: credentials.transaction_key,
          },
          transactionRequest: {
            transactionType: 'authCaptureTransaction',
            amount: (invoice.total - invoice.amount_paid).toFixed(2),
            order: {
              invoiceNumber: invoice.invoice_number,
              description: `Invoice payment for ${invoice.customer_name}`,
            },
          },
          hostedPaymentSettings: {
            setting: [
              {
                settingName: 'hostedPaymentReturnOptions',
                settingValue: JSON.stringify({
                  url: `${appUrl}/api/invoices/payment-callback?invoice_id=${invoice.id}`,
                  cancelUrl: appUrl,
                  showReceipt: true,
                }),
              },
              {
                settingName: 'hostedPaymentButtonOptions',
                settingValue: JSON.stringify({ text: 'Pay Now' }),
              },
              {
                settingName: 'hostedPaymentOrderOptions',
                settingValue: JSON.stringify({
                  show: true,
                  merchantName: invoice.tenant_id,
                }),
              },
            ],
          },
        },
      }),
    });

    const data = await response.json();
    if (data.messages?.resultCode !== 'Ok') {
      throw new Error(
        `Authorize.Net error: ${data.messages?.message?.[0]?.text || 'Unknown error'}`
      );
    }

    const hostedToken = data.token;
    const paymentBaseUrl = credentials.is_sandbox
      ? 'https://test.authorize.net/payment/payment'
      : 'https://accept.authorize.net/payment/payment';

    return this.createPaymentLink(
      invoice.id,
      config.id,
      `${paymentBaseUrl}?token=${hostedToken}`,
      invoice.total - invoice.amount_paid,
      invoice.tenant_id,
      24
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
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
      status = data.payload?.responseCode === 1 ? 'succeeded' : 'failed';
    } else if (eventType === 'net.authorize.payment.void.created') {
      status = 'failed';
    } else if (eventType === 'net.authorize.payment.refund.created') {
      status = 'succeeded';
    }

    // invoiceNumber was set in hostedPaymentOrderOptions; map it back to our invoice id
    // In the payment callback route, invoice_id comes from the redirect URL query param.
    // Here in the webhook we use invoiceNumber as the reference.
    const invoiceId = data.payload?.invoiceNumber ?? '';

    return {
      invoice_id: invoiceId,
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
    const { api_login_id, transaction_key, is_sandbox } = credentials as {
      api_login_id?: string;
      transaction_key?: string;
      is_sandbox?: boolean;
    };

    if (!api_login_id || !transaction_key) {
      return false;
    }

    if (api_login_id.length < 5 || transaction_key.length < 10) {
      return false;
    }

    // Make a real authenticateTestRequest to validate credentials
    const apiUrl = is_sandbox
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authenticateTestRequest: {
            merchantAuthentication: {
              name: api_login_id,
              transactionKey: transaction_key,
            },
          },
        }),
      });

      const data = await response.json();
      return data.messages?.resultCode === 'Ok';
    } catch {
      return false;
    }
  }

  /**
   * Verify Authorize.Net webhook signature.
   * Authorize.Net signs with HMAC-SHA512 over the raw request body.
   * The signature header is "X-ANET-Signature: sha512=<hex>".
   */
  static verifySignature(
    rawBody: string,
    signatureHeader: string,
    signatureKey: string
  ): boolean {
    // Header format: "sha512=<uppercased hex digest>"
    const prefix = 'sha512=';
    if (!signatureHeader.toLowerCase().startsWith(prefix)) {
      return false;
    }

    const receivedHex = signatureHeader.slice(prefix.length);
    const hmac = crypto.createHmac('sha512', signatureKey);
    hmac.update(rawBody);
    const expectedHex = hmac.digest('hex').toUpperCase();

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedHex.toUpperCase()),
        Buffer.from(expectedHex)
      );
    } catch {
      return false;
    }
  }
}
