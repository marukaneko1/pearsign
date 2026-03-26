/**
 * Session Management API Routes
 *
 * GET - Get all active sessions
 * DELETE - Terminate a specific session or all other sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { getCurrentSessionId } from '@/lib/tenant-session';
import {
  getActiveSessions,
  terminateSession,
  terminateAllOtherSessions,
  getSessionCount,
} from '@/lib/session-management';
import { ImmutableAuditLogService } from '@/lib/immutable-audit-log';

/**
 * GET - Get all active sessions for the current user
 */
export const GET = withTenant(
  async (_request: NextRequest, { userId }: TenantApiContext) => {
    try {
      const currentSessionId = await getCurrentSessionId();
      const sessions = await getActiveSessions(userId, currentSessionId || undefined);
      const totalCount = await getSessionCount(userId);

      return NextResponse.json({
        sessions,
        totalCount,
        currentSessionId,
      });
    } catch (error) {
      console.error('[Sessions] Error getting sessions:', error);
      return NextResponse.json(
        { error: 'Failed to get sessions' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE - Terminate session(s)
 *
 * Body:
 * - sessionId: string - Terminate a specific session
 * - terminateAll: boolean - Terminate all sessions except current
 */
export const DELETE = withTenant(
  async (request: NextRequest, { tenantId, userId, userEmail }: TenantApiContext) => {
    try {
      const currentSessionId = await getCurrentSessionId();
      if (!currentSessionId) {
        return NextResponse.json(
          { error: 'Could not identify current session' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const { sessionId, terminateAll } = body;

      if (terminateAll) {
        // Terminate all other sessions
        const result = await terminateAllOtherSessions(userId, currentSessionId);

        // Log audit event
        await ImmutableAuditLogService.append({
          tenantId: tenantId,
          action: 'user.logout',
          entityType: 'sessions',
          entityId: userId,
          actorType: 'user',
          actorId: userId,
          actorEmail: userEmail,
          details: {
            event: 'all_sessions_terminated',
            terminatedCount: result.count,
            preservedSessionId: currentSessionId,
          },
        });

        return NextResponse.json({
          success: true,
          count: result.count,
          message: `Successfully terminated ${result.count} other session${result.count !== 1 ? 's' : ''}.`,
        });
      }

      if (sessionId) {
        // Terminate specific session
        const result = await terminateSession(userId, sessionId, currentSessionId);

        if (!result.success) {
          return NextResponse.json(
            { error: result.message },
            { status: 400 }
          );
        }

        // Log audit event
        await ImmutableAuditLogService.append({
          tenantId: tenantId,
          action: 'user.logout',
          entityType: 'sessions',
          entityId: sessionId,
          actorType: 'user',
          actorId: userId,
          actorEmail: userEmail,
          details: {
            event: 'session_terminated',
            terminatedSessionId: sessionId,
            currentSessionId,
          },
        });

        return NextResponse.json({
          success: true,
          message: result.message,
        });
      }

      return NextResponse.json(
        { error: 'Either sessionId or terminateAll is required' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[Sessions] Error terminating session:', error);
      return NextResponse.json(
        { error: 'Failed to terminate session' },
        { status: 500 }
      );
    }
  }
);
