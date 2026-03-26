/**
 * Roles API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated role configurations
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/settings/roles
 * List all roles for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const roles = await sql`
      SELECT
        id,
        name,
        description,
        permissions,
        is_system as "isSystem",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM roles
      WHERE organization_id = ${tenantId}
      ORDER BY is_system DESC, name
    `;

    return NextResponse.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
});

/**
 * POST /api/settings/roles
 * Create a custom role for the current tenant
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { name, description, permissions } = body;

      if (!name) {
        return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
      }

      const id = `role-${Date.now()}`;
      const now = new Date().toISOString();

      await sql`
        INSERT INTO roles (id, organization_id, name, description, permissions, is_system, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${name}, ${description || ''}, ${JSON.stringify(permissions || {})}::jsonb, false, ${now}, ${now})
      `;

      const newRole = await sql`
        SELECT
          id,
          name,
          description,
          permissions,
          is_system as "isSystem",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM roles
        WHERE id = ${id}
      `;

      return NextResponse.json(newRole[0], { status: 201 });
    } catch (error) {
      console.error('Error creating role:', error);
      return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageTeam'],
  }
);
