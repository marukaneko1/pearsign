"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  User,
  CreditCard,
  Users,
  Palette,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Mail,
  Lock,
  UserPlus,
  X,
  CheckCircle2,
  ArrowRight,
  Crown,
  Zap,
  Shield,
  FileSignature,
  Send,
  Globe,
} from "lucide-react";

interface OnboardingData {
  organizationName: string;
  industry: string;
  companySize: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  plan: "free" | "starter" | "professional" | "enterprise";
  billingPeriod: "monthly" | "yearly";
  teamInvites: Array<{ email: string; role: "admin" | "member" | "viewer" }>;
  primaryColor: string;
  logoUrl: string;
}

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, title: "Organization", icon: Building2, subtitle: "Your company details" },
  { id: 2, title: "Account", icon: User, subtitle: "Your login credentials" },
  { id: 3, title: "Plan", icon: CreditCard, subtitle: "Choose your tier" },
  { id: 4, title: "Team", icon: Users, subtitle: "Invite colleagues" },
  { id: 5, title: "Branding", icon: Palette, subtitle: "Customize look & feel" },
];

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance & Banking",
  "Legal",
  "Real Estate",
  "Education",
  "Manufacturing",
  "Retail",
  "Consulting",
  "Government",
  "Non-profit",
  "Other",
];

const COMPANY_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2-10", label: "2-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "500+", label: "500+ employees" },
];

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    description: "For individuals getting started",
    features: [
      "5 documents per month",
      "3 templates",
      "1 user",
      "Email support",
    ],
    icon: Zap,
    popular: false,
  },
  {
    id: "starter" as const,
    name: "Starter",
    price: 19,
    yearlyPrice: 190,
    description: "For small teams",
    features: [
      "50 documents per month",
      "10 templates",
      "3 team members",
      "Custom branding",
      "Webhooks & API access",
    ],
    icon: Shield,
    popular: false,
  },
  {
    id: "professional" as const,
    name: "Professional",
    price: 49,
    yearlyPrice: 490,
    description: "For growing businesses",
    features: [
      "500 documents per month",
      "100 templates",
      "15 team members",
      "Bulk send & FusionForms",
      "Phone verification (2FA)",
      "All integrations",
    ],
    icon: Crown,
    popular: true,
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    price: -1,
    description: "For large organizations",
    features: [
      "Unlimited everything",
      "SSO/SAML",
      "Custom contract",
      "Dedicated support",
      "On-premise option",
    ],
    icon: Building2,
    popular: false,
  },
];

const BRAND_COLORS = [
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Teal", value: "#0d9488" },
  { name: "Pink", value: "#db2777" },
  { name: "Indigo", value: "#4f46e5" },
];

const SIDE_PANEL_CONTENT = [
  {
    headline: "Join thousands of businesses",
    description: "PearSign powers document signing for companies of every size, from startups to enterprises.",
    features: [
      { icon: FileSignature, text: "Legally binding e-signatures" },
      { icon: Shield, text: "Bank-level encryption" },
      { icon: Globe, text: "eIDAS & AATL compliant" },
    ],
  },
  {
    headline: "Secure by design",
    description: "Your credentials are encrypted and protected with industry-standard security practices.",
    features: [
      { icon: Lock, text: "256-bit AES encryption" },
      { icon: Shield, text: "SOC 2 compliant infrastructure" },
      { icon: CheckCircle2, text: "Full audit trails" },
    ],
  },
  {
    headline: "Flexible for every team",
    description: "Start free and scale as you grow. Upgrade or downgrade anytime, no lock-in.",
    features: [
      { icon: Zap, text: "No setup fees" },
      { icon: Send, text: "Unlimited recipients" },
      { icon: Crown, text: "Priority support on paid plans" },
    ],
  },
  {
    headline: "Better together",
    description: "Collaborate with your team on templates, share signing workflows, and track progress together.",
    features: [
      { icon: Users, text: "Role-based permissions" },
      { icon: Mail, text: "Instant invite emails" },
      { icon: FileSignature, text: "Shared template library" },
    ],
  },
  {
    headline: "Your brand, your way",
    description: "Customize emails, signing pages, and documents with your logo and colors.",
    features: [
      { icon: Palette, text: "Custom brand colors" },
      { icon: Globe, text: "White-label signing pages" },
      { icon: Mail, text: "Branded email notifications" },
    ],
  },
];

