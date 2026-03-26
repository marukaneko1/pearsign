/**
 * PearSign Modules Service
 *
 * Multi-tenancy: orgId is REQUIRED in all methods
 */

import { sql } from "./db";

export type ModuleId =
  | "storage-billing"
  | "bulk-send"
  | "fusion-forms"
  | "ai-generator"
  | "integrations"
  | "team-management"
  | "branding"
  | "compliance"
  | "notifications"
  | "api-access";

export interface OrganizationModule {
  id: string;
  organizationId: string;
  moduleId: ModuleId;
  enabled: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  description: string;
  category: "core" | "tools" | "settings" | "advanced";
  requiredPlan?: "free" | "professional" | "enterprise";
}

export const AVAILABLE_MODULES: ModuleInfo[] = [
  { id: "storage-billing", name: "Storage & Billing", description: "Track storage usage and manage billing/subscriptions", category: "settings", requiredPlan: "professional" },
  { id: "bulk-send", name: "Bulk Send", description: "Send documents to multiple recipients at once", category: "tools", requiredPlan: "professional" },
  { id: "fusion-forms", name: "FusionForms", description: "Create reusable public signing links", category: "tools", requiredPlan: "professional" },
  { id: "ai-generator", name: "AI Document Generator", description: "Generate documents using AI", category: "tools", requiredPlan: "professional" },
  { id: "integrations", name: "Integrations", description: "Connect with third-party services", category: "advanced", requiredPlan: "professional" },
  { id: "team-management", name: "Team Management", description: "Manage team members and permissions", category: "settings", requiredPlan: "professional" },
  { id: "branding", name: "Custom Branding", description: "Customize logos, colors, and white-label options", category: "settings", requiredPlan: "enterprise" },
  { id: "compliance", name: "Compliance & Security", description: "Configure retention policies and security settings", category: "settings", requiredPlan: "professional" },
  { id: "notifications", name: "Notification Settings", description: "Configure email and in-app notifications", category: "settings", requiredPlan: "free" },
  { id: "api-access", name: "API Access", description: "Access PearSign API for custom integrations", category: "advanced", requiredPlan: "enterprise" },
];

function mapModuleFromDb(row: Record<string, unknown>): OrganizationModule {
  return {
    id: row.id as string,
    organizationId: (row.organizationId as string) || (row.organization_id as string),
    moduleId: ((row.moduleId as ModuleId) || (row.module_id as ModuleId)),
    enabled: row.enabled as boolean,
    settings: (row.settings as Record<string, unknown>) || {},
    createdAt: row.createdAt ? String(row.createdAt) : (row.created_at as Date)?.toISOString() || "",
    updatedAt: row.updatedAt ? String(row.updatedAt) : (row.updated_at as Date)?.toISOString() || "",
  };
}

export const ModulesService = {
  async getModules(orgId: string): Promise<OrganizationModule[]> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const modules = await sql`
      SELECT id, organization_id, module_id, enabled, settings, created_at, updated_at
      FROM organization_modules WHERE organization_id = ${orgId} ORDER BY module_id
    `;
    return modules.map(mapModuleFromDb);
  },

  async isModuleEnabled(moduleId: ModuleId, orgId: string): Promise<boolean> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`SELECT enabled FROM organization_modules WHERE organization_id = ${orgId} AND module_id = ${moduleId}`;
    if (result.length === 0) return true;
    return result[0].enabled === true;
  },

  async getModule(moduleId: ModuleId, orgId: string): Promise<OrganizationModule | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const result = await sql`SELECT * FROM organization_modules WHERE organization_id = ${orgId} AND module_id = ${moduleId}`;
    if (result.length === 0) return null;
    return mapModuleFromDb(result[0]);
  },

  async setModuleEnabled(moduleId: ModuleId, enabled: boolean, orgId: string): Promise<OrganizationModule> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const now = new Date().toISOString();
    const existing = await sql`SELECT id FROM organization_modules WHERE organization_id = ${orgId} AND module_id = ${moduleId}`;

    if (existing.length === 0) {
      const id = "mod-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      const result = await sql`
        INSERT INTO organization_modules (id, organization_id, module_id, enabled, settings, created_at, updated_at)
        VALUES (${id}, ${orgId}, ${moduleId}, ${enabled}, '{}', ${now}, ${now}) RETURNING *
      `;
      return mapModuleFromDb(result[0]);
    }

    const result = await sql`
      UPDATE organization_modules SET enabled = ${enabled}, updated_at = ${now}
      WHERE organization_id = ${orgId} AND module_id = ${moduleId} RETURNING *
    `;
    return mapModuleFromDb(result[0]);
  },

  async updateModuleSettings(moduleId: ModuleId, settings: Record<string, unknown>, orgId: string): Promise<OrganizationModule | null> {
    if (!orgId) {
      throw new Error('orgId is required');
    }

    const now = new Date().toISOString();
    const result = await sql`
      UPDATE organization_modules SET settings = ${JSON.stringify(settings)}::jsonb, updated_at = ${now}
      WHERE organization_id = ${orgId} AND module_id = ${moduleId} RETURNING *
    `;
    if (result.length === 0) return null;
    return mapModuleFromDb(result[0]);
  },
};
