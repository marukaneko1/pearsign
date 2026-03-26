/**
 * Contacts API
 * Stores and retrieves contact history for quick signer selection
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant's contacts are isolated by tenant_id
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";

// Ensure the contacts table exists with tenant_id and proper indexes
async function ensureTable() {
  // First, check if the table exists and needs migration from org_id to tenant_id
  try {
    const columnCheck = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'contacts' AND column_name = 'org_id'
    `;

    if (columnCheck.length > 0) {
      // Table exists with old org_id column - migrate to tenant_id
      console.log('[Contacts API] Migrating contacts table from org_id to tenant_id');

      // Rename org_id column to tenant_id
      await sql`ALTER TABLE contacts RENAME COLUMN org_id TO tenant_id`;

      // Drop old indexes and constraints
      try {
        await sql`DROP INDEX IF EXISTS idx_contacts_org_email`;
        await sql`DROP INDEX IF EXISTS idx_contacts_org_name`;
      } catch (e) {
        // Indexes might not exist
      }

      // Update unique constraint - need to drop and recreate
      try {
        await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_org_id_email_key`;
        await sql`ALTER TABLE contacts ADD CONSTRAINT contacts_tenant_id_email_key UNIQUE (tenant_id, email)`;
      } catch (e) {
        // Constraint handling
      }
    }
  } catch (e) {
    // Table might not exist yet, that's OK
  }

  // Create the table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      company VARCHAR(255),
      title VARCHAR(255),
      use_count INTEGER DEFAULT 1,
      last_used_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tenant_id, email)
    )
  `;

  // Add indexes for faster lookups
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email
      ON contacts(tenant_id, email)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name
      ON contacts(tenant_id, name)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant_use_count
      ON contacts(tenant_id, use_count DESC)
    `;
  } catch (e) {
    // Indexes might already exist
  }
}

/**
 * GET /api/contacts
 * Fetch contacts for the current tenant with optional search
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    await ensureTable();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50); // Cap at 50

    let contacts;

    if (query) {
      // Search by name or email within tenant's contacts only
      const searchPattern = `%${query.toLowerCase()}%`;
      contacts = await sql`
        SELECT id, name, email, company, title, use_count, last_used_at
        FROM contacts
        WHERE tenant_id = ${tenantId}
          AND (LOWER(name) LIKE ${searchPattern} OR LOWER(email) LIKE ${searchPattern})
        ORDER BY use_count DESC, last_used_at DESC
        LIMIT ${limit}
      `;
    } else {
      // Get most frequently used contacts for this tenant
      contacts = await sql`
        SELECT id, name, email, company, title, use_count, last_used_at
        FROM contacts
        WHERE tenant_id = ${tenantId}
        ORDER BY use_count DESC, last_used_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({
      contacts: contacts.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        company: c.company,
        title: c.title,
        useCount: c.use_count,
        lastUsedAt: c.last_used_at,
      })),
    });
  } catch (error) {
    console.error("[Contacts API] Error fetching contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/contacts
 * Add or update contacts after sending a document
 * Contacts are stored per-tenant for isolation
 */
export const POST = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    await ensureTable();

    const body = await request.json();
    const { contacts } = body;

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json(
        { error: "contacts array is required" },
        { status: 400 }
      );
    }

    const results = [];

    for (const contact of contacts) {
      if (!contact.name || !contact.email) continue;

      const email = contact.email.toLowerCase().trim();
      const name = contact.name.trim();

      // Upsert: insert or update use_count for this tenant
      const result = await sql`
        INSERT INTO contacts (organization_id, tenant_id, name, email, company, title, use_count, last_used_at)
        VALUES (
          ${tenantId},
          ${tenantId},
          ${name},
          ${email},
          ${contact.company || null},
          ${contact.title || null},
          1,
          NOW()
        )
        ON CONFLICT (tenant_id, email)
        DO UPDATE SET
          name = ${name},
          company = COALESCE(${contact.company || null}, contacts.company),
          title = COALESCE(${contact.title || null}, contacts.title),
          use_count = contacts.use_count + 1,
          last_used_at = NOW()
        RETURNING id, name, email
      `;

      results.push(result[0]);
    }

    return NextResponse.json({
      success: true,
      savedContacts: results,
    });
  } catch (error) {
    console.error("[Contacts API] Error saving contacts:", error);
    return NextResponse.json(
      { error: "Failed to save contacts" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/contacts?id=<contact_id>
 * Remove a contact from the current tenant
 */
export const DELETE = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('id');

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

    // Only delete contacts belonging to this tenant
    const result = await sql`
      DELETE FROM contacts
      WHERE id = ${contactId} AND tenant_id = ${tenantId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Contact not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Contacts API] Error deleting contact:", error);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 }
    );
  }
});
