"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/contexts/tenant-context";
import { useTenantSession } from "@/contexts/tenant-session-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Building2,
  Users,
  FileText,
  Mail,
  MessageSquare,
  Webhook,
  Crown,
  Shield,
  User,
  Eye,
  MoreHorizontal,
  UserPlus,
  Settings,
  CreditCard,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Copy,
  Check,
  Pencil,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface TenantData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface UsageData {
  envelopesSent: number;
  smsSent: number;
  apiCalls: number;
  storageBytes: number;
}

interface TeamMemberData {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
  joinedAt: string;
}

const PLAN_LIMITS: Record<string, { envelopes: number; templates: number; teamMembers: number; sms: number; apiCalls: number }> = {
  free: { envelopes: 5, templates: 3, teamMembers: 1, sms: 0, apiCalls: 100 },
  starter: { envelopes: 100, templates: 25, teamMembers: 5, sms: 100, apiCalls: 5000 },
  professional: { envelopes: 500, templates: 100, teamMembers: 15, sms: 500, apiCalls: 10000 },
  enterprise: { envelopes: -1, templates: -1, teamMembers: -1, sms: -1, apiCalls: -1 },
};

const PLAN_PRICES: Record<string, { monthly: number; label: string }> = {
  free: { monthly: 0, label: "Free" },
  starter: { monthly: 19, label: "Starter" },
  professional: { monthly: 49, label: "Professional" },
  enterprise: { monthly: 0, label: "Enterprise" },
};

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

