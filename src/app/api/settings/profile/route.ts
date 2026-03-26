/**
 * User Profile API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each user has their own profile within their tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/settings/profile
 * Fetch user profile for the current user in the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId, userId, userEmail, userName }: TenantApiContext) => {
  try {
    // First, get user info from auth_users table (authoritative source)
    const authUsers = await sql`
      SELECT email, first_name as "firstName", last_name as "lastName"
      FROM auth_users
      WHERE id = ${userId}
    `;

    const authUser = authUsers.length > 0 ? authUsers[0] : null;
    const authorativeEmail = authUser?.email || userEmail || '';
    const authFirstName = authUser?.firstName || '';
    const authLastName = authUser?.lastName || '';

    // Then check for a user profile
    const profiles = await sql`
      SELECT
        id,
        organization_id as "organizationId",
        user_id as "userId",
        first_name as "firstName",
        last_name as "lastName",
        email,
        company,
        phone,
        avatar_url as "avatarUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_profiles
      WHERE organization_id = ${tenantId}
        AND user_id = ${userId}
    `;

    if (profiles.length === 0) {
      // Return profile from auth_users data if no profile exists
      return NextResponse.json({
        id: null,
        organizationId: tenantId,
        userId: userId,
        firstName: authFirstName || userName?.split(' ')[0] || 'User',
        lastName: authLastName || userName?.split(' ').slice(1).join(' ') || '',
        email: authorativeEmail,
        company: '',
        phone: '',
        avatarUrl: null,
      });
    }

    // Return profile but ensure email is filled from auth source if empty
    const profile = profiles[0];
    return NextResponse.json({
      ...profile,
      email: profile.email || authorativeEmail,
      firstName: profile.firstName || authFirstName || userName?.split(' ')[0] || 'User',
      lastName: profile.lastName || authLastName || userName?.split(' ').slice(1).join(' ') || '',
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
});

/**
 * PATCH /api/settings/profile
 * Update user profile for the current user in the current tenant
 */
export const PATCH = withTenant(async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
  try {
    const body = await request.json();
    const { firstName, lastName, email, company, phone, avatarUrl } = body;
    const now = new Date().toISOString();

    // Check if profile exists for this user in this tenant
    const existing = await sql`
      SELECT id FROM user_profiles
      WHERE organization_id = ${tenantId}
        AND user_id = ${userId}
    `;

    if (existing.length === 0) {
      // Create new profile for this user
      const id = `profile-${Date.now()}`;
      await sql`
        INSERT INTO user_profiles (
          id, organization_id, user_id, first_name, last_name,
          email, company, phone, avatar_url, created_at, updated_at
        ) VALUES (
          ${id}, ${tenantId}, ${userId},
          ${firstName || 'User'}, ${lastName || ''},
          ${email || ''}, ${company || ''},
          ${phone || ''}, ${avatarUrl || null}, ${now}, ${now}
        )
      `;
    } else {
      // Update existing profile
      await sql`
        UPDATE user_profiles SET
          first_name = COALESCE(${firstName}, first_name),
          last_name = COALESCE(${lastName}, last_name),
          email = COALESCE(${email}, email),
          company = COALESCE(${company}, company),
          phone = COALESCE(${phone}, phone),
          avatar_url = COALESCE(${avatarUrl}, avatar_url),
          updated_at = ${now}
        WHERE organization_id = ${tenantId}
          AND user_id = ${userId}
      `;
    }

    // Fetch and return updated profile
    const updated = await sql`
      SELECT
        id,
        organization_id as "organizationId",
        user_id as "userId",
        first_name as "firstName",
        last_name as "lastName",
        email,
        company,
        phone,
        avatar_url as "avatarUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_profiles
      WHERE organization_id = ${tenantId}
        AND user_id = ${userId}
    `;

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
});
