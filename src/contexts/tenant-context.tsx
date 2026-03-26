"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTenantSession } from './tenant-session-context';

// ============== TYPES ==============

export type TenantPlan = 'free' | 'starter' | 'professional' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'pending' | 'cancelled';
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  logoUrl?: string;
}

export interface TenantMembership {
  tenant: Tenant;
  role: UserRole;
}

export interface TenantContextType {
  // Current tenant
  currentTenant: Tenant | null;
  currentRole: UserRole | null;
  isLoading: boolean;

  // Demo mode indicator
  isDemo: boolean;

  // Multi-tenant support
  memberships: TenantMembership[];

  // Actions
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenants: () => Promise<void>;

  // Feature checks
  hasFeature: (feature: string) => boolean;
  hasPermission: (permission: string) => boolean;

  // Plan info
  planFeatures: PlanFeatures | null;
}

export interface PlanFeatures {
  maxEnvelopesPerMonth: number;
  maxTemplates: number;
  maxTeamMembers: number;
  customBranding: boolean;
  bulkSend: boolean;
  fusionForms: boolean;
  phoneVerification: boolean;
  webhooks: boolean;
  apiAccess: boolean;
}

// Plan features mapping
const PLAN_FEATURES: Record<TenantPlan, PlanFeatures> = {
  free: {
    maxEnvelopesPerMonth: 5,
    maxTemplates: 3,
    maxTeamMembers: 1,
    customBranding: false,
    bulkSend: false,
    fusionForms: false,
    phoneVerification: false,
    webhooks: false,
    apiAccess: false,
  },
  starter: {
    maxEnvelopesPerMonth: 50,
    maxTemplates: 10,
    maxTeamMembers: 3,
    customBranding: true,
    bulkSend: false,
    fusionForms: false,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
  },
  professional: {
    maxEnvelopesPerMonth: 500,
    maxTemplates: 100,
    maxTeamMembers: 15,
    customBranding: true,
    bulkSend: true,
    fusionForms: true,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
  },
  enterprise: {
    maxEnvelopesPerMonth: -1, // unlimited
    maxTemplates: -1,
    maxTeamMembers: -1,
    customBranding: true,
    bulkSend: true,
    fusionForms: true,
    phoneVerification: true,
    webhooks: true,
    apiAccess: true,
  },
};

// Role permissions
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'canSendDocuments',
    'canManageTemplates',
    'canManageTeam',
    'canManageSettings',
    'canManageBilling',
    'canViewAuditLogs',
    'canManageIntegrations',
    'canUseApi',
  ],
  admin: [
    'canSendDocuments',
    'canManageTemplates',
    'canManageTeam',
    'canManageSettings',
    'canViewAuditLogs',
    'canManageIntegrations',
    'canUseApi',
  ],
  member: [
    'canSendDocuments',
    'canManageTemplates',
    'canUseApi',
  ],
  viewer: [],
};

// ============== CONTEXT ==============

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// Demo tenant for development mode only - clearly labeled as demo
const DEMO_TENANT: Tenant = {
  id: 'demo-tenant-001',
  name: 'Demo Mode',
  slug: 'demo',
  plan: 'professional',
  status: 'active',
};

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const tenantSession = useTenantSession();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Determine if we're in demo mode (no real tenant session)
  const isDemo = !tenantSession.isAuthenticated && !tenantSession.isLoading;

  // Load tenants on mount or when tenant session changes
  const refreshTenants = useCallback(async () => {
    try {
      setIsLoading(true);

      // If we have a real tenant session, use it instead of demo tenant
      if (tenantSession.isAuthenticated && tenantSession.session) {
        const session = tenantSession.session;
        const realTenant: Tenant = {
          id: session.tenantId,
          name: session.tenantName,
          slug: session.tenantId, // Use ID as slug if not available
          plan: session.tenantPlan as TenantPlan,
          status: 'active',
        };

        const realMembership: TenantMembership = {
          tenant: realTenant,
          role: session.role,
        };

        setMemberships([realMembership]);
        setCurrentTenant(realTenant);
        setCurrentRole(session.role);

        // Set cookie for server-side context
        if (typeof document !== 'undefined') {
          document.cookie = `tenant_id=${realTenant.id}; path=/; max-age=31536000`;
        }

        setIsLoading(false);
        return;
      }

      // If tenant session is still loading, wait
      if (tenantSession.isLoading) {
        return;
      }

      // No real session - use demo tenant for development/demo mode
      const demoMembership: TenantMembership = {
        tenant: DEMO_TENANT,
        role: 'owner',
      };

      setMemberships([demoMembership]);
      setCurrentTenant(demoMembership.tenant);
      setCurrentRole(demoMembership.role);

      // Do NOT set tenant_id cookie for demo mode - demo-tenant-001 doesn't exist
      // in the database and would cause 401 errors on server-side requests.
      // Only real authenticated tenants should set this cookie (handled above).
    } catch (error) {
      console.error('Failed to load tenants:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSession.isAuthenticated, tenantSession.isLoading, tenantSession.session]);

  useEffect(() => {
    refreshTenants();
  }, [refreshTenants]);

  // Switch to a different tenant
  const switchTenant = useCallback(async (tenantId: string) => {
    const membership = memberships.find(m => m.tenant.id === tenantId);

    if (!membership) {
      throw new Error('Not a member of this tenant');
    }

    setCurrentTenant(membership.tenant);
    setCurrentRole(membership.role);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentTenantId', tenantId);
    }

    // Set cookie for server-side context
    if (typeof document !== 'undefined') {
      document.cookie = `tenant_id=${tenantId}; path=/; max-age=31536000`;
    }

    // Reload page to refresh data with new tenant context
    window.location.reload();
  }, [memberships]);

  // Check if current plan has a feature
  const hasFeature = useCallback((feature: string): boolean => {
    if (!currentTenant) return false;

    const features = PLAN_FEATURES[currentTenant.plan];
    const value = features[feature as keyof PlanFeatures];

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return !!value;
  }, [currentTenant]);

  // Check if current user has a permission
  const hasPermission = useCallback((permission: string): boolean => {
    if (!currentRole) return false;

    const permissions = ROLE_PERMISSIONS[currentRole];
    return permissions.includes(permission);
  }, [currentRole]);

  // Get plan features
  const planFeatures = currentTenant ? PLAN_FEATURES[currentTenant.plan] : null;

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        currentRole,
        isLoading,
        isDemo,
        memberships,
        switchTenant,
        refreshTenants,
        hasFeature,
        hasPermission,
        planFeatures,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

// ============== FEATURE GATE COMPONENT ==============

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { hasFeature } = useTenant();

  if (!hasFeature(feature)) {
    return fallback || null;
  }

  return <>{children}</>;
}

// ============== PERMISSION GATE COMPONENT ==============

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { hasPermission } = useTenant();

  if (!hasPermission(permission)) {
    return fallback || null;
  }

  return <>{children}</>;
}
