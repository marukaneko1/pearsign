/**
 * Templates API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Template versioning for immutable envelope instances
 */

import { NextRequest, NextResponse } from 'next/server';
import { TemplatesService, type TemplateStatus } from '@/lib/templates';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { TemplateVersioningService } from '@/lib/template-versioning';
import { checkFeature } from '@/lib/tenant';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/templates
 * Get all templates for the tenant
 */
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const status = searchParams.get('status') as TemplateStatus | undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const seed = searchParams.get('seed') === 'true';

    // Check template limit for current plan
    const maxTemplates = context.features.maxTemplates;

    // Optionally seed sample templates
    if (seed) {
      await TemplatesService.seedSampleTemplates(tenantId);
    }

    const result = await TemplatesService.getTemplates(tenantId, {
      limit,
      offset,
      category,
      status,
    });

    // If no templates exist, seed sample templates
    if (result.total === 0) {
      const seeded = await TemplatesService.seedSampleTemplates(tenantId);
      return NextResponse.json({
        success: true,
        data: seeded,
        pagination: {
          total: seeded.length,
          limit,
          offset: 0,
          hasMore: false,
        },
        seeded: true,
        tenant: {
          id: tenantId,
          plan: context.tenant.plan,
          maxTemplates,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: result.templates,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
      tenant: {
        id: tenantId,
        plan: context.tenant.plan,
        maxTemplates,
        atLimit: maxTemplates !== -1 && result.total >= maxTemplates,
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/templates
 * Create a new template with versioning
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const {
        name,
        description,
        category,
        status,
        fields,
        signerRoles,
        documentUrl,
        documentData,
      } = body;

      if (!name || !category) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: name and category' },
          { status: 400 }
        );
      }

      // Check if at template limit
      const maxTemplates = context.features.maxTemplates;
      if (maxTemplates !== -1) {
        const currentCount = await TemplatesService.getTemplates(tenantId, { limit: 1 });
        if (currentCount.total >= maxTemplates) {
          return NextResponse.json(
            {
              success: false,
              error: 'TemplateLimit',
              message: `You've reached your template limit (${maxTemplates}). Please upgrade your plan.`,
              upgradeRequired: true,
            },
            { status: 403 }
          );
        }
      }

      // Create the template
      const template = await TemplatesService.createTemplate({
        orgId: tenantId,
        name,
        description,
        category,
        status,
        fields: fields || [],
        signerRoles,
        documentUrl,
        documentData,
        createdBy: context.user.id,
      });

      // Create initial version for versioning
      try {
        await TemplateVersioningService.createInitialVersion(
          template.id,
          tenantId,
          {
            name,
            description,
            category,
            fields: fields || [],
            signerRoles: signerRoles || [],
            documentData,
            createdBy: context.user.id,
          }
        );
      } catch (versionError) {
        console.error('Error creating template version:', versionError);
        // Template still created, just versioning failed
      }

      return NextResponse.json({
        success: true,
        data: template,
        tenant: {
          id: tenantId,
          plan: context.tenant.plan,
        },
      });
    } catch (error) {
      console.error('Error creating template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create template' },
        { status: 500 }
      );
    }
  },
  {
    // Require template management permission
    requiredPermissions: ['canManageTemplates'],
  }
);
