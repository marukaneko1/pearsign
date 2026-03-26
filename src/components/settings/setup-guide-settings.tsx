"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  PlayCircle,
  CheckCircle2,
  Circle,
  Mail,
  MessageSquare,
  Palette,
  FileText,
  Send,
  Loader2,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useTenant } from "@/contexts/tenant-context";

// ============== TYPES ==============

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

interface OnboardingStatus {
  hasCompletedOnboarding: boolean;
  hasDemoData: boolean;
  showWalkthrough: boolean;
}

// ============== COMPONENT ==============

export function SetupGuideSettings() {
  const { isDemo } = useTenant();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tenant/onboarding');
      const data = await response.json();

      if (data.success) {
        setProgress(data.progress);
        setStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load setup data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReopenWalkthrough = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/tenant/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen' }),
      });
      // Dispatch event to open walkthrough
      window.dispatchEvent(new CustomEvent('open-onboarding-walkthrough'));
    } catch (error) {
      console.error('Failed to reopen walkthrough:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDemo = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/tenant/onboarding/demo-data', { method: 'POST' });
      await loadData();
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
      await loadData();
    } catch (error) {
      console.error('Failed to remove demo data:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (isDemo) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Demo Mode</h3>
            <p className="text-muted-foreground mb-4">
              Sign in to access the setup guide and complete your organization setup.
            </p>
            <Button asChild>
              <a href="/login">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = progress ? [
    {
      id: 'sendgrid',
      title: 'Email Service (SendGrid)',
      description: 'Required for sending signer emails and notifications',
      completed: progress.integrations.sendgrid.connected,
      required: true,
      icon: Mail,
    },
    {
      id: 'twilio',
      title: 'SMS Service (Twilio)',
      description: 'Optional: Enable SMS notifications and 2FA',
      completed: progress.integrations.twilio.connected,
      required: false,
      icon: MessageSquare,
    },
    {
      id: 'branding',
      title: 'Branding',
      description: 'Add your logo and brand colors',
      completed: progress.brandingConfigured,
      required: false,
      icon: Palette,
    },
    {
      id: 'template',
      title: 'Create Template',
      description: 'Set up your first reusable template',
      completed: progress.hasTemplates,
      required: false,
      icon: FileText,
    },
    {
      id: 'send',
      title: 'Send Document',
      description: 'Send your first document for signature',
      completed: progress.hasSentEnvelope,
      required: false,
      icon: Send,
    },
  ] : [];

  const completedCount = items.filter(i => i.completed).length;
  const allComplete = progress?.overallProgress === 100;

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card className={allComplete ? "border-green-200 dark:border-green-800" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                allComplete
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {allComplete ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <Sparkles className="h-6 w-6 text-blue-600" />
                )}
              </div>
              <div>
                <CardTitle>
                  {allComplete ? 'Setup Complete!' : 'Complete Your Setup'}
                </CardTitle>
                <CardDescription>
                  {allComplete
                    ? 'You\'ve completed all setup steps. You\'re ready to use PearSign!'
                    : 'Follow these steps to get the most out of PearSign'
                  }
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={allComplete ? "default" : "secondary"} className={allComplete ? "bg-green-100 text-green-700" : ""}>
                {completedCount}/{items.length} Complete
              </Badge>
              <p className="text-2xl font-bold mt-1">{progress?.overallProgress || 0}%</p>
            </div>
          </div>
          <Progress value={progress?.overallProgress || 0} className="h-2 mt-4" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              onClick={handleReopenWalkthrough}
              disabled={actionLoading}
              className="gap-2"
              variant={allComplete ? "outline" : "default"}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {allComplete ? 'Review Setup Guide' : 'Open Setup Guide'}
            </Button>
            <Button variant="ghost" onClick={loadData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Checklist Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Setup Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                item.completed
                  ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                  : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  item.completed
                    ? 'bg-green-100 dark:bg-green-900/50'
                    : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <item.icon className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${
                      item.completed ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'
                    }`}>
                      {item.title}
                    </span>
                    {item.required && !item.completed && (
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">
                        Required
                      </Badge>
                    )}
                    {item.completed && (
                      <Badge className="bg-green-100 text-green-700 text-xs">
                        Done
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Demo Data Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Demo Data</CardTitle>
          <CardDescription>
            Use sample templates and documents to explore PearSign
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status?.hasDemoData ? (
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-300">Demo data is active</p>
                  <p className="text-sm text-green-600 dark:text-green-400">Sample templates are available for you to explore</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveDemo}
                disabled={actionLoading}
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center gap-3">
                <Circle className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300">No demo data</p>
                  <p className="text-sm text-gray-500">Add sample templates to learn the platform</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateDemo}
                disabled={actionLoading}
                className="gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Add Demo Data
              </Button>
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Demo data is clearly labeled and won't affect your real documents. Remove it anytime with one click.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Help Card */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Need Help?</h3>
              <p className="text-sm text-muted-foreground">Check our documentation or contact support</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="https://docs.pearsign.com" target="_blank" rel="noopener noreferrer" className="gap-2">
                  Documentation
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="mailto:info@pearsign.com" className="gap-2">
                  Contact Support
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupGuideSettings;
