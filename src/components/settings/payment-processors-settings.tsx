"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Plus,
  Settings2,
  Trash2,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Star,
  AlertCircle,
  Loader2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface ProcessorConfig {
  id: string;
  processor_type: "stripe" | "square" | "authorize_net" | "custom";
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  has_credentials?: boolean;
  created_at: string;
  updated_at: string;
}

interface AvailableProcessor {
  type: string;
  name: string;
  description: string;
  icon: string;
}

const PROCESSOR_ICONS: Record<string, React.ReactNode> = {
  stripe: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
    </svg>
  ),
  square: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.387 0H2.613A2.613 2.613 0 0 0 0 2.613v18.774A2.613 2.613 0 0 0 2.613 24h18.774A2.613 2.613 0 0 0 24 21.387V2.613A2.613 2.613 0 0 0 21.387 0zM9.027 18.407a.936.936 0 0 1-.936.936H6.106a.936.936 0 0 1-.936-.936V6.08a.936.936 0 0 1 .936-.936h1.985a.936.936 0 0 1 .936.936v12.327zm8.803-.469a.469.469 0 0 1-.469.469H6.639a.469.469 0 0 1-.469-.469v-.469a.469.469 0 0 1 .469-.469h10.722a.469.469 0 0 1 .469.469v.469z"/>
    </svg>
  ),
  authorize_net: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  ),
  custom: <Link2 className="w-6 h-6" />,
};

const PROCESSOR_COLORS: Record<string, string> = {
  stripe: "bg-[#635BFF]",
  square: "bg-[#006AFF]",
  authorize_net: "bg-[#1A1F71]",
  custom: "bg-zinc-600",
};

