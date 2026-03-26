"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Circle,
  ChevronRight,
  X,
  Mail,
  MessageSquare,
  Palette,
  FileText,
  Send,
  PartyPopper,
  ArrowRight,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenantSession } from "@/contexts/tenant-session-context";

// ============== TYPES ==============

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  required: boolean;
  completed: boolean;
  skipped: boolean;
  action?: () => void;
  actionLabel?: string;
  checkConnection?: () => Promise<boolean>;
}

interface OnboardingChecklistProps {
  onComplete?: () => void;
  onDismiss?: () => void;
  showAsOverlay?: boolean;
}

// ============== COMPONENT ==============

export function OnboardingChecklist({
  onComplete,
  onDismiss,
  showAsOverlay = false,
}: OnboardingChecklistProps) {
  const { toast } = useToast();
  const { session, isAuthenticated } = useTenantSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingConnections, setIsCheckingConnections] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Initialize steps with connection status
  const initializeSteps = useCallback(async () => {
    setIsLoading(true);

    try {
      // Fetch actual integration status
      const [integrationsRes, brandingRes, templatesRes, envelopesRes] = await Promise.all([
        fetch("/api/settings/integrations").then(r => r.json()).catch(() => ({ integrations: [] })),
        fetch("/api/settings/branding").then(r => r.json()).catch(() => ({ configured: false })),
        fetch("/api/templates").then(r => r.json()).catch(() => ({ templates: [] })),
        fetch("/api/envelopes?limit=1").then(r => r.json()).catch(() => ({ envelopes: [] })),
      ]);

      const integrations = integrationsRes.integrations || [];
      const sendgridConnected = integrations.some((i: { type?: string; enabled?: boolean }) =>
        i.type === 'sendgrid' && i.enabled
      );
      const twilioConnected = integrations.some((i: { type?: string; enabled?: boolean }) =>
        i.type === 'twilio' && i.enabled
      );
      const brandingConfigured = brandingRes.configured ||
        (brandingRes.branding && (brandingRes.branding.logoUrl || brandingRes.branding.primaryColor));
      const hasTemplates = (templatesRes.templates || []).length > 0;
      const hasSentEnvelopes = (envelopesRes.envelopes || []).length > 0;

      const initialSteps: OnboardingStep[] = [
        {
          id: "welcome",
          title: "Welcome to PearSign",
          description: "Let's get your account set up for success",
          icon: <Sparkles className="w-5 h-5" />,
          required: false,
          completed: true, // Auto-complete welcome
          skipped: false,
        },
        {
          id: "sendgrid",
          title: "Connect SendGrid",
          description: "Enable email notifications for signature requests",
          icon: <Mail className="w-5 h-5" />,
          required: true,
          completed: sendgridConnected,
          skipped: false,
          actionLabel: "Connect SendGrid",
          action: () => {
            window.location.href = "/settings?tab=integrations&focus=sendgrid";
          },
        },
        {
          id: "twilio",
          title: "Connect Twilio (Optional)",
          description: "Enable SMS notifications and phone verification",
          icon: <MessageSquare className="w-5 h-5" />,
          required: false,
          completed: twilioConnected,
          skipped: false,
          actionLabel: "Connect Twilio",
          action: () => {
            window.location.href = "/settings?tab=integrations&focus=twilio";
          },
        },
        {
          id: "branding",
          title: "Set Up Your Branding",
          description: "Add your logo and brand colors for a professional look",
          icon: <Palette className="w-5 h-5" />,
          required: false,
          completed: brandingConfigured,
          skipped: false,
          actionLabel: "Set Up Branding",
          action: () => {
            window.location.href = "/settings?tab=branding";
          },
        },
        {
          id: "template",
          title: "Create Your First Template",
          description: "Build a reusable document template with signature fields",
          icon: <FileText className="w-5 h-5" />,
          required: false,
          completed: hasTemplates,
          skipped: false,
          actionLabel: "Create Template",
          action: () => {
            window.location.href = "/templates";
          },
        },
        {
          id: "send",
          title: "Send Your First Document",
          description: "Send a document for signature to test the flow",
          icon: <Send className="w-5 h-5" />,
          required: false,
          completed: hasSentEnvelopes,
          skipped: false,
          actionLabel: "Send Document",
          action: () => {
            // Open send document dialog
            const event = new CustomEvent('openSendDialog');
            window.dispatchEvent(event);
          },
        },
      ];

      setSteps(initialSteps);

      // Find first incomplete step
      const firstIncomplete = initialSteps.findIndex(s => !s.completed && !s.skipped);
      setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : 0);

      // Calculate progress
      const completedCount = initialSteps.filter(s => s.completed || s.skipped).length;
      setProgress(Math.round((completedCount / initialSteps.length) * 100));
    } catch (error) {
      console.error("[Onboarding] Error initializing steps:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      initializeSteps();
    }
  }, [isAuthenticated, initializeSteps]);

  // Refresh connections when user returns to the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isAuthenticated) {
        initializeSteps();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isAuthenticated, initializeSteps]);

  const handleStepComplete = async (stepId: string) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, completed: true } : s
    ));

    // Update progress
    const updatedSteps = steps.map(s =>
      s.id === stepId ? { ...s, completed: true } : s
    );
    const completedCount = updatedSteps.filter(s => s.completed || s.skipped).length;
    setProgress(Math.round((completedCount / updatedSteps.length) * 100));

    // Move to next step
    const nextIncomplete = updatedSteps.findIndex((s, i) => i > currentStep && !s.completed && !s.skipped);
    if (nextIncomplete >= 0) {
      setCurrentStep(nextIncomplete);
    }

    // Check if all done
    if (completedCount === updatedSteps.length) {
      setShowCelebration(true);
      toast({
        title: "Setup Complete!",
        description: "Your PearSign account is ready to use.",
      });

      // Save onboarding completion
      try {
        await fetch("/api/tenant/onboarding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete" }),
        });
      } catch (error) {
        console.error("[Onboarding] Error saving completion:", error);
      }

      onComplete?.();
    }
  };

  const handleSkipStep = async (stepId: string) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, skipped: true } : s
    ));

    // Update progress
    const updatedSteps = steps.map(s =>
      s.id === stepId ? { ...s, skipped: true } : s
    );
    const completedCount = updatedSteps.filter(s => s.completed || s.skipped).length;
    setProgress(Math.round((completedCount / updatedSteps.length) * 100));

    // Move to next step
    const nextIncomplete = updatedSteps.findIndex((s, i) => i > currentStep && !s.completed && !s.skipped);
    if (nextIncomplete >= 0) {
      setCurrentStep(nextIncomplete);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch("/api/tenant/onboarding", {
        method: "DELETE",
      });
    } catch (error) {
      console.error("[Onboarding] Error dismissing:", error);
    }

    onDismiss?.();
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading setup progress...</p>
        </CardContent>
      </Card>
    );
  }

  if (showCelebration) {
    return (
      <Card className="w-full max-w-2xl mx-auto overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-8 text-white text-center">
          <PartyPopper className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
          <p className="text-emerald-100">Your PearSign account is ready for action.</p>
        </div>
        <CardContent className="py-8 text-center">
          <Button size="lg" onClick={onComplete}>
            Start Using PearSign <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <Card className={`w-full ${showAsOverlay ? 'max-w-2xl' : ''}`}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Setup Your Account
            </CardTitle>
            <CardDescription>
              Complete these steps to get the most out of PearSign
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-2xl font-bold">{progress}%</span>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
            {onDismiss && (
              <Button variant="ghost" size="icon" onClick={handleDismiss}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-2 mt-4" />
      </CardHeader>

      <CardContent className="py-6">
        <div className="space-y-3">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isPast = step.completed || step.skipped;
            const isFuture = !isPast && !isActive;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div
                  className={`
                    relative flex items-start gap-4 p-4 rounded-lg border transition-all
                    ${isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'}
                    ${isPast ? 'opacity-60' : ''}
                    ${isFuture ? 'opacity-50' : ''}
                  `}
                >
                  {/* Status indicator */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${step.completed ? 'bg-emerald-100 text-emerald-600' : ''}
                    ${step.skipped ? 'bg-gray-100 text-gray-400' : ''}
                    ${isActive ? 'bg-primary/10 text-primary' : ''}
                    ${isFuture ? 'bg-gray-100 text-gray-400' : ''}
                  `}>
                    {step.completed ? (
                      <Check className="w-5 h-5" />
                    ) : step.skipped ? (
                      <X className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium ${isPast ? 'line-through' : ''}`}>
                        {step.title}
                      </h4>
                      {step.required && !isPast && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                      {step.completed && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50">
                          Done
                        </Badge>
                      )}
                      {step.skipped && (
                        <Badge variant="outline" className="text-xs">Skipped</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {step.description}
                    </p>

                    {/* Action buttons for active step */}
                    {isActive && !isPast && step.action && (
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" onClick={step.action}>
                          {step.actionLabel} <ExternalLink className="ml-1 w-3 h-3" />
                        </Button>
                        {!step.required && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSkipStep(step.id)}
                          >
                            Skip for now
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Arrow for active step */}
                  {isActive && (
                    <ChevronRight className="flex-shrink-0 w-5 h-5 text-primary" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Quick tips */}
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/40 rounded-lg">
          <h5 className="font-medium text-amber-800 dark:text-amber-200 mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Pro Tip</h5>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {currentStep === 1 && "SendGrid is required for sending signature request emails. You can get a free API key at sendgrid.com."}
            {currentStep === 2 && "Twilio enables SMS notifications and phone verification for signers. It's optional but recommended for important documents."}
            {currentStep === 3 && "Adding your logo and brand colors makes your documents look professional and builds trust with signers."}
            {currentStep === 4 && "Templates save time by letting you reuse document layouts. Start with a simple NDA or agreement."}
            {currentStep === 5 && "Try sending a test document to yourself first to see the complete signing experience."}
            {currentStep === 0 && "Take a few minutes to complete the setup. It'll make your document workflow much smoother!"}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (showAsOverlay) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl"
        >
          {content}
        </motion.div>
      </div>
    );
  }

  return content;
}

// ============== MINI CHECKLIST FOR SIDEBAR ==============

export function OnboardingMiniChecklist({
  onExpand,
}: {
  onExpand?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [stepsRemaining, setStepsRemaining] = useState(0);
  const { isAuthenticated } = useTenantSession();

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await fetch("/api/tenant/onboarding");
        const data = await response.json();

        if (data.success && data.progress) {
          setProgress(data.progress.overallProgress || 0);
          const remaining = data.status?.steps?.filter(
            (s: { completed: boolean; skipped: boolean }) => !s.completed && !s.skipped
          ).length || 0;
          setStepsRemaining(remaining);
        }
      } catch (error) {
        console.error("[OnboardingMini] Error fetching progress:", error);
      }
    };

    if (isAuthenticated) {
      fetchProgress();
    }
  }, [isAuthenticated]);

  if (progress >= 100 || !isAuthenticated) {
    return null;
  }

  return (
    <div
      className="p-3 mx-2 mb-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800/40 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onExpand}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Setup Progress</span>
      </div>
      <Progress value={progress} className="h-1.5 mb-1" />
      <p className="text-xs text-amber-600 dark:text-amber-400">{stepsRemaining} step{stepsRemaining !== 1 ? 's' : ''} remaining</p>
    </div>
  );
}
