/**
 * Dashboard Analytics API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated analytics data
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/analytics/dashboard
 * Get dashboard analytics for the current tenant
 */
export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      // Get current date info for comparisons
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get total documents stats - scoped to tenant
      const totalStats = await sql`
        SELECT
          COUNT(*) as total_documents,
          COUNT(CASE WHEN created_at >= ${startOfMonth} THEN 1 END) as this_month,
          COUNT(CASE WHEN created_at >= ${startOfLastMonth} AND created_at <= ${endOfLastMonth} THEN 1 END) as last_month
        FROM envelope_documents
        WHERE org_id = ${tenantId}
      `;

      // Get signing session stats - scoped to tenant
      const signingStats = await sql`
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN signed_at IS NOT NULL THEN 1 END) as signed
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
      `;

      // Get average completion time (from created to signed) - scoped to tenant
      const avgTimeResult = await sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (signed_at - created_at)) / 3600) as avg_hours,
          COUNT(*) as signed_count
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND signed_at IS NOT NULL
          AND created_at IS NOT NULL
          AND signed_at > created_at
      `;

      // Get completion rate for last month for comparison
      const completionRateLastMonth = await sql`
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND created_at >= ${startOfLastMonth}
          AND created_at <= ${endOfLastMonth}
      `;

      // Get pending signatures for last month for comparison
      const pendingLastMonth = await sql`
        SELECT
          COUNT(*) as pending
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND status IN ('pending', 'sent')
          AND created_at >= ${startOfLastMonth}
          AND created_at <= ${endOfLastMonth}
      `;

      // Get average completion time for last month for comparison
      const avgTimeLastMonth = await sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (signed_at - created_at)) / 3600) as avg_hours
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND signed_at IS NOT NULL
          AND signed_at >= ${startOfLastMonth}
          AND signed_at <= ${endOfLastMonth}
          AND created_at IS NOT NULL
          AND signed_at > created_at
      `;

      // Get monthly trend data (last 6 months) - scoped to tenant
      const monthlyTrend = await sql`
        SELECT
          TO_CHAR(d.created_at, 'Mon') as month,
          DATE_TRUNC('month', d.created_at) as month_date,
          COUNT(DISTINCT d.envelope_id) as sent,
          COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN d.envelope_id END) as completed
        FROM envelope_documents d
        LEFT JOIN envelope_signing_sessions s ON d.envelope_id = s.envelope_id
        WHERE d.org_id = ${tenantId}
          AND d.created_at >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(d.created_at, 'Mon'), DATE_TRUNC('month', d.created_at)
        ORDER BY month_date DESC
        LIMIT 6
      `;

      // Get documents by status for pie chart - scoped to tenant
      const statusBreakdown = await sql`
        SELECT
          CASE
            WHEN completed_count = recipient_count AND recipient_count > 0 THEN 'completed'
            WHEN pending_count > 0 OR sent_count > 0 THEN 'pending'
            ELSE 'draft'
          END as status,
          COUNT(*) as count
        FROM (
          SELECT
            d.envelope_id,
            COUNT(s.id) as recipient_count,
            COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_count,
            COUNT(CASE WHEN s.status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN s.status = 'sent' THEN 1 END) as sent_count
          FROM envelope_documents d
          LEFT JOIN envelope_signing_sessions s ON d.envelope_id = s.envelope_id
          WHERE d.org_id = ${tenantId}
          GROUP BY d.envelope_id
        ) subq
        GROUP BY status
      `;

      // Calculate stats
      const stats = totalStats[0] || { total_documents: 0, this_month: 0, last_month: 0 };
      const signing = signingStats[0] || { total_sessions: 0, completed: 0, pending: 0, sent: 0 };

      // Parse average time - if no signed documents, estimate based on industry average
      const avgTimeRaw = parseFloat(avgTimeResult[0]?.avg_hours as string);
      const signedCount = parseInt(avgTimeResult[0]?.signed_count as string) || 0;
      const avgTime = !isNaN(avgTimeRaw) && avgTimeRaw > 0 ? avgTimeRaw : (signedCount > 0 ? 0.5 : 0);

      const totalSent = parseInt(stats.total_documents as string) || 0;
      const thisMonth = parseInt(stats.this_month as string) || 0;
      const lastMonth = parseInt(stats.last_month as string) || 0;
      const completed = parseInt(signing.completed as string) || 0;
      const pending = parseInt(signing.pending as string) + parseInt(signing.sent as string) || 0;
      const totalSessions = parseInt(signing.total_sessions as string) || 1;

      // Calculate percentage changes
      const sentChange = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
      const completionRate = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;

      // Calculate completion rate change
      const lastMonthTotalSessions = parseInt(completionRateLastMonth[0]?.total_sessions as string) || 0;
      const lastMonthCompleted = parseInt(completionRateLastMonth[0]?.completed as string) || 0;
      const lastMonthCompletionRate = lastMonthTotalSessions > 0 ? Math.round((lastMonthCompleted / lastMonthTotalSessions) * 100) : 0;
      const completionRateChange = lastMonthCompletionRate > 0 ? (completionRate - lastMonthCompletionRate) : 0;

      // Calculate pending change
      const lastMonthPending = parseInt(pendingLastMonth[0]?.pending as string) || 0;
      const pendingChange = lastMonthPending > 0 ? Math.round(((pending - lastMonthPending) / lastMonthPending) * 100) : 0;

      // Calculate average time change
      const avgTimeLastMonthRaw = parseFloat(avgTimeLastMonth[0]?.avg_hours as string);
      const avgTimeLastMonthVal = !isNaN(avgTimeLastMonthRaw) && avgTimeLastMonthRaw > 0 ? avgTimeLastMonthRaw : 0;
      const avgTimeChange = avgTimeLastMonthVal > 0 && avgTime > 0
        ? Math.round(((avgTime - avgTimeLastMonthVal) / avgTimeLastMonthVal) * 100)
        : 0;

      return NextResponse.json({
        success: true,
        data: {
          // Main stats cards
          documentsSent: {
            value: totalSent,
            change: sentChange,
            changeLabel: 'vs last month',
          },
          completionRate: {
            value: completionRate,
            change: completionRateChange,
            changeLabel: 'vs last month',
          },
          pendingSignatures: {
            value: pending,
            change: pendingChange,
            changeLabel: 'vs last month',
          },
          avgCompletionTime: {
            value: avgTime > 0 ? parseFloat(avgTime.toFixed(1)) : 0,
            change: avgTimeChange,
            changeLabel: avgTime > 0 ? (avgTimeChange < 0 ? 'faster than last month' : 'vs last month') : 'no data yet',
          },

          // Charts data
          monthlyTrend: monthlyTrend.reverse().map((m) => ({
            month: m.month,
            sent: parseInt(m.sent as string) || 0,
            completed: parseInt(m.completed as string) || 0,
          })),

          statusBreakdown: statusBreakdown.map((s) => ({
            status: s.status,
            count: parseInt(s.count as string) || 0,
          })),

          // Summary
          summary: {
            totalDocuments: totalSent,
            totalCompleted: completed,
            totalPending: pending,
            thisMonth,
            lastMonth,
          },
        },
      });
    } catch (error) {
      console.error('[Analytics API] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch analytics' },
        { status: 500 }
      );
    }
  }
);
