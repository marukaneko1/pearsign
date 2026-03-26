/**
 * Logout API Route
 *
 * POST /api/auth/logout
 * Ends the user's session
 */

import { NextRequest, NextResponse } from 'next/server';
import { endTenantSession } from '@/lib/tenant-session';

export async function POST(request: NextRequest) {
  try {
    // End the tenant session
    await endTenantSession();

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
