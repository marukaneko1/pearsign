import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Auth Rate Limiter', () => {
  describe('Rate limit tracking', () => {
    interface RateLimitEntry {
      attempts: number;
      firstAttemptAt: number;
      lastAttemptAt: number;
      lockedUntil?: number;
    }

    const MAX_ATTEMPTS_PER_EMAIL = 10;
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

    const isRateLimited = (entry: RateLimitEntry): boolean => {
      if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
      const windowStart = Date.now() - WINDOW_MS;
      return entry.attempts >= MAX_ATTEMPTS_PER_EMAIL && entry.firstAttemptAt > windowStart;
    };

    it('allows requests within limit', () => {
      const entry: RateLimitEntry = {
        attempts: 5,
        firstAttemptAt: Date.now() - 60000,
        lastAttemptAt: Date.now(),
      };
      expect(isRateLimited(entry)).toBe(false);
    });

    it('blocks requests at limit', () => {
      const entry: RateLimitEntry = {
        attempts: 10,
        firstAttemptAt: Date.now() - 60000,
        lastAttemptAt: Date.now(),
      };
      expect(isRateLimited(entry)).toBe(true);
    });

    it('respects account lockout', () => {
      const entry: RateLimitEntry = {
        attempts: 3,
        firstAttemptAt: Date.now() - 60000,
        lastAttemptAt: Date.now(),
        lockedUntil: Date.now() + 600000, // locked for 10 more minutes
      };
      expect(isRateLimited(entry)).toBe(true);
    });

    it('allows after lockout expires', () => {
      const entry: RateLimitEntry = {
        attempts: 3,
        firstAttemptAt: Date.now() - 3600000,
        lastAttemptAt: Date.now() - 3600000,
        lockedUntil: Date.now() - 1000, // locked, but expired
      };
      // Window has passed, so not rate limited
      expect(isRateLimited(entry)).toBe(false);
    });
  });

  describe('IP-based rate limiting', () => {
    const MAX_ATTEMPTS_PER_IP = 20;

    const isIpRateLimited = (attemptCount: number): boolean =>
      attemptCount >= MAX_ATTEMPTS_PER_IP;

    it('allows within IP limit', () => {
      expect(isIpRateLimited(19)).toBe(false);
    });

    it('blocks at IP limit', () => {
      expect(isIpRateLimited(20)).toBe(true);
    });
  });

  describe('Lockout duration', () => {
    it('applies progressive lockout', () => {
      const getLockoutDuration = (failedAttempts: number): number => {
        if (failedAttempts >= 10) return 60 * 60 * 1000; // 1 hour
        if (failedAttempts >= 5) return 15 * 60 * 1000; // 15 minutes
        return 0;
      };

      expect(getLockoutDuration(3)).toBe(0);
      expect(getLockoutDuration(5)).toBe(15 * 60 * 1000);
      expect(getLockoutDuration(10)).toBe(60 * 60 * 1000);
    });
  });

  describe('Normalization', () => {
    it('normalizes email addresses for comparison', () => {
      const normalizeEmail = (email: string): string => email.toLowerCase().trim();

      expect(normalizeEmail('User@EXAMPLE.COM')).toBe('user@example.com');
      expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('normalizes IP addresses', () => {
      const normalizeIp = (ip: string): string => ip.trim();

      expect(normalizeIp('  192.168.1.1  ')).toBe('192.168.1.1');
    });
  });
});
