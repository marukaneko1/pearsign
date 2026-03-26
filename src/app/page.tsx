"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { QuickActions } from "@/components/quick-actions";
import { QuickStats } from "@/components/quick-stats";
import { RecentDocuments } from "@/components/recent-documents";
import { SettingsPageContainer, type SettingsSection } from "@/components/settings";
import { MyDocumentsPage } from "@/components/my-documents-page";
import { TemplatesPage } from "@/components/templates-page";
import { SentRequestsPage } from "@/components/sent-requests-page";
import { ActivityPage } from "@/components/activity-page";
import { IntegrationsPage } from "@/components/integrations-page";
import { WebhooksPage } from "@/components/webhooks-page";
import { BulkSendPage } from "@/components/bulk-send-page";
import { FormsPage } from "@/components/forms-page";
import { FormBuilder } from "@/components/form-builder";
import { AIDocumentWizard } from "@/components/ai-document-wizard";
import { AIGeneratorPage } from "@/components/ai-generator-page";
import { InvoicesPage } from "@/components/invoices-page";
import { DocumentPrepareFlow } from "@/components/document-prepare-flow";
import { SelfSignFlow } from "@/components/self-sign-flow";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { SetupChecklist } from "@/components/setup-checklist";
import { ProductTour } from "@/components/product-tour";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useTenant } from "@/contexts/tenant-context";
import { envelopesApi, Envelope } from "@/lib/api-client";
import { sampleEnvelopes } from "@/lib/sample-data";
import { TenantAdminDashboard } from "@/components/tenant-admin-dashboard";
import { EmptyDashboardState, DemoModeBanner, NewTenantWelcome, SetupRequiredAlert } from "@/components/empty-tenant-state";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SignerGlobe } from "@/components/signer-globe";

type ViewType = "dashboard" | "documents" | "templates" | "sent" | "bulk-send" | "forms" | "form-builder" | "activity" | "integrations" | "webhooks" | "organization" | "settings" | "prepare-document" | "ai-generator" | "invoices";

