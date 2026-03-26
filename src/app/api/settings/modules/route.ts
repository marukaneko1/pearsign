/**
 * Modules API
 *
 * Multi-tenancy enforced via withTenant middleware
 * Each tenant has isolated module configurations
 */

import { NextRequest, NextResponse } from 'next/server';
import { ModulesService, ModuleId } from '@/lib/modules';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

/**
 * GET /api/settings/modules
 * Get all modules for the current tenant
 */
export const GET = withTenant(async (request: NextRequest, { context, tenantId }: TenantApiContext) => {
  try {
    const dbModules = await ModulesService.getModules(tenantId);
    const dbMap = new Map(dbModules.map(m => [m.moduleId, m]));

    const { AVAILABLE_MODULES } = await import('@/lib/modules');

    const modules = AVAILABLE_MODULES.map(info => {
      const dbEntry = dbMap.get(info.id);
      return {
        id: info.id,
        name: info.name,
        description: info.description,
        category: info.category,
        requiredPlan: info.requiredPlan || 'free',
        enabled: dbEntry ? dbEntry.enabled : true,
        settings: dbEntry?.settings || {},
      };
    });

    return NextResponse.json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 });
  }
});

/**
 * PATCH /api/settings/modules
 * Update module settings for the current tenant
 */
export const PATCH = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { moduleId, enabled, settings, action } = body;

      if (!moduleId) {
        return NextResponse.json({ error: 'Module ID is required' }, { status: 400 });
      }

      let result;
      if (action === 'toggle' || (action === undefined && enabled !== undefined)) {
        result = await ModulesService.setModuleEnabled(moduleId as ModuleId, enabled, tenantId);
      } else if (action === 'updateSettings') {
        result = await ModulesService.updateModuleSettings(moduleId as ModuleId, settings, tenantId);
      } else {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error updating module:', error);
      return NextResponse.json({ error: 'Failed to update module' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['canManageSettings'],
  }
);
