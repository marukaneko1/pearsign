"use client";

import { useState } from "react";
import { useTenant, TenantMembership } from "@/contexts/tenant-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  Settings,
  Crown,
  Shield,
  User,
  Eye,
  Loader2,
} from "lucide-react";

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

const ROLE_COLORS = {
  owner: "text-amber-500",
  admin: "text-primary",
  member: "text-gray-500",
  viewer: "text-gray-400",
};

const PLAN_COLORS = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-primary/10 text-primary",
  professional: "bg-primary/10 text-primary",
  enterprise: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export function TenantSwitcher() {
  const { currentTenant, currentRole, memberships, switchTenant, isLoading, isDemo } = useTenant();
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === currentTenant?.id) return;

    try {
      setIsSwitching(true);
      await switchTenant(tenantId);
    } catch (error) {
      console.error("Failed to switch tenant:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (!currentTenant) {
    return null;
  }

  const RoleIcon = currentRole ? ROLE_ICONS[currentRole] : User;
  const isDemoMode = isDemo || currentTenant.id === 'demo-tenant-001';
  const showSwitcher = memberships.length > 1;

  // In demo mode, don't show the tenant switcher at all
  // Authentication is handled by the user avatar in the header
  if (isDemoMode) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-9 px-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isDemoMode ? 'bg-amber-500' : ''}`} style={isDemoMode ? {} : { background: 'linear-gradient(135deg, hsl(224, 72%, 52%) 0%, hsl(224, 68%, 44%) 100%)' }}>
              <Building2 className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium truncate max-w-[120px]">
                {currentTenant.name}
              </span>
              {isDemoMode ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Sign in for full access
                </span>
              ) : currentRole && (
                <span className="text-xs text-muted-foreground capitalize">
                  {currentRole}
                </span>
              )}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        {isDemoMode ? (
          <>
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Demo Mode</p>
                  <p className="text-xs text-muted-foreground">Sign in to access your organization</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-primary font-medium"
              onClick={() => window.location.href = '/login'}
            >
              <User className="h-4 w-4" />
              Sign In
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={() => window.location.href = '/login'}
            >
              <Plus className="h-4 w-4" />
              Create Account
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Organizations</span>
              <Badge variant="secondary" className={PLAN_COLORS[currentTenant.plan]}>
                {currentTenant.plan}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {memberships.map((membership) => (
              <TenantMenuItem
                key={membership.tenant.id}
                membership={membership}
                isActive={membership.tenant.id === currentTenant.id}
                onSelect={() => handleSwitchTenant(membership.tenant.id)}
                isSwitching={isSwitching}
              />
            ))}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={() => window.location.href = '/onboarding'}
            >
              <Plus className="h-4 w-4" />
              Create Organization
            </DropdownMenuItem>

            <DropdownMenuItem className="gap-2 cursor-pointer" asChild>
              <a href="/settings">
                <Settings className="h-4 w-4" />
                Organization Settings
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TenantMenuItemProps {
  membership: TenantMembership;
  isActive: boolean;
  onSelect: () => void;
  isSwitching: boolean;
}

function TenantMenuItem({ membership, isActive, onSelect, isSwitching }: TenantMenuItemProps) {
  const { tenant, role } = membership;
  const RoleIcon = ROLE_ICONS[role];

  return (
    <DropdownMenuItem
      className="gap-3 py-3 cursor-pointer"
      onClick={onSelect}
      disabled={isSwitching}
    >
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border">
        <Building2 className="h-4 w-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{tenant.name}</span>
          {isActive && <Check className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <RoleIcon className={`h-3 w-3 ${ROLE_COLORS[role]}`} />
          <span className="text-xs text-muted-foreground capitalize">{role}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <Badge variant="secondary" className={`text-xs ${PLAN_COLORS[tenant.plan]}`}>
            {tenant.plan}
          </Badge>
        </div>
      </div>

      {isSwitching && <Loader2 className="h-4 w-4 animate-spin" />}
    </DropdownMenuItem>
  );
}

// ============== PLAN UPGRADE BANNER ==============

export function PlanUpgradeBanner() {
  const { currentTenant, planFeatures } = useTenant();

  if (!currentTenant || currentTenant.plan === 'enterprise') {
    return null;
  }

  const nextPlan = currentTenant.plan === 'free'
    ? 'starter'
    : currentTenant.plan === 'starter'
      ? 'professional'
      : 'enterprise';

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-md p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            Upgrade to {nextPlan} for more features
          </p>
          <p className="text-xs text-primary mt-1">
            {currentTenant.plan === 'free' && 'Unlock custom branding, webhooks, and more'}
            {currentTenant.plan === 'starter' && 'Unlock bulk send, fusion forms, and more'}
            {currentTenant.plan === 'professional' && 'Unlock SSO, unlimited everything, and priority support'}
          </p>
        </div>
        <Button size="sm">
          Upgrade
        </Button>
      </div>
    </div>
  );
}
