/**
 * Change Password API Route
 *
 * POST /api/auth/change-password
 * Changes the user's password after verifying the current password
 * Invalidates all other sessions after password change
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { sql } from '@/lib/db';
import { ImmutableAuditLogService } from '@/lib/immutable-audit-log';
import { logSystemEvent } from '@/lib/audit-log';
import { getCurrentSessionId } from '@/lib/tenant-session';
import { terminateAllOtherSessions } from '@/lib/session-management';
import { enforce2FA } from '@/lib/two-factor-auth';
import crypto from 'crypto';

// Password hashing functions (must match auth-service.ts)
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(hash === derivedKey.toString('hex'));
    });
  });
}

/**
 * POST /api/auth/change-password
 * Change the user's password
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { currentPassword, newPassword, twoFactorCode } = body;

      // Validate input
      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { error: 'Current password and new password are required' },
          { status: 400 }
        );
      }

      // Check if 2FA verification is required
      const twoFAResult = await enforce2FA(userId, twoFactorCode);
      if (twoFAResult.required && !twoFAResult.verified) {
        return NextResponse.json(
          {
            error: twoFAResult.error || '2FA verification required',
            requires2FA: true,
          },
          { status: 403 }
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: 'New password must be at least 8 characters' },
          { status: 400 }
        );
      }

      if (currentPassword === newPassword) {
        return NextResponse.json(
          { error: 'New password must be different from current password' },
          { status: 400 }
        );
      }

      // Get user's current password hash
      const users = await sql`
        SELECT password_hash FROM auth_users WHERE id = ${userId}
      `;

      if (users.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      const storedHash = users[0].password_hash as string;

      // Verify current password
      const isValid = await verifyPassword(currentPassword, storedHash);
      if (!isValid) {
        // Log failed attempt
        await ImmutableAuditLogService.append({
          tenantId,
          action: 'security.access_denied',
          entityType: 'password_change',
          entityId: userId,
          actorType: 'user',
          actorId: userId,
          actorEmail: userEmail,
          details: {
            event: 'password_change_failed',
            reason: 'invalid_current_password',
          },
        });

        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        );
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await sql`
        UPDATE auth_users
        SET password_hash = ${newPasswordHash}, updated_at = NOW()
        WHERE id = ${userId}
      `;

      // Get current session ID to preserve it
      const currentSessionId = await getCurrentSessionId();

      // Invalidate all other sessions for security
      let terminatedCount = 0;
      if (currentSessionId) {
        const result = await terminateAllOtherSessions(userId, currentSessionId);
        terminatedCount = result.count;
      }

      // Log successful password change
      await ImmutableAuditLogService.append({
        tenantId,
        action: 'security.2fa_verified', // Using existing action type for security events
        entityType: 'password_change',
        entityId: userId,
        actorType: 'user',
        actorId: userId,
        actorEmail: userEmail,
        details: {
          event: 'password_changed',
          sessionsTerminated: terminatedCount,
        },
      });

      logSystemEvent('auth.password_changed', {
        orgId: tenantId,
        userId,
        actorId: userId,
        actorEmail: userEmail,
        details: { sessionsTerminated: terminatedCount },
      });

      return NextResponse.json({
        success: true,
        message: 'Password changed successfully',
        sessionsTerminated: terminatedCount,
      });
    } catch (error) {
      console.error('[ChangePassword] Error:', error);
      return NextResponse.json(
        { error: 'Failed to change password' },
        { status: 500 }
      );
    }
  }
);
