/**
 * Envelope Fields API
 * GET /api/v1/envelopes/{id}/fields - Get field schema for envelope
 * POST /api/v1/envelopes/{id}/fields - Update field values on envelope
 *
 * Enables CRM integrations to:
 * - Fetch the field schema for an existing envelope
 * - Update/populate field values programmatically
 *
 * Field validation ensures type safety and required field checks.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { FieldMappingService, type FieldValuesPayload } from "@/lib/field-mapping";

/**
 * GET /api/v1/envelopes/{id}/fields
 * Retrieve the field schema for an envelope
 */
export const GET = withApiAuth(
  async (request: NextRequest, auth) => {
    // Extract envelope ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const envelopesIndex = pathParts.findIndex(p => p === 'envelopes');
    const envelopeId = pathParts[envelopesIndex + 1];

    if (!envelopeId || envelopeId === 'fields') {
      return apiError("INVALID_REQUEST", "Envelope ID is required", 400);
    }

    try {
      const schema = await FieldMappingService.getDocumentFieldsSchema(
        auth.organizationId,
        envelopeId
      );

      if (!schema) {
        return apiError("NOT_FOUND", `Envelope "${envelopeId}" not found`, 404);
      }

      return apiSuccess({
        data: {
          envelopeId: schema.envelopeId,
          documentId: schema.documentId,
          title: schema.title,
          fields: schema.fields.map(field => ({
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            type: field.type,
            required: field.required,
            roleId: field.roleId,
            currentValue: field.defaultValue || null,
          })),
          metadata: schema.metadata,
        },
      });
    } catch (error) {
      console.error("Error fetching envelope fields:", error);
      return apiError("INTERNAL_ERROR", "Failed to fetch envelope fields", 500);
    }
  },
  { requiredPermissions: ["envelopes:read"] }
);

/**
 * POST /api/v1/envelopes/{id}/fields
 * Update field values on an envelope
 *
 * Request body:
 * {
 *   "fieldValues": {
 *     "field_id_1": "value1",
 *     "field_id_2": "value2"
 *   }
 * }
 */
export const POST = withApiAuth(
  async (request: NextRequest, auth) => {
    // Extract envelope ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const envelopesIndex = pathParts.findIndex(p => p === 'envelopes');
    const envelopeId = pathParts[envelopesIndex + 1];

    if (!envelopeId || envelopeId === 'fields') {
      return apiError("INVALID_REQUEST", "Envelope ID is required", 400);
    }

    try {
      const body = await request.json();
      const fieldValues: FieldValuesPayload = body.fieldValues || body.fields || {};

      if (Object.keys(fieldValues).length === 0) {
        return apiError(
          "INVALID_REQUEST",
          "No field values provided. Expected { fieldValues: { fieldId: value, ... } }",
          400
        );
      }

      const result = await FieldMappingService.updateEnvelopeFields(
        auth.organizationId,
        envelopeId,
        fieldValues
      );

      if (!result.success) {
        // Return detailed validation errors
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "validation_failed",
              message: "Field validation failed",
              details: result.errors.map(err => ({
                code: err.code,
                fieldId: err.fieldId,
                fieldName: err.fieldName,
                message: err.message,
                expectedType: err.expectedType,
                receivedType: err.receivedType,
              })),
            },
          },
          { status: 400 }
        );
      }

      return apiSuccess({
        success: true,
        data: {
          envelopeId,
          updatedFields: result.updatedFields,
          message: `Successfully updated ${result.updatedFields} field(s)`,
        },
      });
    } catch (error) {
      console.error("Error updating envelope fields:", error);
      return apiError("INTERNAL_ERROR", "Failed to update envelope fields", 500);
    }
  },
  { requiredPermissions: ["envelopes:write"] }
);
