/**
 * Team Member Detail API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated team management
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/settings/team/[id]
 * Get a specific team member for the current tenant
 */
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: 'Team member ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

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
          COALESCE(
            (SELECT json_agg(t.name) FROM teams t
             JOIN user_teams ut ON ut.team_id = t.id
             WHERE ut.user_id = u.id),
            '[]'::json
          ) as teams
        FROM users u
        WHERE u.id = ${id} AND u.organization_id = ${tenantId}
      `;

      if (members.length === 0) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }

      return NextResponse.json(members[0]);
    } catch (error) {
      console.error('Error fetching team member:', error);
      return NextResponse.json({ error: 'Failed to fetch team member' }, { status: 500 });
    }
  }
);

/**
 * PATCH /api/settings/team/[id]
 * Update a team member for the current tenant
 */
export const PATCH = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: 'Team member ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;
      const body = await request.json();
      const { role, status, firstName, lastName } = body;

      // Check if member exists in this tenant
      const existing = await sql`
        SELECT id, role, status FROM users WHERE id = ${id} AND organization_id = ${tenantId}
      `;

      if (existing.length === 0) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }

      const member = existing[0];

      // Prevent changing owner role if they're the last owner
      if (member.role === 'owner' && role && role !== 'owner') {
        const ownerCount = await sql`
          SELECT COUNT(*) as count FROM users
          WHERE organization_id = ${tenantId} AND role = 'owner' AND status = 'active'
        `;
        if (Number(ownerCount[0].count) <= 1) {
          return NextResponse.json({
            error: 'Cannot change role: Organization must have at least one owner'
          }, { status: 400 });
        }
      }

      const now = new Date().toISOString();

      // Update each field individually if provided
      await sql`
        UPDATE users SET
          role = COALESCE(${role}, role),
          status = COALESCE(${status}, status),
          first_name = COALESCE(${firstName}, first_name),
          last_name = COALESCE(${lastName}, last_name),
          updated_at = ${now}
        WHERE id = ${id} AND organization_id = ${tenantId}
      `;

      // Fetch updated member
      const updated = await sql`
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

      return NextResponse.json(updated[0]);
    } catch (error) {
      console.error('Error updating team member:', error);
      return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);

/**
 * DELETE /api/settings/team/[id]
 * Remove a team member from the current tenant
 */
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: 'Team member ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

      // Check if member exists and their role in this tenant
      const existing = await sql`
        SELECT id, role FROM users WHERE id = ${id} AND organization_id = ${tenantId}
      `;

      if (existing.length === 0) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }

      const member = existing[0];

      // Prevent deleting the last owner
      if (member.role === 'owner') {
        const ownerCount = await sql`
          SELECT COUNT(*) as count FROM users
          WHERE organization_id = ${tenantId} AND role = 'owner'
        `;
        if (Number(ownerCount[0].count) <= 1) {
          return NextResponse.json({
            error: 'Cannot delete: Organization must have at least one owner'
          }, { status: 400 });
        }
      }

      // Delete user-team associations first
      await sql`DELETE FROM user_teams WHERE user_id = ${id}`;

      // Delete the user
      await sql`DELETE FROM users WHERE id = ${id} AND organization_id = ${tenantId}`;

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting team member:', error);
      return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);
