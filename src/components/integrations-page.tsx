"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  Search,
  Settings,
  ExternalLink,
  Key,
  Book,
  Code,
  MessageSquare,
  HardDrive,
  Cloud,
  Zap,
  FolderOpen,
  Target,
  Grid3X3,
  ArrowRight,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  Unplug,
  RefreshCw,
  Users,
  FileText,
  Sparkles,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  configFields: string[];
  connected: boolean;
  lastTestedAt: string | null;
  testStatus: string | null;
  connectedAt: string | null;
}

// Icon mapping for each integration
const integrationIcons: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  // AI Integrations
  openai: {
    icon: Sparkles,
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  anthropic: {
    icon: Bot,
    bg: "bg-amber-100 dark:bg-amber-900/30",
    color: "text-amber-600 dark:text-amber-400",
  },
  // Other integrations
  slack: {
    icon: MessageSquare,
    bg: "bg-purple-100 dark:bg-purple-900/30",
    color: "text-purple-600 dark:text-purple-400",
  },
  "google-drive": {
    icon: HardDrive,
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    color: "text-yellow-600 dark:text-yellow-500",
  },
  salesforce: {
    icon: Cloud,
    bg: "bg-blue-100 dark:bg-blue-900/30",
    color: "text-blue-600 dark:text-blue-400",
  },
  zapier: {
    icon: Zap,
    bg: "bg-orange-100 dark:bg-orange-900/30",
    color: "text-orange-600 dark:text-orange-400",
  },
  dropbox: {
    icon: FolderOpen,
    bg: "bg-blue-100 dark:bg-blue-900/30",
    color: "text-blue-600 dark:text-blue-400",
  },
  hubspot: {
    icon: Target,
    bg: "bg-orange-100 dark:bg-orange-900/30",
    color: "text-orange-600 dark:text-orange-400",
  },
  "microsoft-teams": {
    icon: Users,
    bg: "bg-indigo-100 dark:bg-indigo-900/30",
    color: "text-indigo-600 dark:text-indigo-400",
  },
  notion: {
    icon: FileText,
    bg: "bg-gray-100 dark:bg-gray-800",
    color: "text-gray-700 dark:text-gray-300",
  },
};

