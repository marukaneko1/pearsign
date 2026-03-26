"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Send,
  FileSignature,
  FileText,
  BarChart3,
  Clock,
  Menu,
  PlusCircle,
  Settings,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============== TYPES ==============

interface TourStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  fallbackTargets?: string[]; // Alternative selectors to try
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "top" | "bottom" | "left" | "right";
  offsetX?: number;
  offsetY?: number;
  optional?: boolean; // If true, skip if element not found
}

interface ProductTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

// ============== TOUR STEPS ==============

const TOUR_STEPS: TourStep[] = [
  {
    id: "sidebar",
    target: "[data-tour='sidebar']",
    title: "Navigation Menu",
    description: "Access all features from here: Documents, Templates, Sent items, Bulk Send, Forms, Invoices, Activity logs, and more.",
    icon: <Menu className="h-5 w-5" />,
    position: "right",
  },
  {
    id: "new-document",
    target: "[data-tour='new-document']",
    title: "New Document Button",
    description: "Quick shortcut to start a new document. Click here anytime to begin the sending process.",
    icon: <PlusCircle className="h-5 w-5" />,
    position: "right",
  },
  {
    id: "quick-actions",
    target: "[data-tour='quick-actions']",
    fallbackTargets: [".grid.gap-4", "[data-tour='send-document']"],
    title: "Quick Actions",
    description: "Start here! Send documents for signature, sign yourself, or use a template. These are your most common actions.",
    icon: <Send className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "send-document",
    target: "[data-tour='send-document']",
    title: "Send for Signature",
    description: "Upload a document and send it to others for their signature. Add recipients, place signature fields, and track progress.",
    icon: <FileSignature className="h-5 w-5" />,
    position: "bottom",
  },
  {
    id: "sign-yourself",
    target: "[data-tour='sign-yourself']",
    title: "Sign Yourself",
    description: "Need to sign a document yourself? Upload and add your own signature without sending to anyone else.",
    icon: <FileText className="h-5 w-5" />,
    position: "bottom",
    optional: true,
  },
  {
    id: "use-template",
    target: "[data-tour='use-template']",
    title: "Use a Template",
    description: "Save time with reusable templates. Create once, use many times with pre-configured signature fields.",
    icon: <FileText className="h-5 w-5" />,
    position: "bottom",
    optional: true,
  },
  {
    id: "stats",
    target: "[data-tour='stats']",
    fallbackTargets: [".grid.gap-4.md\\:grid-cols-2", ".grid.md\\:grid-cols-4"],
    title: "Your Dashboard Stats",
    description: "Track your document activity at a glance. See documents sent, completion rates, pending signatures, and average completion time.",
    icon: <BarChart3 className="h-5 w-5" />,
    position: "top",
  },
  {
    id: "recent-documents",
    target: "[data-tour='recent-documents']",
    fallbackTargets: [".space-y-4:last-child", "[class*='recent']"],
    title: "Recent Documents",
    description: "Quick access to your latest documents. See status, recipients, and take actions like sending reminders.",
    icon: <Clock className="h-5 w-5" />,
    position: "top",
    optional: true,
  },
  {
    id: "settings",
    target: "[data-tour='settings']",
    fallbackTargets: ["[aria-label='Settings']", "button:has(.lucide-settings)"],
    title: "Settings & Profile",
    description: "Configure your account, team settings, integrations, branding, and more. Complete your setup from here.",
    icon: <Settings className="h-5 w-5" />,
    position: "left",
  },
];

// ============== HELPER: Find element with fallbacks ==============

function findTargetElement(step: TourStep): Element | null {
  // Try primary target first
  let element = document.querySelector(step.target);
  if (element && isElementVisible(element)) {
    return element;
  }

  // Try fallback targets
  if (step.fallbackTargets) {
    for (const fallback of step.fallbackTargets) {
      try {
        element = document.querySelector(fallback);
        if (element && isElementVisible(element)) {
          return element;
        }
      } catch {
        // Invalid selector, skip
      }
    }
  }

  return null;
}

