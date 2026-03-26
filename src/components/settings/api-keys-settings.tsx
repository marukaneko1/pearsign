"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Key,
  Plus,
  Copy,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertTriangle,
  Shield,
  Clock,
  Activity,
  ExternalLink,
  Code,
  BookOpen,
} from "lucide-react";

interface ApiKeyPublic {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  environment: "test" | "live";
  permissions: string[];
  rateLimit: number;
  status: "active" | "revoked" | "expired";
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  expiresAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyWithSecret extends ApiKeyPublic {
  rawSecret: string;
  fullKey: string;
}

const PERMISSION_GROUPS = {
  envelopes: {
    label: "Envelopes",
    permissions: [
      { id: "envelopes:create", label: "Create" },
      { id: "envelopes:read", label: "Read" },
      { id: "envelopes:send", label: "Send" },
      { id: "envelopes:void", label: "Void" },
    ],
  },
  documents: {
    label: "Documents",
    permissions: [
      { id: "documents:upload", label: "Upload" },
      { id: "documents:read", label: "Read" },
      { id: "documents:delete", label: "Delete" },
    ],
  },
  templates: {
    label: "Templates",
    permissions: [
      { id: "templates:read", label: "Read" },
      { id: "templates:create", label: "Create" },
      { id: "templates:update", label: "Update" },
      { id: "templates:delete", label: "Delete" },
    ],
  },
  fusionforms: {
    label: "FusionForms",
    permissions: [
      { id: "fusionforms:create", label: "Create" },
      { id: "fusionforms:read", label: "Read" },
      { id: "fusionforms:update", label: "Update" },
      { id: "fusionforms:delete", label: "Delete" },
    ],
  },
  advanced: {
    label: "Advanced",
    permissions: [
      { id: "webhooks:manage", label: "Webhooks" },
      { id: "audit:read", label: "Audit Logs" },
      { id: "team:read", label: "Read Team" },
      { id: "team:manage", label: "Manage Team" },
    ],
  },
};

export function ApiKeysSettings() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKeyPublic | null>(null);
  const [newKeySecret, setNewKeySecret] = useState<ApiKeyWithSecret | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // Create form state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnvironment, setNewKeyEnvironment] = useState<"test" | "live">("test");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);

