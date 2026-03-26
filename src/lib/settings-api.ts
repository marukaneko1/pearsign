/**
 * PearSign Settings API Client
 *
 * Connects to real database via API routes
 */

const API_BASE = '/api/settings';

// Helper function to decode base64 strings (browser-compatible)
function decodeBase64(str: string): string {
  try {
    // Use atob for browser environment
    if (typeof window !== 'undefined' && typeof atob === 'function') {
      const decoded = atob(str);
      // Handle UTF-8 encoding properly
      return decodeURIComponent(
        decoded
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    }
    // Fallback for Node.js environment
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch (e) {
    console.error('[API] Failed to decode base64:', e);
    return str; // Return original string if decode fails
  }
}

// ============================================
// TYPES (re-exported from settings-store for compatibility)
// ============================================

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'invited' | 'deactivated';

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  invitedAt?: string;
  lastActiveAt?: string;
  teams: string[];
  avatarUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'documents' | 'templates' | 'team' | 'settings' | 'billing';
}

// Email template types matching the centralized template system
export type EmailTemplateType =
  | 'signature_request'
  | 'reminder'
  | 'signer_completed'
  | 'sender_completed'
  | 'document_viewed'
  | 'document_voided'
  | 'document_declined'
  | 'expiration_warning'
  | 'document_expired'
  | 'team_invite'
  | 'welcome'
  | 'invoice_ready'
  | 'payment_received'
  | 'payment_failed'
  | 'subscription_updated'
  | 'usage_warning'
  | 'trial_ending';

export interface EmailTemplate {
  id: string;
  type: EmailTemplateType;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[];
  category: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Legacy field for backward compatibility
  body?: string;
}

export interface BrandingSettings {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  productName: string;
  supportEmail: string;
  footerText: string;
  faviconUrl: string | null;
  customCss: string | null;
}

export interface TimeSettings {
  timezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  locale: string;
}

export interface ComplianceSettings {
  retentionPolicy: 'forever' | '1_year' | '3_years' | '5_years' | '7_years' | 'custom';
  retentionDays?: number;
  autoDeleteEnabled: boolean;
  requireTwoFactor: boolean;
  ipRestrictions: string[];
  auditLogRetention: 'forever' | '1_year' | '3_years' | '5_years' | '7_years';
  dataResidency: 'us' | 'eu' | 'ap';
  auditTrailEnabled?: boolean;
  auditTrailMode?: 'attached' | 'separate' | 'both';
}

// ============================================
// API HELPER
// ============================================

async function apiRequest<T>(endpoint: string, options?: RequestInit, retries = 2): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...options?.headers,
        },
        cache: 'no-store',
        ...options,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
      }

      // Get response as text first, then parse to catch JSON errors with context
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch (parseError) {
        console.error(`[API] JSON parse error for ${endpoint} (attempt ${attempt + 1}):`, parseError);
        console.error(`[API] Response length: ${text.length}, first 200 chars:`, text.substring(0, 200));
        throw new Error(`Invalid JSON response from ${endpoint}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        console.warn(`[API] Retrying ${endpoint} (attempt ${attempt + 2}/${retries + 1})...`);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// ============================================
// SETTINGS API
// ============================================

export const settingsApi = {
  // Team Members
  async getTeamMembers(): Promise<TeamMember[]> {
    return apiRequest<TeamMember[]>('/team');
  },

  async inviteTeamMember(data: { email: string; role: UserRole; teams: string[] }): Promise<TeamMember> {
    return apiRequest<TeamMember>('/team', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
    return apiRequest<TeamMember>(`/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deactivateTeamMember(id: string): Promise<TeamMember> {
    return apiRequest<TeamMember>(`/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deactivated' }),
    });
  },

  async reactivateTeamMember(id: string): Promise<TeamMember> {
    return apiRequest<TeamMember>(`/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
  },

  async deleteTeamMember(id: string): Promise<void> {
    await apiRequest(`/team/${id}`, { method: 'DELETE' });
  },

  async resendInvite(id: string): Promise<void> {
    await apiRequest(`/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invited' }),
    });
  },

  // Teams
  async getTeams(): Promise<Team[]> {
    return apiRequest<Team[]>('/teams');
  },

  // Roles
  async getRoles(): Promise<Role[]> {
    return apiRequest<Role[]>('/roles');
  },

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    // Get list without large body fields for faster loading
    return apiRequest<EmailTemplate[]>('/email-templates');
  },

  async getEmailTemplate(id: string): Promise<EmailTemplate | null> {
    // Get single template with full body
    try {
      const response = await apiRequest<EmailTemplate & { isBase64Encoded?: boolean }>(`/email-templates/${id}`);

      // Decode base64 encoded body fields if present
      if (response.isBase64Encoded) {
        const decoded: EmailTemplate = {
          ...response,
          htmlBody: response.htmlBody ? decodeBase64(response.htmlBody) : '',
          textBody: response.textBody ? decodeBase64(response.textBody) : '',
        };
        return decoded;
      }

      return response;
    } catch {
      return null;
    }
  },

  async updateEmailTemplate(id: string, data: {
    subject?: string;
    htmlBody?: string;
    textBody?: string;
    body?: string; // Legacy support
    isActive?: boolean;
  }): Promise<EmailTemplate> {
    const response = await apiRequest<EmailTemplate & { isBase64Encoded?: boolean }>(`/email-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });

    // Decode base64 encoded body fields if present
    if (response.isBase64Encoded) {
      return {
        ...response,
        htmlBody: response.htmlBody ? decodeBase64(response.htmlBody) : '',
        textBody: response.textBody ? decodeBase64(response.textBody) : '',
      };
    }

    return response;
  },

  async resetEmailTemplate(id: string): Promise<EmailTemplate> {
    const response = await apiRequest<EmailTemplate & { isBase64Encoded?: boolean }>(`/email-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ reset: true }),
    });

    // Decode base64 encoded body fields if present
    if (response.isBase64Encoded) {
      return {
        ...response,
        htmlBody: response.htmlBody ? decodeBase64(response.htmlBody) : '',
        textBody: response.textBody ? decodeBase64(response.textBody) : '',
      };
    }

    return response;
  },

  async sendTestEmail(templateId: string, toEmail: string): Promise<void> {
    const template = await this.getEmailTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const response = await fetch("/api/settings/email-templates/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail,
        templateId: template.id,
        templateType: template.type,
        templateName: template.name,
        subject: template.subject,
        htmlBody: template.htmlBody || template.body,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to send test email");
    }
  },

  // Branding
  async getBranding(): Promise<BrandingSettings> {
    return apiRequest<BrandingSettings>('/branding');
  },

  async updateBranding(data: Partial<BrandingSettings>): Promise<BrandingSettings> {
    return apiRequest<BrandingSettings>('/branding', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch('/api/settings/branding/logo', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload logo');
    }

    const data = await response.json();
    return data.logoUrl;
  },

  async removeLogo(): Promise<void> {
    const response = await fetch('/api/settings/branding/logo', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove logo');
    }
  },

  // Time Settings
  async getTimeSettings(): Promise<TimeSettings> {
    return apiRequest<TimeSettings>('/time');
  },

  async updateTimeSettings(data: Partial<TimeSettings>): Promise<TimeSettings> {
    return apiRequest<TimeSettings>('/time', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Compliance
  async getCompliance(): Promise<ComplianceSettings> {
    return apiRequest<ComplianceSettings>('/compliance');
  },

  async updateCompliance(data: Partial<ComplianceSettings>): Promise<ComplianceSettings> {
    return apiRequest<ComplianceSettings>('/compliance', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// CONSTANTS (same as before)
// ============================================

export const ALL_PERMISSIONS: Permission[] = [
  { id: 'doc:create', name: 'Create Documents', description: 'Create and upload new documents', category: 'documents' },
  { id: 'doc:read', name: 'View Documents', description: 'View documents and their status', category: 'documents' },
  { id: 'doc:send', name: 'Send Documents', description: 'Send documents for signature', category: 'documents' },
  { id: 'doc:delete', name: 'Delete Documents', description: 'Delete documents permanently', category: 'documents' },
  { id: 'doc:void', name: 'Void Documents', description: 'Void in-progress envelopes', category: 'documents' },
  { id: 'tmpl:create', name: 'Create Templates', description: 'Create new templates', category: 'templates' },
  { id: 'tmpl:read', name: 'View Templates', description: 'View templates', category: 'templates' },
  { id: 'tmpl:edit', name: 'Edit Templates', description: 'Modify existing templates', category: 'templates' },
  { id: 'tmpl:delete', name: 'Delete Templates', description: 'Delete templates', category: 'templates' },
  { id: 'team:read', name: 'View Team', description: 'View team members', category: 'team' },
  { id: 'team:invite', name: 'Invite Members', description: 'Invite new team members', category: 'team' },
  { id: 'team:edit', name: 'Edit Members', description: 'Edit team member roles', category: 'team' },
  { id: 'team:remove', name: 'Remove Members', description: 'Remove team members', category: 'team' },
  { id: 'settings:read', name: 'View Settings', description: 'View organization settings', category: 'settings' },
  { id: 'settings:edit', name: 'Edit Settings', description: 'Modify organization settings', category: 'settings' },
  { id: 'settings:branding', name: 'Manage Branding', description: 'Update branding and white-label', category: 'settings' },
  { id: 'settings:compliance', name: 'Manage Compliance', description: 'Configure compliance settings', category: 'settings' },
  { id: 'billing:read', name: 'View Billing', description: 'View billing information', category: 'billing' },
  { id: 'billing:manage', name: 'Manage Billing', description: 'Update payment and subscription', category: 'billing' },
];

export const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
  { value: 'America/Anchorage', label: '(GMT-09:00) Alaska' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time' },
  { value: 'America/Denver', label: '(GMT-07:00) Mountain Time' },
  { value: 'America/Chicago', label: '(GMT-06:00) Central Time' },
  { value: 'America/New_York', label: '(GMT-05:00) Eastern Time' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) Brasilia' },
  { value: 'Europe/London', label: '(GMT+00:00) London' },
  { value: 'Europe/Paris', label: '(GMT+01:00) Paris, Berlin' },
  { value: 'Europe/Helsinki', label: '(GMT+02:00) Helsinki, Kyiv' },
  { value: 'Europe/Moscow', label: '(GMT+03:00) Moscow' },
  { value: 'Asia/Dubai', label: '(GMT+04:00) Dubai' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) India' },
  { value: 'Asia/Bangkok', label: '(GMT+07:00) Bangkok' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) Singapore' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo' },
  { value: 'Australia/Sydney', label: '(GMT+11:00) Sydney' },
  { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland' },
];

export const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

// Email template category metadata
export const EMAIL_TEMPLATE_CATEGORIES = {
  Signing: {
    description: 'Emails related to the signing process',
    color: 'blue',
  },
  Completion: {
    description: 'Emails sent when documents are completed',
    color: 'green',
  },
  Status: {
    description: 'Status update notifications',
    color: 'amber',
  },
  Account: {
    description: 'Account and team management emails',
    color: 'purple',
  },
  Billing: {
    description: 'Invoices, payments, and subscription notifications',
    color: 'indigo',
  },
};
