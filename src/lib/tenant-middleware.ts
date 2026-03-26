/**
 * PearSign Tenant Middleware
 *
 * Server-side enforcement of tenant boundaries.
 * Every request MUST go through this middleware.
 *
 * SECURITY LAYERS:
 * 1. Session validation (tenant-session.ts)
 * 2. Permission/feature checks (this file)
 * 3. Row Level Security at database level (rls-policies.ts)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireTenantContext,
  checkPermission,
  requirePermission,
  checkFeature,
  requireFeature,
  TenantContext,
  UserPermissions,
  PlanFeatures,
  TenantService,
  PLAN_FEATURES,
  ROLE_PERMISSIONS,
} from './tenant';
import { getTenantSessionContext, type TenantSessionContext } from './tenant-session';
import { setTenantContext as setRLSTenantContext } from './rls-policies';
import { TenantRateLimiter, TenantLimitsService } from './tenant-billing';

// ============== TYPES ==============

export interface TenantApiContext {
  context: TenantContext;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
}

type ApiHandler<T = unknown> = (
  request: NextRequest,
  ctx: TenantApiContext,
  params?: T
) => Promise<NextResponse>;

interface WithTenantOptions {
  requireAuth?: boolean;
  requiredPermissions?: (keyof UserPermissions)[];
  requiredFeatures?: (keyof PlanFeatures)[];
  checkLimits?: ('envelopes' | 'sms' | 'api')[];
  /** Enforce per-tenant rate limiting (API calls per minute/day/month) */
  enforceRateLimit?: boolean;
  /** Check specific usage limits before processing */
  checkUsageLimits?: ('envelopes' | 'templates' | 'team' | 'webhooks' | 'sms' | 'storage')[];
}

// ============== MIDDLEWARE WRAPPER ==============

/**
 * Wrap an API handler with tenant enforcement
 * This is the PRIMARY way to protect API routes
 *
 * Usage:
 * ```ts
 * export const GET = withTenant(async (request, { context, tenantId }) => {
 *   // tenantId is guaranteed to be set and valid
 *   const data = await sql`SELECT * FROM my_table WHERE tenant_id = ${tenantId}`;
 *   return NextResponse.json(data);
 * });
 * ```
 */
