/**
 * Email Template Individual API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated email templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  updateEmailTemplate,
  resetEmailTemplate,
  TEMPLATE_METADATA,
  TEMPLATE_VARIABLES,
  type EmailTemplateType,
  type EmailTemplate,
} from '@/lib/email-templates';
import { clearBrandingCache } from '@/lib/email-service';

// Helper to build consistent JSON response with base64 encoded body
function buildTemplateResponse(template: EmailTemplate): NextResponse {
  const responseData = {
    id: template.id,
    type: template.type,
    name: template.name,
    description: template.description,
    subject: template.subject,
    // Use base64 encoding for large HTML content to avoid JSON escaping issues
    htmlBody: template.htmlBody ? Buffer.from(String(template.htmlBody)).toString('base64') : '',
    textBody: template.textBody ? Buffer.from(String(template.textBody)).toString('base64') : '',
    isBase64Encoded: true, // Flag to tell client to decode
    variables: TEMPLATE_VARIABLES[template.type as EmailTemplateType] || [],
    category: TEMPLATE_METADATA[template.type as EmailTemplateType]?.category || 'Other',
    isActive: template.isActive,
    isDefault: template.isDefault,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };

  return NextResponse.json(responseData);
}

/**
 * GET /api/settings/email-templates/[id]
 * Get a single template with full body for the current tenant
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
          { error: 'Template ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

      const templates = await sql`
        SELECT
          id,
          type,
          name,
          description,
          subject,
          html_body as "htmlBody",
          text_body as "textBody",
          variables,
          is_active as "isActive",
          is_default as "isDefault",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM email_templates
        WHERE id = ${id} AND organization_id = ${tenantId}
      `;

      if (!templates[0]) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }

      return buildTemplateResponse(templates[0] as EmailTemplate);
    } catch (error) {
      console.error('[Email Templates API] Error fetching template:', error);
      return NextResponse.json(
        { error: 'Failed to fetch email template' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/settings/email-templates/[id]
 * Update an email template for the current tenant
 */
export const PATCH = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: 'Template ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;
      const body = await request.json();
      const { subject, htmlBody, textBody, body: legacyBody, isActive, reset } = body;

      // Handle reset request
      if (reset === true) {
        const resetTemplate = await resetEmailTemplate(id, tenantId);

        // Clear email cache to use new template
        clearBrandingCache();

        return buildTemplateResponse(resetTemplate);
      }

      // Regular update
      const updated = await updateEmailTemplate(
        id,
        {
          subject,
          htmlBody: htmlBody || legacyBody, // Support both new and legacy field names
          textBody,
          isActive,
        },
        tenantId
      );

      // Clear email cache to use new template
      clearBrandingCache();

      return buildTemplateResponse(updated);
    } catch (error) {
      console.error('[Email Templates API] Error updating template:', error);
      return NextResponse.json(
        { error: 'Failed to update email template' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);

/**
 * DELETE /api/settings/email-templates/[id]
 * Reset an email template to default for the current tenant
 */
export const DELETE = withTenant<{ id: string }>(
  async (
    request: NextRequest,
    { tenantId }: TenantApiContext,
    params?: { id: string }
  ) => {
    try {
      if (!params?.id) {
        return NextResponse.json(
          { error: 'Template ID is required' },
          { status: 400 }
        );
      }

      const { id } = params;

      // Reset to default instead of deleting (templates should always exist)
      const resetTemplate = await resetEmailTemplate(id, tenantId);

      // Clear email cache
      clearBrandingCache();

      return NextResponse.json({
        success: true,
        message: 'Template reset to default',
        template: resetTemplate,
      });
    } catch (error) {
      console.error('[Email Templates API] Error resetting template:', error);
      return NextResponse.json(
        { error: 'Failed to reset email template' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
