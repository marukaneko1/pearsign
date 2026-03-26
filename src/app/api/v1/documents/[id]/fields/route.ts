/**
 * Document Fields API
 * GET /api/v1/documents/{id}/fields
 *
 * Returns the field schema for a document/envelope, enabling CRM integrations
 * to retrieve and update field mappings for non-template documents.
 *
 * Response format matches DocuSign-style field mapping:
 * - Each field has a stable fieldId
 * - Type information enables proper validation
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { FieldMappingService } from "@/lib/field-mapping";

export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    // Extract document/envelope ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const docsIndex = pathParts.findIndex(p => p === 'documents');
    const documentId = pathParts[docsIndex + 1];

    if (!documentId || documentId === 'fields') {
      return apiError("INVALID_REQUEST", "Document ID is required", 400);
    }

    try {
      const schema = await FieldMappingService.getDocumentFieldsSchema(
        auth.organizationId,
        documentId
      );

      if (!schema) {
        return apiError("NOT_FOUND", `Document "${documentId}" not found`, 404);
      }

      // Return in DocuSign-compatible format
      return apiSuccess({
        data: {
          documentId: schema.documentId,
          envelopeId: schema.envelopeId,
          title: schema.title,
          fields: schema.fields.map(field => ({
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            type: field.type,
            required: field.required,
            roleId: field.roleId,
            roleName: field.roleName,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
          })),
          metadata: schema.metadata,
        },
      });
    } catch (error) {
      console.error("Error fetching document fields:", error);
      return apiError("INTERNAL_ERROR", "Failed to fetch document fields", 500);
    }
  },
  { requiredPermissions: ["documents:read"] }
);
