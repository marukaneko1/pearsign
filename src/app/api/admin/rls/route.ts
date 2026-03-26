/**
 * Row Level Security Admin API
 *
 * Endpoints to initialize and manage RLS policies.
 * ADMIN ONLY - requires platform admin access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeRLS, checkRLSStatus, disableRLS } from '@/lib/rls-policies';

/**
 * GET /api/admin/rls
 * Check RLS status for all tables
 */
export async function GET(request: NextRequest) {
  try {
    // In production, add proper admin authentication here
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_SECRET_KEY && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await checkRLSStatus();

    // Count protected tables
    const protectedCount = status.filter(t => t.rlsEnabled && t.policyCount > 0).length;
    const unprotectedCount = status.filter(t => !t.rlsEnabled || t.policyCount === 0).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalTables: status.length,
        protectedTables: protectedCount,
        unprotectedTables: unprotectedCount,
        rlsFullyEnabled: unprotectedCount === 0,
      },
      tables: status,
    });
  } catch (error) {
    console.error('[RLS Admin] Error checking status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check RLS status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/rls
 * Initialize RLS on all tables
 */
export async function POST(request: NextRequest) {
  try {
    // In production, add proper admin authentication here
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_SECRET_KEY && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'disable') {
      // Only allow disable in development
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Cannot disable RLS in production' },
          { status: 403 }
        );
      }

      await disableRLS();
      return NextResponse.json({
        success: true,
        message: 'RLS disabled (development only)',
      });
    }

    // Default: Initialize RLS
    const result = await initializeRLS();

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `RLS initialized successfully. Protected ${result.tablesProtected.length} tables.`
        : `RLS initialization completed with errors`,
      tablesProtected: result.tablesProtected,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[RLS Admin] Error initializing RLS:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize RLS' },
      { status: 500 }
    );
  }
}
