/**
 * Square Payment Processor Adapter
 *
 * Generates Square Checkout links for invoices.
 * No card data ever touches our system - redirects to Square's hosted page.
 */

import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor, generatePaymentToken } from './base-processor';

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
    };

    if (!credentials.access_token || !credentials.location_id) {
      throw new Error('Square credentials not properly configured');
    }

    // In production, this would call Square API to create a Checkout Link
    // const client = new Client({
    //   accessToken: credentials.access_token,
    //   environment: Environment.Production,
    // });
    //
    // const response = await client.checkoutApi.createPaymentLink({
    //   idempotencyKey: `invoice-${invoice.id}`,
    //   quickPay: {
    //     name: `Invoice ${invoice.invoice_number}`,
    //     priceMoney: {
    //       amount: BigInt(Math.round(invoice.total * 100)),
    //       currency: invoice.currency,
    //     },
    //     locationId: credentials.location_id,
    //   },
    //   checkoutOptions: {
    //     redirectUrl: `${baseUrl}/api/invoices/payment-callback?invoice_id=${invoice.id}`,
    //   },
    // });

    // For demo, generate a placeholder URL
    const token = generatePaymentToken(invoice.id, invoice.total, invoice.tenant_id);
    const paymentUrl = `https://checkout.square.site/pay/demo?token=${token}&amount=${invoice.total}`;

    return this.createPaymentLink(
      invoice.id,
      config.id,
      paymentUrl,
      invoice.total - invoice.amount_paid,
      invoice.tenant_id,
      72
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
    // In production, verify Square webhook signature
    // Square uses HMAC-SHA256 for signature verification

    const data = payload as {
      type?: string;
      data?: {
        id?: string;
        object?: {
          payment?: {
            id?: string;
            amount_money?: {
              amount?: number;
            };
            order_id?: string;
          };
        };
      };
    };

    // Extract invoice ID from order metadata
    const orderId = data.data?.object?.payment?.order_id;
    // In production, we'd look up the order to get invoice metadata

    const eventType = data.type;
    let status: PaymentEvent['status'] = 'pending';

    if (eventType === 'payment.completed') {
      status = 'succeeded';
    } else if (eventType === 'payment.failed') {
      status = 'failed';
    }

    return {
      invoice_id: orderId ?? '', // Would be mapped from order metadata
      processor_type: 'square',
      status,
      amount_paid: (data.data?.object?.payment?.amount_money?.amount ?? 0) / 100,
      transaction_reference: data.data?.object?.payment?.id ?? '',
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
    };

    if (!application_id || !access_token || !location_id) {
      return false;
    }

    // In production, make a test API call to validate credentials
    // try {
    //   const client = new Client({ accessToken: access_token });
    //   await client.locationsApi.retrieveLocation(location_id);
    //   return true;
    // } catch {
    //   return false;
    // }

    return true;
  }
}
