"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Lightbulb,
  FileText,
  Search,
  Plus,
  LayoutTemplate,
  Send,
  Filter,
  Download,
  Eye,
  Activity,
  RefreshCw,
  Clock,
  CheckCircle2,
  Settings,
  Zap,
  Users,
  Calendar,
  MoreVertical,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============== TYPES ==============

export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "top" | "bottom" | "left" | "right";
  tip?: string;
}

export interface PageTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  steps: TourStep[];
  tourName: string;
}

// ============== TOUR CONFIGURATIONS ==============

export const TEMPLATES_TOUR_STEPS: TourStep[] = [
  {
    id: "templates-header",
    target: "[data-tour='templates-header']",
    title: "Templates Overview",
    description: "This is your template library. Create reusable document templates with pre-configured signature fields to save time on repetitive documents.",
    icon: <LayoutTemplate className="h-5 w-5" />,
    position: "bottom",
    tip: "Templates can be used unlimited times - create one NDA template and use it for all your contracts!",
  },
  {
    id: "templates-create",
    target: "[data-tour='templates-create']",
    title: "Create New Template",
    description: "Click here to create a new template. Upload a PDF document, add signature fields, and define signer roles.",
    icon: <Plus className="h-5 w-5" />,
    position: "bottom",
    tip: "Start with your most commonly used document to see the biggest time savings.",
  },
  {
    id: "templates-search",
    target: "[data-tour='templates-search']",
    title: "Search Templates",
    description: "Quickly find templates by name. As your library grows, search becomes essential for staying organized.",
    icon: <Search className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "templates-filter",
    target: "[data-tour='templates-filter']",
    title: "Filter by Category",
    description: "Organize templates by category (HR, Legal, Sales, etc.). Filter to show only the templates you need.",
    icon: <Filter className="h-5 w-5" />,
    position: "bottom",
    tip: "Create consistent categories across your team for easier collaboration.",
  },
  {
    id: "templates-list",
    target: "[data-tour='templates-list']",
    title: "Template Cards",
    description: "Each card shows template details: name, category, status (draft/active), and usage count. Click to edit or use the template.",
    icon: <FileText className="h-5 w-5" />,
    position: "top",
    tip: "Active templates can be used immediately. Draft templates need to be activated first.",
  },
  {
    id: "templates-actions",
    target: "[data-tour='templates-actions']",
    title: "Template Actions",
    description: "Use the menu to edit, duplicate, create a FusionForm (public link), or delete templates. Quick actions appear on hover.",
    icon: <MoreVertical className="h-5 w-5" />,
    position: "left",
    tip: "FusionForms let anyone fill and sign without needing an account!",
  },
];

export const DOCUMENTS_TOUR_STEPS: TourStep[] = [
  {
    id: "documents-header",
    target: "[data-tour='documents-header']",
    title: "My Documents",
    description: "View all documents you've sent for signature. Track status, recipients, and completion progress in one place.",
    icon: <FileText className="h-5 w-5" />,
    position: "bottom",
    tip: "This is your command center for all document activity.",
  },
  {
    id: "documents-stats",
    target: "[data-tour='documents-stats']",
    title: "Document Statistics",
    description: "Quick overview of your document activity: total sent, pending signatures, completed, and voided documents.",
    icon: <Activity className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "documents-search",
    target: "[data-tour='documents-search']",
    title: "Search Documents",
    description: "Find documents by title or recipient. Search works across all your documents instantly.",
    icon: <Search className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "documents-view-toggle",
    target: "[data-tour='documents-view-toggle']",
    title: "View Options",
    description: "Switch between grid and list views. Choose the layout that works best for you.",
    icon: <LayoutGrid className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "documents-refresh",
    target: "[data-tour='documents-refresh']",
    title: "Refresh Data",
    description: "Click to refresh and see the latest document status. Updates are also automatic.",
    icon: <RefreshCw className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "documents-table",
    target: "[data-tour='documents-table']",
    title: "Document List",
    description: "View all your documents with status indicators. Green = completed, amber = pending, red = voided. Click any row for details.",
    icon: <List className="h-5 w-5" />,
    position: "top",
    tip: "Hover over a row to see quick actions like download, remind, and void.",
  },
  {
    id: "documents-status",
    target: "[data-tour='documents-status']",
    title: "Document Status",
    description: "Each document shows its current status: Draft, Sent, Viewed, Completed, or Voided. Track progress at a glance.",
    icon: <CheckCircle2 className="h-5 w-5" />,
    position: "left",
  },
];

