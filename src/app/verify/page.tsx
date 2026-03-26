"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileSignature,
  Search,
  Shield,
  User,
  Calendar,
  Hash,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

interface VerificationResult {
  valid: boolean;
  documentId?: string;
  envelopeId?: string;
  signatureIds?: string[];
  signers?: Array<{
    signatureId: string;
    name: string;
    signedAt: string;
  }>;
  status?: "completed" | "in_signing" | "voided" | "declined" | "expired";
  documentTitle?: string;
  tampered?: boolean;
  createdAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Check for query params on load
  useEffect(() => {
    const docId = searchParams.get("documentId");
    const sigId = searchParams.get("signatureId");
    const id = sigId || docId;

    if (id) {
      setIdentifier(id);
      // Auto-verify if ID provided
      handleVerify(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleVerify = useCallback(async (id?: string) => {
    const searchId = id || identifier;
    if (!searchId.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      // Determine if it's a signature ID or document ID
      const isSignatureId = searchId.startsWith("PS-");
      const param = isSignatureId ? "signatureId" : "documentId";

      const response = await fetch(`/api/verify?${param}=${encodeURIComponent(searchId)}`);
      const data = await response.json();

      setResult(data);
    } catch (error) {
      console.error("Verification error:", error);
      setResult({
        valid: false,
        error: {
          code: "network_error",
          message: "Unable to connect to verification service. Please try again.",
        },
      });
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "in_signing":
        return (
          <Badge className="bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))] border-[hsl(var(--pearsign-primary))]/20">
            <Clock className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        );
      case "voided":
        return (
          <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">
            <XCircle className="h-3 w-3 mr-1" />
            Voided
          </Badge>
        );
      case "declined":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="h-3 w-3 mr-1" />
            Declined
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
            <AlertCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            Unknown
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--pearsign-primary-light))] to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to PearSign</span>
          </Link>
          <div className="flex items-center gap-2">
            <img src="/pearsign-logo.png" alt="PearSign" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-foreground">PearSign</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[hsl(var(--pearsign-primary))]/10 mb-4">
            <Shield className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Document Verification
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Verify the authenticity of any document signed with PearSign.
            No account required.
          </p>
        </div>

        {/* Search Card */}
        <Card className="mb-8 border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              Verify a Document
            </CardTitle>
            <CardDescription>
              Enter a Document ID or PearSign Signature ID (PS-XXXXXXXX)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="e.g., PS-9F82A1C7 or env-1234567890-abc123"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                className="font-mono"
              />
              <Button
                onClick={() => handleVerify()}
                disabled={loading || !identifier.trim()}
                className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600 hover:from-[hsl(var(--pearsign-primary))]/90 hover:to-blue-600/90 px-6"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              The PearSign Signature ID is displayed under each signature on signed documents.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className={`${
            result.valid
              ? "border-green-200 dark:border-green-900"
              : "border-red-200 dark:border-red-900"
          }`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {result.valid ? (
                    <>
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <span className="text-green-700 dark:text-green-400">Document Verified</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-6 w-6 text-red-600" />
                      <span className="text-red-700 dark:text-red-400">Verification Failed</span>
                    </>
                  )}
                </CardTitle>
                {result.status && getStatusBadge(result.status)}
              </div>
              {result.valid && result.documentTitle && (
                <CardDescription className="text-base mt-1">
                  {result.documentTitle}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              {result.error ? (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <p className="text-red-700 dark:text-red-400 font-medium">
                    {result.error.message}
                  </p>
                  <p className="text-red-600 dark:text-red-500 text-sm mt-1">
                    Error code: {result.error.code}
                  </p>
                </div>
              ) : (
                <>
                  {/* Document Info */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Document ID
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {result.documentId || result.envelopeId}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyToClipboard(result.documentId || result.envelopeId || "")}
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Integrity Check
                      </p>
                      <div className="flex items-center gap-2">
                        {result.tampered ? (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Document Modified
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Original - Not Modified
                          </Badge>
                        )}
                      </div>
                    </div>

                    {result.createdAt && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Created
                        </p>
                        <p className="text-sm flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatDate(result.createdAt)}
                        </p>
                      </div>
                    )}

                    {result.completedAt && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Completed
                        </p>
                        <p className="text-sm flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          {formatDate(result.completedAt)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Signers */}
                  {result.signers && result.signers.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-medium mb-3 flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          Signatures ({result.signers.length})
                        </h3>
                        <div className="space-y-3">
                          {result.signers.map((signer) => (
                            <div
                              key={signer.signatureId}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
                                  <User className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">
                                    {signer.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Signed: {formatDate(signer.signedAt)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="font-mono text-xs">
                                  <Hash className="h-3 w-3 mr-1" />
                                  {signer.signatureId}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Signature IDs */}
                  {result.signatureIds && result.signatureIds.length > 0 && !result.signers?.length && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-medium mb-2 flex items-center gap-2">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          PearSign Signature IDs
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {result.signatureIds.map((id) => (
                            <Badge key={id} variant="outline" className="font-mono">
                              {id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {result.message && (
                    <div className="bg-[hsl(var(--pearsign-primary))]/5 border border-[hsl(var(--pearsign-primary))]/20 rounded-lg p-3">
                      <p className="text-[hsl(var(--pearsign-primary))] text-sm">
                        {result.message}
                      </p>
                    </div>
                  )}

                  {/* Verification Time */}
                  {result.verifiedAt && (
                    <p className="text-xs text-muted-foreground text-center">
                      Verified at {formatDate(result.verifiedAt)}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info Section */}
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <div className="text-center p-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[hsl(var(--pearsign-primary))]/10 mb-3">
              <Shield className="h-6 w-6 text-[hsl(var(--pearsign-primary))]" />
            </div>
            <h3 className="font-medium text-foreground mb-1">
              Secure Verification
            </h3>
            <p className="text-sm text-muted-foreground">
              Every signature has a unique, immutable ID that cannot be forged.
            </p>
          </div>

          <div className="text-center p-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-500/10 mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-medium text-foreground mb-1">
              No Account Needed
            </h3>
            <p className="text-sm text-muted-foreground">
              Anyone can verify a document. No login or certificate required.
            </p>
          </div>

          <div className="text-center p-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[hsl(var(--pearsign-primary))]/10 mb-3">
              <FileSignature className="h-6 w-6 text-[hsl(var(--pearsign-primary))]" />
            </div>
            <h3 className="font-medium text-foreground mb-1">
              Legally Binding
            </h3>
            <p className="text-sm text-muted-foreground">
              PearSign signatures comply with ESIGN Act, UETA, and eIDAS.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-8">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Powered by PearSign - Electronic Signature Platform
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </a>
            <a
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </a>
            <Link
              href="/"
              className="text-sm text-[hsl(var(--pearsign-primary))] hover:text-[hsl(var(--pearsign-primary))]/80 flex items-center gap-1"
            >
              Learn More
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
