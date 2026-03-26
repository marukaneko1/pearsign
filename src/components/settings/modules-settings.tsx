"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, HardDrive, Users, Zap, Sparkles, Plug, Palette, Shield, Bell, Code, Info, Check, Crown } from "lucide-react";

interface ModuleData {
  id: string;
  name: string;
  description: string;
  category: "core" | "tools" | "settings" | "advanced";
  requiredPlan?: "free" | "professional" | "enterprise";
  enabled: boolean;
  settings: Record<string, unknown>;
}

const moduleIcons: Record<string, React.ElementType> = {
  "storage-billing": HardDrive,
  "bulk-send": Users,
  "fusion-forms": Zap,
  "ai-generator": Sparkles,
  "integrations": Plug,
  "team-management": Users,
  "branding": Palette,
  "compliance": Shield,
  "notifications": Bell,
  "api-access": Code,
};

const categoryLabels: Record<string, string> = {
  core: "Core Features",
  tools: "Tools & Productivity",
  settings: "Settings & Configuration",
  advanced: "Advanced Features",
};

export function ModulesSettings() {
  const { toast } = useToast();
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await fetch("/api/settings/modules");
      if (response.ok) {
        const data = await response.json();
        setModules(Array.isArray(data) ? data : []);
      } else {
        setLoadError('Failed to load module settings');
      }
    } catch (error) {
      console.error("Error loading modules:", error);
      setLoadError('Could not connect to server');
      toast({ title: "Error loading modules", description: "Failed to load module settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const handleToggleModule = async (moduleId: string, enabled: boolean) => {
    setUpdating(moduleId);
    try {
      const response = await fetch("/api/settings/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, enabled }),
      });
      if (response.ok === false) throw new Error("Failed to update module");
      const updated = await response.json();
      setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, enabled: updated.enabled } : m)));
      toast({ title: enabled ? "Module enabled" : "Module disabled", description: updated.name + " has been " + (enabled ? "enabled" : "disabled") });
    } catch (error) {
      console.error("Error updating module:", error);
      toast({ title: "Error updating module", description: "Failed to update module settings", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        <p>{loadError}</p>
        <Button variant="outline" size="sm" onClick={loadModules} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const groupedModules = modules.reduce((acc, module) => {
    const category = module.category || "core";
    if (acc[category] === undefined) acc[category] = [];
    acc[category].push(module);
    return acc;
  }, {} as Record<string, ModuleData[]>);

  const enabledCount = modules.filter((m) => m.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Modules</h2>
        <p className="text-muted-foreground">Enable or disable features for your organization</p>
      </div>

      <Card className="border-[hsl(var(--pearsign-primary))]/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Module Management</CardTitle>
                <CardDescription>{enabledCount} of {modules.length} modules enabled</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="text-sm">
              <Check className="h-3 w-3 mr-1" />{enabledCount} Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-[hsl(var(--pearsign-primary))]/5 border border-[hsl(var(--pearsign-primary))]/20 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-[hsl(var(--pearsign-primary))] shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Multi-tenancy Ready</p>
                <p className="text-muted-foreground">Modules can be enabled or disabled per organization. Disabled modules will be hidden from the sidebar and settings.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {Object.entries(groupedModules).map(([category, categoryModules]) => (
        <Card key={category} className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">{categoryLabels[category] || category}</CardTitle>
            <CardDescription>{categoryModules.filter((m) => m.enabled).length} of {categoryModules.length} enabled</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryModules.map((module) => {
              const Icon = moduleIcons[module.id] || Zap;
              const isUpdating = updating === module.id;
              return (
                <div key={module.id} className={"flex items-center justify-between p-4 rounded-xl border transition-colors " + (module.enabled ? "bg-[hsl(var(--pearsign-primary))]/5 border-[hsl(var(--pearsign-primary))]/20" : "bg-muted/30 border-border/50")}>
                  <div className="flex items-center gap-4">
                    <div className={"h-10 w-10 rounded-lg flex items-center justify-center " + (module.enabled ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white" : "bg-muted text-muted-foreground")}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{module.name}</h4>
                        {module.requiredPlan && module.requiredPlan !== "free" && (
                          <Badge variant="secondary" className="text-[10px]">
                            {module.requiredPlan === "enterprise" && <Crown className="h-3 w-3 mr-1" />}
                            {module.requiredPlan.charAt(0).toUpperCase() + module.requiredPlan.slice(1)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Switch checked={module.enabled} onCheckedChange={(checked) => handleToggleModule(module.id, checked)} />}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" size="sm" onClick={loadModules}>Refresh</Button>
        </CardContent>
      </Card>
    </div>
  );
}
