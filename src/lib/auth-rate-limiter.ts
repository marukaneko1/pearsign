/**
 * Authentication Rate Limiter
 *
 * Provides rate limiting for authentication endpoints to prevent:
 * - Brute force password attacks
 * - Account enumeration
 * - Credential stuffing
 *
 * Uses an in-memory store (for single-server deployments).
 * For production with multiple servers, use Redis.
 */

// Rate limit configuration
const LOGIN_RATE_LIMIT = {
  // Per IP limits
  maxAttemptsPerIP: 10, // Max attempts per IP per window
  ipWindowMs: 15 * 60 * 1000, // 15 minutes

  // Per email limits (stricter)
  maxAttemptsPerEmail: 5, // Max attempts per email per window
  emailWindowMs: 15 * 60 * 1000, // 15 minutes

  // Account lockout
  lockoutThreshold: 10, // After this many failed attempts, lock account temporarily
  lockoutDurationMs: 30 * 60 * 1000, // 30 minute lockout
};

const PASSWORD_RESET_RATE_LIMIT = {
  maxAttemptsPerIP: 5,
  ipWindowMs: 60 * 60 * 1000, // 1 hour
  maxAttemptsPerEmail: 3,
  emailWindowMs: 60 * 60 * 1000, // 1 hour
};

interface RateLimitEntry {
  attempts: number;
  windowStart: number;
  lockedUntil?: number;
}

// In-memory stores
const ipLoginAttempts = new Map<string, RateLimitEntry>();
const emailLoginAttempts = new Map<string, RateLimitEntry>();
const ipPasswordResetAttempts = new Map<string, RateLimitEntry>();
const emailPasswordResetAttempts = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();

  const cleanupMap = (map: Map<string, RateLimitEntry>, windowMs: number) => {
    for (const [key, entry] of map.entries()) {
      // Remove entries older than their window
      if (now - entry.windowStart > windowMs * 2) {
        map.delete(key);
      }
    }
  };

  cleanupMap(ipLoginAttempts, LOGIN_RATE_LIMIT.ipWindowMs);
  cleanupMap(emailLoginAttempts, LOGIN_RATE_LIMIT.emailWindowMs);
  cleanupMap(ipPasswordResetAttempts, PASSWORD_RESET_RATE_LIMIT.ipWindowMs);
  cleanupMap(emailPasswordResetAttempts, PASSWORD_RESET_RATE_LIMIT.emailWindowMs);
}, 5 * 60 * 1000);

export interface AuthRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
}

/**
 * Check if a login attempt should be allowed
 */
