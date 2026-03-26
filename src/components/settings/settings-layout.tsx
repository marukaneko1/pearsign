"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Users,
  Shield,
  Mail,
  Palette,
  Clock,
  FileCheck,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Bell,
  HardDrive,
  Key,
  BarChart3,
  AlertTriangle,
  Blocks,
  Plug,
  PlayCircle,
  Sparkles,
  ShieldCheck,
  BookOpen,
  CreditCard,
} from "lucide-react";
import { SettingsTour } from "@/components/settings-tour";

export type SettingsSection =
  | "general"
  | "team"
  | "roles"
  | "email"
  | "branding"
  | "time"
  | "compliance"
  | "certificates"
  | "notifications"
  | "storage-billing"
  | "modules"
  | "integrations"
  | "api-keys"
  | "api-analytics"
  | "rate-limit-alerts"
  | "api-documentation"
  | "setup-guide"
  | "payment-processors";

interface SettingsLayoutProps {
  currentSection: SettingsSection;
  onNavigate: (section: SettingsSection) => void;
  onBack: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ElementType;
  description: string;
}

interface NavCategory {
  title: string;
  items: NavItem[];
}

// Categorized settings navigation - organized by user journey
const settingsCategories: NavCategory[] = [
  {
    title: "Quick Start",
    items: [
      { id: "general", label: "General", icon: Settings, description: "Account and preferences" },
      { id: "setup-guide", label: "Setup Guide", icon: PlayCircle, description: "Complete your setup" },
    ],
  },
  {
    title: "Team & Access",
    items: [
      { id: "team", label: "Team Members", icon: Users, description: "Manage team members" },
      { id: "roles", label: "Roles & Permissions", icon: Shield, description: "Access control" },
    ],
  },
  {
    title: "Notifications",
    items: [
      { id: "notifications", label: "Alert Settings", icon: Bell, description: "Manage your alerts" },
      { id: "email", label: "Email Templates", icon: Mail, description: "Customize notifications" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { id: "integrations", label: "Email & SMS", icon: Plug, description: "SendGrid, Twilio, more" },
      { id: "payment-processors", label: "Payment Processors", icon: CreditCard, description: "Stripe, Square, more" },
    ],
  },
  {
    title: "Appearance",
    items: [
      { id: "branding", label: "Branding", icon: Palette, description: "Logo, colors, white-label" },
      { id: "time", label: "Time & Locale", icon: Clock, description: "Timezone and formats" },
    ],
  },
  {
    title: "Security",
    items: [
      { id: "compliance", label: "Compliance", icon: FileCheck, description: "Retention and security" },
      { id: "certificates", label: "Certificates", icon: ShieldCheck, description: "Signing certificates" },
    ],
  },
  {
    title: "Developer Tools",
    items: [
      { id: "api-keys", label: "API Keys", icon: Key, description: "Manage API access" },
      { id: "api-analytics", label: "API Analytics", icon: BarChart3, description: "Usage and performance" },
      { id: "rate-limit-alerts", label: "Rate Limits", icon: AlertTriangle, description: "Monitor API limits" },
      { id: "api-documentation", label: "API Docs", icon: BookOpen, description: "Developer reference" },
    ],
  },
  {
    title: "Billing",
    items: [
      { id: "storage-billing", label: "Storage & Usage", icon: HardDrive, description: "Usage and subscription" },
      { id: "modules", label: "Feature Modules", icon: Blocks, description: "Enable or disable features" },
    ],
  },
];

// Flatten for lookup
const allNavItems = settingsCategories.flatMap(cat => cat.items);

export function SettingsLayout({ currentSection, onNavigate, onBack, children }: SettingsLayoutProps) {
  const currentNav = allNavItems.find(n => n.id === currentSection);
  const [showTour, setShowTour] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleMobileNavigate = (section: SettingsSection) => {
    onNavigate(section);
    setMobileNavOpen(false);
  };

  return (
    <>
    <SettingsTour
      isOpen={showTour}
      onClose={() => setShowTour(false)}
      onComplete={() => setShowTour(false)}
    />
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4 h-14 sm:h-16">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center text-white shrink-0">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold truncate">Settings</h1>
                {currentNav && (
                  <p className="text-xs text-muted-foreground truncate hidden sm:block">{currentNav.description}</p>
                )}
              </div>
            </div>

            {/* Mobile section selector */}
            <button
              className="lg:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-sm shrink-0"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              data-testid="settings-mobile-nav-toggle"
            >
              {currentNav && (
                <>
                  <currentNav.icon className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                  <span className="max-w-[100px] truncate">{currentNav.label}</span>
                </>
              )}
              <ChevronDown className={cn("h-4 w-4 transition-transform", mobileNavOpen && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileNavOpen && (
        <div className="lg:hidden border-b bg-card/95 backdrop-blur-md shadow-lg z-10 max-h-[60vh] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-3 py-3">
            <div className="space-y-3">
              {settingsCategories.map((category) => (
                <div key={category.title}>
                  <h3 className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {category.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-1">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentSection === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleMobileNavigate(item.id)}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all mobile-touch-target",
                            isActive
                              ? "bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))] font-medium"
                              : "text-muted-foreground active:bg-muted/80"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate text-left">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col lg:flex-row gap-6">
          {/* Settings Navigation Sidebar - hidden on mobile, shown on desktop */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="space-y-5">
              {settingsCategories.map((category) => (
                <div key={category.title}>
                  <h3 className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {category.title}
                  </h3>
                  <div className="space-y-0.5">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentSection === item.id;

                      return (
                        <button
                          key={item.id}
                          data-tour={`settings-${item.id}`}
                          onClick={() => onNavigate(item.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group",
                            isActive
                              ? "bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))] font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                          )}
                        >
                          <Icon className={cn(
                            "h-4 w-4 shrink-0",
                            isActive && "text-[hsl(var(--pearsign-primary))]"
                          )} />
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {isActive && (
                            <ChevronRight className="h-4 w-4 opacity-50 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTour(true)}
              className="w-full mt-5 gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Take Settings Tour
            </Button>

            <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border/50">
              <h3 className="font-medium text-sm mb-1">Need help?</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Contact our support team for assistance with settings.
              </p>
              <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                <a href="mailto:info@pearsign.com">Contact Support</a>
              </Button>
            </div>
          </aside>

          {/* Main Content */}
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
