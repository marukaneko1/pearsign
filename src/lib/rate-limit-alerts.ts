/**
 * PearSign Rate Limit Alerts Service
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from "./db";
import { getRateLimitUsage } from "./rate-limiter";

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitAlert {
  id: string;
  organizationId: string;
  apiKeyId: string;
  apiKeyName: string;
  alertType: "warning" | "critical" | "exceeded";
  threshold: number; // percentage (e.g., 80 = 80%)
  currentUsage: number;
  limit: number;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface RateLimitAlertConfig {
  id: string;
  organizationId: string;
  warningThreshold: number; // percentage (default 75)
  criticalThreshold: number; // percentage (default 90)
  enabled: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
  cooldownMinutes: number; // don't send duplicate alerts within this period
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyUsageStatus {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  limit: number;
  used: number;
  percentage: number;
  status: "normal" | "warning" | "critical" | "exceeded";
  lastUsedAt: string | null;
}

// ============================================================================
// ALERT CONFIG SERVICE
// ============================================================================

export const RateLimitAlertConfigService = {
  async getConfig(orgId: string): Promise<RateLimitAlertConfig> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      SELECT * FROM rate_limit_alert_config
      WHERE organization_id = ${orgId}
    `;

    if (result.length === 0) {
      // Return default config
      return {
        id: "",
        organizationId: orgId,
        warningThreshold: 75,
        criticalThreshold: 90,
        enabled: true,
        notifyEmail: true,
        notifyInApp: true,
        cooldownMinutes: 15,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const row = result[0];
    return {
      id: row.id as string,
      organizationId: (row.organization_id || row.organizationId) as string,
      warningThreshold: (row.warning_threshold || row.warningThreshold) as number,
      criticalThreshold: (row.critical_threshold || row.criticalThreshold) as number,
      enabled: row.enabled as boolean,
      notifyEmail: (row.notify_email || row.notifyEmail) as boolean,
      notifyInApp: (row.notify_in_app || row.notifyInApp) as boolean,
      cooldownMinutes: (row.cooldown_minutes || row.cooldownMinutes) as number,
      createdAt: row.created_at ? String(row.created_at) : "",
      updatedAt: row.updated_at ? String(row.updated_at) : "",
    };
  },

  async updateConfig(
    updates: Partial<Omit<RateLimitAlertConfig, "id" | "organizationId" | "createdAt" | "updatedAt">>,
    orgId: string
  ): Promise<RateLimitAlertConfig> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const now = new Date().toISOString();
    const existing = await sql`SELECT id FROM rate_limit_alert_config WHERE organization_id = ${orgId}`;

    if (existing.length === 0) {
      const id = `rlac-${Date.now()}`;
      await sql`
        INSERT INTO rate_limit_alert_config (
          id, organization_id, warning_threshold, critical_threshold,
          enabled, notify_email, notify_in_app, cooldown_minutes,
          created_at, updated_at
        ) VALUES (
          ${id}, ${orgId},
          ${updates.warningThreshold ?? 75},
          ${updates.criticalThreshold ?? 90},
          ${updates.enabled ?? true},
          ${updates.notifyEmail ?? true},
          ${updates.notifyInApp ?? true},
          ${updates.cooldownMinutes ?? 15},
          ${now}, ${now}
        )
      `;
    } else {
      await sql`
        UPDATE rate_limit_alert_config SET
          warning_threshold = COALESCE(${updates.warningThreshold ?? null}, warning_threshold),
          critical_threshold = COALESCE(${updates.criticalThreshold ?? null}, critical_threshold),
          enabled = COALESCE(${updates.enabled ?? null}, enabled),
          notify_email = COALESCE(${updates.notifyEmail ?? null}, notify_email),
          notify_in_app = COALESCE(${updates.notifyInApp ?? null}, notify_in_app),
          cooldown_minutes = COALESCE(${updates.cooldownMinutes ?? null}, cooldown_minutes),
          updated_at = ${now}
        WHERE organization_id = ${orgId}
      `;
    }

    return this.getConfig(orgId);
  },
};

// ============================================================================
// ALERT SERVICE
// ============================================================================

export const RateLimitAlertService = {
  async createAlert(
    apiKeyId: string,
    apiKeyName: string,
    alertType: "warning" | "critical" | "exceeded",
    threshold: number,
    currentUsage: number,
    limit: number,
    orgId: string
  ): Promise<RateLimitAlert> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const id = `rla-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const messages = {
      warning: `API key "${apiKeyName}" has reached ${threshold}% of its rate limit (${currentUsage}/${limit} requests)`,
      critical: `API key "${apiKeyName}" is approaching its rate limit at ${threshold}% (${currentUsage}/${limit} requests)`,
      exceeded: `API key "${apiKeyName}" has exceeded its rate limit (${currentUsage}/${limit} requests)`,
    };

    await sql`
      INSERT INTO rate_limit_alerts (
        id, organization_id, api_key_id, api_key_name, alert_type,
        threshold, current_usage, rate_limit, message, is_read, created_at
      ) VALUES (
        ${id}, ${orgId}, ${apiKeyId}, ${apiKeyName}, ${alertType},
        ${threshold}, ${currentUsage}, ${limit}, ${messages[alertType]},
        false, ${now}
      )
    `;

    return {
      id,
      organizationId: orgId,
      apiKeyId,
      apiKeyName,
      alertType,
      threshold,
      currentUsage,
      limit,
      message: messages[alertType],
      isRead: false,
      createdAt: now,
    };
  },

  async getAlerts(
    orgId: string,
    limit: number = 50,
    unreadOnly: boolean = false
  ): Promise<RateLimitAlert[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    let result;
    if (unreadOnly) {
      result = await sql`
        SELECT * FROM rate_limit_alerts
        WHERE organization_id = ${orgId} AND is_read = false
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      result = await sql`
        SELECT * FROM rate_limit_alerts
        WHERE organization_id = ${orgId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return result.map((row) => ({
      id: row.id as string,
      organizationId: (row.organization_id || row.organizationId) as string,
      apiKeyId: (row.api_key_id || row.apiKeyId) as string,
      apiKeyName: (row.api_key_name || row.apiKeyName) as string,
      alertType: (row.alert_type || row.alertType) as "warning" | "critical" | "exceeded",
      threshold: row.threshold as number,
      currentUsage: (row.current_usage || row.currentUsage) as number,
      limit: (row.rate_limit || row.limit) as number,
      message: row.message as string,
      isRead: (row.is_read || row.isRead) as boolean,
      createdAt: row.created_at ? String(row.created_at) : "",
    }));
  },

  async markAsRead(alertId: string, orgId: string): Promise<void> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    await sql`
      UPDATE rate_limit_alerts
      SET is_read = true
      WHERE id = ${alertId} AND organization_id = ${orgId}
    `;
  },

  async markAllAsRead(orgId: string): Promise<void> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    await sql`
      UPDATE rate_limit_alerts
      SET is_read = true
      WHERE organization_id = ${orgId} AND is_read = false
    `;
  },

  async getUnreadCount(orgId: string): Promise<number> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`
      SELECT COUNT(*) as count FROM rate_limit_alerts
      WHERE organization_id = ${orgId} AND is_read = false
    `;
    return parseInt(result[0].count, 10);
  },

  async checkAndAlert(
    apiKeyId: string,
    apiKeyName: string,
    limit: number,
    orgId: string
  ): Promise<RateLimitAlert | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    // Get current usage from rate limiter
    const usage = getRateLimitUsage(apiKeyId);
    if (!usage) return null;

    const percentage = Math.round((usage.used / limit) * 100);

    // Get alert config
    const config = await RateLimitAlertConfigService.getConfig(orgId);
    if (!config.enabled) return null;

    // Check if we should alert
    let alertType: "warning" | "critical" | "exceeded" | null = null;
    let threshold = 0;

    if (percentage >= 100) {
      alertType = "exceeded";
      threshold = 100;
    } else if (percentage >= config.criticalThreshold) {
      alertType = "critical";
      threshold = config.criticalThreshold;
    } else if (percentage >= config.warningThreshold) {
      alertType = "warning";
      threshold = config.warningThreshold;
    }

    if (!alertType) return null;

    // Check cooldown - don't send duplicate alerts within cooldown period
    const cooldownStart = new Date(Date.now() - config.cooldownMinutes * 60 * 1000).toISOString();
    const recentAlerts = await sql`
      SELECT id FROM rate_limit_alerts
      WHERE organization_id = ${orgId}
        AND api_key_id = ${apiKeyId}
        AND alert_type = ${alertType}
        AND created_at > ${cooldownStart}
      LIMIT 1
    `;

    if (recentAlerts.length > 0) return null;

    // Create alert
    return this.createAlert(apiKeyId, apiKeyName, alertType, threshold, usage.used, limit, orgId);
  },
};

// ============================================================================
// USAGE MONITORING
// ============================================================================

export const RateLimitMonitorService = {
  async getAllKeyUsageStatus(orgId: string): Promise<ApiKeyUsageStatus[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    // Get all active API keys
    const keys = await sql`
      SELECT id, name, key_prefix, rate_limit, last_used_at
      FROM api_keys
      WHERE organization_id = ${orgId} AND status = 'active'
    `;

    const config = await RateLimitAlertConfigService.getConfig(orgId);

    return keys.map((key) => {
      const usage = getRateLimitUsage(key.id as string);
      const used = usage?.used || 0;
      const limit = key.rate_limit as number;
      const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;

      let status: "normal" | "warning" | "critical" | "exceeded" = "normal";
      if (percentage >= 100) status = "exceeded";
      else if (percentage >= config.criticalThreshold) status = "critical";
      else if (percentage >= config.warningThreshold) status = "warning";

      return {
        apiKeyId: key.id as string,
        apiKeyName: key.name as string,
        keyPrefix: key.key_prefix as string,
        limit,
        used,
        percentage,
        status,
        lastUsedAt: key.last_used_at ? String(key.last_used_at) : null,
      };
    });
  },
};
