import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // All Stripe webhooks should use /api/webhooks/stripe which has signature verification.
  // This endpoint is deprecated.
  return NextResponse.json(
    { error: 'Deprecated. Configure your Stripe webhook to use /api/webhooks/stripe instead.' },
    { status: 410 }
  );
}
