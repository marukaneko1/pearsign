import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { TenantService } from '@/lib/tenant';

/**
 * GET /api/settings/storage
 * Fetch storage usage for the current tenant
 *
 * Returns tenant-specific storage data and plan limits
 */
export const GET = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      // Get current usage from tenant_usage table
      const usage = await TenantService.getCurrentUsage(tenantId);

      // Try to get from storage_usage table first (legacy)
      const storageData = await sql`
        SELECT
          id,
          organization_id as "organizationId",
          used_storage as "usedStorage",
          total_storage as "totalStorage",
          document_count as "documentCount",
          template_count as "templateCount",
          attachment_count as "attachmentCount",
          last_calculated as "lastCalculated"
        FROM storage_usage
        WHERE organization_id = ${tenantId}
      `.catch(() => []);

      // Calculate storage limit based on plan
      const planStorageGb = context.features.maxStorageGb;
      const totalStorageBytes = planStorageGb === -1
        ? 1099511627776 // 1 TB for unlimited
        : planStorageGb * 1024 * 1024 * 1024;

      if (storageData.length === 0) {
        // Return data based on tenant context and usage
        return NextResponse.json({
          id: null,
          organizationId: tenantId,
          usedStorage: usage.storageBytes,
          totalStorage: totalStorageBytes,
          documentCount: usage.envelopesSent,
          templateCount: 0, // Would need to count templates
          attachmentCount: 0,
          lastCalculated: new Date().toISOString(),
          // Include plan info
          plan: {
            name: context.tenant.plan,
            limits: {
              envelopesPerMonth: context.features.maxEnvelopesPerMonth,
              templates: context.features.maxTemplates,
              teamMembers: context.features.maxTeamMembers,
              storageGb: context.features.maxStorageGb,
              smsPerMonth: context.features.maxSmsPerMonth,
              apiCallsPerMonth: context.features.maxApiCallsPerMonth,
            },
          },
          usage: {
            envelopesSent: usage.envelopesSent,
            smsSent: usage.smsSent,
            apiCalls: usage.apiCalls,
          },
        });
      }

      // Merge with plan info
      return NextResponse.json({
        ...storageData[0],
        totalStorage: totalStorageBytes, // Override with plan limit
        plan: {
          name: context.tenant.plan,
          limits: {
            envelopesPerMonth: context.features.maxEnvelopesPerMonth,
            templates: context.features.maxTemplates,
            teamMembers: context.features.maxTeamMembers,
            storageGb: context.features.maxStorageGb,
            smsPerMonth: context.features.maxSmsPerMonth,
            apiCallsPerMonth: context.features.maxApiCallsPerMonth,
          },
        },
        usage: {
          envelopesSent: usage.envelopesSent,
          smsSent: usage.smsSent,
          apiCalls: usage.apiCalls,
        },
      });
    } catch (error) {
      console.error('Error fetching storage data:', error);
      return NextResponse.json({ error: 'Failed to fetch storage data' }, { status: 500 });
    }
  }
);
