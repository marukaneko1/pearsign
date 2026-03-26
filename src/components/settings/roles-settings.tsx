"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Shield,
  Users,
  FileText,
  Settings,
  CreditCard,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  Lock,
  Info,
  Loader2,
} from "lucide-react";
import {
  settingsApi,
  type Role,
  type Permission,
  ALL_PERMISSIONS,
} from "@/lib/settings-api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const categoryIcons: Record<string, React.ElementType> = {
  documents: FileText,
  templates: LayoutTemplate,
  team: Users,
  settings: Settings,
  billing: CreditCard,
};

const categoryLabels: Record<string, string> = {
  documents: "Documents",
  templates: "Templates",
  team: "Team Management",
  settings: "Settings",
  billing: "Billing",
};

export function RolesSettings() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["documents", "templates", "team"]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getRoles();
      setRoles(data);
      if (!selectedRole && data.length > 0) {
        setSelectedRole(data[0]);
      }
    } catch (error) {
      toast({
        title: "Error loading roles",
        description: error instanceof Error ? error.message : "Failed to load roles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedRole]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Group permissions by category
  const permissionsByCategory = ALL_PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const hasPermission = (permissionId: string) => {
    return selectedRole?.permissions.some(p => p.id === permissionId) || false;
  };

  const getCategoryPermissionCount = (category: string) => {
    const total = permissionsByCategory[category]?.length || 0;
    const granted = permissionsByCategory[category]?.filter(p => hasPermission(p.id)).length || 0;
    return { granted, total };
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Roles & Permissions</h2>
        <p className="text-muted-foreground">
          Define what each role can do in your organization
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Roles List */}
          <Card className="lg:col-span-1 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Roles</CardTitle>
              <CardDescription>Select a role to view permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                    selectedRole?.id === role.id
                      ? "bg-[hsl(var(--pearsign-primary))]/10 border border-[hsl(var(--pearsign-primary))]/30"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    selectedRole?.id === role.id
                      ? "bg-[hsl(var(--pearsign-primary))] text-white"
                      : "bg-muted"
                  )}>
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium truncate",
                      selectedRole?.id === role.id && "text-[hsl(var(--pearsign-primary))]"
                    )}>
                      {role.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {role.permissions.length} permissions
                    </p>
                  </div>
                  {role.isSystem && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Permissions View */}
          <Card className="lg:col-span-3 border-border/50">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {selectedRole?.name}
                    {selectedRole?.isSystem && (
                      <Badge variant="secondary" className="font-normal">
                        <Lock className="h-3 w-3 mr-1" />
                        System Role
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{selectedRole?.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {selectedRole?.isSystem && (
                <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    System roles cannot be modified. Create a custom role for different permissions.
                  </p>
                </div>
              )}

              <div className="divide-y">
                {Object.entries(permissionsByCategory).map(([category, permissions]) => {
                  const Icon = categoryIcons[category] || Settings;
                  const isExpanded = expandedCategories.includes(category);
                  const { granted, total } = getCategoryPermissionCount(category);
                  const allGranted = granted === total;

                  return (
                    <div key={category}>
                      {/* Category Header */}
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{categoryLabels[category]}</p>
                          <p className="text-sm text-muted-foreground">
                            {granted} of {total} permissions granted
                          </p>
                        </div>
                        <Badge
                          variant={allGranted ? "default" : "secondary"}
                          className={cn(
                            "font-normal",
                            allGranted
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                              : ""
                          )}
                        >
                          {allGranted ? "Full Access" : `${granted}/${total}`}
                        </Badge>
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>

                      {/* Permissions List */}
                      {isExpanded && (
                        <div className="px-6 pb-4 space-y-3 bg-muted/20">
                          {permissions.map((permission) => {
                            const isGranted = hasPermission(permission.id);

                            return (
                              <div
                                key={permission.id}
                                className={cn(
                                  "flex items-center gap-4 p-3 rounded-lg",
                                  isGranted ? "bg-green-50 dark:bg-green-950/30" : "bg-background"
                                )}
                              >
                                <Checkbox
                                  id={permission.id}
                                  checked={isGranted}
                                  disabled={selectedRole?.isSystem}
                                  className={cn(
                                    isGranted && "data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                  )}
                                />
                                <div className="flex-1">
                                  <Label
                                    htmlFor={permission.id}
                                    className={cn(
                                      "font-medium cursor-pointer",
                                      selectedRole?.isSystem && "cursor-not-allowed opacity-70"
                                    )}
                                  >
                                    {permission.name}
                                  </Label>
                                  <p className="text-sm text-muted-foreground">
                                    {permission.description}
                                  </p>
                                </div>
                                {isGranted && (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0">
                                    Granted
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Role Comparison */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Role Comparison</CardTitle>
          <CardDescription>Quick overview of permissions across all roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Permission</th>
                  {roles.map(role => (
                    <th key={role.id} className="text-center py-3 px-4 font-medium min-w-[100px]">
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                  <>
                    <tr key={category} className="bg-muted/50">
                      <td colSpan={roles.length + 1} className="py-2 px-4 font-medium text-muted-foreground uppercase text-xs tracking-wider">
                        {categoryLabels[category]}
                      </td>
                    </tr>
                    {permissions.map(permission => (
                      <tr key={permission.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-4">{permission.name}</td>
                        {roles.map(role => {
                          const hasIt = role.permissions.some(p => p.id === permission.id);
                          return (
                            <td key={role.id} className="text-center py-2 px-4">
                              {hasIt ? (
                                <span className="inline-block w-5 h-5 rounded-full bg-green-100 dark:bg-green-950 text-green-600">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-block w-5 h-5 rounded-full bg-muted text-muted-foreground">
                                  -
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
