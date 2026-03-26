/**
 * Organization Invite API
 *
 * Admin endpoint for inviting new organizations (tenants).
 * - Create and send org invite emails
 * - List pending invites
 * - Resend/cancel invites
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  OrganizationInviteService,
  logAdminAction,
  initializeAdminTables
} from '@/lib/admin-tenant-service';
import { TenantPlan } from '@/lib/tenant';
import { sendEmail } from '@/lib/email-service';

// ============== AUTH HELPER ==============

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

function getClientInfo(request: NextRequest): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

// ============== ORG INVITE EMAIL ==============

async function sendOrganizationInviteEmail(data: {
  recipientEmail: string;
  recipientName?: string;
  organizationName: string;
  inviteUrl: string;
  expiresAt: string;
  plan: string;
}): Promise<{ success: boolean; error?: string }> {
  const expirationDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organization Invite</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Welcome to PearSign</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">You've been invited to create your organization</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">
                Hello${data.recipientName ? ` ${data.recipientName}` : ''},
              </p>

              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                You've been invited to create and manage <strong style="color: #10b981;">${data.organizationName}</strong> on PearSign.
              </p>

              <!-- Plan Badge -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #166534;">
                  <strong>Your Plan:</strong> ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}
                </p>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                As the organization owner, you'll be able to:
              </p>

              <ul style="margin: 0 0 24px 0; padding-left: 24px; color: #374151; line-height: 1.8;">
                <li>Send documents for electronic signature</li>
                <li>Create templates and automate workflows</li>
                <li>Invite team members to collaborate</li>
                <li>Manage settings and integrations</li>
                <li>Track document status and audit trails</li>
              </ul>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${data.inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                      Activate Your Organization
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                This invitation expires on ${expirationDate}
              </p>

              <!-- Link fallback -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                  If the button doesn't work, copy and paste this URL:
                </p>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #10b981; word-break: break-all;">
                  ${data.inviteUrl}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #6b7280;">
                © ${new Date().getFullYear()} PearSign. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                If you didn't expect this invitation, you can safely ignore this email.
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

  const textContent = `
Welcome to PearSign!

Hello${data.recipientName ? ` ${data.recipientName}` : ''},

You've been invited to create and manage ${data.organizationName} on PearSign.

Your Plan: ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}

As the organization owner, you'll be able to:
- Send documents for electronic signature
- Create templates and automate workflows
- Invite team members to collaborate
- Manage settings and integrations
- Track document status and audit trails

Click here to activate your organization:
${data.inviteUrl}

This invitation expires on ${expirationDate}.

If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} PearSign. All rights reserved.
`;

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject: `You're invited to create ${data.organizationName} on PearSign`,
    htmlContent,
    textContent,
  });
}

// ============== API HANDLERS ==============

/**
 * GET /api/admin/tenants/invite
 * List pending organization invites
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    // Initialize tables if needed
    await initializeAdminTables();

    const invites = await OrganizationInviteService.getPendingInvites();

    return NextResponse.json({
      success: true,
      invites: invites.map(inv => ({
        ...inv,
        token: inv.token,
        allowedDomain: inv.allowedDomain,
      })),
      count: invites.length,
    });
  } catch (error) {
    console.error('[OrgInvite] Error fetching invites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants/invite
 * Create and send organization invite
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      organizationName,
      ownerEmail,
      ownerName,
      allowedDomain,
      plan = 'free',
      expirationDays = 30,
    } = body;

    if (!organizationName || !ownerEmail) {
      return NextResponse.json(
        { error: 'Organization name and owner email are required' },
        { status: 400 }
      );
    }

    // Validate plan
    if (!['free', 'starter', 'professional', 'enterprise'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be one of: free, starter, professional, enterprise' },
        { status: 400 }
      );
    }

    // Initialize tables if needed
    await initializeAdminTables();

    const invite = await OrganizationInviteService.createInvite({
      tenantName: organizationName,
      ownerEmail,
      ownerName,
      allowedDomain,
      plan: plan as TenantPlan,
      invitedBy: 'admin',
      expirationDays,
    });

    const origin = request.headers.get('origin') || request.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    // Send email
    const emailResult = await sendOrganizationInviteEmail({
      recipientEmail: ownerEmail,
      recipientName: ownerName,
      organizationName,
      inviteUrl,
      expiresAt: invite.expiresAt,
      plan,
    });

    // Log admin action
    const clientInfo = getClientInfo(request);
    await logAdminAction({
      adminId: 'admin',
      action: 'create_org_invite',
      targetType: 'invite',
      targetId: invite.id,
      details: {
        organizationName,
        ownerEmail,
        plan,
        emailSent: emailResult.success,
      },
      ...clientInfo,
    });

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        tenantName: invite.tenantName,
        ownerEmail: invite.ownerEmail,
        allowedDomain: invite.allowedDomain,
        status: invite.status,
        expiresAt: invite.expiresAt,
        inviteUrl,
      },
      emailSent: emailResult.success,
      emailError: emailResult.error,
    });
  } catch (error) {
    console.error('[OrgInvite] Error creating invite:', error);
    return NextResponse.json(
      { error: 'Failed to create invite', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tenants/invite
 * Resend or cancel invite
 */
export async function PUT(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { inviteId, action } = body;

    if (!inviteId || !action) {
      return NextResponse.json(
        { error: 'Invite ID and action are required' },
        { status: 400 }
      );
    }

    const clientInfo = getClientInfo(request);

    switch (action) {
      case 'resend': {
        const newInvite = await OrganizationInviteService.resendInvite(inviteId, 'admin');

        // Generate invite URL - use origin from request or fallback
        const origin = request.headers.get('origin') || request.headers.get('referer')?.split('/').slice(0, 3).join('/');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin || 'http://localhost:3000';
        const inviteUrl = `${baseUrl}/invite/${newInvite.token}`;

        // Send email
        const emailResult = await sendOrganizationInviteEmail({
          recipientEmail: newInvite.ownerEmail,
          recipientName: newInvite.ownerName,
          organizationName: newInvite.tenantName,
          inviteUrl,
          expiresAt: newInvite.expiresAt,
          plan: newInvite.plan,
        });

        await logAdminAction({
          adminId: 'admin',
          action: 'resend_org_invite',
          targetType: 'invite',
          targetId: newInvite.id,
          details: {
            originalInviteId: inviteId,
            emailSent: emailResult.success,
          },
          ...clientInfo,
        });

        return NextResponse.json({
          success: true,
          message: 'Invite resent successfully',
          invite: {
            id: newInvite.id,
            tenantName: newInvite.tenantName,
            ownerEmail: newInvite.ownerEmail,
            expiresAt: newInvite.expiresAt,
            inviteUrl,
          },
          emailSent: emailResult.success,
        });
      }

      case 'cancel': {
        await OrganizationInviteService.cancelInvite(inviteId);

        await logAdminAction({
          adminId: 'admin',
          action: 'cancel_org_invite',
          targetType: 'invite',
          targetId: inviteId,
          details: {},
          ...clientInfo,
        });

        return NextResponse.json({
          success: true,
          message: 'Invite cancelled successfully',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be "resend" or "cancel"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[OrgInvite] Error updating invite:', error);
    return NextResponse.json(
      { error: 'Failed to update invite', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
