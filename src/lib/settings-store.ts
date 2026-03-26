/**
 * PearSign Settings Store
 *
 * Demo mode data store for settings. In production, all data flows through API.
 * This provides session-based persistence for demo purposes.
 */

// ============================================
// TYPES
// ============================================

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'invited' | 'deactivated';
export type MemberStatus = 'active' | 'invited' | 'deactivated';

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: MemberStatus;
  invitedAt?: string;
  lastActiveAt?: string;
  teams: string[];
  avatarUrl?: string;
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

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  type: 'signature_request' | 'reminder' | 'completed' | 'declined' | 'welcome' | 'invite';
  subject: string;
  body: string;
  isDefault: boolean;
  variables: string[];
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
}

export interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

// ============================================
// PERMISSIONS DEFINITIONS
// ============================================

export const ALL_PERMISSIONS: Permission[] = [
  // Documents
  { id: 'doc:create', name: 'Create Documents', description: 'Create and upload new documents', category: 'documents' },
  { id: 'doc:read', name: 'View Documents', description: 'View documents and their status', category: 'documents' },
  { id: 'doc:send', name: 'Send Documents', description: 'Send documents for signature', category: 'documents' },
  { id: 'doc:delete', name: 'Delete Documents', description: 'Delete documents permanently', category: 'documents' },
  { id: 'doc:void', name: 'Void Documents', description: 'Void in-progress envelopes', category: 'documents' },

  // Templates
  { id: 'tmpl:create', name: 'Create Templates', description: 'Create new templates', category: 'templates' },
  { id: 'tmpl:read', name: 'View Templates', description: 'View templates', category: 'templates' },
  { id: 'tmpl:edit', name: 'Edit Templates', description: 'Modify existing templates', category: 'templates' },
  { id: 'tmpl:delete', name: 'Delete Templates', description: 'Delete templates', category: 'templates' },

  // Team
  { id: 'team:read', name: 'View Team', description: 'View team members', category: 'team' },
  { id: 'team:invite', name: 'Invite Members', description: 'Invite new team members', category: 'team' },
  { id: 'team:edit', name: 'Edit Members', description: 'Edit team member roles', category: 'team' },
  { id: 'team:remove', name: 'Remove Members', description: 'Remove team members', category: 'team' },

  // Settings
  { id: 'settings:read', name: 'View Settings', description: 'View organization settings', category: 'settings' },
  { id: 'settings:edit', name: 'Edit Settings', description: 'Modify organization settings', category: 'settings' },
  { id: 'settings:branding', name: 'Manage Branding', description: 'Update branding and white-label', category: 'settings' },
  { id: 'settings:compliance', name: 'Manage Compliance', description: 'Configure compliance settings', category: 'settings' },

  // Billing
  { id: 'billing:read', name: 'View Billing', description: 'View billing information', category: 'billing' },
  { id: 'billing:manage', name: 'Manage Billing', description: 'Update payment and subscription', category: 'billing' },
];

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-owner',
    name: 'Owner',
    description: 'Full access to all features and settings',
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'Manage team and settings, full document access',
    isSystem: true,
    permissions: ALL_PERMISSIONS.filter(p => !p.id.startsWith('billing:')),
  },
  {
    id: 'role-editor',
    name: 'Editor',
    description: 'Create, edit, and send documents',
    isSystem: true,
    permissions: ALL_PERMISSIONS.filter(p =>
      p.category === 'documents' ||
      (p.category === 'templates' && p.id !== 'tmpl:delete') ||
      p.id === 'team:read'
    ),
  },
  {
    id: 'role-viewer',
    name: 'Viewer',
    description: 'View-only access to documents',
    isSystem: true,
    permissions: ALL_PERMISSIONS.filter(p => p.id.endsWith(':read')),
  },
];

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'user-1',
    email: 'john@company.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'owner',
    status: 'active',
    lastActiveAt: new Date().toISOString(),
    teams: ['Engineering', 'Leadership'],
  },
  {
    id: 'user-2',
    email: 'sarah@company.com',
    firstName: 'Sarah',
    lastName: 'Chen',
    role: 'admin',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
    teams: ['Engineering'],
  },
  {
    id: 'user-3',
    email: 'mike@company.com',
    firstName: 'Mike',
    lastName: 'Johnson',
    role: 'editor',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 86400000).toISOString(),
    teams: ['Sales'],
  },
  {
    id: 'user-4',
    email: 'emily@company.com',
    firstName: 'Emily',
    lastName: 'Brown',
    role: 'viewer',
    status: 'invited',
    invitedAt: new Date(Date.now() - 172800000).toISOString(),
    teams: ['Marketing'],
  },
];

