import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB pool before importing the route handler
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
  sql: vi.fn(),
}));

import { GET } from '../health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with status ok when DB is healthy', async () => {
    const { pool } = await import('@/lib/db');
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.database).toBe('ok');
  });

  it('returns 503 with status degraded when DB query fails', async () => {
    const { pool } = await import('@/lib/db');
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('Connection refused'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.database).toBe('error');
  });
});
