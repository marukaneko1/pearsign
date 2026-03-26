/**
 * PearSign System Email Templates
 *
 * Centralized email templates that are:
 * - Tenant-scoped
 * - HTML editable
 * - Token-based (using branding tokens)
 * - Validated before saving
 */

import { sql } from './db';
import { TenantBrandingService, BrandingTokens } from './tenant-branding';

// ============== TYPES ==============

export type EmailTemplateType =
  | 'signature_request'
  | 'signature_reminder'
  | 'signing_complete_recipient'
  | 'signing_complete_sender'
  | 'document_voided'
  | 'document_declined'
  | 'document_expired'
  | 'welcome_email'
  | 'team_invitation'
  | 'password_reset'
  | 'verification_code';

export interface SystemEmailTemplate {
  id: string;
  tenantId: string;
  templateType: EmailTemplateType;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  variables: string[]; // List of variables used in the template
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateInput {
  templateType: EmailTemplateType;
  name?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  isActive?: boolean;
}

export interface EmailValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
}

// Available variables for each template type
export const TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  signature_request: [
    '{{recipient_name}}',
    '{{sender_name}}',
    '{{sender_email}}',
    '{{document_title}}',
    '{{message}}',
    '{{signing_url}}',
    '{{expires_at}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  signature_reminder: [
    '{{recipient_name}}',
    '{{sender_name}}',
    '{{document_title}}',
    '{{signing_url}}',
    '{{expires_at}}',
    '{{days_remaining}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  signing_complete_recipient: [
    '{{recipient_name}}',
    '{{document_title}}',
    '{{signed_at}}',
    '{{download_url}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  signing_complete_sender: [
    '{{sender_name}}',
    '{{document_title}}',
    '{{recipient_name}}',
    '{{completed_at}}',
    '{{download_url}}',
    '{{all_completed}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  document_voided: [
    '{{recipient_name}}',
    '{{document_title}}',
    '{{voided_by}}',
    '{{void_reason}}',
    '{{voided_at}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  document_declined: [
    '{{sender_name}}',
    '{{document_title}}',
    '{{declined_by}}',
    '{{decline_reason}}',
    '{{declined_at}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  document_expired: [
    '{{recipient_name}}',
    '{{document_title}}',
    '{{expired_at}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  welcome_email: [
    '{{user_name}}',
    '{{user_email}}',
    '{{login_url}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  team_invitation: [
    '{{invitee_name}}',
    '{{inviter_name}}',
    '{{organization_name}}',
    '{{role}}',
    '{{accept_url}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  password_reset: [
    '{{user_name}}',
    '{{reset_url}}',
    '{{expires_in}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
  verification_code: [
    '{{recipient_name}}',
    '{{code}}',
    '{{expires_in}}',
    '{{company_name}}',
    '{{company_logo_url}}',
  ],
};

