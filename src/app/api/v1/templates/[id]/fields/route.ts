/**
 * Template Fields API
 * GET /api/v1/templates/{id}/fields
 *
 * Returns the field schema for a template, enabling CRM integrations
 * to programmatically map and populate fields.
 *
 * Response format matches DocuSign-style field mapping:
 * - Each field has a stable fieldId
 * - Fields are grouped by signer role
 * - Type information enables proper validation
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { FieldMappingService } from "@/lib/field-mapping";

export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    // Extract template ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const templateIndex = pathParts.findIndex(p => p === 'templates');
    const templateId = pathParts[templateIndex + 1];

    if (!templateId || templateId === 'fields') {
      return apiError("INVALID_REQUEST", "Template ID is required", 400);
    }

    try {
      const schema = await FieldMappingService.getTemplateFieldsSchema(
        auth.organizationId,
        templateId
      );

      if (!schema) {
        return apiError("NOT_FOUND", `Template "${templateId}" not found`, 404);
      }

      // Return in DocuSign-compatible format
      return apiSuccess({
        data: {
          templateId: schema.templateId,
          name: schema.name,
          description: schema.description,
          status: schema.status,
          signerRoles: schema.signerRoles,
          fields: schema.fields.map(field => ({
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            type: field.type,
            required: field.required,
            roleId: field.roleId,
            roleName: field.roleName,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validation: field.validation,
          })),
          metadata: schema.metadata,
        },
      });
    } catch (error) {
      console.error("Error fetching template fields:", error);
      return apiError("INTERNAL_ERROR", "Failed to fetch template fields", 500);
    }
  },
  { requiredPermissions: ["templates:read"] }
);