export function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    organizationName: "",
    industry: "",
    companySize: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    plan: "professional",
    billingPeriod: "monthly",
    teamInvites: [],
    primaryColor: "#16a34a",
    logoUrl: "",
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!data.organizationName.trim()) {
          setError("Organization name is required");
          return false;
        }
        return true;
      case 2:
        if (!data.firstName.trim() || !data.lastName.trim()) {
          setError("First and last name are required");
          return false;
        }
        if (!data.email.trim()) {
          setError("Email is required");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
          setError("Please enter a valid email address");
          return false;
        }
        if (data.password.length < 8) {
          setError("Password must be at least 8 characters");
          return false;
        }
        if (data.password !== data.confirmPassword) {
          setError("Passwords do not match");
          return false;
        }
        return true;
      case 3:
        return true;
      case 4:
        for (const invite of data.teamInvites) {
          if (invite.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email)) {
            setError(`Invalid email: ${invite.email}`);
            return false;
          }
        }
        return true;
      case 5:
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/tenant/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create organization");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("currentTenantId", result.data.tenant.id);
        document.cookie = `tenant_id=${result.data.tenant.id}; path=/; max-age=31536000`;
      }

      onComplete(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTeamInvite = () => {
    updateData({
      teamInvites: [...data.teamInvites, { email: "", role: "member" }],
    });
  };

  const updateTeamInvite = (index: number, updates: Partial<{ email: string; role: "admin" | "member" | "viewer" }>) => {
    const newInvites = [...data.teamInvites];
    newInvites[index] = { ...newInvites[index], ...updates };
    updateData({ teamInvites: newInvites });
  };

  const removeTeamInvite = (index: number) => {
    const newInvites = data.teamInvites.filter((_, i) => i !== index);
    updateData({ teamInvites: newInvites });
  };

  const sideContent = SIDE_PANEL_CONTENT[currentStep - 1];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Side Panel - branding & context */}
        <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col bg-[#1a1f36] text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />

          <div className="relative z-10 flex flex-col h-full p-8">
            <div className="flex items-center gap-3 mb-12">
              <img src="/pearsign-logo.png" alt="PearSign" className="w-10 h-10 rounded-lg" />
              <span className="text-xl font-semibold tracking-tight">PearSign</span>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <h2 className="text-2xl font-semibold mb-3 leading-tight">{sideContent.headline}</h2>
              <p className="text-white/60 text-sm leading-relaxed mb-8">{sideContent.description}</p>

              <div className="space-y-4">
                {sideContent.features.map((feat, i) => {
                  const Icon = feat.icon;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-white/80" />
                      </div>
                      <span className="text-sm text-white/70">{feat.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto pt-8 border-t border-white/10">
              <p className="text-xs text-white/40">Trusted by 2,000+ businesses worldwide</p>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Bar */}
          <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-3">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <img src="/pearsign-logo.png" alt="PearSign" className="w-8 h-8 rounded-lg" />
                <span className="text-lg font-semibold text-gray-900 dark:text-white">PearSign</span>
              </div>
              <div className="hidden lg:block" />

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>Step {currentStep} of {STEPS.length}</span>
              </div>

              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel} className="text-gray-500">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </header>

          {/* Step Progress Bar */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6">
            <div className="max-w-2xl mx-auto py-4">
              <div className="flex items-center gap-1">
                {STEPS.map((step, index) => {
                  const isCompleted = currentStep > step.id;
                  const isCurrent = currentStep === step.id;
                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all flex-shrink-0 ${
                            isCompleted
                              ? "bg-green-500 text-white"
                              : isCurrent
                              ? "bg-[hsl(var(--pearsign-primary))] text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.id}
                        </div>
                        <span className={`text-xs hidden sm:block truncate ${
                          isCurrent ? "text-gray-900 dark:text-white font-medium" : "text-gray-400 dark:text-gray-500"
                        }`}>{step.title}</span>
                      </div>
                      {index < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 rounded-full min-w-4 ${
                          isCompleted ? "bg-green-500" : "bg-gray-200 dark:bg-gray-800"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form Content */}
          <main className="flex-1 overflow-y-auto py-6 sm:py-10 px-4 sm:px-6">
            <div className="max-w-lg mx-auto">
              {error && (
                <div className="mb-6 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="h-3 w-3 text-red-600 dark:text-red-300" />
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {currentStep === 1 && (
                <div>
                  <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1.5">
                      Set up your organization
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Tell us about your company to personalize your experience
                    </p>
                  </div>
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="orgName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Organization name
                      </Label>
                      <Input
                        id="orgName"
                        placeholder="Acme Inc."
                        value={data.organizationName}
                        onChange={(e) => updateData({ organizationName: e.target.value })}
                        className="h-11"
                        data-testid="input-org-name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Industry</Label>
                      <Select value={data.industry} onValueChange={(value) => updateData({ industry: value })}>
                        <SelectTrigger className="h-11" data-testid="select-industry">
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((industry) => (
                            <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Company size</Label>
                      <Select value={data.companySize} onValueChange={(value) => updateData({ companySize: value })}>
                        <SelectTrigger className="h-11" data-testid="select-company-size">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPANY_SIZES.map((size) => (
                            <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div>
                  <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1.5">
                      Create your account
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      You'll be the owner of {data.organizationName || "this organization"}
                    </p>
                  </div>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="firstName" className="text-sm font-medium text-gray-700 dark:text-gray-300">First name</Label>
                        <Input id="firstName" placeholder="John" value={data.firstName} onChange={(e) => updateData({ firstName: e.target.value })} className="h-11" data-testid="input-first-name" autoFocus />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lastName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Last name</Label>
                        <Input id="lastName" placeholder="Doe" value={data.lastName} onChange={(e) => updateData({ lastName: e.target.value })} className="h-11" data-testid="input-last-name" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Work email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                        <Input id="email" type="email" placeholder="john@company.com" value={data.email} onChange={(e) => updateData({ email: e.target.value })} className="h-11 pl-10" data-testid="input-email" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                        <Input id="password" type="password" placeholder="At least 8 characters" value={data.password} onChange={(e) => updateData({ password: e.target.value })} className="h-11 pl-10" data-testid="input-password" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                        <Input id="confirmPassword" type="password" placeholder="Re-enter password" value={data.confirmPassword} onChange={(e) => updateData({ confirmPassword: e.target.value })} className="h-11 pl-10" data-testid="input-confirm-password" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="max-w-3xl -mx-4 sm:mx-0">
                  <div className="mb-8 px-4 sm:px-0">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1.5">
                      Choose your plan
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Start free and upgrade anytime. No credit card required.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-1 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-full w-fit mx-auto">
                    <button
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        data.billingPeriod === "monthly"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                      onClick={() => updateData({ billingPeriod: "monthly" })}
                      data-testid="button-billing-monthly"
                    >
                      Monthly
                    </button>
                    <button
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                        data.billingPeriod === "yearly"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                      onClick={() => updateData({ billingPeriod: "yearly" })}
                      data-testid="button-billing-yearly"
                    >
                      Yearly
                      <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full font-semibold">-20%</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-0">
                    {PLANS.map((plan) => {
                      const isSelected = data.plan === plan.id;
                      const price = data.billingPeriod === "yearly" && plan.yearlyPrice
                        ? Math.round(plan.yearlyPrice / 12)
                        : plan.price;
                      const PlanIcon = plan.icon;

                      return (
                        <button
                          key={plan.id}
                          className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                            isSelected
                              ? "border-[hsl(var(--pearsign-primary))] bg-blue-50/50 dark:bg-blue-900/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                          onClick={() => updateData({ plan: plan.id })}
                          data-testid={`button-plan-${plan.id}`}
                        >
                          {plan.popular && (
                            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                              <span className="bg-[hsl(var(--pearsign-primary))] text-white text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
                                Popular
                              </span>
                            </div>
                          )}

                          <div className="mb-3 pt-1">
                            <PlanIcon className={`w-5 h-5 mb-2 ${isSelected ? "text-[hsl(var(--pearsign-primary))]" : "text-gray-400"}`} />
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{plan.name}</h3>
                            <div className="mt-1">
                              {price === -1 ? (
                                <span className="text-base font-semibold text-gray-900 dark:text-white">Custom</span>
                              ) : price === 0 ? (
                                <span className="text-xl font-bold text-gray-900 dark:text-white">Free</span>
                              ) : (
                                <div>
                                  <span className="text-xl font-bold text-gray-900 dark:text-white">${price}</span>
                                  <span className="text-gray-400 text-xs">/mo</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <ul className="space-y-1.5">
                            {plan.features.slice(0, 4).map((feature, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isSelected ? "text-[hsl(var(--pearsign-primary))]" : "text-gray-300 dark:text-gray-600"}`} />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          {isSelected && (
                            <div className="absolute top-2.5 right-2.5">
                              <div className="w-5 h-5 rounded-full bg-[hsl(var(--pearsign-primary))] flex items-center justify-center">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div>
                  <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1.5">
                      Invite your team
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Collaborate with colleagues on documents. You can add more people later.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {data.teamInvites.map((invite, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="email"
                          placeholder="colleague@company.com"
                          value={invite.email}
                          onChange={(e) => updateTeamInvite(index, { email: e.target.value })}
                          className="flex-1 h-11"
                          data-testid={`input-invite-email-${index}`}
                        />
                        <Select
                          value={invite.role}
                          onValueChange={(value) => updateTeamInvite(index, { role: value as "admin" | "member" | "viewer" })}
                        >
                          <SelectTrigger className="w-28 h-11" data-testid={`select-invite-role-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => removeTeamInvite(index)} className="text-gray-400 shrink-0" data-testid={`button-remove-invite-${index}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Button variant="outline" onClick={addTeamInvite} className="w-full h-11 border-dashed" data-testid="button-add-team-member">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add team member
                    </Button>

                    {data.teamInvites.length === 0 && (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                          <Users className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                        </div>
                        <p className="text-sm text-gray-400 dark:text-gray-500">No team members added yet</p>
                        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">You can always invite people later</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div>
                  <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1.5">
                      Customize your brand
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Make signing pages and emails match your company's look
                    </p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Brand color</Label>
                      <div className="grid grid-cols-4 gap-2.5">
                        {BRAND_COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => updateData({ primaryColor: color.value })}
                            className={`relative h-11 rounded-lg transition-all ${
                              data.primaryColor === color.value
                                ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-950"
                                : ""
                            }`}
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                            data-testid={`button-color-${color.name.toLowerCase()}`}
                          >
                            {data.primaryColor === color.value && (
                              <Check className="absolute inset-0 m-auto h-5 w-5 text-white" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-gray-400">Custom:</span>
                        <Input
                          type="color"
                          value={data.primaryColor}
                          onChange={(e) => updateData({ primaryColor: e.target.value })}
                          className="w-9 h-9 p-0.5 rounded cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={data.primaryColor}
                          onChange={(e) => updateData({ primaryColor: e.target.value })}
                          className="w-24 h-9 font-mono text-xs"
                          data-testid="input-custom-color"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Logo URL <span className="text-gray-400 font-normal">(optional)</span></Label>
                      <Input
                        placeholder="https://example.com/logo.png"
                        value={data.logoUrl}
                        onChange={(e) => updateData({ logoUrl: e.target.value })}
                        className="h-11"
                        data-testid="input-logo-url"
                      />
                      <p className="text-[11px] text-gray-400">You can upload a logo later in Settings</p>
                    </div>

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                      <p className="text-[11px] text-gray-400 mb-3 uppercase tracking-wider font-medium">Preview</p>
                      <div
                        className="h-12 rounded-lg flex items-center justify-center text-white font-medium text-sm"
                        style={{ backgroundColor: data.primaryColor }}
                      >
                        {data.logoUrl ? (
                          <img src={data.logoUrl} alt="Logo" className="h-7" />
                        ) : (
                          data.organizationName || "Your Organization"
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Footer Navigation */}
          <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-3.5 px-4 sm:px-6">
            <div className="max-w-lg mx-auto flex items-center justify-between">
              <div>
                {currentStep > 1 ? (
                  <Button variant="ghost" onClick={prevStep} data-testid="button-back">
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : <div />}
              </div>

              <div className="flex items-center gap-2">
                {currentStep === 4 && (
                  <Button variant="ghost" onClick={nextStep} className="text-gray-500" data-testid="button-skip">
                    Skip
                  </Button>
                )}

                {currentStep < STEPS.length ? (
                  <Button onClick={nextStep} data-testid="button-continue">
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="button-create-org">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create organization
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
