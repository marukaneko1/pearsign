/**
 * Admin Audit Log API
 *
 * View and export admin action audit logs.
 * All admin actions are logged for compliance and security.
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuditLogs, initializeAdminTables } from '@/lib/admin-tenant-service';

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

// ============== API HANDLERS ==============

/**
 * GET /api/admin/audit
 * Get admin audit logs
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
    const adminId = searchParams.get('adminId') || undefined;
    const targetType = searchParams.get('targetType') || undefined;
    const targetId = searchParams.get('targetId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Initialize tables if needed
    await initializeAdminTables();

    const { logs, total } = await getAdminAuditLogs({
      adminId,
      targetType,
      targetId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[AdminAudit] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
