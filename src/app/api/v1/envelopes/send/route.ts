/**
 * API Envelope Send Endpoint
 * POST /api/v1/envelopes/send
 *
 * Creates and sends an envelope from a template with pre-populated field values.
 * This is the primary API endpoint for CRM integrations.
 *
 * Request format (DocuSign-compatible):
 * {
 *   "templateId": "tmpl_123",
 *   "recipients": [
 *     { "email": "user@email.com", "name": "John Doe", "roleId": "signer-1" }
 *   ],
 *   "fieldValues": {
 *     "business_name": "Acme Corp",
 *     "loan_amount": "50000",
 *     "owner_signature": "SIGN"
 *   },
 *   "options": {
 *     "message": "Please sign this document",
 *     "expirationDays": 30,
 *     "enableReminders": true
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiSuccess, apiError } from "@/lib/api-auth";
import { FieldMappingService, type FieldValuesPayload } from "@/lib/field-mapping";
import { TemplatesService } from "@/lib/templates";
import { sql } from "@/lib/db";
import { sendSignatureRequestEmail } from "@/lib/email-service";
import { logEnvelopeEvent } from "@/lib/audit-log";

interface SendEnvelopeApiRequest {
  templateId: string;
  recipients: Array<{
    email: string;
    name: string;
    roleId: string;
    require2FA?: boolean;
    phoneNumber?: string;
  }>;
  fieldValues?: FieldValuesPayload;
  options?: {
    title?: string;
    message?: string;
    expirationDays?: number;
    enableReminders?: boolean;
  };
}

// Ensure signing sessions table exists
async function ensureSigningTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) NOT NULL,
      token VARCHAR(255) UNIQUE NOT NULL,
      recipient_name VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      field_values JSONB DEFAULT '{}',
      signature_data TEXT,
      ip_address VARCHAR(100),
      user_agent TEXT,
      viewed_at TIMESTAMP,
      signed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      two_fa_required BOOLEAN DEFAULT false,
      two_fa_phone VARCHAR(50),
      two_fa_verified BOOLEAN DEFAULT false,
      two_fa_verified_at TIMESTAMP
    )
  `;
}

// Ensure envelope documents table exists
async function ensureDocumentsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id VARCHAR(255) NOT NULL,
      envelope_id VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      pdf_data TEXT,
      signature_fields JSONB DEFAULT '[]',
      message TEXT,
      is_demo BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export const POST = withApiAuth(
  async (request: NextRequest, auth) => {
    try {
      const body: SendEnvelopeApiRequest = await request.json();

      // Validate required fields
      if (!body.templateId) {
        return apiError("INVALID_REQUEST", "templateId is required", 400);
      }
      if (!body.recipients || body.recipients.length === 0) {
        return apiError("INVALID_REQUEST", "At least one recipient is required", 400);
      }

      // Fetch template
      const template = await TemplatesService.getTemplateById(
        auth.organizationId,
        body.templateId
      );

      if (!template) {
        return apiError("NOT_FOUND", `Template "${body.templateId}" not found`, 404);
      }

      if (template.status !== 'active') {
        return apiError(
          "INVALID_REQUEST",
          `Template "${body.templateId}" is not active. Only active templates can be used for sending.`,
          400
        );
      }

      // Get template field schema
      const templateSchema = await FieldMappingService.getTemplateFieldsSchema(
        auth.organizationId,
        body.templateId
      );

      if (!templateSchema) {
        return apiError("INTERNAL_ERROR", "Failed to load template schema", 500);
      }

      // Validate field values if provided
      if (body.fieldValues && Object.keys(body.fieldValues).length > 0) {
        const validation = FieldMappingService.validateFieldValues(
          body.fieldValues,
          templateSchema.fields,
          { checkRequired: false } // Don't require all fields at send time
        );

        if (!validation.valid) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "field_validation_failed",
                message: "One or more field values failed validation",
                details: validation.errors.map(err => ({
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
      }

      // Validate recipients match template roles
      const roleMap = new Map(templateSchema.signerRoles.map(r => [r.roleId, r]));
      for (const recipient of body.recipients) {
        if (!roleMap.has(recipient.roleId)) {
          return apiError(
            "INVALID_REQUEST",
            `Role "${recipient.roleId}" not found in template. Available roles: ${templateSchema.signerRoles.map(r => r.roleId).join(', ')}`,
            400
          );
        }
      }

      // Generate envelope ID
      const envelopeId = `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const title = body.options?.title || template.name;

      // Map template fields to signature fields with recipient assignment and field values
      const signatureFields = template.fields.map(field => {
        const recipient = body.recipients.find(r => r.roleId === field.signerRoleId);
        const prefillValue = body.fieldValues?.[field.id] || body.fieldValues?.[field.name] || field.defaultValue;

        return {
          id: field.id,
          type: field.type,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          page: field.page,
          recipientId: recipient?.email || field.signerRoleId,
          required: field.required,
          prefillValue: prefillValue ? String(prefillValue) : '',
          placeholder: field.placeholder || '',
        };
      });

      // Store document
      await ensureDocumentsTable();
      await sql`
        INSERT INTO envelope_documents (org_id, envelope_id, title, pdf_data, signature_fields, message)
        VALUES (
          ${auth.organizationId},
          ${envelopeId},
          ${title},
          ${template.documentData || ''},
          ${JSON.stringify(signatureFields)}::jsonb,
          ${body.options?.message || ''}
        )
      `;

      // Create signing sessions and send emails
      await ensureSigningTable();

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pearsign.com';
      const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];

      const expiresAt = body.options?.expirationDays
        ? new Date(Date.now() + body.options.expirationDays * 24 * 60 * 60 * 1000)
        : null;

      for (const recipient of body.recipients) {
        const signingToken = `${envelopeId}_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
        const signingUrl = `${baseUrl}/sign/${signingToken}`;

        // Store signing session
        await sql`
          INSERT INTO envelope_signing_sessions (
            org_id, envelope_id, token, recipient_name, recipient_email, status, expires_at,
            two_fa_required, two_fa_phone
          ) VALUES (
            ${auth.organizationId},
            ${envelopeId},
            ${signingToken},
            ${recipient.name},
            ${recipient.email},
            'pending',
            ${expiresAt},
            ${recipient.require2FA || false},
            ${recipient.phoneNumber || null}
          )
        `;

        // Send email
        let expirationDate: string | undefined;
        if (body.options?.expirationDays) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + body.options.expirationDays);
          expirationDate = expDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }

        const emailResult = await sendSignatureRequestEmail({
          documentName: title,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          senderName: 'PearSign',
          senderEmail: process.env.SENDGRID_FROM_EMAIL || 'no-reply@premiumcapital.com',
          message: body.options?.message,
          signingUrl,
          expirationDate,
          orgId: auth.organizationId, // TENANT ISOLATION: Pass orgId for proper credential lookup
        });

        emailResults.push({
          email: recipient.email,
          success: emailResult.success,
          error: emailResult.error,
        });

        // Log event
        await logEnvelopeEvent('envelope.sent', {
          orgId: auth.organizationId,
          envelopeId,
          envelopeTitle: title,
          actorId: auth.apiKey.id,
          recipientEmail: recipient.email,
          details: {
            source: 'api',
            apiKeyId: auth.apiKey.id,
            templateId: body.templateId,
            emailSent: emailResult.success,
            error: emailResult.error,
          },
        });
      }

      // Increment template use count
      await TemplatesService.incrementUseCount(auth.organizationId, body.templateId);

      // Return success response
      return apiSuccess({
        success: true,
        data: {
          envelopeId,
          title,
          status: 'in_signing',
          templateId: body.templateId,
          recipients: body.recipients.map(r => ({
            email: r.email,
            name: r.name,
            roleId: r.roleId,
            status: 'pending',
          })),
          fieldCount: signatureFields.length,
          prefilledFieldCount: signatureFields.filter(f => f.prefillValue).length,
          emailResults,
          createdAt: new Date().toISOString(),
        },
      }, 201);
    } catch (error) {
      console.error("Error sending envelope via API:", error);
      return apiError("INTERNAL_ERROR", "Failed to send envelope", 500);
    }
  },
  { requiredPermissions: ["envelopes:create", "envelopes:send"] }
);
