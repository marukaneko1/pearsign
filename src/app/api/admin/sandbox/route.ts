/**
 * Admin Sandbox API
 *
 * Secure impersonation/sandbox mode for admins to view tenant environments.
 *
 * Features:
 * - Create sandbox sessions (read-only by default)
 * - View tenant environment exactly as they see it
 * - All sessions are logged and auditable
 * - Clear visual indication of sandbox mode
 *
 * SECURITY:
 * - Sessions expire after 1 hour by default
 * - Read-only access (no modifications allowed)
 * - All actions are logged in admin_audit_log
 * - No cross-tenant data leaks
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  AdminSandboxService,
  logAdminAction,
  initializeAdminTables
} from '@/lib/admin-tenant-service';

// ============== AUTH HELPER ==============

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

function getClientInfo(request: NextRequest): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

// ============== API HANDLERS ==============

/**
 * GET /api/admin/sandbox
 * Get active sandbox sessions or validate a session token
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const tenantId = searchParams.get('tenantId');

    // Initialize tables if needed
    await initializeAdminTables();

    if (token) {
      // Validate specific session
      const session = await AdminSandboxService.validateSession(token);

      if (!session) {
        return NextResponse.json(
          { error: 'Invalid or expired session' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        session,
        valid: true,
      });
    }

    if (tenantId) {
      // Get tenant sandbox data (read-only observation)
      const data = await AdminSandboxService.getTenantSandboxData(tenantId);

      return NextResponse.json({
        success: true,
        ...data,
      });
    }

    // Get all active sessions
    const sessions = await AdminSandboxService.getActiveSessions();

    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('[Sandbox] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sandbox data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sandbox
 * Create a sandbox session to view a tenant's environment
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { tenantId, durationMinutes = 60, readOnly = true } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    // Force read-only for now (future: add explicit permission for write access)
    if (!readOnly) {
      return NextResponse.json(
        { error: 'Write access in sandbox mode is not yet supported' },
        { status: 400 }
      );
    }

    // Initialize tables if needed
    await initializeAdminTables();

    // Create sandbox session
    const session = await AdminSandboxService.createSession({
      adminId: 'admin',
      tenantId,
      durationMinutes: Math.min(durationMinutes, 240), // Max 4 hours
      readOnly: true,
    });

    // Log admin action
    const clientInfo = getClientInfo(request);
    await logAdminAction({
      adminId: 'admin',
      action: 'enter_sandbox',
      targetType: 'sandbox',
      targetId: session.id,
      details: {
        tenantId,
        tenantName: session.tenantName,
        durationMinutes,
        readOnly: true,
      },
      ...clientInfo,
    });

    // Generate sandbox URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const sandboxUrl = `${baseUrl}/admin/sandbox?token=${session.accessToken}`;

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        tenantId: session.tenantId,
        tenantName: session.tenantName,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        readOnly: session.readOnly,
        sandboxUrl,
      },
      message: `Sandbox session created for ${session.tenantName}. Session expires in ${durationMinutes} minutes.`,
    });
  } catch (error) {
    console.error('[Sandbox] Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create sandbox session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/sandbox
 * End a sandbox session
 */
export async function DELETE(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // End the session
    await AdminSandboxService.endSession(sessionId);

    // Log admin action
    const clientInfo = getClientInfo(request);
    await logAdminAction({
      adminId: 'admin',
      action: 'exit_sandbox',
      targetType: 'sandbox',
      targetId: sessionId,
      details: {},
      ...clientInfo,
    });

    return NextResponse.json({
      success: true,
      message: 'Sandbox session ended',
    });
  } catch (error) {
    console.error('[Sandbox] Error ending session:', error);
    return NextResponse.json(
      { error: 'Failed to end sandbox session' },
      { status: 500 }
    );
  }
}
