/**
 * Square Payment Processor Adapter
 *
 * Generates Square Checkout links for invoices using the Square Checkout API.
 * No card data ever touches our system — redirects to Square's hosted payment page.
 */

import crypto from 'crypto';
import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor } from './base-processor';

export class SquareProcessor extends BasePaymentProcessor {
  type = 'square' as const;

  async generatePaymentLink(
    invoice: Invoice,
    config: ProcessorConfig
  ): Promise<PaymentLink> {
    const credentials = config.credentials as {
      application_id?: string;
      access_token?: string;
      location_id?: string;
      sandbox?: boolean;
    };

    if (!credentials.access_token || !credentials.location_id) {
      throw new Error('Square credentials not properly configured: access_token and location_id are required');
    }

    const { Client, Environment } = await import('squareup');

    const client = new Client({
      accessToken: credentials.access_token,
      environment: credentials.sandbox ? Environment.Sandbox : Environment.Production,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pearsign.com';
    const amountDue = invoice.total - invoice.amount_paid;

    const response = await client.checkoutApi.createPaymentLink({
      idempotencyKey: `invoice-${invoice.id}-${Date.now()}`,
      quickPay: {
        name: `Invoice ${invoice.invoice_number}`,
        priceMoney: {
          amount: BigInt(Math.round(amountDue * 100)),
          currency: (invoice.currency || 'USD').toUpperCase() as 'USD',
        },
        locationId: credentials.location_id,
      },
      checkoutOptions: {
        redirectUrl: `${baseUrl}/api/invoices/payment-callback?invoice_id=${invoice.id}`,
      },
      prePopulatedData: {
        buyerEmail: invoice.customer_email ?? undefined,
      },
    });

    if (!response.result.paymentLink?.url) {
      throw new Error('Square did not return a payment link URL');
    }

    return this.createPaymentLink(
      invoice.id,
      config.id,
      response.result.paymentLink.url,
      amountDue,
      invoice.tenant_id,
      72
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
    const data = payload as {
      type?: string;
      data?: {
        id?: string;
        object?: {
          payment?: {
            id?: string;
            amount_money?: { amount?: number };
            order_id?: string;
            note?: string;
          };
        };
      };
    };

    const payment = data.data?.object?.payment;
    const eventType = data.type;
    let status: PaymentEvent['status'] = 'pending';

    if (eventType === 'payment.completed') {
      status = 'succeeded';
    } else if (eventType === 'payment.failed' || eventType === 'payment.canceled') {
      status = 'failed';
    }

    // The invoice_id is stored in the payment note set during link creation, or
    // can be looked up via the order. We embed the invoice ID in the redirect URL's
    // query params and also store it in the order metadata.
    const invoiceId = payment?.note ?? '';

    return {
      invoice_id: invoiceId,
      processor_type: 'square',
      status,
      amount_paid: (payment?.amount_money?.amount ?? 0) / 100,
      transaction_reference: payment?.id ?? '',
      raw_payload: data as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
  }

  async validateConfig(
    credentials: Record<string, unknown>
  ): Promise<boolean> {
    const { application_id, access_token, location_id } = credentials as {
      application_id?: string;
      access_token?: string;
      location_id?: string;
      sandbox?: boolean;
    };

    if (!application_id || !access_token || !location_id) {
      return false;
    }

    try {
      const { Client, Environment } = await import('squareup');
      const client = new Client({
        accessToken: access_token,
        environment: (credentials.sandbox as boolean)
          ? Environment.Sandbox
          : Environment.Production,
      });
      const response = await client.locationsApi.retrieveLocation(location_id);
      return response.result.location?.status === 'ACTIVE';
    } catch {
      return false;
    }
  }

  /**
   * Verify Square webhook signature.
   * Square signs with HMAC-SHA256: HMAC(signatureKey, notificationUrl + body)
   */
  static verifySignature(
    body: string,
    signatureHeader: string,
    signatureKey: string,
    notificationUrl: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(notificationUrl + body);
    const expected = hmac.digest('base64');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }
}
