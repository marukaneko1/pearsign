"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Webhook,
  Plus,
  Trash2,
  Settings,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  AlertTriangle,
  FileText,
  Bell,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WebhookData {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  last_triggered_at: string | null;
  last_status: string | null;
  failure_count: number;
  created_at: string;
}

interface WebhookLog {
  id: string;
  event_type: string;
  response_status: number;
  success: boolean;
  created_at: string;
}

const AVAILABLE_EVENTS = [
  { id: "document.signed", label: "Document Signed", description: "When a recipient signs a document", icon: FileText },
  { id: "document.completed", label: "Document Completed", description: "When all recipients have signed", icon: CheckCircle },
  { id: "document.voided", label: "Document Voided", description: "When a document is voided", icon: XCircle },
  { id: "document.declined", label: "Document Declined", description: "When a recipient declines to sign", icon: XCircle },
  { id: "document.expired", label: "Document Expired", description: "When a signing request expires", icon: Clock },
  { id: "document.sent", label: "Document Sent", description: "When a document is sent for signature", icon: ArrowRight },
  { id: "document.viewed", label: "Document Viewed", description: "When a recipient views a document", icon: Eye },
  { id: "reminder.sent", label: "Reminder Sent", description: "When a reminder email is sent", icon: Bell },
];

interface PayloadOptions {
  includePdf: boolean;
  includeFieldValues: boolean;
  includeAuditTrail: boolean;
}

