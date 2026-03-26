/**
 * Document Detail API v1
 * GET /api/v1/documents/{id} - Get document with full field schema
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { FieldMappingService } from "@/lib/field-mapping";

// Helper to extract document ID from URL
function getDocumentId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const docsIndex = pathParts.findIndex(p => p === 'documents');
  const documentId = pathParts[docsIndex + 1];
  return documentId && documentId !== 'fields' ? documentId : null;
}

/**
 * GET /api/v1/documents/{id}
 * Get document with full field schema
 *
 * Note: The {id} can be either a document ID or an envelope ID
 */
export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    const documentId = getDocumentId(request);

    if (!documentId) {
      return apiError("INVALID_REQUEST", "Document ID is required", 400);
    }

    try {
      // Try to get document by envelope ID (most common case)
      const schema = await FieldMappingService.getDocumentFieldsSchema(
        auth.organizationId,
        documentId
      );

      if (!schema) {
        return apiError("NOT_FOUND", `Document "${documentId}" not found`, 404);
      }

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
            currentValue: field.defaultValue || null,
            position: field.position,
          })),
          metadata: schema.metadata,
        },
      });
    } catch (error) {
      console.error("Error fetching document:", error);
      return apiError("INTERNAL_ERROR", "Failed to fetch document", 500);
    }
  },
  { requiredPermissions: ["documents:read"] }
);
