"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  Shield,
  Settings,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  RefreshCw,
  Lock,
  DollarSign,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pause,
  Mail,
  Send,
  Eye,
  Clock,
  Plus,
  ExternalLink,
  History,
  UserPlus,
  MailPlus,
  Copy,
  Link2,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

// ============== TYPES ==============

interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];
  limits: {
    envelopes: number;
    templates: number;
    teamMembers: number;
    sms: number;
    apiCalls: number;
    storageGb: number;
  };
  featureFlags: Record<string, boolean>;
  isActive: boolean;
  displayOrder: number;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  ownerId: string;
  settings: Record<string, unknown>;
  billing: { status: string };
  usage: {
    envelopesSent: number;
    smsSent: number;
    apiCalls: number;
    storageBytes: number;
  };
  teamSize: number;
  createdAt: string;
}

interface TenantLimits {
  orgId: string;
  apiPerMinute: number;
  apiPerDay: number;
  apiPerMonth: number;
  envelopesPerMonth: number;
  templatesMax: number;
  teamMembersMax: number;
  webhooksPerDay: number;
  smsPerMonth: number;
  storageGb: number;
  customLimits: boolean;
}

interface TenantPricing {
  orgId: string;
  billingMode: 'plan' | 'custom';
  monthlyBaseFee: number;
  envelopePrice: number;
  envelopesIncluded: number;
  apiOveragePrice: number;
  apiCallsIncluded: number;
  smsPrice: number;
  discount: number;
  currency: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

interface BillingData {
  limits: TenantLimits;
  pricing: TenantPricing;
  currentUsage: {
    apiCalls: number;
    envelopesSent: number;
    smsSent: number;
  };
  projectedInvoice: {
    total: number;
    lineItems: Array<{ description: string; amount: number }>;
  };
  invoices?: Array<{
    id: string;
    stripeInvoiceId?: string;
    amount: number;
    currency: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    pdfUrl?: string;
    hostedUrl?: string;
    createdAt: string;
  }>;
}

interface Stats {
  totalTenants: number;
  activeTenants: number;
  byPlan: Record<string, number>;
  totalEnvelopes: number;
}

// ============== INVITE TYPE ==============

interface OrganizationInvite {
  id: string;
  tenantId?: string;
  tenantName: string;
  ownerEmail: string;
  ownerName?: string;
  allowedDomain?: string;
  token?: string;
  status: string;
  plan: string;
  expiresAt: string;
  createdAt: string;
}

interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ============== COMPONENT ==============

export default function AdminDashboard() {
  const { toast } = useToast();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Data states
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [planStats, setPlanStats] = useState<Record<string, { count: number; active: number }>>({});

  // Invite states
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteData, setInviteData] = useState({
    organizationName: '',
    ownerEmail: '',
    ownerName: '',
    allowedDomain: '',
    plan: 'free',
  });
  const [copiedInviteUrl, setCopiedInviteUrl] = useState<string | null>(null);
  const [lastCreatedInviteUrl, setLastCreatedInviteUrl] = useState<string | null>(null);

  // Audit log states
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // Sandbox states
  const [creatingSandbox, setCreatingSandbox] = useState<string | null>(null);

  // Demo account states
  const [demoAccountStatus, setDemoAccountStatus] = useState<{
    exists: boolean;
    user?: { email: string; name: string };
    organization?: { name: string; plan: string };
    credentials?: { email: string; password: string };
    stats?: { documents: number; teamMembers: number };
  } | null>(null);
  const [settingUpDemo, setSettingUpDemo] = useState(false);
  const [loggingInDemo, setLoggingInDemo] = useState(false);

