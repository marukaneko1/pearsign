/**
 * Admin Seed Invoices API
 *
 * Creates sample invoices for testing the admin billing panel.
 * Only available with admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { BillingService } from '@/lib/billing-service';

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

// ============== SAMPLE DATA ==============

const SAMPLE_INVOICES = [
  {
    amount: 4900, // $49.00
    currency: 'usd',
    status: 'paid',
    daysAgo: 5,
    periodMonthsAgo: 0,
  },
  {
    amount: 4900,
    currency: 'usd',
    status: 'paid',
    daysAgo: 35,
    periodMonthsAgo: 1,
  },
  {
    amount: 5400, // $54.00 (with overage)
    currency: 'usd',
    status: 'paid',
    daysAgo: 65,
    periodMonthsAgo: 2,
  },
  {
    amount: 4900,
    currency: 'usd',
    status: 'paid',
    daysAgo: 95,
    periodMonthsAgo: 3,
  },
  {
    amount: 1900, // $19.00 (starter plan)
    currency: 'usd',
    status: 'paid',
    daysAgo: 125,
    periodMonthsAgo: 4,
  },
  {
    amount: 1900,
    currency: 'usd',
    status: 'paid',
    daysAgo: 155,
    periodMonthsAgo: 5,
  },
];

// ============== API HANDLER ==============

/**
 * POST /api/admin/seed-invoices
 * Create sample invoices for a tenant
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    // Initialize billing tables first
    await BillingService.initializeTables();

    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId) {
      // Get all tenants and seed for each
      const tenants = await sql`SELECT id, name FROM tenants LIMIT 10`;

      if (tenants.length === 0) {
        return NextResponse.json(
          { error: 'No tenants found', message: 'Create a tenant first' },
          { status: 400 }
        );
      }

      const results = [];
      for (const tenant of tenants) {
        const count = await seedInvoicesForTenant(tenant.id as string);
        results.push({ tenantId: tenant.id, tenantName: tenant.name, invoicesCreated: count });
      }

      return NextResponse.json({
        success: true,
        message: `Seeded invoices for ${results.length} tenants`,
        results,
      });
    }

    // Seed for specific tenant
    const count = await seedInvoicesForTenant(tenantId);

    return NextResponse.json({
      success: true,
      message: `Created ${count} sample invoices for tenant ${tenantId}`,
      invoicesCreated: count,
    });
  } catch (error) {
    console.error('[SeedInvoices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to seed invoices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/seed-invoices
 * Check if invoices exist for tenants
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const invoiceCounts = await sql`
      SELECT tenant_id, COUNT(*) as count
      FROM billing_invoices
      GROUP BY tenant_id
    `;

    const tenantInvoiceCounts = await sql`
      SELECT org_id as tenant_id, COUNT(*) as count
      FROM tenant_invoices
      GROUP BY org_id
    `.catch(() => []);

    return NextResponse.json({
      success: true,
      invoicesTable: invoiceCounts,
      tenantInvoicesTable: tenantInvoiceCounts,
      hint: 'POST to this endpoint with { tenantId: "..." } to seed invoices, or omit tenantId to seed for all tenants',
    });
  } catch (error) {
    console.error('[SeedInvoices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check invoices' },
      { status: 500 }
    );
  }
}

// ============== HELPER ==============

async function seedInvoicesForTenant(tenantId: string): Promise<number> {
  // Check if tenant already has invoices
  const existing = await sql`
    SELECT COUNT(*) as count FROM billing_invoices WHERE tenant_id = ${tenantId}
  `;

  if (parseInt(existing[0]?.count || '0') > 0) {
    if (process.env.NODE_ENV !== 'production') console.log(`[SeedInvoices] Tenant ${tenantId} already has invoices, skipping`);
    return 0;
  }

  let created = 0;

  for (const invoice of SAMPLE_INVOICES) {
    const now = new Date();
    const createdAt = new Date(now.getTime() - invoice.daysAgo * 24 * 60 * 60 * 1000);

    // Calculate period start/end
    const periodStart = new Date(now.getFullYear(), now.getMonth() - invoice.periodMonthsAgo, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - invoice.periodMonthsAgo + 1, 0);

    const invoiceNumber = `INV-${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(created + 1).padStart(4, '0')}`;

    await sql`
      INSERT INTO billing_invoices (
        id, tenant_id, stripe_invoice_id, amount, currency, status,
        pdf_url, hosted_invoice_url, period_start, period_end, created_at
      ) VALUES (
        ${`inv_${tenantId.substring(0, 8)}_${Date.now()}_${created}`},
        ${tenantId},
        ${invoiceNumber},
        ${invoice.amount},
        ${invoice.currency},
        ${invoice.status},
        ${null},
        ${null},
        ${periodStart.toISOString()},
        ${periodEnd.toISOString()},
        ${createdAt.toISOString()}
      )
    `;

    created++;
  }

  if (process.env.NODE_ENV !== 'production') console.log(`[SeedInvoices] Created ${created} invoices for tenant ${tenantId}`);
  return created;
}

/**
 * DELETE /api/admin/seed-invoices
 * Clear all sample invoices (for testing)
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
    const tenantId = searchParams.get('tenantId');
    const confirm = searchParams.get('confirm');

    if (confirm !== 'DELETE_ALL') {
      return NextResponse.json({
        error: 'Confirmation required',
        message: 'Add ?confirm=DELETE_ALL to delete invoices',
      }, { status: 400 });
    }

    if (tenantId) {
      await sql`DELETE FROM billing_invoices WHERE tenant_id = ${tenantId}`;
      await sql`DELETE FROM tenant_invoices WHERE org_id = ${tenantId}`.catch(err => console.warn('[SeedInvoices] tenant_invoices table may not exist:', err));
      return NextResponse.json({
        success: true,
        message: `Deleted all invoices for tenant ${tenantId}`,
      });
    }

    // Delete all
    const result = await sql`DELETE FROM billing_invoices RETURNING id`;
    await sql`DELETE FROM tenant_invoices`.catch(err => console.warn('[SeedInvoices] tenant_invoices table may not exist:', err));

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.length} invoices`,
    });
  } catch (error) {
    console.error('[SeedInvoices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete invoices' },
      { status: 500 }
    );
  }
}
