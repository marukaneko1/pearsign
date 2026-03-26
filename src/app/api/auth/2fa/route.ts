/**
 * Two-Factor Authentication API Routes
 *
 * GET - Get 2FA status
 * POST - Generate new 2FA setup (QR code + secret)
 * PUT - Enable 2FA (verify token + generate backup codes)
 * DELETE - Disable 2FA
 * PATCH - Regenerate backup codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getTwoFactorStatus,
  generateTwoFactorSecret,
  verifyAndEnableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  initializeTwoFactorTable,
} from '@/lib/two-factor-auth';
import { ImmutableAuditLogService } from '@/lib/immutable-audit-log';

// Ensure table exists on first request
let tableInitialized = false;
async function ensureTableExists() {
  if (!tableInitialized) {
    await initializeTwoFactorTable();
    tableInitialized = true;
  }
}

/**
 * GET - Get 2FA status
 */
export const GET = withTenant(
  async (_request: NextRequest, { userId }: TenantApiContext) => {
    try {
      await ensureTableExists();

      const status = await getTwoFactorStatus(userId);

      return NextResponse.json(status);
    } catch (error) {
      console.error('[2FA] Error getting status:', error);
      return NextResponse.json(
        { error: 'Failed to get 2FA status' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST - Generate new 2FA setup
 */
export const POST = withTenant(
  async (_request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      await ensureTableExists();

      // Check if already enabled
      const status = await getTwoFactorStatus(userId);
      if (status.enabled) {
        return NextResponse.json(
          { error: '2FA is already enabled. Disable it first to reconfigure.' },
          { status: 400 }
        );
      }

      const setup = await generateTwoFactorSecret(userId, userEmail);

      // Log audit event
      await ImmutableAuditLogService.append({
        tenantId: tenantId,
        action: 'security.2fa_requested',
        entityType: 'two_factor_auth',
        entityId: userId,
        actorType: 'user',
        actorId: userId,
        actorEmail: userEmail,
        details: { event: '2fa_setup_initiated' },
      });

      return NextResponse.json({
        qrCodeUrl: setup.qrCodeUrl,
        manualEntryCode: setup.manualEntryCode,
      });
    } catch (error) {
      console.error('[2FA] Error generating setup:', error);
      return NextResponse.json(
        { error: 'Failed to generate 2FA setup' },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT - Enable 2FA
 */
export const PUT = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      await ensureTableExists();

      const body = await request.json();
      const { token } = body;

      if (!token || typeof token !== 'string') {
        return NextResponse.json(
          { error: 'Verification token is required' },
          { status: 400 }
        );
      }

      const result = await verifyAndEnableTwoFactor(userId, token);

      if (!result.success) {
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }

      // Log audit event
      await ImmutableAuditLogService.append({
        tenantId: tenantId,
        action: 'security.2fa_verified',
        entityType: 'two_factor_auth',
        entityId: userId,
        actorType: 'user',
        actorId: userId,
        actorEmail: userEmail,
        details: {
          event: '2fa_enabled',
          backupCodesGenerated: result.backupCodes?.length || 0,
        },
      });

      return NextResponse.json({
        success: true,
        backupCodes: result.backupCodes,
        message: 'Two-factor authentication has been enabled successfully.',
      });
    } catch (error) {
      console.error('[2FA] Error enabling:', error);
      return NextResponse.json(
        { error: 'Failed to enable 2FA' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE - Disable 2FA
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      await ensureTableExists();

      const body = await request.json();
      const { token } = body;

      if (!token || typeof token !== 'string') {
        return NextResponse.json(
          { error: 'Verification token is required' },
          { status: 400 }
        );
      }

      const success = await disableTwoFactor(userId, token);

      if (!success) {
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }

      // Log audit event
      await ImmutableAuditLogService.append({
        tenantId: tenantId,
        action: 'security.2fa_verified',
        entityType: 'two_factor_auth',
        entityId: userId,
        actorType: 'user',
        actorId: userId,
        actorEmail: userEmail,
        details: { event: '2fa_disabled' },
      });

      return NextResponse.json({
        success: true,
        message: 'Two-factor authentication has been disabled.',
      });
    } catch (error) {
      console.error('[2FA] Error disabling:', error);
      return NextResponse.json(
        { error: 'Failed to disable 2FA' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH - Regenerate backup codes
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      await ensureTableExists();

      const body = await request.json();
      const { token } = body;

      if (!token || typeof token !== 'string') {
        return NextResponse.json(
          { error: 'Verification token is required' },
          { status: 400 }
        );
      }

      const backupCodes = await regenerateBackupCodes(userId, token);

      if (!backupCodes) {
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }

      // Log audit event
      await ImmutableAuditLogService.append({
        tenantId: tenantId,
        action: 'security.2fa_verified',
        entityType: 'two_factor_auth',
        entityId: userId,
        actorType: 'user',
        actorId: userId,
        actorEmail: userEmail,
        details: {
          event: '2fa_backup_codes_regenerated',
          newCodesCount: backupCodes.length,
        },
      });

      return NextResponse.json({
        success: true,
        backupCodes,
        message: 'New backup codes have been generated. Previous codes are no longer valid.',
      });
    } catch (error) {
      console.error('[2FA] Error regenerating backup codes:', error);
      return NextResponse.json(
        { error: 'Failed to regenerate backup codes' },
        { status: 500 }
      );
    }
  }
);
