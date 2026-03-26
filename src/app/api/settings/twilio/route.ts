/**
 * Twilio Settings API
 * Manages Twilio configuration and SMS rate limits
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated Twilio credentials
 *
 * TENANT ISOLATION: Each tenant must configure their own Twilio credentials.
 * Platform fallback can be enabled per-tenant for backward compatibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Ensure settings table exists with all required columns
async function ensureTwilioSettingsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS twilio_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) UNIQUE NOT NULL,
      tenant_id VARCHAR(255),
      account_sid VARCHAR(255),
      auth_token VARCHAR(255),
      phone_number VARCHAR(50),
      enabled BOOLEAN DEFAULT false,
      platform_fallback_enabled BOOLEAN DEFAULT false,
      daily_limit INTEGER DEFAULT 100,
      monthly_limit INTEGER DEFAULT 1000,
      per_envelope_limit INTEGER DEFAULT 5,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add columns if they don't exist (for existing installations)
  try {
    await sql`
      ALTER TABLE twilio_settings
      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)
    `;
    await sql`
      ALTER TABLE twilio_settings
      ADD COLUMN IF NOT EXISTS platform_fallback_enabled BOOLEAN DEFAULT false
    `;
  } catch {
    // Columns might already exist
  }

  // SMS usage tracking table with tenant_id
  await sql`
    CREATE TABLE IF NOT EXISTS sms_usage_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255),
      envelope_id VARCHAR(255),
      phone_number VARCHAR(50) NOT NULL,
      message_type VARCHAR(50) DEFAULT 'otp',
      twilio_sid VARCHAR(255),
      status VARCHAR(50) DEFAULT 'sent',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

// Mask secret for display (show first 4 and last 4 chars)
function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}

/**
 * GET /api/settings/twilio
 * Fetch Twilio settings for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    await ensureTwilioSettingsTable();

    const settings = await sql`
      SELECT
        account_sid,
        auth_token,
        phone_number,
        enabled,
        platform_fallback_enabled,
        daily_limit,
        monthly_limit,
        per_envelope_limit,
        updated_at
      FROM twilio_settings
      WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
    `;

    if (settings.length === 0) {
      return NextResponse.json({
        success: true,
        settings: {
          accountSid: "",
          authToken: "",
          phoneNumber: "",
          enabled: false,
          platformFallbackEnabled: false,
          hasCredentials: false,
          status: "not_configured",
          dailyLimit: 100,
          monthlyLimit: 1000,
          perEnvelopeLimit: 5,
        },
        usage: {
          today: 0,
          thisMonth: 0,
        },
      });
    }

    const s = settings[0];
    const hasCredentials = !!(s.account_sid && s.auth_token && s.phone_number);

    // Determine status
    let status: "connected" | "not_configured" | "pending" = "not_configured";
    if (hasCredentials && s.enabled) {
      status = "connected";
    } else if (hasCredentials) {
      status = "pending"; // Has credentials but not enabled
    }

    // Get usage stats for this tenant
    const todayUsage = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId})
        AND created_at >= CURRENT_DATE
    `;

    const monthUsage = await sql`
      SELECT COUNT(*) as count FROM sms_usage_log
      WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId})
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `;

    return NextResponse.json({
      success: true,
      settings: {
        accountSid: s.account_sid ? maskSecret(s.account_sid as string) : "",
        authToken: s.auth_token ? "••••••••••••••••" : "",
        phoneNumber: s.phone_number || "",
        enabled: s.enabled || false,
        platformFallbackEnabled: s.platform_fallback_enabled || false,
        hasCredentials,
        status,
        dailyLimit: s.daily_limit || 100,
        monthlyLimit: s.monthly_limit || 1000,
        perEnvelopeLimit: s.per_envelope_limit || 5,
      },
      usage: {
        today: parseInt(todayUsage[0]?.count as string) || 0,
        thisMonth: parseInt(monthUsage[0]?.count as string) || 0,
      },
    });
  } catch (error) {
    console.error("[Twilio Settings] Error fetching:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/settings/twilio
 * Save Twilio settings for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await ensureTwilioSettingsTable();

      const body = await request.json();
      const {
        accountSid,
        authToken,
        phoneNumber,
        enabled,
        platformFallbackEnabled,
        dailyLimit,
        monthlyLimit,
        perEnvelopeLimit,
      } = body;

      // Validate limits
      const validDailyLimit = Math.min(Math.max(parseInt(dailyLimit) || 100, 1), 10000);
      const validMonthlyLimit = Math.min(Math.max(parseInt(monthlyLimit) || 1000, 1), 100000);
      const validPerEnvelopeLimit = Math.min(Math.max(parseInt(perEnvelopeLimit) || 5, 1), 20);

      // Check if settings exist for this tenant
      const existing = await sql`
        SELECT id, account_sid, auth_token FROM twilio_settings
        WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
      `;

      if (existing.length === 0) {
        // Insert new settings for this tenant
        await sql`
          INSERT INTO twilio_settings (
            org_id, tenant_id, account_sid, auth_token, phone_number, enabled,
            platform_fallback_enabled, daily_limit, monthly_limit, per_envelope_limit
          ) VALUES (
            ${tenantId},
            ${tenantId},
            ${accountSid || null},
            ${authToken || null},
            ${phoneNumber || null},
            ${enabled || false},
            ${platformFallbackEnabled || false},
            ${validDailyLimit},
            ${validMonthlyLimit},
            ${validPerEnvelopeLimit}
          )
        `;
      } else {
        // Update existing - only update credentials if new values provided
        const currentSid = existing[0].account_sid;
        const currentToken = existing[0].auth_token;

        // Don't overwrite with empty or masked values
        const newSid = accountSid && !accountSid.includes("••") ? accountSid : currentSid;
        const newToken = authToken && !authToken.includes("••") ? authToken : currentToken;

        await sql`
          UPDATE twilio_settings
          SET
            account_sid = ${newSid},
            auth_token = ${newToken},
            phone_number = ${phoneNumber || null},
            enabled = ${enabled || false},
            platform_fallback_enabled = ${platformFallbackEnabled || false},
            daily_limit = ${validDailyLimit},
            monthly_limit = ${validMonthlyLimit},
            per_envelope_limit = ${validPerEnvelopeLimit},
            tenant_id = ${tenantId},
            updated_at = NOW()
          WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
        `;
      }

      console.log(`[Twilio Settings] Settings saved for tenant: ${tenantId}, enabled: ${enabled}, fallback: ${platformFallbackEnabled}`);

      return NextResponse.json({
        success: true,
        message: "Twilio settings saved successfully",
      });
    } catch (error) {
      console.error("[Twilio Settings] Error saving:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save settings" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);

/**
 * DELETE /api/settings/twilio
 * Remove Twilio settings for the current tenant
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await sql`
        DELETE FROM twilio_settings
        WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
      `;

      return NextResponse.json({
        success: true,
        message: "Twilio settings removed",
      });
    } catch (error) {
      console.error("[Twilio Settings] Error deleting:", error);
      return NextResponse.json(
        { success: false, error: "Failed to remove settings" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