  const loadApiKeys = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.data || []);
      }
    } catch (error) {
      console.error("Error loading API keys:", error);
      toast({
        title: "Error loading API keys",
        description: "Failed to load your API keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({ title: "Name required", description: "Please enter a name for the API key", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName,
          environment: newKeyEnvironment,
          rateLimit: newKeyRateLimit,
          permissions: newKeyPermissions,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to create API key");
      }

      const data = await response.json();
      setNewKeySecret(data.data);
      setCreateDialogOpen(false);
      setSecretDialogOpen(true);
      await loadApiKeys();

      // Reset form
      setNewKeyName("");
      setNewKeyEnvironment("test");
      setNewKeyRateLimit(60);
      setNewKeyPermissions([]);
    } catch (error) {
      console.error("Error creating API key:", error);
      toast({
        title: "Error creating API key",
        description: error instanceof Error ? error.message : "Failed to create API key",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRotateKey = async () => {
    if (!selectedKey) return;

    setRotating(true);
    try {
      const response = await fetch(`/api/v1/api-keys/${selectedKey.id}/rotate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to rotate API key");
      }

      const data = await response.json();
      setNewKeySecret(data.data);
      setRotateDialogOpen(false);
      setSecretDialogOpen(true);
      await loadApiKeys();
    } catch (error) {
      console.error("Error rotating API key:", error);
      toast({
        title: "Error rotating API key",
        description: "Failed to rotate the API key",
        variant: "destructive",
      });
    } finally {
      setRotating(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!selectedKey) return;

    setRevoking(true);
    try {
      const response = await fetch(`/api/v1/api-keys/${selectedKey.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke API key");
      }

      setRevokeDialogOpen(false);
      setSelectedKey(null);
      await loadApiKeys();

      toast({
        title: "API key revoked",
        description: "The API key has been permanently revoked",
      });
    } catch (error) {
      console.error("Error revoking API key:", error);
      toast({
        title: "Error revoking API key",
        description: "Failed to revoke the API key",
        variant: "destructive",
      });
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const togglePermission = (permissionId: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const selectAllPermissions = () => {
    const all = Object.values(PERMISSION_GROUPS).flatMap((g) => g.permissions.map((p) => p.id));
    setNewKeyPermissions(all);
  };

  const clearAllPermissions = () => {
    setNewKeyPermissions([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeKeys = apiKeys.filter((k) => k.status === "active");
  const revokedKeys = apiKeys.filter((k) => k.status === "revoked");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground">
            Manage API keys for external integrations
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/docs">
          <Card className="cursor-pointer hover:border-[hsl(var(--pearsign-primary))]/50 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">API Documentation</p>
                  <p className="text-sm text-muted-foreground">View the full API reference</p>
                </div>
                <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="cursor-pointer hover:border-[hsl(var(--pearsign-primary))]/50 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Code className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium">SDK & Libraries</p>
                <p className="text-sm text-muted-foreground">Download official SDKs</p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-[hsl(var(--pearsign-primary))]/50 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium">API Analytics</p>
                <p className="text-sm text-muted-foreground">View usage and performance</p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Keys */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            Active API Keys
          </CardTitle>
          <CardDescription>
            {activeKeys.length} active key{activeKeys.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No API keys yet</p>
              <p className="text-sm mb-4">Create your first API key to get started</p>
              <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {activeKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 rounded-xl border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      key.environment === "live"
                        ? "bg-gradient-to-br from-green-500 to-emerald-600"
                        : "bg-gradient-to-br from-amber-500 to-orange-500"
                    }`}>
                      <Key className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{key.name}</p>
                        <Badge variant={key.environment === "live" ? "default" : "secondary"}>
                          {key.environment}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {key.keyPrefix}...
                        </code>
                        <span>{key.permissions.length} permissions</span>
                        <span>{key.rateLimit}/min</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.lastUsedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedKey(key);
                        setRotateDialogOpen(true);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setSelectedKey(key);
                        setRevokeDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoked Keys */}
      {revokedKeys.length > 0 && (
        <Card className="border-border/50 opacity-75">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Revoked Keys
            </CardTitle>
            <CardDescription>
              {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {revokedKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-muted-foreground">{key.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Revoked: {key.revokedAt ? new Date(key.revokedAt).toLocaleDateString() : "Unknown"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="destructive">Revoked</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for external integrations
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="keyName">Name</Label>
              <Input
                id="keyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production Server, CRM Integration"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select
                  value={newKeyEnvironment}
                  onValueChange={(v) => setNewKeyEnvironment(v as "test" | "live")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        Test
                      </div>
                    </SelectItem>
                    <SelectItem value="live">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        Live
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (req/min)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  value={newKeyRateLimit}
                  onChange={(e) => setNewKeyRateLimit(parseInt(e.target.value) || 60)}
                  min={1}
                  max={10000}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Permissions</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllPermissions}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAllPermissions}>
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(PERMISSION_GROUPS).map(([groupId, group]) => (
                  <Card key={groupId} className="p-4">
                    <h4 className="font-medium mb-3">{group.label}</h4>
                    <div className="space-y-2">
                      {group.permissions.map((perm) => (
                        <div key={perm.id} className="flex items-center gap-2">
                          <Switch
                            checked={newKeyPermissions.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                          />
                          <span className="text-sm">{perm.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={creating || !newKeyName.trim()}
              className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Display Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>

          {newKeySecret && (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium">Store this key securely</p>
                    <p>This is the only time your secret will be displayed. If you lose it, you'll need to rotate the key.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={showSecret ? newKeySecret.fullKey : newKeySecret.fullKey.replace(/\..+$/, ".••••••••••••")}
                      readOnly
                      className="font-mono text-sm pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(newKeySecret.fullKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setSecretDialogOpen(false);
                setNewKeySecret(null);
                setShowSecret(false);
              }}
            >
              I've Copied the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate Confirmation */}
      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new secret for "{selectedKey?.name}". The old secret will immediately stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRotateKey}
              disabled={rotating}
              className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
            >
              {rotating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Rotate Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke "{selectedKey?.name}". This action cannot be undone and the key will immediately stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeKey}
              disabled={revoking}
              className="bg-red-600 hover:bg-red-700"
            >
              {revoking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
