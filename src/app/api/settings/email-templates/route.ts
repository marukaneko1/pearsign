/**
 * Email Templates API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated email templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  getEmailTemplates,
  initializeEmailTemplates,
  TEMPLATE_METADATA,
  TEMPLATE_VARIABLES,
  type EmailTemplateType,
} from '@/lib/email-templates';

/**
 * GET /api/settings/email-templates
 * Get all email templates for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { tenantId }: TenantApiContext) => {
  try {
    // Check if full details are requested
    const { searchParams } = new URL(request.url);
    const includeBody = searchParams.get('includeBody') === 'true';

    // Initialize templates if needed (creates table and seeds defaults)
    await initializeEmailTemplates();

    // Get all templates for this tenant
    const templates = await getEmailTemplates(tenantId);

    // Transform to include metadata, optionally exclude large body fields
    const templatesWithMeta = templates.map(template => {
      const base = {
        id: template.id,
        type: template.type,
        name: template.name,
        description: template.description,
        subject: template.subject,
        variables: TEMPLATE_VARIABLES[template.type as EmailTemplateType] || [],
        category: TEMPLATE_METADATA[template.type as EmailTemplateType]?.category || 'Other',
        isActive: template.isActive,
        isDefault: template.isDefault,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };

      // Only include body fields if requested (reduces response from ~50KB to ~5KB)
      if (includeBody) {
        return {
          ...base,
          htmlBody: template.htmlBody,
          textBody: template.textBody,
        };
      }

      return base;
    });

    return NextResponse.json(templatesWithMeta);
  } catch (error) {
    console.error('[Email Templates API] Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email templates' },
      { status: 500 }
    );
  }
});
