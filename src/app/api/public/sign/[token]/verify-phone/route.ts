/**
 * Phone Verification API for 2FA
 * POST: Send OTP code
 * PUT: Verify OTP code
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOTP, verifyOTP, maskPhoneNumber } from "@/lib/sms-service";
import { logEnvelopeEvent } from "@/lib/audit-log";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Parse signing token
function parseSigningToken(token: string): { envelopeId: string; tokenPart: string } | null {
  const parts = token.split('_');
  if (parts.length < 2) return null;
  return {
    envelopeId: parts[0],
    tokenPart: parts.slice(1).join('_'),
  };
}

/**
 * POST /api/public/sign/[token]/verify-phone
 * Send OTP code to signer's phone
 */
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const tokenData = parseSigningToken(token);

    if (!tokenData) {
      return NextResponse.json(
        { success: false, error: "Invalid signing link" },
        { status: 400 }
      );
    }

    // Get signing session
    const sessions = await sql`
      SELECT id, recipient_name, recipient_email, two_fa_required, two_fa_phone, two_fa_verified, org_id
      FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Signing session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    if (!session.two_fa_required) {
      return NextResponse.json(
        { success: false, error: "Phone verification not required for this document" },
        { status: 400 }
      );
    }

    if (session.two_fa_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: "Phone already verified",
      });
    }

    const phoneNumber = session.two_fa_phone as string;
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "No phone number configured for verification" },
        { status: 400 }
      );
    }

    // Send OTP with envelope ID for rate limiting and orgId for tenant isolation
    const orgId = session.org_id as string;
    const result = await sendOTP(session.id as string, phoneNumber, tokenData.envelopeId, orgId);

    if (result.success) {
      // Log the event
      await logEnvelopeEvent('envelope.2fa_code_sent', {
        orgId: session.org_id as string,
        envelopeId: tokenData.envelopeId,
        actorName: session.recipient_name as string,
        actorEmail: session.recipient_email as string,
        details: {
          phoneNumber: maskPhoneNumber(phoneNumber),
        },
      });
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      expiresAt: result.expiresAt?.toISOString(),
      maskedPhone: maskPhoneNumber(phoneNumber),
    });
  } catch (error) {
    console.error("[Verify Phone] Error sending OTP:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/public/sign/[token]/verify-phone
 * Verify OTP code
 */
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { code } = body;

    const tokenData = parseSigningToken(token);

    if (!tokenData) {
      return NextResponse.json(
        { success: false, error: "Invalid signing link" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: "Verification code is required" },
        { status: 400 }
      );
    }

    // Get signing session
    const sessions = await sql`
      SELECT id, recipient_name, recipient_email, two_fa_required, two_fa_phone, two_fa_verified, org_id
      FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Signing session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    if (!session.two_fa_required) {
      return NextResponse.json(
        { success: false, error: "Phone verification not required for this document" },
        { status: 400 }
      );
    }

    if (session.two_fa_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: "Phone already verified",
      });
    }

    // Verify OTP
    const result = await verifyOTP(session.id as string, code.trim());

    if (result.success) {
      // Log successful verification
      await logEnvelopeEvent('envelope.2fa_verified', {
        orgId: session.org_id as string,
        envelopeId: tokenData.envelopeId,
        actorName: session.recipient_name as string,
        actorEmail: session.recipient_email as string,
        details: {
          phoneNumber: maskPhoneNumber(session.two_fa_phone as string),
          verifiedAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: result.success,
      verified: result.success,
      message: result.message,
      remainingAttempts: result.remainingAttempts,
    });
  } catch (error) {
    console.error("[Verify Phone] Error verifying OTP:", error);
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/public/sign/[token]/verify-phone
 * Check 2FA status
 */
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    // Get signing session
    const sessions = await sql`
      SELECT two_fa_required, two_fa_verified, two_fa_phone
      FROM envelope_signing_sessions
      WHERE token = ${token}
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Signing session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    return NextResponse.json({
      success: true,
      required: session.two_fa_required === true,
      verified: session.two_fa_verified === true,
      maskedPhone: session.two_fa_phone ? maskPhoneNumber(session.two_fa_phone as string) : null,
    });
  } catch (error) {
    console.error("[Verify Phone] Error checking status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check verification status" },
      { status: 500 }
    );
  }
}
