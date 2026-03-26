"use client";

import { useState } from "react";
import {
  FileText,
  Send,
  FolderOpen,
  Sparkles,
  ArrowRight,
  Plus,
  Upload,
  FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// ============== EMPTY DASHBOARD STATE ==============

interface EmptyDashboardStateProps {
  onSendDocument?: () => void;
  onCreateTemplate?: () => void;
  onOpenOnboarding?: () => void;
}

export function EmptyDashboardState({
  onSendDocument,
  onCreateTemplate,
  onOpenOnboarding,
}: EmptyDashboardStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6">
        <Sparkles className="w-10 h-10 text-amber-600" />
      </div>

      <h2 className="text-2xl font-bold mb-2">Welcome to PearSign!</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Your document signing workspace is ready. Let's get started by sending your first document or completing the setup.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl w-full mb-8">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onSendDocument}>
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">Send Your First Document</h3>
            <p className="text-sm text-muted-foreground">
              Upload a PDF and send it for signature
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onCreateTemplate}>
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="font-semibold mb-1">Create a Template</h3>
            <p className="text-sm text-muted-foreground">
              Build reusable document templates
            </p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={onOpenOnboarding}>
        View Setup Guide <ArrowRight className="ml-2 w-4 h-4" />
      </Button>
    </div>
  );
}

// ============== EMPTY DOCUMENTS LIST ==============

interface EmptyDocumentsStateProps {
  onSendDocument?: () => void;
}

export function EmptyDocumentsState({ onSendDocument }: EmptyDocumentsStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <FolderOpen className="w-8 h-8 text-slate-400" />
      </div>

      <h3 className="text-lg font-semibold mb-2">No Documents Yet</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        You haven't sent any documents for signature yet. Get started by sending your first document.
      </p>

      <Button onClick={onSendDocument}>
        <Plus className="mr-2 w-4 h-4" /> Send Document
      </Button>
    </div>
  );
}

// ============== EMPTY TEMPLATES LIST ==============

interface EmptyTemplatesStateProps {
  onCreateTemplate?: () => void;
}

export function EmptyTemplatesState({ onCreateTemplate }: EmptyTemplatesStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <FileText className="w-8 h-8 text-slate-400" />
      </div>

      <h3 className="text-lg font-semibold mb-2">No Templates Yet</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Templates let you save document layouts with pre-configured signature fields for reuse.
      </p>

      <Button onClick={onCreateTemplate}>
        <Plus className="mr-2 w-4 h-4" /> Create Template
      </Button>
    </div>
  );
}

// ============== EMPTY SENT LIST ==============

interface EmptySentStateProps {
  onSendDocument?: () => void;
}

export function EmptySentState({ onSendDocument }: EmptySentStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Send className="w-8 h-8 text-slate-400" />
      </div>

      <h3 className="text-lg font-semibold mb-2">Nothing Sent Yet</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Documents you send for signature will appear here. Track their status and download signed copies.
      </p>

      <Button onClick={onSendDocument}>
        <Upload className="mr-2 w-4 h-4" /> Send Your First Document
      </Button>
    </div>
  );
}

// ============== DEMO MODE BANNER ==============

interface DemoModeBannerProps {
  onCreateAccount?: () => void;
  onLogin?: () => void;
}

export function DemoModeBanner({ onCreateAccount, onLogin }: DemoModeBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">
            You're in Demo Mode — Data is not saved. Create an account to start using PearSign for real.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
            onClick={onLogin}
          >
            Sign In
          </Button>
          <Button
            size="sm"
            className="bg-white text-amber-600 hover:bg-white/90"
            onClick={onCreateAccount}
          >
            Create Account
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============== NEW TENANT WELCOME CARD ==============

interface NewTenantWelcomeProps {
  tenantName?: string;
  onGetStarted?: () => void;
  onSkip?: () => void;
}

export function NewTenantWelcome({ tenantName, onGetStarted, onSkip }: NewTenantWelcomeProps) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent border-primary/15">
      <CardContent className="p-4 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <FileSignature className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          </div>

          <div className="flex-grow min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1 sm:mb-2">
              Welcome to {tenantName || 'Your Workspace'}!
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-3 sm:mb-4">
              Your electronic signature workspace is ready. Complete the quick setup to start
              sending documents for signature with full email notifications and branding.
            </p>

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={onGetStarted}>
                Complete Setup <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============== SETUP REQUIRED ALERT ==============

interface SetupRequiredAlertProps {
  missingItems: string[];
  onSetup?: () => void;
}

export function SetupRequiredAlert({ missingItems, onSetup }: SetupRequiredAlertProps) {
  if (missingItems.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-grow">
          <h4 className="font-medium text-amber-800 mb-1">Setup Required</h4>
          <p className="text-sm text-amber-700 mb-2">
            To send documents for signature, you need to configure:
          </p>
          <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
            {missingItems.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={onSetup}
          >
            Complete Setup <ArrowRight className="ml-2 w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
