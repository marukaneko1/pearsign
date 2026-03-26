/**
 * Enterprise Rate Limiter - Sliding Window Algorithm
 *
 * Features:
 * - Per API key rate limiting
 * - Sliding window for accurate rate limiting
 * - In-memory storage (for production, use Redis)
 * - Rate limit headers support
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  requests: number[]; // timestamps of requests in current window
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp when window resets
  retryAfter?: number; // Seconds until next request allowed
}

// In-memory store (for production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Window size in milliseconds (1 minute)
const WINDOW_SIZE_MS = 60 * 1000;

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > WINDOW_SIZE_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for an API key using sliding window algorithm
 */
export function checkRateLimit(apiKeyId: string, limit: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;

  let entry = rateLimitStore.get(apiKeyId);

  if (!entry) {
    entry = {
      count: 0,
      windowStart: now,
      requests: [],
    };
    rateLimitStore.set(apiKeyId, entry);
  }

  // Remove requests outside the current window
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

  // Calculate current count in the sliding window
  const currentCount = entry.requests.length;

  if (currentCount >= limit) {
    // Rate limited
    const oldestRequest = entry.requests[0] || now;
    const resetAt = oldestRequest + WINDOW_SIZE_MS;
    const retryAfter = Math.ceil((resetAt - now) / 1000);

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: Math.ceil(resetAt / 1000),
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Add current request
  entry.requests.push(now);

  return {
    allowed: true,
    limit,
    remaining: limit - entry.requests.length,
    resetAt: Math.ceil((now + WINDOW_SIZE_MS) / 1000),
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };

  if (result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Reset rate limit for an API key (useful for testing)
 */
export function resetRateLimit(apiKeyId: string): void {
  rateLimitStore.delete(apiKeyId);
}

/**
 * Get current usage for an API key
 */
export function getRateLimitUsage(apiKeyId: string): { used: number; windowStart: number } | null {
  const entry = rateLimitStore.get(apiKeyId);
  if (!entry) return null;

  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;
  const validRequests = entry.requests.filter(t => t > windowStart);

  return {
    used: validRequests.length,
    windowStart: entry.windowStart,
  };
}
