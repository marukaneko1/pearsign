"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Key,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Send,
  RefreshCw,
  AlertTriangle,
  Zap,
  ExternalLink,
  Webhook,
  Phone,
  MessageSquare,
  Shield,
} from "lucide-react";
import { WebhooksSettings } from "@/components/webhooks-settings";

interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  platformFallbackEnabled: boolean;
  hasCredentials: boolean;
  status: "connected" | "not_configured" | "invalid";
  lastTestedAt: string | null;
  testStatus: "success" | "failed" | null;
}

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  enabled: boolean;
  platformFallbackEnabled: boolean;
  hasCredentials: boolean;
  status: "connected" | "not_configured" | "pending";
  dailyLimit: number;
  monthlyLimit: number;
  perEnvelopeLimit: number;
}

interface TwilioUsage {
  today: number;
  thisMonth: number;
}

export function IntegrationsSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  const [config, setConfig] = useState<SendGridConfig>({
    apiKey: "",
    fromEmail: "",
    fromName: "PearSign",
    enabled: false,
    platformFallbackEnabled: false,
    hasCredentials: false,
    status: "not_configured",
    lastTestedAt: null,
    testStatus: null,
  });

  // Twilio state
  const [twilioLoading, setTwilioLoading] = useState(true);
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioTesting, setTwilioTesting] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>({
    accountSid: "",
    authToken: "",
    phoneNumber: "",
    enabled: false,
    platformFallbackEnabled: false,
    hasCredentials: false,
    status: "not_configured",
    dailyLimit: 100,
    monthlyLimit: 1000,
    perEnvelopeLimit: 5,
  });
  const [twilioUsage, setTwilioUsage] = useState<TwilioUsage>({
    today: 0,
    thisMonth: 0,
  });

  useEffect(() => {
    loadConfig();
    loadTwilioSettings();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/integrations/sendgrid");
      if (response.ok) {
        const data = await response.json();
        setConfig({
          apiKey: data.data?.apiKey || "",
          fromEmail: data.data?.fromEmail || "",
          fromName: data.data?.fromName || "PearSign",
          enabled: data.data?.enabled || false,
          platformFallbackEnabled: data.data?.platformFallbackEnabled || false,
          hasCredentials: data.data?.hasCredentials || false,
          status: data.data?.status || "not_configured",
          lastTestedAt: data.data?.lastTestedAt || null,
          testStatus: data.data?.testStatus || null,
        });
      }
    } catch (error) {
      console.error("Error loading config:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load Twilio settings
  const loadTwilioSettings = async () => {
    try {
      setTwilioLoading(true);
      const response = await fetch('/api/settings/twilio');
      const data = await response.json();

      if (data.success) {
        setTwilioConfig({
          accountSid: data.settings.accountSid || "",
          authToken: data.settings.authToken || "",
          phoneNumber: data.settings.phoneNumber || "",
          enabled: data.settings.enabled || false,
          platformFallbackEnabled: data.settings.platformFallbackEnabled || false,
          hasCredentials: data.settings.hasCredentials || false,
          status: data.settings.status || "not_configured",
          dailyLimit: data.settings.dailyLimit || 100,
          monthlyLimit: data.settings.monthlyLimit || 1000,
          perEnvelopeLimit: data.settings.perEnvelopeLimit || 5,
        });
        setTwilioUsage(data.usage || { today: 0, thisMonth: 0 });
      }
    } catch (error) {
      console.error('Failed to load Twilio settings:', error);
    } finally {
      setTwilioLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.apiKey || !config.fromEmail) {
      toast({
        title: "Missing fields",
        description: "API Key and From Email are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings/integrations/sendgrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error("Failed to save");

      toast({
        title: "Settings saved",
        description: "SendGrid configuration has been updated",
      });
    } catch (error) {
      toast({
        title: "Error saving",
        description: "Failed to save SendGrid configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!config.apiKey || !config.fromEmail) {
      toast({
        title: "Missing configuration",
        description: "Please enter API Key and From Email first",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    setLastError(null);
    try {
      const response = await fetch("/api/settings/integrations/sendgrid/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.apiKey,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          toEmail: testRecipientEmail || config.fromEmail,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConfig(prev => ({
          ...prev,
          lastTestedAt: new Date().toISOString(),
          testStatus: "success",
        }));
        setLastError(null);
        toast({
          title: "Test successful!",
          description: data.message || "A test email has been sent. Check your inbox.",
        });
      } else {
        setConfig(prev => ({
          ...prev,
          lastTestedAt: new Date().toISOString(),
          testStatus: "failed",
        }));
        const errorMsg = data.error || "Failed to send test email";
        setLastError(errorMsg);
        toast({
          title: "Test failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Could not connect to SendGrid";
      setLastError(errorMsg);
      toast({
        title: "Test failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 10) return "••••••••••";
    return key.substring(0, 5) + "••••••••••" + key.substring(key.length - 4);
  };

  const handleSaveTwilioSettings = async () => {
    setTwilioSaving(true);
    try {
      const response = await fetch('/api/settings/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: twilioConfig.accountSid,
          authToken: twilioConfig.authToken,
          phoneNumber: twilioConfig.phoneNumber,
          enabled: twilioConfig.enabled,
          platformFallbackEnabled: twilioConfig.platformFallbackEnabled,
          dailyLimit: twilioConfig.dailyLimit,
          monthlyLimit: twilioConfig.monthlyLimit,
          perEnvelopeLimit: twilioConfig.perEnvelopeLimit,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Settings saved",
          description: "Twilio SMS settings have been updated.",
        });
        loadTwilioSettings();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save settings",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save Twilio settings",
        variant: "destructive",
      });
    } finally {
      setTwilioSaving(false);
    }
  };

  const handleTestTwilio = async () => {
    if (!testPhoneNumber) {
      toast({
        title: "Phone number required",
        description: "Enter a phone number to send a test SMS",
        variant: "destructive",
      });
      return;
    }

    setTwilioTesting(true);
    try {
      const formattedPhone = testPhoneNumber.startsWith('+')
        ? testPhoneNumber
        : '+1' + testPhoneNumber.replace(/\D/g, '');

      const response = await fetch('/api/settings/twilio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testPhone: formattedPhone }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Test SMS sent!",
          description: `Check ${formattedPhone} for the test message.`,
        });
      } else {
        toast({
          title: "Test failed",
          description: data.error || "Failed to send test SMS",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to test Twilio connection",
        variant: "destructive",
      });
    } finally {
      setTwilioTesting(false);
    }
  };

  const handleRemoveTwilioSettings = async () => {
    try {
      await fetch('/api/settings/twilio', { method: 'DELETE' });
      setTwilioConfig({
        accountSid: "",
        authToken: "",
        phoneNumber: "",
        enabled: false,
        platformFallbackEnabled: false,
        hasCredentials: false,
        status: "not_configured",
        dailyLimit: 100,
        monthlyLimit: 1000,
        perEnvelopeLimit: 5,
      });
      toast({
        title: "Settings removed",
        description: "Twilio configuration has been removed.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove settings",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground">
          Connect external services to enable email notifications and more
        </p>
      </div>

      {/* SendGrid Card */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[#1A82E2]/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#1A82E2] flex items-center justify-center shadow-lg">
                <Mail className="h-7 w-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  SendGrid
                  {config.enabled && config.testStatus === "success" && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                  {config.enabled && config.testStatus === "failed" && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  )}
                  {!config.enabled && (
                    <Badge variant="secondary">Not Configured</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Send transactional emails for signature requests, reminders, and notifications
                </CardDescription>
              </div>
            </div>
            <a
              href="https://app.sendgrid.com/settings/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#1A82E2] hover:underline flex items-center gap-1"
            >
              Get API Key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.enabled ? "bg-gradient-to-br from-[#1A82E2] to-blue-600" : "bg-muted"}`}>
                <Zap className={`h-5 w-5 ${config.enabled ? "text-white" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-medium">Enable SendGrid</p>
                <p className="text-sm text-muted-foreground">
                  Turn on email sending via SendGrid
                </p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          {/* Platform Fallback Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-dashed">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.platformFallbackEnabled ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-muted"}`}>
                <Shield className={`h-5 w-5 ${config.platformFallbackEnabled ? "text-white" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-medium">Platform Fallback</p>
                <p className="text-sm text-muted-foreground">
                  Use platform credentials if your own are not configured
                </p>
              </div>
            </div>
            <Switch
              checked={config.platformFallbackEnabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, platformFallbackEnabled: checked }))}
            />
          </div>

          <Separator />

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              API Key
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="pr-20 font-mono text-sm h-11"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your SendGrid API key starting with "SG."
            </p>
          </div>

          {/* From Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                From Email
              </Label>
              <Input
                id="from-email"
                type="email"
                value={config.fromEmail}
                onChange={(e) => setConfig(prev => ({ ...prev, fromEmail: e.target.value }))}
                placeholder="noreply@yourdomain.com"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Must be a verified sender in SendGrid
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-name">From Name</Label>
              <Input
                id="from-name"
                type="text"
                value={config.fromName}
                onChange={(e) => setConfig(prev => ({ ...prev, fromName: e.target.value }))}
                placeholder="PearSign"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Display name for sent emails
              </p>
            </div>
          </div>

          {/* Warning if not configured */}
          {!config.apiKey && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Email sending is disabled
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Without SendGrid configuration, signature request emails, reminders, and notifications
                    will not be sent. Users will still be able to sign documents via direct links.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Test Recipient Email */}
          <div className="space-y-2">
            <Label htmlFor="test-recipient" className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              Test Recipient Email (optional)
            </Label>
            <Input
              id="test-recipient"
              type="email"
              value={testRecipientEmail}
              onChange={(e) => setTestRecipientEmail(e.target.value)}
              placeholder={config.fromEmail || "Leave empty to send to From Email"}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Enter an email to receive the test, or leave empty to send to your From Email address.
            </p>
          </div>

          {/* Last Error Display */}
          {lastError && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Last Error
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {lastError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Test Status */}
          {config.lastTestedAt && (
            <div className={`p-4 rounded-xl border ${
              config.testStatus === "success"
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {config.testStatus === "success" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${
                      config.testStatus === "success" ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
                    }`}>
                      {config.testStatus === "success" ? "Connection verified" : "Connection failed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last tested: {new Date(config.lastTestedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={testing || !config.apiKey || !config.fromEmail}
              className="gap-2"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Test Email
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Twilio SMS Verification Card */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <MessageSquare className="h-7 w-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Twilio SMS
                  {twilioConfig.enabled && twilioConfig.hasCredentials && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                  {!twilioConfig.hasCredentials && (
                    <Badge variant="secondary">Not Configured</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Send OTP verification codes via SMS for 2FA phone verification
                </CardDescription>
              </div>
            </div>
            <a
              href="https://console.twilio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 hover:underline flex items-center gap-1"
            >
              Get Credentials
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {twilioLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${twilioConfig.enabled ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-muted"}`}>
                    <Phone className={`h-5 w-5 ${twilioConfig.enabled ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="font-medium">Enable SMS Verification</p>
                    <p className="text-sm text-muted-foreground">
                      Allow 2FA phone verification for document signing
                    </p>
                  </div>
                </div>
                <Switch
                  checked={twilioConfig.enabled}
                  onCheckedChange={(checked) => setTwilioConfig(prev => ({ ...prev, enabled: checked }))}
                />
              </div>

              {/* Platform Fallback Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-dashed">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${twilioConfig.platformFallbackEnabled ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-muted"}`}>
                    <Shield className={`h-5 w-5 ${twilioConfig.platformFallbackEnabled ? "text-white" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="font-medium">Platform Fallback</p>
                    <p className="text-sm text-muted-foreground">
                      Use platform credentials if your own are not configured
                    </p>
                  </div>
                </div>
                <Switch
                  checked={twilioConfig.platformFallbackEnabled}
                  onCheckedChange={(checked) => setTwilioConfig(prev => ({ ...prev, platformFallbackEnabled: checked }))}
                />
              </div>

              {/* Usage Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="text-xl font-bold">
                    {twilioUsage.today}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{twilioConfig.dailyLimit}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">This Month</p>
                  <p className="text-xl font-bold">
                    {twilioUsage.thisMonth}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{twilioConfig.monthlyLimit}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Daily Limit</p>
                  <Input
                    type="number"
                    value={twilioConfig.dailyLimit}
                    onChange={(e) => setTwilioConfig(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) || 100 }))}
                    className="mt-1 h-8 text-sm"
                    min={1}
                    max={10000}
                  />
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Monthly Limit</p>
                  <Input
                    type="number"
                    value={twilioConfig.monthlyLimit}
                    onChange={(e) => setTwilioConfig(prev => ({ ...prev, monthlyLimit: parseInt(e.target.value) || 1000 }))}
                    className="mt-1 h-8 text-sm"
                    min={1}
                    max={100000}
                  />
                </div>
              </div>

              {/* Rate Limit Warning */}
              {(twilioUsage.today >= twilioConfig.dailyLimit * 0.8 || twilioUsage.thisMonth >= twilioConfig.monthlyLimit * 0.8) && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Approaching SMS limit
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        Consider increasing limits or reviewing usage patterns.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="twilio-sid" className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    Account SID
                  </Label>
                  <Input
                    id="twilio-sid"
                    type="text"
                    value={twilioConfig.accountSid}
                    onChange={(e) => setTwilioConfig(prev => ({ ...prev, accountSid: e.target.value }))}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="font-mono text-sm h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twilio-token" className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Auth Token
                  </Label>
                  <div className="relative">
                    <Input
                      id="twilio-token"
                      type={showTwilioToken ? "text" : "password"}
                      value={twilioConfig.authToken}
                      onChange={(e) => setTwilioConfig(prev => ({ ...prev, authToken: e.target.value }))}
                      placeholder="Enter auth token..."
                      className="pr-10 font-mono text-sm h-11"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowTwilioToken(!showTwilioToken)}
                    >
                      {showTwilioToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="twilio-phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Twilio Phone Number
                  </Label>
                  <Input
                    id="twilio-phone"
                    type="tel"
                    value={twilioConfig.phoneNumber}
                    onChange={(e) => setTwilioConfig(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="+15551234567"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    The phone number to send SMS from
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Per-Document Limit</Label>
                  <Input
                    type="number"
                    value={twilioConfig.perEnvelopeLimit}
                    onChange={(e) => setTwilioConfig(prev => ({ ...prev, perEnvelopeLimit: parseInt(e.target.value) || 5 }))}
                    className="h-11"
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum SMS per document (prevents abuse)
                  </p>
                </div>
              </div>

              {/* Warning if not configured */}
              {!twilioConfig.hasCredentials && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        SMS verification is in demo mode
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        Without Twilio configuration, OTP codes will be logged to the server console
                        instead of being sent via SMS. Add your Twilio credentials to enable real SMS delivery.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Test SMS Section */}
              {twilioConfig.hasCredentials && (
                <div className="space-y-2">
                  <Label htmlFor="test-phone" className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    Send Test SMS
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center justify-center px-3 bg-muted rounded-md border text-sm font-medium text-muted-foreground h-11 shrink-0">
                        +1
                      </div>
                      <Input
                        id="test-phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={testPhoneNumber}
                        onChange={(e) => setTestPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        maxLength={10}
                        className="h-11"
                      />
                    </div>
                    <Button
                      onClick={handleTestTwilio}
                      disabled={twilioTesting || !testPhoneNumber}
                      variant="outline"
                      className="gap-2"
                    >
                      {twilioTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Test
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handleRemoveTwilioSettings}
                  disabled={!twilioConfig.hasCredentials}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Remove Configuration
                </Button>

                <Button
                  onClick={handleSaveTwilioSettings}
                  disabled={twilioSaving}
                  className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600"
                >
                  {twilioSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Configuration
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Webhooks Section */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-500/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg">
              <Webhook className="h-7 w-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Outgoing Webhooks</CardTitle>
              <CardDescription>
                Receive real-time notifications when events occur in PearSign
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <WebhooksSettings />
        </CardContent>
      </Card>

      {/* Other Integrations Placeholder */}
      <Card className="border-border/50 border-dashed">
        <CardContent className="py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">More Integrations</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Visit the Integrations page in the sidebar to connect Slack, Google Drive, Zapier, and more.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
