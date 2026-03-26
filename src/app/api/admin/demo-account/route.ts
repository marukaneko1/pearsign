/**
 * Demo Sales Account API
 *
 * Creates and manages a pre-configured demo account for sales pitches
 * This account is fully functional with all features enabled and
 * populated with realistic sample data for demonstrations.
 *
 * Features:
 * - Enterprise plan with all features unlocked
 * - Sample documents in various states (sent, viewed, completed, voided)
 * - Sample templates ready to use
 * - Pre-configured branding
 * - Team members with different roles
 * - Activity history
 * - Signing certificates
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';
import { TenantService } from '@/lib/tenant';
import { createTenantSession, initializeSessionTable } from '@/lib/tenant-session';

// ============== ADMIN AUTH ==============

/**
 * Verify admin access via ADMIN_SECRET_KEY
 * Required for all admin operations
 */
function isAdminAuthenticated(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    console.warn('[Demo Account] ADMIN_SECRET_KEY not configured');
    return false;
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) return true;

  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey === adminSecret) return true;

  return false;
}

// Demo account credentials
const DEMO_ACCOUNT = {
  email: 'demo@pearsign.com',
  password: 'Demo2024!',
  firstName: 'Sarah',
  lastName: 'Johnson',
  organizationName: 'Acme Corporation',
  orgId: 'demo-sales-org',
};

// Sample team members for demo
const DEMO_TEAM = [
  { email: 'john.smith@acme-demo.com', firstName: 'John', lastName: 'Smith', role: 'admin' },
  { email: 'emily.chen@acme-demo.com', firstName: 'Emily', lastName: 'Chen', role: 'member' },
  { email: 'michael.brown@acme-demo.com', firstName: 'Michael', lastName: 'Brown', role: 'member' },
  { email: 'lisa.wong@acme-demo.com', firstName: 'Lisa', lastName: 'Wong', role: 'viewer' },
];

// Sample documents for demo
const DEMO_DOCUMENTS = [
  {
    title: 'Enterprise Software License Agreement',
    recipientName: 'David Miller',
    recipientEmail: 'david.miller@techcorp.demo',
    status: 'completed',
    daysAgo: 1,
  },
  {
    title: 'Non-Disclosure Agreement - Project Alpha',
    recipientName: 'Jennifer Adams',
    recipientEmail: 'jennifer.adams@innovate.demo',
    status: 'completed',
    daysAgo: 2,
  },
  {
    title: 'Consulting Services Contract',
    recipientName: 'Robert Chen',
    recipientEmail: 'robert.chen@globalconsult.demo',
    status: 'viewed',
    daysAgo: 0,
  },
  {
    title: 'Partnership Agreement 2024',
    recipientName: 'Amanda Foster',
    recipientEmail: 'amanda.foster@partners.demo',
    status: 'sent',
    daysAgo: 0,
  },
  {
    title: 'Employment Offer Letter - Senior Developer',
    recipientName: 'Kevin Park',
    recipientEmail: 'kevin.park@personal.demo',
    status: 'sent',
    daysAgo: 1,
  },
  {
    title: 'Vendor Agreement - Q4 Services',
    recipientName: 'Maria Garcia',
    recipientEmail: 'maria.garcia@vendors.demo',
    status: 'completed',
    daysAgo: 5,
  },
  {
    title: 'Office Lease Renewal',
    recipientName: 'Thomas Wright',
    recipientEmail: 'thomas.wright@realestate.demo',
    status: 'voided',
    daysAgo: 3,
  },
];

// Sample templates
const DEMO_TEMPLATES = [
  {
    name: 'Standard NDA',
    description: 'Non-disclosure agreement for general business use',
    category: 'Legal',
  },
  {
    name: 'Employment Offer Letter',
    description: 'Standard offer letter template with compensation details',
    category: 'HR',
  },
  {
    name: 'Sales Contract',
    description: 'Product/service sales agreement template',
    category: 'Sales',
  },
  {
    name: 'Consulting Agreement',
    description: 'Professional services consulting contract',
    category: 'Legal',
  },
  {
    name: 'Vendor Agreement',
    description: 'Third-party vendor service agreement',
    category: 'Procurement',
  },
];

/**
 * Create sample documents for the demo org
 */