export function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookData | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["document.signed", "document.completed"]);
  const [formPayloadOptions, setFormPayloadOptions] = useState<PayloadOptions>({
    includePdf: false,
    includeFieldValues: true,
    includeAuditTrail: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/webhooks", {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setWebhooks(data.webhooks);
      }
    } catch (error) {
      console.error("Failed to load webhooks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreate = async () => {
    if (!formName || !formUrl) return;

    setSaving(true);
    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          events: formEvents,
          payloadOptions: formPayloadOptions,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadWebhooks();
        setCreateDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error("Failed to create webhook:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedWebhook || !formName || !formUrl) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/webhooks/${selectedWebhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          events: formEvents,
          payloadOptions: formPayloadOptions,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadWebhooks();
        setEditDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error("Failed to update webhook:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm("Are you sure you want to delete this webhook?")) return;

    try {
      const response = await fetch(`/api/webhooks/${webhookId}`, {
        method: "DELETE",
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        await loadWebhooks();
      }
    } catch (error) {
      console.error("Failed to delete webhook:", error);
    }
  };

  const handleToggleEnabled = async (webhook: WebhookData) => {
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ enabled: !webhook.enabled }),
      });

      const data = await response.json();
      if (data.success) {
        await loadWebhooks();
      }
    } catch (error) {
      console.error("Failed to toggle webhook:", error);
    }
  };

  const handleTest = async (webhookId: string) => {
    setTesting(webhookId);
    setTestResult(null);

    try {
      const response = await fetch(`/api/webhooks/${webhookId}/test`, {
        method: "POST",
        credentials: 'include',
      });

      const data = await response.json();
      setTestResult({
        id: webhookId,
        success: data.success,
        message: data.message || (data.success ? "Test successful" : "Test failed"),
      });
      await loadWebhooks();
    } catch (error) {
      setTestResult({
        id: webhookId,
        success: false,
        message: "Failed to send test webhook",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleViewLogs = async (webhook: WebhookData) => {
    setSelectedWebhook(webhook);
    setLogsDialogOpen(true);
    setLogsLoading(true);

    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setWebhookLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleEdit = (webhook: WebhookData) => {
    setSelectedWebhook(webhook);
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormEvents(webhook.events || []);
    setFormPayloadOptions((webhook as unknown as { payload_options?: PayloadOptions }).payload_options || {
      includePdf: false,
      includeFieldValues: true,
      includeAuditTrail: false,
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormEvents(["document.signed", "document.completed"]);
    setFormPayloadOptions({
      includePdf: false,
      includeFieldValues: true,
      includeAuditTrail: false,
    });
    setSelectedWebhook(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Receive real-time notifications when events occur in PearSign
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Webhook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{webhooks.length}</p>
              <p className="text-xs text-muted-foreground">Total Webhooks</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{webhooks.filter(w => w.enabled).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{webhooks.filter(w => w.failure_count >= 5).length}</p>
              <p className="text-xs text-muted-foreground">Failing</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{AVAILABLE_EVENTS.length}</p>
              <p className="text-xs text-muted-foreground">Event Types</p>
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-16 rounded-lg border border-dashed border-border bg-card">
          <Webhook className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No webhooks configured</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Webhooks allow you to receive real-time notifications when documents are signed, completed, or voided.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Create your first webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                      webhook.enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-800"
                    )}>
                      <Webhook className={cn(
                        "h-6 w-6",
                        webhook.enabled ? "text-green-600 dark:text-green-400" : "text-gray-400"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground text-lg">{webhook.name}</h3>
                        {webhook.enabled ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                        {webhook.failure_count >= 5 && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Failing
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-2">{webhook.url}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Bell className="h-3 w-3" />
                          {webhook.events?.length || 0} events
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last: {formatDate(webhook.last_triggered_at)}
                        </span>
                        {webhook.last_status && (
                          <span className="flex items-center gap-1">
                            {webhook.last_status === "success" ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500" />
                            )}
                            {webhook.last_status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={webhook.enabled}
                      onCheckedChange={() => handleToggleEnabled(webhook)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(webhook.id)}
                      disabled={testing === webhook.id}
                    >
                      {testing === webhook.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">Test</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLogs(webhook)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span className="ml-1 hidden sm:inline">Logs</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(webhook)}
                    >
                      <Settings className="h-4 w-4" />
                      <span className="ml-1 hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Test Result */}
                {testResult && testResult.id === webhook.id && (
                  <div className={cn(
                    "mt-3 p-3 rounded-lg text-sm flex items-center gap-2",
                    testResult.success
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                  )}>
                    {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {testResult.message}
                  </div>
                )}
              </div>

              {/* Secret Section */}
              <div className="px-4 py-3 bg-muted/30 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Signing Secret:</span>
                    <code className="text-xs bg-background px-2 py-1 rounded font-mono border">
                      {showSecret === webhook.id ? webhook.secret : "whsec_••••••••••••••••"}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setShowSecret(showSecret === webhook.id ? null : webhook.id)}
                    >
                      {showSecret === webhook.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span className="ml-1 text-xs">{showSecret === webhook.id ? "Hide" : "Show"}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => copyToClipboard(webhook.secret)}
                    >
                      <Copy className="h-3 w-3" />
                      <span className="ml-1 text-xs">{copied ? "Copied!" : "Copy"}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documentation Link */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Webhook Documentation</h3>
              <p className="text-sm text-muted-foreground">
                Learn how to verify signatures and handle webhook events
              </p>
            </div>
          </div>
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Docs
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-blue-600" />
              Add Webhook
            </DialogTitle>
            <DialogDescription>
              Configure a new webhook endpoint to receive event notifications
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="My Webhook"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Endpoint URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/webhooks/pearsign"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must be a valid HTTPS URL that accepts POST requests
              </p>
            </div>

            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {AVAILABLE_EVENTS.map((event) => {
                  const Icon = event.icon;
                  return (
                    <label
                      key={event.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formEvents.includes(event.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormEvents([...formEvents, event.id]);
                          } else {
                            setFormEvents(formEvents.filter((id) => id !== event.id));
                          }
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium text-sm">{event.label}</div>
                        <div className="text-xs text-muted-foreground">{event.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payload Options</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Choose what data to include in webhook payloads
              </p>
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include Field Values</div>
                      <div className="text-xs text-muted-foreground">Form field data from signatures</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includeFieldValues}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includeFieldValues: checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include PDF</div>
                      <div className="text-xs text-muted-foreground">Signed document as base64 (larger payloads)</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includePdf}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includePdf: checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include Audit Trail</div>
                      <div className="text-xs text-muted-foreground">Full document history and timestamps</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includeAuditTrail}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includeAuditTrail: checked }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formName || !formUrl} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              Edit Webhook
            </DialogTitle>
            <DialogDescription>
              Update webhook configuration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-url">Endpoint URL</Label>
              <Input
                id="edit-url"
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {AVAILABLE_EVENTS.map((event) => {
                  const Icon = event.icon;
                  return (
                    <label
                      key={event.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formEvents.includes(event.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormEvents([...formEvents, event.id]);
                          } else {
                            setFormEvents(formEvents.filter((id) => id !== event.id));
                          }
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium text-sm">{event.label}</div>
                        <div className="text-xs text-muted-foreground">{event.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payload Options</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Choose what data to include in webhook payloads
              </p>
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include Field Values</div>
                      <div className="text-xs text-muted-foreground">Form field data from signatures</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includeFieldValues}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includeFieldValues: checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include PDF</div>
                      <div className="text-xs text-muted-foreground">Signed document as base64 (larger payloads)</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includePdf}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includePdf: checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Include Audit Trail</div>
                      <div className="text-xs text-muted-foreground">Full document history and timestamps</div>
                    </div>
                  </div>
                  <Switch
                    checked={formPayloadOptions.includeAuditTrail}
                    onCheckedChange={(checked) =>
                      setFormPayloadOptions((prev) => ({ ...prev, includeAuditTrail: checked }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving || !formName || !formUrl} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Delivery Logs
            </DialogTitle>
            <DialogDescription>
              Recent delivery attempts for {selectedWebhook?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : webhookLogs.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No delivery attempts yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                  >
                    <div className="flex items-center gap-3">
                      {log.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{log.event_type}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <Badge variant={log.success ? "default" : "destructive"}>
                      {log.response_status || "Error"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => handleViewLogs(selectedWebhook!)} disabled={logsLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", logsLoading && "animate-spin")} />
              Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
