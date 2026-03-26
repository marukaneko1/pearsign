"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Shield,
  FileCheck,
  Clock,
  Trash2,
  MapPin,
  Key,
  AlertTriangle,
  Save,
  Loader2,
  Info,
  Database,
  Lock,
  Globe,
} from "lucide-react";
import {
  settingsApi,
  type ComplianceSettings as ComplianceType,
} from "@/lib/settings-api";

const retentionPolicies = [
  { value: "forever", label: "Keep forever", description: "Documents are never automatically deleted" },
  { value: "1_year", label: "1 year", description: "Documents deleted after 1 year" },
  { value: "3_years", label: "3 years", description: "Documents deleted after 3 years" },
  { value: "5_years", label: "5 years", description: "Documents deleted after 5 years" },
  { value: "7_years", label: "7 years", description: "Documents deleted after 7 years (recommended for tax records)" },
];

const auditTrailOptions = [
  { value: "attached", label: "Attached to PDF", description: "Audit trail is appended as additional pages in the signed PDF" },
  { value: "separate", label: "Separate Download", description: "Audit trail is available as a separate PDF download" },
  { value: "both", label: "Both", description: "Audit trail is attached and also available separately" },
];

const dataResidencyOptions = [
  { value: "us", label: "United States", flag: "🇺🇸", description: "Data stored in US data centers" },
  { value: "eu", label: "European Union", flag: "🇪🇺", description: "GDPR compliant, EU data centers" },
  { value: "ap", label: "Asia Pacific", flag: "🌏", description: "Data stored in Singapore" },
];

type ExtendedComplianceSettings = ComplianceType & {
  auditTrailEnabled: boolean;
  auditTrailMode: string;
};

