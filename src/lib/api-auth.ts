import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService, ApiAuditLogService, type ApiKey, type ApiKeyPermission } from "./api-keys";
import { checkRateLimit, getRateLimitHeaders } from "./rate-limiter";
import { TenantRateLimiter } from "./tenant-billing";

// ============================================================================
// TYPES
// ============================================================================

export interface AuthenticatedRequest {
  apiKey: ApiKey;
  organizationId: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const API_ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  RATE_LIMITED: "rate_limited",
  INVALID_REQUEST: "invalid_request",
  NOT_FOUND: "not_found",
  INTERNAL_ERROR: "internal_error",
  PERMISSION_DENIED: "permission_denied",
} as const;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function apiError(
  code: keyof typeof API_ERROR_CODES,
  message: string,
  status: number,
  details?: unknown,
  headers?: Record<string, string>
): NextResponse<ApiErrorResponse> {
  const response = NextResponse.json(
    {
      error: {
        code: API_ERROR_CODES[code],
        message,
        details,
      },
    },
    { status, headers }
  );

  return response;
}

export function apiSuccess<T>(data: T, status: number = 200, headers?: Record<string, string>): NextResponse<T> {
  return NextResponse.json(data, { status, headers });
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

export interface AuthMiddlewareOptions {
  requiredPermissions?: ApiKeyPermission[];
  requireAllPermissions?: boolean; // default true
  skipRateLimit?: boolean;
  skipAuditLog?: boolean;
}

export type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthenticatedRequest
) => Promise<NextResponse>;

/**
 * Wrap an API handler with authentication middleware
 */
export function withApiAuth(
  handler: AuthenticatedHandler,
  options: AuthMiddlewareOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    let apiKey: ApiKey | null = null;
    let statusCode = 500;
    let errorMessage: string | null = null;

    try {
      // Extract authorization header
      const authHeader = request.headers.get("authorization");

      if (!authHeader) {
        return apiError("UNAUTHORIZED", "Missing Authorization header", 401);
      }

      // Expect format: Bearer ps_live_xxx.secret
      if (!authHeader.startsWith("Bearer ")) {
        return apiError("UNAUTHORIZED", "Invalid Authorization header format. Expected: Bearer <api_key>", 401);
      }

      const fullKey = authHeader.slice(7); // Remove "Bearer "

      if (!fullKey || !fullKey.includes(".")) {
        return apiError("UNAUTHORIZED", "Invalid API key format", 401);
      }

      // Validate API key
      apiKey = await ApiKeyService.validateKey(fullKey);

      if (!apiKey) {
        return apiError("UNAUTHORIZED", "Invalid or expired API key", 401);
      }

      // Check if key is revoked
      if (apiKey.status === "revoked") {
        return apiError("UNAUTHORIZED", "API key has been revoked", 401);
      }

      // Check permissions
      if (options.requiredPermissions && options.requiredPermissions.length > 0) {
        const hasPermission = options.requireAllPermissions !== false
          ? ApiKeyService.hasAllPermissions(apiKey, options.requiredPermissions)
          : ApiKeyService.hasAnyPermission(apiKey, options.requiredPermissions);

        if (!hasPermission) {
          return apiError(
            "PERMISSION_DENIED",
            `Missing required permissions: ${options.requiredPermissions.join(", ")}`,
            403
          );
        }
      }

      // Check per-key rate limit
      if (!options.skipRateLimit) {
        const rateLimitResult = checkRateLimit(apiKey.id, apiKey.rateLimit);

        if (!rateLimitResult.allowed) {
          const headers = getRateLimitHeaders(rateLimitResult);
          return apiError(
            "RATE_LIMITED",
            "Rate limit exceeded. Please retry after the specified time.",
            429,
            { retryAfter: rateLimitResult.retryAfter },
            headers
          );
        }

        // Also check tenant-level rate limits (per-minute, per-day, per-month)
        try {
          const tenantRateResult = await TenantRateLimiter.checkRateLimit(apiKey.organizationId);
          if (!tenantRateResult.allowed) {
            const headers = TenantRateLimiter.getRateLimitHeaders(tenantRateResult);
            return apiError(
              "RATE_LIMITED",
              `Organization API rate limit exceeded (${tenantRateResult.limitType}). Retry after ${tenantRateResult.retryAfter} seconds.`,
              429,
              {
                limitType: tenantRateResult.limitType,
                current: tenantRateResult.current,
                limit: tenantRateResult.limit,
                retryAfter: tenantRateResult.retryAfter,
              },
              headers
            );
          }
        } catch (tenantRateError) {
          // Non-fatal - continue if tenant rate limit check fails
          console.warn('[API Auth] Tenant rate limit check failed (non-fatal):', tenantRateError);
        }
      }

      // Update last used timestamp
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                 request.headers.get("x-real-ip") ||
                 "unknown";
      await ApiKeyService.recordUsage(apiKey.id, ip);

      // Call the actual handler
      const auth: AuthenticatedRequest = {
        apiKey,
        organizationId: apiKey.organizationId,
      };

      const response = await handler(request, auth);
      statusCode = response.status;

      return response;
    } catch (error) {
      console.error("API Auth Error:", error);
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      statusCode = 500;
      return apiError("INTERNAL_ERROR", "An internal error occurred", 500);
    } finally {
      // Log the request (unless skipped)
      if (!options.skipAuditLog && apiKey) {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                   request.headers.get("x-real-ip") ||
                   "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        try {
          await ApiAuditLogService.log({
            apiKeyId: apiKey.id,
            organizationId: apiKey.organizationId,
            endpoint: request.nextUrl.pathname,
            method: request.method,
            statusCode,
            ip,
            userAgent,
            requestBody: null, // Don't log request bodies for security
            responseTime: Date.now() - startTime,
            errorMessage,
          });
        } catch (logError) {
          console.error("Failed to log API request:", logError);
        }
      }
    }
  };
}

/**
 * Helper to extract and validate pagination params
 */
export function getPaginationParams(request: NextRequest): { limit: number; offset: number; page: number } {
  const searchParams = request.nextUrl.searchParams;

  let limit = parseInt(searchParams.get("limit") || "20", 10);
  let page = parseInt(searchParams.get("page") || "1", 10);

  // Clamp values
  limit = Math.min(Math.max(1, limit), 100);
  page = Math.max(1, page);

  const offset = (page - 1) * limit;

  return { limit, offset, page };
}

/**
 * Helper to build pagination response metadata
 */
export function buildPaginationMeta(
  total: number,
  limit: number,
  page: number
): { total: number; page: number; limit: number; pages: number; hasMore: boolean } {
  const pages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    pages,
    hasMore: page < pages,
  };
}
