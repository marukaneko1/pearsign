"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Mail,
  MessageSquare,
  Palette,
  FileText,
  Send,
  ChevronRight,
  Loader2,
  Sparkles,
  PlayCircle,
  X,
} from "lucide-react";

interface IntegrationStatus {
  sendgrid: { connected: boolean };
  twilio: { connected: boolean };
  branding: { configured: boolean };
}

interface SetupProgress {
  integrations: IntegrationStatus;
  hasTemplates: boolean;
  hasSentEnvelope: boolean;
  teamConfigured: boolean;
  brandingConfigured: boolean;
  overallProgress: number;
}

interface SetupChecklistProps {
  variant?: 'compact' | 'full';
  onNavigate?: (path: string) => void;
  onOpenWalkthrough?: () => void;
  onStartTour?: () => void;
}

export function SetupChecklist({
  variant = 'compact',
  onNavigate,
  onOpenWalkthrough,
  onStartTour
}: SetupChecklistProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const loadProgress = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await fetch('/api/tenant/onboarding');
      const data = await response.json();

      if (data.success) {
        setProgress(data.progress);
        if (data.status?.hasCompletedOnboarding) {
          setOnboardingCompleted(true);
        }
      }
    } catch (error) {
      console.error('Failed to load setup progress:', error);
      setLoadError('Failed to load setup progress');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('pearsign_setup_checklist_dismissed');
    if (wasDismissed === 'true') {
      setDismissed(true);
    }
    loadProgress();
  }, [loadProgress]);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    localStorage.setItem('pearsign_setup_checklist_dismissed', 'true');
    try {
      await fetch('/api/tenant/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
    } catch {
    }
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    console.warn('[SetupChecklist] Error loading progress:', loadError);
    return null; // Silently hide on error — don't block the dashboard
  }

  if (!progress || dismissed || onboardingCompleted) {
    return null;
  }

  if (progress.overallProgress >= 100) {
    return null;
  }

  const items = [
    {
      id: 'sendgrid',
      title: 'Email Service (SendGrid)',
      description: 'Connect SendGrid to send emails',
      completed: progress.integrations.sendgrid.connected,
      required: true,
      icon: Mail,
      path: '/settings/integrations',
    },
    {
      id: 'twilio',
      title: 'SMS Service (Twilio)',
      description: 'Optional: Enable SMS notifications',
      completed: progress.integrations.twilio.connected,
      required: false,
      icon: MessageSquare,
      path: '/settings/integrations',
    },
    {
      id: 'branding',
      title: 'Branding',
      description: 'Add your logo and colors',
      completed: progress.brandingConfigured,
      required: false,
      icon: Palette,
      path: '/settings/branding',
    },
    {
      id: 'template',
      title: 'Create Template',
      description: 'Set up your first template',
      completed: progress.hasTemplates,
      required: false,
      icon: FileText,
      path: '/templates',
    },
    {
      id: 'send',
      title: 'Send Document',
      description: 'Send your first document',
      completed: progress.hasSentEnvelope,
      required: false,
      icon: Send,
      path: '/dashboard',
    },
  ];

  const completedCount = items.filter(i => i.completed).length;

  if (variant === 'compact') {
    return (
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-gray-900 dark:text-white">Complete Your Setup</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {completedCount}/{items.length}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDismiss}
                className="h-6 w-6 text-muted-foreground"
                data-testid="button-dismiss-setup-checklist"
                title="Dismiss setup checklist"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Progress value={progress.overallProgress} className="h-2 mb-3" />

          <div className="flex flex-wrap gap-2 mb-3">
            {items.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                  item.completed
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {item.title.split(' ')[0]}
              </div>
            ))}
            {items.length > 3 && (
              <span className="text-xs text-gray-500">+{items.length - 3} more</span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenWalkthrough}
              className="flex-1"
            >
              <PlayCircle className="h-4 w-4 mr-1" />
              Setup Guide
            </Button>
            {onStartTour && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onStartTour}
                className="px-3"
                title="Take a quick tour of the dashboard"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                const incomplete = items.find(i => !i.completed);
                if (incomplete && onNavigate) {
                  onNavigate(incomplete.path);
                }
              }}
              className="flex-1"
            >
              Continue Setup
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Setup Checklist
            </CardTitle>
            <CardDescription>Complete these steps to get the most out of PearSign</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {progress.overallProgress}% Complete
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDismiss}
              data-testid="button-dismiss-setup-checklist-full"
              title="Dismiss setup checklist"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Progress value={progress.overallProgress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              item.completed
                ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                item.completed
                  ? 'bg-green-100 dark:bg-green-900/50'
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <item.icon className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-sm ${
                    item.completed ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'
                  }`}>
                    {item.title}
                  </span>
                  {item.required && !item.completed && (
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
            {!item.completed && onNavigate && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate(item.path)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        <div className="pt-3 border-t">
          <Button
            variant="outline"
            onClick={onOpenWalkthrough}
            className="w-full"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Reopen Setup Guide
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SetupChecklist;
