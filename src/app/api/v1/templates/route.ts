/**
 * Templates API v1
 * GET /api/v1/templates - List all templates
 * POST /api/v1/templates - Create a new template
 *
 * All templates support stable field mapping for CRM integrations.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError, getPaginationParams, buildPaginationMeta } from "@/lib/api-auth";
import { TemplatesService, type TemplateStatus } from "@/lib/templates";
import { FieldMappingService, generateFieldId } from "@/lib/field-mapping";

/**
 * GET /api/v1/templates
 * List templates with field schemas
 */
export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    try {
      const { limit, offset, page } = getPaginationParams(request);
      const searchParams = request.nextUrl.searchParams;

      const category = searchParams.get('category') || undefined;
      const status = (searchParams.get('status') as TemplateStatus) || undefined;
      const includeFields = searchParams.get('includeFields') === 'true';

      const result = await TemplatesService.getTemplates(auth.organizationId, {
        limit,
        offset,
        category,
        status,
      });

      // Transform templates for API response
      const templates = result.templates.map(template => {
        const base = {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          status: template.status,
          useCount: template.useCount,
          signerRoles: template.signerRoles.map(role => ({
            roleId: role.id,
            name: role.name,
            order: role.order,
          })),
          fieldCount: template.fields.length,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        };

        // Include full field schema if requested
        if (includeFields) {
          return {
            ...base,
            fields: FieldMappingService.toApiSchema(template.fields, template.signerRoles),
          };
        }

        return base;
      });

      return apiSuccess({
        data: templates,
        meta: buildPaginationMeta(result.total, limit, page),
      });
    } catch (error) {
      console.error("Error listing templates:", error);
      return apiError("INTERNAL_ERROR", "Failed to list templates", 500);
    }
  },
  { requiredPermissions: ["templates:read"] }
);

/**
 * POST /api/v1/templates
 * Create a new template with field mappings
 *
 * Request body:
 * {
 *   "name": "Employment Contract",
 *   "description": "Standard employment agreement",
 *   "category": "HR",
 *   "status": "active",
 *   "signerRoles": [
 *     { "name": "Employee", "order": 1 },
 *     { "name": "HR Manager", "order": 2 }
 *   ],
 *   "fields": [
 *     {
 *       "fieldName": "employee_name",
 *       "type": "text",
 *       "required": true,
 *       "roleIndex": 0,
 *       "position": { "page": 1, "x": 100, "y": 150, "width": 200, "height": 30 }
 *     }
 *   ],
 *   "documentBase64": "..." // Optional PDF data
 * }
 */
export const POST = withApiAuth(
  async (request: NextRequest, auth) => {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.name) {
        return apiError("INVALID_REQUEST", "Template name is required", 400);
      }

      // Build signer roles
      const signerRoles = (body.signerRoles || [{ name: 'Signer 1', order: 1 }]).map(
        (role: { id?: string; name: string; order: number }, index: number) => ({
          id: role.id || `signer-${index + 1}`,
          name: role.name,
          order: role.order || index + 1,
          color: ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#ea580c', '#0891b2'][index % 6],
        })
      );

      // Build fields with stable IDs
      const fields = (body.fields || []).map((field: {
        fieldId?: string;
        fieldName?: string;
        name?: string;
        type: string;
        required?: boolean;
        roleIndex?: number;
        roleId?: string;
        position?: {
          page: number;
          x: number;
          y: number;
          width: number;
          height: number;
        };
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
        if (field.roleId) {
          signerRoleId = field.roleId;
        } else if (field.roleIndex !== undefined && signerRoles[field.roleIndex]) {
          signerRoleId = signerRoles[field.roleIndex].id;
        } else {
          signerRoleId = signerRoles[0]?.id || 'signer-1';
        }

        return {
          id: field.fieldId || generateFieldId(),
          name: field.fieldName || field.name || `Field ${index + 1}`,
          type: field.type || 'text',
          required: field.required !== false,
          signerRoleId,
          page: field.position?.page || 1,
          x: field.position?.x || 100,
          y: field.position?.y || 100 + (index * 50),
          width: field.position?.width || 200,
          height: field.position?.height || 30,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
          validation: field.validation,
        };
      });

      // Create template
      const template = await TemplatesService.createTemplate({
        orgId: auth.organizationId,
        name: body.name,
        description: body.description,
        category: body.category || 'General',
        status: body.status || 'draft',
        fields,
        signerRoles,
        documentData: body.documentBase64,
        createdBy: auth.apiKey.id,
      });

      // Return response with field schema
      return apiSuccess({
        success: true,
        data: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          status: template.status,
          signerRoles: template.signerRoles.map(role => ({
            roleId: role.id,
            name: role.name,
            order: role.order,
          })),
          fields: FieldMappingService.toApiSchema(template.fields, template.signerRoles),
          fieldCount: template.fields.length,
          createdAt: template.createdAt,
        },
      }, 201);
    } catch (error) {
      console.error("Error creating template:", error);
      return apiError("INTERNAL_ERROR", "Failed to create template", 500);
    }
  },
  { requiredPermissions: ["templates:create"] }
);
