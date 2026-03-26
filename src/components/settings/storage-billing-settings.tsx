"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  HardDrive,
  CreditCard,
  FileText,
  LayoutTemplate,
  Paperclip,
  Loader2,
  Check,
  AlertTriangle,
  Sparkles,
  Crown,
  Zap,
  Building2,
  Mail,
  Download,
  Calendar,
  RefreshCw,
  TrendingUp,
  MessageSquare,
  Activity,
  Users,
  Eye,
} from "lucide-react";

interface PlanLimits {
  envelopesPerMonth: number;
  templates: number;
  teamMembers: number;
  storageGb: number;
  smsPerMonth?: number;
  apiCallsPerMonth?: number;
}

interface UsageData {
  envelopesSent: number;
  smsSent: number;
  apiCalls: number;
}

interface StorageData {
  id: string | null;
  organizationId: string;
  usedStorage: number;
  totalStorage: number;
  documentCount: number;
  templateCount: number;
  attachmentCount: number;
  lastCalculated: string;
  plan?: {
    name: string;
    limits: PlanLimits;
  };
  usage?: UsageData;
}

interface BillingData {
  id: string | null;
  organizationId: string;
  plan: string;
  billingEmail: string;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  billingName: string | null;
  billingAddress: string | null;
  paymentMethod: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planDetails?: {
    name: string;
    description: string;
    priceMonthly: number;
    priceYearly: number;
    features: string[];
    limits: PlanLimits;
  };
  limits?: PlanLimits;
}

interface Invoice {
  id: string;
  stripeInvoiceId?: string;
  amount: number;
  amountFormatted?: string;
  currency: string;
  status: string;
  pdfUrl?: string;
  hostedInvoiceUrl?: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

// Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const plans = [
  {
    id: "free",
    name: "Trial",
    price: "$0",
    period: "5 sends",
    features: ["5 document sends total", "3 templates", "1 user", "Email support"],
    icon: Zap,
    color: "from-slate-500 to-slate-600",
  },
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    period: "/month",
    features: ["50 documents per month", "10 templates", "3 team members", "Custom branding", "Webhooks", "API access", "Priority email support"],
    icon: Sparkles,
    color: "from-[hsl(var(--pearsign-primary))] to-blue-600",
    popular: true,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$49",
    period: "/month",
    features: ["500 documents per month", "100 templates", "15 team members", "Bulk send", "FusionForms", "All integrations", "Chat support"],
    icon: Crown,
    color: "from-purple-500 to-indigo-600",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Unlimited documents", "Unlimited templates", "Unlimited team members", "SSO/SAML", "Custom contract", "Dedicated support", "SLA guarantee"],
    icon: Building2,
    color: "from-amber-500 to-orange-500",
  },
];

