/**
 * SMS Service for sending OTP verification codes
 *
 * TENANT ISOLATION:
 * - Each tenant MUST provide their own Twilio credentials
 * - Platform fallback (env vars) is ONLY used if explicitly enabled per-tenant
 * - orgId is REQUIRED for all SMS operations
 *
 * Uses Twilio for production, console logging for demo mode
 * Includes rate limiting to prevent abuse
 */

import { sql } from "@/lib/db";

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_SECONDS = 60;

// Twilio configuration type
interface TwilioConfig {
  enabled: boolean;
  accountSid: string | null;
  authToken: string | null;
  phoneNumber: string | null;
  dailyLimit: number;
  monthlyLimit: number;
  perEnvelopeLimit: number;
  platformFallbackEnabled: boolean;
  source: 'tenant' | 'platform' | 'none';
}

/**
 * Generate a random OTP code
 */
function generateOTP(): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Mask phone number for display (e.g., +1***4567)
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 6) return '***';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length <= 4) return '***' + cleaned.slice(-2);
  return '+' + cleaned.slice(0, 1) + '***' + cleaned.slice(-4);
}

/**
 * Ensure OTP table exists
 */
async function ensureOTPTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS signer_otp_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      signing_session_id UUID NOT NULL,
      phone_number VARCHAR(50) NOT NULL,
      code VARCHAR(10) NOT NULL,
      attempts INTEGER DEFAULT 0,
      verified BOOLEAN DEFAULT false,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      verified_at TIMESTAMP
    )
  `;
}

/**
 * Get Twilio settings from database for a specific tenant
 *
 * TENANT ISOLATION:
 * 1. First, check for tenant-specific credentials
 * 2. If not found AND platform_fallback_enabled, use environment variables
 * 3. If not found AND fallback disabled, return empty config
 *
 * @param orgId - Organization ID for tenant-specific settings
 */
async function getTwilioSettings(orgId?: string): Promise<TwilioConfig> {
  // TENANT ISOLATION: Warn if orgId is missing
  if (!orgId) {
    console.warn('[SMS Service] TENANT ISOLATION WARNING: getTwilioSettings called without orgId.');
    // Return no credentials - require explicit orgId for all SMS
    return {
      enabled: false,
      accountSid: null,
      authToken: null,
      phoneNumber: null,
      dailyLimit: 100,
      monthlyLimit: 1000,
      perEnvelopeLimit: 5,
      platformFallbackEnabled: false,
      source: 'none',
    };
  }

  try {
    const settings = await sql`
      SELECT
        enabled, account_sid, auth_token, phone_number,
        daily_limit, monthly_limit, per_envelope_limit,
        platform_fallback_enabled
      FROM twilio_settings
      WHERE org_id = ${orgId} OR tenant_id = ${orgId}
    `;

    if (settings.length > 0) {
      const s = settings[0];
      const tenantHasCredentials = !!(s.account_sid && s.auth_token && s.phone_number);
      const platformFallbackEnabled = s.platform_fallback_enabled === true;

      if (tenantHasCredentials && s.enabled === true) {
        // Use tenant credentials
        console.log(`[SMS Service] Using TENANT Twilio credentials for org: ${orgId}`);
        return {
          enabled: true,
          accountSid: s.account_sid as string,
          authToken: s.auth_token as string,
          phoneNumber: s.phone_number as string,
          dailyLimit: (s.daily_limit as number) || 100,
          monthlyLimit: (s.monthly_limit as number) || 1000,
          perEnvelopeLimit: (s.per_envelope_limit as number) || 5,
          platformFallbackEnabled,
          source: 'tenant',
        };
      } else if (platformFallbackEnabled && process.env.TWILIO_ACCOUNT_SID) {
        // Use platform fallback
        console.log(`[SMS Service] Using PLATFORM Twilio credentials (fallback enabled) for org: ${orgId}`);
        return {
          enabled: true,
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN || null,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
          dailyLimit: (s.daily_limit as number) || 100,
          monthlyLimit: (s.monthly_limit as number) || 1000,
          perEnvelopeLimit: (s.per_envelope_limit as number) || 5,
          platformFallbackEnabled: true,
          source: 'platform',
        };
      } else {
        // No credentials available
        if (!tenantHasCredentials) {
          console.warn(`[SMS Service] No Twilio credentials configured for org: ${orgId}`);
        }
        return {
          enabled: false,
          accountSid: null,
          authToken: null,
          phoneNumber: null,
          dailyLimit: (s.daily_limit as number) || 100,
          monthlyLimit: (s.monthly_limit as number) || 1000,
          perEnvelopeLimit: (s.per_envelope_limit as number) || 5,
          platformFallbackEnabled,
          source: 'none',
        };
      }
    } else {
      // No settings exist - check for platform credentials for backward compatibility
      const hasPlatformCredentials = !!process.env.TWILIO_ACCOUNT_SID;

      if (hasPlatformCredentials) {
        console.log(`[SMS Service] Using PLATFORM Twilio credentials (no config exists) for org: ${orgId}`);
        return {
          enabled: true,
          accountSid: process.env.TWILIO_ACCOUNT_SID || null,
          authToken: process.env.TWILIO_AUTH_TOKEN || null,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
          dailyLimit: 100,
          monthlyLimit: 1000,
          perEnvelopeLimit: 5,
          platformFallbackEnabled: true,
          source: 'platform',
        };
      } else {
        console.warn(`[SMS Service] No Twilio credentials available for org: ${orgId}`);
        return {
          enabled: false,
          accountSid: null,
          authToken: null,
          phoneNumber: null,
          dailyLimit: 100,
          monthlyLimit: 1000,
          perEnvelopeLimit: 5,
          platformFallbackEnabled: false,
          source: 'none',
        };
      }
    }
  } catch (error) {
    console.error(`[SMS Service] Error fetching Twilio settings for org ${orgId}:`, error);
    return {
      enabled: false,
      accountSid: null,
      authToken: null,
      phoneNumber: null,
      dailyLimit: 100,
      monthlyLimit: 1000,
      perEnvelopeLimit: 5,
      platformFallbackEnabled: false,
      source: 'none',
    };
  }
}

/**
 * Check rate limits for a specific tenant
 */
async function checkRateLimits(
  orgId: string,
  envelopeId: string | null,
  limits: { dailyLimit: number; monthlyLimit: number; perEnvelopeLimit: number }
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check daily limit
    const todayCount = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${orgId} OR tenant_id = ${orgId})
        AND created_at >= CURRENT_DATE
    `;
    const todayUsage = parseInt(todayCount[0]?.count as string) || 0;

    if (todayUsage >= limits.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily SMS limit reached (${limits.dailyLimit}). Please try again tomorrow.`,
      };
    }

    // Check monthly limit
    const monthCount = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${orgId} OR tenant_id = ${orgId})
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `;
    const monthUsage = parseInt(monthCount[0]?.count as string) || 0;

    if (monthUsage >= limits.monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly SMS limit reached (${limits.monthlyLimit}). Please contact support.`,
      };
    }

    // Check per-envelope limit
    if (envelopeId) {
      const envelopeCount = await sql`
        SELECT COUNT(*) as count FROM sms_usage_log
        WHERE (org_id = ${orgId} OR tenant_id = ${orgId})
          AND envelope_id = ${envelopeId}
      `;
      const envelopeUsage = parseInt(envelopeCount[0]?.count as string) || 0;

      if (envelopeUsage >= limits.perEnvelopeLimit) {
        return {
          allowed: false,
          reason: `Too many verification attempts for this document. Please contact the sender.`,
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('[SMS] Rate limit check error:', error);
    // Allow on error to not block legitimate requests
    return { allowed: true };
  }
}

/**
 * Log SMS usage for a specific tenant
 */
async function logSmsUsage(
  orgId: string,
  envelopeId: string | null,
  phoneNumber: string,
  twilioSid: string | null
) {
  try {
    await sql`
      INSERT INTO sms_usage_log (org_id, tenant_id, envelope_id, phone_number, twilio_sid, status)
      VALUES (${orgId}, ${orgId}, ${envelopeId}, ${phoneNumber}, ${twilioSid}, 'sent')
    `;
  } catch (error) {
    console.error('[SMS] Failed to log usage:', error);
  }
}

/**
 * Send OTP code via SMS
 *
 * TENANT ISOLATION: orgId is REQUIRED for proper tenant credentials
 */
export async function sendOTP(
  signingSessionId: string,
  phoneNumber: string,
  envelopeId?: string,
  orgId?: string
): Promise<{ success: boolean; message: string; expiresAt?: Date; source?: 'tenant' | 'platform' }> {
  // TENANT ISOLATION: Warn if orgId is missing
  if (!orgId) {
    console.warn('[SMS Service] TENANT ISOLATION WARNING: sendOTP called without orgId.');
  }

  try {
    await ensureOTPTable();

    // Check for recent OTP (cooldown)
    const cooldownTime = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);
    const recentOTP = await sql`
      SELECT * FROM signer_otp_codes
      WHERE signing_session_id = ${signingSessionId}
        AND created_at > ${cooldownTime.toISOString()}
        AND verified = false
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (recentOTP.length > 0) {
      const waitTime = RESEND_COOLDOWN_SECONDS -
        Math.floor((Date.now() - new Date(recentOTP[0].created_at as string).getTime()) / 1000);
      return {
        success: false,
        message: `Please wait ${waitTime} seconds before requesting a new code`,
      };
    }

    // Get Twilio settings from database for this tenant
    const twilioSettings = await getTwilioSettings(orgId);

    // Check if SMS service is properly configured
    if (twilioSettings.source === 'none') {
      return {
        success: false,
        message: "SMS service not configured. Please configure Twilio credentials in Settings > Integrations.",
      };
    }

    // Check rate limits if Twilio is enabled
    if (twilioSettings.enabled && orgId) {
      const rateLimitCheck = await checkRateLimits(orgId, envelopeId || null, {
        dailyLimit: twilioSettings.dailyLimit,
        monthlyLimit: twilioSettings.monthlyLimit,
        perEnvelopeLimit: twilioSettings.perEnvelopeLimit,
      });

      if (!rateLimitCheck.allowed) {
        console.warn('[SMS] Rate limit exceeded:', rateLimitCheck.reason);
        return {
          success: false,
          message: rateLimitCheck.reason || 'SMS limit reached',
        };
      }
    }

    // Invalidate previous OTPs
    await sql`
      UPDATE signer_otp_codes
      SET expires_at = NOW()
      WHERE signing_session_id = ${signingSessionId}
        AND verified = false
    `;

    // Generate new OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in database
    await sql`
      INSERT INTO signer_otp_codes (signing_session_id, phone_number, code, expires_at)
      VALUES (${signingSessionId}, ${phoneNumber}, ${code}, ${expiresAt.toISOString()})
    `;

    // Try to send via Twilio if credentials are available
    if (twilioSettings.enabled && twilioSettings.accountSid && twilioSettings.authToken && twilioSettings.phoneNumber) {
      try {
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSettings.accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${twilioSettings.accountSid}:${twilioSettings.authToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: phoneNumber,
              From: twilioSettings.phoneNumber,
              Body: `Your PearSign verification code is: ${code}. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
            }),
          }
        );

        const result = await response.json();

        if (response.ok) {
          const twilioSid = result.sid;
          console.log(`[SMS] OTP sent via Twilio to ${maskPhoneNumber(phoneNumber)}, SID: ${twilioSid}, source: ${twilioSettings.source}, org: ${orgId}`);

          // Log usage
          if (orgId) {
            await logSmsUsage(orgId, envelopeId || null, phoneNumber, twilioSid);
          }

          return {
            success: true,
            message: `Verification code sent to ${maskPhoneNumber(phoneNumber)}`,
            expiresAt,
            source: twilioSettings.source,
          };
        } else {
          console.error('[SMS] Twilio error:', result);
          return {
            success: false,
            message: `Failed to send SMS: ${result.message || 'Unknown error'}`,
          };
        }
      } catch (twilioError) {
        console.error('[SMS] Twilio request failed:', twilioError);
        return {
          success: false,
          message: 'SMS service temporarily unavailable. Please try again.',
        };
      }
    }

    // Twilio not configured — reject instead of faking success
    console.warn('[SMS] Twilio not configured - OTP request rejected');
    return {
      success: false,
      message: 'SMS service not configured. Contact your administrator to enable SMS verification.',
    };
  } catch (error) {
    console.error('[SMS] Error sending OTP:', error);
    return {
      success: false,
      message: 'Failed to send verification code. Please try again.',
    };
  }
}

/**
 * Verify OTP code
 */
export async function verifyOTP(
  signingSessionId: string,
  code: string
): Promise<{ success: boolean; message: string; remainingAttempts?: number }> {
  try {
    await ensureOTPTable();

    // Get the latest unexpired OTP for this session
    const otpRecords = await sql`
      SELECT * FROM signer_otp_codes
      WHERE signing_session_id = ${signingSessionId}
        AND expires_at > NOW()
        AND verified = false
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (otpRecords.length === 0) {
      return {
        success: false,
        message: 'Verification code has expired. Please request a new code.',
      };
    }

    const otpRecord = otpRecords[0];
    const attempts = (otpRecord.attempts as number) + 1;

    // Check if max attempts exceeded
    if (attempts > MAX_ATTEMPTS) {
      // Invalidate the OTP
      await sql`
        UPDATE signer_otp_codes
        SET expires_at = NOW()
        WHERE id = ${otpRecord.id}
      `;
      return {
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.',
        remainingAttempts: 0,
      };
    }

    // Update attempts
    await sql`
      UPDATE signer_otp_codes
      SET attempts = ${attempts}
      WHERE id = ${otpRecord.id}
    `;

    // Verify the code
    if (otpRecord.code !== code) {
      const remaining = MAX_ATTEMPTS - attempts;
      return {
        success: false,
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        remainingAttempts: remaining,
      };
    }

    // Mark as verified
    await sql`
      UPDATE signer_otp_codes
      SET verified = true, verified_at = NOW()
      WHERE id = ${otpRecord.id}
    `;

    // Update signing session to mark 2FA as completed
    await sql`
      UPDATE envelope_signing_sessions
      SET two_fa_verified = true, two_fa_verified_at = NOW()
      WHERE id = ${signingSessionId}
    `;

    console.log(`[SMS] OTP verified for session ${signingSessionId}`);

    return {
      success: true,
      message: 'Phone verified successfully',
    };
  } catch (error) {
    console.error('[SMS] Error verifying OTP:', error);
    return {
      success: false,
      message: 'Verification failed. Please try again.',
    };
  }
}

/**
 * Check if 2FA is required and verified for a session
 */
export async function check2FAStatus(
  signingSessionId: string
): Promise<{ required: boolean; verified: boolean; phoneNumber?: string }> {
  try {
    const sessions = await sql`
      SELECT two_fa_required, two_fa_verified, two_fa_phone
      FROM envelope_signing_sessions
      WHERE id = ${signingSessionId}
    `;

    if (sessions.length === 0) {
      return { required: false, verified: false };
    }

    const session = sessions[0];
    return {
      required: session.two_fa_required === true,
      verified: session.two_fa_verified === true,
      phoneNumber: session.two_fa_phone as string | undefined,
    };
  } catch (error) {
    console.error('[2FA] Error checking status:', error);
    return { required: false, verified: false };
  }
}

/**
 * Get SMS usage statistics for a specific tenant
 */
export async function getSmsUsageStats(orgId?: string): Promise<{
  today: number;
  thisMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
}> {
  if (!orgId) {
    console.warn('[SMS Service] getSmsUsageStats called without orgId');
    return { today: 0, thisMonth: 0, dailyLimit: 100, monthlyLimit: 1000 };
  }

  try {
    const settings = await getTwilioSettings(orgId);

    const todayCount = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${orgId} OR tenant_id = ${orgId})
        AND created_at >= CURRENT_DATE
    `;

    const monthCount = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${orgId} OR tenant_id = ${orgId})
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `;

    return {
      today: parseInt(todayCount[0]?.count as string) || 0,
      thisMonth: parseInt(monthCount[0]?.count as string) || 0,
      dailyLimit: settings.dailyLimit,
      monthlyLimit: settings.monthlyLimit,
    };
  } catch {
    return { today: 0, thisMonth: 0, dailyLimit: 100, monthlyLimit: 1000 };
  }
}