  // Filter states
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantPlanFilter, setTenantPlanFilter] = useState("all");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");

  // Dialog states
  const [editPlanDialog, setEditPlanDialog] = useState<Plan | null>(null);
  const [editTenantDialog, setEditTenantDialog] = useState<Tenant | null>(null);
  const [tenantAction, setTenantAction] = useState("");

  // Billing dialog states
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [billingTab, setBillingTab] = useState<'limits' | 'pricing' | 'usage'>('limits');
  const [editLimits, setEditLimits] = useState<Partial<TenantLimits>>({});
  const [editPricing, setEditPricing] = useState<Partial<TenantPricing>>({});

  // Auth check
  useEffect(() => {
    const savedKey = localStorage.getItem("admin_key");
    if (savedKey) {
      setAdminKey(savedKey);
      setIsAuthenticated(true);
    }
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadPlans();
      loadTenants();
      loadInvites();
      loadAuditLogs();
    }
  }, [isAuthenticated]);

  // ============== API CALLS ==============

  const apiHeaders = {
    "Content-Type": "application/json",
    "X-Admin-Key": adminKey,
  };

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/admin/plans", { headers: apiHeaders });
      const data = await res.json();
      if (data.success) {
        setPlans(data.plans);
        setPlanStats(data.stats || {});
      }
    } catch (error) {
      console.error("Failed to load plans:", error);
    }
  };

  const loadTenants = async () => {
    try {
      const res = await fetch("/api/admin/tenants", { headers: apiHeaders });
      const data = await res.json();
      if (data.success) {
        setTenants(data.tenants);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to load tenants:", error);
    }
  };

  const loadInvites = async () => {
    try {
      const res = await fetch("/api/admin/tenants/invite", { headers: apiHeaders });
      const data = await res.json();
      if (data.success) {
        setInvites(data.invites || []);
      }
    } catch (error) {
      console.error("Failed to load invites:", error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch("/api/admin/audit?limit=50", { headers: apiHeaders });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    }
  };

  // Demo account functions
  const loadDemoAccountStatus = async () => {
    try {
      const res = await fetch("/api/admin/demo-account");
      const data = await res.json();
      setDemoAccountStatus(data);
    } catch (error) {
      console.error("Failed to load demo account status:", error);
    }
  };

  const setupDemoAccount = async () => {
    setSettingUpDemo(true);
    try {
      const res = await fetch("/api/admin/demo-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Demo Account Ready",
          description: `Email: ${data.credentials.email} | Password: ${data.credentials.password}`,
        });
        loadDemoAccountStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Setup Failed",
        description: error instanceof Error ? error.message : "Failed to setup demo account",
        variant: "destructive",
      });
    } finally {
      setSettingUpDemo(false);
    }
  };

  const loginAsDemoUser = async () => {
    setLoggingInDemo(true);
    try {
      const res = await fetch("/api/admin/demo-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Logged in as Demo User",
          description: `Welcome, ${data.user.name}!`,
        });
        // Redirect to dashboard
        window.location.href = data.redirectTo || "/";
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Failed to login as demo user",
        variant: "destructive",
      });
    } finally {
      setLoggingInDemo(false);
    }
  };

  // Load demo account status when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadDemoAccountStatus();
    }
  }, [isAuthenticated]);

  const sendOrganizationInvite = async () => {
    if (!inviteData.organizationName || !inviteData.ownerEmail) {
      toast({ title: "Error", description: "Organization name and owner email are required", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/tenants/invite", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(inviteData),
      });
      const data = await res.json();

      if (data.success) {
        const inviteUrl = data.invite?.inviteUrl;
        if (inviteUrl) {
          setLastCreatedInviteUrl(inviteUrl);
        }
        toast({
          title: "Invite created",
          description: `Invite link generated for ${inviteData.organizationName}${data.emailSent ? ' and emailed to ' + inviteData.ownerEmail : ''}`
        });
        setShowInviteDialog(false);
        setInviteData({ organizationName: '', ownerEmail: '', ownerName: '', allowedDomain: '', plan: 'free' });
        loadInvites();
        loadAuditLogs();
      } else {
        throw new Error(data.error || 'Failed to send invite');
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to send invite", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resendInvite = async (inviteId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/tenants/invite", {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify({ inviteId, action: 'resend' }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "Invite resent", description: data.message });
        loadInvites();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to resend invite", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/tenants/invite", {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify({ inviteId, action: 'cancel' }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "Invite cancelled", description: data.message });
        loadInvites();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to cancel invite", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const enterSandbox = async (tenantId: string) => {
    setCreatingSandbox(tenantId);
    try {
      const res = await fetch("/api/admin/sandbox", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ tenantId, durationMinutes: 60 }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "Sandbox ready", description: `Viewing ${data.session.tenantName}` });
        // Navigate to sandbox view
        router.push(`/admin/sandbox?tenantId=${tenantId}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to enter sandbox", variant: "destructive" });
    } finally {
      setCreatingSandbox(null);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/plans", {
        headers: { "X-Admin-Key": adminKey },
      });
      if (res.ok) {
        localStorage.setItem("admin_key", adminKey);
        setIsAuthenticated(true);
        toast({ title: "Authenticated", description: "Welcome to the admin dashboard" });
      } else {
        toast({ title: "Invalid key", description: "Please check your admin key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to authenticate", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_key");
    setAdminKey("");
    setIsAuthenticated(false);
    setPlans([]);
    setTenants([]);
    setStats(null);
  };

  const updatePlan = async (plan: Plan) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify(plan),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Plan updated", description: `${plan.name} has been updated` });
        loadPlans();
        setEditPlanDialog(null);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update plan", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Load billing data for a tenant
  const loadBillingData = async (tenantId: string) => {
    setLoadingBilling(true);
    try {
      const res = await fetch(`/api/admin/tenants/billing?tenantId=${tenantId}`, { headers: apiHeaders });
      const data = await res.json();
      if (data.success) {
        setBillingData(data);
        setEditLimits(data.limits || {});
        setEditPricing(data.pricing || {});
      } else {
        // Initialize tables if needed
        await fetch('/api/admin/tenants/billing', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ action: 'init' }),
        });
        // Retry
        const retryRes = await fetch(`/api/admin/tenants/billing?tenantId=${tenantId}`, { headers: apiHeaders });
        const retryData = await retryRes.json();
        if (retryData.success) {
          setBillingData(retryData);
          setEditLimits(retryData.limits || {});
          setEditPricing(retryData.pricing || {});
        }
      }
    } catch (error) {
      console.error("Failed to load billing data:", error);
      toast({ title: "Error", description: "Failed to load billing data", variant: "destructive" });
    } finally {
      setLoadingBilling(false);
    }
  };

  // Save limits
  const saveLimits = async (tenantId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tenants/billing', {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ tenantId, action: 'setLimits', ...editLimits }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Custom limits applied" });
        loadBillingData(tenantId);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save limits", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Save pricing
  const savePricing = async (tenantId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tenants/billing', {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ tenantId, action: 'setPricing', ...editPricing }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Custom pricing applied" });
        loadBillingData(tenantId);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save pricing", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear limits
  const clearLimits = async (tenantId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tenants/billing', {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ tenantId, action: 'clearLimits' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Limits reset to plan defaults" });
        loadBillingData(tenantId);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to clear limits", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const performTenantAction = async (tenantId: string, action: string, data: Record<string, unknown>) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify({ tenantId, action, ...data }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Success", description: result.message });
        loadTenants();
        setEditTenantDialog(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update tenant", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter tenants
  const filteredTenants = tenants.filter((t) => {
    if (tenantSearch && !t.name.toLowerCase().includes(tenantSearch.toLowerCase()) &&
        !t.slug.toLowerCase().includes(tenantSearch.toLowerCase())) {
      return false;
    }
    if (tenantPlanFilter !== "all" && t.plan !== tenantPlanFilter) return false;
    if (tenantStatusFilter !== "all" && t.status !== tenantStatusFilter) return false;
    return true;
  });

  // ============== LOGIN SCREEN ==============

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#2464ea] flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">PearSign Admin</CardTitle>
            <CardDescription>Enter your admin key to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminKey">Admin Key</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="adminKey"
                  type="password"
                  placeholder="Enter ADMIN_SECRET_KEY"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-gray-500">
                Set ADMIN_SECRET_KEY in your environment variables
              </p>
            </div>
            <Button
              onClick={handleLogin}
              disabled={!adminKey || isLoading}
              className="w-full bg-[#2464ea] hover:bg-blue-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Access Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============== ADMIN DASHBOARD ==============

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2464ea] flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">PearSign Admin</h1>
              <p className="text-sm text-gray-500">Platform Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => setShowInviteDialog(true)}
              className="bg-[#2464ea] hover:bg-blue-700"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Organization
            </Button>
            <Button variant="outline" size="sm" onClick={() => { loadPlans(); loadTenants(); loadInvites(); loadAuditLogs(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8">
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tenants" className="gap-2">
              <Building2 className="h-4 w-4" />
              Tenants
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-2">
              <MailPlus className="h-4 w-4" />
              Invites
              {invites.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                  {invites.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Plans & Pricing
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <History className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Tenants</p>
                      <p className="text-2xl font-semibold">{stats?.totalTenants || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
                      <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Active Tenants</p>
                      <p className="text-2xl font-semibold">{stats?.activeTenants || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
                      <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Envelopes</p>
                      <p className="text-2xl font-semibold">{stats?.totalEnvelopes || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900">
                      <CreditCard className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Active Plans</p>
                      <p className="text-2xl font-semibold">{plans.filter(p => p.isActive).length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Demo Sales Sandbox */}
            <Card className="border-2 border-dashed border-[#2464ea]/30 bg-gradient-to-br from-[#2464ea]/5 to-blue-50/50 dark:to-blue-950/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-[#2464ea] to-blue-600 shadow-lg shadow-blue-500/25">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Demo Sales Sandbox</CardTitle>
                      <CardDescription className="text-sm">
                        Fully-featured demo environment for sales presentations
                      </CardDescription>
                    </div>
                  </div>
                  {demoAccountStatus?.exists && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 px-3 py-1">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ready
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {demoAccountStatus?.exists ? (
                    <>
                      {/* Credentials */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <Mail className="h-4 w-4 text-[#2464ea]" />
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Login Credentials</p>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-gray-400">Email</p>
                              <p className="font-mono text-sm font-medium">{demoAccountStatus.credentials?.email}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Password</p>
                              <p className="font-mono text-sm font-medium">{demoAccountStatus.credentials?.password}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <Building2 className="h-4 w-4 text-[#2464ea]" />
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Organization</p>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-gray-400">Name</p>
                              <p className="text-sm font-medium">{demoAccountStatus.organization?.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Plan</p>
                              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 capitalize">
                                {demoAccountStatus.organization?.plan}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Sandbox Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border text-center">
                          <p className="text-2xl font-bold text-[#2464ea]">{demoAccountStatus?.stats?.documents || 7}</p>
                          <p className="text-xs text-gray-500">Documents</p>
                        </div>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border text-center">
                          <p className="text-2xl font-bold text-green-600">5</p>
                          <p className="text-xs text-gray-500">Templates</p>
                        </div>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border text-center">
                          <p className="text-2xl font-bold text-purple-600">{demoAccountStatus?.stats?.teamMembers || 5}</p>
                          <p className="text-xs text-gray-500">Team Members</p>
                        </div>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border text-center">
                          <p className="text-2xl font-bold text-amber-600">All</p>
                          <p className="text-xs text-gray-500">Features</p>
                        </div>
                      </div>

                      {/* What's Included */}
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Sandbox Includes:</p>
                        <div className="grid grid-cols-2 gap-2 text-sm text-blue-700 dark:text-blue-300">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Sample documents (sent, signed, voided)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Ready-to-use templates</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Team with different roles</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Custom branding configured</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Activity history</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Enterprise features unlocked</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={loginAsDemoUser}
                          disabled={loggingInDemo}
                          className="bg-[#2464ea] hover:bg-blue-700 shadow-lg shadow-blue-500/25"
                          size="lg"
                        >
                          {loggingInDemo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                          Start Demo Presentation
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            setSettingUpDemo(true);
                            try {
                              const res = await fetch("/api/admin/demo-account", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "reset" }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                toast({
                                  title: "Sandbox Reset",
                                  description: `Fresh demo data created: ${data.sandbox?.documents || 7} documents, ${data.sandbox?.templates || 5} templates`,
                                });
                                loadDemoAccountStatus();
                              } else {
                                throw new Error(data.error);
                              }
                            } catch (error) {
                              toast({
                                title: "Reset Failed",
                                description: error instanceof Error ? error.message : "Failed to reset sandbox",
                                variant: "destructive",
                              });
                            } finally {
                              setSettingUpDemo(false);
                            }
                          }}
                          disabled={settingUpDemo}
                        >
                          {settingUpDemo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                          Reset with Fresh Data
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-[#2464ea]/10 flex items-center justify-center mx-auto mb-4">
                        <Users className="h-8 w-8 text-[#2464ea]" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">Create Demo Sandbox</h3>
                      <p className="text-gray-500 mb-6 max-w-md mx-auto">
                        Set up a complete demo environment with sample documents, templates, team members, and all enterprise features enabled.
                      </p>
                      <Button
                        onClick={setupDemoAccount}
                        disabled={settingUpDemo}
                        className="bg-[#2464ea] hover:bg-blue-700 shadow-lg shadow-blue-500/25"
                        size="lg"
                      >
                        {settingUpDemo ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating Sandbox...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Demo Sandbox
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Plan Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Tenants by Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {plans.map((plan) => (
                    <div key={plan.id} className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800">
                      <p className="text-sm font-medium">{plan.name}</p>
                      <p className="text-2xl font-semibold">{planStats[plan.id]?.count || stats?.byPlan?.[plan.id] || 0}</p>
                      <p className="text-xs text-gray-500">
                        ${plan.priceMonthly === -1 ? "Custom" : plan.priceMonthly}/mo
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TENANTS TAB */}
          <TabsContent value="tenants" className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tenants..."
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={tenantPlanFilter} onValueChange={setTenantPlanFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tenantStatusFilter} onValueChange={setTenantStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tenants Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-xs text-gray-500">{tenant.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {tenant.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tenant.status === "active" ? "default" : "secondary"}
                          className={
                            tenant.status === "active"
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : tenant.status === "suspended"
                              ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                              : ""
                          }
                        >
                          {tenant.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{tenant.usage.envelopesSent}</span>
                          <span className="text-gray-500"> docs</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          {tenant.teamSize}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => enterSandbox(tenant.id)}
                            disabled={creatingSandbox === tenant.id}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {creatingSandbox === tenant.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4 mr-1" />
                            )}
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTenantDialog(tenant)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No tenants found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* PLANS TAB */}
          <TabsContent value="plans" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditPlanDialog(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">
                        {plan.priceMonthly === -1 ? "Custom" : `$${plan.priceMonthly}`}
                      </span>
                      {plan.priceMonthly !== -1 && (
                        <span className="text-gray-500">/month</span>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Envelopes</span>
                        <span>{plan.limits.envelopes === -1 ? "Unlimited" : plan.limits.envelopes}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Templates</span>
                        <span>{plan.limits.templates === -1 ? "Unlimited" : plan.limits.templates}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Team</span>
                        <span>{plan.limits.teamMembers === -1 ? "Unlimited" : plan.limits.teamMembers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">SMS</span>
                        <span>{plan.limits.sms === -1 ? "Unlimited" : plan.limits.sms}/mo</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500 mb-2">Tenants on this plan:</p>
                      <p className="text-2xl font-semibold">
                        {planStats[plan.id]?.count || stats?.byPlan?.[plan.id] || 0}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* INVITES TAB */}
          <TabsContent value="invites" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Organization Invites</h2>
                <p className="text-sm text-gray-500">Invite new organizations to PearSign</p>
              </div>
              <Button onClick={() => setShowInviteDialog(true)} className="bg-[#2464ea] hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                New Invite
              </Button>
            </div>

            {lastCreatedInviteUrl && (
              <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Link2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Invite Link Created</p>
                      <p className="text-xs text-green-700 dark:text-green-300 truncate font-mono">{lastCreatedInviteUrl}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                      onClick={() => {
                        navigator.clipboard.writeText(lastCreatedInviteUrl);
                        toast({ title: "Copied!", description: "Invite link copied to clipboard" });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {invites.length === 0 && !lastCreatedInviteUrl ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <MailPlus className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No pending invites</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Create invite links for organizations to register on PearSign
                  </p>
                  <Button onClick={() => setShowInviteDialog(true)} className="bg-[#2464ea] hover:bg-blue-700">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Organization
                  </Button>
                </CardContent>
              </Card>
            ) : invites.length > 0 ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Owner / Domain</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.map((invite) => {
                      const inviteUrl = invite.token ? `${window.location.origin}/invite/${invite.token}` : '';
                      return (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <div className="font-medium">{invite.tenantName}</div>
                          {invite.ownerName && (
                            <div className="text-xs text-gray-500">{invite.ownerName}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">{invite.ownerEmail}</span>
                          </div>
                          {invite.allowedDomain && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Globe className="h-3 w-3 text-blue-400" />
                              <span className="text-xs text-blue-600">@{invite.allowedDomain}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {invite.plan === 'free' ? 'trial' : invite.plan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            invite.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : invite.status === "accepted"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }>
                            {invite.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inviteUrl && invite.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(inviteUrl);
                                  setCopiedInviteUrl(invite.id);
                                  setTimeout(() => setCopiedInviteUrl(null), 2000);
                                  toast({ title: "Copied!", description: "Invite link copied to clipboard" });
                                }}
                              >
                                {copiedInviteUrl === invite.id ? <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                                {copiedInviteUrl === invite.id ? 'Copied' : 'Copy Link'}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resendInvite(invite.id)}
                              disabled={isLoading || invite.status !== 'pending'}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Resend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelInvite(invite.id)}
                              disabled={isLoading || invite.status !== 'pending'}
                              className="text-red-600 hover:text-red-700"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ) : null}
          </TabsContent>

          {/* AUDIT LOG TAB */}
          <TabsContent value="audit" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Admin Audit Log</h2>
              <p className="text-sm text-gray-500">Track all admin actions for compliance and security</p>
            </div>

            {auditLogs.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <History className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No audit logs yet</h3>
                  <p className="text-sm text-gray-500">
                    Admin actions will be recorded here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{log.targetType}</span>
                            {log.targetId && (
                              <span className="font-mono text-xs">{log.targetId.substring(0, 12)}...</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-gray-500 max-w-[200px] truncate">
                            {JSON.stringify(log.details).substring(0, 50)}...
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Plan Dialog */}
      {editPlanDialog && (
        <Dialog open={!!editPlanDialog} onOpenChange={() => setEditPlanDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Plan: {editPlanDialog.name}</DialogTitle>
              <DialogDescription>
                Update pricing and limits for this plan
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editPlanDialog.name}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={editPlanDialog.description}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly Price ($)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.priceMonthly}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, priceMonthly: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Yearly Price ($)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.priceYearly}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, priceYearly: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Envelopes/month (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.limits.envelopes}
                  onChange={(e) => setEditPlanDialog({
                    ...editPlanDialog,
                    limits: { ...editPlanDialog.limits, envelopes: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Templates (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.limits.templates}
                  onChange={(e) => setEditPlanDialog({
                    ...editPlanDialog,
                    limits: { ...editPlanDialog.limits, templates: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Team Members (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.limits.teamMembers}
                  onChange={(e) => setEditPlanDialog({
                    ...editPlanDialog,
                    limits: { ...editPlanDialog.limits, teamMembers: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>SMS/month (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.limits.sms}
                  onChange={(e) => setEditPlanDialog({
                    ...editPlanDialog,
                    limits: { ...editPlanDialog.limits, sms: parseInt(e.target.value) }
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPlanDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => updatePlan(editPlanDialog)}
                disabled={isLoading}
                className="bg-[#2464ea] hover:bg-blue-700"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Tenant Dialog - Enhanced with Billing & Limits */}
      {editTenantDialog && (
        <Dialog
          open={!!editTenantDialog}
          onOpenChange={() => {
            setEditTenantDialog(null);
            setBillingData(null);
            setBillingTab('limits');
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#2464ea]" />
                {editTenantDialog.name}
              </DialogTitle>
              <DialogDescription>
                Manage tenant plan, limits, billing, and status
              </DialogDescription>
            </DialogHeader>

            {/* Tenant Overview */}
            <div className="grid grid-cols-4 gap-4 py-4 border-b">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-[#2464ea]">{editTenantDialog.usage.envelopesSent}</p>
                <p className="text-xs text-gray-500">Envelopes</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{editTenantDialog.teamSize}</p>
                <p className="text-xs text-gray-500">Team</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Badge variant="outline" className="capitalize text-lg px-3 py-1">{editTenantDialog.plan}</Badge>
                <p className="text-xs text-gray-500 mt-1">Plan</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Badge className={editTenantDialog.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {editTenantDialog.status}
                </Badge>
                <p className="text-xs text-gray-500 mt-1">Status</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 flex-wrap py-3 border-b">
              <Select
                value=""
                onValueChange={(value) => performTenantAction(editTenantDialog.id, "changePlan", { newPlan: value })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Change Plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {editTenantDialog.status === "active" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => performTenantAction(editTenantDialog.id, "changeStatus", { newStatus: "suspended" })}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => performTenantAction(editTenantDialog.id, "changeStatus", { newStatus: "active" })}
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Reactivate
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => performTenantAction(editTenantDialog.id, "resetUsage", {})}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset Usage
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => loadBillingData(editTenantDialog.id)}
                disabled={loadingBilling}
              >
                {loadingBilling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                Load Billing
              </Button>
            </div>

            {/* Billing Management Tabs */}
            {billingData && (
              <div className="py-4">
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={billingTab === 'limits' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBillingTab('limits')}
                    className={billingTab === 'limits' ? 'bg-[#2464ea] hover:bg-blue-700' : ''}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    API Limits
                  </Button>
                  <Button
                    variant={billingTab === 'pricing' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBillingTab('pricing')}
                    className={billingTab === 'pricing' ? 'bg-[#2464ea] hover:bg-blue-700' : ''}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Custom Pricing
                  </Button>
                  <Button
                    variant={billingTab === 'usage' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBillingTab('usage')}
                    className={billingTab === 'usage' ? 'bg-[#2464ea] hover:bg-blue-700' : ''}
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Usage & Invoice
                  </Button>
                </div>

                {/* API Limits Tab */}
                {billingTab === 'limits' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Rate Limits & Quotas</h4>
                        <p className="text-xs text-gray-500">
                          {billingData.limits?.customLimits
                            ? 'Custom limits are active'
                            : 'Using plan defaults'}
                        </p>
                      </div>
                      {billingData.limits?.customLimits && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => clearLimits(editTenantDialog.id)}
                          disabled={isLoading}
                        >
                          Reset to Plan Defaults
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">API / minute</Label>
                        <Input
                          type="number"
                          value={editLimits.apiPerMinute ?? billingData.limits?.apiPerMinute ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, apiPerMinute: parseInt(e.target.value) })}
                          placeholder="60"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">API / day</Label>
                        <Input
                          type="number"
                          value={editLimits.apiPerDay ?? billingData.limits?.apiPerDay ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, apiPerDay: parseInt(e.target.value) })}
                          placeholder="1000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">API / month</Label>
                        <Input
                          type="number"
                          value={editLimits.apiPerMonth ?? billingData.limits?.apiPerMonth ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, apiPerMonth: parseInt(e.target.value) })}
                          placeholder="10000 (-1=unlimited)"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Envelopes / month</Label>
                        <Input
                          type="number"
                          value={editLimits.envelopesPerMonth ?? billingData.limits?.envelopesPerMonth ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, envelopesPerMonth: parseInt(e.target.value) })}
                          placeholder="50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Templates max</Label>
                        <Input
                          type="number"
                          value={editLimits.templatesMax ?? billingData.limits?.templatesMax ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, templatesMax: parseInt(e.target.value) })}
                          placeholder="10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Team members</Label>
                        <Input
                          type="number"
                          value={editLimits.teamMembersMax ?? billingData.limits?.teamMembersMax ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, teamMembersMax: parseInt(e.target.value) })}
                          placeholder="5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Webhooks / day</Label>
                        <Input
                          type="number"
                          value={editLimits.webhooksPerDay ?? billingData.limits?.webhooksPerDay ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, webhooksPerDay: parseInt(e.target.value) })}
                          placeholder="500"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">SMS / month</Label>
                        <Input
                          type="number"
                          value={editLimits.smsPerMonth ?? billingData.limits?.smsPerMonth ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, smsPerMonth: parseInt(e.target.value) })}
                          placeholder="50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Storage (GB)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={editLimits.storageGb ?? billingData.limits?.storageGb ?? ''}
                          onChange={(e) => setEditLimits({ ...editLimits, storageGb: parseFloat(e.target.value) })}
                          placeholder="5"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => saveLimits(editTenantDialog.id)}
                      disabled={isLoading}
                      className="bg-[#2464ea] hover:bg-blue-700"
                    >
                      {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Apply Custom Limits
                    </Button>
                  </div>
                )}

                {/* Custom Pricing Tab */}
                {billingTab === 'pricing' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium">Billing Mode</h4>
                      <p className="text-xs text-gray-500 mb-3">Choose between standard plan pricing or custom pricing</p>

                      <div className="flex gap-3 mb-4">
                        <Button
                          variant={editPricing.billingMode === 'plan' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setEditPricing({ ...editPricing, billingMode: 'plan' })}
                          className={editPricing.billingMode === 'plan' ? 'bg-[#2464ea]' : ''}
                        >
                          Standard Plan
                        </Button>
                        <Button
                          variant={editPricing.billingMode === 'custom' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setEditPricing({ ...editPricing, billingMode: 'custom' })}
                          className={editPricing.billingMode === 'custom' ? 'bg-[#2464ea]' : ''}
                        >
                          Custom Pricing
                        </Button>
                      </div>
                    </div>

                    {editPricing.billingMode === 'custom' && (
                      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="space-y-2">
                          <Label className="text-xs">Monthly Base Fee ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(editPricing.monthlyBaseFee ?? billingData.pricing?.monthlyBaseFee ?? 0) / 100}
                            onChange={(e) => setEditPricing({ ...editPricing, monthlyBaseFee: Math.round(parseFloat(e.target.value) * 100) })}
                            placeholder="299.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Envelopes Included</Label>
                          <Input
                            type="number"
                            value={editPricing.envelopesIncluded ?? billingData.pricing?.envelopesIncluded ?? 0}
                            onChange={(e) => setEditPricing({ ...editPricing, envelopesIncluded: parseInt(e.target.value) })}
                            placeholder="500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Per Envelope ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(editPricing.envelopePrice ?? billingData.pricing?.envelopePrice ?? 0) / 100}
                            onChange={(e) => setEditPricing({ ...editPricing, envelopePrice: Math.round(parseFloat(e.target.value) * 100) })}
                            placeholder="0.50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">API Calls Included</Label>
                          <Input
                            type="number"
                            value={editPricing.apiCallsIncluded ?? billingData.pricing?.apiCallsIncluded ?? 0}
                            onChange={(e) => setEditPricing({ ...editPricing, apiCallsIncluded: parseInt(e.target.value) })}
                            placeholder="10000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">API Overage ($/1k)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(editPricing.apiOveragePrice ?? billingData.pricing?.apiOveragePrice ?? 0) / 100}
                            onChange={(e) => setEditPricing({ ...editPricing, apiOveragePrice: Math.round(parseFloat(e.target.value) * 100) })}
                            placeholder="1.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Per SMS ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(editPricing.smsPrice ?? billingData.pricing?.smsPrice ?? 0) / 100}
                            onChange={(e) => setEditPricing({ ...editPricing, smsPrice: Math.round(parseFloat(e.target.value) * 100) })}
                            placeholder="0.05"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Discount (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={editPricing.discount ?? billingData.pricing?.discount ?? 0}
                            onChange={(e) => setEditPricing({ ...editPricing, discount: parseInt(e.target.value) })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Currency</Label>
                          <Select
                            value={editPricing.currency ?? billingData.pricing?.currency ?? 'usd'}
                            onValueChange={(value) => setEditPricing({ ...editPricing, currency: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="usd">USD</SelectItem>
                              <SelectItem value="eur">EUR</SelectItem>
                              <SelectItem value="gbp">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Stripe Status */}
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-sm">Stripe Integration</h5>
                        {billingData.pricing?.stripeCustomerId ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">Not Connected</Badge>
                        )}
                      </div>
                      {billingData.pricing?.stripeCustomerId && (
                        <p className="text-xs text-gray-500 font-mono">
                          Customer: {billingData.pricing.stripeCustomerId}
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={() => savePricing(editTenantDialog.id)}
                      disabled={isLoading}
                      className="bg-[#2464ea] hover:bg-blue-700"
                    >
                      {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Pricing
                    </Button>
                  </div>
                )}

                {/* Usage & Invoice Tab */}
                {billingTab === 'usage' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-3">Current Period Usage</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                          <p className="text-xl font-bold">{billingData.currentUsage?.apiCalls || 0}</p>
                          <p className="text-xs text-gray-500">API Calls</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                          <p className="text-xl font-bold">{billingData.currentUsage?.envelopesSent || 0}</p>
                          <p className="text-xs text-gray-500">Envelopes</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                          <p className="text-xl font-bold">{billingData.currentUsage?.smsSent || 0}</p>
                          <p className="text-xs text-gray-500">SMS</p>
                        </div>
                      </div>
                    </div>

                    {billingData.projectedInvoice && billingData.pricing?.billingMode === 'custom' && (
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-3">Projected Invoice</h4>
                        <div className="space-y-2">
                          {billingData.projectedInvoice.lineItems?.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-600">{item.description}</span>
                              <span className={item.amount < 0 ? 'text-green-600' : ''}>
                                ${(item.amount / 100).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between font-semibold pt-2 border-t">
                            <span>Total</span>
                            <span>${((billingData.projectedInvoice?.total || 0) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Invoice History */}
                    <div>
                      <h4 className="font-medium mb-3">Invoice History</h4>
                      {billingData.invoices && billingData.invoices.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600">Invoice</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-600">Period</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                                <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {billingData.invoices.map((inv) => (
                                <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                  <td className="px-3 py-2">
                                    <span className="font-mono text-xs">
                                      {inv.stripeInvoiceId || inv.id.substring(0, 8).toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {new Date(inv.periodStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium">
                                    ${(inv.amount / 100).toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <Badge
                                      className={
                                        inv.status === 'paid'
                                          ? 'bg-green-100 text-green-700'
                                          : inv.status === 'open'
                                          ? 'bg-amber-100 text-amber-700'
                                          : inv.status === 'void'
                                          ? 'bg-gray-100 text-gray-700'
                                          : 'bg-red-100 text-red-700'
                                      }
                                    >
                                      {inv.status}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {inv.hostedUrl && (
                                        <a
                                          href={inv.hostedUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-[#2464ea] hover:underline"
                                        >
                                          View
                                        </a>
                                      )}
                                      {inv.pdfUrl && (
                                        <a
                                          href={inv.pdfUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-gray-500 hover:underline ml-2"
                                        >
                                          PDF
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-500 border rounded-lg">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">No invoices yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Load billing prompt if not loaded */}
            {!billingData && !loadingBilling && (
              <div className="py-8 text-center">
                <DollarSign className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-3">Click "Load Billing" to manage limits and pricing</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Invite Organization Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#2464ea]" />
              Invite Organization
            </DialogTitle>
            <DialogDescription>
              Send an invitation to create a new organization on PearSign
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name *</Label>
              <Input
                id="orgName"
                placeholder="Acme Inc."
                value={inviteData.organizationName}
                onChange={(e) => setInviteData({ ...inviteData, organizationName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Owner Email *</Label>
              <Input
                id="ownerEmail"
                type="email"
                placeholder="owner@company.com"
                value={inviteData.ownerEmail}
                onChange={(e) => setInviteData({ ...inviteData, ownerEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner Name (Optional)</Label>
              <Input
                id="ownerName"
                placeholder="John Doe"
                value={inviteData.ownerName}
                onChange={(e) => setInviteData({ ...inviteData, ownerName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="allowedDomain">Allowed Email Domain</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg text-gray-400">@</span>
                <Input
                  id="allowedDomain"
                  placeholder="acme.com"
                  value={inviteData.allowedDomain}
                  onChange={(e) => setInviteData({ ...inviteData, allowedDomain: e.target.value.replace(/^@/, '') })}
                />
              </div>
              <p className="text-xs text-gray-500">
                Only users with this email domain can register. Leave empty for single-use invite to the owner email only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">Initial Plan</Label>
              <Select value={inviteData.plan} onValueChange={(value) => setInviteData({ ...inviteData, plan: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                A unique invite link will be generated. The link will be emailed to the owner and can also be copied manually.
                {inviteData.allowedDomain ? ` Anyone with an @${inviteData.allowedDomain} email can register through this link.` : ' This invite is single-use for the owner email only.'}
                {' '}Expires in 30 days.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={sendOrganizationInvite}
              disabled={isLoading || !inviteData.organizationName || !inviteData.ownerEmail}
              className="bg-[#2464ea] hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
