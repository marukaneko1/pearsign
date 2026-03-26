import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock all dependencies before importing the route
vi.mock('@/lib/db', () => ({
  pool: { query: vi.fn() },
  sql: vi.fn(),
}));

vi.mock('@/lib/auth-service', () => ({
  AuthService: {
    login: vi.fn(),
  },
  initializeAuthTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security-enforcement', () => ({
  performSecurityCheck: vi.fn().mockResolvedValue({
    allowed: true,
    require2FA: false,
  }),
}));

vi.mock('@/lib/auth-rate-limiter', () => ({
  checkLoginRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  recordLoginAttempt: vi.fn(),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/audit-log', () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('../auth/login/route');
    const req = makeRequest({ password: 'password' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/email/i);
  });

  it('returns 400 when password is missing', async () => {
    const { POST } = await import('../auth/login/route');
    const req = makeRequest({ email: 'user@example.com' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 401 on invalid credentials', async () => {
    const { AuthService } = await import('@/lib/auth-service');
    vi.mocked(AuthService.login).mockResolvedValueOnce({
      success: false,
      error: 'Invalid email or password',
    } as never);

    const { POST } = await import('../auth/login/route');
    const req = makeRequest({ email: 'user@example.com', password: 'wrongpassword' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns 200 on successful login', async () => {
    const { AuthService } = await import('@/lib/auth-service');
    vi.mocked(AuthService.login).mockResolvedValueOnce({
      success: true,
      user: { id: 'user-1', email: 'user@example.com', tenantId: 'tenant-1' },
      sessionToken: 'tok_abc123',
    } as never);

    const { POST } = await import('../auth/login/route');
    const req = makeRequest({ email: 'user@example.com', password: 'correct' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 429 when rate limited', async () => {
    const { checkLoginRateLimit } = await import('@/lib/auth-rate-limiter');
    vi.mocked(checkLoginRateLimit).mockReturnValueOnce({
      allowed: false,
      reason: 'Too many login attempts. Try again in 15 minutes.',
      retryAfterSeconds: 900,
    });

    const { POST } = await import('../auth/login/route');
    const req = makeRequest({ email: 'user@example.com', password: 'password' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.retryAfter).toBe(900);
  });
});
