/**
 * Notifications SSE Stream API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Server-Sent Events for real-time notifications
 *
 * HARDENED: All lookups wrapped in try/catch to prevent SSE crashes
 */

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/notifications';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { ensureNotificationsTable } from '@/lib/tenant-config-init';

/**
 * GET /api/notifications/stream
 * Server-Sent Events endpoint for real-time notifications
 *
 * HARDENED: Returns empty stream on errors, never crashes
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    // Ensure notifications table exists first
    try {
      await ensureNotificationsTable();
    } catch (error) {
      console.error('[SSE] Failed to ensure notifications table:', error);
      // Continue anyway - we'll handle errors in the polling
    }

    // Create a TransformStream to handle SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Send keep-alive and check for new notifications
    let lastCount = 0;
    let isAborted = false;

    // Safe write helper that handles errors
    const safeWrite = async (data: string): Promise<boolean> => {
      if (isAborted) return false;
      try {
        await writer.write(encoder.encode(data));
        return true;
      } catch (error) {
        console.error('[SSE] Write error:', error);
        return false;
      }
    };

    // Initial send of current unread count
    const sendCount = async () => {
      if (isAborted) return;
      try {
        const count = await NotificationService.getUnreadCount(tenantId, userId);
        if (count !== lastCount) {
          lastCount = count;
          const data = JSON.stringify({ type: 'count', count });
          await safeWrite(`data: ${data}\n\n`);
        }
      } catch (error) {
        console.error('[SSE] Error getting unread count:', error);
        // Send zero count on error - don't crash
        if (lastCount !== 0) {
          lastCount = 0;
          await safeWrite(`data: ${JSON.stringify({ type: 'count', count: 0 })}\n\n`);
        }
      }
    };

    // Send initial count (wrapped in try/catch)
    try {
      await sendCount();
    } catch (error) {
      console.error('[SSE] Initial sendCount error:', error);
    }

    // Poll for new notifications every 10 seconds
    const interval = setInterval(async () => {
      if (isAborted) {
        clearInterval(interval);
        return;
      }

      try {
        // Check for new notifications since last check
        const result = await NotificationService.getForUser(tenantId, userId, {
          limit: 10,
          unreadOnly: true,
        });

        const count = result.total;

        // If count changed, send update
        if (count !== lastCount) {
          lastCount = count;
          const data = JSON.stringify({
            type: 'update',
            count,
            notifications: result.notifications.slice(0, 5),
          });
          await safeWrite(`data: ${data}\n\n`);
        } else {
          // Send keep-alive
          await safeWrite(`: keep-alive\n\n`);
        }
      } catch (error) {
        console.error('[SSE] Polling error:', error);
        // Send keep-alive on error to maintain connection
        try {
          await safeWrite(`: keep-alive-error\n\n`);
        } catch {
          // Connection likely closed
        }
      }
    }, 10000); // Poll every 10 seconds

    // Handle connection close
    request.signal.addEventListener('abort', () => {
      isAborted = true;
      clearInterval(interval);
      try {
        writer.close();
      } catch {
        // Already closed
      }
    });

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
);
