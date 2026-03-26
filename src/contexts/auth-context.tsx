"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface Tenant {
  id: string;
  name: string;
  plan: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      // Check if we have a tenant session
      const response = await fetch('/api/tenant/session', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.authenticated && data.session) {
        setUser({
          id: data.session.userId,
          email: data.session.userEmail,
          firstName: data.session.userName?.split(' ')[0] || '',
          lastName: data.session.userName?.split(' ').slice(1).join(' ') || '',
        });
        setTenant({
          id: data.session.tenantId,
          name: data.session.tenantName,
          plan: data.session.tenantPlan,
          role: data.session.role,
        });
      } else {
        setUser(null);
        setTenant(null);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setUser(null);
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // CRITICAL: Required to save session cookie
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (process.env.NODE_ENV !== 'production') console.log('[AuthContext] Login response:', {
      success: data.success,
      hasUser: !!data.user,
      hasTenant: !!data.tenant,
      error: data.error,
    });

    if (!data.success) {
      throw new Error(data.error || 'Login failed');
    }

    setUser(data.user);
    setTenant(data.tenant);

    // Refresh to get full session data
    await refreshUser();
  };

  const register = async (data: RegisterData) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // CRITICAL: Required to save session cookie
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Registration failed');
    }

    setUser(result.user);
    if (result.tenant) {
      setTenant(result.tenant);
    }

    // Refresh to get full session data
    await refreshUser();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    }

    setUser(null);
    setTenant(null);

    // Redirect to login
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isLoading,
        isLoggedIn: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
