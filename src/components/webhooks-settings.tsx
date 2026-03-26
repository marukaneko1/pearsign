"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  { id: "document.signed", label: "Document Signed", description: "When a recipient signs a document" },
  { id: "document.completed", label: "Document Completed", description: "When all recipients have signed" },
  { id: "document.voided", label: "Document Voided", description: "When a document is voided" },
  { id: "document.sent", label: "Document Sent", description: "When a document is sent for signature" },
  { id: "document.viewed", label: "Document Viewed", description: "When a recipient views a document" },
];

export function WebhooksSettings() {
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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [showSecret, setShowSecret] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/webhooks");
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
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          events: formEvents,
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
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          events: formEvents,
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
      const response = await fetch(`/api/webhooks/${webhook.id}`);
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
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormEvents(["document.signed", "document.completed"]);
    setSelectedWebhook(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
          <h3 className="text-lg font-medium">Webhooks</h3>
          <p className="text-sm text-muted-foreground">
            Receive real-time notifications when events occur in PearSign
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-dashed border-border">
          <Webhook className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-foreground mb-1">No webhooks configured</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add a webhook to receive notifications when documents are signed
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add your first webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    webhook.enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-800"
                  )}>
                    <Webhook className={cn(
                      "h-5 w-5",
                      webhook.enabled ? "text-green-600 dark:text-green-400" : "text-gray-400"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground">{webhook.name}</h4>
                      {webhook.failure_count >= 5 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Failing
                        </span>
                      )}
                      {webhook.last_status === "success" && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {webhook.last_status === "failed" && (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{webhook.url}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{webhook.events?.length || 0} events</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last triggered: {formatDate(webhook.last_triggered_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={webhook.enabled}
                    onCheckedChange={() => handleToggleEnabled(webhook)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleTest(webhook.id)}
                    disabled={testing === webhook.id}
                  >
                    {testing === webhook.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleViewLogs(webhook)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(webhook)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(webhook.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Test Result */}
              {testResult && testResult.id === webhook.id && (
                <div className={cn(
                  "mt-3 p-2 rounded text-sm flex items-center gap-2",
                  testResult.success
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                )}>
                  {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult.message}
                </div>
              )}

              {/* Secret (collapsible) */}
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Signing Secret:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {showSecret === webhook.id ? webhook.secret : "••••••••••••••••"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowSecret(showSecret === webhook.id ? null : webhook.id)}
                  >
                    {showSecret === webhook.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(webhook.secret)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
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
            </div>

            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {AVAILABLE_EVENTS.map((event) => (
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
                    <div>
                      <div className="font-medium text-sm">{event.label}</div>
                      <div className="text-xs text-muted-foreground">{event.description}</div>
                    </div>
                  </label>
                ))}
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
            <DialogTitle>Edit Webhook</DialogTitle>
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
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {AVAILABLE_EVENTS.map((event) => (
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
                    <div>
                      <div className="font-medium text-sm">{event.label}</div>
                      <div className="text-xs text-muted-foreground">{event.description}</div>
                    </div>
                  </label>
                ))}
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
            <DialogTitle>Webhook Logs</DialogTitle>
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
              <div className="text-center py-8 text-muted-foreground">
                No delivery attempts yet
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {log.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{log.event_type}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-mono px-2 py-1 rounded",
                      log.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {log.response_status || "Error"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
