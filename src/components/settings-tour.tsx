"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Settings,
  Users,
  Shield,
  Mail,
  Palette,
  Clock,
  FileCheck,
  Bell,
  HardDrive,
  Key,
  BarChart3,
  AlertTriangle,
  Blocks,
  Plug,
  PlayCircle,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============== TYPES ==============

interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "top" | "bottom" | "left" | "right";
  tip?: string;
}

interface SettingsTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

// ============== TOUR STEPS ==============

const SETTINGS_TOUR_STEPS: TourStep[] = [
  {
    id: "general",
    target: "[data-tour='settings-general']",
    title: "General Settings",
    description: "Update your profile information, name, email, and account preferences. This is your personal identity in PearSign.",
    icon: <Settings className="h-5 w-5" />,
    position: "right",
    tip: "Keep your profile updated so recipients know who's sending them documents.",
  },
  {
    id: "setup-guide",
    target: "[data-tour='settings-setup-guide']",
    title: "Setup Guide",
    description: "Track your onboarding progress and complete essential setup steps. Reopen the walkthrough anytime from here.",
    icon: <PlayCircle className="h-5 w-5" />,
    position: "right",
    tip: "Complete all setup steps to unlock the full potential of PearSign.",
  },
  {
    id: "integrations",
    target: "[data-tour='settings-integrations']",
    title: "Integrations",
    description: "Connect external services like SendGrid for emails, Twilio for SMS, Google Drive, Dropbox, and Salesforce.",
    icon: <Plug className="h-5 w-5" />,
    position: "right",
    tip: "SendGrid is required for sending signature request emails. Set it up first!",
  },
  {
    id: "storage-billing",
    target: "[data-tour='settings-storage-billing']",
    title: "Storage & Billing",
    description: "View your storage usage, document limits, and manage your subscription plan. Upgrade to unlock more features.",
    icon: <HardDrive className="h-5 w-5" />,
    position: "right",
    tip: "Monitor your usage to avoid hitting plan limits.",
  },
  {
    id: "modules",
    target: "[data-tour='settings-modules']",
    title: "Modules",
    description: "Enable or disable optional features like Bulk Send, FusionForms, and Document Center based on your needs.",
    icon: <Blocks className="h-5 w-5" />,
    position: "right",
    tip: "Disable unused modules to keep your workspace clean.",
  },
  {
    id: "api-keys",
    target: "[data-tour='settings-api-keys']",
    title: "API Keys",
    description: "Generate and manage API keys for programmatic access to PearSign. Build custom integrations with your apps.",
    icon: <Key className="h-5 w-5" />,
    position: "right",
    tip: "Never share your API keys publicly. Rotate them regularly for security.",
  },
  {
    id: "notifications",
    target: "[data-tour='settings-notifications']",
    title: "Notifications",
    description: "Configure how and when you receive alerts about document activity, completions, and team updates.",
    icon: <Bell className="h-5 w-5" />,
    position: "right",
    tip: "Enable email notifications to never miss a signed document.",
  },
  {
    id: "team",
    target: "[data-tour='settings-team']",
    title: "Team Management",
    description: "Invite team members, manage their access, and see who's part of your organization.",
    icon: <Users className="h-5 w-5" />,
    position: "right",
    tip: "Assign appropriate roles to team members for security.",
  },
  {
    id: "roles",
    target: "[data-tour='settings-roles']",
    title: "Roles & Permissions",
    description: "Define custom roles with specific permissions. Control who can send documents, manage templates, and access billing.",
    icon: <Shield className="h-5 w-5" />,
    position: "right",
    tip: "Use the principle of least privilege - give users only the access they need.",
  },
  {
    id: "email",
    target: "[data-tour='settings-email']",
    title: "Email Templates",
    description: "Customize the emails sent to signers. Edit subject lines, messages, and branding for a professional touch.",
    icon: <Mail className="h-5 w-5" />,
    position: "right",
    tip: "Personalized emails get better open rates and faster signatures.",
  },
  {
    id: "branding",
    target: "[data-tour='settings-branding']",
    title: "Branding",
    description: "Upload your logo, set brand colors, and customize the signing experience. White-label options available.",
    icon: <Palette className="h-5 w-5" />,
    position: "right",
    tip: "A branded experience builds trust with your signers.",
  },
  {
    id: "compliance",
    target: "[data-tour='settings-compliance']",
    title: "Compliance",
    description: "Configure document retention policies, audit settings, and security requirements for regulatory compliance.",
    icon: <FileCheck className="h-5 w-5" />,
    position: "right",
    tip: "Set up retention policies to automatically manage old documents.",
  },
];

// ============== TOOLTIP COMPONENT ==============

