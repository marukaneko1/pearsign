/**
 * Stripe Payment Processor Adapter
 *
 * Generates Stripe Payment Links for invoices.
 * No card data ever touches our system - redirects to Stripe's hosted page.
 */

import type {
  ProcessorConfig,
  Invoice,
  PaymentLink,
  PaymentEvent,
} from '../types';
import { BasePaymentProcessor } from './base-processor';
import Stripe from 'stripe';

export class StripeProcessor extends BasePaymentProcessor {
  type = 'stripe' as const;

  async generatePaymentLink(
    invoice: Invoice,
    config: ProcessorConfig
  ): Promise<PaymentLink> {
    const credentials = config.credentials as {
      publishable_key?: string;
      secret_key?: string;
    };

    if (!credentials.secret_key) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(credentials.secret_key);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pearsign.com';
    const returnUrl = `${baseUrl}/api/invoices/payment-callback?invoice_id=${invoice.id}`;

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: (invoice.currency || 'USD').toLowerCase(),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `Payment for ${invoice.customer_name}`,
          },
          unit_amount: Math.round((invoice.total - invoice.amount_paid) * 100),
        },
        quantity: 1,
      }],
      after_completion: {
        type: 'redirect',
        redirect: { url: returnUrl },
      },
      metadata: {
        invoice_id: invoice.id,
        tenant_id: invoice.tenant_id,
        invoice_number: invoice.invoice_number,
      },
    });

    return this.createPaymentLink(
      invoice.id,
      config.id,
      paymentLink.url,
      invoice.total - invoice.amount_paid,
      invoice.tenant_id,
      72 // 72 hour expiry
    );
  }

  async parseWebhook(
    payload: unknown,
    secret: string
  ): Promise<PaymentEvent> {
    const data = payload as {
      type?: string;
      data?: {
        object?: {
          id?: string;
          amount?: number;
          metadata?: {
            invoice_id?: string;
          };
        };
      };
    };

    const invoiceId = data.data?.object?.metadata?.invoice_id;
    if (!invoiceId) {
      throw new Error('Invoice ID not found in webhook payload');
    }

    const eventType = data.type;
    let status: PaymentEvent['status'] = 'pending';

    if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
      status = 'succeeded';
    } else if (eventType === 'payment_intent.payment_failed') {
      status = 'failed';
    }

    return {
      invoice_id: invoiceId,
      processor_type: 'stripe',
      status,
      amount_paid: (data.data?.object?.amount ?? 0) / 100,
      transaction_reference: data.data?.object?.id ?? '',
      raw_payload: data as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
  }

  async validateConfig(
    credentials: Record<string, unknown>
  ): Promise<boolean> {
    const { publishable_key, secret_key } = credentials as {
      publishable_key?: string;
      secret_key?: string;
    };

    if (!publishable_key || !secret_key) {
      return false;
    }

    if (!publishable_key.startsWith('pk_') || !secret_key.startsWith('sk_')) {
      return false;
    }

    try {
      const stripe = new Stripe(secret_key as string);
      await stripe.balance.retrieve();
      return true;
    } catch {
      return false;
    }
  }
}
