/**
 * Security Settings API
 *
 * Manage and check security enforcement settings:
 * - 2FA requirement status
 * - IP address restrictions
 * - Security compliance status
 *
 * GET - Get security status (2FA compliance, IP restrictions)
 * POST - Add IP restriction
 * DELETE - Remove IP restriction
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getTenantSecuritySettings,
  getUsersRequiring2FA,
  getIPRestrictions,
  addIPRestriction,
  removeIPRestriction,
  checkIPRestrictions,
  getClientIP,
} from '@/lib/security-enforcement';

/**
 * GET /api/settings/compliance/security
 * Get security status for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      // Get security settings
      const settings = await getTenantSecuritySettings(tenantId);

      // Get IP restrictions
      const ipRestrictions = await getIPRestrictions(tenantId);

      // Get current client IP
      const clientIP = getClientIP(request.headers);

      // Check if current IP would be allowed
      const ipCheck = await checkIPRestrictions(tenantId, request.headers);

      // Get 2FA compliance status if required
      let twoFactorCompliance = null;
      if (settings.requireTwoFactor) {
        const users = await getUsersRequiring2FA(tenantId);
        const compliantUsers = users.filter(u => u.has2FA);
        const nonCompliantUsers = users.filter(u => !u.has2FA);

        twoFactorCompliance = {
          required: true,
          totalUsers: users.length,
          compliantUsers: compliantUsers.length,
          nonCompliantUsers: nonCompliantUsers.length,
          compliancePercentage: users.length > 0
            ? Math.round((compliantUsers.length / users.length) * 100)
            : 100,
          usersNeedingAction: nonCompliantUsers.map(u => ({
            email: u.email,
            name: u.name,
            role: u.role,
          })),
        };
      }

      return NextResponse.json({
        success: true,
        settings: {
          requireTwoFactor: settings.requireTwoFactor,
          ipRestrictionsEnabled: ipRestrictions.length > 0,
          ipRestrictionCount: ipRestrictions.length,
        },
        twoFactorCompliance,
        ipRestrictions: {
          enabled: ipRestrictions.length > 0,
          rules: ipRestrictions,
          currentClientIP: clientIP,
          currentClientAllowed: ipCheck.allowed,
        },
      });
    } catch (error) {
      console.error('[Security API] Error getting status:', error);
      return NextResponse.json(
        { error: 'Failed to get security status' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * POST /api/settings/compliance/security
 * Add an IP restriction
 *
 * Body: { action: 'add_ip', ipRule: '192.168.1.0/24' }
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action, ipRule } = body;

      if (action === 'add_ip') {
        if (!ipRule) {
          return NextResponse.json(
            { error: 'IP rule is required' },
            { status: 400 }
          );
        }

        const result = await addIPRestriction(tenantId, ipRule, userEmail || userId);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 }
          );
        }

        // Get updated list
        const ipRestrictions = await getIPRestrictions(tenantId);

        return NextResponse.json({
          success: true,
          message: `IP rule "${ipRule}" added successfully`,
          ipRestrictions,
        });
      }

      return NextResponse.json(
        { error: 'Invalid action. Use: add_ip' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[Security API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * DELETE /api/settings/compliance/security
 * Remove an IP restriction
 *
 * Body: { ipRule: '192.168.1.0/24' }
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { ipRule } = body;

      if (!ipRule) {
        return NextResponse.json(
          { error: 'IP rule is required' },
          { status: 400 }
        );
      }

      const result = await removeIPRestriction(tenantId, ipRule, userEmail || userId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      // Get updated list
      const ipRestrictions = await getIPRestrictions(tenantId);

      return NextResponse.json({
        success: true,
        message: `IP rule "${ipRule}" removed successfully`,
        ipRestrictions,
      });
    } catch (error) {
      console.error('[Security API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to remove IP restriction' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
