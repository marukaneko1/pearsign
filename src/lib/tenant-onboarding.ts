/**
 * Tenant Onboarding Service
 *
 * Handles:
 * - First-login detection
 * - Onboarding progress tracking
 * - Demo data management
 * - Setup status indicators
 */

import { sql } from './db';

// ============== TYPES ==============

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  skipped: boolean;
  required: boolean;
}

export interface OnboardingStatus {
  tenantId: string;
  hasCompletedOnboarding: boolean;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  hasDemoData: boolean;
  showWalkthrough: boolean;
  dismissedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationStatus {
  sendgrid: {
    connected: boolean;
    apiKey?: string;
    fromEmail?: string;
  };
  twilio: {
    connected: boolean;
    accountSid?: string;
    phoneNumber?: string;
  };
  branding: {
    configured: boolean;
    logoUrl?: string;
    primaryColor?: string;
  };
}

export interface SetupProgress {
  integrations: IntegrationStatus;
  hasTemplates: boolean;
  hasSentEnvelope: boolean;
  teamConfigured: boolean;
  brandingConfigured: boolean;
  overallProgress: number; // 0-100
}

// ============== DEFAULT STEPS ==============

const DEFAULT_ONBOARDING_STEPS: Omit<OnboardingStep, 'completed' | 'skipped'>[] = [
  {
    id: 'welcome',
    title: 'Welcome to PearSign',
    description: 'Learn what PearSign does and how it can help your business',
    required: false,
  },
  {
    id: 'integrations',
    title: 'Connect Your Services',
    description: 'Set up SendGrid for emails and Twilio for SMS notifications',
    required: true,
  },
  {
    id: 'branding',
    title: 'Customize Your Branding',
    description: 'Add your logo and brand colors for a professional look',
    required: false,
  },
  {
    id: 'demo',
    title: 'Explore with Demo Data',
    description: 'Try out the platform with sample templates and documents',
    required: false,
  },
  {
    id: 'first-send',
    title: 'Send Your First Document',
    description: 'Create a template and send your first envelope for signature',
    required: false,
  },
];

// ============== DATABASE INITIALIZATION ==============

let _onboardingTableInitialized = false;

export async function initializeOnboardingTable(): Promise<void> {
  if (_onboardingTableInitialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_onboarding (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(255) UNIQUE NOT NULL,
      has_completed_onboarding BOOLEAN DEFAULT false,
      current_step INTEGER DEFAULT 0,
      steps JSONB DEFAULT '[]',
      has_demo_data BOOLEAN DEFAULT false,
      show_walkthrough BOOLEAN DEFAULT true,
      dismissed_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant ON tenant_onboarding(tenant_id)
  `;

  _onboardingTableInitialized = true;
}

// ============== ONBOARDING SERVICE ==============

export const TenantOnboardingService = {
  /**
   * Get or create onboarding status for a tenant
   */
  async getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
    await initializeOnboardingTable();

    // Check if onboarding record exists
    const existing = await sql`
      SELECT * FROM tenant_onboarding WHERE tenant_id = ${tenantId}
    `;

    if (existing.length > 0) {
      return mapOnboardingFromDb(existing[0]);
    }

    // Create new onboarding record
    const steps = DEFAULT_ONBOARDING_STEPS.map(step => ({
      ...step,
      completed: false,
      skipped: false,
    }));

    const result = await sql`
      INSERT INTO tenant_onboarding (tenant_id, steps)
      VALUES (${tenantId}, ${JSON.stringify(steps)})
      RETURNING *
    `;

    return mapOnboardingFromDb(result[0]);
  },

  /**
   * Update onboarding progress
   */
  async updateProgress(tenantId: string, updates: {
    currentStep?: number;
    stepId?: string;
    completed?: boolean;
    skipped?: boolean;
  }): Promise<OnboardingStatus> {
    const status = await this.getOnboardingStatus(tenantId);

    let newSteps = [...status.steps];
    let newCurrentStep = status.currentStep;

    // Update specific step
    if (updates.stepId) {
      newSteps = newSteps.map(step => {
        if (step.id === updates.stepId) {
          return {
            ...step,
            completed: updates.completed ?? step.completed,
            skipped: updates.skipped ?? step.skipped,
          };
        }
        return step;
      });
    }

    // Update current step
    if (updates.currentStep !== undefined) {
      newCurrentStep = updates.currentStep;
    }

    // Check if all required steps are completed
    const allRequiredCompleted = newSteps
      .filter(s => s.required)
      .every(s => s.completed || s.skipped);

    const hasCompletedOnboarding = allRequiredCompleted && newCurrentStep >= newSteps.length - 1;

    await sql`
      UPDATE tenant_onboarding
      SET
        current_step = ${newCurrentStep},
        steps = ${JSON.stringify(newSteps)},
        has_completed_onboarding = ${hasCompletedOnboarding},
        completed_at = ${hasCompletedOnboarding ? new Date().toISOString() : null},
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `;

    return this.getOnboardingStatus(tenantId);
  },

  /**
   * Dismiss/skip the walkthrough
   */
  async dismissWalkthrough(tenantId: string): Promise<void> {
    await sql`
      UPDATE tenant_onboarding
      SET
        show_walkthrough = false,
        dismissed_at = NOW(),
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `;
  },

  /**
   * Reopen the walkthrough (from Settings)
   */
  async reopenWalkthrough(tenantId: string): Promise<void> {
    await sql`
      UPDATE tenant_onboarding
      SET
        show_walkthrough = true,
        dismissed_at = NULL,
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `;
  },

  /**
   * Complete onboarding
   */
  async completeOnboarding(tenantId: string): Promise<void> {
    await sql`
      UPDATE tenant_onboarding
      SET
        has_completed_onboarding = true,
        show_walkthrough = false,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `;
  },

  /**
   * Check integration status for a tenant
   */
  async getIntegrationStatus(tenantId: string): Promise<IntegrationStatus> {
    // Check tenant settings for integrations
    const tenant = await sql`
      SELECT settings FROM tenants WHERE id = ${tenantId}
    `;

    const settings = tenant.length > 0 ? (tenant[0].settings || {}) : {};

    // Check integrations table
    const integrations = await sql`
      SELECT * FROM integrations
      WHERE org_id = ${tenantId}
    `.catch(() => []) as Array<{ name?: string }>;

    const sendgridIntegration = integrations.find((i) =>
      i.name?.toLowerCase().includes('sendgrid')
    );
    const twilioIntegration = integrations.find((i) =>
      i.name?.toLowerCase().includes('twilio')
    );

    // Check branding
    const branding = await sql`
      SELECT * FROM tenant_branding WHERE tenant_id = ${tenantId}
    `.catch(() => []);

    return {
      sendgrid: {
        connected: !!sendgridIntegration || !!settings.sendgrid_api_key,
        apiKey: settings.sendgrid_api_key ? '••••••••' : undefined,
        fromEmail: settings.sendgrid_from_email || undefined,
      },
      twilio: {
        connected: !!twilioIntegration || !!settings.twilio_account_sid,
        accountSid: settings.twilio_account_sid ? '••••••••' : undefined,
        phoneNumber: settings.twilio_phone_number || undefined,
      },
      branding: {
        configured: branding.length > 0 || !!settings.logoUrl,
        logoUrl: branding[0]?.logo_url || settings.logoUrl,
        primaryColor: branding[0]?.primary_color || settings.primaryColor,
      },
    };
  },

  /**
   * Get overall setup progress
   */
  async getSetupProgress(tenantId: string): Promise<SetupProgress> {
    const integrations = await this.getIntegrationStatus(tenantId);

    // Check for templates
    const templates = await sql`
      SELECT COUNT(*) as count FROM templates WHERE org_id = ${tenantId}
    `.catch(() => [{ count: 0 }]);

    // Check for sent envelopes
    const envelopes = await sql`
      SELECT COUNT(*) as count FROM envelope_documents WHERE org_id = ${tenantId}
    `.catch(() => [{ count: 0 }]);

    // Check team members
    const teamMembers = await sql`
      SELECT COUNT(*) as count FROM tenant_users
      WHERE tenant_id = ${tenantId} AND status = 'active'
    `.catch(() => [{ count: 0 }]);

    const hasTemplates = parseInt(templates[0]?.count) > 0;
    const hasSentEnvelope = parseInt(envelopes[0]?.count) > 0;
    const teamConfigured = parseInt(teamMembers[0]?.count) > 1;
    const brandingConfigured = integrations.branding.configured;

    // Calculate overall progress
    let progress = 0;
    const weights = {
      sendgrid: 25,
      twilio: 15,
      branding: 15,
      templates: 20,
      envelope: 25,
    };

    if (integrations.sendgrid.connected) progress += weights.sendgrid;
    if (integrations.twilio.connected) progress += weights.twilio;
    if (brandingConfigured) progress += weights.branding;
    if (hasTemplates) progress += weights.templates;
    if (hasSentEnvelope) progress += weights.envelope;

    return {
      integrations,
      hasTemplates,
      hasSentEnvelope,
      teamConfigured,
      brandingConfigured,
      overallProgress: Math.min(100, progress),
    };
  },

  /**
   * Create demo data for a tenant
   */
  async createDemoData(tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Create a sample template
      const templateId = `template_demo_${Date.now()}`;

      await sql`
        INSERT INTO templates (
          id, org_id, name, description, category, fields, signer_roles, is_demo
        ) VALUES (
          ${templateId},
          ${tenantId},
          'Sample NDA Template',
          'A demo Non-Disclosure Agreement template to help you get started',
          'Legal',
          ${JSON.stringify([
            { id: 'signer_name', type: 'signature', label: 'Signature', required: true, page: 1, x: 100, y: 600 },
            { id: 'date_signed', type: 'date', label: 'Date', required: true, page: 1, x: 300, y: 600 },
            { id: 'printed_name', type: 'text', label: 'Printed Name', required: true, page: 1, x: 100, y: 650 },
          ])},
          ${JSON.stringify([{ id: 'signer', name: 'Signer', order: 1 }])},
          true
        )
      `;

      // Update onboarding status
      await sql`
        UPDATE tenant_onboarding
        SET has_demo_data = true, updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `;

      console.log('[TenantOnboarding] Created demo data for tenant:', tenantId);

      return { success: true, message: 'Demo data created successfully' };
    } catch (error) {
      console.error('[TenantOnboarding] Error creating demo data:', error);
      return { success: false, message: 'Failed to create demo data' };
    }
  },

  /**
   * Remove demo data for a tenant
   */
  async removeDemoData(tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Remove demo templates
      await sql`
        DELETE FROM templates WHERE org_id = ${tenantId} AND is_demo = true
      `;

      // Remove demo envelopes
      await sql`
        DELETE FROM envelope_documents WHERE org_id = ${tenantId} AND is_demo = true
      `;

      // Update onboarding status
      await sql`
        UPDATE tenant_onboarding
        SET has_demo_data = false, updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `;

      console.log('[TenantOnboarding] Removed demo data for tenant:', tenantId);

      return { success: true, message: 'Demo data removed successfully' };
    } catch (error) {
      console.error('[TenantOnboarding] Error removing demo data:', error);
      return { success: false, message: 'Failed to remove demo data' };
    }
  },

  /**
   * Check if this is the tenant's first login
   */
  async isFirstLogin(tenantId: string): Promise<boolean> {
    const status = await this.getOnboardingStatus(tenantId);
    return !status.hasCompletedOnboarding && status.showWalkthrough && !status.dismissedAt;
  },
};

// ============== HELPER FUNCTIONS ==============

function mapOnboardingFromDb(row: Record<string, unknown>): OnboardingStatus {
  const steps = typeof row.steps === 'string'
    ? JSON.parse(row.steps)
    : (row.steps as OnboardingStep[]) || [];

  return {
    tenantId: row.tenant_id as string,
    hasCompletedOnboarding: row.has_completed_onboarding as boolean,
    currentStep: parseInt(row.current_step as string) || 0,
    totalSteps: steps.length,
    steps,
    hasDemoData: row.has_demo_data as boolean,
    showWalkthrough: row.show_walkthrough as boolean,
    dismissedAt: row.dismissed_at ? (row.dismissed_at as Date).toISOString() : undefined,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
    createdAt: row.created_at ? (row.created_at as Date).toISOString() : '',
    updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : '',
  };
}
