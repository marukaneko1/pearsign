/**
 * FusionForms API Routes
 * Handles CRUD operations for FusionForms
 *
 * Multi-tenancy enforced via withTenant middleware
 * Requires fusionForms feature (professional+ plans)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FusionFormsService, CreateFusionFormInput } from '@/lib/fusion-forms';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/fusion-forms
 * Get all fusion forms for the tenant
 */
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'active' | 'paused' | 'archived' | null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await FusionFormsService.getForms(tenantId, {
      limit,
      offset,
      status: status || undefined,
    });

    return NextResponse.json({
      ...result,
      tenant: {
        id: tenantId,
        plan: context.tenant.plan,
      },
    });
  } catch (error) {
    console.error('Error fetching fusion forms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fusion forms' },
      { status: 500 }
    );
  }
}, {
  requiredFeatures: ['fusionForms'],
});

/**
 * POST /api/fusion-forms
 * Create a new fusion form
 */
export const POST = withTenant(
  async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();

      const input: CreateFusionFormInput = {
        orgId: tenantId,
        templateId: body.templateId,
        name: body.name,
        description: body.description,
        redirectUrl: body.redirectUrl,
        expiresAt: body.expiresAt,
        requireName: body.requireName,
        requireEmail: body.requireEmail,
        allowMultipleSubmissions: body.allowMultipleSubmissions,
        customBranding: body.customBranding,
        createdBy: context.user.id,
      };

      if (!input.templateId || !input.name) {
        return NextResponse.json(
          { error: 'templateId and name are required' },
          { status: 400 }
        );
      }

      const form = await FusionFormsService.createForm(input);

      return NextResponse.json({
        ...form,
        tenant: {
          id: tenantId,
          plan: context.tenant.plan,
        },
      }, { status: 201 });
    } catch (error) {
      console.error('Error creating fusion form:', error);
      return NextResponse.json(
        { error: 'Failed to create fusion form' },
        { status: 500 }
      );
    }
  },
  {
    requiredFeatures: ['fusionForms'],
    requiredPermissions: ['canManageTemplates'],
  }
);
