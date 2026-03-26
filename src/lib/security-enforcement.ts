/**
 * Security Enforcement Service
 *
 * Enforces tenant security policies:
 * - Require 2FA for all team members
 * - IP address restrictions
 * - Session security checks
 *
 * This service is called during login/session validation to enforce
 * the security settings configured in Compliance settings.
 */

import { sql } from './db';
import { getTwoFactorStatus } from './two-factor-auth';

// ============== TYPES ==============

export interface TenantSecuritySettings {
  requireTwoFactor: boolean;
  ipRestrictions: string[];
  enforced: boolean;
}

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  requiresAction?: 'enable_2fa' | 'ip_blocked';
  details?: Record<string, unknown>;
}

export interface IPCheckResult {
  allowed: boolean;
  clientIP: string;
  matchedRule?: string;
  reason?: string;
}

// ============== GET TENANT SECURITY SETTINGS ==============

/**
 * Get security settings for a tenant
 */
export async function getTenantSecuritySettings(tenantId: string): Promise<TenantSecuritySettings> {
  try {
    const settings = await sql`
      SELECT require_two_factor, ip_restrictions
      FROM compliance_settings
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (settings.length === 0) {
      return {
        requireTwoFactor: false,
        ipRestrictions: [],
        enforced: false,
      };
    }

    const s = settings[0];
    return {
      requireTwoFactor: s.require_two_factor === true,
      ipRestrictions: Array.isArray(s.ip_restrictions) ? s.ip_restrictions : [],
      enforced: true,
    };
  } catch (error) {
    console.error('[SecurityEnforcement] Error getting settings:', error);
    throw new Error('Failed to load security settings');
  }
}

// ============== 2FA ENFORCEMENT ==============

/**
 * Check if user meets 2FA requirement for tenant
 * Returns action required if 2FA is required but not enabled
 */
export async function check2FARequirement(
  tenantId: string,
  userId: string
): Promise<SecurityCheckResult> {
  try {
    const settings = await getTenantSecuritySettings(tenantId);

    // If 2FA not required, allow
    if (!settings.requireTwoFactor) {
      return { allowed: true };
    }

    // Check if user has 2FA enabled
    const twoFactorStatus = await getTwoFactorStatus(userId);

    if (!twoFactorStatus.enabled) {
      return {
        allowed: false,
        reason: 'Your organization requires two-factor authentication. Please enable 2FA to continue.',
        requiresAction: 'enable_2fa',
        details: {
          tenantRequires2FA: true,
          userHas2FA: false,
        },
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('[SecurityEnforcement] 2FA check error:', error);
    return { allowed: true };
  }
}

/**
 * Get list of users in tenant who need to enable 2FA
 */
export async function getUsersRequiring2FA(tenantId: string): Promise<Array<{
  userId: string;
  email: string;
  name: string;
  role: string;
  has2FA: boolean;
}>> {
  try {
    const settings = await getTenantSecuritySettings(tenantId);

    if (!settings.requireTwoFactor) {
      return [];
    }

    // Get all active users in tenant
    const users = await sql`
      SELECT
        tu.user_id,
        tu.role,
        au.email,
        au.first_name,
        au.last_name,
        COALESCE(tfa.enabled, false) as has_2fa
      FROM tenant_users tu
      JOIN auth_users au ON tu.user_id = au.id
      LEFT JOIN two_factor_auth tfa ON tu.user_id = tfa.user_id
      WHERE tu.tenant_id = ${tenantId}
        AND tu.status = 'active'
      ORDER BY tu.role, au.email
    `;

    return users.map((u: Record<string, unknown>) => ({
      userId: u.user_id as string,
      email: u.email as string,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown',
      role: u.role as string,
      has2FA: u.has_2fa === true,
    }));
  } catch (error) {
    console.error('[SecurityEnforcement] Error getting users:', error);
    return [];
  }
}

// ============== IP RESTRICTION ENFORCEMENT ==============

/**
 * Parse client IP from request headers
 */
export function getClientIP(headers: Headers): string {
  // Try various headers in order of preference
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can be a comma-separated list
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  const cfConnectingIP = headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP.trim();
  }

  return 'unknown';
}

/**
 * Check if an IP matches a CIDR range or exact IP
 */
function ipMatchesRule(clientIP: string, rule: string): boolean {
  // Normalize rule
  const normalizedRule = rule.trim();

  // Exact match
  if (clientIP === normalizedRule) {
    return true;
  }

  // CIDR notation (e.g., 192.168.1.0/24)
  if (normalizedRule.includes('/')) {
    try {
      const [network, bits] = normalizedRule.split('/');
      const mask = parseInt(bits, 10);

      if (isNaN(mask) || mask < 0 || mask > 32) {
        return false;
      }

      const clientParts = clientIP.split('.').map(Number);
      const networkParts = network.split('.').map(Number);

      if (clientParts.length !== 4 || networkParts.length !== 4) {
        return false;
      }

      // Convert to 32-bit integers
      const clientInt = (clientParts[0] << 24) | (clientParts[1] << 16) | (clientParts[2] << 8) | clientParts[3];
      const networkInt = (networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3];
      const maskInt = ~((1 << (32 - mask)) - 1);

      return (clientInt & maskInt) === (networkInt & maskInt);
    } catch {
      return false;
    }
  }

  // Wildcard match (e.g., 192.168.1.*)
  if (normalizedRule.includes('*')) {
    const pattern = normalizedRule.replace(/\./g, '\\.').replace(/\*/g, '\\d+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(clientIP);
  }

  return false;
}

/**
 * Check if client IP is allowed by tenant's IP restrictions
 */
export async function checkIPRestrictions(
  tenantId: string,
  headers: Headers
): Promise<IPCheckResult> {
  try {
    const clientIP = getClientIP(headers);
    const settings = await getTenantSecuritySettings(tenantId);

    // If no IP restrictions, allow all
    if (!settings.ipRestrictions || settings.ipRestrictions.length === 0) {
      return {
        allowed: true,
        clientIP,
        reason: 'No IP restrictions configured',
      };
    }

    // Check each rule
    for (const rule of settings.ipRestrictions) {
      if (ipMatchesRule(clientIP, rule)) {
        return {
          allowed: true,
          clientIP,
          matchedRule: rule,
        };
      }
    }

    // No rules matched - block access
    return {
      allowed: false,
      clientIP,
      reason: `Access denied: Your IP address (${clientIP}) is not in the allowed list.`,
    };
  } catch (error) {
    console.error('[SecurityEnforcement] IP check error:', error);
    return {
      allowed: true,
      clientIP: 'unknown',
      reason: 'IP check skipped due to error',
    };
  }
}

/**
 * Full security check for login/session
 * Combines 2FA and IP checks
 */
export async function performSecurityCheck(
  tenantId: string,
  userId: string,
  headers: Headers
): Promise<SecurityCheckResult> {
  // Check IP restrictions first
  const ipCheck = await checkIPRestrictions(tenantId, headers);
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      reason: ipCheck.reason,
      requiresAction: 'ip_blocked',
      details: {
        clientIP: ipCheck.clientIP,
      },
    };
  }

  // Check 2FA requirement
  const twoFACheck = await check2FARequirement(tenantId, userId);
  if (!twoFACheck.allowed) {
    return twoFACheck;
  }

  return { allowed: true };
}

// ============== IP RESTRICTION MANAGEMENT ==============

/**
 * Add an IP address or CIDR range to tenant's allowed list
 */
export async function addIPRestriction(
  tenantId: string,
  ipRule: string,
  addedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate the IP rule format
    const trimmed = ipRule.trim();

    // Basic validation
    if (!trimmed) {
      return { success: false, error: 'IP rule cannot be empty' };
    }

    // Check if it's a valid IP, CIDR, or wildcard
    const ipRegex = /^(\d{1,3}\.){3}(\d{1,3}|\*)$/;
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

    if (!ipRegex.test(trimmed) && !cidrRegex.test(trimmed)) {
      return {
        success: false,
        error: 'Invalid IP format. Use: 192.168.1.1, 192.168.1.*, or 192.168.1.0/24'
      };
    }

    // Add to restrictions
    await sql`
      UPDATE compliance_settings
      SET
        ip_restrictions = array_append(
          COALESCE(ip_restrictions, ARRAY[]::TEXT[]),
          ${trimmed}
        ),
        updated_at = NOW()
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
    `;

    // Log the action
    try {
      await sql`
        INSERT INTO document_retention_log (
          tenant_id, document_id, action, performed_by, details
        ) VALUES (
          ${tenantId},
          'ip_restriction',
          'ip_added',
          ${addedBy},
          ${JSON.stringify({ ipRule: trimmed })}
        )
      `;
    } catch {
      // Ignore audit log errors
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[SecurityEnforcement] Added IP restriction for tenant ${tenantId}: ${trimmed}`);
    return { success: true };
  } catch (error) {
    console.error('[SecurityEnforcement] Error adding IP:', error);
    return { success: false, error: 'Failed to add IP restriction' };
  }
}

