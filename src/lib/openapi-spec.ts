/**
 * PearSign API - OpenAPI 3.1.0 Specification
 */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "PearSign API",
    version: "1.0.0",
    description: `
PearSign API enables you to integrate electronic signature workflows into your applications.

## Authentication

All API requests require authentication using an API key. Include your API key in the Authorization header:

\`\`\`
Authorization: Bearer ps_live_xxx.your_secret_here
\`\`\`

## Rate Limiting

API requests are rate limited per API key. Rate limit headers are included in all responses:

- \`X-RateLimit-Limit\`: Maximum requests per minute
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`X-RateLimit-Reset\`: Unix timestamp when the window resets

## Environments

PearSign supports two environments:

- **Test**: Use \`ps_test_\` prefixed keys for development and testing
- **Live**: Use \`ps_live_\` prefixed keys for production

Test and live environments are completely isolated.
    `.trim(),
    contact: {
      name: "PearSign Support",
      email: "support@pearsign.com",
      url: "https://pearsign.com/support",
    },
    license: {
      name: "Proprietary",
      url: "https://pearsign.com/terms",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "PearSign API v1",
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    { name: "Envelopes", description: "Manage signing envelopes" },
    { name: "Documents", description: "Upload and manage documents" },
    { name: "Templates", description: "Manage reusable templates" },
    { name: "Fields", description: "Field mapping for CRM integrations" },
    { name: "FusionForms", description: "Create and manage public signing forms" },
    { name: "Webhooks", description: "Configure webhook notifications" },
    { name: "Audit", description: "Access audit logs" },
  ],
  paths: {
    "/envelopes": {
      get: {
        operationId: "listEnvelopes",
        summary: "List envelopes",
        description: "Retrieve a list of envelopes for your organization",
        tags: ["Envelopes"],
        parameters: [
          {
            name: "status",
            in: "query",
            description: "Filter by envelope status",
            schema: {
              type: "string",
              enum: ["draft", "sent", "completed", "voided", "declined"],
            },
          },
          {
            name: "page",
            in: "query",
            description: "Page number (1-indexed)",
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            description: "Items per page",
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "List of envelopes",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Envelope" },
                    },
                    meta: { $ref: "#/components/schemas/PaginationMeta" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
      post: {
        operationId: "createEnvelope",
        summary: "Create envelope",
        description: "Create a new signing envelope",
        tags: ["Envelopes"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EnvelopeCreate" },
              example: {
                name: "Employment Contract",
                signerEmail: "john@example.com",
                signerName: "John Doe",
                documentUrl: "https://example.com/contract.pdf",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Envelope created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Envelope" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/envelopes/{id}": {
      get: {
        operationId: "getEnvelope",
        summary: "Get envelope",
        description: "Retrieve a single envelope by ID",
        tags: ["Envelopes"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Envelope details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Envelope" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        operationId: "updateEnvelope",
        summary: "Update envelope",
        description: "Update envelope details (only for draft envelopes)",
        tags: ["Envelopes"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EnvelopeUpdate" },
            },
          },
        },
        responses: {
          "200": {
            description: "Envelope updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Envelope" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        operationId: "voidEnvelope",
        summary: "Void envelope",
        description: "Void an envelope (cannot void completed envelopes)",
        tags: ["Envelopes"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Envelope voided",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        status: { type: "string", example: "voided" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/envelopes/{id}/send": {
      post: {
        operationId: "sendEnvelope",
        summary: "Send envelope",
        description: "Send an envelope to the recipient for signing",
        tags: ["Envelopes"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Envelope sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        status: { type: "string", example: "sent" },
                        signingUrl: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/templates/{id}/fields": {
      get: {
        operationId: "getTemplateFields",
        summary: "Get template field schema",
        description: "Retrieve the field schema for a template. Use this to understand what fields are available for mapping before sending envelopes programmatically.",
        tags: ["Templates", "Fields"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Template ID",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Template field schema",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/TemplateSchema" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/documents/{id}/fields": {
      get: {
        operationId: "getDocumentFields",
        summary: "Get document field schema",
        description: "Retrieve the field schema for a document/envelope. Use this to see what fields exist on a specific document.",
        tags: ["Documents", "Fields"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Document or envelope ID",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Document field schema",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        documentId: { type: "string" },
                        envelopeId: { type: "string" },
                        title: { type: "string" },
                        fields: {
                          type: "array",
                          items: { $ref: "#/components/schemas/FieldSchema" },
                        },
                        metadata: {
                          type: "object",
                          properties: {
                            createdAt: { type: "string", format: "date-time" },
                            fieldCount: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/envelopes/send": {
      post: {
        operationId: "sendEnvelopeFromTemplate",
        summary: "Send envelope from template",
        description: "Create and send an envelope using a template with pre-populated field values. This is the primary endpoint for CRM integrations.",
        tags: ["Envelopes", "Fields"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EnvelopeSendRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Envelope created and sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        envelopeId: { type: "string" },
                        title: { type: "string" },
                        status: { type: "string", example: "in_signing" },
                        templateId: { type: "string" },
                        recipients: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              email: { type: "string" },
                              name: { type: "string" },
                              roleId: { type: "string" },
                              status: { type: "string" },
                            },
                          },
                        },
                        fieldCount: { type: "integer" },
                        prefilledFieldCount: { type: "integer" },
                        createdAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: false },
                    error: {
                      type: "object",
                      properties: {
                        code: { type: "string", example: "field_validation_failed" },
                        message: { type: "string" },
                        details: {
                          type: "array",
                          items: { $ref: "#/components/schemas/FieldValidationError" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/envelopes/{id}/fields": {
      get: {
        operationId: "getEnvelopeFields",
        summary: "Get envelope field values",
        description: "Retrieve current field values for an envelope",
        tags: ["Envelopes", "Fields"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Envelope ID",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Envelope fields with current values",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        envelopeId: { type: "string" },
                        fields: {
                          type: "array",
                          items: {
                            allOf: [
                              { $ref: "#/components/schemas/FieldSchema" },
                              {
                                type: "object",
                                properties: {
                                  currentValue: { type: "string", nullable: true },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      post: {
        operationId: "updateEnvelopeFields",
        summary: "Update envelope field values",
        description: "Update field values on an existing envelope. Only valid for envelopes that haven't been signed yet.",
        tags: ["Envelopes", "Fields"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Envelope ID",
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fieldValues"],
                properties: {
                  fieldValues: { $ref: "#/components/schemas/FieldValuesPayload" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Fields updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        envelopeId: { type: "string" },
                        updatedFields: { type: "integer" },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: false },
                    error: {
                      type: "object",
                      properties: {
                        code: { type: "string", example: "validation_failed" },
                        message: { type: "string" },
                        details: {
                          type: "array",
                          items: { $ref: "#/components/schemas/FieldValidationError" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/audit/api-logs": {
      get: {
        operationId: "listApiLogs",
        summary: "List API logs",
        description: "Retrieve API audit logs for your organization",
        tags: ["Audit"],
        parameters: [
          {
            name: "apiKeyId",
            in: "query",
            description: "Filter by API key ID",
            schema: { type: "string" },
          },
          {
            name: "endpoint",
            in: "query",
            description: "Filter by endpoint",
            schema: { type: "string" },
          },
          {
            name: "method",
            in: "query",
            description: "Filter by HTTP method",
            schema: { type: "string", enum: ["GET", "POST", "PATCH", "DELETE"] },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100, maximum: 500 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: {
          "200": {
            description: "List of API logs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ApiLog" },
                    },
                    meta: {
                      type: "object",
                      properties: {
                        count: { type: "integer" },
                        limit: { type: "integer" },
                        offset: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/audit/stats": {
      get: {
        operationId: "getApiStats",
        summary: "Get API stats",
        description: "Get API usage statistics for your organization",
        tags: ["Audit"],
        parameters: [
          {
            name: "days",
            in: "query",
            description: "Number of days to look back",
            schema: { type: "integer", default: 30 },
          },
        ],
        responses: {
          "200": {
            description: "API usage statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/ApiStats" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key in format: ps_live_xxx.secret or ps_test_xxx.secret",
      },
    },
    schemas: {
      Envelope: {
        type: "object",
        properties: {
          id: { type: "string", example: "env-123456789-abc123" },
          name: { type: "string", example: "Employment Contract" },
          status: {
            type: "string",
            enum: ["draft", "sent", "completed", "voided", "declined"],
          },
          signerEmail: { type: "string", format: "email" },
          signerName: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      EnvelopeCreate: {
        type: "object",
        required: ["name", "signerEmail"],
        properties: {
          name: { type: "string", description: "Envelope name/subject" },
          signerEmail: { type: "string", format: "email" },
          signerName: { type: "string" },
          documentUrl: { type: "string", format: "uri" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      EnvelopeUpdate: {
        type: "object",
        properties: {
          name: { type: "string" },
          signerEmail: { type: "string", format: "email" },
          signerName: { type: "string" },
        },
      },
      ApiLog: {
        type: "object",
        properties: {
          id: { type: "string" },
          apiKeyId: { type: "string" },
          endpoint: { type: "string" },
          method: { type: "string" },
          statusCode: { type: "integer" },
          ip: { type: "string" },
          userAgent: { type: "string" },
          responseTime: { type: "integer", description: "Response time in ms" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ApiStats: {
        type: "object",
        properties: {
          totalRequests: { type: "integer" },
          successfulRequests: { type: "integer" },
          failedRequests: { type: "integer" },
          averageResponseTime: { type: "number" },
          requestsByEndpoint: {
            type: "object",
            additionalProperties: { type: "integer" },
          },
          requestsByDay: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
        },
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          pages: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      },
      FieldSchema: {
        type: "object",
        description: "Field schema for API mapping. fieldId is stable and reusable across template versions.",
        properties: {
          fieldId: { type: "string", description: "System-generated, immutable identifier", example: "fld_abc123_xyz789" },
          fieldName: { type: "string", description: "Human-readable field name", example: "employee_name" },
          type: {
            type: "string",
            enum: ["signature", "initials", "text", "email", "date", "number", "checkbox", "company", "address", "phone", "upload", "name", "title"],
            description: "Field type for validation"
          },
          required: { type: "boolean", description: "Whether the field must be completed" },
          roleId: { type: "string", description: "Signer role this field belongs to" },
          roleName: { type: "string", description: "Human-readable role name" },
          placeholder: { type: "string", description: "Placeholder text shown when field is empty" },
          defaultValue: { type: "string", description: "Pre-filled value" },
          validation: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", "email", "number", "phone", "date", "regex"] },
              pattern: { type: "string", description: "Regex pattern for validation" },
              minLength: { type: "integer" },
              maxLength: { type: "integer" },
              message: { type: "string", description: "Error message if validation fails" },
            },
          },
        },
        required: ["fieldId", "fieldName", "type", "required", "roleId"],
      },
      TemplateSchema: {
        type: "object",
        description: "Template with field mappings for API use",
        properties: {
          templateId: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string", enum: ["draft", "active"] },
          signerRoles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                roleId: { type: "string" },
                name: { type: "string" },
                order: { type: "integer" },
              },
            },
          },
          fields: {
            type: "array",
            items: { $ref: "#/components/schemas/FieldSchema" },
          },
          metadata: {
            type: "object",
            properties: {
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
              version: { type: "integer" },
              fieldCount: { type: "integer" },
            },
          },
        },
      },
      FieldValuesPayload: {
        type: "object",
        description: "Key-value pairs for field population. Keys can be fieldId or fieldName.",
        additionalProperties: {
          oneOf: [
            { type: "string" },
            { type: "boolean" },
            { type: "number" },
          ],
        },
        example: {
          "fld_abc123_xyz789": "Acme Corporation",
          "employee_name": "John Doe",
          "start_date": "2026-01-15",
        },
      },
      FieldValidationError: {
        type: "object",
        properties: {
          code: {
            type: "string",
            enum: ["FIELD_NOT_FOUND", "FIELD_TYPE_MISMATCH", "REQUIRED_FIELD_MISSING", "VALIDATION_FAILED", "INVALID_VALUE"],
          },
          fieldId: { type: "string" },
          fieldName: { type: "string" },
          message: { type: "string" },
          expectedType: { type: "string" },
          receivedType: { type: "string" },
        },
        required: ["code", "fieldId", "message"],
      },
      EnvelopeSendRequest: {
        type: "object",
        description: "Request to send an envelope using a template with pre-populated fields",
        required: ["templateId", "recipients"],
        properties: {
          templateId: { type: "string", description: "ID of the template to use" },
          recipients: {
            type: "array",
            items: {
              type: "object",
              required: ["email", "name", "roleId"],
              properties: {
                email: { type: "string", format: "email" },
                name: { type: "string" },
                roleId: { type: "string", description: "Template role ID to assign this recipient" },
                require2FA: { type: "boolean", default: false },
                phoneNumber: { type: "string", description: "Phone for 2FA verification" },
              },
            },
          },
          fieldValues: { $ref: "#/components/schemas/FieldValuesPayload" },
          options: {
            type: "object",
            properties: {
              title: { type: "string", description: "Custom envelope title (defaults to template name)" },
              message: { type: "string", description: "Message to include in email" },
              expirationDays: { type: "integer", default: 30, description: "Days until envelope expires" },
              enableReminders: { type: "boolean", default: true },
            },
          },
        },
        example: {
          templateId: "tmpl_123abc",
          recipients: [
            { email: "john@example.com", name: "John Doe", roleId: "signer-1" }
          ],
          fieldValues: {
            "business_name": "Acme Corp",
            "loan_amount": "50000",
          },
          options: {
            message: "Please review and sign this document",
            expirationDays: 14,
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "object" },
            },
            required: ["code", "message"],
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Bad request - invalid input",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "invalid_request",
                message: "Invalid input provided",
              },
            },
          },
        },
      },
      Unauthorized: {
        description: "Unauthorized - missing or invalid API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "unauthorized",
                message: "Invalid or expired API key",
              },
            },
          },
        },
      },
      Forbidden: {
        description: "Forbidden - insufficient permissions",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "permission_denied",
                message: "Missing required permissions",
              },
            },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "not_found",
                message: "Resource not found",
              },
            },
          },
        },
      },
      RateLimited: {
        description: "Rate limit exceeded",
        headers: {
          "X-RateLimit-Limit": {
            schema: { type: "integer" },
            description: "Rate limit ceiling",
          },
          "X-RateLimit-Remaining": {
            schema: { type: "integer" },
            description: "Rate limit remaining",
          },
          "X-RateLimit-Reset": {
            schema: { type: "integer" },
            description: "Rate limit reset timestamp",
          },
          "Retry-After": {
            schema: { type: "integer" },
            description: "Seconds until retry",
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "rate_limited",
                message: "Rate limit exceeded",
                details: { retryAfter: 60 },
              },
            },
          },
        },
      },
    },
  },
};
