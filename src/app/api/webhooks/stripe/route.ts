/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events for billing:
 * - invoice.created / invoice.finalized
 * - invoice.paid / invoice.payment_failed
 * - customer.subscription.created / updated / deleted
 * - checkout.session.completed
 * - customer.created / updated
 *
 * Webhook signature verification ensures events are from Stripe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { BillingService } from '@/lib/billing-service';

// Stripe sends raw body, we need to read it as text
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Verify Stripe webhook signature
 */
async function verifyStripeSignature(
  body: string,
  signature: string | null,
  webhookSecret: string
): Promise<{ valid: boolean; event?: Record<string, unknown>; error?: string }> {
  if (!signature) {
    return { valid: false, error: 'Missing Stripe signature' };
  }

  try {
    // For production, use Stripe SDK for signature verification
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      console.warn('[Stripe Webhook] No STRIPE_SECRET_KEY configured');
      // Only skip signature verification in local development (never in production).
      if (process.env.NODE_ENV !== 'production') {
        try {
          const event = JSON.parse(body);
          console.log('[Stripe Webhook] DEV MODE: Accepting event without signature verification');
          return { valid: true, event };
        } catch {
          return { valid: false, error: 'Invalid JSON body' };
        }
      }
      return { valid: false, error: 'Stripe not configured' };
    }

    // Use Stripe SDK for proper signature verification
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' });

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return { valid: true, event: event as unknown as Record<string, unknown> };
  } catch (error) {
    console.error('[Stripe Webhook] Signature verification failed:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed'
    };
  }
}

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return NextResponse.json(
      { error: 'Webhook verification not configured' },
      { status: 500 }
    );
  }

  // Get the raw body as text for signature verification
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error('[Stripe Webhook] Failed to read request body:', error);
    return NextResponse.json(
      { error: 'Failed to read request body' },
      { status: 400 }
    );
  }

  // Get Stripe signature header
  const signature = request.headers.get('stripe-signature');

  // Verify signature
  const verification = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!verification.valid) {
    console.error('[Stripe Webhook] Signature verification failed:', verification.error);
    return NextResponse.json(
      { error: verification.error },
      { status: 400 }
    );
  }

  // Parse the event
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    console.error('[Stripe Webhook] Invalid JSON body:', error);
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (process.env.NODE_ENV !== 'production') console.log('[Stripe Webhook] Received event:', event.type);

  // Handle the event
  try {
    await BillingService.handleWebhookEvent(event);
  } catch (processingError) {
    console.error('[Stripe Webhook] Processing error:', processingError);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }

  if (process.env.NODE_ENV !== 'production') console.log('[Stripe Webhook] Event processed successfully:', event.type);
  return NextResponse.json({ received: true });
}

/**
 * GET /api/webhooks/stripe
 * Health check and webhook info
 */
export async function GET() {
  const isConfigured = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

  return NextResponse.json({
    status: 'ok',
    webhook: 'stripe',
    configured: isConfigured,
    supportedEvents: [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.created',
      'invoice.finalized',
      'invoice.paid',
      'invoice.payment_failed',
      'checkout.session.completed',
    ],
  });
}
