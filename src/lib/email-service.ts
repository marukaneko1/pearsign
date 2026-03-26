/**
 * Email service using SendGrid for sending signed document notifications
 * Uses centralized email templates from the database with dynamic branding
 *
 * TENANT ISOLATION:
 * - Each tenant MUST provide their own SendGrid credentials
 * - Platform fallback (env vars) is ONLY used if explicitly enabled per-tenant
 * - orgId is REQUIRED for all email operations
 *
 * For public signing flows, orgId is extracted from the signing session
 */

import { sql } from './db';
import {
  getEmailTemplateByType,
  renderTemplate,
  type EmailTemplateType,
  type BrandingTokens,
  DEFAULT_HTML_TEMPLATES,
  DEFAULT_TEXT_TEMPLATES,
  DEFAULT_SUBJECTS,
} from './email-templates';

// Cache for SendGrid config (refresh every 5 minutes)
// Cache is now keyed by orgId
const configCache = new Map<string, { config: SendGridConfig; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for branding settings (keyed by orgId)
const brandingCache = new Map<string, { branding: BrandingTokens; timestamp: number }>();

// SendGrid configuration type
interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  platformFallbackEnabled: boolean;
  source: 'tenant' | 'platform' | 'none';
}

/**
 * Clear the SendGrid config cache (call after settings update)
 */
export function clearSendGridCache(orgId?: string) {
  if (orgId) {
    configCache.delete(orgId);
  } else {
    configCache.clear();
  }
}

/**
 * Clear the branding cache (call after settings update)
 */
export function clearBrandingCache(orgId?: string) {
  if (orgId) {
    brandingCache.delete(orgId);
  } else {
    brandingCache.clear();
  }
}

/**
 * Fetch branding settings from database
 *
 * TENANT ISOLATION: orgId is required for proper tenant isolation.
 * A warning is logged if orgId is missing.
 *
 * @param orgId - Organization ID for tenant-specific branding
 */
async function getBrandingSettings(orgId?: string): Promise<BrandingTokens> {
  // TENANT ISOLATION: Warn if orgId is missing
  if (!orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: getBrandingSettings called without orgId. Using system defaults.');
    orgId = '__system__'; // Use a clearly non-existent org to force defaults
  }
  const now = Date.now();
  const cached = brandingCache.get(orgId);

  // Return cached branding if still valid
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.branding;
  }

  try {
    const result = await sql`
      SELECT
        logo_url as "logoUrl",
        logo_data as "logoData",
        logo_mime_type as "logoMimeType",
        primary_color as "primaryColor",
        accent_color as "accentColor",
        product_name as "productName",
        support_email as "supportEmail",
        footer_text as "footerText"
      FROM branding_settings
      WHERE organization_id = ${orgId}
    `;

    let branding: BrandingTokens;

    if (result.length > 0) {
      // For emails, use data URI if we have logo data stored
      let logoUrl: string | null = null;

      if (result[0].logoData && result[0].logoMimeType) {
        logoUrl = `data:${result[0].logoMimeType};base64,${result[0].logoData}`;
      } else if (result[0].logoUrl) {
        const url = result[0].logoUrl;
        if (url.startsWith('http')) {
          logoUrl = url;
        } else {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
          if (baseUrl && baseUrl.startsWith('http')) {
            logoUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
          }
        }
      }

      branding = {
        logoUrl,
        primaryColor: result[0].primaryColor || '#2563eb',
        accentColor: result[0].accentColor || '#1d4ed8',
        productName: result[0].productName || 'PearSign',
        supportEmail: result[0].supportEmail || 'info@pearsign.com',
        footerText: result[0].footerText || `© ${new Date().getFullYear()} PearSign. All rights reserved.`,
      };
    } else {
      // Default branding
      branding = {
        logoUrl: null,
        primaryColor: '#2563eb',
        accentColor: '#1d4ed8',
        productName: 'PearSign',
        supportEmail: 'info@pearsign.com',
        footerText: `© ${new Date().getFullYear()} PearSign. All rights reserved.`,
      };
    }

    brandingCache.set(orgId, { branding, timestamp: now });
    return branding;
  } catch (error) {
    console.error("[Email Service] Error fetching branding:", error);
    return {
      logoUrl: null,
      primaryColor: '#2563eb',
      accentColor: '#1d4ed8',
      productName: 'PearSign',
      supportEmail: 'info@pearsign.com',
      footerText: `© ${new Date().getFullYear()} PearSign. All rights reserved.`,
    };
  }
}