export default function Home() {
  const { user, isLoading: authLoading, isLoggedIn, logout } = useAuth();
  const { isDemo, isLoading: tenantLoading } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      if (view && ["dashboard", "documents", "templates", "sent", "bulk-send", "forms", "form-builder", "activity", "integrations", "webhooks", "organization", "settings", "prepare-document", "ai-generator", "invoices"].includes(view)) {
        return view as ViewType;
      }
    }
    return "dashboard";
  });
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [showSelfSign, setShowSelfSign] = useState(false);
  const [selfSignFile, setSelfSignFile] = useState<File | null>(null);
  const [prepareDocumentFile, setPrepareDocumentFile] = useState<File | null>(null);
  const [prepareDocumentContent, setPrepareDocumentContent] = useState<{ content: string; title: string } | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [setupProgress, setSetupProgress] = useState<number>(0); // Start at 0 to show checklist

  // Product tour state
  const [showProductTour, setShowProductTour] = useState(false);

  // Settings section state
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const tabMap: Record<string, SettingsSection> = {
        general: "general",
        profile: "general",
        branding: "branding",
        team: "team",
        integrations: "integrations",
        compliance: "compliance",
        notifications: "notifications",
        "api-keys": "api-keys",
        "storage-billing": "storage-billing",
        billing: "storage-billing",
        certificates: "certificates",
      };
      if (tab && tabMap[tab]) return tabMap[tab];
    }
    return "general";
  });

  // User profile from database
  interface UserProfile {
    firstName: string;
    lastName: string;
    email: string;
  }
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Envelopes data
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [envelopesLoading, setEnvelopesLoading] = useState(false);

  // Track if this is a new tenant (first time setup)
  const [isNewTenant, setIsNewTenant] = useState(false);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/onboarding', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.success) {
        const hasCompleted = data.status?.hasCompletedOnboarding;
        setSetupProgress(hasCompleted ? 100 : (data.progress?.overallProgress || 0));

        const isFirstTimeUser = data.isFirstLogin || !hasCompleted;
        setIsNewTenant(isFirstTimeUser);

        // Don't auto-show walkthrough - user can open via help icon

        console.log('[Onboarding] Status:', {
          isFirstLogin: data.isFirstLogin,
          hasCompleted: data.status?.hasCompletedOnboarding,
          progress: data.progress?.overallProgress,
          showWalkthrough: data.shouldShowWalkthrough,
        });
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      // On error, assume new tenant and show onboarding
      setIsNewTenant(true);
      setSetupProgress(0);
    } finally {
      setOnboardingChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!tenantLoading && isLoggedIn && !onboardingChecked) {
      checkOnboardingStatus();
    }
  }, [tenantLoading, isLoggedIn, onboardingChecked, checkOnboardingStatus]);

  // Load envelopes - STRICT TENANT ISOLATION
  // Only demo mode shows sample data, authenticated tenants always see their own data
  const loadEnvelopes = useCallback(async () => {
    setEnvelopesLoading(true);
    try {
      // Always try to fetch real envelopes first from our API
      const response = await fetch('/api/envelopes', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.envelopes && data.envelopes.length > 0) {
        // Use real envelopes from the database - tenant-isolated
        setEnvelopes(data.envelopes as Envelope[]);
        console.log('[Dashboard] Loaded', data.envelopes.length, 'envelopes for tenant:', data.tenant?.id);
      } else {
        console.log('[Dashboard] No envelopes found - showing empty state');
        setEnvelopes([]);
      }
    } catch (error) {
      console.error("[Dashboard] Failed to load envelopes:", error);
      setEnvelopes([]);
    } finally {
      setEnvelopesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantLoading && isLoggedIn) {
      loadEnvelopes();
    }
  }, [tenantLoading, isLoggedIn, loadEnvelopes]);

  const loadUserProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/profile', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.firstName) {
          setUserProfile({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load user profile:", error);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadUserProfile();
    }
  }, [isLoggedIn, loadUserProfile]);

  // Listen for profile updates from Settings
  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent<{ firstName: string; lastName: string; email: string }>) => {
      setUserProfile({
        firstName: event.detail.firstName,
        lastName: event.detail.lastName,
        email: event.detail.email,
      });
    };

    window.addEventListener('profile-updated', handleProfileUpdate as EventListener);
    return () => {
      window.removeEventListener('profile-updated', handleProfileUpdate as EventListener);
    };
  }, []);

  // Listen for open onboarding walkthrough event (from Settings > Setup Guide)
  useEffect(() => {
    const handleOpenOnboarding = () => {
      setShowOnboarding(true);
      // Close settings to show walkthrough
      if (currentView === 'settings') {
        setCurrentView('dashboard');
      }
    };

    window.addEventListener('open-onboarding-walkthrough', handleOpenOnboarding);
    return () => {
      window.removeEventListener('open-onboarding-walkthrough', handleOpenOnboarding);
    };
  }, [currentView]);

  // Listen for open product tour event
  useEffect(() => {
    const handleOpenProductTour = () => {
      // Make sure we're on the dashboard for the tour
      if (currentView !== 'dashboard') {
        setCurrentView('dashboard');
      }
      // Small delay to ensure dashboard is rendered
      setTimeout(() => setShowProductTour(true), 100);
    };

    window.addEventListener('open-product-tour', handleOpenProductTour);
    return () => {
      window.removeEventListener('open-product-tour', handleOpenProductTour);
    };
  }, [currentView]);

  // Handle voiding a document
  const handleVoidDocument = async (envelopeId: string, reason: string) => {
    console.log("[Void] Starting void for envelope:", envelopeId);

    const response = await fetch("/api/envelopes/void", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelopeId, reason }),
    });

    console.log("[Void] Response status:", response.status);
    const result = await response.json();
    console.log("[Void] Response body:", result);

    if (!result.success) {
      console.error("Failed to void envelope:", result.error);
      throw new Error(result.error || "Failed to void envelope");
    }

    console.log("[Void] Success, refreshing envelopes");
    // Refresh envelopes list
    await loadEnvelopes();
  };

  const handleSendSuccess = (envelope: Envelope) => {
    setEnvelopes(prev => [envelope, ...prev]);
    setCurrentView('dashboard');
    setPrepareDocumentFile(null);
  };

  const handleStartPrepareDocument = (file?: File) => {
    setPrepareDocumentFile(file || null);
    setPrepareDocumentContent(null);
    setCurrentView('prepare-document');
  };

  const handleStartSelfSign = (file?: File) => {
    setSelfSignFile(file || null);
    setShowSelfSign(true);
  };

  const handleSendGeneratedDocument = (content: string, title: string) => {
    setPrepareDocumentContent({ content, title });
    setPrepareDocumentFile(null);
    setCurrentView('prepare-document');
  };

  // Handle navigation from notifications and onboarding
  const handleNotificationNavigate = (path: string) => {
    // Map URL paths to view types
    const pathToView: Record<string, ViewType> = {
      '/sent': 'sent',
      '/documents': 'documents',
      '/templates': 'templates',
      '/activity': 'activity',
      '/settings': 'settings',
      '/integrations': 'integrations',
      '/ai-generator': 'ai-generator',
      '/bulk-send': 'bulk-send',
      '/forms': 'forms',
      '/dashboard': 'dashboard',
      '/invoices': 'invoices',
    };

    // Check for exact match first
    if (pathToView[path]) {
      setCurrentView(pathToView[path]);
      return;
    }

    // Check for path prefixes (e.g., /envelopes/123 -> sent)
    if (path.startsWith('/envelopes') || path.startsWith('/sent')) {
      setCurrentView('sent');
      return;
    }
    if (path.startsWith('/templates')) {
      setCurrentView('templates');
      return;
    }
    if (path.startsWith('/settings')) {
      // Parse settings sub-paths
      if (path === '/settings/profile') {
        setSettingsSection('general');
      } else if (path === '/settings/billing') {
        setSettingsSection('storage-billing');
      } else if (path === '/settings/team') {
        setSettingsSection('team');
      } else if (path === '/settings/branding') {
        setSettingsSection('branding');
      } else if (path === '/settings/compliance') {
        setSettingsSection('compliance');
      } else if (path === '/settings/notifications') {
        setSettingsSection('notifications');
      } else if (path === '/settings/api-keys') {
        setSettingsSection('api-keys');
      } else if (path === '/settings/integrations') {
        // Go to integrations page directly
        setCurrentView('integrations');
        return;
      } else {
        setSettingsSection('general');
      }
      setCurrentView('settings');
      return;
    }
    if (path.startsWith('/invite')) {
      // Could open invite flow in the future
      setCurrentView('settings');
      return;
    }

    // Default to dashboard for unknown paths
    setCurrentView('dashboard');
  };

  // Handle onboarding close
  const handleOnboardingClose = () => {
    setShowOnboarding(false);

    setIsNewTenant(false);
    setOnboardingChecked(false);
    checkOnboardingStatus();
  };

  // Show loading state - wait for BOTH auth and tenant contexts to finish loading
  // This prevents a redirect loop where we redirect to login before the session is detected
  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <DashboardHeader
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        user={userProfile || user}
        onLogout={logout}
        demoMode={false}
        onToggleDemoMode={() => {
          // Demo mode is determined by tenant session
          // Redirect to onboarding if user wants to create real account
          window.location.href = '/onboarding';
        }}
        onNavigate={handleNotificationNavigate}
        onStartTour={() => setShowOnboarding(true)}
      />

      <div className="flex">
        {/* Sidebar */}
        <DashboardSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view as ViewType)}
          onNewDocument={() => handleStartPrepareDocument()}
        />

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6 pb-28 lg:pb-6 max-w-[1200px] mx-auto w-full overflow-x-hidden">
          {currentView === "dashboard" ? (
            <div className="space-y-3 sm:space-y-6">
              {/* Demo mode auth is handled by user avatar in header - no banner needed */}

              {/* New Tenant Welcome Card - Show for authenticated new tenants */}
              {isNewTenant && !showOnboarding && (
                <NewTenantWelcome
                  tenantName={userProfile?.firstName ? `${userProfile.firstName}'s Workspace` : 'Your Workspace'}
                  onGetStarted={() => setShowOnboarding(true)}
                  onSkip={async () => {
                    try {
                      await fetch('/api/tenant/onboarding', { method: 'DELETE' });
                    } catch (e) {}
                    setIsNewTenant(false);
                  }}
                />
              )}

              {/* Setup Checklist - Show for incomplete setup */}
              {setupProgress < 100 && !isNewTenant && (
                <SetupChecklist
                  variant="compact"
                  onNavigate={handleNotificationNavigate}
                  onOpenWalkthrough={() => setShowOnboarding(true)}
                  onStartTour={() => setShowProductTour(true)}
                />
              )}

              {/* Quick Actions */}
              <QuickActions
                onSendDocument={(file) => handleStartPrepareDocument(file)}
                onUploadAndSign={(file) => handleStartSelfSign(file)}
                onUseTemplate={() => setCurrentView('templates')}
              />

              {/* Stats */}
              <QuickStats onNavigate={(view) => setCurrentView(view as ViewType)} />

              {/* Signer Globe */}
              <SignerGlobe />

              {/* Recent Documents - or Empty State for new tenants */}
              {envelopes.length === 0 && !envelopesLoading && isNewTenant ? (
                <EmptyDashboardState
                  onSendDocument={() => handleStartPrepareDocument()}
                  onCreateTemplate={() => setCurrentView('templates')}
                  onOpenOnboarding={() => setShowOnboarding(true)}
                />
              ) : (
                <RecentDocuments
                  envelopes={envelopes}
                  loading={envelopesLoading}
                  onViewAll={() => setCurrentView('sent')}
                />
              )}
            </div>
          ) : currentView === "documents" ? (
            <MyDocumentsPage />
          ) : currentView === "templates" ? (
            <TemplatesPage
              onCreateFusionForm={(template) => {
                setEditingFormId(`template-${template.id}`);
                setCurrentView('form-builder');
              }}
            />
          ) : currentView === "sent" ? (
            <SentRequestsPage envelopes={envelopes} loading={envelopesLoading} onRefresh={loadEnvelopes} onVoidDocument={handleVoidDocument} />
          ) : currentView === "bulk-send" ? (
            <BulkSendPage />
          ) : currentView === "forms" ? (
            <FormsPage
              onCreateForm={() => {
                setEditingFormId(null);
                setCurrentView('form-builder');
              }}
              onEditForm={(formId) => {
                setEditingFormId(formId);
                setCurrentView('form-builder');
              }}
            />
          ) : currentView === "activity" ? (
            <ActivityPage />
          ) : currentView === "integrations" ? (
            <IntegrationsPage onNavigateToSettings={(section) => {
              setSettingsSection(section as SettingsSection);
              setCurrentView('settings');
            }} />
          ) : currentView === "webhooks" ? (
            <WebhooksPage />
          ) : currentView === "organization" ? (
            <TenantAdminDashboard />
          ) : currentView === "ai-generator" ? (
            <AIGeneratorPage onSendForSignature={handleSendGeneratedDocument} />
          ) : currentView === "invoices" ? (
            <InvoicesPage />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">This page is coming soon!</p>
            </div>
          )}
        </main>
      </div>

      {/* Onboarding Walkthrough */}
      {showOnboarding && (
        <OnboardingWalkthrough
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onNavigate={(path) => {
            handleOnboardingClose();
            handleNotificationNavigate(path);
          }}
          onStartTour={() => {
            handleOnboardingClose();
            setTimeout(() => setShowProductTour(true), 300);
          }}
        />
      )}

      {/* Product Tour */}
      <ProductTour
        isOpen={showProductTour}
        onClose={() => setShowProductTour(false)}
        onComplete={() => setShowProductTour(false)}
      />

      {/* AI Document Wizard Dialog */}
      <Dialog open={showAIWizard} onOpenChange={setShowAIWizard}>
        <DialogContent className="max-w-4xl h-[90vh] p-0" aria-describedby="ai-wizard-description">
          <span id="ai-wizard-description" className="sr-only">
            AI-powered document generation wizard
          </span>
          <AIDocumentWizard onClose={() => setShowAIWizard(false)} />
        </DialogContent>
      </Dialog>

      {/* Self Sign Flow */}
      <SelfSignFlow
        open={showSelfSign}
        onOpenChange={(open) => {
          setShowSelfSign(open);
          if (!open) setSelfSignFile(null);
        }}
        initialFile={selfSignFile || undefined}
      />

      {/* Full-screen Document Prepare Flow */}
      {currentView === 'prepare-document' && (
        <DocumentPrepareFlow
          onClose={() => {
            setCurrentView('dashboard');
            setPrepareDocumentFile(null);
            setPrepareDocumentContent(null);
          }}
          onSuccess={handleSendSuccess}
          initialFile={prepareDocumentFile || undefined}
          initialContent={prepareDocumentContent || undefined}
        />
      )}

      {/* Full-screen Form Builder */}
      {currentView === 'form-builder' && (
        <FormBuilder
          formId={editingFormId || undefined}
          onClose={() => {
            setCurrentView('forms');
            setEditingFormId(null);
          }}
          onSave={() => {
            setCurrentView('forms');
            setEditingFormId(null);
          }}
        />
      )}

      {/* Full-screen Settings */}
      {currentView === 'settings' && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <SettingsPageContainer
            onClose={() => setCurrentView('dashboard')}
            initialSection={settingsSection}
          />
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {currentView !== 'settings' && currentView !== 'prepare-document' && currentView !== 'form-builder' && (
        <MobileBottomNav
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view as ViewType)}
          onNewDocument={() => handleStartPrepareDocument()}
        />
      )}
    </div>
  );
}