// Default templates for each type
const DEFAULT_TEMPLATES: Record<EmailTemplateType, { name: string; subject: string; bodyHtml: string }> = {
  signature_request: {
    name: 'Signature Request',
    subject: '{{sender_name}} has sent you a document to sign',
    bodyHtml: `
      <h2>Hello {{recipient_name}},</h2>
      <p>{{sender_name}} has requested your signature on "<strong>{{document_title}}</strong>".</p>
      {{#if message}}
      <p><em>{{message}}</em></p>
      {{/if}}
      <p>Please review and sign the document at your earliest convenience.</p>
      <p>This document expires on {{expires_at}}.</p>
    `,
  },
  signature_reminder: {
    name: 'Signature Reminder',
    subject: 'Reminder: Please sign "{{document_title}}"',
    bodyHtml: `
      <h2>Hello {{recipient_name}},</h2>
      <p>This is a friendly reminder that {{sender_name}} is waiting for your signature on "<strong>{{document_title}}</strong>".</p>
      <p>This document expires in {{days_remaining}} days.</p>
    `,
  },
  signing_complete_recipient: {
    name: 'Signing Complete (Recipient)',
    subject: 'Your signature has been recorded',
    bodyHtml: `
      <h2>Thank you, {{recipient_name}}!</h2>
      <p>Your signature on "<strong>{{document_title}}</strong>" has been successfully recorded on {{signed_at}}.</p>
      <p>You can download a copy of the signed document for your records.</p>
    `,
  },
  signing_complete_sender: {
    name: 'Signing Complete (Sender)',
    subject: '{{recipient_name}} has signed "{{document_title}}"',
    bodyHtml: `
      <h2>Good news, {{sender_name}}!</h2>
      <p>{{recipient_name}} has signed "<strong>{{document_title}}</strong>" on {{completed_at}}.</p>
      {{#if all_completed}}
      <p><strong>All recipients have now signed this document.</strong></p>
      {{/if}}
    `,
  },
  document_voided: {
    name: 'Document Voided',
    subject: '"{{document_title}}" has been voided',
    bodyHtml: `
      <h2>Hello {{recipient_name}},</h2>
      <p>The document "<strong>{{document_title}}</strong>" has been voided by {{voided_by}} on {{voided_at}}.</p>
      {{#if void_reason}}
      <p><strong>Reason:</strong> {{void_reason}}</p>
      {{/if}}
      <p>No further action is required from you.</p>
    `,
  },
  document_declined: {
    name: 'Document Declined',
    subject: '{{declined_by}} has declined to sign "{{document_title}}"',
    bodyHtml: `
      <h2>Hello {{sender_name}},</h2>
      <p>{{declined_by}} has declined to sign "<strong>{{document_title}}</strong>" on {{declined_at}}.</p>
      {{#if decline_reason}}
      <p><strong>Reason:</strong> {{decline_reason}}</p>
      {{/if}}
    `,
  },
  document_expired: {
    name: 'Document Expired',
    subject: '"{{document_title}}" has expired',
    bodyHtml: `
      <h2>Hello {{recipient_name}},</h2>
      <p>The document "<strong>{{document_title}}</strong>" has expired on {{expired_at}} and is no longer available for signing.</p>
      <p>Please contact the sender if you need a new signing request.</p>
    `,
  },
  welcome_email: {
    name: 'Welcome Email',
    subject: 'Welcome to {{company_name}}!',
    bodyHtml: `
      <h2>Welcome, {{user_name}}!</h2>
      <p>Thank you for joining {{company_name}}. Your account has been created successfully.</p>
      <p>You can log in at any time to start sending documents for signature.</p>
    `,
  },
  team_invitation: {
    name: 'Team Invitation',
    subject: '{{inviter_name}} has invited you to join {{organization_name}}',
    bodyHtml: `
      <h2>Hello {{invitee_name}},</h2>
      <p>{{inviter_name}} has invited you to join {{organization_name}} as a {{role}}.</p>
      <p>Click the button below to accept the invitation and set up your account.</p>
    `,
  },
  password_reset: {
    name: 'Password Reset',
    subject: 'Reset your password',
    bodyHtml: `
      <h2>Hello {{user_name}},</h2>
      <p>We received a request to reset your password. Click the button below to create a new password.</p>
      <p>This link expires in {{expires_in}}.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  },
  verification_code: {
    name: 'Verification Code',
    subject: 'Your verification code: {{code}}',
    bodyHtml: `
      <h2>Hello {{recipient_name}},</h2>
      <p>Your verification code is:</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 24px; background: #f3f4f6; border-radius: 8px;">{{code}}</span>
      </div>
      <p>This code expires in {{expires_in}}.</p>
      <p>If you didn't request this code, please ignore this email.</p>
    `,
  },
};

// ============== EMAIL TEMPLATES SERVICE ==============

export const SystemEmailTemplatesService = {
  /**
   * Initialize email templates table
   */
  async initializeTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS system_email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        template_type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT,
        variables JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, template_type, version)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON system_email_templates(tenant_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_templates_type ON system_email_templates(tenant_id, template_type)
    `;
  },

  /**
   * Get template for a tenant
   */
  async getTemplate(tenantId: string, templateType: EmailTemplateType): Promise<SystemEmailTemplate | null> {
    const result = await sql`
      SELECT * FROM system_email_templates
      WHERE tenant_id = ${tenantId} AND template_type = ${templateType} AND is_active = true
      ORDER BY version DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;
    return mapTemplateFromDb(result[0]);
  },

  /**
   * Get template or default
   */
  async getTemplateOrDefault(tenantId: string, templateType: EmailTemplateType): Promise<SystemEmailTemplate> {
    const template = await this.getTemplate(tenantId, templateType);

    if (template) return template;

    // Return default template
    const defaultTemplate = DEFAULT_TEMPLATES[templateType];
    return {
      id: 'default',
      tenantId,
      templateType,
      name: defaultTemplate.name,
      subject: defaultTemplate.subject,
      bodyHtml: defaultTemplate.bodyHtml,
      variables: TEMPLATE_VARIABLES[templateType],
      isActive: true,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Get all templates for a tenant
   */
  async getAllTemplates(tenantId: string): Promise<SystemEmailTemplate[]> {
    const result = await sql`
      SELECT DISTINCT ON (template_type) *
      FROM system_email_templates
      WHERE tenant_id = ${tenantId} AND is_active = true
      ORDER BY template_type, version DESC
    `;

    return result.map(mapTemplateFromDb);
  },

  /**
   * Save template (creates new version)
   */
  async saveTemplate(tenantId: string, input: EmailTemplateInput): Promise<{ template: SystemEmailTemplate; validation: EmailValidationResult }> {
    // Validate template
    const validation = this.validateTemplate(input);

    if (!validation.valid) {
      throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
    }

    // Get current version
    const current = await this.getTemplate(tenantId, input.templateType);
    const newVersion = current ? current.version + 1 : 1;

    // Deactivate previous versions
    await sql`
      UPDATE system_email_templates
      SET is_active = false, updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND template_type = ${input.templateType}
    `;

    // Insert new version
    const result = await sql`
      INSERT INTO system_email_templates (
        tenant_id, template_type, name, subject, body_html, body_text,
        variables, is_active, version
      ) VALUES (
        ${tenantId},
        ${input.templateType},
        ${input.name || DEFAULT_TEMPLATES[input.templateType].name},
        ${input.subject},
        ${input.bodyHtml},
        ${input.bodyText || null},
        ${JSON.stringify(validation.variables)},
        ${input.isActive !== false},
        ${newVersion}
      )
      RETURNING *
    `;

    return {
      template: mapTemplateFromDb(result[0]),
      validation,
    };
  },

  /**
   * Validate a template
   */
  validateTemplate(input: EmailTemplateInput): EmailValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const variables: string[] = [];

    // Required fields
    if (!input.subject || input.subject.trim().length === 0) {
      errors.push('Subject is required');
    }
    if (!input.bodyHtml || input.bodyHtml.trim().length === 0) {
      errors.push('Body HTML is required');
    }

    // Validate HTML
    if (input.bodyHtml) {
      try {
        // Basic HTML validation - check for unclosed tags
        const openTags = input.bodyHtml.match(/<[a-z][^>]*(?<!\/)\s*>/gi) || [];
        const closeTags = input.bodyHtml.match(/<\/[a-z]+>/gi) || [];

        // This is a simple check - production should use a proper HTML parser
        if (openTags.length < closeTags.length) {
          warnings.push('HTML may have unclosed tags');
        }

        // Check for dangerous content
        if (/<script/i.test(input.bodyHtml)) {
          errors.push('Script tags are not allowed');
        }
        if (/javascript:/i.test(input.bodyHtml)) {
          errors.push('JavaScript URLs are not allowed');
        }
        if (/on\w+=/i.test(input.bodyHtml)) {
          errors.push('Inline event handlers are not allowed');
        }
      } catch (e) {
        errors.push('Invalid HTML');
      }
    }

    // Extract variables from template
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const allVariables = new Set<string>();

    if (input.subject) {
      let match;
      while ((match = variablePattern.exec(input.subject)) !== null) {
        allVariables.add(`{{${match[1]}}}`);
      }
    }
    if (input.bodyHtml) {
      variablePattern.lastIndex = 0;
      let match;
      while ((match = variablePattern.exec(input.bodyHtml)) !== null) {
        allVariables.add(`{{${match[1]}}}`);
      }
    }

    variables.push(...allVariables);

    // Check for unknown variables
    const allowedVariables = TEMPLATE_VARIABLES[input.templateType] || [];
    const brandingTokens = Object.keys({} as BrandingTokens);
    const allAllowed = [...allowedVariables, ...brandingTokens];

    for (const variable of variables) {
      if (!allAllowed.includes(variable) && !variable.startsWith('{{#') && !variable.startsWith('{{/')) {
        warnings.push(`Unknown variable: ${variable}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      variables,
    };
  },

  /**
   * Render template with variables
   */
  async renderTemplate(
    tenantId: string,
    templateType: EmailTemplateType,
    variables: Record<string, string>
  ): Promise<{ subject: string; bodyHtml: string; bodyText?: string }> {
    const template = await this.getTemplateOrDefault(tenantId, templateType);

    // Get branding tokens
    const brandingTokens = await TenantBrandingService.getBrandingTokens(tenantId);

    // Combine all variables
    const allVariables: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(brandingTokens).map(([k, v]) => [k, v])
      ),
      ...Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [`{{${k}}}`, v])
      ),
    };

    // Replace variables
    let subject = template.subject;
    let bodyHtml = template.bodyHtml;
    let bodyText = template.bodyText;

    for (const [key, value] of Object.entries(allVariables)) {
      const regex = new RegExp(escapeRegExp(key), 'g');
      subject = subject.replace(regex, value || '');
      bodyHtml = bodyHtml.replace(regex, value || '');
      if (bodyText) {
        bodyText = bodyText.replace(regex, value || '');
      }
    }

    // Handle conditionals (simple #if / /if)
    bodyHtml = processConditionals(bodyHtml, allVariables);

    return { subject, bodyHtml, bodyText };
  },

  /**
   * Preview template
   */
  async previewTemplate(
    tenantId: string,
    templateType: EmailTemplateType,
    customHtml?: string
  ): Promise<string> {
    const template = await this.getTemplateOrDefault(tenantId, templateType);
    const brandingTokens = await TenantBrandingService.getBrandingTokens(tenantId);

    // Sample data for preview
    const sampleData: Record<string, string> = {
      '{{recipient_name}}': 'John Doe',
      '{{sender_name}}': 'Jane Smith',
      '{{sender_email}}': 'jane@example.com',
      '{{document_title}}': 'Employment Agreement',
      '{{message}}': 'Please review and sign this document at your earliest convenience.',
      '{{signing_url}}': '#preview-link',
      '{{download_url}}': '#preview-link',
      '{{expires_at}}': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      '{{signed_at}}': new Date().toLocaleDateString(),
      '{{completed_at}}': new Date().toLocaleDateString(),
      '{{voided_at}}': new Date().toLocaleDateString(),
      '{{declined_at}}': new Date().toLocaleDateString(),
      '{{expired_at}}': new Date().toLocaleDateString(),
      '{{voided_by}}': 'Admin User',
      '{{declined_by}}': 'Recipient Name',
      '{{void_reason}}': 'Document contained errors',
      '{{decline_reason}}': 'Terms not acceptable',
      '{{days_remaining}}': '5',
      '{{all_completed}}': 'true',
      '{{user_name}}': 'New User',
      '{{user_email}}': 'newuser@example.com',
      '{{login_url}}': '#preview-link',
      '{{invitee_name}}': 'Invited User',
      '{{inviter_name}}': 'Admin User',
      '{{organization_name}}': brandingTokens['{{company_name}}'],
      '{{role}}': 'Member',
      '{{accept_url}}': '#preview-link',
      '{{reset_url}}': '#preview-link',
      '{{expires_in}}': '10 minutes',
      '{{code}}': '123456',
      ...Object.fromEntries(Object.entries(brandingTokens)),
    };

    let html = customHtml || template.bodyHtml;
    for (const [key, value] of Object.entries(sampleData)) {
      const regex = new RegExp(escapeRegExp(key), 'g');
      html = html.replace(regex, value);
    }

    // Process conditionals
    html = processConditionals(html, sampleData);

    // Wrap in email layout
    return TenantBrandingService.generateBrandedEmailHtml(tenantId, {
      subject: template.subject,
      bodyHtml: html,
    });
  },

  /**
   * Reset template to default
   */
  async resetToDefault(tenantId: string, templateType: EmailTemplateType): Promise<SystemEmailTemplate> {
    // Deactivate all versions
    await sql`
      UPDATE system_email_templates
      SET is_active = false, updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND template_type = ${templateType}
    `;

    // Return default template
    return this.getTemplateOrDefault(tenantId, templateType);
  },

  /**
   * Get template version history
   */
  async getVersionHistory(tenantId: string, templateType: EmailTemplateType): Promise<SystemEmailTemplate[]> {
    const result = await sql`
      SELECT * FROM system_email_templates
      WHERE tenant_id = ${tenantId} AND template_type = ${templateType}
      ORDER BY version DESC
      LIMIT 20
    `;

    return result.map(mapTemplateFromDb);
  },
};

// ============== HELPER FUNCTIONS ==============

function mapTemplateFromDb(row: Record<string, unknown>): SystemEmailTemplate {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    templateType: row.template_type as EmailTemplateType,
    name: row.name as string,
    subject: row.subject as string,
    bodyHtml: row.body_html as string,
    bodyText: row.body_text as string | undefined,
    variables: parseJsonField(row.variables) as string[],
    isActive: row.is_active as boolean,
    version: parseInt(row.version as string) || 1,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value || [];
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processConditionals(html: string, variables: Record<string, string>): string {
  // Simple conditional processing: {{#if variable}}...{{/if}}
  const conditionalPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return html.replace(conditionalPattern, (match, variable, content) => {
    const value = variables[`{{${variable}}}`];
    if (value && value !== '' && value !== 'false' && value !== 'undefined') {
      return content;
    }
    return '';
  });
}
