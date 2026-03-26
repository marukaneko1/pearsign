/**
 * Invoice Database Initialization API
 *
 * POST /api/invoices/init - Initialize invoicing tables
 * GET /api/invoices/init - Check initialization status
 */

import { NextRequest, NextResponse } from 'next/server';
import { forceInitializeTables, areTablesInitialized, getInitializationError } from '@/lib/invoices/db-init';

// Check initialization status (no auth required for debugging)
export async function GET() {
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

// Force initialize tables (no auth required to bootstrap)
export async function POST() {
  try {
    console.log('[Invoice Init API] Starting table initialization...');
    await forceInitializeTables();
    console.log('[Invoice Init API] Tables initialized successfully');

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
