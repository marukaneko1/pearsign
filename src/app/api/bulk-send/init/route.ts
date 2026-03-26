import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * POST /api/bulk-send/init
 * Initialize bulk send database tables
 */
export async function POST() {
  try {
    // Create bulk_send_jobs table
    await sql`
      CREATE TABLE IF NOT EXISTS bulk_send_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        template_id VARCHAR(255) NOT NULL,
        template_name VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_recipients INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        custom_message TEXT,
        avg_sign_time_hours DECIMAL(10, 2),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `;

    // Create bulk_send_recipients table
    await sql`
      CREATE TABLE IF NOT EXISTS bulk_send_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES bulk_send_jobs(id) ON DELETE CASCADE,
        envelope_id VARCHAR(255),
        name VARCHAR(500) NOT NULL,
        email VARCHAR(500) NOT NULL,
        field_values JSONB DEFAULT '{}',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMP WITH TIME ZONE,
        viewed_at TIMESTAMP WITH TIME ZONE,
        signed_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create indices for better query performance
    await sql`CREATE INDEX IF NOT EXISTS idx_bulk_jobs_org ON bulk_send_jobs(org_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_send_jobs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bulk_recipients_job ON bulk_send_recipients(job_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bulk_recipients_status ON bulk_send_recipients(status)`;

    return NextResponse.json({
      success: true,
      message: 'Bulk send tables initialized successfully',
    });
  } catch (error) {
    console.error('Error initializing bulk send tables:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to initialize tables' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bulk-send/init
 * Check if tables exist
 */
export async function GET() {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'bulk_send_jobs'
      ) as jobs_exists,
      EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'bulk_send_recipients'
      ) as recipients_exists
    `;

    return NextResponse.json({
      success: true,
      tables: {
        bulk_send_jobs: result[0].jobs_exists,
        bulk_send_recipients: result[0].recipients_exists,
      },
    });
  } catch (error) {
    console.error('Error checking tables:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check tables' },
      { status: 500 }
    );
  }
}
