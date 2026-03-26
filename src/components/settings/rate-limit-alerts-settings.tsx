"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  XCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Mail,
  BellRing,
  Settings,
  Gauge,
  Clock,
  Key,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

interface RateLimitAlertConfig {
  id: string;
  organizationId: string;
  warningThreshold: number;
  criticalThreshold: number;
  enabled: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
  cooldownMinutes: number;
}

interface RateLimitAlert {
  id: string;
  apiKeyId: string;
  apiKeyName: string;
  alertType: "warning" | "critical" | "exceeded";
  threshold: number;
  currentUsage: number;
  limit: number;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface ApiKeyUsageStatus {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  limit: number;
  used: number;
  percentage: number;
  status: "normal" | "warning" | "critical" | "exceeded";
  lastUsedAt: string | null;
}

const statusColors = {
  normal: { bg: "bg-green-500", text: "text-green-600", border: "border-green-500" },
  warning: { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-500" },
  critical: { bg: "bg-orange-500", text: "text-orange-600", border: "border-orange-500" },
  exceeded: { bg: "bg-red-500", text: "text-red-600", border: "border-red-500" },
};

const alertTypeIcons = {
  warning: AlertTriangle,
  critical: AlertCircle,
  exceeded: XCircle,
};

export function RateLimitAlertsSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<RateLimitAlertConfig | null>(null);
  const [alerts, setAlerts] = useState<RateLimitAlert[]>([]);
  const [usageStatus, setUsageStatus] = useState<ApiKeyUsageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    warningThreshold: 75,
    criticalThreshold: 90,
    enabled: true,
    notifyEmail: true,
    notifyInApp: true,
    cooldownMinutes: 15,
  });

  const loadData = useCallback(async () => {
    try {
      const [configRes, alertsRes, usageRes] = await Promise.all([
        fetch("/api/v1/rate-limit-alerts/config"),
        fetch("/api/v1/rate-limit-alerts"),
        fetch("/api/v1/rate-limit-alerts?type=usage"),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.data);
        setFormData({
          warningThreshold: data.data.warningThreshold,
          criticalThreshold: data.data.criticalThreshold,
          enabled: data.data.enabled,
          notifyEmail: data.data.notifyEmail,
          notifyInApp: data.data.notifyInApp,
          cooldownMinutes: data.data.cooldownMinutes,
        });
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.data || []);
        setUnreadCount(data.meta?.unreadCount || 0);
      }

      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsageStatus(data.data || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error loading data",
        description: "Failed to load rate limit alert settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/rate-limit-alerts/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to save config");

      const data = await response.json();
      setConfig(data.data);

      toast({
        title: "Settings saved",
        description: "Rate limit alert settings have been updated",
      });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({
        title: "Error saving settings",
        description: "Failed to update rate limit alert settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await fetch("/api/v1/rate-limit-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-read", alertId }),
      });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking alert as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch("/api/v1/rate-limit-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all-read" }),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
      setUnreadCount(0);
      toast({ title: "All alerts marked as read" });
    } catch (error) {
      console.error("Error marking alerts as read:", error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const keysAtRisk = usageStatus.filter((k) => k.status !== "normal");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rate Limit Alerts</h2>
          <p className="text-muted-foreground">
            Get notified when API keys approach their limits
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-[hsl(var(--pearsign-primary))]/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Keys</p>
                <p className="text-2xl font-bold">{usageStatus.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                <Key className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={keysAtRisk.length > 0 ? "border-amber-500/50" : "border-green-500/20"}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Keys at Risk</p>
                <p className="text-2xl font-bold">{keysAtRisk.length}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${keysAtRisk.length > 0 ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-green-500 to-emerald-600"}`}>
                {keysAtRisk.length > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-white" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-white" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={unreadCount > 0 ? "border-red-500/50" : "border-border/50"}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unread Alerts</p>
                <p className="text-2xl font-bold">{unreadCount}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${unreadCount > 0 ? "bg-gradient-to-br from-red-500 to-rose-600" : "bg-muted"}`}>
                <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-white" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alerts Status</p>
                <p className="text-2xl font-bold">{formData.enabled ? "Active" : "Disabled"}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${formData.enabled ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-muted"}`}>
                <BellRing className={`h-5 w-5 ${formData.enabled ? "text-white" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Usage Monitor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Live Usage Monitor
          </CardTitle>
          <CardDescription>Current rate limit usage for all API keys</CardDescription>
        </CardHeader>
        <CardContent>
          {usageStatus.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No active API keys</p>
              <p className="text-sm">Create an API key to see usage statistics</p>
            </div>
          ) : (
            <div className="space-y-4">
              {usageStatus.map((key) => {
                const colors = statusColors[key.status];
                return (
                  <div
                    key={key.apiKeyId}
                    className={`p-4 rounded-xl border ${key.status !== "normal" ? colors.border : "border-border"} transition-colors`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${colors.bg}`} />
                        <div>
                          <p className="font-medium">{key.apiKeyName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}...</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={key.status === "normal" ? "secondary" : "destructive"} className="capitalize">
                          {key.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(key.percentage, 100)} className="flex-1 h-2" />
                      <span className={`text-sm font-medium ${colors.text}`}>
                        {key.used}/{key.limit} ({key.percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Alert Configuration
          </CardTitle>
          <CardDescription>Configure when and how you receive rate limit alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${formData.enabled ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600" : "bg-muted"}`}>
                <Bell className={`h-5 w-5 ${formData.enabled ? "text-white" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-medium">Enable Rate Limit Alerts</p>
                <p className="text-sm text-muted-foreground">Receive notifications when keys approach limits</p>
              </div>
            </div>
            <Switch
              checked={formData.enabled}
              onCheckedChange={(checked) => setFormData((f) => ({ ...f, enabled: checked }))}
            />
          </div>

          <Separator />

          {/* Thresholds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="warningThreshold" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Warning Threshold
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="warningThreshold"
                  type="number"
                  min={1}
                  max={99}
                  value={formData.warningThreshold}
                  onChange={(e) => setFormData((f) => ({ ...f, warningThreshold: parseInt(e.target.value) || 75 }))}
                  className="w-24"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Alert when usage reaches this percentage</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="criticalThreshold" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Critical Threshold
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="criticalThreshold"
                  type="number"
                  min={1}
                  max={100}
                  value={formData.criticalThreshold}
                  onChange={(e) => setFormData((f) => ({ ...f, criticalThreshold: parseInt(e.target.value) || 90 }))}
                  className="w-24"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Send critical alert at this level</p>
            </div>
          </div>

          <Separator />

          {/* Notification Methods */}
          <div className="space-y-4">
            <Label>Notification Methods</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-xs text-muted-foreground">Send alerts to admin email</p>
                  </div>
                </div>
                <Switch
                  checked={formData.notifyEmail}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, notifyEmail: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <BellRing className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">In-App Notifications</p>
                    <p className="text-xs text-muted-foreground">Show alerts in dashboard</p>
                  </div>
                </div>
                <Switch
                  checked={formData.notifyInApp}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, notifyInApp: checked }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Cooldown */}
          <div className="space-y-2">
            <Label htmlFor="cooldown" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Alert Cooldown
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cooldown"
                type="number"
                min={1}
                max={1440}
                value={formData.cooldownMinutes}
                onChange={(e) => setFormData((f) => ({ ...f, cooldownMinutes: parseInt(e.target.value) || 15 }))}
                className="w-24"
              />
              <span className="text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">Minimum time between duplicate alerts for the same key</p>
          </div>

          <Button onClick={handleSaveConfig} disabled={saving} className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Alert History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Alert History
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2">{unreadCount} new</Badge>
                )}
              </CardTitle>
              <CardDescription>Recent rate limit alerts</CardDescription>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                <Eye className="h-4 w-4 mr-2" />
                Mark All Read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No alerts</p>
              <p className="text-sm">Your API keys are operating within limits</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const Icon = alertTypeIcons[alert.alertType];
                const colors = statusColors[alert.alertType === "exceeded" ? "exceeded" : alert.alertType === "critical" ? "critical" : "warning"];
                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border transition-colors ${!alert.isRead ? colors.border + " bg-" + colors.bg + "/5" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">{alert.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{alert.alertType}</Badge>
                        {!alert.isRead && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMarkAsRead(alert.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
