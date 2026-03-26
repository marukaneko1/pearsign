/**
 * Register API Route
 *
 * POST /api/auth/register
 * Creates a new user AND a new organization (tenant)
 * Registration requires a valid invite token from the superadmin.
 * The user's email domain must match the invite's allowed domain (if set).
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';
import { TenantService, ROLE_PERMISSIONS } from '@/lib/tenant';
import { initializeSessionTable } from '@/lib/tenant-session';
import { TenantOnboardingService, initializeOnboardingTable } from '@/lib/tenant-onboarding';
import { OrganizationInviteService, initializeAdminTables } from '@/lib/admin-tenant-service';
import { sql } from '@/lib/db';

async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  const existing = await TenantService.getTenantBySlug(baseSlug);
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, organizationName, inviteToken } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'First and last name are required' },
        { status: 400 }
      );
    }

    if (!inviteToken) {
      return NextResponse.json(
        { success: false, error: 'Registration requires an invite link from the administrator.' },
        { status: 403 }
      );
    }

    // Initialize tables
    await initializeAuthTables();
    await TenantService.initializeTables();
    await initializeSessionTable();
    await initializeOnboardingTable();
    await initializeAdminTables();

    const invite = await OrganizationInviteService.getInviteByToken(inviteToken);
    if (!invite) {
      return NextResponse.json(
        { success: false, error: 'Invalid invite link.' },
        { status: 403 }
      );
    }
    if (invite.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `This invite has already been ${invite.status}.` },
        { status: 403 }
      );
    }
    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This invite link has expired. Please contact the administrator.' },
        { status: 403 }
      );
    }

    if (invite.allowedDomain) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const allowed = invite.allowedDomain.toLowerCase();
      if (emailDomain !== allowed) {
        return NextResponse.json(
          { success: false, error: `Only @${allowed} email addresses are allowed for this organization.` },
          { status: 403 }
        );
      }
    } else {
      if (email.toLowerCase() !== invite.ownerEmail.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'This invite is for a specific email address. Please use the email the invite was sent to.' },
          { status: 403 }
        );
      }
    }

    // Create user with email verification
    let userId: string;
    let verificationToken: string | undefined;
    let isExistingUser = false;

    // Check if user was pre-created (e.g. via admin org creation)
    const existingAuth = await sql`
      SELECT id, email_verified FROM auth_users WHERE LOWER(TRIM(email)) = ${email.toLowerCase().trim()}
    `.catch(() => []);

    if (existingAuth.length > 0) {
      userId = existingAuth[0].id;
      isExistingUser = true;

      // Hash the new password and update the user record
      const { hashPassword } = await import('@/lib/auth-service');
      const passwordHash = await hashPassword(password);

      if (!existingAuth[0].email_verified) {
        const crypto = await import('crypto');
        const newToken = crypto.randomBytes(48).toString('base64url');
        await sql`
          UPDATE auth_users SET
            password_hash = ${passwordHash},
            email_verification_token = ${newToken},
            email_verification_sent_at = NOW(),
            first_name = ${firstName},
            last_name = ${lastName},
            updated_at = NOW()
          WHERE id = ${userId}
        `;
        verificationToken = newToken;
      } else {
        await sql`
          UPDATE auth_users SET
            password_hash = ${passwordHash},
            first_name = ${firstName},
            last_name = ${lastName},
            updated_at = NOW()
          WHERE id = ${userId}
        `;
      }
      console.log('[Auth/Register] Reusing existing auth user (password updated):', email, userId);
    } else {
      try {
        const result = await AuthService.register({
          email,
          password,
          firstName,
          lastName,
          skipEmailVerification: false,
        });
        userId = result.userId;
        verificationToken = result.verificationToken;
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Registration failed' },
          { status: 400 }
        );
      }
    }

    // Send verification email
    if (verificationToken) {
      try {
        const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
        const origin = request.headers.get('origin') ||
                       request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       (replitDomain ? `https://${replitDomain}` : 'http://localhost:3000');

        const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;

        const { sendEmail } = await import('@/lib/email-service');

        const emailResult = await sendEmail({
          to: email,
          subject: 'Verify your PearSign account',
          htmlContent: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to PearSign!</h1>
              </div>
              <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: 0;">
                <p style="color: #374151; font-size: 16px;">Hi ${firstName},</p>
                <p style="color: #374151; font-size: 16px;">Thanks for signing up! Please verify your email address to complete your registration.</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${verifyUrl}" style="background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email Address</a>
                </div>
                <p style="color: #6b7280; font-size: 12px;">If the button doesn't work, copy this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
              </div>
            </div>
          `,
          textContent: `Hi ${firstName},\n\nWelcome to PearSign! Please verify your email address by visiting:\n\n${verifyUrl}\n\nThanks for signing up!`,
        });

        if (emailResult.success) {
          console.log('[Auth/Register] Verification email sent to:', email);
        } else {
          console.error('[Auth/Register] Verification email FAILED for:', email, emailResult.error);
        }
      } catch (emailError) {
        console.error('[Auth/Register] Failed to send verification email:', emailError);
        // Don't fail registration if email fails
      }
    }

    const tenantName = invite.tenantName || organizationName?.trim() || `${firstName}'s Workspace`;
    const tenantPlan = invite.plan || 'free';

    let tenant: { id: string; name: string; slug: string; plan: string };
    let userRole = 'member';

    if (invite.tenantId) {
      const existingTenant = await TenantService.getTenantById(invite.tenantId);
      if (existingTenant) {
        tenant = { id: existingTenant.id, name: existingTenant.name, slug: existingTenant.slug, plan: existingTenant.plan };
        await sql`
          INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at, permissions)
          VALUES (${tenant.id}, ${userId}, 'member', 'active', NOW(), ${JSON.stringify(ROLE_PERMISSIONS.member)})
        `;
        userRole = 'member';
        console.log('[Auth/Register] Added user to existing tenant:', email, '->', tenant.name);
      } else {
        const slug = await generateUniqueSlug(tenantName);
        tenant = await TenantService.createTenant({
          name: tenantName,
          slug,
          ownerId: userId,
          ownerEmail: email,
          plan: tenantPlan as any,
        });
        userRole = 'owner';
      }
    } else {
      const slug = await generateUniqueSlug(tenantName);
      tenant = await TenantService.createTenant({
        name: tenantName,
        slug,
        ownerId: userId,
        ownerEmail: email,
        plan: tenantPlan as any,
      });
      userRole = 'owner';

      await sql`
        UPDATE organization_invites
        SET tenant_id = ${tenant.id}
        WHERE id = ${invite.id}
      `;
    }

    if (!invite.allowedDomain) {
      await sql`
        UPDATE organization_invites
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = ${invite.id}
      `;
    }

    console.log('[Auth/Register] Created/joined tenant:', tenant.id, tenant.name, 'as', userRole);

    await TenantOnboardingService.getOnboardingStatus(tenant.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        firstName,
        lastName,
        emailVerified: false,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
      message: 'Registration successful. Please check your email to verify your account.',
      requiresVerification: true,
    });

    return response;
  } catch (error) {
    console.error('[Auth/Register] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
