/**
 * Centralized Email Template Service
 *
 * Manages all system email templates from the database.
 * Templates support branding tokens that are dynamically injected.
 */

import { sql } from './db';

// ============================================
// EMAIL TEMPLATE TYPES
// ============================================

export type EmailTemplateType =
  | 'signature_request'      // Request someone to sign
  | 'reminder'               // Reminder to sign
  | 'signer_completed'       // Sent to signer after completion
  | 'sender_completed'       // Sent to sender when document is completed
  | 'document_viewed'        // Sent to sender when document is viewed
  | 'document_voided'        // Document was voided/cancelled
  | 'document_declined'      // Signer declined to sign
  | 'expiration_warning'     // Document about to expire
  | 'document_expired'       // Document has expired
  | 'team_invite'            // Invite to join team
  | 'welcome'                // Welcome email
  // Billing emails
  | 'invoice_ready'          // Invoice is ready for payment
  | 'payment_received'       // Payment was successful
  | 'payment_failed'         // Payment failed
  | 'subscription_updated'   // Subscription plan changed
  | 'usage_warning'          // Approaching usage limits
  | 'trial_ending';          // Trial period ending soon

export interface EmailTemplate {
  id: string;
  type: EmailTemplateType;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrandingTokens {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  productName: string;
  supportEmail: string;
  footerText: string;
}

// ============================================
// TEMPLATE VARIABLE DEFINITIONS
// ============================================

export const TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  signature_request: [
    'recipientName',
    'senderName',
    'senderEmail',
    'documentTitle',
    'message',
    'signingUrl',
    'expirationDate',
  ],
  reminder: [
    'recipientName',
    'senderName',
    'documentTitle',
    'signingUrl',
    'expirationDate',
    'reminderNumber',
  ],
  signer_completed: [
    'signerName',
    'signerEmail',
    'documentTitle',
    'signedDate',
    'downloadUrl',
  ],
  sender_completed: [
    'senderName',
    'signerName',
    'signerEmail',
    'documentTitle',
    'signedDate',
    'downloadUrl',
    'dashboardUrl',
  ],
  document_viewed: [
    'senderName',
    'viewerName',
    'viewerEmail',
    'documentTitle',
    'viewedDate',
    'dashboardUrl',
  ],
  document_voided: [
    'recipientName',
    'senderName',
    'documentTitle',
    'voidReason',
  ],
  document_declined: [
    'senderName',
    'signerName',
    'signerEmail',
    'documentTitle',
    'declineReason',
    'declinedDate',
    'dashboardUrl',
  ],
  expiration_warning: [
    'recipientName',
    'senderName',
    'documentTitle',
    'signingUrl',
    'expirationDate',
    'daysRemaining',
  ],
  document_expired: [
    'senderName',
    'recipientName',
    'recipientEmail',
    'documentTitle',
    'expiredDate',
    'dashboardUrl',
  ],
  team_invite: [
    'recipientName',
    'recipientEmail',
    'inviterName',
    'organizationName',
    'role',
    'inviteUrl',
  ],
  welcome: [
    'userName',
    'userEmail',
    'productName',
    'dashboardUrl',
  ],
  // Billing email variables
  invoice_ready: [
    'organizationName',
    'contactName',
    'invoiceNumber',
    'invoiceAmount',
    'invoiceDate',
    'dueDate',
    'lineItems',
    'invoiceUrl',
    'billingPortalUrl',
  ],
  payment_received: [
    'organizationName',
    'contactName',
    'invoiceNumber',
    'paymentAmount',
    'paymentDate',
    'paymentMethod',
    'receiptUrl',
    'billingPortalUrl',
  ],
  payment_failed: [
    'organizationName',
    'contactName',
    'invoiceNumber',
    'invoiceAmount',
    'failureReason',
    'retryDate',
    'updatePaymentUrl',
    'billingPortalUrl',
  ],
  subscription_updated: [
    'organizationName',
    'contactName',
    'previousPlan',
    'newPlan',
    'effectiveDate',
    'newFeatures',
    'billingPortalUrl',
  ],
  usage_warning: [
    'organizationName',
    'contactName',
    'resourceType',
    'currentUsage',
    'usageLimit',
    'usagePercentage',
    'upgradeUrl',
  ],
  trial_ending: [
    'organizationName',
    'contactName',
    'trialEndDate',
    'daysRemaining',
    'planName',
    'planPrice',
    'upgradeUrl',
  ],
};

// ============================================
// TEMPLATE METADATA
// ============================================