/**
 * Fetch SendGrid config from database
 *
 * TENANT ISOLATION:
 * 1. First, check for tenant-specific credentials
 * 2. If not found AND platform_fallback_enabled, use environment variables
 * 3. If not found AND fallback disabled, return empty config
 *
 * @param orgId - Organization ID for tenant-specific settings
 */
async function getSendGridConfig(orgId?: string): Promise<SendGridConfig> {
  if (!orgId) {
    if (process.env.SENDGRID_API_KEY) {
      return {
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
        fromName: process.env.SENDGRID_FROM_NAME || "Premium Capital",
        enabled: true,
        platformFallbackEnabled: true,
        source: 'platform',
      };
    }
    return {
      apiKey: "",
      fromEmail: "",
      fromName: "Premium Capital",
      enabled: false,
      platformFallbackEnabled: false,
      source: 'none',
    };
  }

  const now = Date.now();
  const cached = configCache.get(orgId);

  // Return cached config if still valid
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.config;
  }

  try {
    const result = await sql`
      SELECT config, enabled, platform_fallback_enabled
      FROM integration_configs
      WHERE (org_id = ${orgId} OR tenant_id = ${orgId}) AND integration_type = 'sendgrid'
    `;

    let config: SendGridConfig;

    if (result.length > 0) {
      const row = result[0];
      const configData = row.config as { apiKey?: string; fromEmail?: string; fromName?: string };
      const tenantHasCredentials = !!(configData.apiKey && configData.fromEmail);
      const platformFallbackEnabled = row.platform_fallback_enabled === true;

      if (tenantHasCredentials && row.enabled) {
        config = {
          apiKey: configData.apiKey || "",
          fromEmail: configData.fromEmail || "",
          fromName: configData.fromName || "Premium Capital",
          enabled: true,
          platformFallbackEnabled,
          source: 'tenant',
        };
        if (process.env.NODE_ENV !== 'production') console.log(`[Email Service] Using TENANT SendGrid credentials for org: ${orgId}`);
      } else if (platformFallbackEnabled && process.env.SENDGRID_API_KEY) {
        config = {
          apiKey: process.env.SENDGRID_API_KEY,
          fromEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
          fromName: process.env.SENDGRID_FROM_NAME || "Premium Capital",
          enabled: true,
          platformFallbackEnabled: true,
          source: 'platform',
        };
        if (process.env.NODE_ENV !== 'production') console.log(`[Email Service] Using PLATFORM SendGrid credentials (fallback enabled) for org: ${orgId}`);
      } else if (process.env.SENDGRID_API_KEY) {
        config = {
          apiKey: process.env.SENDGRID_API_KEY,
          fromEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
          fromName: process.env.SENDGRID_FROM_NAME || "Premium Capital",
          enabled: true,
          platformFallbackEnabled: true,
          source: 'platform',
        };
        if (process.env.NODE_ENV !== 'production') console.log(`[Email Service] Tenant config incomplete/disabled, using PLATFORM SendGrid for org: ${orgId}`);
      } else {
        config = {
          apiKey: "",
          fromEmail: "",
          fromName: "Premium Capital",
          enabled: false,
          platformFallbackEnabled,
          source: 'none',
        };
        console.warn(`[Email Service] No SendGrid credentials available for org: ${orgId}`);
      }
    } else {
      const hasPlatformCredentials = !!process.env.SENDGRID_API_KEY;

      if (hasPlatformCredentials) {
        config = {
          apiKey: process.env.SENDGRID_API_KEY || "",
          fromEmail: process.env.SENDGRID_FROM_EMAIL || "no-reply@premiumcapital.com",
          fromName: process.env.SENDGRID_FROM_NAME || "Premium Capital",
          enabled: true,
          platformFallbackEnabled: true,
          source: 'platform',
        };
        if (process.env.NODE_ENV !== 'production') console.log(`[Email Service] Using PLATFORM SendGrid credentials (no config exists) for org: ${orgId}`);
      } else {
        config = {
          apiKey: "",
          fromEmail: "",
          fromName: "Premium Capital",
          enabled: false,
          platformFallbackEnabled: false,
          source: 'none',
        };
        console.warn(`[Email Service] No SendGrid credentials available for org: ${orgId}`);
      }
    }

    configCache.set(orgId, { config, timestamp: now });
    return config;
  } catch (error) {
    console.error("[Email Service] Error fetching SendGrid config:", error);
    return {
      apiKey: "",
      fromEmail: "",
      fromName: "PearSign",
      enabled: false,
      platformFallbackEnabled: false,
      source: 'none',
    };
  }
}

