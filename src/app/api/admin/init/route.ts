/**
 * Admin Initialization API
 *
 * Initialize admin-related database tables.
 * This should be called once when setting up the admin environment.
 *
 * Requires ADMIN_SECRET_KEY for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminTables } from '@/lib/admin-tenant-service';
import { TenantService } from '@/lib/tenant';

function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    // Initialize tenant tables
    await TenantService.initializeTables();

    // Initialize admin tables (org invites, sandbox sessions, audit log)
    await initializeAdminTables();

    if (process.env.NODE_ENV !== 'production') console.log('[AdminInit] All admin tables initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Admin tables initialized successfully',
      tables: [
        'tenants',
        'tenant_users',
        'tenant_usage',
        'template_versions',
        'organization_invites',
        'admin_sandbox_sessions',
        'admin_audit_log',
      ],
    });
  } catch (error) {
    console.error('[AdminInit] Error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize admin tables', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    message: 'Use POST to initialize admin tables',
    endpoint: '/api/admin/init',
  });
}