export const TEMPLATE_METADATA: Record<EmailTemplateType, { name: string; description: string; category: string }> = {
  signature_request: {
    name: 'Signature Request',
    description: 'Sent when requesting someone to sign a document',
    category: 'Signing',
  },
  reminder: {
    name: 'Signature Reminder',
    description: 'Reminder sent to signers who have not yet signed',
    category: 'Signing',
  },
  signer_completed: {
    name: 'Signer Completion',
    description: 'Confirmation sent to signer after they complete signing',
    category: 'Completion',
  },
  sender_completed: {
    name: 'Sender Notification',
    description: 'Notification sent to sender when a document is signed',
    category: 'Completion',
  },
  document_viewed: {
    name: 'Document Viewed',
    description: 'Notification sent to sender when a signer opens the document',
    category: 'Status',
  },
  document_voided: {
    name: 'Document Voided',
    description: 'Notification when a document is voided or cancelled',
    category: 'Status',
  },
  document_declined: {
    name: 'Document Declined',
    description: 'Notification sent to sender when a signer declines to sign',
    category: 'Status',
  },
  expiration_warning: {
    name: 'Expiration Warning',
    description: 'Warning sent before a document expires',
    category: 'Status',
  },
  document_expired: {
    name: 'Document Expired',
    description: 'Notification when a document has expired without signature',
    category: 'Status',
  },
  team_invite: {
    name: 'Team Invitation',
    description: 'Invitation to join the organization team',
    category: 'Account',
  },
  welcome: {
    name: 'Welcome Email',
    description: 'Welcome email for new users',
    category: 'Account',
  },
  // Billing email metadata
  invoice_ready: {
    name: 'Invoice Ready',
    description: 'Notification when a new invoice is ready for payment',
    category: 'Billing',
  },
  payment_received: {
    name: 'Payment Received',
    description: 'Confirmation when a payment is successfully processed',
    category: 'Billing',
  },
  payment_failed: {
    name: 'Payment Failed',
    description: 'Alert when a payment attempt fails',
    category: 'Billing',
  },
  subscription_updated: {
    name: 'Subscription Updated',
    description: 'Notification when subscription plan changes',
    category: 'Billing',
  },
  usage_warning: {
    name: 'Usage Warning',
    description: 'Alert when approaching usage limits',
    category: 'Billing',
  },
  trial_ending: {
    name: 'Trial Ending Soon',
    description: 'Reminder that trial period is about to end',
    category: 'Billing',
  },
};

// ============================================
// DEFAULT TEMPLATES
// ============================================