const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'email-1',
    name: 'Signature Request',
    description: 'Sent when a new signature is requested',
    type: 'signature_request',
    subject: '{{senderName}} has sent you a document to sign',
    body: `<!-- loaded from database -->`,
    isDefault: true,
    variables: ['senderName', 'recipientName', 'documentTitle', 'message', 'signingUrl', 'expirationDate', 'primaryColor', 'logoUrl', 'productName', 'footerText', 'supportEmail'],
  },
  {
    id: 'email-2',
    name: 'Signature Reminder',
    description: 'Reminder for pending signatures',
    type: 'reminder',
    subject: 'Reminder: {{documentTitle}} awaiting your signature',
    body: `<!-- loaded from database -->`,
    isDefault: true,
    variables: ['recipientName', 'documentTitle', 'signingUrl', 'expirationDate', 'primaryColor', 'logoUrl', 'productName', 'footerText'],
  },
  {
    id: 'email-3',
    name: 'Document Completed',
    description: 'Sent when all parties have signed',
    type: 'completed',
    subject: '{{documentTitle}} has been completed',
    body: `<!-- loaded from database -->`,
    isDefault: true,
    variables: ['recipientName', 'documentTitle', 'downloadUrl', 'primaryColor', 'logoUrl', 'productName', 'footerText'],
  },
  {
    id: 'email-4',
    name: 'Team Invite',
    description: 'Sent when inviting new team members',
    type: 'invite',
    subject: 'You\'ve been invited to join {{organizationName}} on {{productName}}',
    body: `<!-- loaded from database -->`,
    isDefault: true,
    variables: ['inviterName', 'organizationName', 'role', 'inviteUrl', 'primaryColor', 'logoUrl', 'productName', 'footerText'],
  },
];

const DEFAULT_BRANDING: BrandingSettings = {
  logoUrl: null,
  primaryColor: '#14b8a6',
  accentColor: '#0d9488',
  productName: 'PearSign',
  supportEmail: 'info@pearsign.com',
  footerText: '© 2025 PearSign. All rights reserved.',
  faviconUrl: null,
  customCss: null,
};

const DEFAULT_TIME_SETTINGS: TimeSettings = {
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  locale: 'en-US',
};

const DEFAULT_COMPLIANCE: ComplianceSettings = {
  retentionPolicy: 'forever',
  autoDeleteEnabled: false,
  requireTwoFactor: false,
  ipRestrictions: [],
  auditLogRetention: 'forever',
  dataResidency: 'us',
};

const DEFAULT_TEAMS: Team[] = [
  { id: 'team-1', name: 'Engineering', description: 'Product development team', memberCount: 2 },
  { id: 'team-2', name: 'Sales', description: 'Sales and business development', memberCount: 1 },
  { id: 'team-3', name: 'Marketing', description: 'Marketing and communications', memberCount: 1 },
  { id: 'team-4', name: 'Leadership', description: 'Executive team', memberCount: 1 },
];

// ============================================
// STORE CLASS
// ============================================

class SettingsStore {
  private teamMembers: TeamMember[] = [...DEFAULT_TEAM_MEMBERS];
  private roles: Role[] = [...DEFAULT_ROLES];
  private emailTemplates: EmailTemplate[] = [...DEFAULT_EMAIL_TEMPLATES];
  private branding: BrandingSettings = { ...DEFAULT_BRANDING };
  private timeSettings: TimeSettings = { ...DEFAULT_TIME_SETTINGS };
  private compliance: ComplianceSettings = { ...DEFAULT_COMPLIANCE };
  private teams: Team[] = [...DEFAULT_TEAMS];
  private listeners: Set<() => void> = new Set();

  // Simulate network delay
  private async simulateDelay(ms: number = 500): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  // ============================================
  // TEAM MEMBERS
  // ============================================

  async getTeamMembers(): Promise<TeamMember[]> {
    await this.simulateDelay(300);
    return [...this.teamMembers];
  }

