/**
 * Generate FusionForm from Template API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Generates a FusionForm from an active template for the current tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { TemplatesService } from '@/lib/templates';
import { FusionFormsService } from '@/lib/fusion-forms';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * POST /api/templates/[id]/generate
 * Generate a FusionForm from an active template
 */
export const POST = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId, userId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { success: false, error: 'Template ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;
      const body = await request.json();

      const {
        name,
        description,
        redirectUrl,
        expiresAt,
        requireName = true,
        requireEmail = true,
        allowMultipleSubmissions = true,
        customBranding,
        senderEmail,
        senderName,
      } = body;

      // Get the template
      const template = await TemplatesService.getTemplateById(tenantId, id);

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      // Check if template is active
      if (template.status !== 'active') {
        return NextResponse.json(
          { success: false, error: 'Only active templates can generate FusionForms. Please activate the template first.' },
          { status: 400 }
        );
      }

      // Create the FusionForm - using tenant context
      const fusionForm = await FusionFormsService.createForm({
        orgId: tenantId,
        templateId: template.id,
        name: name || `${template.name} Form`,
        description: description || template.description || undefined,
        redirectUrl,
        expiresAt,
        requireName,
        requireEmail,
        allowMultipleSubmissions,
        customBranding,
        senderEmail,
        senderName,
        createdBy: userId,
      });

      // Update the template to reference the FusionForm
      await TemplatesService.setFusionForm(tenantId, template.id, fusionForm.id, fusionForm.publicUrl);

      // Increment use count
      await TemplatesService.incrementUseCount(tenantId, template.id);

      return NextResponse.json({
        success: true,
        data: {
          fusionForm,
          template: {
            id: template.id,
            name: template.name,
            hasFusionForm: true,
            fusionFormUrl: fusionForm.publicUrl,
          },
        },
      });
    } catch (error) {
      console.error('Error generating FusionForm from template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to generate FusionForm' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTemplates'],
  }
);
