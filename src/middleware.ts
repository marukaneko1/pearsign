/**
 * PearSign Global Next.js Middleware
 *
 * First line of defense for auth enforcement. Protects all API routes by
 * checking for a valid session cookie before requests reach route handlers.
 * Individual routes still run their own withTenant/withApiAuth checks.
 */

import { NextRequest, NextResponse } from 'next/server';

const TENANT_SESSION_COOKIE = 'pearsign_tenant_session';

// Routes that are allowed without a session cookie
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/public/',
  '/api/health',
  '/api/verify',
  '/api/billing/webhook',
  '/api/webhooks/stripe',
  '/api/cron/',
  '/api/invite',
  // OAuth callbacks
  '/api/settings/google-drive/callback',
  '/api/settings/dropbox/callback',
  '/api/settings/salesforce/callback',
];

// Routes that require X-Admin-Key header (checked by individual handlers)
const ADMIN_API_PREFIXES = ['/api/admin/'];

// Routes that require Authorization: Bearer header (checked by individual handlers)
const V1_API_PREFIXES = ['/api/v1/'];

// Public V1 routes (open API spec)
const PUBLIC_V1_PATHS = ['/api/v1/openapi.json'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow public V1 paths
  if (PUBLIC_V1_PATHS.some(path => pathname === path)) {
    return NextResponse.next();
  }

  // Allow explicitly public API routes
  if (PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Admin routes: require X-Admin-Key header
  if (ADMIN_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const adminKey = request.headers.get('x-admin-key');
    const expectedKey = process.env.ADMIN_SECRET_KEY;
    if (!expectedKey || !adminKey || adminKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin authentication required.' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // V1 API routes: require Authorization: Bearer header OR a valid session cookie.
  // External integrations use Bearer tokens; the in-app UI uses session cookies.
  if (V1_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const authHeader = request.headers.get('authorization');
    const sessionCookie = request.cookies.get(TENANT_SESSION_COOKIE);
    if (!authHeader?.startsWith('Bearer ') && !sessionCookie?.value) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'API key required. Use Authorization: Bearer <key>.' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // All other API routes: require tenant session cookie
  const sessionCookie = request.cookies.get(TENANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required. Please log in.' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
