import { describe, it, expect } from 'vitest';

/**
 * Unit tests for middleware authentication and route access logic.
 * These test the pure logic without requiring Next.js runtime.
 */

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/public/',
  '/api/health',
];

const ADMIN_API_PREFIXES = [
  '/api/admin/',
];

const V1_API_PREFIXES = [
  '/api/v1/',
];

const PUBLIC_V1_PATHS = [
  '/api/v1/auth/token',
];

function classifyRoute(pathname: string): 'public' | 'admin' | 'v1' | 'tenant' {
  if (PUBLIC_V1_PATHS.includes(pathname)) return 'public';
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return 'public';
  if (ADMIN_API_PREFIXES.some(p => pathname.startsWith(p))) return 'admin';
  if (V1_API_PREFIXES.some(p => pathname.startsWith(p))) return 'v1';
  return 'tenant';
}

describe('Middleware Route Classification', () => {
  describe('Public routes', () => {
    it('classifies auth routes as public', () => {
      expect(classifyRoute('/api/auth/login')).toBe('public');
      expect(classifyRoute('/api/auth/register')).toBe('public');
      expect(classifyRoute('/api/auth/forgot-password')).toBe('public');
    });

    it('classifies public routes as public', () => {
      expect(classifyRoute('/api/public/sign/token123/route')).toBe('public');
      expect(classifyRoute('/api/health')).toBe('public');
    });

    it('classifies public v1 token endpoint as public', () => {
      expect(classifyRoute('/api/v1/auth/token')).toBe('public');
    });
  });

  describe('Admin routes', () => {
    it('classifies admin routes correctly', () => {
      expect(classifyRoute('/api/admin/tenants')).toBe('admin');
      expect(classifyRoute('/api/admin/bootstrap')).toBe('admin');
      expect(classifyRoute('/api/admin/seed-invoices')).toBe('admin');
    });
  });

  describe('V1 API routes', () => {
    it('classifies v1 routes correctly', () => {
      expect(classifyRoute('/api/v1/envelopes')).toBe('v1');
      expect(classifyRoute('/api/v1/documents')).toBe('v1');
      expect(classifyRoute('/api/v1/templates')).toBe('v1');
    });

    it('does not classify public v1 path as v1', () => {
      expect(classifyRoute('/api/v1/auth/token')).not.toBe('v1');
    });
  });

  describe('Tenant routes', () => {
    it('classifies regular API routes as tenant', () => {
      expect(classifyRoute('/api/envelopes')).toBe('tenant');
      expect(classifyRoute('/api/documents')).toBe('tenant');
      expect(classifyRoute('/api/invoices')).toBe('tenant');
      expect(classifyRoute('/api/settings/branding')).toBe('tenant');
    });
  });
});

describe('Authentication Header Parsing', () => {
  const extractBearerToken = (authHeader: string | null): string | null => {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7).trim();
    return token.length > 0 ? token : null;
  };

  it('extracts bearer token from Authorization header', () => {
    expect(extractBearerToken('Bearer pk_live_abc123')).toBe('pk_live_abc123');
  });

  it('returns null for missing Authorization header', () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it('returns null for non-Bearer header', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
  });

  it('returns null for empty bearer token', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('Admin Key Validation', () => {
  const validateAdminKey = (providedKey: string | null, storedKey: string | undefined): boolean => {
    if (!storedKey || !providedKey) return false;
    return providedKey === storedKey;
  };

  it('accepts correct admin key', () => {
    expect(validateAdminKey('secret-key', 'secret-key')).toBe(true);
  });

  it('rejects incorrect admin key', () => {
    expect(validateAdminKey('wrong-key', 'secret-key')).toBe(false);
  });

  it('rejects when admin key is not configured', () => {
    expect(validateAdminKey('any-key', undefined)).toBe(false);
  });

  it('rejects when no key is provided', () => {
    expect(validateAdminKey(null, 'secret-key')).toBe(false);
  });
});