export function checkLoginRateLimit(ip: string, email: string): AuthRateLimitResult {
  const now = Date.now();
  const normalizedEmail = email.toLowerCase().trim();

  // Check IP-based rate limit
  let ipEntry = ipLoginAttempts.get(ip);
  if (!ipEntry || now - ipEntry.windowStart > LOGIN_RATE_LIMIT.ipWindowMs) {
    ipEntry = { attempts: 0, windowStart: now };
    ipLoginAttempts.set(ip, ipEntry);
  }

  if (ipEntry.attempts >= LOGIN_RATE_LIMIT.maxAttemptsPerIP) {
    const retryAfterMs = LOGIN_RATE_LIMIT.ipWindowMs - (now - ipEntry.windowStart);
    return {
      allowed: false,
      reason: 'Too many login attempts from this IP. Please try again later.',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  // Check email-based rate limit
  let emailEntry = emailLoginAttempts.get(normalizedEmail);
  if (!emailEntry || now - emailEntry.windowStart > LOGIN_RATE_LIMIT.emailWindowMs) {
    emailEntry = { attempts: 0, windowStart: now };
    emailLoginAttempts.set(normalizedEmail, emailEntry);
  }

  // Check if account is locked
  if (emailEntry.lockedUntil && now < emailEntry.lockedUntil) {
    const retryAfterMs = emailEntry.lockedUntil - now;
    return {
      allowed: false,
      reason: 'This account is temporarily locked due to too many failed attempts.',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  // Check email attempt limit
  if (emailEntry.attempts >= LOGIN_RATE_LIMIT.maxAttemptsPerEmail) {
    // Lock the account
    emailEntry.lockedUntil = now + LOGIN_RATE_LIMIT.lockoutDurationMs;
    const retryAfterMs = LOGIN_RATE_LIMIT.lockoutDurationMs;
    return {
      allowed: false,
      reason: 'Too many failed login attempts. Account temporarily locked.',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: Math.min(
      LOGIN_RATE_LIMIT.maxAttemptsPerIP - ipEntry.attempts,
      LOGIN_RATE_LIMIT.maxAttemptsPerEmail - emailEntry.attempts
    ),
  };
}

/**
 * Record a login attempt (call after checking rate limit)
 * @param success - Whether the login was successful
 */
export function recordLoginAttempt(ip: string, email: string, success: boolean): void {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();

  // Always increment IP attempts
  let ipEntry = ipLoginAttempts.get(ip);
  if (!ipEntry || now - ipEntry.windowStart > LOGIN_RATE_LIMIT.ipWindowMs) {
    ipEntry = { attempts: 0, windowStart: now };
    ipLoginAttempts.set(ip, ipEntry);
  }

  // Get/create email entry
  let emailEntry = emailLoginAttempts.get(normalizedEmail);
  if (!emailEntry || now - emailEntry.windowStart > LOGIN_RATE_LIMIT.emailWindowMs) {
    emailEntry = { attempts: 0, windowStart: now };
    emailLoginAttempts.set(normalizedEmail, emailEntry);
  }

  if (success) {
    // Reset counters on successful login
    emailEntry.attempts = 0;
    emailEntry.lockedUntil = undefined;
    // Don't reset IP counter to prevent IP-based attacks even after success
  } else {
    // Increment both counters on failure
    ipEntry.attempts++;
    emailEntry.attempts++;

    // Check for lockout threshold
    if (emailEntry.attempts >= LOGIN_RATE_LIMIT.lockoutThreshold) {
      emailEntry.lockedUntil = now + LOGIN_RATE_LIMIT.lockoutDurationMs;
      console.log(`[AuthRateLimit] Account locked: ${normalizedEmail}`);
    }
  }

  console.log(`[AuthRateLimit] Login attempt recorded - IP: ${ip} (${ipEntry.attempts}/${LOGIN_RATE_LIMIT.maxAttemptsPerIP}), Email: ${normalizedEmail} (${emailEntry.attempts}/${LOGIN_RATE_LIMIT.maxAttemptsPerEmail}), Success: ${success}`);
}

/**
 * Check if a password reset request should be allowed
 */
export function checkPasswordResetRateLimit(ip: string, email: string): AuthRateLimitResult {
  const now = Date.now();
  const normalizedEmail = email.toLowerCase().trim();

  // Check IP-based rate limit
  let ipEntry = ipPasswordResetAttempts.get(ip);
  if (!ipEntry || now - ipEntry.windowStart > PASSWORD_RESET_RATE_LIMIT.ipWindowMs) {
    ipEntry = { attempts: 0, windowStart: now };
    ipPasswordResetAttempts.set(ip, ipEntry);
  }

  if (ipEntry.attempts >= PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerIP) {
    const retryAfterMs = PASSWORD_RESET_RATE_LIMIT.ipWindowMs - (now - ipEntry.windowStart);
    return {
      allowed: false,
      reason: 'Too many password reset requests. Please try again later.',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  // Check email-based rate limit
  let emailEntry = emailPasswordResetAttempts.get(normalizedEmail);
  if (!emailEntry || now - emailEntry.windowStart > PASSWORD_RESET_RATE_LIMIT.emailWindowMs) {
    emailEntry = { attempts: 0, windowStart: now };
    emailPasswordResetAttempts.set(normalizedEmail, emailEntry);
  }

  if (emailEntry.attempts >= PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerEmail) {
    const retryAfterMs = PASSWORD_RESET_RATE_LIMIT.emailWindowMs - (now - emailEntry.windowStart);
    return {
      allowed: false,
      reason: 'Too many password reset requests for this email. Please try again later.',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: Math.min(
      PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerIP - ipEntry.attempts,
      PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerEmail - emailEntry.attempts
    ),
  };
}

/**
 * Record a password reset request
 */
export function recordPasswordResetAttempt(ip: string, email: string): void {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();

  // Increment IP counter
  let ipEntry = ipPasswordResetAttempts.get(ip);
  if (!ipEntry || now - ipEntry.windowStart > PASSWORD_RESET_RATE_LIMIT.ipWindowMs) {
    ipEntry = { attempts: 0, windowStart: now };
    ipPasswordResetAttempts.set(ip, ipEntry);
  }
  ipEntry.attempts++;

  // Increment email counter
  let emailEntry = emailPasswordResetAttempts.get(normalizedEmail);
  if (!emailEntry || now - emailEntry.windowStart > PASSWORD_RESET_RATE_LIMIT.emailWindowMs) {
    emailEntry = { attempts: 0, windowStart: now };
    emailPasswordResetAttempts.set(normalizedEmail, emailEntry);
  }
  emailEntry.attempts++;

  console.log(`[AuthRateLimit] Password reset recorded - IP: ${ip} (${ipEntry.attempts}/${PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerIP}), Email: ${normalizedEmail} (${emailEntry.attempts}/${PASSWORD_RESET_RATE_LIMIT.maxAttemptsPerEmail})`);
}

/**
 * Get IP address from request
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwarded = (request.headers as Headers).get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIP = (request.headers as Headers).get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  // Fallback
  return 'unknown';
}

/**
 * Get rate limit response headers
 */
export function getRateLimitHeaders(result: AuthRateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};

  if (result.retryAfterSeconds) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  if (result.remainingAttempts !== undefined) {
    headers['X-RateLimit-Remaining'] = String(result.remainingAttempts);
  }

  return headers;
}
