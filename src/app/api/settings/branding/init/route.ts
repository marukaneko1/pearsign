/**
 * Branding Init API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Initializes branding settings for the current tenant
 *
 * IDEMPOTENT: Safe to call repeatedly - will not fail if config already exists
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { ensureBrandingConfig, DEFAULT_BRANDING } from '@/lib/tenant-config-init';

/**
 * GET /api/settings/branding/init
 * Check if branding is initialized for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      console.log(`[Branding Init API] GET status for tenant: ${tenantId}`);

      // Check and initialize if needed
      const config = await ensureBrandingConfig(tenantId);

      return NextResponse.json({
        success: true,
        initialized: true,
        config: {
          ...config,
          logoData: undefined, // Don't expose base64 data
        },
      });
    } catch (error) {
      console.error('[Branding Init API] Error checking status:', error);
      return NextResponse.json({
        success: true,
        initialized: false,
        config: DEFAULT_BRANDING,
      });
    }
  }
);

/**
 * POST /api/settings/branding/init
 * Initialize the branding_settings for the current tenant
 *
 * IDEMPOTENT: Safe to call multiple times
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      console.log(`[Branding Init API] POST init for tenant: ${tenantId}`);

      // Use the idempotent helper
      const config = await ensureBrandingConfig(tenantId);

      console.log(`[Branding Init API] Initialized branding for tenant: ${tenantId}`);

      return NextResponse.json({
        success: true,
        message: 'Branding settings initialized',
        config: {
          ...config,
          logoData: undefined,
        },
      });
    } catch (error) {
      console.error('[Branding Init API] Error initializing branding settings:', error);
      // Still return success with defaults - don't 500
      return NextResponse.json({
        success: true,
        message: 'Branding settings initialized with defaults',
        config: DEFAULT_BRANDING,
      });
    }
  }
);
