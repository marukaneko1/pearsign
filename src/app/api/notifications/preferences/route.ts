/**
 * Notification Preferences API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated notification preferences
 *
 * HARDENED: Returns defaults on error instead of 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { NotificationPreferencesService } from '@/lib/notifications';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  ensureNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/tenant-config-init';

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the current user
 * Uses GET-or-CREATE pattern - always returns valid preferences
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      console.log(`[Notification Preferences API] GET for tenant: ${tenantId}, user: ${userId}`);

      // Ensure preferences exist (GET-or-CREATE)
      await ensureNotificationPreferences(tenantId, userId);

      const preferences = await NotificationPreferencesService.get(tenantId, userId);

      return NextResponse.json({
        success: true,
        data: preferences,
      });
    } catch (error) {
      console.error('[Notification Preferences API] Error fetching preferences:', error);
      // Return defaults instead of 500 error
      return NextResponse.json({
        success: true,
        data: {
          id: '',
          orgId: tenantId,
          userId,
          ...DEFAULT_NOTIFICATION_PREFERENCES,
        },
      });
    }
  }
);

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences for the current user
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      console.log(`[Notification Preferences API] PATCH for tenant: ${tenantId}, user: ${userId}`);

      // Ensure preferences exist before updating
      await ensureNotificationPreferences(tenantId, userId);

      const body = await request.json();
      // Remove orgId and userId from body since we get them from context
      const { orgId: _orgId, userId: _userId, ...preferences } = body;

      const updated = await NotificationPreferencesService.update(tenantId, userId, preferences);

      console.log(`[Notification Preferences API] Updated preferences for user: ${userId}`);
      return NextResponse.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      console.error('[Notification Preferences API] Error updating preferences:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update preferences' },
        { status: 500 }
      );
    }
  }
);
