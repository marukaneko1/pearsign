/**
 * Template Use API
 *
 * Multi-tenancy enforced via withTenant middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { TemplatesService } from '@/lib/templates';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * POST /api/templates/[id]/use
 * Use a template to start a new envelope
 * Returns the template data needed for the document prepare flow
 */
export const POST = withTenant<{ id: string }>(
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
      const body = await request.json();

      const { recipients } = body;

      // Get the template
      const template = await TemplatesService.getTemplateById(tenantId, id);

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      // Check if template is active (warn but allow draft templates for testing)
      if (template.status !== 'active') {
        console.warn(`Template ${id} is in ${template.status} status, but allowing use for testing`);
      }

      // Increment use count
      await TemplatesService.incrementUseCount(tenantId, id);

      // Return the template data needed for the document prepare flow
      // The frontend will use this data to pre-populate the send document dialog
      return NextResponse.json({
        success: true,
        data: {
          template: {
            id: template.id,
            name: template.name,
            description: template.description,
            category: template.category,
            status: template.status,
            fields: template.fields,
            signerRoles: template.signerRoles,
            documentData: template.documentData,
            documentUrl: template.documentUrl,
          },
          // Map signer roles to recipients if provided
          mappedRecipients: recipients ? mapRecipientsToRoles(recipients, template.signerRoles) : null,
        },
      });
    } catch (error) {
      console.error('Error using template:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to use template' },
        { status: 500 }
      );
    }
  }
);

interface Recipient {
  name: string;
  email: string;
  roleId?: string;
}

function mapRecipientsToRoles(
  recipients: Recipient[],
  signerRoles: { id: string; name: string; order: number; color: string }[]
) {
  return recipients.map((recipient, index) => {
    const role = signerRoles[index] || signerRoles[0];
    return {
      ...recipient,
      roleId: recipient.roleId || role?.id,
      roleName: role?.name,
      color: role?.color,
    };
  });
}
