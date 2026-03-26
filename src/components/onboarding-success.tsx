"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  ArrowRight,
  FileText,
  Users,
  LayoutTemplate,
  ExternalLink,
  Play,
  Mail,
} from "lucide-react";
import confetti from "canvas-confetti";

interface OnboardingSuccessProps {
  organizationName: string;
  plan: string;
  teamInvitesCount: number;
  onContinue: () => void;
}

export function OnboardingSuccess({
  organizationName,
  plan,
  teamInvitesCount,
  onContinue,
}: OnboardingSuccessProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const duration = 2 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#16a34a', '#22c55e', '#4ade80', '#86efac'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#16a34a', '#22c55e', '#4ade80', '#86efac'],
      });
    }, 250);

    setTimeout(() => setShowContent(true), 300);

    return () => clearInterval(interval);
  }, []);

  const quickStartItems = [
    {
      icon: FileText,
      title: "Send your first document",
      description: "Upload a PDF and send it for signature",
      primary: true,
    },
    {
      icon: LayoutTemplate,
      title: "Create a template",
      description: "Save time with reusable document templates",
    },
    {
      icon: Users,
      title: "Manage your team",
      description: "Add team members and set permissions",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <img src="/pearsign-logo.png" alt="PearSign" className="w-9 h-9 rounded-lg" />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">PearSign</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-6">
        <div
          className={`w-full max-w-xl transition-all duration-700 ${
            showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-10">
            <div className="relative inline-block mb-5">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              You're all set!
            </h1>

            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {organizationName} is ready to use
            </p>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                {plan} plan
              </span>
              {teamInvitesCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {teamInvitesCount} invite{teamInvitesCount > 1 ? "s" : ""} sent
                </span>
              )}
            </div>
          </div>

          <Card className="mb-6">
            <CardContent className="p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Get started
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Here's what you can do next
              </p>

              <div className="space-y-2">
                {quickStartItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={onContinue}
                      className={`w-full flex items-center gap-3.5 p-3.5 rounded-lg border text-left hover-elevate ${
                        item.primary
                          ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200/60 dark:border-blue-800/40"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                      data-testid={`button-quickstart-${index}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.primary
                          ? "bg-[hsl(var(--pearsign-primary))] text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white">{item.title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                      </div>
                      <ArrowRight className={`h-4 w-4 flex-shrink-0 ${
                        item.primary ? "text-[hsl(var(--pearsign-primary))]" : "text-gray-300 dark:text-gray-600"
                      }`} />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-2.5 mb-8">
            <a
              href="/?view=ai-generator"
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover-elevate text-xs text-gray-600 dark:text-gray-400"
              data-testid="link-tutorial"
            >
              <Play className="h-3.5 w-3.5 text-[hsl(var(--pearsign-primary))]" />
              <span>Tutorial</span>
            </a>
            <a
              href="https://docs.pearsign.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover-elevate text-xs text-gray-600 dark:text-gray-400"
              data-testid="link-docs"
            >
              <FileText className="h-3.5 w-3.5 text-[hsl(var(--pearsign-primary))]" />
              <span>Docs</span>
            </a>
            <a
              href="https://docs.pearsign.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover-elevate text-xs text-gray-600 dark:text-gray-400"
              data-testid="link-api"
            >
              <ExternalLink className="h-3.5 w-3.5 text-[hsl(var(--pearsign-primary))]" />
              <span>API</span>
            </a>
          </div>

          <div className="text-center">
            <Button onClick={onContinue} size="lg" className="px-8" data-testid="button-go-to-dashboard">
              Go to Dashboard
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
