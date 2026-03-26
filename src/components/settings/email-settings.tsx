"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Mail,
  Send,
  Eye,
  Code,
  Check,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  Save,
  Undo,
  Copy,
  Sparkles,
  Monitor,
  Smartphone,
  ArrowRight,
  Bell,
  FileSignature,
  AlertTriangle,
  RefreshCw,
  FileX,
  Timer,
  PartyPopper,
  MailOpen,
  ThumbsDown,
  Receipt,
  CircleAlert,
  ArrowUpDown,
  Gauge,
  Hourglass,
} from "lucide-react";
import {
  settingsApi,
  type EmailTemplate,
  type BrandingSettings,
  EMAIL_TEMPLATE_CATEGORIES,
} from "@/lib/settings-api";

// Template icon and color config
const templateConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  signature_request: { icon: FileSignature, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  reminder: { icon: Bell, color: "text-amber-500", bgColor: "bg-amber-500/10" },
  signer_completed: { icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-500/10" },
  sender_completed: { icon: MailOpen, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  document_viewed: { icon: Eye, color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
  document_voided: { icon: XCircle, color: "text-red-500", bgColor: "bg-red-500/10" },
  document_declined: { icon: ThumbsDown, color: "text-rose-500", bgColor: "bg-rose-500/10" },
  expiration_warning: { icon: Timer, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  document_expired: { icon: FileX, color: "text-red-600", bgColor: "bg-red-600/10" },
  team_invite: { icon: UserPlus, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  welcome: { icon: PartyPopper, color: "text-pink-500", bgColor: "bg-pink-500/10" },
  invoice_ready: { icon: Receipt, color: "text-indigo-500", bgColor: "bg-indigo-500/10" },
  payment_received: { icon: CheckCircle2, color: "text-teal-500", bgColor: "bg-teal-500/10" },
  payment_failed: { icon: CircleAlert, color: "text-red-500", bgColor: "bg-red-500/10" },
  subscription_updated: { icon: ArrowUpDown, color: "text-violet-500", bgColor: "bg-violet-500/10" },
  usage_warning: { icon: Gauge, color: "text-amber-600", bgColor: "bg-amber-600/10" },
  trial_ending: { icon: Hourglass, color: "text-sky-500", bgColor: "bg-sky-500/10" },
};

// Category colors
const categoryColors: Record<string, string> = {
  Signing: "border-blue-500/30 bg-blue-50 dark:bg-blue-950/20",
  Completion: "border-green-500/30 bg-green-50 dark:bg-green-950/20",
  Status: "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20",
  Account: "border-purple-500/30 bg-purple-50 dark:bg-purple-950/20",
  Billing: "border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/20",
};

// Sample variable values for preview
const sampleVariables: Record<string, string> = {
  recipientName: "Jane Smith",
  senderName: "John Doe",
  senderEmail: "john.doe@example.com",
  documentTitle: "Employment Agreement",
  message: "Please review and sign this document at your earliest convenience.",
  signingUrl: "https://sign.pearsign.com/s/abc123",
  downloadUrl: "https://sign.pearsign.com/d/abc123",
  expirationDate: "January 15, 2026",
  daysRemaining: "3",
  signedDate: "December 31, 2025 at 2:30 PM",
  signerName: "Jane Smith",
  signerEmail: "jane.smith@example.com",
  viewerName: "Jane Smith",
  viewerEmail: "jane.smith@example.com",
  viewedDate: "January 6, 2026 at 3:45 PM",
  voidReason: "The document terms have been updated. A new version will be sent.",
  expiredDate: "December 25, 2025",
  inviterName: "John Doe",
  organizationName: "Acme Corporation",
  role: "Editor",
  inviteUrl: "https://app.pearsign.com/invite/xyz789",
  userName: "Jane Smith",
  userEmail: "jane.smith@example.com",
  reminderNumber: "2",
  dashboardUrl: "https://app.pearsign.com",
  declineReason: "The terms in section 3 need to be revised before I can sign.",
  declinedDate: "January 8, 2026 at 11:15 AM",
  recipientEmail: "jane.smith@example.com",
  contactName: "Sarah Johnson",
  invoiceNumber: "INV-2026-0042",
  invoiceDate: "February 1, 2026",
  dueDate: "February 15, 2026",
  invoiceAmount: "$49.00",
  invoiceUrl: "https://app.pearsign.com/billing/invoices/42",
  billingPortalUrl: "https://app.pearsign.com/billing",
  paymentAmount: "$49.00",
  paymentDate: "February 1, 2026",
  paymentMethod: "Visa ending in 4242",
  receiptUrl: "https://app.pearsign.com/billing/receipts/42",
  failureReason: "Card declined - insufficient funds",
  retryDate: "February 3, 2026",
  updatePaymentUrl: "https://app.pearsign.com/billing/payment-methods",
  previousPlan: "Starter",
  newPlan: "Professional",
  effectiveDate: "February 1, 2026",
  newFeatures: "Unlimited envelopes, custom branding, API access, priority support",
  resourceType: "envelopes",
  usagePercentage: "85",
  currentUsage: "85",
  usageLimit: "100",
  upgradeUrl: "https://app.pearsign.com/billing/upgrade",
  trialEndDate: "February 14, 2026",
  planName: "Professional",
  planPrice: "$29",
  lineItems: "Professional Plan (Monthly) — $49.00",
};

export function EmailSettings() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "html">("preview");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load branding first (smaller response)
      const brandingData = await settingsApi.getBranding();
      setBranding(brandingData);

      // Then load templates (larger response)
      const templatesData = await settingsApi.getEmailTemplates();
      setTemplates(templatesData);

      if (!selectedTemplate && templatesData.length > 0) {
        // Load the first template with full body
        const firstTemplate = await settingsApi.getEmailTemplate(templatesData[0].id);
        if (firstTemplate) {
          setSelectedTemplate(firstTemplate);
          setEditedSubject(firstTemplate.subject);
          setEditedBody(firstTemplate.htmlBody || "");
        }
      }
    } catch (error) {
      console.error('[EmailSettings] Error loading data:', error);
      toast({
        title: "Error loading templates",
        description: error instanceof Error ? error.message : "Failed to load email templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectTemplate = async (template: EmailTemplate) => {
    // If we already have the htmlBody, use it directly
    if (template.htmlBody) {
      setSelectedTemplate(template);
      setEditedSubject(template.subject);
      setEditedBody(template.htmlBody);
      setHasChanges(false);
      return;
    }

    // Otherwise, load the full template with body
    setLoadingTemplate(true);
    try {
      const fullTemplate = await settingsApi.getEmailTemplate(template.id);
      if (fullTemplate) {
        setSelectedTemplate(fullTemplate);
        setEditedSubject(fullTemplate.subject);
        setEditedBody(fullTemplate.htmlBody || fullTemplate.body || "");
        setHasChanges(false);
      }
    } catch (error) {
      console.error("[EmailSettings] Error loading template body:", error);
      toast({
        title: "Error loading template",
        description: "Failed to load template content",
        variant: "destructive",
      });
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleSubjectChange = (value: string) => {
    setEditedSubject(value);
    const originalBody = selectedTemplate?.htmlBody || selectedTemplate?.body || "";
    setHasChanges(value !== selectedTemplate?.subject || editedBody !== originalBody);
  };

  const handleBodyChange = (value: string) => {
    setEditedBody(value);
    const originalBody = selectedTemplate?.htmlBody || selectedTemplate?.body || "";
    setHasChanges(editedSubject !== selectedTemplate?.subject || value !== originalBody);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      const updated = await settingsApi.updateEmailTemplate(selectedTemplate.id, {
        subject: editedSubject,
        htmlBody: editedBody,
      });

      toast({
        title: "Template saved",
        description: "Your email template has been updated",
      });

      setSelectedTemplate(updated);
      setHasChanges(false);
      loadData();
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      const reset = await settingsApi.resetEmailTemplate(selectedTemplate.id);
      selectTemplate(reset);

      toast({
        title: "Template reset",
        description: "Template has been reset to default",
      });

      setShowResetDialog(false);
      loadData();
    } catch (error) {
      toast({
        title: "Failed to reset",
        description: error instanceof Error ? error.message : "Failed to reset template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!selectedTemplate || !testEmail) return;

    setSendingTest(true);
    try {
      await settingsApi.sendTestEmail(selectedTemplate.id, testEmail);

      toast({
        title: "Test email sent",
        description: `A test email has been sent to ${testEmail}`,
      });

      setShowTestDialog(false);
      setTestEmail("");
    } catch (error) {
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Failed to send test email",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const copyVariable = async (variable: string) => {
    try {
      await navigator.clipboard.writeText(`{{${variable}}}`);
      setCopiedVariable(variable);
      setTimeout(() => setCopiedVariable(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Substitute variables in template for preview
  const substituteVariables = (text: string): string => {
    let result = text;

    const allVariables = {
      ...sampleVariables,
      primaryColor: branding?.primaryColor || "#2563eb",
      accentColor: branding?.accentColor || "#1d4ed8",
      logoUrl: branding?.logoUrl || "",
      productName: branding?.productName || "PearSign",
      footerText: branding?.footerText || "© 2026 PearSign. All rights reserved.",
      supportEmail: branding?.supportEmail || "info@pearsign.com",
    };

    Object.entries(allVariables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    });

    // Handle conditionals
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, ifContent, elseContent) => {
      const key = varName as keyof typeof allVariables;
      return allVariables[key] ? ifContent : elseContent;
    });
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
      const key = varName as keyof typeof allVariables;
      return allVariables[key] ? content : '';
    });

    return result;
  };

  const previewSubject = substituteVariables(editedSubject);
  const previewBody = substituteVariables(editedBody);

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  const filteredTemplates = selectedCategory
    ? templates.filter(t => t.category === selectedCategory)
    : templates;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email Templates</h2>
          <p className="text-muted-foreground">
            Manage all system-generated emails in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {templates.length} templates
          </Badge>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory(null)}
          className="shrink-0"
        >
          All
        </Button>
        {Object.keys(EMAIL_TEMPLATE_CATEGORIES).map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
            className="shrink-0"
          >
            {category}
            <Badge variant="secondary" className="ml-2 text-xs">
              {templatesByCategory[category]?.length || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Templates List */}
          <div className="xl:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">
                {selectedCategory ? `${selectedCategory} Templates` : 'All Templates'}
              </h3>
              <Button variant="ghost" size="sm" onClick={loadData} className="h-8 w-8 p-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-2">
                {filteredTemplates.map((template) => {
                  const config = templateConfig[template.type] || { icon: Mail, color: "text-gray-500", bgColor: "bg-gray-500/10" };
                  const Icon = config.icon;
                  const isSelected = selectedTemplate?.id === template.id;

                  return (
                    <button
                      key={template.id}
                      onClick={() => selectTemplate(template)}
                      className={cn(
                        "w-full relative group p-4 rounded-xl text-left transition-all duration-200",
                        "border hover:shadow-md",
                        isSelected
                          ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5 shadow-sm"
                          : "border-border/50 hover:border-border bg-card"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          config.bgColor
                        )}>
                          <Icon className={cn("h-5 w-5", config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-semibold text-sm truncate">{template.name}</p>
                            {!template.isDefault && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Customized
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[10px]">
                              {template.category}
                            </Badge>
                            {template.isActive ? (
                              <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--pearsign-primary))] animate-pulse" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Editor & Preview */}
          <div className="xl:col-span-8 space-y-4">
            {selectedTemplate && (
              <>
                {/* Template Header */}
                <Card className="border-border/50 overflow-hidden">
                  <div className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))]/5 to-transparent">
                    <CardHeader className="pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                            templateConfig[selectedTemplate.type]?.bgColor || "bg-gray-500/10"
                          )}>
                            {(() => {
                              const Icon = templateConfig[selectedTemplate.type]?.icon || Mail;
                              return <Icon className={cn("h-6 w-6", templateConfig[selectedTemplate.type]?.color || "text-gray-500")} />;
                            })()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-xl">{selectedTemplate.name}</CardTitle>
                              {hasChanges && (
                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300">
                                  Unsaved
                                </Badge>
                              )}
                              {!selectedTemplate.isDefault && (
                                <Badge variant="secondary">Customized</Badge>
                              )}
                            </div>
                            <CardDescription className="text-sm">
                              {selectedTemplate.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowTestDialog(true)}
                            className="gap-2"
                          >
                            <Send className="h-4 w-4" />
                            <span className="hidden sm:inline">Test</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowResetDialog(true)}
                            disabled={saving || selectedTemplate.isDefault}
                            className="gap-2"
                          >
                            <Undo className="h-4 w-4" />
                            <span className="hidden sm:inline">Reset</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            className="gap-2 bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">Save</span>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </div>

                  <CardContent className="space-y-4 pt-0">
                    {/* Subject Line */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Subject Line</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={editedSubject}
                          onChange={(e) => handleSubjectChange(e.target.value)}
                          placeholder="Enter email subject..."
                          className="pl-10 h-11"
                        />
                      </div>
                    </div>

                    {/* Variables */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-muted/80 to-muted/40 border border-border/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                        <span className="text-sm font-medium">Dynamic Variables</span>
                        <span className="text-xs text-muted-foreground">(click to copy)</span>
                      </div>
                      <TooltipProvider>
                        <div className="flex flex-wrap gap-2">
                          {selectedTemplate.variables.map(variable => (
                            <Tooltip key={variable}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => copyVariable(variable)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono",
                                    "bg-background border border-border/80 hover:border-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/5",
                                    "transition-all cursor-pointer",
                                    copiedVariable === variable && "border-green-500 bg-green-500/10 text-green-700"
                                  )}
                                >
                                  {copiedVariable === variable ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {`{{${variable}}}`}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Preview: <strong>{sampleVariables[variable] || variable}</strong></p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                    </div>
                  </CardContent>
                </Card>

                {/* Body Editor & Preview */}
                <Card className="border-border/50 overflow-hidden">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "html")}>
                    <CardHeader className="pb-0 border-b">
                      <div className="flex items-center justify-between -mb-px">
                        <TabsList className="h-12 p-0 bg-transparent gap-4">
                          <TabsTrigger
                            value="preview"
                            className="relative h-12 px-1 pb-3 pt-3 rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--pearsign-primary))] data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </TabsTrigger>
                          <TabsTrigger
                            value="html"
                            className="relative h-12 px-1 pb-3 pt-3 rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--pearsign-primary))] data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
                          >
                            <Code className="h-4 w-4 mr-2" />
                            HTML Editor
                          </TabsTrigger>
                        </TabsList>

                        {activeTab === "preview" && (
                          <div className="flex items-center gap-1 pb-3">
                            <Button
                              variant={previewDevice === "desktop" ? "secondary" : "ghost"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPreviewDevice("desktop")}
                            >
                              <Monitor className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={previewDevice === "mobile" ? "secondary" : "ghost"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPreviewDevice("mobile")}
                            >
                              <Smartphone className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <TabsContent value="preview" className="m-0">
                        <div className="bg-slate-100 dark:bg-slate-900 p-6 min-h-[500px]">
                          <div className={cn(
                            "mx-auto transition-all duration-300",
                            previewDevice === "mobile" ? "max-w-[375px]" : "max-w-[600px]"
                          )}>
                            <div className="bg-white dark:bg-slate-800 rounded-t-xl shadow-xl overflow-hidden">
                              <div className="bg-slate-50 dark:bg-slate-700 px-4 py-3 border-b flex items-center gap-3">
                                <div className="flex gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-red-400" />
                                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                                  <div className="w-3 h-3 rounded-full bg-green-400" />
                                </div>
                                <div className="flex-1 text-center">
                                  <span className="text-xs text-muted-foreground font-medium">Email Preview</span>
                                </div>
                              </div>

                              <div className="px-4 py-4 border-b bg-white dark:bg-slate-800">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                                    PS
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-semibold text-sm truncate">{branding?.productName || 'PearSign'}</p>
                                      <span className="text-xs text-muted-foreground shrink-0">Just now</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">no-reply@premiumcapital.com</p>
                                    <p className="text-sm font-medium mt-1 truncate">{previewSubject}</p>
                                  </div>
                                </div>
                              </div>

                              <ScrollArea className="h-[400px]">
                                <div className="p-0">
                                  {loadingTemplate || !editedBody ? (
                                    <div className="flex items-center justify-center h-[300px]">
                                      <div className="text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">Loading template...</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      dangerouslySetInnerHTML={{ __html: previewBody }}
                                      className="email-preview"
                                    />
                                  )}
                                </div>
                              </ScrollArea>
                            </div>
                            <div className="h-4 bg-gradient-to-b from-black/5 to-transparent rounded-b-xl" />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="html" className="m-0">
                        <div className="relative">
                          <div className="absolute top-3 right-3 z-10">
                            <Badge variant="secondary" className="text-xs font-mono">
                              HTML
                            </Badge>
                          </div>
                          <Textarea
                            value={editedBody}
                            onChange={(e) => handleBodyChange(e.target.value)}
                            placeholder="Enter HTML email body..."
                            className="min-h-[500px] font-mono text-xs rounded-none border-0 focus-visible:ring-0 resize-none bg-slate-950 text-slate-100 p-4"
                          />
                        </div>
                      </TabsContent>
                    </CardContent>
                  </Tabs>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              </div>
              Send Test Email
            </DialogTitle>
            <DialogDescription>
              Send a preview of this template to your inbox
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-xl bg-muted/50 border">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{selectedTemplate?.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sample data will be used for all dynamic variables
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-email">Recipient Email</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendTest}
              disabled={!testEmail || sendingTest}
              className="gap-2 bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            >
              {sendingTest ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reset to Default
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reset "{selectedTemplate?.name}" to its original default template.
              All your customizations will be lost. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reset Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
