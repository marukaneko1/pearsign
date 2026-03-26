/**
 * Test Email API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Sends a test email using a template with sample data
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-service";
import { sql } from "@/lib/db";
import { renderTemplate, type BrandingTokens } from "@/lib/email-templates";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Sample variable values for test emails
const sampleVariables: Record<string, string> = {
  recipientName: "Jane Smith",
  senderName: "John Doe",
  senderEmail: "john.doe@example.com",
  documentTitle: "Employment Agreement",
  message: "Please review and sign this document at your earliest convenience.",
  signingUrl: "https://sign.pearsign.com/s/abc123",
  downloadUrl: "https://sign.pearsign.com/d/abc123",
  expirationDate: "January 15, 2026",
  daysRemaining: "3",
  signedDate: "December 31, 2025 at 2:30 PM",
  signerName: "Jane Smith",
  signerEmail: "jane.smith@example.com",
  voidReason: "The document terms have been updated. A new version will be sent.",
  expiredDate: "December 25, 2025",
  inviterName: "John Doe",
  organizationName: "Acme Corporation",
  role: "Editor",
  inviteUrl: "https://app.pearsign.com/invite/xyz789",
  userName: "Jane Smith",
  userEmail: "jane.smith@example.com",
  reminderNumber: "2",
  dashboardUrl: "https://app.pearsign.com",
};

async function getBranding(tenantId: string): Promise<BrandingTokens> {
  try {
    const result = await sql`
      SELECT
        logo_url as "logoUrl",
        primary_color as "primaryColor",
        accent_color as "accentColor",
        product_name as "productName",
        support_email as "supportEmail",
        footer_text as "footerText"
      FROM branding_settings
      WHERE organization_id = ${tenantId}
    `;

    if (result.length > 0) {
      return {
        logoUrl: result[0].logoUrl || null,
        primaryColor: result[0].primaryColor || '#2563eb',
        accentColor: result[0].accentColor || '#1d4ed8',
        productName: result[0].productName || 'PearSign',
        supportEmail: result[0].supportEmail || 'support@pearsign.com',
        footerText: result[0].footerText || `© ${new Date().getFullYear()} PearSign. All rights reserved.`,
      };
    }
  } catch (error) {
    console.error("Error fetching branding:", error);
  }

  return {
    logoUrl: null,
    primaryColor: '#2563eb',
    accentColor: '#1d4ed8',
    productName: 'PearSign',
    supportEmail: 'support@pearsign.com',
    footerText: `© ${new Date().getFullYear()} PearSign. All rights reserved.`,
  };
}

/**
 * POST /api/settings/email-templates/test
 * Send a test email for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { toEmail, templateName, subject, htmlBody } = body;

      if (!toEmail || !subject || !htmlBody) {
        return NextResponse.json(
          { success: false, error: "Missing required fields" },
          { status: 400 }
        );
      }

      // Get branding for this tenant
      const branding = await getBranding(tenantId);

      // Render template with sample variables and branding
      const processedSubject = renderTemplate(subject, sampleVariables, branding);
      const processedBody = renderTemplate(htmlBody, sampleVariables, branding);

      // Send the test email
      const result = await sendEmail({
        to: toEmail,
        subject: `[TEST] ${processedSubject}`,
        htmlContent: processedBody,
        textContent: `This is a test email for the "${templateName}" template.\n\nTo see the full email, please view this in an HTML-capable email client.`,
      });

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Test email sent to ${toEmail}`,
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to send email" },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("[Test Email API] Error:", error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Failed to send test email" },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
