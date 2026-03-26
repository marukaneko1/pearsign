/**
 * Unread Notification Count API
 *
 * Multi-tenancy enforced via withTenant middleware
 *
 * HARDENED: Returns 0 on error instead of 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/notifications';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the current user
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      const count = await NotificationService.getUnreadCount(tenantId, userId);

      return NextResponse.json({
        success: true,
        count,
      });
    } catch (error) {
      console.error('[Notification Unread Count API] Error:', error);
      // Return 0 instead of 500 error
      return NextResponse.json({
        success: true,
        count: 0,
      });
    }
  }
);