function wrap(accentColor: string, heading: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{productName}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              {{#if logoUrl}}
              <img src="{{logoUrl}}" alt="{{productName}}" style="max-height: 28px;" />
              {{else}}
              <span style="font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.3px;">{{productName}}</span>
              {{/if}}
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height: 4px; background-color: ${accentColor}; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                <tr><td style="padding: 28px 32px 8px;">
                  <p style="margin: 0; font-size: 18px; font-weight: 700; color: #111827; letter-spacing: -0.3px;">${heading}</p>
                </td></tr>
                ${content}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5;">{{footerText}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string, color?: string): string {
  const bg = color || '{{primaryColor}}';
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding: 8px 0 0;">
    <a href="${url}" style="display: inline-block; background-color: ${bg}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">${text}</a>
  </td></tr></table>`;
}

function detail(label: string, value: string): string {
  return `<tr><td style="padding: 6px 0;"><span style="color: #6b7280; font-size: 13px;">${label}</span></td><td style="padding: 6px 0; text-align: right;"><span style="color: #111827; font-size: 13px; font-weight: 500;">${value}</span></td></tr>`;
}

function detailTable(...rows: string[]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 4px 0;">${rows.join('')}</table>`;
}

function infoBox(text: string, bgColor: string, textColor: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
    <tr><td style="padding: 14px 16px; background-color: ${bgColor}; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: ${textColor}; line-height: 1.5;">${text}</p>
    </td></tr></table>`;
}

function note(text: string, color?: string): string {
  const c = color || '#9ca3af';
  return `<p style="margin: 16px 0 0; font-size: 12px; color: ${c}; line-height: 1.5;">${text}</p>`;
}

// Accent colors by category
const ACCENT = {
  signing: '#2563eb',
  completion: '#16a34a',
  status: '#7c3aed',
  alert: '#dc2626',
  account: '#0891b2',
  billing: '#7c3aed',
};

// Default HTML templates for each type
export const DEFAULT_HTML_TEMPLATES: Record<EmailTemplateType, string> = {

  // ── Signing ──────────────────────────────────────────────

  signature_request: wrap(ACCENT.signing, 'Signature Requested', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{recipientName}}, <strong>{{senderName}}</strong> needs your signature on a document.
      </p>

      ${detailTable(
        detail('Document', '{{documentTitle}}'),
        detail('From', '{{senderName}}'),
        `{{#if expirationDate}}${detail('Sign by', '{{expirationDate}}')}{{/if}}`
      )}

      {{#if message}}
      ${infoBox('"{{message}}"', '#f0f4ff', '#1e40af')}
      {{/if}}

      ${btn('Review & Sign', '{{signingUrl}}')}

      ${note('If the button doesn\'t work, copy this link into your browser: {{signingUrl}}')}
    </td></tr>
  `),

  reminder: wrap(ACCENT.alert, 'Reminder: Signature Needed', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{recipientName}}, <strong>{{senderName}}</strong> is still waiting for your signature on <strong>"{{documentTitle}}"</strong>.
      </p>

      {{#if expirationDate}}
      ${infoBox('This document expires on <strong>{{expirationDate}}</strong>. Please sign before then.', '#fef2f2', '#991b1b')}
      {{/if}}

      ${btn('Sign Now', '{{signingUrl}}', '#dc2626')}
    </td></tr>
  `),

  // ── Completion ───────────────────────────────────────────

  signer_completed: wrap(ACCENT.completion, 'Signing Complete', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{signerName}}, your signature on <strong>"{{documentTitle}}"</strong> has been recorded successfully.
      </p>

      ${infoBox('A signed copy is attached to this email for your records.', '#f0fdf4', '#166534')}

      ${detailTable(
        detail('Document', '{{documentTitle}}'),
        detail('Signed by', '{{signerName}}'),
        detail('Date', '{{signedDate}}')
      )}

      ${note('This electronic signature is legally binding under the ESIGN Act and UETA.')}
    </td></tr>
  `),

  sender_completed: wrap(ACCENT.completion, 'Document Signed', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{senderName}}, <strong>{{signerName}}</strong> has signed <strong>"{{documentTitle}}"</strong>.
      </p>

      ${infoBox('The completed document is attached to this email.', '#f0fdf4', '#166534')}

      ${detailTable(
        detail('Document', '{{documentTitle}}'),
        detail('Signed by', '{{signerName}} ({{signerEmail}})'),
        detail('Date', '{{signedDate}}')
      )}

      ${btn('View in Dashboard', '{{dashboardUrl}}', '#16a34a')}
    </td></tr>
  `),

  // ── Status ───────────────────────────────────────────────

  document_viewed: wrap(ACCENT.status, 'Document Opened', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{senderName}}, <strong>{{viewerName}}</strong> opened <strong>"{{documentTitle}}"</strong> and is reviewing it now.
      </p>

      ${detailTable(
        detail('Document', '{{documentTitle}}'),
        detail('Viewed by', '{{viewerName}} ({{viewerEmail}})'),
        detail('Opened', '{{viewedDate}}')
      )}

      ${note('You\'ll receive another notification when they complete signing.')}

      ${btn('View in Dashboard', '{{dashboardUrl}}', '#7c3aed')}
    </td></tr>
  `),

  document_voided: wrap(ACCENT.alert, 'Document Voided', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{recipientName}}, the signature request for <strong>"{{documentTitle}}"</strong> has been cancelled by {{senderName}}.
      </p>

      ${infoBox('<strong>Reason:</strong> {{voidReason}}', '#fef2f2', '#991b1b')}

      ${note('No action is needed on your part.')}
    </td></tr>
  `),

  document_declined: wrap(ACCENT.alert, 'Signature Declined', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{senderName}}, <strong>{{signerName}}</strong> has declined to sign <strong>"{{documentTitle}}"</strong>.
      </p>

      ${infoBox('<strong>Reason:</strong> "{{declineReason}}"', '#fef2f2', '#991b1b')}

      ${detailTable(
        detail('Declined by', '{{signerName}} ({{signerEmail}})'),
        detail('Date', '{{declinedDate}}')
      )}

      ${btn('View in Dashboard', '{{dashboardUrl}}')}
    </td></tr>
  `),

  expiration_warning: wrap('#f59e0b', 'Expiring Soon', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{recipientName}}, <strong>"{{documentTitle}}"</strong> from {{senderName}} expires on <strong>{{expirationDate}}</strong>.
      </p>

      ${infoBox('After this date the signing link will no longer work and a new document will need to be sent.', '#fffbeb', '#92400e')}

      ${btn('Sign Now', '{{signingUrl}}', '#f59e0b')}
    </td></tr>
  `),

  document_expired: wrap(ACCENT.alert, 'Document Expired', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{senderName}}, <strong>"{{documentTitle}}"</strong> expired on {{expiredDate}} without being signed.
      </p>

      ${detailTable(
        detail('Document', '{{documentTitle}}'),
        detail('Pending signer', '{{recipientName}} ({{recipientEmail}})'),
        detail('Expired', '{{expiredDate}}')
      )}

      <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">You can create a new envelope and resend to the recipient.</p>

      ${btn('Open Dashboard', '{{dashboardUrl}}')}
    </td></tr>
  `),

  // ── Account ──────────────────────────────────────────────

  team_invite: wrap(ACCENT.account, 'Team Invitation', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{recipientName}}, <strong>{{inviterName}}</strong> has invited you to join <strong>{{organizationName}}</strong> on {{productName}}.
      </p>

      ${detailTable(
        detail('Organization', '{{organizationName}}'),
        detail('Your role', '{{role}}')
      )}

      ${btn('Accept Invitation', '{{inviteUrl}}', '#0891b2')}

      ${note('This invitation expires in 7 days.')}
    </td></tr>
  `),

  welcome: wrap(ACCENT.account, 'Welcome to {{productName}}', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{userName}}, your account is ready. Upload a document, place signature fields, and send it out in minutes.
      </p>

      ${infoBox('<strong>Quick start:</strong> Head to your dashboard to create your first envelope.', '#ecfeff', '#155e75')}

      ${btn('Go to Dashboard', '{{dashboardUrl}}', '#0891b2')}
    </td></tr>
  `),

  // ── Billing ──────────────────────────────────────────────

  invoice_ready: wrap(ACCENT.billing, 'Invoice Ready', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, a new invoice is ready for <strong>{{organizationName}}</strong>.
      </p>

      ${detailTable(
        detail('Invoice', '{{invoiceNumber}}'),
        detail('Date', '{{invoiceDate}}'),
        detail('Due', '{{dueDate}}'),
        detail('Amount due', '<strong>{{invoiceAmount}}</strong>')
      )}

      ${btn('View Invoice', '{{invoiceUrl}}', '#7c3aed')}

      ${note('<a href="{{billingPortalUrl}}" style="color: #7c3aed; text-decoration: none;">Manage billing</a>')}
    </td></tr>
  `),

  payment_received: wrap('#16a34a', 'Payment Received', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, we received your payment of <strong>{{paymentAmount}}</strong> for {{organizationName}}.
      </p>

      ${infoBox('Payment processed successfully. Thank you!', '#f0fdf4', '#166534')}

      ${detailTable(
        detail('Invoice', '{{invoiceNumber}}'),
        detail('Date', '{{paymentDate}}'),
        detail('Method', '{{paymentMethod}}')
      )}

      ${btn('Download Receipt', '{{receiptUrl}}', '#16a34a')}
    </td></tr>
  `),

  payment_failed: wrap(ACCENT.alert, 'Payment Failed', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, we were unable to process your payment for <strong>{{organizationName}}</strong>.
      </p>

      ${infoBox('<strong>Error:</strong> {{failureReason}}', '#fef2f2', '#991b1b')}

      ${detailTable(
        detail('Invoice', '{{invoiceNumber}}'),
        detail('Amount', '{{invoiceAmount}}'),
        detail('Next retry', '{{retryDate}}')
      )}

      ${btn('Update Payment Method', '{{updatePaymentUrl}}', '#dc2626')}

      ${note('Please update your payment method to avoid service interruption.', '#dc2626')}
    </td></tr>
  `),

  subscription_updated: wrap(ACCENT.billing, 'Plan Updated', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, your subscription for <strong>{{organizationName}}</strong> has been updated.
      </p>

      ${detailTable(
        detail('Previous plan', '{{previousPlan}}'),
        detail('New plan', '<strong>{{newPlan}}</strong>'),
        detail('Effective', '{{effectiveDate}}')
      )}

      {{#if newFeatures}}
      ${infoBox('<strong>New features:</strong> {{newFeatures}}', '#f5f3ff', '#5b21b6')}
      {{/if}}

      ${btn('View Your Account', '{{billingPortalUrl}}', '#7c3aed')}
    </td></tr>
  `),

  usage_warning: wrap('#f59e0b', 'Usage Alert', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, <strong>{{organizationName}}</strong> has used <strong>{{usagePercentage}}%</strong> of its {{resourceType}} limit.
      </p>

      ${detailTable(
        detail('Resource', '{{resourceType}}'),
        detail('Used', '{{currentUsage}} of {{usageLimit}}'),
        detail('Usage', '{{usagePercentage}}%')
      )}

      ${infoBox('Upgrade your plan to avoid any service interruption.', '#fffbeb', '#92400e')}

      ${btn('Upgrade Now', '{{upgradeUrl}}', '#f59e0b')}
    </td></tr>
  `),

  trial_ending: wrap(ACCENT.account, 'Trial Ending Soon', `
    <tr><td style="padding: 4px 32px 28px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {{contactName}}, your free trial for <strong>{{organizationName}}</strong> ends on <strong>{{trialEndDate}}</strong> ({{daysRemaining}} days away).
      </p>

      ${detailTable(
        detail('Plan', '{{planName}}'),
        detail('Price', '{{planPrice}}/month'),
        detail('Trial ends', '{{trialEndDate}}')
      )}

      ${infoBox('After the trial your account will move to the Free plan.', '#ecfeff', '#155e75')}

      ${btn('Upgrade Now', '{{upgradeUrl}}', '#0891b2')}
    </td></tr>
  `),
};

// Default text templates
export const DEFAULT_TEXT_TEMPLATES: Record<EmailTemplateType, string> = {
  signature_request: `
Signature Requested

Hello {{recipientName}},

{{senderName}} has requested your signature on "{{documentTitle}}".

{{#if message}}
Message: "{{message}}"
{{/if}}

{{#if expirationDate}}
Please sign by: {{expirationDate}}
{{/if}}

Click here to review and sign:
{{signingUrl}}

---
{{footerText}}
  `,

  reminder: `
Signature Reminder

Hello {{recipientName}},

This is a friendly reminder that {{senderName}} is waiting for your signature on "{{documentTitle}}".

{{#if expirationDate}}
Expires: {{expirationDate}}
{{/if}}

Sign now: {{signingUrl}}

---
{{footerText}}
  `,

  signer_completed: `
Document Signed Successfully

Hello {{signerName}},

Thank you for signing "{{documentTitle}}". Your electronic signature has been securely recorded and the document is now complete.

Document: {{documentTitle}}
Signed By: {{signerName}} ({{signerEmail}})
Signed On: {{signedDate}}

Your signed document is attached to this email as a PDF.

This signature is compliant with ESIGN Act and UETA regulations.

---
{{footerText}}
  `,

  sender_completed: `
Document Completed

Hello {{senderName}},

{{signerName}} has signed "{{documentTitle}}". The completed document is attached to this email.

Document: {{documentTitle}}
Signed By: {{signerName}} ({{signerEmail}})
Signed On: {{signedDate}}

---
{{footerText}}
  `,

  document_viewed: `
Document Viewed

Hello {{senderName}},

{{viewerName}} has opened and is viewing "{{documentTitle}}".

Document: {{documentTitle}}
Viewed By: {{viewerName}} ({{viewerEmail}})
Viewed On: {{viewedDate}}

The signer is reviewing the document. You'll receive another email when they complete signing.

View in dashboard: {{dashboardUrl}}

---
{{footerText}}
  `,

  document_voided: `
Document Voided

Hello {{recipientName}},

The signature request for "{{documentTitle}}" has been voided by {{senderName}}.

Reason: {{voidReason}}

No further action is required on your part.

---
{{footerText}}
  `,

  document_declined: `
Document Declined

Hello {{senderName}},

Unfortunately, {{signerName}} has declined to sign "{{documentTitle}}".

Document: {{documentTitle}}
Declined By: {{signerName}} ({{signerEmail}})
Reason: "{{declineReason}}"
Declined On: {{declinedDate}}

You may want to reach out to the signer to understand their concerns, or send a new document if needed.

View in dashboard: {{dashboardUrl}}

---
{{footerText}}
  `,

  expiration_warning: `
Expiration Notice

Hello {{recipientName}},

This is an important reminder that {{senderName}}'s document "{{documentTitle}}" requires your signature before it expires.

Expires: {{expirationDate}}
Days Remaining: {{daysRemaining}}

Sign now: {{signingUrl}}

---
{{footerText}}
  `,

  document_expired: `
Document Expired

Hello {{senderName}},

The following document has expired without being signed:

Document: {{documentTitle}}
Pending Signer: {{recipientName}} ({{recipientEmail}})
Expired On: {{expiredDate}}

To continue, create a new envelope and resend to the recipient.

---
{{footerText}}
  `,

  team_invite: `
Team Invitation

Hello {{recipientName}},

{{inviterName}} has invited you to join {{organizationName}} on {{productName}}.

Your Role: {{role}}

Accept your invitation: {{inviteUrl}}

This invitation will expire in 7 days.

---
{{footerText}}
  `,

  welcome: `
Welcome to {{productName}}

Hello {{userName}},

Welcome to {{productName}}! Your account has been created and you're ready to start sending documents for signature.

Get started: {{dashboardUrl}}

---
{{footerText}}
  `,

  // Billing text templates
  invoice_ready: `
Invoice Ready

Hello {{contactName}},

A new invoice is ready for {{organizationName}}.

Invoice Number: {{invoiceNumber}}
Invoice Date: {{invoiceDate}}
Due Date: {{dueDate}}
Amount Due: {{invoiceAmount}}

View your invoice: {{invoiceUrl}}

Manage billing: {{billingPortalUrl}}

---
{{footerText}}
  `,

  payment_received: `
Payment Received

Hello {{contactName}},

We've received your payment for {{organizationName}}. Thank you!

Amount: {{paymentAmount}}
Invoice: {{invoiceNumber}}
Date: {{paymentDate}}
Payment Method: {{paymentMethod}}

Download receipt: {{receiptUrl}}

---
{{footerText}}
  `,

  payment_failed: `
Payment Failed - Action Required

Hello {{contactName}},

We were unable to process your payment for {{organizationName}}.

Reason: {{failureReason}}

Invoice: {{invoiceNumber}}
Amount: {{invoiceAmount}}
Next Retry: {{retryDate}}

Please update your payment method to avoid service interruption:
{{updatePaymentUrl}}

Manage billing: {{billingPortalUrl}}

---
{{footerText}}
  `,

  subscription_updated: `
Subscription Updated

Hello {{contactName}},

Your subscription for {{organizationName}} has been updated.

Previous Plan: {{previousPlan}}
New Plan: {{newPlan}}
Effective Date: {{effectiveDate}}

{{#if newFeatures}}
New features available:
{{newFeatures}}
{{/if}}

Manage your account: {{billingPortalUrl}}

---
{{footerText}}
  `,

  usage_warning: `
Usage Alert

Hello {{contactName}},

{{organizationName}} is approaching its {{resourceType}} limit.

Current Usage: {{currentUsage}} of {{usageLimit}} ({{usagePercentage}}%)

To avoid any interruption to your service, consider upgrading your plan:
{{upgradeUrl}}

---
{{footerText}}
  `,

  trial_ending: `
Trial Ending Soon

Hello {{contactName}},

Your free trial for {{organizationName}} ends on {{trialEndDate}}.

Days remaining: {{daysRemaining}}

Continue with {{planName}} starting at {{planPrice}}/month:
{{upgradeUrl}}

After your trial ends, your account will be downgraded to the Free plan.

---
{{footerText}}
  `,
};

// Default subjects for each template type
export const DEFAULT_SUBJECTS: Record<EmailTemplateType, string> = {
  signature_request: '{{senderName}} requested your signature on "{{documentTitle}}"',
  reminder: '[Reminder] {{senderName}} is waiting for your signature',
  signer_completed: 'Document Signed: {{documentTitle}}',
  sender_completed: '{{signerName}} signed "{{documentTitle}}"',
  document_viewed: '{{viewerName}} viewed your document "{{documentTitle}}"',
  document_voided: 'Document Voided: {{documentTitle}}',
  document_declined: '{{signerName}} declined to sign "{{documentTitle}}"',
  expiration_warning: '[Expiring Soon] "{{documentTitle}}" expires in {{daysRemaining}} day(s)',
  document_expired: 'Document Expired: {{documentTitle}}',
  team_invite: '{{inviterName}} invited you to join {{organizationName}}',
  welcome: 'Welcome to {{productName}}',
  // Billing subjects
  invoice_ready: 'Invoice {{invoiceNumber}} Ready - {{invoiceAmount}} due {{dueDate}}',
  payment_received: 'Payment Received - Thank you for your payment of {{paymentAmount}}',
  payment_failed: '[Action Required] Payment Failed for {{organizationName}}',
  subscription_updated: 'Your subscription has been updated to {{newPlan}}',
  usage_warning: '[Alert] {{organizationName}} is approaching {{resourceType}} limit',
  trial_ending: 'Your trial ends in {{daysRemaining}} days',
};

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Initialize email templates table and seed defaults
 */
export async function initializeEmailTemplates(): Promise<void> {
  try {
    // Create table if it doesn't exist at all (fresh install)
    await sql`
      CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL DEFAULT 'system',
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT,
        variables TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        is_default BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(organization_id, type)
      )
    `;

    // Safely add any missing columns for existing tables (non-destructive migration)
    const missingColumns: Array<{ name: string; definition: string }> = [
      { name: 'organization_id', definition: "TEXT NOT NULL DEFAULT 'system'" },
      { name: 'type', definition: 'TEXT' },
      { name: 'name', definition: 'TEXT' },
      { name: 'description', definition: 'TEXT' },
      { name: 'subject', definition: 'TEXT' },
      { name: 'html_body', definition: 'TEXT' },
      { name: 'text_body', definition: 'TEXT' },
      { name: 'variables', definition: "TEXT[] DEFAULT '{}'" },
      { name: 'is_active', definition: 'BOOLEAN DEFAULT true' },
      { name: 'is_default', definition: 'BOOLEAN DEFAULT true' },
      { name: 'created_at', definition: 'TIMESTAMP DEFAULT NOW()' },
      { name: 'updated_at', definition: 'TIMESTAMP DEFAULT NOW()' },
    ];

    for (const col of missingColumns) {
      try {
        await sql.raw(
          `ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`
        );
      } catch (colErr) {
        console.warn(`[EmailTemplates] Could not add column ${col.name}:`, colErr);
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log('[EmailTemplates] Table schema verified (non-destructive migration)');

    const SYSTEM_ORG_ID = 'system';

    // Seed system-level defaults
    for (const [type, metadata] of Object.entries(TEMPLATE_METADATA)) {
      const templateType = type as EmailTemplateType;
      const id = `tmpl-${templateType}`;

      await sql`
        INSERT INTO email_templates (
          id, organization_id, type, name, description, subject, html_body, text_body, variables, is_active, is_default
        ) VALUES (
          ${id},
          ${SYSTEM_ORG_ID},
          ${templateType},
          ${metadata.name},
          ${metadata.description},
          ${DEFAULT_SUBJECTS[templateType]},
          ${DEFAULT_HTML_TEMPLATES[templateType]},
          ${DEFAULT_TEXT_TEMPLATES[templateType]},
          ${TEMPLATE_VARIABLES[templateType]},
          true,
          true
        )
        ON CONFLICT (organization_id, type)
        DO UPDATE SET
          html_body = ${DEFAULT_HTML_TEMPLATES[templateType]},
          text_body = ${DEFAULT_TEXT_TEMPLATES[templateType]},
          subject = ${DEFAULT_SUBJECTS[templateType]},
          updated_at = NOW()
        WHERE email_templates.is_default = true
      `;
    }

    // Also update all other tenants' default templates to latest designs
    const tenants = await sql`SELECT DISTINCT organization_id FROM email_templates WHERE organization_id != ${SYSTEM_ORG_ID}`;
    for (const tenant of tenants) {
      for (const [type] of Object.entries(TEMPLATE_METADATA)) {
        const templateType = type as EmailTemplateType;
        await sql`
          UPDATE email_templates
          SET html_body = ${DEFAULT_HTML_TEMPLATES[templateType]},
              text_body = ${DEFAULT_TEXT_TEMPLATES[templateType]},
              subject = ${DEFAULT_SUBJECTS[templateType]},
              updated_at = NOW()
          WHERE organization_id = ${tenant.organization_id}
            AND type = ${templateType}
            AND is_default = true
        `;
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log('[EmailTemplates] Templates synced with latest designs');
  } catch (error) {
    console.error('[EmailTemplates] Error initializing templates:', error);
    throw error;
  }
}

/**
 * Seed email templates for a specific tenant if they don't have any
 */
async function seedTemplatesForTenant(orgId: string): Promise<void> {
  // Check which templates exist for this tenant
  const existingTypes = await sql`
    SELECT type FROM email_templates WHERE organization_id = ${orgId}
  `;
  const existingTypeSet = new Set(existingTypes.map(t => t.type));

  // Seed any missing templates
  let seededCount = 0;
  for (const [type, metadata] of Object.entries(TEMPLATE_METADATA)) {
    // Skip if template already exists for this tenant
    if (existingTypeSet.has(type)) continue;

    const templateType = type as EmailTemplateType;
    const id = `tmpl-${orgId}-${templateType}`;

    await sql`
      INSERT INTO email_templates (
        id, organization_id, type, name, description, subject, html_body, text_body, variables, is_active, is_default
      ) VALUES (
        ${id},
        ${orgId},
        ${templateType},
        ${metadata.name},
        ${metadata.description},
        ${DEFAULT_SUBJECTS[templateType]},
        ${DEFAULT_HTML_TEMPLATES[templateType]},
        ${DEFAULT_TEXT_TEMPLATES[templateType]},
        ${TEMPLATE_VARIABLES[templateType]},
        true,
        true
      )
      ON CONFLICT (organization_id, type) DO NOTHING
    `;
    seededCount++;
  }

  if (seededCount > 0) {
    if (process.env.NODE_ENV !== 'production') console.log(`[EmailTemplates] Seeded ${seededCount} email templates for tenant:`, orgId);
  }
}

/**
 * Get all email templates for an organization
 *
 * Multi-tenancy: orgId is REQUIRED
 * Automatically seeds default templates for new tenants
 */
export async function getEmailTemplates(orgId: string): Promise<EmailTemplate[]> {
  if (!orgId) {
    throw new Error('orgId is required');
  }

  try {
    // Ensure table is initialized
    await initializeEmailTemplates();

    // Check if this tenant has any templates
    const existingCount = await sql`
      SELECT COUNT(*) as count FROM email_templates WHERE organization_id = ${orgId}
    `;

    // If tenant has no templates, seed them
    if (parseInt(existingCount[0]?.count || '0', 10) === 0) {
      if (process.env.NODE_ENV !== 'production') console.log('[EmailTemplates] No templates for tenant, seeding defaults:', orgId);
      await seedTemplatesForTenant(orgId);
    }

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
      WHERE organization_id = ${orgId}
      ORDER BY
        CASE type
          WHEN 'signature_request' THEN 1
          WHEN 'reminder' THEN 2
          WHEN 'signer_completed' THEN 3
          WHEN 'sender_completed' THEN 4
          WHEN 'document_viewed' THEN 5
          WHEN 'document_voided' THEN 6
          WHEN 'expiration_warning' THEN 7
          WHEN 'document_expired' THEN 8
          WHEN 'team_invite' THEN 9
          WHEN 'welcome' THEN 10
          ELSE 11
        END
    `;

    return templates as EmailTemplate[];
  } catch (error) {
    console.error('[EmailTemplates] Error fetching templates:', error);
    throw error;
  }
}

/**
 * Get a specific email template by type
 *
 * Multi-tenancy: orgId is REQUIRED
 */
export async function getEmailTemplateByType(
  type: EmailTemplateType,
  orgId: string
): Promise<EmailTemplate | null> {
  if (!orgId) {
    throw new Error('orgId is required');
  }

  try {
    // Ensure templates are initialized
    await initializeEmailTemplates();

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
      WHERE organization_id = ${orgId} AND type = ${type}
    `;

    return templates[0] as EmailTemplate || null;
  } catch (error) {
    console.error('[EmailTemplates] Error fetching template:', error);
    throw error;
  }
}

/**
 * Update an email template
 *
 * Multi-tenancy: orgId is REQUIRED
 */
export async function updateEmailTemplate(
  id: string,
  updates: Partial<Pick<EmailTemplate, 'subject' | 'htmlBody' | 'textBody' | 'isActive'>>,
  orgId: string
): Promise<EmailTemplate> {
  if (!orgId) {
    throw new Error('orgId is required');
  }

  try {
    const now = new Date().toISOString();

    await sql`
      UPDATE email_templates SET
        subject = COALESCE(${updates.subject || null}, subject),
        html_body = COALESCE(${updates.htmlBody || null}, html_body),
        text_body = COALESCE(${updates.textBody || null}, text_body),
        is_active = COALESCE(${updates.isActive ?? null}, is_active),
        is_default = false,
        updated_at = ${now}
      WHERE id = ${id} AND organization_id = ${orgId}
    `;

    const updated = await sql`
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
      WHERE id = ${id} AND organization_id = ${orgId}
    `;

    return updated[0] as EmailTemplate;
  } catch (error) {
    console.error('[EmailTemplates] Error updating template:', error);
    throw error;
  }
}

/**
 * Reset a template to its default
 *
 * Multi-tenancy: orgId is REQUIRED
 */
export async function resetEmailTemplate(
  id: string,
  orgId: string
): Promise<EmailTemplate> {
  if (!orgId) {
    throw new Error('orgId is required');
  }
  try {
    // Get the template type first
    const existing = await sql`
      SELECT type FROM email_templates WHERE id = ${id} AND organization_id = ${orgId}
    `;

    if (!existing[0]) {
      throw new Error('Template not found');
    }

    const type = existing[0].type as EmailTemplateType;
    const metadata = TEMPLATE_METADATA[type];
    const now = new Date().toISOString();

    await sql`
      UPDATE email_templates SET
        subject = ${DEFAULT_SUBJECTS[type]},
        html_body = ${DEFAULT_HTML_TEMPLATES[type]},
        text_body = ${DEFAULT_TEXT_TEMPLATES[type]},
        is_default = true,
        updated_at = ${now}
      WHERE id = ${id} AND organization_id = ${orgId}
    `;

    const updated = await sql`
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
      WHERE id = ${id} AND organization_id = ${orgId}
    `;

    return updated[0] as EmailTemplate;
  } catch (error) {
    console.error('[EmailTemplates] Error resetting template:', error);
    throw error;
  }
}

// ============================================
// TEMPLATE RENDERING
// ============================================

/**
 * Render an email template with variables and branding
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | boolean | undefined>,
  branding: BrandingTokens
): string {
  let result = template;

  // Inject branding tokens
  result = result.replace(/\{\{logoUrl\}\}/g, branding.logoUrl || '');
  result = result.replace(/\{\{primaryColor\}\}/g, branding.primaryColor);
  result = result.replace(/\{\{accentColor\}\}/g, branding.accentColor);
  result = result.replace(/\{\{productName\}\}/g, branding.productName);
  result = result.replace(/\{\{supportEmail\}\}/g, branding.supportEmail);
  result = result.replace(/\{\{footerText\}\}/g, branding.footerText);

  // Handle logo conditional
  if (branding.logoUrl) {
    result = result.replace(/\{\{#if logoUrl\}\}([\s\S]*?)\{\{else\}\}[\s\S]*?\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if logoUrl\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  }

  // Inject custom variables
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }

  // Handle conditionals for other variables
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
    return variables[varName] ? content : '';
  });

  return result;
}
