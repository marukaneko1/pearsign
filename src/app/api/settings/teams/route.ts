/**
 * Teams API (Team Groups)
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated team groups
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/settings/teams
 * List all team groups for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const teams = await sql`
      SELECT
        t.id,
        t.name,
        t.description,
        t.created_at as "createdAt",
        (SELECT COUNT(*) FROM user_teams ut WHERE ut.team_id = t.id) as "memberCount"
      FROM teams t
      WHERE t.organization_id = ${tenantId}
      ORDER BY t.name
    `;

    return NextResponse.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
});

/**
 * POST /api/settings/teams
 * Create a new team group for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { name, description } = body;

      if (!name) {
        return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
      }

      const id = `team-${Date.now()}`;
      const now = new Date().toISOString();

      await sql`
        INSERT INTO teams (id, organization_id, name, description, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${name}, ${description || ''}, ${now}, ${now})
      `;

      const newTeam = await sql`
        SELECT
          t.id,
          t.name,
          t.description,
          t.created_at as "createdAt",
          0 as "memberCount"
        FROM teams t
        WHERE t.id = ${id}
      `;

      return NextResponse.json(newTeam[0], { status: 201 });
    } catch (error) {
      console.error('Error creating team:', error);
      return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);
