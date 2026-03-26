/**
 * Logout API Route
 *
 * POST /api/auth/logout
 * Ends the user's session
 */

import { NextRequest, NextResponse } from 'next/server';
import { endTenantSession, getTenantSessionContext } from '@/lib/tenant-session';
import { logSystemEvent } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    // Capture session identity before destroying it
    const ctx = await getTenantSessionContext().catch(() => null);

    // End the tenant session
    await endTenantSession();

    // Fire audit event (non-blocking)
    if (ctx?.session) {
      logSystemEvent('system.logout', {
        orgId: ctx.session.tenantId,
        userId: ctx.session.userId,
        actorId: ctx.session.userId,
        actorEmail: ctx.session.userEmail,
        actorName: ctx.session.userEmail,
      });
    }

    // Clear any auth cookies
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    // Clear session cookie
    response.cookies.delete('pearsign_tenant_session');

    return response;
  } catch (error) {
    console.error('[Auth/Logout] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during logout' },
      { status: 500 }
    );
  }
}
