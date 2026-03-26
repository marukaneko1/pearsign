/**
 * SendGrid Test API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Tests SendGrid connection for the current tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

/**
 * POST /api/settings/integrations/sendgrid/test
 * Test SendGrid connection for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { apiKey, fromEmail, fromName, toEmail } = body;

      if (!apiKey || !fromEmail) {
        return NextResponse.json(
          { success: false, error: "API Key and From Email are required" },
          { status: 400 }
        );
      }

      // Use toEmail if provided, otherwise send to fromEmail
      const recipientEmail = toEmail || fromEmail;

      console.log(`[SendGrid Test] Sending test email from ${fromEmail} to ${recipientEmail}`);

      // Send a test email using the provided credentials
      const testEmailHtml = `
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
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                SendGrid Connected!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.6;">
                Congratulations! Your SendGrid integration is working correctly.
              </p>
              <div style="background-color: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #166534;">
                  Configuration Details:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #15803d; font-size: 14px;">
                  <li>From Email: ${fromEmail}</li>
                  <li>From Name: ${fromName || "PearSign"}</li>
                </ul>
              </div>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                PearSign is now ready to send signature request emails, reminders, and completion notifications.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                This is a test email from PearSign.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      const sendGridPayload = {
        personalizations: [
          {
            to: [{ email: recipientEmail }],
          },
        ],
        from: {
          email: fromEmail,
          name: fromName || "PearSign",
        },
        subject: "PearSign - SendGrid Connection Test Successful!",
        content: [
          {
            type: "text/html",
            value: testEmailHtml,
          },
        ],
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendGridPayload),
      });

      if (response.ok || response.status === 202) {
        await sql`
          UPDATE integration_configs
          SET last_tested_at = NOW(), test_status = 'success'
          WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = 'sendgrid'
        `;

        return NextResponse.json({
          success: true,
          message: `Test email sent to ${recipientEmail}`,
        });
      }

      // Parse error response from SendGrid
      let errorMessage = `SendGrid error: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error("[SendGrid Test] Error response:", JSON.stringify(errorData, null, 2));

        if (errorData.errors && errorData.errors.length > 0) {
          errorMessage = errorData.errors.map((e: { message: string }) => e.message).join(", ");
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        const errorText = await response.text();
        console.error("[SendGrid Test] Error text:", errorText);
        if (errorText) {
          errorMessage = errorText;
        }
      }

      // Update test status as failed
      await sql`
        UPDATE integration_configs
        SET last_tested_at = NOW(), test_status = 'failed'
        WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId}) AND integration_type = 'sendgrid'
      `;

      // Provide helpful error messages based on status code
      if (response.status === 401) {
        errorMessage = "Invalid API Key. Please check your SendGrid API key.";
      } else if (response.status === 403) {
        errorMessage = "Access denied. Your API key may not have 'Mail Send' permissions.";
      } else if (response.status === 400) {
        errorMessage = `Bad request: ${errorMessage}. Make sure your sender email is verified in SendGrid.`;
      }

      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    } catch (error) {
      console.error("[SendGrid Test] Exception:", error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Connection failed" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageIntegrations'],
  }
);
