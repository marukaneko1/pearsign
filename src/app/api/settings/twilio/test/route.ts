/**
 * Twilio Test API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Tests Twilio credentials by sending a test SMS
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * POST /api/settings/twilio/test
 * Test Twilio connection for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { testPhone } = body;

      if (!testPhone) {
        return NextResponse.json(
          { success: false, error: "Test phone number is required" },
          { status: 400 }
        );
      }

      // Get Twilio settings from database for this tenant
      const settings = await sql`
        SELECT account_sid, auth_token, phone_number
        FROM twilio_settings
        WHERE org_id = ${tenantId} OR tenant_id = ${tenantId}
      `;

      if (settings.length === 0 || !settings[0].account_sid) {
        return NextResponse.json(
          { success: false, error: "Twilio credentials not configured" },
          { status: 400 }
        );
      }

      const { account_sid, auth_token, phone_number } = settings[0];

      if (!account_sid || !auth_token || !phone_number) {
        return NextResponse.json(
          { success: false, error: "Incomplete Twilio configuration" },
          { status: 400 }
        );
      }

      // Send test SMS via Twilio
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${account_sid}:${auth_token}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: testPhone,
            From: phone_number as string,
            Body: "PearSign Test: Your Twilio integration is working correctly! This is a test message.",
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        console.log("[Twilio Test] SMS sent successfully:", result.sid);
        return NextResponse.json({
          success: true,
          message: `Test SMS sent to ${testPhone}`,
          sid: result.sid,
        });
      } else {
        console.error("[Twilio Test] Failed:", result);
        return NextResponse.json({
          success: false,
          error: result.message || "Failed to send test SMS",
          code: result.code,
        });
      }
    } catch (error) {
      console.error("[Twilio Test] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to test Twilio connection" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
