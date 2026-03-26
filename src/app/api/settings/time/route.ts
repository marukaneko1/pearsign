/**
 * Time Settings API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated time/timezone settings
 *
 * HARDENED: Returns defaults on error instead of 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

// Default time settings
const DEFAULT_TIME_SETTINGS = {
  timezone: 'UTC',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
};

/**
 * GET /api/settings/time
 * Get time settings for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const settings = await sql`
      SELECT timezone, date_format as "dateFormat", time_format as "timeFormat"
      FROM time_settings
      WHERE organization_id = ${tenantId}
    `;

    if (settings.length === 0) {
      return NextResponse.json(DEFAULT_TIME_SETTINGS);
    }

    return NextResponse.json(settings[0]);
  } catch (error) {
    console.error('[Time Settings API] Error fetching time settings:', error);
    // Return defaults instead of 500 error
    return NextResponse.json(DEFAULT_TIME_SETTINGS);
  }
});

/**
 * PATCH /api/settings/time
 * Update time settings for the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { timezone, dateFormat, timeFormat } = body;
      const now = new Date().toISOString();

      // Check if settings exist
      const existing = await sql`
        SELECT id FROM time_settings WHERE organization_id = ${tenantId}
      `;

      if (existing.length === 0) {
        // Create new settings
        await sql`
          INSERT INTO time_settings (id, organization_id, timezone, date_format, time_format, created_at, updated_at)
          VALUES (gen_random_uuid(), ${tenantId}, ${timezone || 'UTC'}, ${dateFormat || 'MM/DD/YYYY'}, ${timeFormat || '12h'}, ${now}, ${now})
        `;
      } else {
        // Update existing
        await sql`
          UPDATE time_settings SET
            timezone = COALESCE(${timezone}, timezone),
            date_format = COALESCE(${dateFormat}, date_format),
            time_format = COALESCE(${timeFormat}, time_format),
            updated_at = ${now}
          WHERE organization_id = ${tenantId}
        `;
      }

      const updated = await sql`
        SELECT timezone, date_format as "dateFormat", time_format as "timeFormat"
        FROM time_settings WHERE organization_id = ${tenantId}
      `;

      return NextResponse.json(updated[0]);
    } catch (error) {
      console.error('Error updating time settings:', error);
      return NextResponse.json({ error: 'Failed to update time settings' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
