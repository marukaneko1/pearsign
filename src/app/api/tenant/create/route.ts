/**
 * Create Tenant API
 *
 * Creates a new tenant/organization with owner account.
 * This is the main endpoint for the onboarding flow.
 * The owner is registered in auth_users with a hashed password
 * and receives a verification email so they can log in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { TenantService, TenantPlan, ROLE_PERMISSIONS } from '@/lib/tenant';
import { TenantBrandingService } from '@/lib/tenant-branding';
import { BillingService } from '@/lib/billing-service';
import { ImmutableAuditLogService } from '@/lib/immutable-audit-log';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';
import { sendEmail } from '@/lib/email-service';

// Generate a URL-friendly slug from organization name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

// Generate unique ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      // Organization info
      organizationName,
      industry,
      companySize,

      // User info
      firstName,
      lastName,
      email,
      password, // In production, this should be hashed

      // Plan selection
      plan = 'free',
      billingPeriod = 'monthly',

      // Optional: Team invites
      teamInvites = [],

      // Optional: Branding
      primaryColor,
      logoUrl,
    } = body;

    // Validate required fields
    if (!organizationName || !firstName || !lastName || !email) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: organizationName, firstName, lastName, email' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Generate tenant ID and slug
    const tenantId = generateId('tenant');
    const baseSlug = generateSlug(organizationName);

    // Ensure unique slug
    let slug = baseSlug;
    let slugAttempt = 0;
    while (true) {
      const existing = await sql`
        SELECT id FROM tenants WHERE slug = ${slug}
      `.catch(() => []);

      if (existing.length === 0) break;

      slugAttempt++;
      slug = `${baseSlug}-${slugAttempt}`;

      if (slugAttempt > 100) {
        slug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }

    // Register owner in auth_users with hashed password
    await initializeAuthTables();

    let userId: string;
    let verificationToken: string | undefined;
    let isExistingAuthUser = false;

    // Check if auth_users already has this email
    const existingAuthUser = await sql`
      SELECT id FROM auth_users WHERE LOWER(TRIM(email)) = ${email.toLowerCase().trim()}
    `.catch(() => []);

    if (existingAuthUser.length > 0) {
      // User already has an auth account — reuse their ID
      userId = existingAuthUser[0].id;
      isExistingAuthUser = true;
      console.log('[CreateTenant] Reusing existing auth user:', email, userId);
    } else {
      // Create new auth user with hashed password
      if (!password) {
        return NextResponse.json(
          { success: false, error: 'Password is required for new owner accounts' },
          { status: 400 }
        );
      }

      try {
        const authResult = await AuthService.register({
          email,
          password,
          firstName,
          lastName,
          skipEmailVerification: false,
        });
        userId = authResult.userId;
        verificationToken = authResult.verificationToken;
        console.log('[CreateTenant] Created auth user:', email, userId);
      } catch (authError: any) {
        return NextResponse.json(
          { success: false, error: authError.message || 'Failed to create user account' },
          { status: 400 }
        );
      }
    }

    // Send verification email to new users
    if (verificationToken) {
      try {
        const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
        const origin = request.headers.get('origin') ||
                       request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       (replitDomain ? `https://${replitDomain}` : 'http://localhost:3000');

        const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;

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
                <p style="color: #374151; font-size: 16px;">Your organization <strong>${organizationName}</strong> has been created. Please verify your email to activate your account.</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${verifyUrl}" style="background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email Address</a>
                </div>
                <p style="color: #6b7280; font-size: 12px;">If the button doesn't work, copy this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
              </div>
            </div>
          `,
          textContent: `Hi ${firstName},\n\nYour organization ${organizationName} has been created. Verify your email: ${verifyUrl}`,
        });
        if (emailResult.success) {
          console.log('[CreateTenant] Verification email sent to:', email);
        } else {
          console.error('[CreateTenant] Verification email FAILED for:', email, emailResult.error);
        }
      } catch (emailError) {
        console.error('[CreateTenant] Failed to send verification email:', emailError);
      }
    }

    // Create the tenant
    console.log(`[CreateTenant] Creating tenant: ${organizationName} (${tenantId})`);

    await sql`
      INSERT INTO tenants (id, name, slug, plan, status, owner_id, settings, billing)
      VALUES (
        ${tenantId},
        ${organizationName},
        ${slug},
        ${plan as TenantPlan},
        'active',
        ${userId},
        ${JSON.stringify({
          industry,
          companySize,
          onboardingCompleted: false,
        })},
        '{"status": "active"}'
      )
    `;

    // Add owner as tenant user (using auth userId so login can find the membership)
    await sql`
      INSERT INTO tenant_users (id, tenant_id, user_id, role, status, joined_at, permissions)
      VALUES (
        ${generateId('tu')},
        ${tenantId},
        ${userId},
        'owner',
        'active',
        NOW(),
        ${JSON.stringify(ROLE_PERMISSIONS.owner)}
      )
    `;

    // Also sync to legacy users table
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)
    `.catch(() => {});

    const existingUsers = await sql`
      SELECT id FROM users WHERE email = ${email}
    `.catch(() => []);

    if (existingUsers.length > 0) {
      await sql`
        UPDATE users SET
          id = ${userId},
          first_name = ${firstName},
          last_name = ${lastName},
          organization_id = ${tenantId},
          role = 'owner',
          status = 'active',
          updated_at = NOW()
        WHERE email = ${email}
      `;
    } else {
      await sql`
        INSERT INTO users (id, organization_id, email, first_name, last_name, role, status, created_at, updated_at)
        VALUES (
          ${userId},
          ${tenantId},
          ${email},
          ${firstName},
          ${lastName},
          'owner',
          'active',
          NOW(),
          NOW()
        )
      `;
    }

    // Initialize usage tracking
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await sql`
      INSERT INTO tenant_usage (tenant_id, period_start, period_end)
      VALUES (${tenantId}, ${periodStart.toISOString().split('T')[0]}, ${periodEnd.toISOString().split('T')[0]})
      ON CONFLICT (tenant_id, period_start) DO NOTHING
    `;

    // Initialize branding if provided
    if (primaryColor || logoUrl) {
      try {
        await TenantBrandingService.updateBranding(tenantId, {
          companyName: organizationName,
          primaryColor: primaryColor || '#16a34a',
          logoUrl,
        });
      } catch (e) {
        console.log('[CreateTenant] Branding setup skipped:', e);
      }
    }

    // Initialize billing/subscription
    try {
      await BillingService.upsertSubscription(tenantId, {
        plan: plan as TenantPlan,
        status: 'active',
        currentPeriodStart: periodStart.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
      });
    } catch (e) {
      console.log('[CreateTenant] Billing setup skipped:', e);
    }

    // Process team invites
    const inviteResults = [];
    for (const invite of teamInvites) {
      if (invite.email && invite.role) {
        try {
          const inviteId = generateId('invite');
          await sql`
            INSERT INTO tenant_users (id, tenant_id, user_id, role, status, invited_by, invited_at, permissions)
            VALUES (
              ${inviteId},
              ${tenantId},
              ${invite.email},
              ${invite.role},
              'pending',
              ${userId},
              NOW(),
              ${JSON.stringify(ROLE_PERMISSIONS[invite.role as keyof typeof ROLE_PERMISSIONS] || ROLE_PERMISSIONS.member)}
            )
          `;
          inviteResults.push({ email: invite.email, status: 'invited' });
        } catch (e) {
          inviteResults.push({ email: invite.email, status: 'failed', error: (e as Error).message });
        }
      }
    }

    // Log the creation event
    try {
      await ImmutableAuditLogService.append({
        tenantId,
        action: 'user.joined',
        entityType: 'tenant',
        entityId: tenantId,
        actorType: 'user',
        actorId: userId,
        actorName: `${firstName} ${lastName}`,
        actorEmail: email,
        details: {
          event: 'tenant_created',
          organizationName,
          plan,
          industry,
          companySize,
          teamInvitesCount: teamInvites.length,
        },
      });
    } catch (e) {
      console.log('[CreateTenant] Audit log skipped:', e);
    }

    console.log(`[CreateTenant] Tenant created successfully: ${tenantId}`);

    return NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenantId,
          name: organizationName,
          slug,
          plan,
          status: 'active',
        },
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          role: 'owner',
          emailVerified: isExistingAuthUser,
        },
        invites: inviteResults,
      },
      message: isExistingAuthUser
        ? 'Organization created successfully. You can log in with your existing credentials.'
        : 'Organization created successfully. A verification email has been sent — please verify your email to log in.',
      requiresVerification: !isExistingAuthUser,
    });

  } catch (error) {
    console.error('[CreateTenant] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create organization',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenant/create
 * Check if slug is available
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const email = searchParams.get('email');

    if (slug) {
      const existing = await sql`
        SELECT id FROM tenants WHERE slug = ${slug}
      `.catch(() => []);

      return NextResponse.json({
        available: existing.length === 0,
        slug,
      });
    }

    if (email) {
      const existing = await sql`
        SELECT id FROM users WHERE email = ${email}
      `.catch(() => []);

      return NextResponse.json({
        available: existing.length === 0,
        email,
      });
    }

    return NextResponse.json(
      { error: 'Provide slug or email to check availability' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[CreateTenant] Error checking availability:', error);
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}