async function createSampleDocuments(orgId: string, userId: string) {
  console.log('[Demo Account] Creating sample documents...');

  for (const doc of DEMO_DOCUMENTS) {
    const envelopeId = `demo-env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const signingToken = `demo-token-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - doc.daysAgo);

    // Create envelope document
    await sql`
      INSERT INTO envelope_documents (
        org_id, envelope_id, title, message, created_at
      ) VALUES (
        ${orgId},
        ${envelopeId},
        ${doc.title},
        ${'Please review and sign this document at your earliest convenience.'},
        ${createdAt.toISOString()}
      )
      ON CONFLICT (envelope_id) DO NOTHING
    `;

    // Determine timestamps based on status
    let viewedAt = null;
    let signedAt = null;

    if (doc.status === 'viewed' || doc.status === 'completed') {
      viewedAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000); // 2 hours after sent
    }
    if (doc.status === 'completed') {
      signedAt = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000); // 4 hours after sent
    }

    // Create signing session
    await sql`
      INSERT INTO envelope_signing_sessions (
        org_id, envelope_id, token, recipient_name, recipient_email,
        status, created_at, viewed_at, signed_at
      ) VALUES (
        ${orgId},
        ${envelopeId},
        ${signingToken},
        ${doc.recipientName},
        ${doc.recipientEmail},
        ${doc.status === 'sent' ? 'pending' : doc.status},
        ${createdAt.toISOString()},
        ${viewedAt?.toISOString() || null},
        ${signedAt?.toISOString() || null}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  console.log('[Demo Account] Created', DEMO_DOCUMENTS.length, 'sample documents');
}

/**
 * Create sample templates for the demo org
 */
async function createSampleTemplates(orgId: string, userId: string) {
  console.log('[Demo Account] Creating sample templates...');

  // Ensure templates table exists
  await sql`
    CREATE TABLE IF NOT EXISTS document_templates (
      id VARCHAR(255) PRIMARY KEY,
      org_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      content TEXT,
      fields JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      use_count INTEGER DEFAULT 0,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  for (const template of DEMO_TEMPLATES) {
    const templateId = `demo-tmpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    await sql`
      INSERT INTO document_templates (
        id, org_id, name, description, category, created_by, use_count
      ) VALUES (
        ${templateId},
        ${orgId},
        ${template.name},
        ${template.description},
        ${template.category},
        ${userId},
        ${Math.floor(Math.random() * 50) + 5}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  console.log('[Demo Account] Created', DEMO_TEMPLATES.length, 'sample templates');
}

/**
 * Create sample team members for the demo org
 */
async function createSampleTeamMembers(orgId: string) {
  console.log('[Demo Account] Creating sample team members...');

  for (const member of DEMO_TEAM) {
    const memberId = `demo-user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create auth user (if not exists)
    try {
      await sql`
        INSERT INTO auth_users (
          id, email, password_hash, first_name, last_name, email_verified, created_at
        ) VALUES (
          ${memberId},
          ${member.email},
          'pbkdf2:demo-password-hash',
          ${member.firstName},
          ${member.lastName},
          true,
          NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
          first_name = ${member.firstName},
          last_name = ${member.lastName}
        RETURNING id
      `;
    } catch (e) {
      console.log('[Demo Account] Team member already exists:', member.email);
    }

    // Get user ID
    const userResult = await sql`
      SELECT id FROM auth_users WHERE email = ${member.email}
    `;

    if (userResult.length > 0) {
      const userId = userResult[0].id;

      // Add to tenant_users
      await sql`
        INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at)
        VALUES (${orgId}, ${userId}, ${member.role}, 'active', NOW())
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          role = ${member.role},
          status = 'active'
      `;
    }
  }

  console.log('[Demo Account] Created', DEMO_TEAM.length, 'sample team members');
}

/**
 * Set up demo branding
 */
async function setupDemoBranding(orgId: string) {
  console.log('[Demo Account] Setting up demo branding...');

  try {
    // First, try to insert into organizations table if it exists (for FK constraint)
    await sql`
      INSERT INTO organizations (id, name, created_at)
      VALUES (${orgId}, ${DEMO_ACCOUNT.organizationName}, NOW())
      ON CONFLICT (id) DO NOTHING
    `.catch(() => {
      // Organizations table may not exist, which is fine
      console.log('[Demo Account] Organizations table not found (OK)');
    });

    // Generate a unique ID for branding
    const brandingId = `branding-${orgId}-${Date.now()}`;

    await sql`
      INSERT INTO branding_settings (
        id, organization_id, primary_color, accent_color, product_name, support_email, footer_text
      ) VALUES (
        ${brandingId},
        ${orgId},
        '#2464ea',
        '#1e40af',
        'Acme Sign',
        'support@acme-demo.com',
        '© 2024 Acme Corporation. All rights reserved.'
      )
      ON CONFLICT (organization_id) DO UPDATE SET
        product_name = 'Acme Sign',
        support_email = 'support@acme-demo.com',
        footer_text = '© 2024 Acme Corporation. All rights reserved.',
        updated_at = NOW()
    `;

    console.log('[Demo Account] Demo branding configured');
  } catch (error) {
    // Branding setup is optional - don't fail the whole setup
    console.log('[Demo Account] Branding setup skipped (optional):', error instanceof Error ? error.message : error);
  }
}

/**
 * Create sample activity/audit logs
 */
async function createSampleActivity(orgId: string, userId: string) {
  console.log('[Demo Account] Creating sample activity...');

  try {
    const activities = [
      { action: 'document.sent', details: 'Sent "Enterprise Software License Agreement" for signature' },
      { action: 'document.viewed', details: 'David Miller viewed "Enterprise Software License Agreement"' },
      { action: 'document.signed', details: 'David Miller signed "Enterprise Software License Agreement"' },
      { action: 'document.sent', details: 'Sent "Non-Disclosure Agreement - Project Alpha" for signature' },
      { action: 'team.member_invited', details: 'Invited Emily Chen to join the team' },
      { action: 'document.completed', details: 'All parties signed "Non-Disclosure Agreement"' },
      { action: 'template.created', details: 'Created new template "Standard NDA"' },
      { action: 'settings.updated', details: 'Updated organization branding settings' },
    ];

    // Ensure audit_logs table exists
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        org_id VARCHAR(255),
        user_id VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id VARCHAR(255),
        actor_id VARCHAR(255),
        actor_name VARCHAR(255),
        actor_email VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      const createdAt = new Date();
      createdAt.setHours(createdAt.getHours() - (i * 3)); // Stagger activities

      // Use database-generated UUID for audit log
      const entityType = activity.action.split('.')[0]; // e.g., 'document', 'team', 'settings'

      await sql`
        INSERT INTO audit_logs (
          org_id, user_id, action, entity_type, actor_id, actor_name, actor_email, details, created_at
        ) VALUES (
          ${orgId},
          ${userId},
          ${activity.action},
          ${entityType},
          ${userId},
          ${DEMO_ACCOUNT.firstName + ' ' + DEMO_ACCOUNT.lastName},
          ${DEMO_ACCOUNT.email},
          ${JSON.stringify({ message: activity.details })}::jsonb,
          ${createdAt.toISOString()}
        )
      `;
    }

    console.log('[Demo Account] Created', activities.length, 'sample activities');
  } catch (error) {
    // Activity creation is optional - don't fail the whole setup
    console.log('[Demo Account] Activity creation skipped (optional):', error instanceof Error ? error.message : error);
  }
}

/**
 * Clear existing demo data (for reset)
 */
async function clearDemoData(orgId: string) {
  console.log('[Demo Account] Clearing existing demo data...');

  // Clear documents
  await sql`DELETE FROM envelope_signing_sessions WHERE org_id = ${orgId}`;
  await sql`DELETE FROM envelope_documents WHERE org_id = ${orgId}`;

  // Clear templates
  await sql`DELETE FROM document_templates WHERE org_id = ${orgId}`.catch(() => {});

  // Clear audit logs
  await sql`DELETE FROM audit_logs WHERE org_id = ${orgId}`.catch(() => {});

  // Clear team members (except owner)
  for (const member of DEMO_TEAM) {
    await sql`
      DELETE FROM tenant_users WHERE tenant_id = ${orgId}
      AND user_id IN (SELECT id FROM auth_users WHERE email = ${member.email})
    `.catch(() => {});
  }

  console.log('[Demo Account] Demo data cleared');
}

/**
 * POST /api/admin/demo-account
 * Creates or resets the demo sales account with full sandbox data
 *
 * REQUIRES: ADMIN_SECRET_KEY authentication
 */
export async function POST(request: NextRequest) {
  // Admin authentication required
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'setup';

    console.log('[Demo Account] Action:', action);

    // Initialize tables
    await initializeAuthTables();
    await TenantService.initializeTables();
    await initializeSessionTable();

    if (action === 'setup' || action === 'reset') {
      // Check if demo user already exists
      const existingUser = await sql`
        SELECT id, email FROM auth_users WHERE email = ${DEMO_ACCOUNT.email}
      `;

      let userId: string;

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
        console.log('[Demo Account] Demo user already exists:', userId);

        // Mark email as verified
        await sql`
          UPDATE auth_users SET email_verified = true WHERE id = ${userId}
        `;

        // Update name in case it changed
        await sql`
          UPDATE auth_users SET first_name = ${DEMO_ACCOUNT.firstName}, last_name = ${DEMO_ACCOUNT.lastName}
          WHERE id = ${userId}
        `;
      } else {
        // Create demo user with skipEmailVerification
        const result = await AuthService.register({
          email: DEMO_ACCOUNT.email,
          password: DEMO_ACCOUNT.password,
          firstName: DEMO_ACCOUNT.firstName,
          lastName: DEMO_ACCOUNT.lastName,
          skipEmailVerification: true,
        });
        userId = result.userId;
        console.log('[Demo Account] Created demo user:', userId);
      }

      // Check if demo org exists
      const existingOrg = await sql`
        SELECT id FROM tenants WHERE id = ${DEMO_ACCOUNT.orgId}
      `;

      if (existingOrg.length === 0) {
        // Create demo organization with enterprise plan
        await sql`
          INSERT INTO tenants (id, name, slug, owner_id, plan, status, created_at, updated_at)
          VALUES (
            ${DEMO_ACCOUNT.orgId},
            ${DEMO_ACCOUNT.organizationName},
            'acme-demo',
            ${userId},
            'enterprise',
            'active',
            NOW(),
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            name = ${DEMO_ACCOUNT.organizationName},
            plan = 'enterprise',
            status = 'active',
            updated_at = NOW()
        `;
        console.log('[Demo Account] Created demo org:', DEMO_ACCOUNT.orgId);
      } else {
        // Ensure org is active with enterprise plan
        await sql`
          UPDATE tenants
          SET name = ${DEMO_ACCOUNT.organizationName}, plan = 'enterprise', status = 'active', updated_at = NOW()
          WHERE id = ${DEMO_ACCOUNT.orgId}
        `;
      }

      // Ensure user is member of demo org
      try {
        await sql`
          INSERT INTO tenant_users (tenant_id, user_id, role, status, created_at)
          VALUES (${DEMO_ACCOUNT.orgId}, ${userId}, 'owner', 'active', NOW())
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', status = 'active'
        `;
      } catch {
        // Try tenant_members as fallback
        try {
          await sql`
            INSERT INTO tenant_members (tenant_id, user_id, role, created_at)
            VALUES (${DEMO_ACCOUNT.orgId}, ${userId}, 'owner', NOW())
            ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'
          `;
        } catch (e) {
          console.log('[Demo Account] Could not add to tenant_members:', e);
        }
      }

      // Set up SendGrid integration for demo org (copy from any existing org)
      try {
        const sendgridConfig = await sql`
          SELECT config FROM integration_configs
          WHERE integration_type = 'sendgrid' AND enabled = true
          LIMIT 1
        `;

        if (sendgridConfig.length > 0) {
          await sql`
            INSERT INTO integration_configs (org_id, integration_type, config, enabled, created_at, updated_at)
            VALUES (${DEMO_ACCOUNT.orgId}, 'sendgrid', ${JSON.stringify(sendgridConfig[0].config)}::jsonb, true, NOW(), NOW())
            ON CONFLICT (org_id, integration_type) DO UPDATE SET
              config = ${JSON.stringify(sendgridConfig[0].config)}::jsonb,
              enabled = true,
              updated_at = NOW()
          `;
          console.log('[Demo Account] Copied SendGrid config to demo org');
        }
      } catch (e) {
        console.log('[Demo Account] No SendGrid config to copy:', e);
      }

      // If reset, clear existing data first
      if (action === 'reset') {
        await clearDemoData(DEMO_ACCOUNT.orgId);
      }

      // Populate sandbox with sample data
      await createSampleDocuments(DEMO_ACCOUNT.orgId, userId);
      await createSampleTemplates(DEMO_ACCOUNT.orgId, userId);
      await createSampleTeamMembers(DEMO_ACCOUNT.orgId);
      await setupDemoBranding(DEMO_ACCOUNT.orgId);
      await createSampleActivity(DEMO_ACCOUNT.orgId, userId);

      console.log('[Demo Account] Full sandbox setup complete!');

      return NextResponse.json({
        success: true,
        message: action === 'reset' ? 'Demo sandbox reset with fresh data' : 'Demo sandbox ready for sales demo',
        credentials: {
          email: DEMO_ACCOUNT.email,
          password: DEMO_ACCOUNT.password,
        },
        orgId: DEMO_ACCOUNT.orgId,
        userId,
        sandbox: {
          documents: DEMO_DOCUMENTS.length,
          templates: DEMO_TEMPLATES.length,
          teamMembers: DEMO_TEAM.length + 1, // +1 for owner
          features: 'Enterprise (all features enabled)',
        },
      });
    }

    if (action === 'login') {
      // Login as demo user using AuthService
      const loginResult = await AuthService.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);

      if (!loginResult.success) {
        return NextResponse.json(
          { success: false, error: loginResult.error || 'Demo account not set up. Run setup first.' },
          { status: 400 }
        );
      }

      if (!loginResult.tenant) {
        return NextResponse.json(
          { success: false, error: 'Demo user has no organization. Run setup first.' },
          { status: 400 }
        );
      }

      // Session is already created by AuthService.login, just return success
      return NextResponse.json({
        success: true,
        message: 'Logged in as demo user',
        user: loginResult.user,
        tenant: loginResult.tenant,
        redirectTo: '/',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use: setup, reset, or login' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Demo Account] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process demo account' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/demo-account
 * Check demo account status
 *
 * REQUIRES: ADMIN_SECRET_KEY authentication
 */
export async function GET(request: NextRequest) {
  // Admin authentication required
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const user = await sql`
      SELECT id, email, first_name, last_name, email_verified, created_at
      FROM auth_users
      WHERE email = ${DEMO_ACCOUNT.email}
    `;

    if (user.length === 0) {
      return NextResponse.json({
        exists: false,
        message: 'Demo account not set up',
      });
    }

    // Try tenant_users first, then tenant_members
    let org = await sql`
      SELECT t.id, t.name, t.plan, t.status
      FROM tenants t
      JOIN tenant_users tu ON t.id = tu.tenant_id
      WHERE tu.user_id = ${user[0].id}
      LIMIT 1
    `;

    if (org.length === 0) {
      org = await sql`
        SELECT t.id, t.name, t.plan, t.status
        FROM tenants t
        JOIN tenant_members tm ON t.id = tm.tenant_id
        WHERE tm.user_id = ${user[0].id}
        LIMIT 1
      `;
    }

    // Get stats
    const documentCount = await sql`
      SELECT COUNT(*) as count FROM envelope_documents WHERE org_id = ${DEMO_ACCOUNT.orgId}
    `.catch(() => [{ count: 0 }]);

    const teamCount = await sql`
      SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ${DEMO_ACCOUNT.orgId}
    `.catch(() => [{ count: 0 }]);

    return NextResponse.json({
      exists: true,
      user: {
        id: user[0].id,
        email: user[0].email,
        name: `${user[0].first_name} ${user[0].last_name}`,
        verified: user[0].email_verified,
        createdAt: user[0].created_at,
      },
      organization: org.length > 0 ? {
        id: org[0].id,
        name: org[0].name,
        plan: org[0].plan,
        status: org[0].status,
      } : null,
      credentials: {
        email: DEMO_ACCOUNT.email,
        password: DEMO_ACCOUNT.password,
      },
      stats: {
        documents: parseInt(documentCount[0]?.count) || 0,
        teamMembers: parseInt(teamCount[0]?.count) || 0,
      },
    });
  } catch (error) {
    console.error('[Demo Account] Error checking status:', error);
    return NextResponse.json(
      { exists: false, error: 'Failed to check demo account' },
      { status: 500 }
    );
  }
}
