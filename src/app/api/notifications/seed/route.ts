/**
 * Seed Notifications API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Creates sample notifications for testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/notifications';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * POST /api/notifications/seed
 * Seed sample notifications for testing
 */
export const POST = withTenant(
  async (request: NextRequest, { tenantId, userId }: TenantApiContext) => {
    try {
      // Create sample notifications for this tenant
      const sampleNotifications = [
        {
          orgId: tenantId,
          userId,
          type: 'envelope_signed' as const,
          title: 'Document Signed',
          message: 'Sarah Johnson signed "Employment Contract - Q1 2025".',
          entityType: 'ENVELOPE' as const,
          entityId: 'env-1',
          actionUrl: '/sent',
          metadata: { signerEmail: 'sarah.johnson@email.com' },
        },
        {
          orgId: tenantId,
          userId,
          type: 'envelope_completed' as const,
          title: 'Document Completed',
          message: 'All parties have signed "NDA Agreement - Tech Corp".',
          entityType: 'ENVELOPE' as const,
          entityId: 'env-2',
          actionUrl: '/sent',
          metadata: {},
        },
        {
          orgId: tenantId,
          userId,
          type: 'envelope_viewed' as const,
          title: 'Document Viewed',
          message: 'David Martinez viewed "Partnership Agreement".',
          entityType: 'ENVELOPE' as const,
          entityId: 'env-5',
          actionUrl: '/sent',
          metadata: { viewerEmail: 'partner@company.com' },
        },
        {
          orgId: tenantId,
          userId,
          type: 'envelope_sent' as const,
          title: 'Document Sent Successfully',
          message: '"Investment Term Sheet - Series A" was sent to 3 recipients.',
          entityType: 'ENVELOPE' as const,
          entityId: 'env-10',
          actionUrl: '/sent',
          metadata: { recipientCount: 3 },
        },
        {
          orgId: tenantId,
          userId,
          type: 'reminder_sent' as const,
          title: 'Reminder Sent',
          message: 'Reminder sent to legal@globaltech.io for "Q1 Sales Contract - GlobalTech Solutions".',
          entityType: 'ENVELOPE' as const,
          entityId: 'env-bulk-1b',
          actionUrl: '/sent',
          metadata: { recipientEmail: 'legal@globaltech.io' },
        },
        {
          orgId: tenantId,
          userId,
          type: 'team_invite' as const,
          title: 'New Team Member',
          message: 'Emily Chen joined your organization.',
          entityType: 'TEAM' as const,
          entityId: 'user-new',
          actionUrl: '/settings',
          metadata: {},
        },
        {
          orgId: tenantId,
          userId,
          type: 'system_update' as const,
          title: 'New Feature Available',
          message: 'Document Center now supports AI-powered document generation.',
          entityType: 'SYSTEM' as const,
          entityId: null,
          actionUrl: '/ai-generator',
          metadata: {},
        },
      ];

      const created = [];
      for (const notification of sampleNotifications) {
        const result = await NotificationService.create(notification);
        created.push(result);
      }

      return NextResponse.json({
        success: true,
        message: `Created ${created.length} sample notifications`,
        data: created,
      });
    } catch (error) {
      console.error('Error seeding notifications:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to seed notifications' },
        { status: 500 }
      );
    }
  }
);