/**
 * Remove an IP address from tenant's allowed list
 */
export async function removeIPRestriction(
  tenantId: string,
  ipRule: string,
  removedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sql`
      UPDATE compliance_settings
      SET
        ip_restrictions = array_remove(ip_restrictions, ${ipRule.trim()}),
        updated_at = NOW()
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
    `;

    // Log the action
    try {
      await sql`
        INSERT INTO document_retention_log (
          tenant_id, document_id, action, performed_by, details
        ) VALUES (
          ${tenantId},
          'ip_restriction',
          'ip_removed',
          ${removedBy},
          ${JSON.stringify({ ipRule: ipRule.trim() })}
        )
      `;
    } catch {
      // Ignore audit log errors
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[SecurityEnforcement] Removed IP restriction for tenant ${tenantId}: ${ipRule}`);
    return { success: true };
  } catch (error) {
    console.error('[SecurityEnforcement] Error removing IP:', error);
    return { success: false, error: 'Failed to remove IP restriction' };
  }
}

/**
 * Get current IP restrictions for a tenant
 */
export async function getIPRestrictions(tenantId: string): Promise<string[]> {
  try {
    const result = await sql`
      SELECT ip_restrictions
      FROM compliance_settings
      WHERE organization_id = ${tenantId} OR tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (result.length === 0 || !result[0].ip_restrictions) {
      return [];
    }

    return result[0].ip_restrictions;
  } catch (error) {
    console.error('[SecurityEnforcement] Error getting IPs:', error);
    return [];
  }
}