const CREDENTIAL_FIELDS: Record<string, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  stripe: [
    { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
    { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", secret: true },
  ],
  square: [
    { key: "application_id", label: "Application ID", placeholder: "sq0idp-..." },
    { key: "access_token", label: "Access Token", placeholder: "EAAAl...", secret: true },
    { key: "location_id", label: "Location ID", placeholder: "L..." },
  ],
  authorize_net: [
    { key: "api_login_id", label: "API Login ID", placeholder: "Your API Login ID" },
    { key: "transaction_key", label: "Transaction Key", placeholder: "Your Transaction Key", secret: true },
    { key: "is_sandbox", label: "Sandbox Mode", placeholder: "true/false" },
  ],
  custom: [
    { key: "payment_url", label: "Payment URL", placeholder: "https://pay.example.com/{{invoice_id}}" },
    { key: "include_token", label: "Include Security Token", placeholder: "true/false" },
    { key: "url_template_vars", label: "Use Template Variables", placeholder: "true/false" },
  ],
};

export function PaymentProcessorsSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<ProcessorConfig[]>([]);
  const [availableTypes, setAvailableTypes] = useState<AvailableProcessor[]>([]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ProcessorConfig | null>(null);

  const [formData, setFormData] = useState({
    processor_type: "stripe" as string,
    display_name: "",
    credentials: {} as Record<string, string>,
    webhook_secret: "",
    is_default: false,
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const loadProcessors = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/payment-processors?include_inactive=true");
      const data = await response.json();

      if (response.ok) {
        setConfigs(data.configs || []);
        setAvailableTypes(data.available_types || []);
      } else {
        console.error("Failed to load processors:", data.error);
      }
    } catch (error) {
      console.error("Error loading processors:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProcessors();
  }, [loadProcessors]);

  const resetForm = () => {
    setFormData({
      processor_type: "stripe",
      display_name: "",
      credentials: {},
      webhook_secret: "",
      is_default: false,
    });
    setShowSecrets({});
  };

  const handleAddNew = () => {
    resetForm();
    setSelectedConfig(null);
    setShowAddDialog(true);
  };

  const handleEdit = (config: ProcessorConfig) => {
    setSelectedConfig(config);
    setFormData({
      processor_type: config.processor_type,
      display_name: config.display_name,
      credentials: {}, // Don't pre-fill credentials for security
      webhook_secret: "",
      is_default: config.is_default,
    });
    setShowEditDialog(true);
  };

  const handleDelete = (config: ProcessorConfig) => {
    setSelectedConfig(config);
    setShowDeleteDialog(true);
  };

  const handleSetDefault = async (configId: string) => {
    try {
      const response = await fetch(`/api/payment-processors/${configId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });

      if (response.ok) {
        toast({
          title: "Default processor updated",
          description: "This processor will now be used for new payment links.",
        });
        loadProcessors();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || "Failed to update default processor.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update default processor.",
        variant: "destructive",
      });
    }
  };

  const handleSaveNew = async () => {
    if (!formData.display_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a display name.",
        variant: "destructive",
      });
      return;
    }

    const requiredFields = CREDENTIAL_FIELDS[formData.processor_type] || [];
    const missingFields = requiredFields
      .filter(f => !f.key.includes("sandbox") && !f.key.includes("template"))
      .filter(f => !formData.credentials[f.key]);

    if (missingFields.length > 0) {
      toast({
        title: "Validation Error",
        description: `Please fill in: ${missingFields.map(f => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/payment-processors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processor_type: formData.processor_type,
          display_name: formData.display_name,
          credentials: formData.credentials,
          webhook_secret: formData.webhook_secret || undefined,
          is_default: formData.is_default,
        }),
      });

      if (response.ok) {
        toast({
          title: "Processor added",
          description: "Payment processor has been configured successfully.",
        });
        setShowAddDialog(false);
        loadProcessors();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || "Failed to add processor.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add processor.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedConfig) return;

    try {
      setSaving(true);
      const updateData: Record<string, unknown> = {
        display_name: formData.display_name,
        is_default: formData.is_default,
      };

      // Only update credentials if any were provided
      const hasCredentials = Object.values(formData.credentials).some(v => v);
      if (hasCredentials) {
        updateData.credentials = formData.credentials;
      }

      if (formData.webhook_secret) {
        updateData.webhook_secret = formData.webhook_secret;
      }

      const response = await fetch(`/api/payment-processors/${selectedConfig.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        toast({
          title: "Processor updated",
          description: "Payment processor has been updated successfully.",
        });
        setShowEditDialog(false);
        loadProcessors();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || "Failed to update processor.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update processor.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedConfig) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/payment-processors/${selectedConfig.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Processor removed",
          description: "Payment processor has been removed.",
        });
        setShowDeleteDialog(false);
        loadProcessors();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || "Failed to remove processor.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove processor.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCredentialFields = (processorType: string, isEdit: boolean = false) => {
    const fields = CREDENTIAL_FIELDS[processorType] || [];

    return (
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            {field.key.includes("sandbox") || field.key.includes("template") || field.key.includes("include") ? (
              <Select
                value={formData.credentials[field.key] || "false"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    credentials: { ...formData.credentials, [field.key]: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="relative">
                <Input
                  id={field.key}
                  type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                  value={formData.credentials[field.key] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, [field.key]: e.target.value },
                    })
                  }
                  placeholder={isEdit ? "(unchanged)" : field.placeholder}
                />
                {field.secret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => toggleSecretVisibility(field.key)}
                  >
                    {showSecrets[field.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Payment Processors</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configure payment processors for invoice payment links
          </p>
        </div>
        <Button onClick={handleAddNew} className="bg-zinc-900 hover:bg-zinc-800">
          <Plus className="w-4 h-4 mr-2" />
          Add Processor
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="border-sky-200 bg-sky-50">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <CreditCard className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-sky-800">Link-Out Payment System</p>
              <p className="text-sm text-sky-700 mt-1">
                PearSign uses a secure link-out payment system. When customers pay an invoice,
                they are redirected to your payment processor's hosted page. No credit card data
                ever touches our servers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configured Processors */}
      {configs.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center">
            <CreditCard className="w-12 h-12 mx-auto text-zinc-300 mb-4" />
            <h3 className="font-medium text-zinc-900 mb-2">No payment processors configured</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Add a payment processor to enable payment links on your invoices.
            </p>
            <Button onClick={handleAddNew}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Processor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card
              key={config.id}
              className={cn(
                "transition-all",
                !config.is_active && "opacity-60"
              )}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  {/* Processor Icon */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center text-white",
                      PROCESSOR_COLORS[config.processor_type]
                    )}
                  >
                    {PROCESSOR_ICONS[config.processor_type]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-zinc-900">{config.display_name}</h3>
                      {config.is_default && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <Star className="w-3 h-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      {!config.is_active && (
                        <Badge variant="outline" className="bg-zinc-100 text-zinc-500">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 capitalize">
                      {config.processor_type.replace("_", " ")}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 px-3">
                    {config.has_credentials ? (
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <Check className="w-4 h-4" />
                        <span className="text-sm">Configured</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">Needs setup</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!config.is_default && config.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(config.id)}
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(config)}
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(config)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Available Processors */}
      <div className="pt-6">
        <h3 className="text-lg font-medium text-zinc-900 mb-4">Available Processors</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {availableTypes.map((proc) => {
            const isConfigured = configs.some(c => c.processor_type === proc.type);
            return (
              <Card key={proc.type} className="hover:border-zinc-300 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white",
                        PROCESSOR_COLORS[proc.type]
                      )}
                    >
                      {PROCESSOR_ICONS[proc.type]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-zinc-900">{proc.name}</h4>
                        {isConfigured && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                            <Check className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">{proc.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Add Processor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Processor</DialogTitle>
            <DialogDescription>
              Configure a new payment processor for invoice payment links.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="processor_type">Processor Type</Label>
              <Select
                value={formData.processor_type}
                onValueChange={(value) => {
                  setFormData({
                    ...formData,
                    processor_type: value,
                    credentials: {},
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((proc) => (
                    <SelectItem key={proc.type} value={proc.type}>
                      {proc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData({ ...formData, display_name: e.target.value })
                }
                placeholder="e.g., Primary Stripe Account"
              />
            </div>

            {renderCredentialFields(formData.processor_type)}

            <div className="space-y-2">
              <Label htmlFor="webhook_secret">Webhook Secret (Optional)</Label>
              <Input
                id="webhook_secret"
                type="password"
                value={formData.webhook_secret}
                onChange={(e) =>
                  setFormData({ ...formData, webhook_secret: e.target.value })
                }
                placeholder="whsec_..."
              />
              <p className="text-xs text-zinc-500">
                Used to verify webhook payloads from the payment processor.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <Label htmlFor="is_default" className="text-sm font-medium">
                  Set as default
                </Label>
                <p className="text-xs text-zinc-500">
                  Use this processor for new payment links
                </p>
              </div>
              <Switch
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_default: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNew} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Add Processor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Processor Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment Processor</DialogTitle>
            <DialogDescription>
              Update the configuration for this payment processor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_display_name">Display Name</Label>
              <Input
                id="edit_display_name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData({ ...formData, display_name: e.target.value })
                }
                placeholder="e.g., Primary Stripe Account"
              />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-zinc-700 mb-3">
                Update Credentials
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                Leave fields empty to keep existing credentials.
              </p>
              {selectedConfig && renderCredentialFields(selectedConfig.processor_type, true)}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_webhook_secret">Webhook Secret</Label>
              <Input
                id="edit_webhook_secret"
                type="password"
                value={formData.webhook_secret}
                onChange={(e) =>
                  setFormData({ ...formData, webhook_secret: e.target.value })
                }
                placeholder="(unchanged)"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <Label htmlFor="edit_is_default" className="text-sm font-medium">
                  Set as default
                </Label>
                <p className="text-xs text-zinc-500">
                  Use this processor for new payment links
                </p>
              </div>
              <Switch
                id="edit_is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_default: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Payment Processor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{selectedConfig?.display_name}"?
              Existing payment links using this processor will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Processor"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
