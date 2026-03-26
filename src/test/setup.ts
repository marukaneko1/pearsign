import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Headers(),
}));

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.SENDGRID_API_KEY = 'test-api-key';
process.env.SENDGRID_FROM_EMAIL = 'test@example.com';
process.env.ADMIN_SECRET_KEY = 'test-admin-key';

// Global fetch mock
global.fetch = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