function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function isElementInViewport(rect: DOMRect): boolean {
  return (
    rect.top >= -100 &&
    rect.left >= -100 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 100 &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 100
  );
}

// ============== TOOLTIP COMPONENT ==============

interface TooltipProps {
  step: TourStep;
  currentIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  targetNotFound: boolean;
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
  targetNotFound,
  onNext,
  onPrev,
  onSkip,
  onComplete,
}: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<"top" | "bottom" | "left" | "right">("top");
  const [isPositioned, setIsPositioned] = useState(false);

  // Calculate position after tooltip is rendered
  const calculatePosition = useCallback(() => {
    if (!tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const arrowSize = 12;

    // Use fixed tooltip width for calculation (320px = w-80)
    const tooltipWidth = Math.max(tooltipRect.width, 320);
    const tooltipHeight = Math.max(tooltipRect.height, 180);

    let top = 0;
    let left = 0;
    let arrow: "top" | "bottom" | "left" | "right" = "top";

    if (targetRect && !targetNotFound) {
      // Position relative to target element
      switch (step.position) {
        case "bottom":
          top = targetRect.bottom + arrowSize + padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          arrow = "top";
          break;
        case "top":
          top = targetRect.top - tooltipHeight - arrowSize - padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          arrow = "bottom";
          break;
        case "right":
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.right + arrowSize + padding;
          arrow = "left";
          break;
        case "left":
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.left - tooltipWidth - arrowSize - padding;
          arrow = "right";
          break;
      }

      // Apply offsets
      if (step.offsetX) left += step.offsetX;
      if (step.offsetY) top += step.offsetY;
    } else {
      // Center in viewport if target not found
      top = window.innerHeight / 2 - tooltipHeight / 2;
      left = window.innerWidth / 2 - tooltipWidth / 2;
    }

    // Keep tooltip in viewport
    const viewportPadding = 20;
    if (left < viewportPadding) left = viewportPadding;
    if (left + tooltipWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - tooltipWidth - viewportPadding;
    }
    if (top < viewportPadding) top = viewportPadding;
    if (top + tooltipHeight > window.innerHeight - viewportPadding) {
      top = window.innerHeight - tooltipHeight - viewportPadding;
    }

    setPosition({ top, left });
    setArrowPosition(arrow);
    setIsPositioned(true);
  }, [targetRect, targetNotFound, step]);

  // Initial position calculation with delay for render
  useEffect(() => {
    setIsPositioned(false);
    // Wait for tooltip to render before calculating position
    const timer = setTimeout(calculatePosition, 50);
    return () => clearTimeout(timer);
  }, [calculatePosition]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => calculatePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculatePosition]);

  const isLastStep = currentIndex === totalSteps - 1;

  return (
    <div
      ref={tooltipRef}
      className={cn(
        "fixed z-[10002] w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-opacity duration-200",
        isPositioned ? "opacity-100" : "opacity-0"
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Arrow - only show if target was found */}
      {targetRect && !targetNotFound && (
        <div
          className={cn(
            "absolute w-3 h-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 transform rotate-45",
            arrowPosition === "top" && "-top-1.5 left-1/2 -translate-x-1/2 border-l border-t",
            arrowPosition === "bottom" && "-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b",
            arrowPosition === "left" && "-left-1.5 top-1/2 -translate-y-1/2 border-l border-b",
            arrowPosition === "right" && "-right-1.5 top-1/2 -translate-y-1/2 border-r border-t",
          )}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            targetNotFound
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600"
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
          )}>
            {targetNotFound ? <AlertCircle className="h-5 w-5" /> : step.icon}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
              {step.title}
            </h4>
            <Badge variant="secondary" className="text-xs mt-0.5">
              Step {currentIndex + 1} of {totalSteps}
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
        {targetNotFound && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Element not visible - you may need to scroll or navigate
          </p>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {step.description}
        </p>
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
            Finish
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
  onBackdropClick: () => void;
}

function SpotlightOverlay({ targetRect, onBackdropClick }: SpotlightProps) {
  const [animationKey, setAnimationKey] = useState(0);

  // Reset animation when target changes
  useEffect(() => {
    setAnimationKey(prev => prev + 1);
  }, [targetRect]);

  if (!targetRect) {
    // Show dimmed overlay without spotlight
    return (
      <div
        className="fixed inset-0 z-[10000] bg-black/50"
        onClick={onBackdropClick}
      />
    );
  }

  const padding = 10;
  const borderRadius = 12;

  return (
    <div
      className="fixed inset-0 z-[10000]"
      onClick={onBackdropClick}
    >
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" key={`svg-${animationKey}`}>
        <defs>
          <mask id="spotlight-mask">
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
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Animated highlight border */}
      <div
        key={`highlight-${animationKey}`}
        className="absolute pointer-events-none"
        style={{
          left: targetRect.left - padding,
          top: targetRect.top - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
        }}
      >
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-xl animate-pulse"
          style={{
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 30px rgba(59, 130, 246, 0.4)',
          }}
        />
        {/* Inner border */}
        <div
          className="absolute inset-0 rounded-xl border-2 border-blue-500"
          style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
        {/* Corner accents */}
        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400 rounded-tr-lg" />
        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl-lg" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br-lg" />
      </div>
    </div>
  );
}

// ============== MAIN PRODUCT TOUR COMPONENT ==============

export function ProductTour({ isOpen, onClose, onComplete }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Find and highlight the target element
  const updateTargetRect = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    const element = findTargetElement(step);

    if (element) {
      const rect = element.getBoundingClientRect();

      // Check if element is in viewport
      if (!isElementInViewport(rect)) {
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        // Wait for scroll and update rect
        setTimeout(() => {
          const newRect = element.getBoundingClientRect();
          setTargetRect(newRect);
          setTargetNotFound(false);
          setIsReady(true);
        }, 300);
      } else {
        setTargetRect(rect);
        setTargetNotFound(false);
        setIsReady(true);
      }
      retryCountRef.current = 0;
    } else {
      // Element not found
      if (retryCountRef.current < maxRetries) {
        // Retry after a short delay (element might be loading)
        retryCountRef.current++;
        setTimeout(updateTargetRect, 200);
      } else {
        // Give up and show tooltip without highlight
        console.warn(`[ProductTour] Element not found for step: ${step.id} after ${maxRetries} retries`);
        setTargetRect(null);
        setTargetNotFound(true);
        setIsReady(true);
        retryCountRef.current = 0;

        // If step is optional, auto-skip to next
        if (step.optional && currentStep < TOUR_STEPS.length - 1) {
          setTimeout(() => setCurrentStep(currentStep + 1), 100);
        }
      }
    }
  }, [currentStep]);

  useEffect(() => {
    if (isOpen) {
      retryCountRef.current = 0;
      // Small delay to let DOM settle
      const timer = setTimeout(updateTargetRect, 150);
      return () => clearTimeout(timer);
    } else {
      setIsReady(false);
      setCurrentStep(0);
      setTargetNotFound(false);
    }
  }, [isOpen, currentStep, updateTargetRect]);

  // Handle window resize and scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => {
      const step = TOUR_STEPS[currentStep];
      if (!step) return;

      const element = findTargetElement(step);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isOpen, currentStep]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setIsReady(false);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setIsReady(false);
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
  };

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  if (!step) return null;

  return (
    <>
      <SpotlightOverlay
        targetRect={isReady ? targetRect : null}
        onBackdropClick={handleSkip}
      />
      {isReady && (
        <TourTooltip
          step={step}
          currentIndex={currentStep}
          totalSteps={TOUR_STEPS.length}
          targetRect={targetRect}
          targetNotFound={targetNotFound}
          onNext={handleNext}
          onPrev={handlePrev}
          onSkip={handleSkip}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}