export function ComplianceSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ComplianceType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showRetentionWarning, setShowRetentionWarning] = useState(false);
  const [pendingRetentionChange, setPendingRetentionChange] = useState<ComplianceType["retentionPolicy"] | null>(null);

  const [formData, setFormData] = useState<ExtendedComplianceSettings>({
    retentionPolicy: "forever",
    autoDeleteEnabled: false,
    requireTwoFactor: false,
    ipRestrictions: [],
    auditLogRetention: "forever",
    dataResidency: "us",
    auditTrailEnabled: true,
    auditTrailMode: "attached",
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getCompliance();
      setSettings(data);
      // Merge with audit trail defaults
      setFormData(prev => ({
        ...prev,
        ...data,
      }));
    } catch (error) {
      toast({
        title: "Error loading settings",
        description: error instanceof Error ? error.message : "Failed to load compliance settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = <K extends keyof ExtendedComplianceSettings>(key: K, value: ExtendedComplianceSettings[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleRetentionChange = (value: ComplianceType["retentionPolicy"]) => {
    if (value !== "forever" && formData.retentionPolicy === "forever") {
      // Warn about enabling auto-deletion
      setPendingRetentionChange(value);
      setShowRetentionWarning(true);
    } else {
      updateField("retentionPolicy", value);
    }
  };

  const confirmRetentionChange = () => {
    if (pendingRetentionChange) {
      updateField("retentionPolicy", pendingRetentionChange);
      updateField("autoDeleteEnabled", true);
      setPendingRetentionChange(null);
    }
    setShowRetentionWarning(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await settingsApi.updateCompliance(formData);
      setSettings(updated);
      setHasChanges(false);

      toast({
        title: "Compliance settings saved",
        description: "Your compliance and retention settings have been updated",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Compliance & Security</h2>
          <p className="text-muted-foreground">
            Configure document retention, data residency, and security policies
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Compliance Status */}
      <Card className="border-border/50 bg-gradient-to-br from-green-50 to-transparent dark:from-green-950/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <Shield className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">Compliance Status</h3>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                  Active
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Your organization is configured with enterprise-grade security and compliance features
              </p>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">256-bit</p>
                <p className="text-xs text-muted-foreground">Encryption</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">GDPR</p>
                <p className="text-xs text-muted-foreground">Compliant</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">HIPAA</p>
                <p className="text-xs text-muted-foreground">Ready</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Retention */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Document Retention
            </CardTitle>
            <CardDescription>
              How long completed documents are stored
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={formData.retentionPolicy}
              onValueChange={handleRetentionChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {retentionPolicies.map((policy) => (
                  <SelectItem key={policy.value} value={policy.value}>
                    <div className="flex flex-col">
                      <span>{policy.label}</span>
                      <span className="text-xs text-muted-foreground">{policy.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {formData.retentionPolicy !== "forever" && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Auto-delete enabled
                  </span>
                </div>
                <Switch
                  checked={formData.autoDeleteEnabled}
                  onCheckedChange={(checked) => updateField("autoDeleteEnabled", checked)}
                />
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Retention policies apply to all completed documents. Documents in progress are not affected.
                Changing this setting will affect existing documents.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Retention */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Audit Log Retention
            </CardTitle>
            <CardDescription>
              How long audit logs are kept
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={formData.auditLogRetention}
              onValueChange={(value: string) => updateField("auditLogRetention", value as ComplianceType["auditLogRetention"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {retentionPolicies.map((policy) => (
                  <SelectItem key={policy.value} value={policy.value}>
                    {policy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-sm text-muted-foreground">
              Audit logs record all actions taken on documents. We recommend keeping them for at least 7 years for compliance purposes.
            </p>
          </CardContent>
        </Card>

        {/* Audit Trail Settings */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Audit Trail on Signed Documents
                </CardTitle>
                <CardDescription>
                  Configure how audit trail information is included with signed documents
                </CardDescription>
              </div>
              <Switch
                checked={formData.auditTrailEnabled}
                onCheckedChange={(checked) => updateField("auditTrailEnabled", checked)}
              />
            </div>
          </CardHeader>
          {formData.auditTrailEnabled && (
            <CardContent className="space-y-4">
              <RadioGroup
                value={formData.auditTrailMode}
                onValueChange={(value) => updateField("auditTrailMode", value as 'attached' | 'separate' | 'both')}
                className="space-y-3"
              >
                {auditTrailOptions.map((option) => (
                  <div
                    key={option.value}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                      formData.auditTrailMode === option.value
                        ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                        : "border-border/50 hover:border-border"
                    )}
                    onClick={() => updateField("auditTrailMode", option.value as 'attached' | 'separate' | 'both')}
                  >
                    <RadioGroupItem value={option.value} id={`audit-${option.value}`} className="mt-1" />
                    <Label htmlFor={`audit-${option.value}`} className="flex-1 cursor-pointer">
                      <span className="font-medium">{option.label}</span>
                      <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Audit Trail Includes:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Document ID and name</li>
                    <li>Signer name, email, and IP address</li>
                    <li>Timestamp of each action (viewed, signed)</li>
                    <li>Browser and device information</li>
                    <li>Cryptographic signature hash</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Data Residency */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Data Residency
            </CardTitle>
            <CardDescription>
              Where your documents and data are stored
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.dataResidency}
              onValueChange={(value) => updateField("dataResidency", value as ComplianceType["dataResidency"])}
              className="space-y-3"
            >
              {dataResidencyOptions.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    formData.dataResidency === option.value
                      ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                      : "border-border/50 hover:border-border"
                  )}
                  onClick={() => updateField("dataResidency", option.value as ComplianceType["dataResidency"])}
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <span className="text-2xl">{option.flag}</span>
                  <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                    <span className="font-medium">{option.label}</span>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Security Settings
            </CardTitle>
            <CardDescription>
              Additional security controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Two-Factor Authentication */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                  <Key className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="font-medium">Require Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">
                    All team members must enable 2FA
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.requireTwoFactor}
                onCheckedChange={(checked) => updateField("requireTwoFactor", checked)}
              />
            </div>

            {/* IP Restrictions */}
            <div className="p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">IP Address Restrictions</p>
                  <p className="text-sm text-muted-foreground">
                    Limit access to specific IP addresses
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <Info className="h-4 w-4 shrink-0" />
                No IP restrictions configured. Contact support to enable.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Features */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Included Compliance Features</CardTitle>
          <CardDescription>
            Enterprise security and compliance features included in your plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Shield, label: "Enterprise Security Controls", desc: "Designed with security best practices" },
              { icon: Lock, label: "256-bit AES Encryption", desc: "Data encrypted at rest and in transit" },
              { icon: FileCheck, label: "Tamper-Evident Audit Trail", desc: "Cryptographically sealed logs" },
              { icon: Database, label: "Automated Backups", desc: "Point-in-time recovery" },
              { icon: Globe, label: "GDPR Compliant", desc: "EU data protection standards" },
              { icon: Key, label: "SSO Integration", desc: "SAML 2.0 and OAuth support" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Retention Warning Dialog */}
      <AlertDialog open={showRetentionWarning} onOpenChange={setShowRetentionWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Enable Document Auto-Delete?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to enable automatic document deletion. This means:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Completed documents will be permanently deleted after the retention period</li>
                <li>This action cannot be undone once documents are deleted</li>
                <li>This will affect all existing completed documents</li>
              </ul>
              <p className="font-medium text-foreground">
                Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRetentionChange(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRetentionChange}
              className="bg-amber-500 hover:bg-amber-600"
            >
              Enable Auto-Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
