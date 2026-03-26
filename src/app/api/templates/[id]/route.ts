/**
 * Template Detail API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { TemplatesService } from '@/lib/templates';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import { logTemplateEvent } from '@/lib/audit-log';

/**
 * GET /api/templates/[id]
 * Get a single template by ID for the current tenant
 */
export const GET = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
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

      const template = await TemplatesService.getTemplateById(tenantId, id);

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('Error fetching template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch template' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/templates/[id]
 * Update a template for the current tenant
 */
export const PATCH = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId, userId, userName, userEmail }: TenantApiContext,
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

      // First verify the template belongs to this tenant
      const existingTemplate = await TemplatesService.getTemplateById(tenantId, id);
      if (!existingTemplate) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      const {
        name,
        description,
        category,
        status,
        fields,
        signerRoles,
        documentUrl,
        documentData,
        action, // Special action: 'activate', 'deactivate', 'duplicate'
      } = body;

      // Handle special actions
      if (action === 'activate') {
        const template = await TemplatesService.activateTemplate(tenantId, id);
        if (!template) {
          return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
        }
        logTemplateEvent('template.activated', { orgId: tenantId, templateId: id, templateName: existingTemplate.name, actorId: userId, actorName: userName, actorEmail: userEmail });
        return NextResponse.json({ success: true, data: template });
      }

      if (action === 'deactivate') {
        const template = await TemplatesService.deactivateTemplate(tenantId, id);
        if (!template) {
          return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
        }
        logTemplateEvent('template.deactivated', { orgId: tenantId, templateId: id, templateName: existingTemplate.name, actorId: userId, actorName: userName, actorEmail: userEmail });
        return NextResponse.json({ success: true, data: template });
      }

      if (action === 'duplicate') {
        const template = await TemplatesService.duplicateTemplate(tenantId, id, body.newName);
        if (!template) {
          return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
        }
        logTemplateEvent('template.duplicated', { orgId: tenantId, templateId: template.id, templateName: template.name, actorId: userId, actorName: userName, actorEmail: userEmail, details: { sourceTemplateId: id } });
        return NextResponse.json({ success: true, data: template });
      }

      // Regular update
      const template = await TemplatesService.updateTemplate(tenantId, id, {
        name,
        description,
        category,
        status,
        fields,
        signerRoles,
        documentUrl,
        documentData,
      });

      if (!template) {
        return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
      }

      logTemplateEvent('template.updated', { orgId: tenantId, templateId: id, templateName: template.name, actorId: userId, actorName: userName, actorEmail: userEmail });

      return NextResponse.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('Error updating template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update template' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTemplates'],
  }
);

/**
 * DELETE /api/templates/[id]
 * Delete a template for the current tenant
 */
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId, userId, userName, userEmail }: TenantApiContext,
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

      // First verify the template belongs to this tenant
      const existingTemplate = await TemplatesService.getTemplateById(tenantId, id);
      if (!existingTemplate) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      const deleted = await TemplatesService.deleteTemplate(tenantId, id);

      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      logTemplateEvent('template.deleted', {
        orgId: tenantId,
        templateId: id,
        templateName: existingTemplate.name,
        actorId: userId,
        actorName: userName,
        actorEmail: userEmail,
      });

      return NextResponse.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete template' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageTemplates'],
  }
);
