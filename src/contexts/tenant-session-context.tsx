"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============== TYPES ==============

export interface TenantSessionUser {
  userId: string;
  userEmail: string;
  userName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  permissions: {
    canSendDocuments: boolean;
    canManageTemplates: boolean;
    canManageTeam: boolean;
    canManageSettings: boolean;
    canManageBilling: boolean;
    canViewAuditLogs: boolean;
    canManageIntegrations: boolean;
    canUseApi: boolean;
  };
}

export interface TenantSessionContextValue {
  // Session state
  isAuthenticated: boolean;
  isLoading: boolean;
  session: TenantSessionUser | null;

  // Actions
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;

  // Helpers
  hasPermission: (permission: keyof TenantSessionUser['permissions']) => boolean;
  isDemo: boolean;
}

// ============== CONTEXT ==============

const TenantSessionContext = createContext<TenantSessionContextValue | null>(null);

// ============== PROVIDER ==============

interface TenantSessionProviderProps {
  children: ReactNode;
}

export function TenantSessionProvider({ children }: TenantSessionProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<TenantSessionUser | null>(null);

  const refreshSession = useCallback(async () => {
    if (process.env.NODE_ENV !== 'production') console.log('[TenantSessionContext] Refreshing session...');
    try {
      const response = await fetch('/api/tenant/session', {
        credentials: 'include', // Ensure cookies are sent
        cache: 'no-store', // Don't cache session responses
      });
      const data = await response.json();

      if (process.env.NODE_ENV !== 'production') console.log('[TenantSessionContext] Session response:', {
        authenticated: data.authenticated,
        hasSession: !!data.session,
        userEmail: data.session?.userEmail,
        tenantName: data.session?.tenantName,
      });

      if (data.authenticated && data.session) {
        setSession(data.session);
        if (process.env.NODE_ENV !== 'production') console.log('[TenantSessionContext] Session SET for:', data.session.userEmail);
      } else {
        if (process.env.NODE_ENV !== 'production') console.log('[TenantSessionContext] No valid session, setting to null');
        setSession(null);
      }
    } catch (error) {
      console.error('[TenantSessionContext] Error refreshing session:', error);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/tenant/session', { method: 'DELETE' });
      setSession(null);
      // Redirect to home/login
      window.location.href = '/';
    } catch (error) {
      console.error('[TenantSession] Error logging out:', error);
    }
  }, []);

  const hasPermission = useCallback((permission: keyof TenantSessionUser['permissions']): boolean => {
    if (!session) return false;
    return session.permissions[permission] === true;
  }, [session]);

  // Load session on mount
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const value: TenantSessionContextValue = {
    isAuthenticated: !!session,
    isLoading,
    session,
    refreshSession,
    logout,
    hasPermission,
    isDemo: !session, // If no session, we're in demo mode
  };

  return (
    <TenantSessionContext.Provider value={value}>
      {children}
    </TenantSessionContext.Provider>
  );
}

// ============== HOOK ==============

export function useTenantSession() {
  const context = useContext(TenantSessionContext);
  if (!context) {
    throw new Error('useTenantSession must be used within a TenantSessionProvider');
  }
  return context;
}

// ============== HELPERS ==============

/**
 * Check if the current user is in a real tenant session
 * Returns false if in demo mode
 */
export function useIsTenantAuthenticated(): boolean {
  const { isAuthenticated, isLoading } = useTenantSession();
  return !isLoading && isAuthenticated;
}

/**
 * Get the current tenant ID
 * Returns null if not authenticated
 */
export function useCurrentTenantId(): string | null {
  const { session } = useTenantSession();
  return session?.tenantId || null;
}