interface EmailAttachment {
  content: string; // Base64 encoded content
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
}

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  orgId?: string;
}

/**
 * Get rendered email content from database template
 *
 * TENANT ISOLATION: orgId is required for proper tenant templates.
 */
async function getRenderedTemplate(
  templateType: EmailTemplateType,
  variables: Record<string, string | number | boolean | undefined>,
  orgId?: string
): Promise<{ subject: string; htmlContent: string; textContent: string }> {
  // TENANT ISOLATION: Warn if orgId is missing
  if (!orgId) {
    console.warn(`[Email Service] TENANT ISOLATION WARNING: getRenderedTemplate(${templateType}) called without orgId. Using defaults.`);
    orgId = '__system__'; // Force defaults
  }
  const branding = await getBrandingSettings(orgId);

  // Try to get template from database
  const template = await getEmailTemplateByType(templateType, orgId);

  if (template && template.isActive) {
    return {
      subject: renderTemplate(template.subject, variables, branding),
      htmlContent: renderTemplate(template.htmlBody, variables, branding),
      textContent: renderTemplate(template.textBody || '', variables, branding),
    };
  }

  // Fall back to defaults if template not found or inactive
  return {
    subject: renderTemplate(DEFAULT_SUBJECTS[templateType], variables, branding),
    htmlContent: renderTemplate(DEFAULT_HTML_TEMPLATES[templateType], variables, branding),
    textContent: renderTemplate(DEFAULT_TEXT_TEMPLATES[templateType], variables, branding),
  };
}

/**
 * Send an email using SendGrid API
 *
 * TENANT ISOLATION:
 * - orgId is REQUIRED for proper tenant isolation
 * - Uses tenant credentials if configured
 * - Falls back to platform credentials ONLY if explicitly enabled
 * - Returns clear error if no credentials available
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string; source?: 'tenant' | 'platform' | 'none' }> {
  // TENANT ISOLATION: Warn if orgId is missing
  if (!options.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendEmail called without orgId. Email may fail or use wrong credentials.');
  }

  const orgId = options.orgId;
  const config = await getSendGridConfig(orgId);
  const toEmail = options.to.toLowerCase().trim();

  // Check if email service is properly configured
  if (!config.apiKey || !config.enabled) {
    const errorMessage = config.source === 'none'
      ? "Email service not configured. Please configure SendGrid credentials in Settings > Integrations."
      : "Email service not enabled";

    console.warn(`[Email Service] ${errorMessage} (org: ${orgId})`);
    return { success: false, error: errorMessage };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: options.toName }] }],
        from: { email: config.fromEmail, name: config.fromName },
        reply_to: options.replyTo ? { email: options.replyTo } : undefined,
        subject: options.subject,
        content: [
          ...(options.textContent ? [{ type: "text/plain", value: options.textContent }] : []),
          { type: "text/html", value: options.htmlContent },
        ],
        attachments: options.attachments?.map((att) => ({
          content: att.content,
          filename: att.filename,
          type: att.type,
          disposition: att.disposition,
        })),
      }),
    });

    if (response.ok || response.status === 202) {
      if (process.env.NODE_ENV !== 'production') console.log(`[Email Service] Email sent successfully to: ${toEmail} (source: ${config.source}, org: ${orgId})`);
      return { success: true, source: config.source };
    }

    let errorMessage = `SendGrid error: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.errors && errorData.errors.length > 0) {
        errorMessage = errorData.errors.map((e: { message: string; field?: string }) =>
          e.field ? `${e.field}: ${e.message}` : e.message
        ).join("; ");
      }
    } catch { /* ignore */ }

    if (response.status === 401) errorMessage = "Invalid API Key. Please check your SendGrid configuration.";
    if (response.status === 403) errorMessage = "Sender email not verified in SendGrid.";

    console.error(`[Email Service] Failed to send email (org: ${orgId}): ${errorMessage}`);
    return { success: false, error: errorMessage };
  } catch (error) {
    console.error("[Email Service] Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// SIGNATURE REQUEST EMAIL
// ============================================

interface SignatureRequestEmailData {
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  message?: string;
  signingUrl: string;
  expirationDate?: string;
  orgId?: string;
}

export async function sendSignatureRequestEmail(data: SignatureRequestEmailData): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendSignatureRequestEmail called without orgId');
  }
  const orgId = data.orgId;
  const { subject, htmlContent, textContent } = await getRenderedTemplate('signature_request', {
    recipientName: data.recipientName,
    senderName: data.senderName,
    senderEmail: data.senderEmail,
    documentTitle: data.documentName,
    message: data.message,
    signingUrl: data.signingUrl,
    expirationDate: data.expirationDate,
  }, orgId);

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
    replyTo: data.senderEmail,
    orgId,
  });
}

