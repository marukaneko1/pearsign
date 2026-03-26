/**
 * Forgot Password API Route
 *
 * POST /api/auth/forgot-password
 * Sends a password reset email
 *
 * Security features:
 * - Rate limiting to prevent abuse
 * - Same response for valid/invalid emails (prevents enumeration)
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';
import {
  checkPasswordResetRateLimit,
  recordPasswordResetAttempt,
  getClientIP,
  getRateLimitHeaders,
} from '@/lib/auth-rate-limiter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkPasswordResetRateLimit(clientIP, email);

    if (!rateLimitResult.allowed) {
      console.log('[Auth/ForgotPassword] Rate limited:', email, 'IP:', clientIP);
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...getRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    // Record the attempt (before we know if email is valid - prevents timing attacks)
    recordPasswordResetAttempt(clientIP, email);

    // Initialize tables if needed
    await initializeAuthTables();

    // Request password reset
    const result = await AuthService.requestPasswordReset(email);

    if (result.success && result.token) {
      // Send password reset email
      try {
        // Get base URL from request
        const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
        const origin = request.headers.get('origin') ||
                       request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       (replitDomain ? `https://${replitDomain}` : 'http://localhost:3000');

        const resetUrl = `${origin}/reset-password?token=${result.token}`;

        const { sendEmail } = await import('@/lib/email-service');

        const emailResult = await sendEmail({
          to: email,
          subject: 'Reset your password',
          htmlContent: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Reset Your Password</h1>
              </div>
              <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: 0;">
                <p style="color: #374151; font-size: 16px; line-height: 24px;">
                  We received a request to reset your password. Click the button below to create a new one:
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${resetUrl}" style="background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Reset Password</a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
                <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy this link: <a href="${resetUrl}" style="color: #10b981; word-break: break-all;">${resetUrl}</a></p>
              </div>
            </div>
          `,
          textContent: `Reset your password\n\nVisit this link to create a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
        });

        if (emailResult.success) {
          console.log('[Auth/ForgotPassword] Reset email sent to:', email);
        } else {
          console.error('[Auth/ForgotPassword] Reset email FAILED for:', email, emailResult.error);
        }
      } catch (emailError) {
        console.error('[Auth/ForgotPassword] Failed to send email:', emailError);
        // Don't fail the request - user can still use the token
      }
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, we sent a password reset link.',
    });
  } catch (error) {
    console.error('[Auth/ForgotPassword] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
