/**
 * PearSign Tenant Branding Service
 *
 * Centralized, tokenized branding per tenant:
 * - Logo
 * - Primary color
 * - Email styles
 * - Company info
 *
 * Templates reference tokens, never hardcoded values.
 * One change updates everything for that tenant.
 */

import { sql } from './db';
import { TenantContext } from './tenant';

// ============== TYPES ==============

export interface TenantBranding {
  tenantId: string;
  companyName: string;
  logoUrl?: string;
  logoBase64?: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  emailStyles: EmailStyles;
  footerText?: string;
  websiteUrl?: string;
  supportEmail?: string;
  privacyUrl?: string;
  termsUrl?: string;
  updatedAt: string;
}

export interface EmailStyles {
  headerBackgroundColor: string;
  headerTextColor: string;
  bodyBackgroundColor: string;
  bodyTextColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  footerBackgroundColor: string;
  footerTextColor: string;
  linkColor: string;
}

export interface BrandingTokens {
  // Company
  '{{company_name}}': string;
  '{{company_logo_url}}': string;
  '{{company_logo_base64}}': string;
  '{{company_website}}': string;
  '{{company_support_email}}': string;
  '{{company_footer}}': string;

  // Colors
  '{{primary_color}}': string;
  '{{secondary_color}}': string;
  '{{accent_color}}': string;
  '{{text_color}}': string;
  '{{background_color}}': string;

  // Email-specific
  '{{email_header_bg}}': string;
  '{{email_header_text}}': string;
  '{{email_body_bg}}': string;
  '{{email_body_text}}': string;
  '{{email_button_bg}}': string;
  '{{email_button_text}}': string;
  '{{email_footer_bg}}': string;
  '{{email_footer_text}}': string;
  '{{email_link_color}}': string;

  // Links
  '{{privacy_url}}': string;
  '{{terms_url}}': string;
}

// Default branding for new tenants
const DEFAULT_BRANDING: Omit<TenantBranding, 'tenantId' | 'updatedAt'> = {
  companyName: 'PearSign',
  primaryColor: '#16a34a', // Green-600
  secondaryColor: '#22c55e', // Green-500
  accentColor: '#15803d', // Green-700
  textColor: '#1f2937', // Gray-800
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  emailStyles: {
    headerBackgroundColor: '#16a34a',
    headerTextColor: '#ffffff',
    bodyBackgroundColor: '#f9fafb',
    bodyTextColor: '#1f2937',
    buttonBackgroundColor: '#16a34a',
    buttonTextColor: '#ffffff',
    footerBackgroundColor: '#f3f4f6',
    footerTextColor: '#6b7280',
    linkColor: '#16a34a',
  },
  footerText: 'Powered by PearSign',
};

// ============== BRANDING SERVICE ==============

