/**
 * Notifications API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/notifications';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/notifications
 * Get notifications for the current user in the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const unreadOnly = searchParams.get('unreadOnly') === 'true';

      const result = await NotificationService.getForUser(tenantId, userId, {
        limit,
        offset,
        unreadOnly,
      });

      return NextResponse.json({
        success: true,
        data: result.notifications,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/notifications
 * Mark all notifications as read for the current user in the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action } = body;

      if (action === 'read-all') {
        const count = await NotificationService.markAllAsRead(tenantId, userId);
        return NextResponse.json({
          success: true,
          message: `Marked ${count} notifications as read`,
          count,
        });
      }

      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    } catch (error) {
      console.error('Error updating notifications:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update notifications' },
        { status: 500 }
      );
    }
  }
);
