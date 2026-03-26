/**
 * Tenant Session API
 *
 * Get current tenant session for the logged-in user.
 * Returns null if no session exists - NO DEFAULT/DEMO FALLBACK.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantSession,
  getTenantSessionContext,
  endTenantSession,
  initializeSessionTable,
} from '@/lib/tenant-session';

/**
 * GET /api/tenant/session
 * Get the current tenant session
 */
export async function GET() {
  try {
    await initializeSessionTable();

    const context = await getTenantSessionContext();

    if (!context) {
      // No session - return null, NOT a default
      return NextResponse.json({
        authenticated: false,
        session: null,
        message: 'No active session',
      });
    }

    return NextResponse.json({
      authenticated: true,
      session: {
        userId: context.session.userId,
        userEmail: context.session.userEmail,
        userName: context.session.userName,
        role: context.session.role,
        tenantId: context.session.tenantId,
        tenantName: context.session.tenantName,
        tenantPlan: context.session.tenantPlan,
        permissions: context.session.permissions,
      },
      features: context.features,
    });
  } catch (error) {
    console.error('[TenantSession] Error getting session:', error);
    return NextResponse.json({
      authenticated: false,
      session: null,
      error: 'Failed to get session',
    });
  }
}

/**
 * DELETE /api/tenant/session
 * Logout - end the current session
 */
export async function DELETE() {
  try {
    await endTenantSession();

    return NextResponse.json({
      success: true,
      message: 'Session ended',
    });
  } catch (error) {
    console.error('[TenantSession] Error ending session:', error);
    return NextResponse.json(
      { error: 'Failed to end session' },
      { status: 500 }
    );
  }
}