export function withTenant<T = unknown>(
  handler: ApiHandler<T>,
  options: WithTenantOptions = {}
): (request: NextRequest, ctx: { params: Promise<T> }) => Promise<NextResponse> {
  return async (request: NextRequest, ctx: { params: Promise<T> }) => {
    try {
      // 1. FIRST try to get session-based tenant context (proper isolation)
      let context: TenantContext | null = null;

      try {
        const sessionContext = await getTenantSessionContext();
        if (sessionContext && sessionContext.isValid) {
          // Convert session context to TenantContext format
          context = {
            tenant: {
              id: sessionContext.session.tenantId,
              name: sessionContext.session.tenantName,
              slug: sessionContext.session.tenantId, // Use ID as slug if not available
              plan: sessionContext.session.tenantPlan,
              status: 'active',
              ownerId: sessionContext.session.userId,
              settings: {},
              billing: { status: 'active' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            user: {
              id: sessionContext.session.userId,
              email: sessionContext.session.userEmail,
              name: sessionContext.session.userName,
              role: sessionContext.session.role,
              permissions: sessionContext.session.permissions,
            },
            features: sessionContext.features,
          };
          // Session context resolved for tenant
        }
      } catch (sessionError) {
        // Session not available - fall back to legacy context
        console.log('[TenantMiddleware] No session available, falling back to legacy context');
      }

      // 2. Fall back to legacy context only if no session
      if (!context) {
        context = options.requireAuth !== false
          ? await requireTenantContext(request)
          : await getTenantContext(request);
      }

      if (!context) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }

      // 2. Check tenant status
      if (context.tenant.status !== 'active') {
        return NextResponse.json(
          {
            error: 'TenantSuspended',
            message: `Your account is ${context.tenant.status}. Please contact support.`
          },
          { status: 403 }
        );
      }

      // 3. Check required permissions
      if (options.requiredPermissions) {
        for (const permission of options.requiredPermissions) {
          if (!checkPermission(context, permission)) {
            return NextResponse.json(
              {
                error: 'PermissionDenied',
                message: `You don't have permission: ${permission}`
              },
              { status: 403 }
            );
          }
        }
      }

      // 4. Check required features
      if (options.requiredFeatures) {
        for (const feature of options.requiredFeatures) {
          if (!checkFeature(context, feature)) {
            return NextResponse.json(
              {
                error: 'FeatureNotAvailable',
                message: `This feature is not available on your ${context.tenant.plan} plan: ${feature}`,
                upgradeRequired: true,
              },
              { status: 403 }
            );
          }
        }
      }

      // 5. Check usage limits (legacy)
      if (options.checkLimits) {
        for (const limitType of options.checkLimits) {
          const limitCheck = await TenantService.checkLimit(context.tenant.id, limitType);
          if (!limitCheck.allowed) {
            return NextResponse.json(
              {
                error: 'LimitExceeded',
                message: `You've reached your monthly ${limitType} limit (${limitCheck.current}/${limitCheck.limit})`,
                limit: limitCheck.limit,
                current: limitCheck.current,
                upgradeRequired: true,
              },
              { status: 429 }
            );
          }
        }
      }

      // 5b. Check rate limits (per-tenant API rate limiting)
      if (options.enforceRateLimit) {
        try {
          const rateResult = await TenantRateLimiter.checkRateLimit(context.tenant.id);
          if (!rateResult.allowed) {
            const headers = TenantRateLimiter.getRateLimitHeaders(rateResult);
            return new NextResponse(
              JSON.stringify({
                error: 'RateLimitExceeded',
                message: `API rate limit exceeded (${rateResult.limitType}). Try again in ${rateResult.retryAfter} seconds.`,
                limit: rateResult.limit,
                current: rateResult.current,
                resetAt: rateResult.resetAt,
                retryAfter: rateResult.retryAfter,
              }),
              {
                status: 429,
                headers: {
                  'Content-Type': 'application/json',
                  ...headers,
                },
              }
            );
          }
        } catch (rateError) {
          console.warn('[TenantMiddleware] Rate limit check failed (non-fatal):', rateError);
          // Continue even if rate limit check fails - don't break functionality
        }
      }

      // 5c. Check specific usage limits (envelopes, templates, etc.)
      if (options.checkUsageLimits) {
        for (const usageType of options.checkUsageLimits) {
          try {
            const usageResult = await TenantRateLimiter.checkUsageLimit(context.tenant.id, usageType);
            if (!usageResult.allowed) {
              return NextResponse.json(
                {
                  error: 'UsageLimitExceeded',
                  message: `You've reached your ${usageType} limit (${usageResult.current}/${usageResult.limit})`,
                  usageType,
                  limit: usageResult.limit,
                  current: usageResult.current,
                  remaining: usageResult.remaining,
                  upgradeRequired: true,
                },
                { status: 429 }
              );
            }
          } catch (usageError) {
            console.warn('[TenantMiddleware] Usage limit check failed (non-fatal):', usageError);
          }
        }
      }

      // 6. Create API context
      const apiContext: TenantApiContext = {
        context,
        tenantId: context.tenant.id,
        userId: context.user.id,
        userEmail: context.user.email || '',
        userName: context.user.name || '',
      };

      // 7. Set RLS tenant context for database-level isolation
      // This is a defense-in-depth measure - even if app code has bugs,
      // the database will enforce tenant isolation
      try {
        await setRLSTenantContext(context.tenant.id);
      } catch (rlsError) {
        console.warn('[TenantMiddleware] Failed to set RLS context (non-fatal):', rlsError);
        // Continue even if RLS setup fails - app-level isolation still works
      }

      // 8. Resolve params if present
      const resolvedParams = ctx?.params ? await ctx.params : undefined;

      // 9. Call the handler
      return await handler(request, apiContext, resolvedParams);

    } catch (error) {
      console.error('[TenantMiddleware] Error:', error);

      if (error instanceof Error) {
        if (error.message.includes('Unauthorized')) {
          return NextResponse.json(
            { error: 'Unauthorized', message: error.message },
            { status: 401 }
          );
        }
        if (error.message.includes('Permission denied')) {
          return NextResponse.json(
            { error: 'PermissionDenied', message: error.message },
            { status: 403 }
          );
        }
        if (error.message.includes('Feature not available')) {
          return NextResponse.json(
            { error: 'FeatureNotAvailable', message: error.message },
            { status: 403 }
          );
        }
        if (error.message.includes('is suspended') || error.message.includes('is cancelled')) {
          return NextResponse.json(
            { error: 'TenantSuspended', message: error.message },
            { status: 403 }
          );
        }
      }

      return NextResponse.json(
        { error: 'InternalError', message: 'An unexpected error occurred' },
        { status: 500 }
      );
    }
  };
}

/**
 * Public API handler (no auth required, but still tracks tenant if available)
 */
export function withPublicApi<T = unknown>(
  handler: ApiHandler<T>
): (request: NextRequest, ctx: { params: Promise<T> }) => Promise<NextResponse> {
  return withTenant(handler, { requireAuth: false });
}

/**
 * Admin-only API handler
 */
export function withAdmin<T = unknown>(
  handler: ApiHandler<T>
): (request: NextRequest, ctx: { params: Promise<T> }) => Promise<NextResponse> {
  return withTenant(handler, {
    requiredPermissions: ['canManageSettings'],
  });
}

/**
 * Owner-only API handler
 */
export function withOwner<T = unknown>(
  handler: ApiHandler<T>
): (request: NextRequest, ctx: { params: Promise<T> }) => Promise<NextResponse> {
  return withTenant(handler, {
    requiredPermissions: ['canManageBilling'],
  });
}

// ============== HELPER: Tenant-scoped SQL ==============

/**
 * Create a tenant-scoped query helper
 * This ensures all queries include tenant_id
 */
export function createTenantQuery(tenantId: string) {
  return {
    /**
     * Add tenant_id to WHERE clause
     * Usage: `AND ${tenantQuery.where()}`
     */
    whereClause: () => `tenant_id = '${tenantId}'`,

    /**
     * The tenant ID for use in queries
     */
    id: tenantId,
  };
}

// ============== AUDIT LOG INTEGRATION ==============

/**
 * Log action with tenant context
 */
export async function logTenantAction(
  context: TenantContext,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  // Import here to avoid circular dependency
  const { AuditLogService } = await import('./audit-log');

  await AuditLogService.log({
    orgId: context.tenant.id,
    userId: context.user.id,
    action: action as Parameters<typeof AuditLogService.log>[0]['action'],
    entityType: entityType as Parameters<typeof AuditLogService.log>[0]['entityType'],
    entityId,
    actorId: context.user.id,
    actorName: context.user.name,
    actorEmail: context.user.email,
    details: {
      ...details,
      tenantId: context.tenant.id,
      tenantPlan: context.tenant.plan,
    },
  });
}

// ============== FEATURE GATE HELPERS ==============

/**
 * Feature gate wrapper for specific features
 */
export const FeatureGates = {
  bulkSend: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['bulkSend'] }),

  fusionForms: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['fusionForms'] }),

  phoneVerification: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['phoneVerification'] }),

  webhooks: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['webhooks'] }),

  apiAccess: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['apiAccess'] }),

  sso: <T = unknown>(handler: ApiHandler<T>) =>
    withTenant(handler, { requiredFeatures: ['ssoEnabled'] }),
};

// ============== RATE LIMIT INTEGRATION ==============

/**
 * Check and increment usage for envelope sending
 */
export async function checkAndIncrementEnvelopeUsage(tenantId: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const check = await TenantService.checkLimit(tenantId, 'envelopes');

  if (check.allowed) {
    await TenantService.incrementUsage(tenantId, 'envelopes_sent');
  }

  return {
    allowed: check.allowed,
    remaining: check.remaining - (check.allowed ? 1 : 0),
  };
}

/**
 * Check and increment usage for SMS
 */
export async function checkAndIncrementSmsUsage(tenantId: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const check = await TenantService.checkLimit(tenantId, 'sms');

  if (check.allowed) {
    await TenantService.incrementUsage(tenantId, 'sms_sent');
  }

  return {
    allowed: check.allowed,
    remaining: check.remaining - (check.allowed ? 1 : 0),
  };
}

/**
 * Check and increment API usage
 */
export async function incrementApiUsage(tenantId: string): Promise<void> {
  await TenantService.incrementUsage(tenantId, 'api_calls');
}
