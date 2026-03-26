"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Shield,
  FileText,
  ArrowRight,
  Lock,
} from "lucide-react";

interface FormData {
  id: string;
  name: string;
  description: string | null;
  templateName: string;
  templateFields: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
  }>;
  requireName: boolean;
  requireEmail: boolean;
  customBranding: Record<string, unknown>;
}

export default function FusionFormPublicPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");

  useEffect(() => {
    loadFormData();
  }, [code]);

  const loadFormData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/public/fusion-forms/${code}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Form not found");
      }

      const data = await response.json();
      setFormData(data);
    } catch (err: unknown) {
      console.error("Error loading form:", err);
      setError(err instanceof Error ? err.message : "Failed to load form");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSigning = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(`/api/public/fusion-forms/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName,
          signerEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start signing");
      }

      const data = await response.json();
      router.push(data.redirectUrl);
    } catch (err: unknown) {
      console.error("Error starting signing:", err);
      setError(err instanceof Error ? err.message : "Failed to start signing session");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
        <header className="px-6 py-4">
          <div className="flex items-center gap-2.5 max-w-4xl mx-auto">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <span className="font-semibold text-slate-800 text-lg">PearSign</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Document Unavailable</h1>
            <p className="text-slate-500 text-sm">
              {error || "This document is no longer available or the link has expired."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const isFormValid = (!formData.requireName || signerName.trim()) && (!formData.requireEmail || signerEmail.trim());

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              P
            </div>
            <span className="font-semibold text-slate-800 text-lg">PearSign</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            <span>Secure</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-lg">
          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 overflow-hidden">
            {/* Card Header */}
            <div className="px-8 pt-8 pb-6 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <img src="/pearsign-logo.png" alt="PearSign" className="w-12 h-12 rounded-xl" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold text-slate-800 mb-1 leading-tight">
                    {formData.name}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {formData.description || "Please review and sign this document"}
                  </p>
                </div>
              </div>
            </div>

            {/* Form Section */}
            <div className="px-8 py-6">
              <p className="text-sm text-slate-600 mb-6">
                Enter your information below to access and sign the document.
              </p>

              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStartSigning();
                }}
                className="space-y-4"
              >
                {formData.requireName && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                      className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                )}

                {formData.requireEmail && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={submitting || !isFormValid}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Continue to Sign
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Card Footer */}
            <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100">
              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span>256-bit encryption</span>
                </div>
                <span className="text-slate-300">|</span>
                <span>Legally binding</span>
              </div>
            </div>
          </div>

          {/* Bottom Text */}
          <p className="text-center text-xs text-slate-400 mt-6">
            Powered by <span className="font-medium text-slate-500">PearSign</span>
          </p>
        </div>
      </main>
    </div>
  );
}