export function StorageBillingSettings() {
  const { toast } = useToast();
  const [storageData, setStorageData] = useState<StorageData | null>(null);
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingBilling, setSavingBilling] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [billingForm, setBillingForm] = useState({
    billingEmail: "",
    billingName: "",
    billingAddress: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [storageRes, billingRes] = await Promise.all([
        fetch('/api/settings/storage'),
        fetch('/api/settings/billing'),
      ]);

      if (storageRes.ok) {
        const data = await storageRes.json();
        setStorageData(data);
      }

      if (billingRes.ok) {
        const data = await billingRes.json();
        setBillingData(data);
        setBillingForm({
          billingEmail: data.billingEmail || "",
          billingName: data.billingName || "",
          billingAddress: data.billingAddress || "",
        });
      }

      // Load invoices
      loadInvoices();
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error loading data",
        description: "Failed to load storage and billing information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const response = await fetch('/api/billing/invoices?limit=10');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.invoices) {
          setInvoices(data.invoices);
        }
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveBilling = async () => {
    setSavingBilling(true);
    try {
      const response = await fetch('/api/settings/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billingForm),
      });

      if (!response.ok) throw new Error('Failed to update billing');

      const updated = await response.json();
      setBillingData(updated);

      toast({
        title: "Billing updated",
        description: "Your billing information has been saved",
      });
    } catch (error) {
      console.error('Error saving billing:', error);
      toast({
        title: "Error saving billing",
        description: "Failed to update billing information",
        variant: "destructive",
      });
    } finally {
      setSavingBilling(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setUpgradingPlan(planId);
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createCheckout',
          plan: planId,
          billingPeriod,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error) {
      console.error('Error upgrading plan:', error);
      toast({
        title: "Upgrade failed",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createPortal' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to open billing portal');
      }

      const data = await response.json();

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    } catch (error) {
      console.error('Error opening billing portal:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open billing portal",
        variant: "destructive",
      });
    }
  };

  const usagePercentage = storageData && storageData.totalStorage > 0
    ? Math.round((storageData.usedStorage / storageData.totalStorage) * 100)
    : 0;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-[hsl(var(--pearsign-primary))]';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = plans.find(p => p.id.toLowerCase() === billingData?.plan?.toLowerCase()) || plans[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Storage & Billing</h2>
        <p className="text-muted-foreground">
          Manage your storage usage and subscription
        </p>
      </div>

      {/* Storage Usage Card */}
      <Card className="border-[hsl(var(--pearsign-primary))]/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Storage Usage</CardTitle>
              <CardDescription>
                Your current storage consumption
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {storageData ? formatBytes(storageData.usedStorage) : '0 GB'}
              </span>
              <span className="text-muted-foreground">
                of {storageData ? formatBytes(storageData.totalStorage) : '10 GB'}
              </span>
            </div>
            <Progress value={usagePercentage} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className={usagePercentage >= 90 ? "text-red-500 font-medium" : "text-muted-foreground"}>
                {usagePercentage}% used
              </span>
              {usagePercentage >= 90 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Storage almost full
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Storage Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-muted/50 text-center">
              <FileText className="h-6 w-6 mx-auto mb-2 text-[hsl(var(--pearsign-primary))]" />
              <p className="text-2xl font-bold">{storageData?.documentCount || 0}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 text-center">
              <LayoutTemplate className="h-6 w-6 mx-auto mb-2 text-cyan-500" />
              <p className="text-2xl font-bold">{storageData?.templateCount || 0}</p>
              <p className="text-xs text-muted-foreground">Templates</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 text-center">
              <Paperclip className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{storageData?.attachmentCount || 0}</p>
              <p className="text-xs text-muted-foreground">Attachments</p>
            </div>
          </div>

          {storageData?.lastCalculated && (
            <p className="text-xs text-muted-foreground text-center">
              Last updated: {new Date(storageData.lastCalculated).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Monthly Usage Card */}
      {(storageData?.usage || storageData?.plan) && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Monthly Usage</CardTitle>
                <CardDescription>
                  Your usage this billing period ({storageData?.plan?.name || (billingData?.plan === 'free' ? 'Trial' : billingData?.plan) || 'Trial'} plan)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Envelopes */}
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Mail className="h-5 w-5 text-blue-500" />
                  <span className="text-xs text-muted-foreground">
                    {storageData?.plan?.limits?.envelopesPerMonth === -1 ? 'Unlimited' : `/ ${storageData?.plan?.limits?.envelopesPerMonth || billingData?.limits?.envelopesPerMonth || 5}`}
                  </span>
                </div>
                <p className="text-2xl font-bold">{storageData?.usage?.envelopesSent || 0}</p>
                <p className="text-xs text-muted-foreground">Documents sent</p>
                {storageData?.plan?.limits?.envelopesPerMonth !== -1 && (
                  <Progress
                    value={Math.min(100, ((storageData?.usage?.envelopesSent || 0) / (storageData?.plan?.limits?.envelopesPerMonth || 5)) * 100)}
                    className="h-1 mt-2"
                  />
                )}
              </div>

              {/* SMS */}
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                  <span className="text-xs text-muted-foreground">
                    {storageData?.plan?.limits?.smsPerMonth === -1 ? 'Unlimited' : `/ ${storageData?.plan?.limits?.smsPerMonth || 0}`}
                  </span>
                </div>
                <p className="text-2xl font-bold">{storageData?.usage?.smsSent || 0}</p>
                <p className="text-xs text-muted-foreground">SMS sent</p>
                {(storageData?.plan?.limits?.smsPerMonth || 0) > 0 && storageData?.plan?.limits?.smsPerMonth !== -1 && (
                  <Progress
                    value={Math.min(100, ((storageData?.usage?.smsSent || 0) / (storageData?.plan?.limits?.smsPerMonth || 1)) * 100)}
                    className="h-1 mt-2"
                  />
                )}
              </div>

              {/* API Calls */}
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="h-5 w-5 text-orange-500" />
                  <span className="text-xs text-muted-foreground">
                    {storageData?.plan?.limits?.apiCallsPerMonth === -1 ? 'Unlimited' : `/ ${storageData?.plan?.limits?.apiCallsPerMonth || 0}`}
                  </span>
                </div>
                <p className="text-2xl font-bold">{storageData?.usage?.apiCalls || 0}</p>
                <p className="text-xs text-muted-foreground">API calls</p>
                {(storageData?.plan?.limits?.apiCallsPerMonth || 0) > 0 && storageData?.plan?.limits?.apiCallsPerMonth !== -1 && (
                  <Progress
                    value={Math.min(100, ((storageData?.usage?.apiCalls || 0) / (storageData?.plan?.limits?.apiCallsPerMonth || 1)) * 100)}
                    className="h-1 mt-2"
                  />
                )}
              </div>

              {/* Team Members */}
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  <span className="text-xs text-muted-foreground">
                    {storageData?.plan?.limits?.teamMembers === -1 ? 'Unlimited' : `/ ${storageData?.plan?.limits?.teamMembers || 1}`}
                  </span>
                </div>
                <p className="text-2xl font-bold">1</p>
                <p className="text-xs text-muted-foreground">Team members</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Plan Card */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${currentPlan.color} flex items-center justify-center`}>
                <currentPlan.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {currentPlan.name} Plan
                  {billingData?.subscriptionStatus === 'active' && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                      <Check className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Your current subscription
                </CardDescription>
              </div>
            </div>
            {billingData?.currentPeriodEnd && (
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Next billing</p>
                <p className="font-medium">
                  {new Date(billingData.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 mb-4">
            <span className="text-4xl font-bold">{currentPlan.price}</span>
            <span className="text-muted-foreground mb-1">{currentPlan.period}</span>
          </div>
          <ul className="space-y-2">
            {currentPlan.features.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Available Plans</CardTitle>
              <CardDescription>
                Compare and upgrade your subscription
              </CardDescription>
            </div>
            {/* Billing Period Toggle */}
            <div className="flex items-center gap-2 bg-muted rounded-full p-1">
              <button
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setBillingPeriod('monthly')}
              >
                Monthly
              </button>
              <button
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${
                  billingPeriod === 'yearly'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setBillingPeriod('yearly')}
              >
                Yearly
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Save 20%
                </Badge>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isCurrentPlan = plan.id.toLowerCase() === billingData?.plan?.toLowerCase();
              const isUpgrading = upgradingPlan === plan.id;
              const PlanIcon = plan.icon;
              const isFree = plan.id === 'free';
              const isEnterprise = plan.id === 'enterprise';
              const planIndex = plans.findIndex(p => p.id === plan.id);
              const currentPlanIndex = plans.findIndex(p => p.id.toLowerCase() === billingData?.plan?.toLowerCase());
              const isDowngrade = planIndex < currentPlanIndex;

              const priceNum = parseInt(plan.price.replace('$', '') || '0');
              const displayPrice = billingPeriod === 'yearly' && priceNum > 0
                ? `$${Math.round(priceNum * 0.8)}`
                : plan.price;
              const displayPeriod = isEnterprise ? '' : (billingPeriod === 'yearly' && priceNum > 0 ? '/mo (billed yearly)' : plan.period);

              return (
                <div
                  key={plan.id}
                  className={`relative p-5 rounded-xl border-2 transition-all ${
                    isCurrentPlan
                      ? 'border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600">
                      Most Popular
                    </Badge>
                  )}
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center mb-3`}>
                    <PlanIcon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <div className="flex items-end gap-1 mt-1 mb-3">
                    <span className="text-2xl font-bold">{displayPrice}</span>
                    <span className="text-sm text-muted-foreground">{displayPeriod}</span>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {plan.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-[hsl(var(--pearsign-primary))]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isCurrentPlan ? "secondary" : plan.popular ? "default" : "outline"}
                    size="sm"
                    className={`w-full ${plan.popular && !isCurrentPlan ? 'bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90' : ''}`}
                    disabled={isCurrentPlan || isFree || isUpgrading}
                    onClick={() => {
                      if (isEnterprise) {
                        window.location.href = 'mailto:sales@pearsign.com?subject=Enterprise%20Plan%20Inquiry';
                      } else if (!isCurrentPlan && !isFree) {
                        handleUpgrade(plan.id);
                      }
                    }}
                  >
                    {isUpgrading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrentPlan ? (
                      "Current Plan"
                    ) : isFree ? (
                      "Free Forever"
                    ) : isEnterprise ? (
                      "Contact Sales"
                    ) : isDowngrade ? (
                      "Downgrade"
                    ) : (
                      "Upgrade"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Manage Subscription Button */}
          {billingData?.plan && billingData.plan !== 'free' && (
            <div className="mt-6 pt-6 border-t">
              <Button variant="outline" onClick={handleManageBilling} className="w-full sm:w-auto">
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Subscription
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Update payment method, view invoices, or cancel subscription
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing Information */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing Information
          </CardTitle>
          <CardDescription>
            Update your billing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billingEmail">
              <Mail className="h-3 w-3 inline mr-1" />
              Billing Email
            </Label>
            <Input
              id="billingEmail"
              type="email"
              value={billingForm.billingEmail}
              onChange={(e) => setBillingForm(f => ({ ...f, billingEmail: e.target.value }))}
              placeholder="billing@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingName">
              <Building2 className="h-3 w-3 inline mr-1" />
              Billing Name / Company
            </Label>
            <Input
              id="billingName"
              value={billingForm.billingName}
              onChange={(e) => setBillingForm(f => ({ ...f, billingName: e.target.value }))}
              placeholder="Your Company Name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingAddress">Billing Address</Label>
            <Input
              id="billingAddress"
              value={billingForm.billingAddress}
              onChange={(e) => setBillingForm(f => ({ ...f, billingAddress: e.target.value }))}
              placeholder="123 Main St, City, Country"
            />
          </div>
          <Button onClick={handleSaveBilling} disabled={savingBilling}>
            {savingBilling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save Billing Info
          </Button>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Method
          </CardTitle>
          <CardDescription>
            Manage your payment methods
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingData?.paymentMethod ? (
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{billingData.paymentMethod}</p>
                  <p className="text-sm text-muted-foreground">Expires 12/25</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleManageBilling}>Update</Button>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No payment method</p>
              <p className="text-sm mb-4">Add a payment method to upgrade your plan</p>
              <Button variant="outline" onClick={handleManageBilling}>Add Payment Method</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Invoices
              </CardTitle>
              <CardDescription>
                Download your billing history
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadInvoices} disabled={loadingInvoices}>
              {loadingInvoices ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {invoice.stripeInvoiceId || `INV-${invoice.id.substring(0, 8).toUpperCase()}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invoice.periodStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">
                        {invoice.amountFormatted || `${(invoice.amount / 100).toFixed(2)}`}
                      </p>
                      <Badge
                        variant="secondary"
                        className={
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : invoice.status === 'open'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                            : 'bg-gray-100 text-gray-700'
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {invoice.hostedInvoiceUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a href={`/api/billing/invoices/${invoice.id}/pdf?download=true`} download>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No invoices yet</p>
              <p className="text-sm">Your billing history will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
