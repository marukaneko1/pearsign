/**
 * Session Management Service
 *
 * Provides functionality for:
 * - Listing active sessions with device/location info
 * - Terminating individual sessions
 * - Terminating all sessions (except current)
 * - Session device detection
 * - Session activity tracking
 */

import { sql } from './db';

// ============== TYPES ==============

export interface ActiveSession {
  id: string;
  userId: string;
  tenantId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  lastActivity: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
}

// ============== DEVICE DETECTION ==============

export function parseUserAgent(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // Detect browser
  let browser = 'Unknown Browser';
  if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('edg/') || ua.includes('edge')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  }

  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('windows nt 10')) {
    os = 'Windows 10/11';
  } else if (ua.includes('windows nt')) {
    os = 'Windows';
  } else if (ua.includes('mac os x')) {
    os = 'macOS';
  } else if (ua.includes('linux') && !ua.includes('android')) {
    os = 'Linux';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
  }

  // Detect device type
  let device = 'Desktop';
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  if (isMobile) {
    if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) {
      device = 'Tablet';
    } else {
      device = 'Mobile';
    }
  }

  return {
    browser,
    os,
    device,
    isMobile,
  };
}

// ============== SESSION OPERATIONS ==============

/**
 * Get all active sessions for a user
 */
export async function getActiveSessions(
  userId: string,
  currentSessionId?: string
): Promise<ActiveSession[]> {
  const result = await sql`
    SELECT
      id,
      user_id,
      tenant_id,
      ip_address,
      user_agent,
      last_activity,
      created_at
    FROM tenant_sessions
    WHERE user_id = ${userId}
      AND expires_at > NOW()
    ORDER BY last_activity DESC
    LIMIT 50
  `;

  return result.map(row => ({
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    deviceInfo: parseUserAgent(row.user_agent || ''),
    ipAddress: row.ip_address || 'Unknown',
    lastActivity: row.last_activity ? new Date(row.last_activity).toISOString() : new Date(row.created_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    isCurrent: row.id === currentSessionId,
  }));
}

/**
 * Terminate a specific session
 */
export async function terminateSession(
  userId: string,
  sessionId: string,
  currentSessionId: string
): Promise<{ success: boolean; message: string }> {
  // Don't allow terminating current session
  if (sessionId === currentSessionId) {
    return {
      success: false,
      message: 'Cannot terminate current session. Use logout instead.'
    };
  }

  const result = await sql`
    DELETE FROM tenant_sessions
    WHERE id = ${sessionId} AND user_id = ${userId}
    RETURNING id
  `;

  if (result.length === 0) {
    return {
      success: false,
      message: 'Session not found or already terminated.'
    };
  }

  return {
    success: true,
    message: 'Session terminated successfully.'
  };
}

/**
 * Terminate all sessions except the current one
 */
export async function terminateAllOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<{ success: boolean; count: number }> {
  const result = await sql`
    DELETE FROM tenant_sessions
    WHERE user_id = ${userId} AND id != ${currentSessionId}
    RETURNING id
  `;

  return {
    success: true,
    count: result.length
  };
}

/**
 * Update session activity timestamp
 */
export async function updateSessionActivity(
  sessionId: string,
  ipAddress?: string
): Promise<void> {
  await sql`
    UPDATE tenant_sessions
    SET
      last_activity = NOW(),
      ip_address = COALESCE(${ipAddress}, ip_address)
    WHERE id = ${sessionId}
  `;
}

/**
 * Get session count for a user
 */
export async function getSessionCount(userId: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM tenant_sessions
    WHERE user_id = ${userId}
      AND expires_at > NOW()
  `;

  return Number(result[0]?.count || 0);
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await sql`
    DELETE FROM tenant_sessions
    WHERE expires_at < NOW()
    RETURNING id
  `;

  return result.length;
}

/**
 * Get relative time string for display
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
