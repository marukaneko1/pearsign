"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  FileText,
  LayoutTemplate,
  Send,
  Activity,
  Plug,
  Settings,
  Plus,
  X,
  Users,
  Zap,
  Sparkles,
  Loader2,
  HardDrive,
  Webhook,
  Building2,
  Receipt,
  PanelLeftClose,
} from "lucide-react";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { useTenant } from "@/contexts/tenant-context";

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle?: () => void;
  currentView?: string;
  onNavigate?: (view: string) => void;
  onNewDocument?: () => void;
}

interface StorageData {
  usedStorage: number;
  totalStorage: number;
  documentCount: number;
  templateCount: number;
  attachmentCount: number;
}

const mainNavItems = [
  { title: "Home", icon: LayoutDashboard, view: "dashboard" },
  { title: "My Documents", icon: FileText, view: "documents" },
  { title: "Templates", icon: LayoutTemplate, view: "templates" },
  { title: "Sent", icon: Send, view: "sent" },
];

const toolsNavItems = [
  { title: "Bulk Send", icon: Users, view: "bulk-send" },
  { title: "FusionForms", icon: Zap, view: "forms" },
  { title: "Document Center", icon: Sparkles, view: "ai-generator" },
  { title: "Invoices", icon: Receipt, view: "invoices" },
];

// System nav items - conditionally shown based on authentication and permissions
// IMPORTANT: Platform Admin is NEVER shown here - it's only accessible via direct /admin URL
const getSystemNavItems = (isAuthenticated: boolean, canManageTeam: boolean) => {
  const items = [
    { title: "Activity", icon: Activity, view: "activity" },
    { title: "Integrations", icon: Plug, view: "integrations" },
    { title: "Webhooks", icon: Webhook, view: "webhooks" },
  ];

  // Organization is ONLY visible for authenticated tenant users who can manage team
  // NOT visible in demo mode - demo users should see a "Get Started" flow instead
  if (isAuthenticated && canManageTeam) {
    items.push({ title: "Organization", icon: Building2, view: "organization" });
  }

  // Always add Settings
  items.push({ title: "Settings", icon: Settings, view: "settings" });

  // NOTE: Platform Admin is NEVER added to sidebar navigation
  // System owners access it directly via /admin URL with ADMIN_SECRET_KEY
  // This is a security requirement for multi-tenant SaaS

  return items;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DashboardSidebar({ isOpen, onClose, onToggle, currentView = "dashboard", onNavigate, onNewDocument }: DashboardSidebarProps) {
  const { isDemo, hasPermission } = useTenant();
  const [storageData, setStorageData] = useState<StorageData | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  // Get system nav items based on authentication and permissions
  // isDemo means NOT authenticated - so we pass !isDemo as isAuthenticated
  const canManageTeam = hasPermission('canManageTeam');
  const isAuthenticated = !isDemo;
  const systemNavItems = getSystemNavItems(isAuthenticated, canManageTeam);

  const loadStorageData = useCallback(async () => {
    try {
      setStorageLoading(true);
      const response = await fetch('/api/settings/storage');
      if (response.ok) {
        const data = await response.json();
        setStorageData(data);
      }
    } catch (error) {
      console.error('Error loading storage data:', error);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorageData();
  }, [loadStorageData]);

  const usedStorageFormatted = storageData ? formatBytes(storageData.usedStorage) : '0 GB';
  const totalStorageFormatted = storageData ? formatBytes(storageData.totalStorage) : '10 GB';
  const usagePercentage = storageData && storageData.totalStorage > 0
    ? Math.round((storageData.usedStorage / storageData.totalStorage) * 100)
    : 0;

  const NavItem = ({ item }: { item: { title: string; icon: React.ElementType; view: string; isExternal?: boolean } }) => {
    const isActive = currentView === item.view;
    const Icon = item.icon;

    if (item.isExternal) {
      return (
        <a
          href={`/${item.view}`}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
          <span>{item.title}</span>
        </a>
      );
    }

    return (
      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        onClick={() => {
          onNavigate?.(item.view);
        }}
      >
        <Icon className={cn("h-[18px] w-[18px]", isActive && "text-primary")} />
        <span>{item.title}</span>
      </button>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar — outer shell controls visible width (desktop) or translate (mobile) */}
      <aside
        data-tour="sidebar"
        className={cn(
          // Shared base
          "fixed left-0 top-16 z-50 h-[calc(100%-4rem)] bg-card/80 backdrop-blur-xl border-r border-border/60 overflow-hidden",
          // Smooth animation for both width and transform
          "transition-[width,transform] duration-300 ease-in-out",
          // Mobile: always 260px wide, slides in/out via translate
          "w-[260px]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static in document flow, override translate, animate width
          "lg:static lg:h-[calc(100vh-4rem)] lg:translate-x-0",
          isOpen ? "lg:w-[260px]" : "lg:w-0",
        )}
      >
        {/* Inner wrapper — always 260px so content never wraps during animation */}
        <div className="w-[260px] h-full flex flex-col">

        {/* Tenant Switcher + toggle button */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/60">
          <div className="flex-1 min-w-0">
            <TenantSwitcher />
          </div>
          <button
            onClick={onToggle ?? onClose}
            title="Collapse sidebar"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* New Document Button */}
        <div className="px-3 pt-4 pb-2" data-tour="new-document">
          <button
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors shadow-sm"
            aria-label="Create new document"
            onClick={() => {
              onNewDocument?.();
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New document
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {mainNavItems.map((item) => (
            <NavItem key={item.view} item={item} />
          ))}

          <div className="h-px bg-border/50 my-3 mx-1" />

          {toolsNavItems.map((item) => (
            <NavItem key={item.view} item={item} />
          ))}

          <div className="h-px bg-border/50 my-3 mx-1" />

          {systemNavItems.map((item) => (
            <NavItem key={item.view} item={item} />
          ))}
        </nav>

        {/* Storage Section */}
        <div className="p-3 border-t border-border/60">
          <button
            onClick={() => {
              onNavigate?.("settings");
            }}
            className="w-full p-3 rounded-md hover:bg-accent transition-colors text-left"
          >
            {storageLoading ? (
              <div className="flex items-center justify-center py-1">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Storage</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {usedStorageFormatted} of {totalStorageFormatted} used
                </p>
              </>
            )}
          </button>
        </div>

        </div>{/* end inner 260px wrapper */}
      </aside>
    </>
  );
}