export const TenantBrandingService = {
  /**
   * Initialize branding table
   */
  async initializeTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_branding (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL DEFAULT 'PearSign',
        logo_url TEXT,
        logo_base64 TEXT,
        primary_color VARCHAR(20) DEFAULT '#16a34a',
        secondary_color VARCHAR(20),
        accent_color VARCHAR(20),
        text_color VARCHAR(20) DEFAULT '#1f2937',
        background_color VARCHAR(20) DEFAULT '#ffffff',
        font_family VARCHAR(255),
        email_styles JSONB DEFAULT '{}',
        footer_text TEXT,
        website_url VARCHAR(500),
        support_email VARCHAR(255),
        privacy_url VARCHAR(500),
        terms_url VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant_id ON tenant_branding(tenant_id)
    `;
  },

  /**
   * Get branding for a tenant
   */
  async getBranding(tenantId: string): Promise<TenantBranding> {
    const result = await sql`
      SELECT * FROM tenant_branding WHERE tenant_id = ${tenantId}
    `;

    if (result.length === 0) {
      // Return defaults if no custom branding
      return {
        tenantId,
        ...DEFAULT_BRANDING,
        updatedAt: new Date().toISOString(),
      };
    }

    return mapBrandingFromDb(result[0]);
  },

  /**
   * Update branding for a tenant
   */
  async updateBranding(
    tenantId: string,
    updates: Partial<Omit<TenantBranding, 'tenantId' | 'updatedAt'>>
  ): Promise<TenantBranding> {
    // Check if branding exists
    const existing = await sql`
      SELECT id FROM tenant_branding WHERE tenant_id = ${tenantId}
    `;

    if (existing.length === 0) {
      // Create new branding record
      const result = await sql`
        INSERT INTO tenant_branding (
          tenant_id, company_name, logo_url, logo_base64,
          primary_color, secondary_color, accent_color, text_color, background_color,
          font_family, email_styles, footer_text, website_url, support_email,
          privacy_url, terms_url
        ) VALUES (
          ${tenantId},
          ${updates.companyName || DEFAULT_BRANDING.companyName},
          ${updates.logoUrl || null},
          ${updates.logoBase64 || null},
          ${updates.primaryColor || DEFAULT_BRANDING.primaryColor},
          ${updates.secondaryColor || null},
          ${updates.accentColor || null},
          ${updates.textColor || DEFAULT_BRANDING.textColor},
          ${updates.backgroundColor || DEFAULT_BRANDING.backgroundColor},
          ${updates.fontFamily || null},
          ${JSON.stringify(updates.emailStyles || DEFAULT_BRANDING.emailStyles)},
          ${updates.footerText || DEFAULT_BRANDING.footerText},
          ${updates.websiteUrl || null},
          ${updates.supportEmail || null},
          ${updates.privacyUrl || null},
          ${updates.termsUrl || null}
        )
        RETURNING *
      `;
      return mapBrandingFromDb(result[0]);
    }

    // Update existing branding
    const result = await sql`
      UPDATE tenant_branding SET
        company_name = COALESCE(${updates.companyName || null}, company_name),
        logo_url = COALESCE(${updates.logoUrl}, logo_url),
        logo_base64 = COALESCE(${updates.logoBase64}, logo_base64),
        primary_color = COALESCE(${updates.primaryColor || null}, primary_color),
        secondary_color = COALESCE(${updates.secondaryColor}, secondary_color),
        accent_color = COALESCE(${updates.accentColor}, accent_color),
        text_color = COALESCE(${updates.textColor || null}, text_color),
        background_color = COALESCE(${updates.backgroundColor || null}, background_color),
        font_family = COALESCE(${updates.fontFamily}, font_family),
        email_styles = COALESCE(${updates.emailStyles ? JSON.stringify(updates.emailStyles) : null}::jsonb, email_styles),
        footer_text = COALESCE(${updates.footerText}, footer_text),
        website_url = COALESCE(${updates.websiteUrl}, website_url),
        support_email = COALESCE(${updates.supportEmail}, support_email),
        privacy_url = COALESCE(${updates.privacyUrl}, privacy_url),
        terms_url = COALESCE(${updates.termsUrl}, terms_url),
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
      RETURNING *
    `;

    return mapBrandingFromDb(result[0]);
  },

  /**
   * Get branding tokens for template rendering
   */
  async getBrandingTokens(tenantId: string): Promise<BrandingTokens> {
    const branding = await this.getBranding(tenantId);

    return {
      // Company
      '{{company_name}}': branding.companyName,
      '{{company_logo_url}}': branding.logoUrl || '',
      '{{company_logo_base64}}': branding.logoBase64 || '',
      '{{company_website}}': branding.websiteUrl || '',
      '{{company_support_email}}': branding.supportEmail || '',
      '{{company_footer}}': branding.footerText || '',

      // Colors
      '{{primary_color}}': branding.primaryColor,
      '{{secondary_color}}': branding.secondaryColor || branding.primaryColor,
      '{{accent_color}}': branding.accentColor || branding.primaryColor,
      '{{text_color}}': branding.textColor || '#1f2937',
      '{{background_color}}': branding.backgroundColor || '#ffffff',

      // Email-specific
      '{{email_header_bg}}': branding.emailStyles.headerBackgroundColor,
      '{{email_header_text}}': branding.emailStyles.headerTextColor,
      '{{email_body_bg}}': branding.emailStyles.bodyBackgroundColor,
      '{{email_body_text}}': branding.emailStyles.bodyTextColor,
      '{{email_button_bg}}': branding.emailStyles.buttonBackgroundColor,
      '{{email_button_text}}': branding.emailStyles.buttonTextColor,
      '{{email_footer_bg}}': branding.emailStyles.footerBackgroundColor,
      '{{email_footer_text}}': branding.emailStyles.footerTextColor,
      '{{email_link_color}}': branding.emailStyles.linkColor,

      // Links
      '{{privacy_url}}': branding.privacyUrl || '',
      '{{terms_url}}': branding.termsUrl || '',
    };
  },

  /**
   * Render template with branding tokens
   */
  async renderWithBranding(tenantId: string, template: string): Promise<string> {
    const tokens = await this.getBrandingTokens(tenantId);

    let rendered = template;
    for (const [token, value] of Object.entries(tokens)) {
      rendered = rendered.replaceAll(token, value);
    }

    return rendered;
  },

  /**
   * Upload logo and store as base64
   */
  async uploadLogo(tenantId: string, logoBase64: string, logoUrl?: string): Promise<void> {
    await sql`
      INSERT INTO tenant_branding (tenant_id, logo_base64, logo_url)
      VALUES (${tenantId}, ${logoBase64}, ${logoUrl || null})
      ON CONFLICT (tenant_id) DO UPDATE SET
        logo_base64 = ${logoBase64},
        logo_url = COALESCE(${logoUrl || null}, tenant_branding.logo_url),
        updated_at = NOW()
    `;
  },

  /**
   * Get logo for a tenant
   */
  async getLogo(tenantId: string): Promise<{ base64?: string; url?: string } | null> {
    const result = await sql`
      SELECT logo_base64, logo_url FROM tenant_branding WHERE tenant_id = ${tenantId}
    `;

    if (result.length === 0) return null;

    return {
      base64: result[0].logo_base64 as string | undefined,
      url: result[0].logo_url as string | undefined,
    };
  },

  /**
   * Generate email HTML with branding
   */
  async generateBrandedEmailHtml(
    tenantId: string,
    content: {
      subject: string;
      preheader?: string;
      bodyHtml: string;
      ctaText?: string;
      ctaUrl?: string;
    }
  ): Promise<string> {
    const branding = await this.getBranding(tenantId);
    const styles = branding.emailStyles;

    // Get logo as base64 for email embedding
    const logoSrc = branding.logoBase64
      ? `data:image/png;base64,${branding.logoBase64.replace(/^data:image\/\w+;base64,/, '')}`
      : branding.logoUrl || '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
  ${content.preheader ? `<meta name="description" content="${content.preheader}">` : ''}
  <style>
    body { margin: 0; padding: 0; font-family: ${branding.fontFamily || "'Inter', sans-serif"}; }
    .container { max-width: 600px; margin: 0 auto; }
    a { color: ${styles.linkColor}; }
  </style>
</head>
<body style="background-color: ${styles.bodyBackgroundColor}; margin: 0; padding: 0;">
  ${content.preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${content.preheader}</div>` : ''}

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${styles.bodyBackgroundColor};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${styles.headerBackgroundColor}; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              ${logoSrc ? `<img src="${logoSrc}" alt="${branding.companyName}" style="max-height: 40px; width: auto;" />` : `<span style="color: ${styles.headerTextColor}; font-size: 24px; font-weight: bold;">${branding.companyName}</span>`}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px; color: ${styles.bodyTextColor};">
              ${content.bodyHtml}

              ${content.ctaText && content.ctaUrl ? `
              <div style="margin-top: 24px; text-align: center;">
                <a href="${content.ctaUrl}" style="display: inline-block; background-color: ${styles.buttonBackgroundColor}; color: ${styles.buttonTextColor}; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  ${content.ctaText}
                </a>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${styles.footerBackgroundColor}; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: ${styles.footerTextColor}; font-size: 12px;">
                ${branding.footerText || `Powered by ${branding.companyName}`}
              </p>
              ${branding.privacyUrl || branding.termsUrl ? `
              <p style="margin: 8px 0 0; color: ${styles.footerTextColor}; font-size: 12px;">
                ${branding.privacyUrl ? `<a href="${branding.privacyUrl}" style="color: ${styles.linkColor};">Privacy Policy</a>` : ''}
                ${branding.privacyUrl && branding.termsUrl ? ' | ' : ''}
                ${branding.termsUrl ? `<a href="${branding.termsUrl}" style="color: ${styles.linkColor};">Terms of Service</a>` : ''}
              </p>
              ` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  },
};

// ============== HELPER FUNCTIONS ==============

function mapBrandingFromDb(row: Record<string, unknown>): TenantBranding {
  let emailStyles: EmailStyles = DEFAULT_BRANDING.emailStyles;

  try {
    if (typeof row.email_styles === 'string') {
      emailStyles = { ...DEFAULT_BRANDING.emailStyles, ...JSON.parse(row.email_styles) };
    } else if (row.email_styles && typeof row.email_styles === 'object') {
      emailStyles = { ...DEFAULT_BRANDING.emailStyles, ...(row.email_styles as EmailStyles) };
    }
  } catch {
    // Use defaults
  }

  return {
    tenantId: row.tenant_id as string,
    companyName: (row.company_name as string) || DEFAULT_BRANDING.companyName,
    logoUrl: row.logo_url as string | undefined,
    logoBase64: row.logo_base64 as string | undefined,
    primaryColor: (row.primary_color as string) || DEFAULT_BRANDING.primaryColor,
    secondaryColor: row.secondary_color as string | undefined,
    accentColor: row.accent_color as string | undefined,
    textColor: (row.text_color as string) || DEFAULT_BRANDING.textColor,
    backgroundColor: (row.background_color as string) || DEFAULT_BRANDING.backgroundColor,
    fontFamily: row.font_family as string | undefined,
    emailStyles,
    footerText: row.footer_text as string | undefined,
    websiteUrl: row.website_url as string | undefined,
    supportEmail: row.support_email as string | undefined,
    privacyUrl: row.privacy_url as string | undefined,
    termsUrl: row.terms_url as string | undefined,
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ============== CONVENIENCE FUNCTIONS ==============

/**
 * Get branding for use in templates (with context)
 */
export async function getBrandingForContext(context: TenantContext): Promise<TenantBranding> {
  return TenantBrandingService.getBranding(context.tenant.id);
}

/**
 * Render email content with tenant branding
 */
export async function renderBrandedEmail(
  context: TenantContext,
  content: {
    subject: string;
    bodyHtml: string;
    preheader?: string;
    ctaText?: string;
    ctaUrl?: string;
  }
): Promise<string> {
  return TenantBrandingService.generateBrandedEmailHtml(context.tenant.id, content);
}