interface TooltipProps {
  step: TourStep;
  currentIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

function TourTooltip({
  step,
  currentIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  onComplete,
}: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<"top" | "bottom" | "left" | "right">("left");

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const arrowSize = 12;

    let top = 0;
    let left = 0;
    let arrow: "top" | "bottom" | "left" | "right" = "left";

    switch (step.position) {
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.right + arrowSize + padding;
        arrow = "left";
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left - tooltipRect.width - arrowSize - padding;
        arrow = "right";
        break;
      case "bottom":
        top = targetRect.bottom + arrowSize + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        arrow = "top";
        break;
      case "top":
        top = targetRect.top - tooltipRect.height - arrowSize - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        arrow = "bottom";
        break;
    }

    // Keep tooltip in viewport
    const viewportPadding = 20;
    if (left < viewportPadding) left = viewportPadding;
    if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - tooltipRect.width - viewportPadding;
    }
    if (top < viewportPadding) top = viewportPadding;
    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = window.innerHeight - tooltipRect.height - viewportPadding;
    }

    setPosition({ top, left });
    setArrowPosition(arrow);
  }, [targetRect, step]);

  const isLastStep = currentIndex === totalSteps - 1;

  return (
    <div
      ref={tooltipRef}
      className={cn(
        "fixed z-[10002] w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200",
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Arrow */}
      <div
        className={cn(
          "absolute w-3 h-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 transform rotate-45",
          arrowPosition === "top" && "-top-1.5 left-1/2 -translate-x-1/2 border-l border-t",
          arrowPosition === "bottom" && "-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b",
          arrowPosition === "left" && "-left-1.5 top-1/2 -translate-y-1/2 border-l border-b",
          arrowPosition === "right" && "-right-1.5 top-1/2 -translate-y-1/2 border-r border-t",
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            {step.icon}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
              {step.title}
            </h4>
            <Badge variant="secondary" className="text-xs mt-0.5">
              {currentIndex + 1} of {totalSteps}
            </Badge>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {step.description}
        </p>

        {/* Pro Tip */}
        {step.tip && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Pro tip:</strong> {step.tip}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalSteps, 12) }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-blue-600"
                  : i < currentIndex
                  ? "bg-blue-300"
                  : "bg-gray-300 dark:bg-gray-600"
              )}
            />
          ))}
        </div>

        {isLastStep ? (
          <Button
            size="sm"
            onClick={onComplete}
            className="gap-1 bg-green-600 hover:bg-green-700"
          >
            <Sparkles className="h-4 w-4" />
            Done
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onNext}
            className="gap-1"
            style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============== SPOTLIGHT OVERLAY ==============

interface SpotlightProps {
  targetRect: DOMRect | null;
}

function SpotlightOverlay({ targetRect }: SpotlightProps) {
  if (!targetRect) return null;

  const padding = 4;
  const borderRadius = 8;

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="settings-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - padding}
              y={targetRect.top - padding}
              width={targetRect.width + padding * 2}
              height={targetRect.height + padding * 2}
              rx={borderRadius}
              ry={borderRadius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.5)"
          mask="url(#settings-spotlight-mask)"
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute border-2 border-blue-500 rounded-lg pointer-events-none animate-pulse"
        style={{
          left: targetRect.left - padding,
          top: targetRect.top - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          boxShadow: '0 0 0 4px rgba(36, 100, 234, 0.2), 0 0 15px rgba(36, 100, 234, 0.3)',
        }}
      />
    </div>
  );
}

// ============== MAIN SETTINGS TOUR COMPONENT ==============

export function SettingsTour({ isOpen, onClose, onComplete }: SettingsTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [availableSteps, setAvailableSteps] = useState<TourStep[]>([]);

  // Find available steps (elements that exist in the DOM)
  useEffect(() => {
    if (!isOpen) return;

    const checkAvailableSteps = () => {
      const available = SETTINGS_TOUR_STEPS.filter(step => {
        const element = document.querySelector(step.target);
        return element !== null;
      });
      setAvailableSteps(available);
    };

    // Small delay to let DOM settle
    const timer = setTimeout(checkAvailableSteps, 100);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Find and highlight the target element
  const updateTargetRect = useCallback(() => {
    if (availableSteps.length === 0) return;

    const step = availableSteps[currentStep];
    if (!step) return;

    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      setIsReady(true);

      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      console.warn(`[SettingsTour] Element not found for step: ${step.id}`);
      setTargetRect(null);
    }
  }, [currentStep, availableSteps]);

  useEffect(() => {
    if (isOpen && availableSteps.length > 0) {
      const timer = setTimeout(updateTargetRect, 150);
      return () => clearTimeout(timer);
    } else {
      setIsReady(false);
      setCurrentStep(0);
    }
  }, [isOpen, currentStep, updateTargetRect, availableSteps]);

  // Handle window resize
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => updateTargetRect();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, updateTargetRect]);

  const handleNext = () => {
    if (currentStep < availableSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('settings_tour_seen', 'true');
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('settings_tour_completed', 'true');
      sessionStorage.setItem('settings_tour_seen', 'true');
    }
  };

  if (!isOpen) return null;

  const step = availableSteps[currentStep];

  return (
    <>
      {/* Spotlight overlay */}
      {isReady && targetRect && (
        <SpotlightOverlay targetRect={targetRect} />
      )}

      {/* Tooltip */}
      {isReady && step && (
        <TourTooltip
          step={step}
          currentIndex={currentStep}
          totalSteps={availableSteps.length}
          targetRect={targetRect}
          onNext={handleNext}
          onPrev={handlePrev}
          onSkip={handleSkip}
          onComplete={handleComplete}
        />
      )}

      {/* Loading state */}
      {!isReady && isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Preparing settings tour...</p>
          </div>
        </div>
      )}
    </>
  );
}

export default SettingsTour;