  async inviteTeamMember(data: {
    email: string;
    role: UserRole;
    teams: string[];
  }): Promise<TeamMember> {
    await this.simulateDelay(800);

    // Check if email already exists
    if (this.teamMembers.some(m => m.email === data.email)) {
      throw new Error('A user with this email already exists');
    }

    const member: TeamMember = {
      id: `user-${Date.now()}`,
      email: data.email,
      firstName: '',
      lastName: '',
      role: data.role,
      status: 'invited',
      invitedAt: new Date().toISOString(),
      teams: data.teams,
    };

    this.teamMembers = [...this.teamMembers, member];
    this.notify();
    return member;
  }

  async updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
    await this.simulateDelay(500);

    const index = this.teamMembers.findIndex(m => m.id === id);
    if (index === -1) {
      throw new Error('Team member not found');
    }

    // Prevent changing owner role if they're the last owner
    const member = this.teamMembers[index];
    if (member.role === 'owner' && data.role && data.role !== 'owner') {
      const ownerCount = this.teamMembers.filter(m => m.role === 'owner' && m.status === 'active').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot change role: Organization must have at least one owner');
      }
    }

    const updated = { ...member, ...data };
    this.teamMembers = [
      ...this.teamMembers.slice(0, index),
      updated,
      ...this.teamMembers.slice(index + 1),
    ];
    this.notify();
    return updated;
  }

  async deactivateTeamMember(id: string): Promise<TeamMember> {
    await this.simulateDelay(500);

    const member = this.teamMembers.find(m => m.id === id);
    if (!member) {
      throw new Error('Team member not found');
    }

    if (member.role === 'owner') {
      const ownerCount = this.teamMembers.filter(m => m.role === 'owner' && m.status === 'active').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot deactivate: Organization must have at least one active owner');
      }
    }

    return this.updateTeamMember(id, { status: 'deactivated' });
  }

  async reactivateTeamMember(id: string): Promise<TeamMember> {
    return this.updateTeamMember(id, { status: 'active' });
  }

  async deleteTeamMember(id: string): Promise<void> {
    await this.simulateDelay(500);

    const member = this.teamMembers.find(m => m.id === id);
    if (!member) {
      throw new Error('Team member not found');
    }

    if (member.role === 'owner') {
      const ownerCount = this.teamMembers.filter(m => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot delete: Organization must have at least one owner');
      }
    }

    // In production: check for active envelopes assigned to this user
    this.teamMembers = this.teamMembers.filter(m => m.id !== id);
    this.notify();
  }

  async resendInvite(id: string): Promise<void> {
    await this.simulateDelay(500);
    const member = this.teamMembers.find(m => m.id === id);
    if (!member) {
      throw new Error('Team member not found');
    }
    if (member.status !== 'invited') {
      throw new Error('Can only resend invites to pending members');
    }
    // In production: trigger email send
  }

  // ============================================
  // ROLES
  // ============================================

  async getRoles(): Promise<Role[]> {
    await this.simulateDelay(300);
    return [...this.roles];
  }

  async createRole(data: { name: string; description: string; permissions: string[] }): Promise<Role> {
    await this.simulateDelay(500);

    const role: Role = {
      id: `role-${Date.now()}`,
      name: data.name,
      description: data.description,
      isSystem: false,
      permissions: ALL_PERMISSIONS.filter(p => data.permissions.includes(p.id)),
    };

    this.roles = [...this.roles, role];
    this.notify();
    return role;
  }

  async updateRole(id: string, data: Partial<{ name: string; description: string; permissions: string[] }>): Promise<Role> {
    await this.simulateDelay(500);

    const index = this.roles.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error('Role not found');
    }

    const role = this.roles[index];
    if (role.isSystem) {
      throw new Error('Cannot modify system roles');
    }

    const updated = {
      ...role,
      ...data,
      permissions: data.permissions
        ? ALL_PERMISSIONS.filter(p => data.permissions!.includes(p.id))
        : role.permissions,
    };

    this.roles = [
      ...this.roles.slice(0, index),
      updated,
      ...this.roles.slice(index + 1),
    ];
    this.notify();
    return updated;
  }

  async deleteRole(id: string): Promise<void> {
    await this.simulateDelay(500);

    const role = this.roles.find(r => r.id === id);
    if (!role) {
      throw new Error('Role not found');
    }
    if (role.isSystem) {
      throw new Error('Cannot delete system roles');
    }

    // Check if any users have this role
    const usersWithRole = this.teamMembers.filter(m => m.role === role.name.toLowerCase() as UserRole);
    if (usersWithRole.length > 0) {
      throw new Error(`Cannot delete role: ${usersWithRole.length} users have this role`);
    }

    this.roles = this.roles.filter(r => r.id !== id);
    this.notify();
  }

  // ============================================
  // EMAIL TEMPLATES
  // ============================================

  async getEmailTemplates(): Promise<EmailTemplate[]> {
    await this.simulateDelay(300);
    return [...this.emailTemplates];
  }

  async updateEmailTemplate(id: string, data: Partial<{ subject: string; body: string }>): Promise<EmailTemplate> {
    await this.simulateDelay(500);

    const index = this.emailTemplates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Email template not found');
    }

    const updated = { ...this.emailTemplates[index], ...data };
    this.emailTemplates = [
      ...this.emailTemplates.slice(0, index),
      updated,
      ...this.emailTemplates.slice(index + 1),
    ];
    this.notify();
    return updated;
  }

  async resetEmailTemplate(id: string): Promise<EmailTemplate> {
    await this.simulateDelay(500);

    const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find(t => t.id === id);
    if (!defaultTemplate) {
      throw new Error('Email template not found');
    }

    return this.updateEmailTemplate(id, {
      subject: defaultTemplate.subject,
      body: defaultTemplate.body,
    });
  }

  async sendTestEmail(templateId: string, toEmail: string): Promise<void> {
    await this.simulateDelay(1000);
    // In production: actually send email via backend
    console.log(`Sending test email for template ${templateId} to ${toEmail}`);
  }

  // ============================================
  // BRANDING
  // ============================================

  async getBranding(): Promise<BrandingSettings> {
    await this.simulateDelay(300);
    return { ...this.branding };
  }

  async updateBranding(data: Partial<BrandingSettings>): Promise<BrandingSettings> {
    await this.simulateDelay(500);
    this.branding = { ...this.branding, ...data };
    this.notify();
    return { ...this.branding };
  }

  async uploadLogo(file: File): Promise<string> {
    await this.simulateDelay(1000);
    // In production: upload to S3/cloud storage
    const url = URL.createObjectURL(file);
    this.branding = { ...this.branding, logoUrl: url };
    this.notify();
    return url;
  }

  async removeLogo(): Promise<void> {
    await this.simulateDelay(300);
    this.branding = { ...this.branding, logoUrl: null };
    this.notify();
  }

  // ============================================
  // TIME SETTINGS
  // ============================================

  async getTimeSettings(): Promise<TimeSettings> {
    await this.simulateDelay(300);
    return { ...this.timeSettings };
  }

  async updateTimeSettings(data: Partial<TimeSettings>): Promise<TimeSettings> {
    await this.simulateDelay(500);
    this.timeSettings = { ...this.timeSettings, ...data };
    this.notify();
    return { ...this.timeSettings };
  }

  // ============================================
  // COMPLIANCE
  // ============================================

  async getCompliance(): Promise<ComplianceSettings> {
    await this.simulateDelay(300);
    return { ...this.compliance };
  }

  async updateCompliance(data: Partial<ComplianceSettings>): Promise<ComplianceSettings> {
    await this.simulateDelay(500);
    this.compliance = { ...this.compliance, ...data };
    this.notify();
    return { ...this.compliance };
  }

  // ============================================
  // TEAMS
  // ============================================

  async getTeams(): Promise<Team[]> {
    await this.simulateDelay(300);
    return [...this.teams];
  }

  async createTeam(data: { name: string; description: string }): Promise<Team> {
    await this.simulateDelay(500);
    const team: Team = {
      id: `team-${Date.now()}`,
      name: data.name,
      description: data.description,
      memberCount: 0,
    };
    this.teams = [...this.teams, team];
    this.notify();
    return team;
  }

  // ============================================
  // PERMISSIONS CHECK
  // ============================================

  hasPermission(userRole: UserRole, permissionId: string): boolean {
    const role = this.roles.find(r => r.name.toLowerCase() === userRole);
    if (!role) return false;
    return role.permissions.some(p => p.id === permissionId);
  }

  getUserPermissions(userRole: UserRole): Permission[] {
    const role = this.roles.find(r => r.name.toLowerCase() === userRole);
    return role?.permissions || [];
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();

// ============================================
// TIMEZONE LIST
// ============================================

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
