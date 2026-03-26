import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/notifications';
import { withTenant, type TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/notifications/:id
 * Get a single notification (tenant-scoped)
 */
export const GET = withTenant(async (
  request: NextRequest,
  ctx: TenantApiContext,
  params: { id: string }
) => {
  const { id } = await (params as any);

  const notification = await NotificationService.getById(id, ctx.tenantId);

  if (!notification) {
    return NextResponse.json(
      { success: false, error: 'Notification not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: notification,
  });
});

/**
 * PATCH /api/notifications/:id
 * Mark a notification as read (tenant-scoped)
 */
export const PATCH = withTenant(async (
  request: NextRequest,
  ctx: TenantApiContext,
  params: { id: string }
) => {
  const { id } = await (params as any);
  const body = await request.json();
  const { action = 'read' } = body;

  if (action === 'read') {
    const notification = await NotificationService.markAsRead(id, ctx.userId);

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: notification,
    });
  }

  return NextResponse.json(
    { success: false, error: 'Invalid action' },
    { status: 400 }
  );
});