// Config field labels and types
const configFieldMeta: Record<string, { label: string; type: string; placeholder: string; options?: string[]; description?: string }> = {
  webhookUrl: { label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/..." },
  channel: { label: "Channel", type: "text", placeholder: "#general" },
  folderId: { label: "Folder ID", type: "text", placeholder: "Enter Google Drive folder ID" },
  autoSave: { label: "Auto-save completed documents", type: "checkbox", placeholder: "" },
  instanceUrl: { label: "Instance URL", type: "url", placeholder: "https://yourcompany.salesforce.com" },
  accessToken: { label: "Access Token", type: "password", placeholder: "Enter access token" },
  folderPath: { label: "Folder Path", type: "text", placeholder: "/PearSign/Signed Documents" },
  apiKey: { label: "API Key", type: "password", placeholder: "Enter API key (sk-...)", description: "Your API key from the provider's dashboard" },
  portalId: { label: "Portal ID", type: "text", placeholder: "Enter HubSpot portal ID" },
  databaseId: { label: "Database ID", type: "text", placeholder: "Enter Notion database ID" },
  model: { label: "Model", type: "select", placeholder: "Select model", options: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"], description: "Choose the AI model for document generation" },
};

// Model options by provider
const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string; description: string }>> = {
  openai: [
    { value: "gpt-4", label: "GPT-4", description: "Most capable, best for complex documents" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Faster, updated knowledge" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", description: "Fast and cost-effective" },
  ],
  anthropic: [
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus", description: "Most powerful, best quality" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet", description: "Balanced performance" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku", description: "Fastest, most economical" },
  ],
};

const categories = ["All", "AI", "Communication", "Storage", "CRM", "Automation", "Productivity"];

import { useTenant } from "@/contexts/tenant-context";

interface IntegrationsPageProps {
  onNavigateToSettings?: (section: string) => void;
}

export function IntegrationsPage({ onNavigateToSettings }: IntegrationsPageProps) {
  const { isDemo } = useTenant();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Dialog states
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/settings/integrations", {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setIntegrations(data.integrations);
      } else if (data.error === 'Unauthorized') {
        setError('sign_in_required');
      } else {
        setError(data.error || 'Failed to load integrations');
      }
    } catch (err) {
      console.error("Failed to load integrations:", err);
      setError('Failed to load integrations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();

    // Check for OAuth callback results in URL
    const urlParams = new URLSearchParams(window.location.search);
    const integration = urlParams.get("integration");
    const success = urlParams.get("success");
    const error = urlParams.get("error");

    if (integration) {
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);

      if (success === "true") {
        // Show success message
        setTestResult({
          success: true,
          message: `${integration.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())} connected successfully!`
        });
        // Reload integrations to show updated status
        loadIntegrations();
      } else if (error) {
        setTestResult({
          success: false,
          message: `Failed to connect: ${error.replace(/_/g, " ")}`
        });
      }
    }
  }, [loadIntegrations]);

  const connectedIntegrations = integrations.filter((i) => i.connected);
  const availableIntegrations = integrations.filter((i) => {
    const matchesSearch =
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || i.category === selectedCategory;
    return !i.connected && matchesSearch && matchesCategory;
  });

  // Integrations that use OAuth flow
  const oauthIntegrations = ["google-drive", "dropbox", "salesforce"];

  const handleConnectClick = async (integration: Integration) => {
    // Check if this integration uses OAuth
    if (oauthIntegrations.includes(integration.id)) {
      // For Google Drive, initiate OAuth flow
      if (integration.id === "google-drive") {
        try {
          const response = await fetch("/api/settings/integrations/google-drive/auth");
          const data = await response.json();
          if (data.success && data.authUrl) {
            // Redirect to Google OAuth
            window.location.href = data.authUrl;
            return;
          } else {
            // Show error - OAuth not configured
            setSelectedIntegration(integration);
            setTestResult({ success: false, message: data.message || "OAuth not configured. Please set up Google API credentials." });
            setConnectDialogOpen(true);
            return;
          }
        } catch (error) {
          console.error("Failed to start OAuth:", error);
        }
      }

      // For Dropbox, initiate OAuth flow
      if (integration.id === "dropbox") {
        try {
          const response = await fetch("/api/settings/integrations/dropbox/auth");
          const data = await response.json();
          if (data.success && data.authUrl) {
            // Redirect to Dropbox OAuth
            window.location.href = data.authUrl;
            return;
          } else {
            // Show error - OAuth not configured
            setSelectedIntegration(integration);
            setTestResult({ success: false, message: data.message || "OAuth not configured. Please set up Dropbox API credentials." });
            setConnectDialogOpen(true);
            return;
          }
        } catch (error) {
          console.error("Failed to start OAuth:", error);
        }
      }

      // For Salesforce, initiate OAuth flow
      if (integration.id === "salesforce") {
        try {
          const response = await fetch("/api/settings/integrations/salesforce/auth");
          const data = await response.json();
          if (data.success && data.authUrl) {
            // Redirect to Salesforce OAuth
            window.location.href = data.authUrl;
            return;
          } else {
            // Show error - OAuth not configured
            setSelectedIntegration(integration);
            setTestResult({ success: false, message: data.message || "OAuth not configured. Please set up Salesforce Connected App credentials." });
            setConnectDialogOpen(true);
            return;
          }
        } catch (error) {
          console.error("Failed to start OAuth:", error);
        }
      }

      // For other OAuth integrations without direct OAuth support, show manual config
      setSelectedIntegration(integration);
      setTestResult({ success: false, message: `${integration.name} OAuth sign-in is not yet available. You can configure this integration manually using the API credentials below.` });
      setConfigValues({});
      setConnectDialogOpen(true);
      return;
    }

    // For non-OAuth integrations, show config dialog
    setSelectedIntegration(integration);
    setConfigValues({});
    setTestResult(null);
    setConnectDialogOpen(true);
  };

  const handleConfigureClick = async (integration: Integration) => {
    setSelectedIntegration(integration);
    setTestResult(null);

    // Load existing config
    try {
      const response = await fetch(`/api/settings/integrations/${integration.id}`);
      const data = await response.json();
      if (data.success && data.data.config) {
        setConfigValues(data.data.config);
      } else {
        setConfigValues({});
      }
    } catch {
      setConfigValues({});
    }

    setConfigDialogOpen(true);
  };

  const handleConnect = async () => {
    if (!selectedIntegration) return;

    setConnecting(true);
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: selectedIntegration.id,
          action: "connect",
          config: configValues,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadIntegrations();
        setConnectDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to connect integration:", error);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (integration: Integration) => {
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: integration.id,
          action: "disconnect",
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadIntegrations();
        setConfigDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to disconnect integration:", error);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedIntegration) return;

    setConnecting(true);
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: selectedIntegration.id,
          action: "update",
          config: configValues,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadIntegrations();
        setConfigDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedIntegration) return;

    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/settings/integrations/${selectedIntegration.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: configValues }),
      });

      const data = await response.json();
      setTestResult({ success: data.success, message: data.message || data.error });
    } catch (error) {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  const renderConfigFields = () => {
    if (!selectedIntegration) return null;

    return selectedIntegration.configFields.map((field) => {
      const meta = configFieldMeta[field] || { label: field, type: "text", placeholder: "" };

      if (meta.type === "checkbox") {
        return (
          <div key={field} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={field}
              checked={configValues[field] === "true"}
              onChange={(e) =>
                setConfigValues((prev) => ({ ...prev, [field]: e.target.checked ? "true" : "false" }))
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={field}>{meta.label}</Label>
          </div>
        );
      }

      // Special handling for model selection in AI integrations
      if (field === "model" && (selectedIntegration.id === "openai" || selectedIntegration.id === "anthropic")) {
        const modelOptions = MODEL_OPTIONS[selectedIntegration.id] || [];
        return (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{meta.label}</Label>
            <select
              id={field}
              value={configValues[field] || ""}
              onChange={(e) => setConfigValues((prev) => ({ ...prev, [field]: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a model...</option>
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
            {meta.description && (
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            )}
          </div>
        );
      }

      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{meta.label}</Label>
          <Input
            id={field}
            type={meta.type}
            placeholder={meta.placeholder}
            value={configValues[field] || ""}
            onChange={(e) => setConfigValues((prev) => ({ ...prev, [field]: e.target.value }))}
          />
          {meta.description && (
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          )}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show sign-in required message for demo mode users
  if (isDemo || error === 'sign_in_required') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-normal text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect PearSign with your favorite tools and services
          </p>
        </div>

        {/* Sign in required card */}
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <Key className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Sign in to Configure Integrations</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Create an account or sign in to connect AI providers like OpenAI and Claude,
            cloud storage, CRM systems, and more.
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => window.location.href = '/login'}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/login'}
            >
              Create Account
            </Button>
          </div>
        </div>

        {/* Preview of available integrations */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Available Integrations Preview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
            {[
              { id: 'openai', name: 'OpenAI', description: 'GPT-4 for AI document generation', icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-100' },
              { id: 'anthropic', name: 'Anthropic Claude', description: 'Claude for intelligent drafting', icon: Bot, color: 'text-amber-600', bg: 'bg-amber-100' },
              { id: 'slack', name: 'Slack', description: 'Document signing notifications', icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-100' },
              { id: 'google-drive', name: 'Google Drive', description: 'Auto-save signed documents', icon: HardDrive, color: 'text-yellow-600', bg: 'bg-yellow-100' },
              { id: 'salesforce', name: 'Salesforce', description: 'CRM integration', icon: Cloud, color: 'text-blue-600', bg: 'bg-blue-100' },
              { id: 'zapier', name: 'Zapier', description: 'Connect to 5,000+ apps', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-100' },
            ].map((integration) => {
              const Icon = integration.icon;
              return (
                <div
                  key={integration.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card"
                >
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", integration.bg)}>
                    <Icon className={cn("h-5 w-5", integration.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Sign in to unlock all integrations and connect your AI providers
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-normal text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect PearSign with your favorite tools and services
        </p>
      </div>

      {/* Connected Integrations */}
      {connectedIntegrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Connected ({connectedIntegrations.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectedIntegrations.map((integration) => {
              const iconConfig = integrationIcons[integration.id] || {
                icon: Grid3X3,
                bg: "bg-gray-100",
                color: "text-gray-600",
              };
              const Icon = iconConfig.icon;

              return (
                <div
                  key={integration.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      iconConfig.bg
                    )}
                  >
                    <Icon className={cn("h-5 w-5", iconConfig.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{integration.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Check className="h-3 w-3" />
                        Connected
                      </span>
                      {integration.testStatus === "success" && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {integration.testStatus === "failed" && (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{integration.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9 rounded-full"
                    onClick={() => handleConfigureClick(integration)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Available integrations
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-lg"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                selectedCategory === category
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {availableIntegrations.map((integration) => {
            const iconConfig = integrationIcons[integration.id] || {
              icon: Grid3X3,
              bg: "bg-gray-100",
              color: "text-gray-600",
            };
            const Icon = iconConfig.icon;

            return (
              <button
                key={integration.id}
                onClick={() => handleConnectClick(integration)}
                className="group flex items-start gap-4 p-4 rounded-lg border border-border bg-card text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    iconConfig.bg
                  )}
                >
                  <Icon className={cn("h-5 w-5", iconConfig.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{integration.name}</h3>
                    <Plus className="h-4 w-4 text-muted-foreground/50 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{integration.description}</p>
                  <span className="inline-block mt-2 text-xs text-muted-foreground">
                    {integration.category}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty State */}
        {availableIntegrations.length === 0 && !loading && (
          <div className="text-center py-12 rounded-lg border border-dashed border-border">
            <Grid3X3 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No integrations found</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
              }}
              className="text-sm text-blue-600 hover:underline mt-1"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Developer API Section */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Code className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground mb-1">Developer API</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Build custom integrations with our REST API. Access documentation, SDKs, and code examples.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => onNavigateToSettings?.("api-documentation")}
                data-testid="button-api-documentation"
              >
                <Book className="mr-2 h-4 w-4" />
                Documentation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigateToSettings?.("api-keys")}
                data-testid="button-api-keys"
              >
                <Key className="mr-2 h-4 w-4" />
                API Keys
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Request Integration */}
      <div className="rounded-lg border border-dashed border-border p-5 text-center">
        <p className="text-sm text-muted-foreground mb-2">Need an integration we don't have?</p>
        <Button variant="link" className="text-blue-600 hover:text-blue-700 p-0 h-auto">
          Request an integration
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedIntegration && (
                <>
                  {(() => {
                    const iconConfig = integrationIcons[selectedIntegration.id];
                    const Icon = iconConfig?.icon || Grid3X3;
                    return (
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          iconConfig?.bg || "bg-gray-100"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", iconConfig?.color || "text-gray-600")} />
                      </div>
                    );
                  })()}
                  Connect {selectedIntegration.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">{renderConfigFields()}</div>

          {testResult && (
            <div
              className={cn(
                "p-3 rounded-lg text-sm flex items-center gap-2",
                testResult.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              )}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
            <Button onClick={handleConnect} disabled={connecting} className="bg-blue-600 hover:bg-blue-700">
              {connecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedIntegration && (
                <>
                  {(() => {
                    const iconConfig = integrationIcons[selectedIntegration.id];
                    const Icon = iconConfig?.icon || Grid3X3;
                    return (
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          iconConfig?.bg || "bg-gray-100"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", iconConfig?.color || "text-gray-600")} />
                      </div>
                    );
                  })()}
                  Configure {selectedIntegration.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Update settings or disconnect this integration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">{renderConfigFields()}</div>

          {testResult && (
            <div
              className={cn(
                "p-3 rounded-lg text-sm flex items-center gap-2",
                testResult.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              )}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => selectedIntegration && handleDisconnect(selectedIntegration)}
            >
              <Unplug className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Test
              </Button>
              <Button onClick={handleSaveConfig} disabled={connecting} className="bg-blue-600 hover:bg-blue-700">
                {connecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
