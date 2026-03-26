/**
 * Team Members API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated team management
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { sendEmail } from '@/lib/email-service';
import crypto from 'crypto';

/**
 * GET /api/settings/team
 * List all team members for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const members = await sql`
      SELECT
        u.id,
        u.email,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.role,
        u.status,
        u.invited_at as "invitedAt",
        u.last_active_at as "lastActiveAt",
        u.avatar_url as "avatarUrl",
        COALESCE(
          (SELECT json_agg(t.name) FROM teams t
           JOIN user_teams ut ON ut.team_id = t.id
           WHERE ut.user_id = u.id),
          '[]'::json
        ) as teams
      FROM users u
      WHERE u.organization_id = ${tenantId}
      ORDER BY
        CASE u.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'editor' THEN 3
          ELSE 4
        END,
        u.created_at DESC
    `;

    return NextResponse.json(members);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
});

/**
 * POST /api/settings/team
 * Invite a new team member to the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    console.log('[Team Invite] POST /api/settings/team - Start, tenant:', tenantId);
    try {
      const body = await request.json();
      const { email, role, teams } = body;
      console.log('[Team Invite] Inviting:', email, 'role:', role);

      if (!email || !role) {
        return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
      }

      // Check team member limit
      const memberCount = await sql`SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ${tenantId} AND status = 'active'`;
      const teamLimit = context.features?.maxTeamMembers || 3;
      if (teamLimit !== -1 && parseInt(memberCount[0]?.count || '0') >= teamLimit) {
        return NextResponse.json(
          { error: 'Team member limit reached', message: `Your plan allows ${teamLimit} team members. Please upgrade.`, upgradeRequired: true },
          { status: 403 }
        );
      }

      // Check if email already exists in this tenant
      const existing = await sql`
        SELECT id FROM users WHERE email = ${email} AND organization_id = ${tenantId}
      `;

      if (existing.length > 0) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
      }

      // Generate ID and invite token
      const id = `user-${Date.now()}`;
      const now = new Date().toISOString();
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Ensure invite_token column exists
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT`;

      // Insert the user for this tenant
      console.log('[Team Invite] Inserting user record:', id);
      await sql`
        INSERT INTO users (id, organization_id, email, role, status, invited_at, invite_token, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${email}, ${role}, 'invited', ${now}, ${inviteToken}, ${now}, ${now})
      `;
      console.log('[Team Invite] User record inserted successfully');

      // Add to teams if specified
      if (teams && teams.length > 0) {
        for (const teamName of teams) {
          const team = await sql`SELECT id FROM teams WHERE name = ${teamName} AND organization_id = ${tenantId}`;
          if (team.length > 0) {
            await sql`INSERT INTO user_teams (user_id, team_id) VALUES (${id}, ${team[0].id})`;
          }
        }
      }

      // Send invite email
      try {
        const tenantInfo = await sql`SELECT name FROM tenants WHERE id = ${tenantId}`;
        const orgName = tenantInfo[0]?.name || 'your organization';

        const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
        const origin = request.headers.get('origin') ||
                       request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       (replitDomain ? `https://${replitDomain}` : 'http://localhost:3000');

        const joinUrl = `${origin}/join/${inviteToken}`;

        const emailResult = await sendEmail({
          to: email,
          subject: `You've been invited to join ${orgName}`,
          htmlContent: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
              </div>
              <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: 0;">
                <p style="color: #374151; font-size: 16px;">Hi there,</p>
                <p style="color: #374151; font-size: 16px;">You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${joinUrl}" style="background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">Click the button above to create your account and get started.</p>
              </div>
            </div>
          `,
          textContent: `You've been invited to join ${orgName} as a ${role}. Accept your invitation: ${joinUrl}`,
          orgId: tenantId,
        });

        if (emailResult.success) {
          console.log('[Team] Invite email sent to:', email);
        } else {
          console.error('[Team] Invite email FAILED for:', email, emailResult.error);
        }
      } catch (emailError) {
        console.error('[Team] Failed to send invite email:', emailError);
      }

      // Fetch the created user
      const newUser = await sql`
        SELECT
          u.id,
          u.email,
          u.first_name as "firstName",
          u.last_name as "lastName",
          u.role,
          u.status,
          u.invited_at as "invitedAt",
          u.last_active_at as "lastActiveAt",
          COALESCE(
            (SELECT json_agg(t.name) FROM teams t
             JOIN user_teams ut ON ut.team_id = t.id
             WHERE ut.user_id = u.id),
            '[]'::json
          ) as teams
        FROM users u
        WHERE u.id = ${id}
      `;

      return NextResponse.json(newUser[0], { status: 201 });
    } catch (error) {
      console.error('[Team Invite] ERROR inviting team member:', error instanceof Error ? error.message : error);
      console.error('[Team Invite] Stack:', error instanceof Error ? error.stack : 'no stack');
      return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);