export const ACTIVITY_TOUR_STEPS: TourStep[] = [
  {
    id: "activity-header",
    target: "[data-tour='activity-header']",
    title: "Activity Log",
    description: "A complete audit trail of everything happening in your account. Every action is logged for security and compliance.",
    icon: <Activity className="h-5 w-5" />,
    position: "bottom",
    tip: "This log is immutable - entries can never be deleted or modified.",
  },
  {
    id: "activity-stats",
    target: "[data-tour='activity-stats']",
    title: "Activity Overview",
    description: "Quick stats showing document activity, user logins, and recent events. Get a pulse on your organization's activity.",
    icon: <Activity className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "activity-search",
    target: "[data-tour='activity-search']",
    title: "Search Activity",
    description: "Search through all activity by keyword. Find specific events, users, or documents quickly.",
    icon: <Search className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "activity-filter",
    target: "[data-tour='activity-filter']",
    title: "Filter by Type",
    description: "Filter activities by type: Documents, Templates, Users, Settings, or System events. Focus on what matters.",
    icon: <Filter className="h-5 w-5" />,
    position: "bottom",
    tip: "Use filters when investigating specific types of activity.",
  },
  {
    id: "activity-date",
    target: "[data-tour='activity-date']",
    title: "Date Range",
    description: "Filter activity by date range. View today's activity or go back to see historical events.",
    icon: <Calendar className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "activity-export",
    target: "[data-tour='activity-export']",
    title: "Export Logs",
    description: "Download activity logs as CSV or JSON for compliance reporting, audits, or record-keeping.",
    icon: <Download className="h-5 w-5" />,
    position: "bottom",
    tip: "Regular exports are recommended for compliance requirements.",
  },
  {
    id: "activity-list",
    target: "[data-tour='activity-list']",
    title: "Activity Timeline",
    description: "Each entry shows who did what and when. Color-coded by action type for easy scanning. Click for full details.",
    icon: <Clock className="h-5 w-5" />,
    position: "top",
    tip: "IP addresses and user agents are logged for security auditing.",
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
  tourName: string;
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
  tourName,
}: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<"top" | "bottom" | "left" | "right">("top");

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const arrowSize = 12;

    let top = 0;
    let left = 0;
    let arrow: "top" | "bottom" | "left" | "right" = "top";

    switch (step.position) {
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
          {Array.from({ length: totalSteps }).map((_, i) => (
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

  const padding = 6;
  const borderRadius = 10;

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="page-spotlight-mask">
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
          mask="url(#page-spotlight-mask)"
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute border-2 border-blue-500 rounded-xl pointer-events-none animate-pulse"
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

// ============== MAIN PAGE TOUR COMPONENT ==============

export function PageTour({ isOpen, onClose, onComplete, steps, tourName }: PageTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [availableSteps, setAvailableSteps] = useState<TourStep[]>([]);

  // Find available steps (elements that exist in the DOM)
  useEffect(() => {
    if (!isOpen) return;

    const checkAvailableSteps = () => {
      const available = steps.filter(step => {
        const element = document.querySelector(step.target);
        return element !== null;
      });
      setAvailableSteps(available);
    };

    const timer = setTimeout(checkAvailableSteps, 150);
    return () => clearTimeout(timer);
  }, [isOpen, steps]);

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
      sessionStorage.setItem(`${tourName}_tour_seen`, 'true');
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`${tourName}_tour_completed`, 'true');
      sessionStorage.setItem(`${tourName}_tour_seen`, 'true');
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
          tourName={tourName}
        />
      )}

      {/* Loading state */}
      {!isReady && isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Preparing tour...</p>
          </div>
        </div>
      )}
    </>
  );
}

// ============== TOUR TRIGGER BUTTON COMPONENT ==============

interface TourTriggerButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function TourTriggerButton({ onClick, label = "Take Tour", className }: TourTriggerButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn("gap-2", className)}
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </Button>
  );
}

export default PageTour;
