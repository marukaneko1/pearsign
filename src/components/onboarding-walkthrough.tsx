"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  FileSignature,
  Mail,
  MessageSquare,
  Palette,
  PlayCircle,
  Send,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Zap,
  Shield,
  Users,
  Clock,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  skipped: boolean;
  required: boolean;
}

interface OnboardingStatus {
  tenantId: string;
  hasCompletedOnboarding: boolean;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  hasDemoData: boolean;
  showWalkthrough: boolean;
}

interface IntegrationStatus {
  sendgrid: {
    connected: boolean;
    apiKey?: string;
    fromEmail?: string;
  };
  twilio: {
    connected: boolean;
    accountSid?: string;
    phoneNumber?: string;
  };
  branding: {
    configured: boolean;
    logoUrl?: string;
    primaryColor?: string;
  };
}

interface SetupProgress {
  integrations: IntegrationStatus;
  hasTemplates: boolean;
  hasSentEnvelope: boolean;
  teamConfigured: boolean;
  brandingConfigured: boolean;
  overallProgress: number;
}

interface OnboardingWalkthroughProps {
  onClose: () => void;
  onNavigate: (path: string) => void;
  onStartTour?: () => void;
  isOpen?: boolean;
}

function WelcomeStep({ onNext, onStartTour }: { onNext: () => void; onStartTour?: () => void }) {
  return (
    <div className="space-y-6 py-2">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto">
          <img src="/pearsign-logo.png" alt="PearSign" className="w-14 h-14 rounded-xl" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Welcome to PearSign
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-sm mx-auto">
            The modern way to send, sign, and manage documents. Let's get you set up.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Zap, title: "Lightning Fast", desc: "Send documents for signature in seconds", color: "text-amber-500" },
          { icon: Shield, title: "Secure & Compliant", desc: "Bank-level encryption & audit trails", color: "text-blue-500" },
          { icon: Users, title: "Team Collaboration", desc: "Invite your team and work together", color: "text-violet-500" },
          { icon: Clock, title: "Real-time Tracking", desc: "Know exactly when documents are signed", color: "text-green-500" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-left">
              <Icon className={`h-5 w-5 ${item.color} mb-1.5`} />
              <h4 className="font-medium text-xs text-gray-900 dark:text-white">{item.title}</h4>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{item.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3.5 text-left">
        <h4 className="font-medium text-xs text-gray-900 dark:text-white mb-2">How it works:</h4>
        <div className="space-y-2">
          {[
            { num: "1", label: "Templates", desc: "Create reusable document templates with signature fields" },
            { num: "2", label: "Envelopes", desc: "Send documents to signers via email" },
            { num: "3", label: "Signers", desc: "Recipients sign digitally with legally binding e-signatures" },
          ].map((step) => (
            <div key={step.num} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[hsl(var(--pearsign-primary))] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{step.num}</div>
              <span className="text-xs text-gray-600 dark:text-gray-400"><strong className="text-gray-900 dark:text-white">{step.label}</strong> - {step.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2.5">
        {onStartTour && (
          <Button variant="outline" onClick={onStartTour} className="flex-1" data-testid="button-take-tour">
            <PlayCircle className="mr-1.5 h-4 w-4" />
            Take a Tour
          </Button>
        )}
        <Button onClick={onNext} className={cn(onStartTour ? "flex-1" : "w-full")} data-testid="button-continue-setup">
          {onStartTour ? 'Continue Setup' : "Let's Get Started"}
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function IntegrationsStep({
  integrations,
  onNavigate
}: {
  integrations: IntegrationStatus;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-1.5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Connect Your Services
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-xs max-w-sm mx-auto">
          PearSign uses your own email and SMS services for full control and deliverability.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-800/40 rounded-lg p-3">
        <div className="flex gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium text-amber-800 dark:text-amber-200">Why do I need my own accounts?</p>
            <p className="text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              Full control over deliverability, compliance, and costs. Your data stays yours.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {/* SendGrid */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white">SendGrid</h4>
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${integrations.sendgrid.connected ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : ""}`}>
                    {integrations.sendgrid.connected ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected</> : "Not Connected"}
                  </Badge>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">Signer notifications, completion emails, reminders</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/settings/integrations')} className="flex-shrink-0" data-testid="button-connect-sendgrid">
              {integrations.sendgrid.connected ? 'Edit' : 'Connect'}
            </Button>
          </div>
        </div>

        {/* Twilio */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="h-5 w-5 text-purple-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white">Twilio</h4>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Optional</Badge>
                  {integrations.twilio.connected && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">SMS notifications and 2FA phone verification</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/settings/integrations')} className="flex-shrink-0" data-testid="button-connect-twilio">
              {integrations.twilio.connected ? 'Edit' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandingStep({
  branding,
  onNavigate
}: {
  branding: IntegrationStatus['branding'];
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-1.5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Customize Your Branding
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-xs max-w-sm mx-auto">
          Add your logo and brand colors for a professional signing experience.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Palette className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm text-gray-900 dark:text-white">Brand Settings</h4>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${branding.configured ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : ""}`}>
                  {branding.configured ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Configured</> : "Not Set"}
                </Badge>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Your logo appears on emails and signing pages</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('/settings/branding')} className="flex-shrink-0" data-testid="button-setup-branding">
            {branding.configured ? 'Edit' : 'Set Up'}
          </Button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3.5">
        <p className="text-[11px] text-gray-400 mb-2.5 uppercase tracking-wider font-medium">Preview</p>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3.5">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ backgroundColor: branding.primaryColor || '#2464ea' }}>
              <span className="text-white font-bold text-xs">P</span>
            </div>
            <span className="font-medium text-sm text-gray-900 dark:text-white">Your Company</span>
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-3/4 bg-gray-100 dark:bg-gray-700 rounded" />
            <div className="h-1.5 w-1/2 bg-gray-100 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-center text-gray-400">
        You can skip this and customize later in Settings
      </p>
    </div>
  );
}

function DemoStep({
  hasDemoData,
  onCreateDemo,
  onRemoveDemo,
  isLoading
}: {
  hasDemoData: boolean;
  onCreateDemo: () => void;
  onRemoveDemo: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-1.5">
        <div className="w-12 h-12 mx-auto rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
          <PlayCircle className="h-6 w-6 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Try With Demo Data
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-xs max-w-sm mx-auto">
          Explore PearSign with sample templates and documents to learn how it works.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-5">
        {hasDemoData ? (
          <div className="text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h4 className="font-medium text-sm text-gray-900 dark:text-white">Demo Data Active</h4>
              <p className="text-xs text-gray-400 mt-0.5">Sample templates and documents are ready to explore.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRemoveDemo} disabled={isLoading} data-testid="button-remove-demo">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Remove Demo Data
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white">What's Included</h4>
            <ul className="text-xs text-gray-500 space-y-1.5">
              {["Sample NDA Template", "Pre-configured signature fields", "Learn the signing workflow"].map((item) => (
                <li key={item} className="flex items-center gap-2 justify-center">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  {item}
                </li>
              ))}
            </ul>
            <Button onClick={onCreateDemo} disabled={isLoading} className="bg-green-600 hover:bg-green-700" data-testid="button-add-demo">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
              Add Demo Data
            </Button>
          </div>
        )}
      </div>

      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-lg p-2.5">
        <p className="text-[11px] text-blue-600/80 dark:text-blue-400/70 text-center">
          Demo data is clearly labeled and can be removed anytime. It won't affect real documents.
        </p>
      </div>
    </div>
  );
}

function FirstSendStep({
  hasTemplates,
  hasSentEnvelope,
  onNavigate
}: {
  hasTemplates: boolean;
  hasSentEnvelope: boolean;
  onNavigate: (path: string) => void;
}) {
  const steps = [
    {
      num: 1,
      title: "Create a Template",
      desc: "Upload a document and add signature fields",
      done: hasTemplates,
      active: !hasTemplates,
      action: () => onNavigate('/templates'),
      actionLabel: hasTemplates ? 'View Templates' : 'Create Template',
    },
    {
      num: 2,
      title: "Send for Signature",
      desc: "Add recipients and send your document",
      done: hasSentEnvelope,
      active: hasTemplates && !hasSentEnvelope,
      action: () => onNavigate('/dashboard'),
      actionLabel: hasSentEnvelope ? 'View Sent' : 'Send Document',
      disabled: !hasTemplates,
    },
    {
      num: 3,
      title: "Track & Complete",
      desc: "Monitor signing progress and download completed documents",
      done: false,
      active: false,
    },
  ];

  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-1.5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Send Your First Document
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-xs max-w-sm mx-auto">
          You're almost there! Follow these steps to send your first document.
        </p>
      </div>

      <div className="space-y-2.5">
        {steps.map((step) => (
          <div key={step.num} className={`bg-white dark:bg-gray-800/50 border rounded-lg p-3.5 transition-colors ${
            step.done ? 'border-green-200 dark:border-green-800/40' : 'border-gray-200 dark:border-gray-700/50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.done
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    : step.active
                    ? 'bg-[hsl(var(--pearsign-primary))] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}>
                  {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs font-semibold">{step.num}</span>}
                </div>
                <div>
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white">{step.title}</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">{step.desc}</p>
                </div>
              </div>
              {step.action && (
                <Button
                  variant={step.active ? "default" : "ghost"}
                  size="sm"
                  onClick={step.action}
                  disabled={step.disabled}
                  className="flex-shrink-0"
                  data-testid={`button-step-${step.num}`}
                >
                  {step.actionLabel}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasSentEnvelope && (
        <div className="bg-green-50 dark:bg-green-900/15 border border-green-200/60 dark:border-green-800/40 rounded-lg p-4 text-center">
          <CheckCircle2 className="h-7 w-7 text-green-500 mx-auto mb-1.5" />
          <h4 className="font-semibold text-sm text-green-800 dark:text-green-200">You've sent your first document!</h4>
          <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">
            You're ready to use PearSign.
          </p>
        </div>
      )}
    </div>
  );
}

export function OnboardingWalkthrough({ onClose, onNavigate, onStartTour, isOpen = true }: OnboardingWalkthroughProps) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tenant/onboarding');
      const data = await response.json();

      if (data.success) {
        setStatus(data.status);
        setProgress(data.progress);
        setCurrentStep(data.status.currentStep || 0);
      }
    } catch (error) {
      console.error('Failed to load onboarding status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  const goToStep = async (step: number) => {
    setCurrentStep(step);

    try {
      await fetch('/api/tenant/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setStep', currentStep: step }),
      });
    } catch (error) {
      console.error('Failed to save step:', error);
    }
  };

  const nextStep = () => {
    if (currentStep < 4) {
      goToStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch('/api/tenant/onboarding', { method: 'DELETE' });
      onClose();
    } catch (error) {
      console.error('Failed to dismiss:', error);
      onClose();
    }
  };

  const handleComplete = async () => {
    try {
      await fetch('/api/tenant/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      onClose();
    } catch (error) {
      console.error('Failed to complete:', error);
      onClose();
    }
  };

  const handleCreateDemo = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/tenant/onboarding/demo-data', { method: 'POST' });
      await loadStatus();
    } catch (error) {
      console.error('Failed to create demo data:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDemo = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/tenant/onboarding/demo-data', { method: 'DELETE' });
      await loadStatus();
    } catch (error) {
      console.error('Failed to remove demo data:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleNavigate = (path: string) => {
    handleDismiss();
    onNavigate(path);
  };

  const stepTitles = ['Welcome', 'Integrations', 'Branding', 'Demo', 'First Send'];

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Getting Started with PearSign</DialogTitle>
          <DialogDescription>Complete these steps to set up your account</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : (
          <div>
            {/* Header with progress */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Step {currentStep + 1} of {stepTitles.length}</span>
                <button onClick={handleDismiss} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" data-testid="button-dismiss-walkthrough">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {/* Step Dots */}
              <div className="flex gap-1.5">
                {stepTitles.map((title, index) => (
                  <button
                    key={title}
                    onClick={() => goToStep(index)}
                    className={`flex-1 h-1.5 rounded-full transition-all ${
                      index === currentStep
                        ? 'bg-[hsl(var(--pearsign-primary))]'
                        : index < currentStep
                        ? 'bg-green-400'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    data-testid={`button-step-dot-${index}`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                {stepTitles.map((title, index) => (
                  <span key={title} className={`text-[10px] ${index === currentStep ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}`}>
                    {title}
                  </span>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="px-5 py-4 min-h-[380px]">
              {currentStep === 0 && (
                <WelcomeStep onNext={nextStep} onStartTour={onStartTour} />
              )}
              {currentStep === 1 && progress && (
                <IntegrationsStep integrations={progress.integrations} onNavigate={handleNavigate} />
              )}
              {currentStep === 2 && progress && (
                <BrandingStep branding={progress.integrations.branding} onNavigate={handleNavigate} />
              )}
              {currentStep === 3 && status && (
                <DemoStep hasDemoData={status.hasDemoData} onCreateDemo={handleCreateDemo} onRemoveDemo={handleRemoveDemo} isLoading={actionLoading} />
              )}
              {currentStep === 4 && progress && (
                <FirstSendStep hasTemplates={progress.hasTemplates} hasSentEnvelope={progress.hasSentEnvelope} onNavigate={handleNavigate} />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
              <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentStep === 0} className="text-gray-500" data-testid="button-walkthrough-back">
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-gray-400" data-testid="button-skip-setup">
                  Skip for now
                </Button>

                {currentStep === 4 ? (
                  <Button size="sm" onClick={handleComplete} data-testid="button-complete-setup">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Complete Setup
                  </Button>
                ) : (
                  <Button size="sm" onClick={nextStep} data-testid="button-walkthrough-next">
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingWalkthrough;
