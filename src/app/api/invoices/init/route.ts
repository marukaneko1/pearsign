/**
 * Invoice Database Initialization API
 *
 * POST /api/invoices/init - Initialize invoicing tables (admin only)
 * GET /api/invoices/init - Check initialization status (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { forceInitializeTables, areTablesInitialized, getInitializationError } from '@/lib/invoices/db-init';

function requireAdminKey(request: NextRequest): NextResponse | null {
  const adminKey = request.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_SECRET_KEY;
  if (!expectedKey || !adminKey || adminKey !== expectedKey) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required.' },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;

  try {
    const isInitialized = areTablesInitialized();
    const lastError = getInitializationError();

    return NextResponse.json({
      initialized: isInitialized,
      error: lastError ? lastError.message : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;

  try {
    if (process.env.NODE_ENV !== 'production') console.log('[Invoice Init API] Starting table initialization...');
    await forceInitializeTables();
    if (process.env.NODE_ENV !== 'production') console.log('[Invoice Init API] Tables initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Invoicing tables initialized successfully',
      initialized: true,
    });
  } catch (error) {
    console.error('[Invoice Init API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize tables',
        details: String(error),
        initialized: false,
      },
      { status: 500 }
    );
  }
}