const ROLE_COLORS = {
  owner: "text-amber-500 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  admin: "text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
  member: "text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700",
  viewer: "text-gray-400 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  deactivated: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function TenantAdminDashboard() {
  const { currentTenant, currentRole, planFeatures, hasPermission, isDemo } = useTenant();
  const { refreshSession } = useTenantSession();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [tenantData, setTenantData] = useState<TenantData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [team, setTeam] = useState<TeamMemberData[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [copiedAccountId, setCopiedAccountId] = useState(false);
  const [billingData, setBillingData] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const response = await fetch('/api/analytics/dashboard', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadBillingData = useCallback(async () => {
    setBillingLoading(true);
    try {
      const response = await fetch('/api/billing', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setBillingData(data);
      }
    } catch (e) {
      console.error('Failed to load billing data:', e);
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/tenant/settings", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load organization data");
      }

      const data = await response.json();
      if (data.success) {
        setTenantData(data.tenant);
        setUsage(data.usage);
        setTeam(data.team || []);
      }
    } catch (error) {
      console.error("[OrgDashboard] Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo && currentTenant) {
      loadData();
      loadBillingData();
      loadAnalytics();
    } else {
      setIsLoading(false);
    }
  }, [isDemo, currentTenant, loadData, loadBillingData, loadAnalytics]);

  if (isDemo) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">Sign In Required</h3>
          <p className="text-muted-foreground mb-4">
            Create an account or sign in to manage your organization.
          </p>
          <Button asChild>
            <a href="/login">Sign In</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!currentTenant) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasPermission("canManageSettings") && !hasPermission("canManageTeam")) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">
            You don&apos;t have permission to view organization settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCopyAccountId = async () => {
    const id = tenantData?.id || currentTenant?.id;
    if (id) {
      await navigator.clipboard.writeText(id);
      setCopiedAccountId(true);
      setTimeout(() => setCopiedAccountId(false), 2000);
    }
  };

  const displayName = tenantData?.name || currentTenant.name;
  const displayPlan = tenantData?.plan || currentTenant.plan;
  const displayId = tenantData?.id || currentTenant?.id || "";
  const displayAccountId = displayId.length > 24
    ? `${displayId.substring(0, 12)}...${displayId.substring(displayId.length - 8)}`
    : displayId;

  const limits = PLAN_LIMITS[displayPlan] || PLAN_LIMITS.free;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            {displayName}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditNameDialogOpen(true)}
              data-testid="button-edit-org-name"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </h1>
          <p className="text-muted-foreground mt-1">
            Organization dashboard and settings
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Account ID</span>
            <button
              onClick={handleCopyAccountId}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted hover-elevate group"
              title="Click to copy full Account ID"
              data-testid="button-copy-account-id"
            >
              <code className="text-xs font-mono text-muted-foreground" data-testid="text-account-id">
                {displayAccountId}
              </code>
              {copiedAccountId ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" data-testid="text-org-plan">
            {displayPlan} plan
          </Badge>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setChangePlanDialogOpen(true)} data-testid="button-change-plan">
            <CreditCard className="h-4 w-4" />
            Change Plan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <UsageCard title="Envelopes" icon={FileText} used={usage?.envelopesSent || 0} limit={limits.envelopes} loading={isLoading} />
        <UsageCard title="Templates" icon={FileText} used={0} limit={limits.templates} loading={isLoading} />
        <UsageCard title="Team Members" icon={Users} used={team.length} limit={limits.teamMembers} loading={isLoading} />
        <UsageCard title="SMS Sent" icon={MessageSquare} used={usage?.smsSent || 0} limit={limits.sms} loading={isLoading} />
        <UsageCard title="API Calls" icon={Webhook} used={usage?.apiCalls || 0} limit={limits.apiCalls} loading={isLoading} />
      </div>

      <Tabs defaultValue="team" className="space-y-4">
        <TabsList>
          <TabsTrigger value="team" className="gap-2" data-testid="tab-team">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold">Team Members</h3>
              <p className="text-sm text-muted-foreground">
                Manage who has access to this organization
              </p>
            </div>
            <Button onClick={() => setInviteDialogOpen(true)} className="gap-2" data-testid="button-invite-member">
              <UserPlus className="h-4 w-4" />
              Invite Member
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {isLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : team.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No team members found
                  </div>
                ) : (
                  team.map((member) => (
                    <TeamMemberRow key={member.id} member={member} currentRole={currentRole} />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  Your organization is on the {displayPlan} plan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-2xl font-bold capitalize" data-testid="text-current-plan">{displayPlan}</p>
                    <p className="text-sm text-muted-foreground">
                      {displayPlan === "enterprise" ? "Custom pricing" : `$${PLAN_PRICES[displayPlan]?.monthly || 0}/mo`}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setChangePlanDialogOpen(true)} data-testid="button-change-plan-billing">Change Plan</Button>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Plan Features</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {limits.envelopes === -1 ? "Unlimited" : limits.envelopes} envelopes/month
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {limits.templates === -1 ? "Unlimited" : limits.templates} templates
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {limits.teamMembers === -1 ? "Unlimited" : limits.teamMembers} team members
                    </li>
                    {planFeatures?.customBranding && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Custom branding
                      </li>
                    )}
                    {planFeatures?.bulkSend && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Bulk send
                      </li>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Information</CardTitle>
                <CardDescription>
                  Manage your payment methods and invoices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {billingLoading ? (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : billingData?.paymentMethods?.length > 0 ? (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    {billingData.paymentMethods.map((pm: any, idx: number) => (
                      <div key={pm.id || idx} className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {pm.brand || pm.type || 'Card'} •••• {pm.last4 || '****'}
                          </p>
                          {pm.expMonth && pm.expYear && (
                            <p className="text-xs text-muted-foreground">
                              Expires {pm.expMonth}/{pm.expYear}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/billing', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ action: 'createPortal' }),
                          });
                          const data = await response.json();
                          if (data.portalUrl) {
                            window.location.href = data.portalUrl;
                          }
                        } catch (e) {
                          toast({ title: 'Error', description: 'Failed to open billing portal', variant: 'destructive' });
                        }
                      }}
                    >
                      Manage Payment Methods
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No payment method on file
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/billing', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ action: 'createPortal' }),
                          });
                          const data = await response.json();
                          if (data.portalUrl) {
                            window.location.href = data.portalUrl;
                          }
                        } catch (e) {
                          toast({ title: 'Error', description: 'Failed to open billing portal', variant: 'destructive' });
                        }
                      }}
                    >
                      Add Payment Method
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Recent Invoices</h4>
                  {billingLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : billingData?.recentInvoices?.length > 0 ? (
                    <div className="space-y-2">
                      {billingData.recentInvoices.map((inv: any, idx: number) => (
                        <div key={inv.id || idx} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span>{inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">
                              {typeof inv.amount === 'number' ? `$${(inv.amount / 100).toFixed(2)}` : inv.amount || '—'}
                            </span>
                            <Badge variant="secondary" className={inv.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}>
                              {inv.status || 'unknown'}
                            </Badge>
                            {inv.url && (
                              <a href={inv.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No invoices yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {analyticsLoading ? (
            <Card>
              <CardContent className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : analyticsData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                    <p className="text-2xl font-bold">{analyticsData.stats?.totalDocuments || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold">{analyticsData.stats?.thisMonthDocuments || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Completion Rate</p>
                    <p className="text-2xl font-bold">{analyticsData.stats?.completionRate || 0}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Avg. Completion Time</p>
                    <p className="text-2xl font-bold">{analyticsData.stats?.avgCompletionTime || '—'}h</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly Document Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analyticsData.charts?.monthlyTrend || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="sent" name="Sent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill="hsl(var(--chart-2, 142 76% 36%))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Document Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analyticsData.charts?.statusBreakdown || []}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                        >
                          {(analyticsData.charts?.statusBreakdown || []).map((_: any, i: number) => (
                            <Cell key={i} fill={['hsl(var(--chart-1, 220 70% 50%))', 'hsl(var(--chart-2, 142 76% 36%))', 'hsl(var(--chart-3, 30 80% 55%))'][i % 3]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="h-64 flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No analytics data available yet</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <InviteDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />

      <EditNameDialog
        open={editNameDialogOpen}
        onOpenChange={setEditNameDialogOpen}
        currentName={displayName}
        onSaved={(newName) => {
          setTenantData((prev) => prev ? { ...prev, name: newName } : prev);
          toast({ title: "Organization name updated", description: `Changed to "${newName}"` });
          refreshSession();
        }}
      />

      <ChangePlanDialog
        open={changePlanDialogOpen}
        onOpenChange={setChangePlanDialogOpen}
        currentPlan={displayPlan}
        onSaved={(newPlan) => {
          setTenantData((prev) => prev ? { ...prev, plan: newPlan } : prev);
          toast({ title: "Plan updated", description: `Changed to ${newPlan}` });
          refreshSession();
        }}
      />
    </div>
  );
}

function UsageCard({ title, icon: Icon, used, limit, loading }: {
  title: string;
  icon: React.ElementType;
  used: number;
  limit: number;
  loading?: boolean;
}) {
  const percentage = limit === -1 ? 0 : limit === 0 ? 0 : Math.round((used / limit) * 100);
  const isWarning = percentage >= 80;
  const isUnlimited = limit === -1;

  return (
    <Card>
      <CardContent className="pt-4">
        {loading ? (
          <div className="h-16 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4" />
                {title}
              </div>
              {isWarning && !isUnlimited && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{used.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">
                / {isUnlimited ? "\u221E" : limit.toLocaleString()}
              </span>
            </div>
            {!isUnlimited && limit > 0 && (
              <Progress
                value={percentage}
                className={`h-1.5 mt-2 ${isWarning ? "[&>div]:bg-amber-500" : ""}`}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TeamMemberRow({ member, currentRole }: {
  member: TeamMemberData;
  currentRole: "owner" | "admin" | "member" | "viewer" | null;
}) {
  const RoleIcon = ROLE_ICONS[member.role] || User;
  const canManage = currentRole === "owner" || (currentRole === "admin" && member.role !== "owner");
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
  const initials = member.firstName && member.lastName
    ? `${member.firstName[0]}${member.lastName[0]}`
    : member.email[0]?.toUpperCase() || "?";

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap" data-testid={`row-team-member-${member.id}`}>
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{name}</p>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${ROLE_COLORS[member.role] || ""}`}>
              <RoleIcon className="h-3 w-3 mr-1" />
              {member.role}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Badge variant="secondary" className={STATUS_COLORS[member.status] || ""}>
          {member.status}
        </Badge>

        {member.joinedAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(member.joinedAt).toLocaleDateString()}
          </div>
        )}

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Change Role</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                {member.status === "active" ? "Deactivate" : "Remove"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInvite = async () => {
    if (!email) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/settings/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, role }),
      });

      if (response.ok) {
        toast({ title: "Invitation sent", description: `Invite sent to ${email}` });
        setEmail("");
        setRole("member");
        onOpenChange(false);
      } else {
        const data = await response.json();
        toast({ title: "Failed to send invite", description: data.error || "Please try again", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send invitation", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-invite-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger data-testid="select-invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin - Full access except billing</SelectItem>
                <SelectItem value="member">Member - Send documents & manage templates</SelectItem>
                <SelectItem value="viewer">Viewer - View-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleInvite} disabled={!email || isSubmitting} data-testid="button-send-invite">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
            ) : (
              <><Mail className="h-4 w-4 mr-2" /> Send Invitation</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditNameDialog({ open, onOpenChange, currentName, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/tenant/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "updateName", name: name.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        onSaved(name.trim());
        onOpenChange(false);
      } else {
        toast({ title: "Error", description: data.error || "Failed to update name", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update organization name", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Organization Name</DialogTitle>
          <DialogDescription>
            Change the name of your organization
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Organization"
              maxLength={100}
              data-testid="input-org-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || name.trim() === currentName || isSaving} data-testid="button-save-org-name">
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePlanDialog({ open, onOpenChange, currentPlan, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  onSaved: (plan: string) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setSelectedPlan(currentPlan);
  }, [open, currentPlan]);

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0/mo",
      features: ["5 envelopes/month", "3 templates", "1 team member", "Basic support"],
    },
    {
      id: "starter",
      name: "Starter",
      price: "$19/mo",
      features: ["100 envelopes/month", "25 templates", "5 team members", "Email support", "100 SMS/month"],
    },
    {
      id: "professional",
      name: "Professional",
      price: "$49/mo",
      features: ["500 envelopes/month", "100 templates", "15 team members", "Priority support", "500 SMS/month", "Custom branding", "Bulk send", "API access"],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      features: ["Unlimited envelopes", "Unlimited templates", "Unlimited team members", "Dedicated support", "Unlimited SMS", "Custom branding", "Bulk send", "Full API access", "SSO/SAML"],
    },
  ];

  const handleSave = async () => {
    if (selectedPlan === currentPlan) return;
    setIsSaving(true);
    try {
      if (selectedPlan !== 'free') {
        const response = await fetch('/api/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'createCheckout', plan: selectedPlan }),
        });
        const data = await response.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        if (data.error) {
          toast({ title: 'Error', description: data.error, variant: 'destructive' });
          return;
        }
      }

      const response = await fetch("/api/tenant/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "changePlan", newPlan: selectedPlan }),
      });

      const data = await response.json();
      if (data.success) {
        onSaved(selectedPlan);
        onOpenChange(false);
      } else {
        toast({ title: "Error", description: data.error || "Failed to change plan", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to change plan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change Plan</DialogTitle>
          <DialogDescription>
            Select a plan for your organization
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto py-2">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const isCurrent = currentPlan === plan.id;

            return (
              <Card
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`cursor-pointer p-4 ${
                  isSelected
                    ? "ring-2 ring-primary"
                    : "hover-elevate"
                }`}
                data-testid={`button-plan-${plan.id}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="font-semibold">{plan.name}</h4>
                  {isCurrent && <Badge variant="secondary" className="text-xs">Current</Badge>}
                </div>
                <p className="text-lg font-bold mb-3" data-testid={`text-plan-price-${plan.id}`}>{plan.price}</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={selectedPlan === currentPlan || isSaving} data-testid="button-confirm-plan-change">
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Confirm Plan Change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
