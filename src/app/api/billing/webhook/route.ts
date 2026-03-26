/**
 * Stripe Webhook Endpoint
 *
 * Handles incoming Stripe webhook events for:
 * - Subscription changes
 * - Invoice payments
 * - Payment failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { BillingService } from '@/lib/billing-service';

// Stripe webhook secret for signature verification
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    // In production, verify the webhook signature
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);

    // For demo, parse the body directly
    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Log the event
    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle the event
    await BillingService.handleWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Disable body parsing for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
