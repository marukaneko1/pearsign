/**
 * Branding Settings API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated branding settings
 *
 * Uses GET-or-CREATE pattern to prevent 500 errors on missing config
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { ensureBrandingConfig, DEFAULT_BRANDING } from '@/lib/tenant-config-init';

/**
 * GET /api/settings/branding
 * Get branding settings for the current tenant
 * Uses GET-or-CREATE pattern - always returns valid config
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    if (process.env.NODE_ENV !== 'production') console.log(`[Branding API] GET for tenant: ${tenantId}`);

    // Ensure branding config exists (GET-or-CREATE)
    await ensureBrandingConfig(tenantId);

    // Now fetch the config
    const settings = await sql`
      SELECT
        logo_url as "logoUrl",
        logo_data as "logoData",
        primary_color as "primaryColor",
        accent_color as "accentColor",
        product_name as "productName",
        support_email as "supportEmail",
        footer_text as "footerText",
        favicon_url as "faviconUrl",
        custom_css as "customCss",
        updated_at as "updatedAt"
      FROM branding_settings
      WHERE organization_id = ${tenantId}
    `;

    if (settings.length === 0) {
      // Fallback to defaults if ensureBrandingConfig failed silently
      if (process.env.NODE_ENV !== 'production') console.log(`[Branding API] No config found, returning defaults for tenant: ${tenantId}`);
      return NextResponse.json({
        ...DEFAULT_BRANDING,
        logoUrl: null,
        logoData: undefined,
      });
    }

    const result = settings[0] as Record<string, unknown>;

    // If we have logo data but no proper URL, generate one
    let logoUrl = result.logoUrl as string | null;
    if (result.logoData && (!logoUrl || logoUrl.startsWith('blob:'))) {
      const timestamp = result.updatedAt ? new Date(result.updatedAt as string).getTime() : Date.now();
      logoUrl = `/api/settings/branding/logo?t=${timestamp}`;
    }

    return NextResponse.json({
      ...result,
      logoUrl,
      logoData: undefined, // Don't send the base64 data to the client
    });
  } catch (error) {
    console.error('[Branding API] Error fetching branding:', error);
    // Return defaults instead of 500 error
    return NextResponse.json({
      ...DEFAULT_BRANDING,
      logoUrl: null,
      logoData: undefined,
    });
  }
});

/**
 * PATCH /api/settings/branding
 * Update branding settings for the current tenant
 * Creates row if missing (upsert behavior)
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      if (process.env.NODE_ENV !== 'production') console.log(`[Branding API] PATCH for tenant: ${tenantId}`);

      // Ensure branding config exists before updating
      await ensureBrandingConfig(tenantId);

      const body = await request.json();
      const { logoUrl, primaryColor, accentColor, productName, supportEmail, footerText } = body;
      const now = new Date().toISOString();

      // Update the existing row (which is now guaranteed to exist)
      await sql`
        UPDATE branding_settings SET
          logo_url = COALESCE(${logoUrl}, logo_url),
          primary_color = COALESCE(${primaryColor}, primary_color),
          accent_color = COALESCE(${accentColor}, accent_color),
          product_name = COALESCE(${productName}, product_name),
          support_email = COALESCE(${supportEmail}, support_email),
          footer_text = COALESCE(${footerText}, footer_text),
          updated_at = ${now}
        WHERE organization_id = ${tenantId}
      `;

      const updated = await sql`
        SELECT logo_url as "logoUrl", primary_color as "primaryColor",
          accent_color as "accentColor", product_name as "productName",
          support_email as "supportEmail", footer_text as "footerText",
          favicon_url as "faviconUrl", custom_css as "customCss"
        FROM branding_settings WHERE organization_id = ${tenantId}
      `;

      if (process.env.NODE_ENV !== 'production') console.log(`[Branding API] Updated branding for tenant: ${tenantId}`);
      return NextResponse.json(updated[0] || {
        ...DEFAULT_BRANDING,
        logoUrl,
        primaryColor,
        accentColor,
        productName,
        supportEmail,
        footerText,
      });
    } catch (error) {
      console.error('[Branding API] Error updating branding:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
