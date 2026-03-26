/**
 * Template Detail API v1
 * GET /api/v1/templates/{id} - Get template with full schema
 * PATCH /api/v1/templates/{id} - Update template
 * DELETE /api/v1/templates/{id} - Delete template
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { TemplatesService } from "@/lib/templates";
import { FieldMappingService, generateFieldId } from "@/lib/field-mapping";

// Helper to extract template ID from URL
function getTemplateId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const templatesIndex = pathParts.findIndex(p => p === 'templates');
  const templateId = pathParts[templatesIndex + 1];
  return templateId && templateId !== 'fields' ? templateId : null;
}

/**
 * GET /api/v1/templates/{id}
 * Get template with full field schema
 */
export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    const templateId = getTemplateId(request);

    if (!templateId) {
      return apiError("INVALID_REQUEST", "Template ID is required", 400);
    }

    try {
      const template = await TemplatesService.getTemplateById(
        auth.organizationId,
        templateId
      );

      if (!template) {
        return apiError("NOT_FOUND", `Template "${templateId}" not found`, 404);
      }

      return apiSuccess({
        data: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          status: template.status,
          useCount: template.useCount,
          lastUsedAt: template.lastUsedAt,
          signerRoles: template.signerRoles.map(role => ({
            roleId: role.id,
            name: role.name,
            order: role.order,
          })),
          fields: FieldMappingService.toApiSchema(template.fields, template.signerRoles),
          hasDocument: !!template.documentData,
          hasFusionForm: template.hasFusionForm,
          fusionFormUrl: template.fusionFormUrl,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error fetching template:", error);
      return apiError("INTERNAL_ERROR", "Failed to fetch template", 500);
    }
  },
  { requiredPermissions: ["templates:read"] }
);

/**
 * PATCH /api/v1/templates/{id}
 * Update template fields or metadata
 */
export const PATCH = withApiAuth(
  async (request: NextRequest, auth) => {
    const templateId = getTemplateId(request);

    if (!templateId) {
      return apiError("INVALID_REQUEST", "Template ID is required", 400);
    }

    try {
      const body = await request.json();

      // Verify template exists
      const existing = await TemplatesService.getTemplateById(
        auth.organizationId,
        templateId
      );

      if (!existing) {
        return apiError("NOT_FOUND", `Template "${templateId}" not found`, 404);
      }

      // Handle special actions
      if (body.action === 'activate') {
        const updated = await TemplatesService.activateTemplate(
          auth.organizationId,
          templateId
        );
        return apiSuccess({
          success: true,
          data: { id: templateId, status: updated?.status },
          message: 'Template activated',
        });
      }

      if (body.action === 'deactivate') {
        const updated = await TemplatesService.deactivateTemplate(
          auth.organizationId,
          templateId
        );
        return apiSuccess({
          success: true,
          data: { id: templateId, status: updated?.status },
          message: 'Template deactivated',
        });
      }

      if (body.action === 'duplicate') {
        const duplicate = await TemplatesService.duplicateTemplate(
          auth.organizationId,
          templateId,
          body.newName
        );
        if (!duplicate) {
          return apiError("INTERNAL_ERROR", "Failed to duplicate template", 500);
        }
        return apiSuccess({
          success: true,
          data: {
            id: duplicate.id,
            name: duplicate.name,
            status: duplicate.status,
          },
          message: 'Template duplicated',
        }, 201);
      }

      // Build update object
      const updateData: {
        name?: string;
        description?: string;
        category?: string;
        status?: 'draft' | 'active';
        fields?: typeof existing.fields;
        signerRoles?: typeof existing.signerRoles;
        documentData?: string;
      } = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.category !== undefined) updateData.category = body.category;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.documentBase64 !== undefined) updateData.documentData = body.documentBase64;

      // Handle signer roles update
      if (body.signerRoles) {
        updateData.signerRoles = body.signerRoles.map(
          (role: { roleId?: string; id?: string; name: string; order: number }, index: number) => ({
            id: role.roleId || role.id || `signer-${index + 1}`,
            name: role.name,
            order: role.order || index + 1,
            color: ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#ea580c', '#0891b2'][index % 6],
          })
        );
      }

      // Handle fields update
      if (body.fields) {
        const signerRoles = updateData.signerRoles || existing.signerRoles;
        updateData.fields = body.fields.map((field: {
          fieldId?: string;
          id?: string;
          fieldName?: string;
          name?: string;
          type: string;
          required?: boolean;
          roleIndex?: number;
          roleId?: string;
          signerRoleId?: string;
          position?: {
            page: number;
            x: number;
            y: number;
            width: number;
            height: number;
          };
          page?: number;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          placeholder?: string;
          defaultValue?: string;
          validation?: {
            pattern?: string;
            minLength?: number;
            maxLength?: number;
          };
        }, index: number) => {
          // Determine which role this field belongs to
          let signerRoleId: string;
          if (field.signerRoleId) {
            signerRoleId = field.signerRoleId;
          } else if (field.roleId) {
            signerRoleId = field.roleId;
          } else if (field.roleIndex !== undefined && signerRoles[field.roleIndex]) {
            signerRoleId = signerRoles[field.roleIndex].id;
          } else {
            signerRoleId = signerRoles[0]?.id || 'signer-1';
          }

          return {
            id: field.fieldId || field.id || generateFieldId(),
            name: field.fieldName || field.name || `Field ${index + 1}`,
            type: field.type || 'text',
            required: field.required !== false,
            signerRoleId,
            page: field.position?.page || field.page || 1,
            x: field.position?.x || field.x || 100,
            y: field.position?.y || field.y || 100 + (index * 50),
            width: field.position?.width || field.width || 200,
            height: field.position?.height || field.height || 30,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validation: field.validation,
          };
        });
      }

      const updated = await TemplatesService.updateTemplate(
        auth.organizationId,
        templateId,
        updateData
      );

      if (!updated) {
        return apiError("INTERNAL_ERROR", "Failed to update template", 500);
      }

      return apiSuccess({
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          category: updated.category,
          status: updated.status,
          signerRoles: updated.signerRoles.map(role => ({
            roleId: role.id,
            name: role.name,
            order: role.order,
          })),
          fields: FieldMappingService.toApiSchema(updated.fields, updated.signerRoles),
          fieldCount: updated.fields.length,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error updating template:", error);
      return apiError("INTERNAL_ERROR", "Failed to update template", 500);
    }
  },
  { requiredPermissions: ["templates:write"] }
);

/**
 * DELETE /api/v1/templates/{id}
 * Delete a template
 */
export const DELETE = withApiAuth(
  async (request: NextRequest, auth) => {
    const templateId = getTemplateId(request);

    if (!templateId) {
      return apiError("INVALID_REQUEST", "Template ID is required", 400);
    }

    try {
      const existing = await TemplatesService.getTemplateById(
        auth.organizationId,
        templateId
      );

      if (!existing) {
        return apiError("NOT_FOUND", `Template "${templateId}" not found`, 404);
      }

      const deleted = await TemplatesService.deleteTemplate(
        auth.organizationId,
        templateId
      );

      if (!deleted) {
        return apiError("INTERNAL_ERROR", "Failed to delete template", 500);
      }

      return apiSuccess({
        success: true,
        message: `Template "${existing.name}" deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      return apiError("INTERNAL_ERROR", "Failed to delete template", 500);
    }
  },
  { requiredPermissions: ["templates:delete"] }
);
