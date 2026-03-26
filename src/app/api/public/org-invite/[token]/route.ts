/**
 * Public Organization Invite API
 *
 * Public endpoint for accepting organization invites.
 * - Validate invite token
 * - Accept invite and create tenant
 *
 * NO AUTHENTICATION REQUIRED - uses invite token
 */

import { NextRequest, NextResponse } from 'next/server';
import { OrganizationInviteService, logAdminAction } from '@/lib/admin-tenant-service';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/public/org-invite/[token]
 * Get invite details by token
 */
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;

    const invite = await OrganizationInviteService.getInviteByToken(token);

    if (!invite) {
      return NextResponse.json(
        { error: 'Invite not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json(
        {
          error: 'This invitation has expired',
          code: 'EXPIRED',
          invite: {
            tenantName: invite.tenantName,
            ownerEmail: invite.ownerEmail,
            status: 'expired',
          },
        },
        { status: 410 }
      );
    }

    // Check status
    if (invite.status !== 'pending') {
      return NextResponse.json(
        {
          error: `This invitation has already been ${invite.status}`,
          code: invite.status.toUpperCase(),
          invite: {
            tenantName: invite.tenantName,
            ownerEmail: invite.ownerEmail,
            status: invite.status,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        tenantName: invite.tenantName,
        ownerEmail: invite.ownerEmail,
        ownerName: invite.ownerName,
        plan: invite.plan,
        expiresAt: invite.expiresAt,
        status: invite.status,
      },
    });
  } catch (error) {
    console.error('[OrgInvite] Error fetching invite:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invite' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/public/org-invite/[token]
 * Accept invite and activate organization
 */
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { password, firstName, lastName } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required to activate your account' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get the invite first
    const invite = await OrganizationInviteService.getInviteByToken(token);
    if (!invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      );
    }

    // Initialize auth tables
    await initializeAuthTables();

    // Check if user already exists
    let userId: string;
    const existingUser = await AuthService.getUserByEmail(invite.ownerEmail);

    if (existingUser) {
      // User exists - link them to the new tenant
      userId = existingUser.id;
      console.log('[OrgInvite] Existing user found:', invite.ownerEmail);
    } else {
      // Create new auth user
      const ownerFirstName = firstName || invite.ownerName?.split(' ')[0] || 'Owner';
      const ownerLastName = lastName || invite.ownerName?.split(' ').slice(1).join(' ') || '';

      const { userId: newUserId } = await AuthService.register({
        email: invite.ownerEmail,
        password,
        firstName: ownerFirstName,
        lastName: ownerLastName,
      });

      userId = newUserId;
      console.log('[OrgInvite] Created new auth user:', invite.ownerEmail);
    }

    // Accept the invite and create the tenant
    const { tenant } = await OrganizationInviteService.acceptInvite(token, {
      userId,
    });

    // Create user profile for the owner (for legacy compatibility)
    const { sql } = await import('@/lib/db');

    await sql`
      INSERT INTO user_profiles (
        id, organization_id, user_id, first_name, last_name, email, created_at, updated_at
      ) VALUES (
        ${'profile_' + Date.now()},
        ${tenant.id},
        ${userId},
        ${firstName || invite.ownerName?.split(' ')[0] || 'Owner'},
        ${lastName || invite.ownerName?.split(' ').slice(1).join(' ') || ''},
        ${invite.ownerEmail},
        NOW(),
        NOW()
      )
    `.catch((err) => {
      console.warn('[OrgInvite] Could not create user profile:', err);
    });

    // Create a tenant session for the new owner
    const { createTenantSession, initializeSessionTable } = await import('@/lib/tenant-session');
    const userName = firstName && lastName
      ? `${firstName} ${lastName}`
      : invite.ownerName || 'Owner';

    try {
      await initializeSessionTable();
      await createTenantSession({
        userId,
        tenantId: tenant.id,
        userEmail: invite.ownerEmail,
        userName,
        role: 'owner',
      });
      console.log('[OrgInvite] Created tenant session for new owner:', invite.ownerEmail);
    } catch (sessionError) {
      console.error('[OrgInvite] Failed to create session:', sessionError);
      // Continue anyway - user can log in manually
    }

    // Log the acceptance
    await logAdminAction({
      adminId: 'system',
      action: 'org_invite_accepted',
      targetType: 'tenant',
      targetId: tenant.id,
      details: {
        inviteId: invite.id,
        tenantName: tenant.name,
        ownerEmail: invite.ownerEmail,
        userCreated: !existingUser,
      },
    });

    // Send onboarding welcome email
    try {
      const origin = request.headers.get('origin') ||
                     request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                     process.env.NEXT_PUBLIC_APP_URL ||
                     'http://localhost:3000';

      const { sendOnboardingWelcomeEmail } = await import('@/lib/onboarding-email');

      await sendOnboardingWelcomeEmail({
        recipientEmail: invite.ownerEmail,
        recipientName: userName,
        organizationName: tenant.name,
        loginUrl: origin,
        setupGuideUrl: `${origin}/?view=settings&section=setup-guide`,
      });

      console.log('[OrgInvite] Onboarding welcome email sent to:', invite.ownerEmail);
    } catch (emailError) {
      console.error('[OrgInvite] Failed to send welcome email:', emailError);
      // Continue anyway - organization is still activated
    }

    return NextResponse.json({
      success: true,
      message: 'Organization activated successfully',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      redirectUrl: '/',
    });
  } catch (error) {
    console.error('[OrgInvite] Error accepting invite:', error);

    const message = error instanceof Error ? error.message : 'Failed to accept invite';

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
