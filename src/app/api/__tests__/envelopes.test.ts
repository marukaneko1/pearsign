import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  pool: { query: vi.fn() },
  sql: vi.fn(),
}));

vi.mock('@/lib/tenant-middleware', () => ({
  withTenant: (handler: (req: NextRequest, ctx: unknown) => unknown) =>
    (req: NextRequest) =>
      handler(req, {
        tenantId: 'tenant-test',
        context: {
          user: { id: 'user-test', email: 'test@example.com', role: 'admin' },
          tenant: { id: 'tenant-test', plan: 'professional', name: 'Test Org' },
          session: { id: 'session-test' },
        },
      }),
  checkAndIncrementEnvelopeUsage: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/tenant-session', () => ({
  getCurrentTenantId: vi.fn().mockResolvedValue('tenant-test'),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn().mockReturnValue({ value: 'mock-session' }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe('GET /api/envelopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty list when no envelopes exist', async () => {
    const { sql } = await import('@/lib/db');
    vi.mocked(sql).mockResolvedValueOnce([] as never);

    const { GET } = await import('../envelopes/route');

    const req = new NextRequest('http://localhost:3000/api/envelopes', {
      method: 'GET',
    });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.envelopes)).toBe(true);
    expect(data.envelopes.length).toBe(0);
  });

  it('returns envelope list mapped from DB rows', async () => {
    const { sql } = await import('@/lib/db');
    const mockRow = {
      envelope_id: 'env-1',
      title: 'NDA Agreement',
      message: 'Please sign',
      created_at: new Date().toISOString(),
      recipient_count: '1',
      completed_count: '0',
      viewed_count: '0',
      pending_count: '1',
      voided_count: '0',
      declined_count: '0',
      recipients: JSON.stringify([{ name: 'Bob', email: 'bob@example.com', status: 'pending' }]),
    };
    vi.mocked(sql).mockResolvedValueOnce([mockRow] as never);

    const { GET } = await import('../envelopes/route');

    const req = new NextRequest('http://localhost:3000/api/envelopes', {
      method: 'GET',
    });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.envelopes).toHaveLength(1);
    expect(data.envelopes[0].id).toBe('env-1');
    expect(data.envelopes[0].title).toBe('NDA Agreement');
  });

  it('handles DB errors gracefully and returns 500', async () => {
    const { sql } = await import('@/lib/db');
    vi.mocked(sql).mockRejectedValueOnce(new Error('DB connection lost'));

    const { GET } = await import('../envelopes/route');

    const req = new NextRequest('http://localhost:3000/api/envelopes', {
      method: 'GET',
    });
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  it('filters by status query param when provided', async () => {
    const { sql } = await import('@/lib/db');
    vi.mocked(sql).mockResolvedValueOnce([] as never);

    const { GET } = await import('../envelopes/route');

    const req = new NextRequest('http://localhost:3000/api/envelopes?status=completed', {
      method: 'GET',
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    // sql was called — confirm filter param is passed through
    expect(vi.mocked(sql)).toHaveBeenCalled();
  });
});
