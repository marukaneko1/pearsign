/**
 * Login API Route
 *
 * POST /api/auth/login
 * Authenticates a user and creates a session
 *
 * Security features:
 * - Rate limiting (IP + email based)
 * - Account lockout after failed attempts
 * - Security checks (IP restrictions, 2FA)
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService, initializeAuthTables } from '@/lib/auth-service';
import { cookies } from 'next/headers';
import { performSecurityCheck } from '@/lib/security-enforcement';
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  getClientIP,
  getRateLimitHeaders,
} from '@/lib/auth-rate-limiter';
import { logSystemEvent } from '@/lib/audit-log';

// Session cookie name - must match tenant-session.ts
const TENANT_SESSION_COOKIE = 'pearsign_tenant_session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] Login attempt for:', email);

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkLoginRateLimit(clientIP, email);

    if (!rateLimitResult.allowed) {
      if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] Rate limited:', email, 'IP:', clientIP, 'Reason:', rateLimitResult.reason);
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...getRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    // Initialize tables if needed
    await initializeAuthTables();

    // Attempt login
    let result;
    try {
      result = await AuthService.login(email, password);
    } catch (loginError) {
      console.error('[Auth/Login] AuthService.login threw error:', loginError);
      return NextResponse.json(
        { success: false, error: loginError instanceof Error ? loginError.message : 'Login failed' },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] Login result:', {
      success: result.success,
      hasUser: !!result.user,
      hasTenant: !!result.tenant,
      tenantId: result.tenant?.id,
      tenantName: result.tenant?.name,
      error: result.error,
    });

    if (!result.success) {
      // Record failed login attempt for rate limiting
      recordLoginAttempt(clientIP, email, false);

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }

    // Record successful login - resets email counter
    recordLoginAttempt(clientIP, email, true);

    // Perform security checks (IP restrictions, 2FA requirement)
    if (result.tenant && result.user) {
      try {
        const securityCheck = await performSecurityCheck(
          result.tenant.id,
          result.user.id,
          request.headers
        );

        if (!securityCheck.allowed) {
          if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] Security check failed:', securityCheck.reason);

          // Return specific error based on what's required
          if (securityCheck.requiresAction === 'enable_2fa') {
            return NextResponse.json({
              success: false,
              error: securityCheck.reason,
              requires2FA: true,
              user: result.user, // Include user so they can enable 2FA
              tenant: result.tenant,
            }, { status: 403 });
          }

          if (securityCheck.requiresAction === 'ip_blocked') {
            return NextResponse.json({
              success: false,
              error: securityCheck.reason,
              ipBlocked: true,
              details: securityCheck.details,
            }, { status: 403 });
          }

          return NextResponse.json(
            { success: false, error: securityCheck.reason },
            { status: 403 }
          );
        }
      } catch (securityError) {
        console.warn('[Auth/Login] Security check error (non-fatal):', securityError);
        // Continue with login even if security check fails
      }
    }

    // Get the session cookie that was set by createTenantSession
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(TENANT_SESSION_COOKIE);

    if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] Session cookie check:', {
      found: !!sessionCookie?.value,
      cookieLength: sessionCookie?.value?.length || 0,
    });

    // Fire audit event (non-blocking — never fail the login over a log write)
    if (result.tenant?.id && result.user) {
      logSystemEvent('system.login', {
        orgId: result.tenant.id,
        userId: result.user.id,
        actorId: result.user.id,
        actorName: (result.user.firstName && result.user.lastName)
          ? `${result.user.firstName} ${result.user.lastName}`.trim()
          : result.user.email,
        actorEmail: result.user.email,
        ipAddress: clientIP,
        details: { email: result.user.email },
      });
    }

    // Create response with session info
    const response = NextResponse.json({
      success: true,
      user: result.user,
      tenant: result.tenant,
      message: 'Login successful',
    });

    // Explicitly set the session cookie on the response to ensure it's sent
    if (sessionCookie?.value) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      response.cookies.set(TENANT_SESSION_COOKIE, sessionCookie.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });

      if (process.env.NODE_ENV !== 'production') console.log('[Auth/Login] SUCCESS - Session cookie set on response:', sessionCookie.value.substring(0, 20) + '...');
    } else {
      console.error('[Auth/Login] CRITICAL - No session cookie found after successful login! User:', email);
      // Still return success but log this issue
    }

    return response;
  } catch (error) {
    console.error('[Auth/Login] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