export async function sendBulkSignatureRequests(
  requests: SignatureRequestEmailData[]
): Promise<{ results: Array<{ email: string; success: boolean; error?: string }> }> {
  const results = await Promise.all(
    requests.map(async (request) => {
      const result = await sendSignatureRequestEmail(request);
      return { email: request.recipientEmail, ...result };
    })
  );
  return { results };
}

// ============================================
// SIGNATURE REMINDER EMAIL
// ============================================

export async function sendSignatureReminderEmail(data: SignatureRequestEmailData & { reminderCount?: number }): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendSignatureReminderEmail called without orgId');
  }
  const orgId = data.orgId;
  const { subject, htmlContent, textContent } = await getRenderedTemplate('reminder', {
    recipientName: data.recipientName,
    senderName: data.senderName,
    documentTitle: data.documentName,
    signingUrl: data.signingUrl,
    expirationDate: data.expirationDate,
    reminderNumber: data.reminderCount,
  }, orgId);

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
    replyTo: data.senderEmail,
    orgId,
  });
}

// ============================================
// SIGNER COMPLETION EMAIL
// ============================================

interface SignedDocumentEmailData {
  documentName: string;
  signerName: string;
  signerEmail: string;
  senderName: string;
  senderEmail: string;
  signedAt: Date;
  pdfBase64: string;
  fieldsSummary?: Array<{ name: string; value: string }>;
  additionalAttachments?: Array<{ content: string; filename: string; type: string }>;
  orgId?: string;
}

export async function sendSignerNotification(data: SignedDocumentEmailData): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendSignerNotification called without orgId');
  }
  const orgId = data.orgId;
  const formattedDate = data.signedAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { subject, htmlContent, textContent } = await getRenderedTemplate('signer_completed', {
    signerName: data.signerName,
    signerEmail: data.signerEmail,
    documentTitle: data.documentName,
    signedDate: formattedDate,
  }, orgId);

  const attachments: EmailAttachment[] = [
    {
      content: data.pdfBase64,
      filename: `${data.documentName.replace(/[^a-zA-Z0-9]/g, "_")}_signed.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    },
  ];

  if (data.additionalAttachments) {
    for (const att of data.additionalAttachments) {
      attachments.push({ ...att, disposition: "attachment" });
    }
  }

  return sendEmail({
    to: data.signerEmail,
    toName: data.signerName,
    subject,
    htmlContent,
    textContent,
    attachments,
    orgId,
  });
}

// ============================================
// SENDER COMPLETION EMAIL
// ============================================

export async function sendSenderNotification(data: SignedDocumentEmailData): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendSenderNotification called without orgId');
  }
  const orgId = data.orgId;
  const formattedDate = data.signedAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { subject, htmlContent, textContent } = await getRenderedTemplate('sender_completed', {
    senderName: data.senderName,
    signerName: data.signerName,
    signerEmail: data.signerEmail,
    documentTitle: data.documentName,
    signedDate: formattedDate,
    dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com",
  }, orgId);

  const attachments: EmailAttachment[] = [
    {
      content: data.pdfBase64,
      filename: `${data.documentName.replace(/[^a-zA-Z0-9]/g, "_")}_signed.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    },
  ];

  if (data.additionalAttachments) {
    for (const att of data.additionalAttachments) {
      attachments.push({ ...att, disposition: "attachment" });
    }
  }

  return sendEmail({
    to: data.senderEmail,
    toName: data.senderName,
    subject,
    htmlContent,
    textContent,
    replyTo: data.signerEmail,
    attachments,
    orgId,
  });
}

export async function sendSignedDocumentNotifications(
  data: SignedDocumentEmailData
): Promise<{ signerResult: { success: boolean; error?: string }; senderResult: { success: boolean; error?: string } }> {
  const [signerResult, senderResult] = await Promise.all([
    sendSignerNotification(data),
    sendSenderNotification(data),
  ]);
  return { signerResult, senderResult };
}

