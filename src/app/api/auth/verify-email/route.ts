/**
 * Verify Email API Route
 *
 * GET /api/auth/verify-email?token=xxx - Verify email with token
 * POST /api/auth/verify-email - Resend verification email
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Verification token is required' },
        { status: 400 }
      );
    }

    // Initialize tables if needed
    await initializeAuthTables();

    // Verify email
    const result = await AuthService.verifyEmail(token);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
    });
  } catch (error) {
    console.error('[Auth/VerifyEmail] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during verification' },
      { status: 500 }
    );
  }
}

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

    // Initialize tables if needed
    await initializeAuthTables();

    // Resend verification email
    const result = await AuthService.resendVerificationEmail(email);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    if (result.token) {
      // Send verification email
      try {
        const origin = request.headers.get('origin') ||
                       request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       'http://localhost:3000';

        const verifyUrl = `${origin}/verify-email?token=${result.token}`;

        const { sendEmail } = await import('@/lib/email-service');

        await sendEmail({
          to: email,
          subject: 'Verify your PearSign email',
          htmlContent: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); padding: 32px; text-align: center;">
                          <div style="width: 56px; height: 56px; background-color: rgba(255,255,255,0.2); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                            <span style="color: white; font-size: 28px; font-weight: bold;">P</span>
                          </div>
                          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Verify Your Email</h1>
                        </td>
                      </tr>

                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 32px;">
                          <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 24px 0;">
                            Thanks for signing up for PearSign! Please verify your email address to complete your registration.
                          </p>

                          <div style="text-align: center; margin: 32px 0;">
                            <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                              Verify Email Address
                            </a>
                          </div>

                          <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 24px;">
                            <p style="color: #6b7280; font-size: 12px; line-height: 18px; margin: 0;">
                              If the button doesn't work, copy and paste this link into your browser:<br>
                              <a href="${verifyUrl}" style="color: #2464ea; word-break: break-all;">${verifyUrl}</a>
                            </p>
                          </div>
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
                          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} PearSign. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          textContent: `Verify your PearSign email\n\nThanks for signing up! Please verify your email address by visiting:\n\n${verifyUrl}`,
        });

        console.log('[Auth/VerifyEmail] Verification email sent to:', email);
      } catch (emailError) {
        console.error('[Auth/VerifyEmail] Failed to send email:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('[Auth/VerifyEmail] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
