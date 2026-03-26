/**
 * Tenant Config Initialization Helper
 *
 * Provides idempotent GET-or-CREATE behavior for tenant-scoped settings tables.
 * This prevents 500 errors when a tenant has no existing configuration rows.
 *
 * Usage: Call ensureTenantConfig() at the start of any endpoint that reads/writes
 * tenant configuration to guarantee the row exists.
 */

import { sql } from './db';

// ============== TYPES ==============

export interface BrandingDefaults {
  logoUrl: string | null;
  logoData: string | null;
  logoMimeType: string | null;
  primaryColor: string;
  accentColor: string;
  productName: string;
  supportEmail: string;
  footerText: string;
  faviconUrl: string | null;
  customCss: string | null;
}

export interface NotificationPreferencesDefaults {
  envelopeSent: boolean;
  envelopeViewed: boolean;
  envelopeSigned: boolean;
  envelopeCompleted: boolean;
  envelopeDeclined: boolean;
  teamInvites: boolean;
  roleChanges: boolean;
  templateAssigned: boolean;
  reminders: boolean;
  systemUpdates: boolean;
  emailNotifications: boolean;
}

// ============== DEFAULT VALUES ==============

export const DEFAULT_BRANDING: BrandingDefaults = {
  logoUrl: null,
  logoData: null,
  logoMimeType: null,
  primaryColor: '#2563eb',
  accentColor: '#1d4ed8',
  productName: 'PearSign',
  supportEmail: 'info@pearsign.com',
  footerText: '© 2025 PearSign. All rights reserved.',
  faviconUrl: null,
  customCss: null,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesDefaults = {
  envelopeSent: true,
  envelopeViewed: true,
  envelopeSigned: true,
  envelopeCompleted: true,
  envelopeDeclined: true,
  teamInvites: true,
  roleChanges: true,
  templateAssigned: true,
  reminders: true,
  systemUpdates: true,
  emailNotifications: true,
};

// ============== INITIALIZATION FUNCTIONS ==============

/**
 * Ensure branding settings exist for a tenant.
 * Creates default row if missing. Returns the branding config.
 *
 * This is idempotent and safe to call multiple times.
 */
export async function ensureBrandingConfig(tenantId: string): Promise<BrandingDefaults> {
  console.log(`[TenantConfig] ensureBrandingConfig called for tenant: ${tenantId}`);

  try {
    // First, ensure the table has the right columns (migration safety)
    await ensureBrandingTableColumns();

    // Check for existing row
    const existing = await sql`
      SELECT
        logo_url as "logoUrl",
        logo_data as "logoData",
        logo_mime_type as "logoMimeType",
        primary_color as "primaryColor",
        accent_color as "accentColor",
        product_name as "productName",
        support_email as "supportEmail",
        footer_text as "footerText",
        favicon_url as "faviconUrl",
        custom_css as "customCss"
      FROM branding_settings
      WHERE organization_id = ${tenantId}
    `;

    if (existing.length > 0) {
      console.log(`[TenantConfig] Branding config exists for tenant: ${tenantId}`);
      return existing[0] as BrandingDefaults;
    }

    // Row doesn't exist - create with defaults
    console.log(`[TenantConfig] Creating default branding config for tenant: ${tenantId}`);

    await sql`
      INSERT INTO branding_settings (
        id, organization_id, product_name, primary_color, accent_color,
        support_email, footer_text
      ) VALUES (
        gen_random_uuid(),
        ${tenantId},
        ${DEFAULT_BRANDING.productName},
        ${DEFAULT_BRANDING.primaryColor},
        ${DEFAULT_BRANDING.accentColor},
        ${DEFAULT_BRANDING.supportEmail},
        ${DEFAULT_BRANDING.footerText}
      )
      ON CONFLICT (organization_id) DO NOTHING
    `;

    console.log(`[TenantConfig] Created branding config for tenant: ${tenantId}`);
    return { ...DEFAULT_BRANDING };
  } catch (error) {
    console.error(`[TenantConfig] Error in ensureBrandingConfig for tenant ${tenantId}:`, error);
    // Return defaults on error so endpoint doesn't 500
    return { ...DEFAULT_BRANDING };
  }
}

/**
 * Ensure branding table has all required columns.
 * Safe to call multiple times.
 */
async function ensureBrandingTableColumns(): Promise<void> {
  try {
    // Check if table exists first
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'branding_settings'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      // Create the table if it doesn't exist
      await sql`
        CREATE TABLE IF NOT EXISTS branding_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id VARCHAR(255) NOT NULL UNIQUE,
          logo_url TEXT,
          logo_data TEXT,
          logo_mime_type VARCHAR(100),
          primary_color VARCHAR(20) DEFAULT '#2563eb',
          accent_color VARCHAR(20) DEFAULT '#1d4ed8',
          product_name VARCHAR(255) DEFAULT 'PearSign',
          support_email VARCHAR(255) DEFAULT 'info@pearsign.com',
          footer_text TEXT,
          favicon_url TEXT,
          custom_css TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('[TenantConfig] Created branding_settings table');
    }

    // Add columns if they don't exist (safe migration)
    // Using individual statements since column names can't be parameterized
    try {
      await sql`ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS logo_data TEXT`;
    } catch {
      // Column likely exists - ignore
    }

    try {
      await sql`ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS logo_mime_type VARCHAR(100)`;
    } catch {
      // Column likely exists - ignore
    }
  } catch (error) {
    console.error('[TenantConfig] Error ensuring branding table columns:', error);
    // Don't throw - let the calling function handle fallback
  }
}

/**
 * Ensure notification preferences exist for a user in a tenant.
 * Creates default row if missing. Returns the preferences.
 */
export async function ensureNotificationPreferences(
  tenantId: string,
  userId: string
): Promise<NotificationPreferencesDefaults & { id: string }> {
  console.log(`[TenantConfig] ensureNotificationPreferences called for tenant: ${tenantId}, user: ${userId}`);

  try {
    // Check for existing row
    const existing = await sql`
      SELECT
        id,
        envelope_sent as "envelopeSent",
        envelope_viewed as "envelopeViewed",
        envelope_signed as "envelopeSigned",
        envelope_completed as "envelopeCompleted",
        COALESCE(envelope_declined, true) as "envelopeDeclined",
        team_invites as "teamInvites",
        role_changes as "roleChanges",
        template_assigned as "templateAssigned",
        reminders,
        system_updates as "systemUpdates",
        email_notifications as "emailNotifications"
      FROM notification_preferences
      WHERE org_id = ${tenantId} AND user_id = ${userId}
    `;

    if (existing.length > 0) {
      return existing[0] as NotificationPreferencesDefaults & { id: string };
    }

    // Row doesn't exist - create with defaults
    console.log(`[TenantConfig] Creating default notification preferences for user: ${userId}`);

    await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS envelope_declined BOOLEAN DEFAULT true`;

    const result = await sql`
      INSERT INTO notification_preferences (
        org_id, user_id, envelope_sent, envelope_viewed, envelope_signed,
        envelope_completed, envelope_declined, team_invites, role_changes, template_assigned,
        reminders, system_updates, email_notifications
      ) VALUES (
        ${tenantId},
        ${userId},
        ${DEFAULT_NOTIFICATION_PREFERENCES.envelopeSent},
        ${DEFAULT_NOTIFICATION_PREFERENCES.envelopeViewed},
        ${DEFAULT_NOTIFICATION_PREFERENCES.envelopeSigned},
        ${DEFAULT_NOTIFICATION_PREFERENCES.envelopeCompleted},
        ${DEFAULT_NOTIFICATION_PREFERENCES.envelopeDeclined},
        ${DEFAULT_NOTIFICATION_PREFERENCES.teamInvites},
        ${DEFAULT_NOTIFICATION_PREFERENCES.roleChanges},
        ${DEFAULT_NOTIFICATION_PREFERENCES.templateAssigned},
        ${DEFAULT_NOTIFICATION_PREFERENCES.reminders},
        ${DEFAULT_NOTIFICATION_PREFERENCES.systemUpdates},
        ${DEFAULT_NOTIFICATION_PREFERENCES.emailNotifications}
      )
      ON CONFLICT (org_id, user_id) DO NOTHING
      RETURNING id
    `;

    return {
      id: result[0]?.id || '',
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
  } catch (error) {
    console.error(`[TenantConfig] Error in ensureNotificationPreferences:`, error);
    // Return defaults on error
    return { id: '', ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

/**
 * Ensure invoices table exists for a tenant.
 * This is called before any invoice operations.
 */
export async function ensureInvoicesTable(): Promise<boolean> {
  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'invoices'
      ) as exists
    `;

    if (tableExists[0]?.exists) {
      return true;
    }

    console.log('[TenantConfig] Invoices table does not exist - should run initialization');
    return false;
  } catch (error) {
    console.error('[TenantConfig] Error checking invoices table:', error);
    return false;
  }
}

/**
 * Ensure notifications table exists.
 */
export async function ensureNotificationsTable(): Promise<boolean> {
  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'notifications'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      // Create the table
      await sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255),
          type VARCHAR(50) NOT NULL,
          title VARCHAR(500) NOT NULL,
          message TEXT,
          entity_type VARCHAR(50) NOT NULL,
          entity_id VARCHAR(255),
          action_url TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_notifications_org_user
        ON notifications(org_id, user_id)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_notifications_unread
        ON notifications(org_id, user_id, is_read)
        WHERE is_read = false
      `;

      console.log('[TenantConfig] Created notifications table');
    }

    return true;
  } catch (error) {
    console.error('[TenantConfig] Error ensuring notifications table:', error);
    return false;
  }
}

/**
 * Ensure notification preferences table exists.
 */
export async function ensureNotificationPreferencesTable(): Promise<boolean> {
  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'notification_preferences'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          envelope_sent BOOLEAN DEFAULT true,
          envelope_viewed BOOLEAN DEFAULT true,
          envelope_signed BOOLEAN DEFAULT true,
          envelope_completed BOOLEAN DEFAULT true,
          envelope_declined BOOLEAN DEFAULT true,
          team_invites BOOLEAN DEFAULT true,
          role_changes BOOLEAN DEFAULT true,
          template_assigned BOOLEAN DEFAULT true,
          reminders BOOLEAN DEFAULT true,
          system_updates BOOLEAN DEFAULT true,
          email_notifications BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(org_id, user_id)
        )
      `;
      console.log('[TenantConfig] Created notification_preferences table');
    }

    return true;
  } catch (error) {
    console.error('[TenantConfig] Error ensuring notification_preferences table:', error);
    return false;
  }
}

// ============== COMPOSITE INITIALIZATION ==============

/**
 * Initialize all tenant config tables for a new tenant.
 * Call this when a tenant is first created or on first access.
 */
export async function initializeTenantConfig(tenantId: string, userId?: string): Promise<{
  branding: boolean;
  notifications: boolean;
  preferences: boolean;
}> {
  console.log(`[TenantConfig] Initializing config for tenant: ${tenantId}`);

  const results = {
    branding: false,
    notifications: false,
    preferences: false,
  };

  try {
    // Branding
    await ensureBrandingConfig(tenantId);
    results.branding = true;
  } catch (e) {
    console.error('[TenantConfig] Failed to init branding:', e);
  }

  try {
    // Notifications table
    await ensureNotificationsTable();
    results.notifications = true;
  } catch (e) {
    console.error('[TenantConfig] Failed to init notifications:', e);
  }

  try {
    // Notification preferences (if user provided)
    if (userId) {
      await ensureNotificationPreferencesTable();
      await ensureNotificationPreferences(tenantId, userId);
      results.preferences = true;
    }
  } catch (e) {
    console.error('[TenantConfig] Failed to init preferences:', e);
  }

  console.log(`[TenantConfig] Initialization complete for tenant: ${tenantId}`, results);
  return results;
}