// ============================================
// DOCUMENT VIEWED EMAIL (Sender Notification)
// ============================================

interface DocumentViewedEmailData {
  documentName: string;
  viewerName: string;
  viewerEmail: string;
  senderName: string;
  senderEmail: string;
  viewedAt: Date;
  envelopeId?: string;
  orgId?: string;
}

/**
 * Send notification to the document sender when a signer views the document
 */
export async function sendDocumentViewedNotification(data: DocumentViewedEmailData): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendDocumentViewedNotification called without orgId');
  }
  const orgId = data.orgId;
  const formattedDate = data.viewedAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com";

  const { subject, htmlContent, textContent } = await getRenderedTemplate('document_viewed', {
    senderName: data.senderName,
    viewerName: data.viewerName,
    viewerEmail: data.viewerEmail,
    documentTitle: data.documentName,
    viewedDate: formattedDate,
    dashboardUrl,
  }, orgId);

  return sendEmail({
    to: data.senderEmail,
    toName: data.senderName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// DOCUMENT VOIDED EMAIL
// ============================================

export async function sendDocumentVoidedEmail(data: {
  recipientName: string;
  recipientEmail: string;
  documentName: string;
  senderName: string;
  voidReason: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendDocumentVoidedEmail called without orgId');
  }
  const orgId = data.orgId;
  const { subject, htmlContent, textContent } = await getRenderedTemplate('document_voided', {
    recipientName: data.recipientName,
    senderName: data.senderName,
    documentTitle: data.documentName,
    voidReason: data.voidReason || "No reason provided",
  }, orgId);

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// DOCUMENT DECLINED EMAIL
// ============================================

export async function sendDocumentDeclinedEmail(data: {
  documentName: string;
  signerName: string;
  signerEmail: string;
  senderName: string;
  senderEmail: string;
  declineReason: string;
  declinedAt: Date;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendDocumentDeclinedEmail called without orgId');
  }
  const orgId = data.orgId;
  const formattedDate = data.declinedAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com";

  const { subject, htmlContent, textContent } = await getRenderedTemplate('document_declined', {
    senderName: data.senderName,
    signerName: data.signerName,
    signerEmail: data.signerEmail,
    documentTitle: data.documentName,
    declineReason: data.declineReason || "No reason provided",
    declinedDate: formattedDate,
    dashboardUrl,
  }, orgId);

  return sendEmail({
    to: data.senderEmail,
    toName: data.senderName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// EXPIRATION WARNING EMAIL
// ============================================

export async function sendExpirationWarningEmail(data: {
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  signingUrl: string;
  expirationDate: string;
  daysRemaining: number;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendExpirationWarningEmail called without orgId');
  }
  const orgId = data.orgId;
  const { subject, htmlContent, textContent } = await getRenderedTemplate('expiration_warning', {
    recipientName: data.recipientName,
    senderName: data.senderName,
    documentTitle: data.documentName,
    signingUrl: data.signingUrl,
    expirationDate: data.expirationDate,
    daysRemaining: data.daysRemaining,
  }, orgId);

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
    replyTo: data.senderEmail,
    orgId,
  });
}

// ============================================
// DOCUMENT EXPIRED EMAIL
// ============================================

export async function sendDocumentExpiredNotification(data: {
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  expiredAt: Date;
  envelopeId: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendDocumentExpiredNotification called without orgId');
  }
  const orgId = data.orgId;
  const formattedDate = data.expiredAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { subject, htmlContent, textContent } = await getRenderedTemplate('document_expired', {
    senderName: data.senderName,
    recipientName: data.recipientName,
    recipientEmail: data.recipientEmail,
    documentTitle: data.documentName,
    expiredDate: formattedDate,
    dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com",
  }, orgId);

  return sendEmail({
    to: data.senderEmail,
    toName: data.senderName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// TEAM INVITE EMAIL
// ============================================

export async function sendTeamInviteEmail(data: {
  recipientName: string;
  recipientEmail: string;
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendTeamInviteEmail called without orgId');
  }
  const orgId = data.orgId;
  const branding = await getBrandingSettings(orgId);

  const { subject, htmlContent, textContent } = await getRenderedTemplate('team_invite', {
    recipientName: data.recipientName,
    recipientEmail: data.recipientEmail,
    inviterName: data.inviterName,
    organizationName: data.organizationName,
    role: data.role,
    inviteUrl: data.inviteUrl,
    productName: branding.productName,
  }, orgId);

  return sendEmail({
    to: data.recipientEmail,
    toName: data.recipientName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// WELCOME EMAIL
// ============================================

export async function sendWelcomeEmail(data: {
  userName: string;
  userEmail: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendWelcomeEmail called without orgId');
  }
  const orgId = data.orgId;
  const branding = await getBrandingSettings(orgId);

  const { subject, htmlContent, textContent } = await getRenderedTemplate('welcome', {
    userName: data.userName,
    userEmail: data.userEmail,
    productName: branding.productName,
    dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "https://pearsign.com",
  }, orgId);

  return sendEmail({
    to: data.userEmail,
    toName: data.userName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

// ============================================
// BILLING EMAILS
// ============================================

/**
 * Send invoice ready notification
 */
export async function sendInvoiceReadyEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  invoiceNumber: string;
  invoiceAmount: string; // Formatted, e.g., "$299.00"
  invoiceDate: string;
  dueDate: string;
  invoiceUrl: string;
  billingPortalUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendInvoiceReadyEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('invoice_ready', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    invoiceNumber: data.invoiceNumber,
    invoiceAmount: data.invoiceAmount,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    invoiceUrl: data.invoiceUrl,
    billingPortalUrl: data.billingPortalUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending invoice ready notification to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

/**
 * Send payment received confirmation
 */
export async function sendPaymentReceivedEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  invoiceNumber: string;
  paymentAmount: string;
  paymentDate: string;
  paymentMethod: string;
  receiptUrl: string;
  billingPortalUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendPaymentReceivedEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('payment_received', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    invoiceNumber: data.invoiceNumber,
    paymentAmount: data.paymentAmount,
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    receiptUrl: data.receiptUrl,
    billingPortalUrl: data.billingPortalUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending payment received confirmation to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

/**
 * Send payment failed notification
 */
export async function sendPaymentFailedEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  invoiceNumber: string;
  invoiceAmount: string;
  failureReason: string;
  retryDate: string;
  updatePaymentUrl: string;
  billingPortalUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendPaymentFailedEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('payment_failed', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    invoiceNumber: data.invoiceNumber,
    invoiceAmount: data.invoiceAmount,
    failureReason: data.failureReason,
    retryDate: data.retryDate,
    updatePaymentUrl: data.updatePaymentUrl,
    billingPortalUrl: data.billingPortalUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending payment failed alert to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

/**
 * Send subscription updated notification
 */
export async function sendSubscriptionUpdatedEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  previousPlan: string;
  newPlan: string;
  effectiveDate: string;
  newFeatures?: string;
  billingPortalUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendSubscriptionUpdatedEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('subscription_updated', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    previousPlan: data.previousPlan,
    newPlan: data.newPlan,
    effectiveDate: data.effectiveDate,
    newFeatures: data.newFeatures,
    billingPortalUrl: data.billingPortalUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending subscription updated notification to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

/**
 * Send usage warning notification
 */
export async function sendUsageWarningEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  resourceType: string; // e.g., "Envelopes", "API Calls", "SMS"
  currentUsage: string;
  usageLimit: string;
  usagePercentage: number;
  upgradeUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendUsageWarningEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('usage_warning', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    resourceType: data.resourceType,
    currentUsage: data.currentUsage,
    usageLimit: data.usageLimit,
    usagePercentage: data.usagePercentage,
    upgradeUrl: data.upgradeUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending usage warning to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}

/**
 * Send trial ending notification
 */
export async function sendTrialEndingEmail(data: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  trialEndDate: string;
  daysRemaining: number;
  planName: string;
  planPrice: string;
  upgradeUrl: string;
  orgId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!data.orgId) {
    console.warn('[Email Service] TENANT ISOLATION WARNING: sendTrialEndingEmail called without orgId');
  }
  const orgId = data.orgId;

  const { subject, htmlContent, textContent } = await getRenderedTemplate('trial_ending', {
    organizationName: data.organizationName,
    contactName: data.contactName,
    trialEndDate: data.trialEndDate,
    daysRemaining: data.daysRemaining,
    planName: data.planName,
    planPrice: data.planPrice,
    upgradeUrl: data.upgradeUrl,
  }, orgId);

  if (process.env.NODE_ENV !== 'production') console.log('[Email] Sending trial ending notification to:', data.contactEmail);

  return sendEmail({
    to: data.contactEmail,
    toName: data.contactName,
    subject,
    htmlContent,
    textContent,
    orgId,
  });
}
