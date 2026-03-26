"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PDFSigningViewer } from "@/components/signing/pdf-signing-viewer";
import { generateSignedPDF, downloadPDF, pdfToBase64 } from "@/lib/pdf-generator";
import {
  getSavedSignatures,
  saveSignature,
  deleteSignature,
  formatRelativeTime,
  type SavedSignature,
} from "@/lib/signature-storage";
import {
  Loader2,
  FileText,
  AlertCircle,
  PenTool,
  CheckCircle2,
  Download,
  Calendar,
  Type,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Shield,
  Lock,
  FileCheck,
  Clock,
  Sparkles,
  Check,
  X,
  Eye,
  History,
  Trash2,
  Plus,
  Upload,
  Maximize2,
} from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";

interface TemplateField {
  id: string;
  name: string;
  type: "text" | "email" | "date" | "signature" | "company" | "address" | "phone" | "number";
  required: boolean;
  placeholder?: string;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
}

interface SigningData {
  submission: {
    id: string;
    envelopeId: string | null;
    signerName: string;
    signerEmail: string | null;
    status: string;
    fieldValues: Record<string, string>;
  };
  form: {
    id: string;
    name: string;
    description: string | null;
    templateName: string;
    templateFields: TemplateField[];
    pdfUrl?: string;
    senderEmail?: string;
    senderName?: string;
  };
}

type SigningStep = "fields" | "signature" | "review" | "complete";

export default function FusionFormSigningPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const token = params.token as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingData, setSigningData] = useState<SigningData | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [signatureData, setSignatureData] = useState<string>("");
  const [signatureTab, setSignatureTab] = useState<"type" | "draw" | "upload">("type");
  const [typedSignature, setTypedSignature] = useState("");
  const [currentStep, setCurrentStep] = useState<SigningStep>("fields");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedData, setCompletedData] = useState<{
    signedAt: string;
    certificateUrl: string | null;
    documentUrl: string | null;
    redirectUrl: string | null;
  } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [showSavedSignatures, setShowSavedSignatures] = useState(false);
  const [generatedPdfBytes, setGeneratedPdfBytes] = useState<Uint8Array | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Load saved signatures on mount
  useEffect(() => {
    const signatures = getSavedSignatures();
    setSavedSignatures(signatures);
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    loadSigningData();
  }, [token]);

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up canvas for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Configure drawing style
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#2563eb"; // Blue color

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    let lastX = 0;
    let lastY = 0;

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      setIsDrawing(true);
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
    };

    const stopDrawing = () => {
      if (isDrawing) {
        setIsDrawing(false);
        // Save canvas as data URL
        setSignatureData(canvas.toDataURL());
      }
    };

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseleave", stopDrawing);
    canvas.addEventListener("touchstart", startDrawing);
    canvas.addEventListener("touchmove", draw);
    canvas.addEventListener("touchend", stopDrawing);

    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mouseleave", stopDrawing);
      canvas.removeEventListener("touchstart", startDrawing);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDrawing);
    };
  }, [isDrawing, signatureTab]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  };

  const handleSignaturePadSave = (signatureDataUrl: string, signatureType: "draw" | "type" | "upload") => {
    setSignatureData(signatureDataUrl);
    if (signatureType === "type") {
      setSignatureTab("type");
    } else if (signatureType === "upload") {
      setSignatureTab("upload");
    } else {
      setSignatureTab("draw");
    }
    setShowSignaturePad(false);
  };

  const loadSigningData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/public/fusion-forms/sign/${token}`);

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.completed) {
          setCompleted(true);
          return;
        }
        throw new Error(errorData.error || "Failed to load signing session");
      }

      const data = await response.json();
      setSigningData(data);

      // Initialize field values with auto-fill for date fields
      const initialFieldValues: Record<string, string> = data.submission.fieldValues ? { ...data.submission.fieldValues } : {};
      const templateFields = data.form.templateFields || [];

      // Auto-fill date fields with today's date if empty
      for (const field of templateFields) {
        if (field.type === "date" && !initialFieldValues[field.id]) {
          initialFieldValues[field.id] = new Date().toISOString().split("T")[0];
        }
      }

      setFieldValues(initialFieldValues);

      if (data.submission.signerName) {
        setTypedSignature(data.submission.signerName);
      }
    } catch (err: unknown) {
      console.error("Error loading signing data:", err);
      setError(err instanceof Error ? err.message : "Failed to load signing session");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSaveProgress = useCallback(async () => {
    try {
      await fetch(`/api/public/fusion-forms/sign/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldValues }),
      });
    } catch (error) {
      console.error("Error saving progress:", error);
    }
  }, [token, fieldValues]);

  const handleComplete = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const finalSignature = signatureTab === "type" ? typedSignature : signatureData;

      if (!finalSignature) {
        setError("Please provide your signature");
        return;
      }

      // Save signature for future reuse
      saveSignature({
        type: signatureTab === "type" ? "typed" : "drawn",
        data: finalSignature,
        name: signingData?.submission.signerName || "My Signature",
      });

      // Refresh saved signatures list
      setSavedSignatures(getSavedSignatures());

      const response = await fetch(`/api/public/fusion-forms/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldValues,
          signatureData: finalSignature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to complete signing");
      }

      const data = await response.json();
      const signedAt = new Date(data.submission.signedAt || new Date());

      // Generate signed PDF
      setIsGeneratingPdf(true);
      try {
        const pdfFields = fields.map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          value: fieldValues[field.id],
          position: field.position,
        }));

        const pdfBytes = await generateSignedPDF({
          fields: pdfFields,
          signatureData: finalSignature,
          signerName: signingData?.submission.signerName || "",
          signerEmail: signingData?.submission.signerEmail || undefined,
          signedAt,
        });

        setGeneratedPdfBytes(pdfBytes);

        // Send email notifications with the signed PDF
        try {
          const pdfBase64 = pdfToBase64(pdfBytes);
          const fieldsSummary = fields
            .filter((f) => f.type !== "signature" && fieldValues[f.id])
            .map((f) => ({ name: f.name, value: fieldValues[f.id] }));

          await fetch(`/api/public/fusion-forms/sign/${token}/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentName: signingData?.form.name || "Document",
              signerName: signingData?.submission.signerName || "",
              signerEmail: signingData?.submission.signerEmail || "",
              senderName: signingData?.form.senderName || "PearSign User",
              senderEmail: signingData?.form.senderEmail || "",
              signedAt: signedAt.toISOString(),
              pdfBase64,
              fieldsSummary,
            }),
          });
        } catch (emailErr) {
          console.error("Error sending email notifications:", emailErr);
          // Continue even if email fails
        }
      } catch (pdfErr) {
        console.error("Error generating PDF:", pdfErr);
        // Continue even if PDF generation fails
      } finally {
        setIsGeneratingPdf(false);
      }

      setCompleted(true);
      setCurrentStep("complete");
      setCompletedData({
        signedAt: data.submission.signedAt,
        certificateUrl: data.submission.certificateUrl,
        documentUrl: data.submission.documentUrl,
        redirectUrl: data.redirectUrl,
      });
    } catch (err: unknown) {
      console.error("Error completing signing:", err);
      setError(err instanceof Error ? err.message : "Failed to complete signing");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle applying a saved signature
  const handleApplySavedSignature = (signature: SavedSignature) => {
    if (signature.type === "typed") {
      setSignatureTab("type");
      setTypedSignature(signature.data);
    } else {
      setSignatureTab("draw");
      setSignatureData(signature.data);
    }
    setShowSavedSignatures(false);
  };

  // Handle deleting a saved signature
  const handleDeleteSavedSignature = (signatureId: string) => {
    deleteSignature(signatureId);
    setSavedSignatures(getSavedSignatures());
  };

  // Handle downloading the signed PDF
  const handleDownloadPdf = () => {
    if (generatedPdfBytes) {
      const fileName = `${signingData?.form.name || "document"}_signed_${new Date().toISOString().split("T")[0]}.pdf`;
      downloadPDF(generatedPdfBytes, fileName);
    }
  };

  const fields = signingData?.form.templateFields || [];
  const requiredFields = fields.filter((f) => f.required);
  const filledRequiredFields = requiredFields.filter((f) => fieldValues[f.id]?.trim());
  const progress = requiredFields.length > 0
    ? Math.round((filledRequiredFields.length / requiredFields.length) * 100)
    : 0;

  const canProceedToSignature = filledRequiredFields.length === requiredFields.length;
  const canComplete = canProceedToSignature && (typedSignature || signatureData);

  // Convert template fields to PDF signature fields format
  const pdfSignatureFields = fields.map((field, index) => ({
    id: field.id,
    type: field.type === "signature" ? "signature" as const : "text" as const,
    x: field.position?.x || 10,
    y: field.position?.y || 70 + index * 10,
    width: field.position?.width || 40,
    height: field.position?.height || 8,
    page: field.position?.page || 1,
    label: field.name,
    required: field.required,
    value: field.type === "signature" ? undefined : fieldValues[field.id],
  }));

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-slate-50 dark:from-slate-900 dark:via-cyan-950/20 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/30">
              <Loader2 className="h-10 w-10 text-white animate-spin" />
            </div>
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 to-cyan-500/20 rounded-3xl blur-2xl -z-10" />
          </div>
          <p className="text-lg font-medium text-foreground">Preparing your document...</p>
          <p className="text-sm text-muted-foreground mt-1">This will only take a moment</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !signingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50/30 to-slate-50 dark:from-slate-900 dark:via-red-950/20 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center shadow-2xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-950/30 rounded-2xl flex items-center justify-center mb-6 ring-8 ring-red-100/50 dark:ring-red-900/20">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Session Expired</h2>
          <p className="text-muted-foreground mb-8">{error}</p>
          <Button
            className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/30"
            onClick={() => router.push(`/f/${code}`)}
          >
            Start New Session
          </Button>
        </Card>
      </div>
    );
  }

  // Completed State
  if (completed || currentStep === "complete") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-50 dark:from-slate-900 dark:via-emerald-950/20 dark:to-slate-900">
        {/* Header */}
        <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b shadow-sm sticky top-0 z-50">
          <div className="container max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/30">
                P
              </div>
              <span className="font-semibold text-lg">PearSign</span>
            </div>
          </div>
        </header>

        <main className="container max-w-2xl mx-auto px-4 py-12">
          <Card className="p-8 lg:p-12 shadow-2xl border-0 text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <div className="relative">
              <div className="w-28 h-28 mx-auto bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-emerald-500/40 ring-8 ring-emerald-100 dark:ring-emerald-900/30">
                <CheckCircle2 className="h-14 w-14 text-white" />
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-green-600/20 rounded-full blur-3xl -z-10" />
            </div>

            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold mb-6">
              <Sparkles className="h-4 w-4" />
              Successfully Signed
            </div>

            <h1 className="text-3xl lg:text-4xl font-bold mb-4">Document Signed!</h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              Thank you, <span className="font-semibold text-foreground">{signingData?.submission.signerName}</span>.
              Your signature has been securely recorded.
            </p>

            {completedData?.signedAt && (
              <div className="mb-8 p-5 rounded-2xl bg-slate-100/80 dark:bg-slate-700/50 inline-flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-600 flex items-center justify-center shadow-sm">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-muted-foreground">Signed on</p>
                  <p className="font-semibold text-lg">
                    {new Date(completedData.signedAt).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {(generatedPdfBytes || completedData?.documentUrl) && (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/30 h-12"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                >
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Download Signed Document
                    </>
                  )}
                </Button>
              )}
              {completedData?.certificateUrl && (
                <Button variant="outline" size="lg" className="h-12 border-2">
                  <Shield className="h-5 w-5 mr-2" />
                  View Certificate
                </Button>
              )}
            </div>

            <div className="mt-10 pt-8 border-t">
              <p className="text-sm text-muted-foreground mb-4">
                A copy has been sent to your email address
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  if (completedData?.redirectUrl) {
                    window.location.href = completedData.redirectUrl;
                  } else {
                    window.close();
                  }
                }}
              >
                Close this window
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // Main Signing Flow
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/20 to-slate-50 dark:from-slate-900 dark:via-cyan-950/10 dark:to-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b shadow-sm sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/30">
                P
              </div>
              <div className="hidden sm:block">
                <h1 className="font-semibold">{signingData?.form.name}</h1>
                <p className="text-sm text-muted-foreground">
                  Signing as {signingData?.submission.signerName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {isMobile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMobilePreview(true)}
                  className="h-8 px-2 sm:px-3"
                >
                  <Eye className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Preview</span>
                </Button>
              )}
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-full">
                <Lock className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">Secure</span>
              </div>
              <Badge variant="secondary" className="font-normal bg-slate-100 dark:bg-slate-700 hidden sm:flex">
                <FileText className="h-3 w-3 mr-1" />
                {signingData?.form.templateName}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Section */}
      <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-b">
        <div className="container max-w-6xl mx-auto px-4 py-5">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 sm:gap-6 mb-5">
            {[
              { id: "fields", label: "Fill Details", icon: FileCheck, num: 1 },
              { id: "signature", label: "Sign", icon: PenTool, num: 2 },
              { id: "review", label: "Confirm", icon: CheckCircle2, num: 3 },
            ].map((step, index) => {
              const isActive = currentStep === step.id;
              const isPast =
                (currentStep === "signature" && step.id === "fields") ||
                (currentStep === "review" && (step.id === "fields" || step.id === "signature"));
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex items-center gap-2 sm:gap-6">
                  <button
                    onClick={() => {
                      if (isPast || (step.id === "signature" && canProceedToSignature) || (step.id === "review" && canComplete)) {
                        setCurrentStep(step.id as SigningStep);
                      }
                    }}
                    disabled={!isPast && !isActive && !(step.id === "signature" && canProceedToSignature) && !(step.id === "review" && canComplete)}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-full transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-r from-primary to-cyan-500 text-white shadow-lg shadow-primary/30 scale-105"
                        : isPast
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-slate-100 dark:bg-slate-700/50 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {isPast ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                        isActive ? "bg-white/25" : "bg-slate-200 dark:bg-slate-600"
                      }`}>
                        {step.num}
                      </span>
                    )}
                    <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
                  </button>
                  {index < 2 && (
                    <div className={`w-6 sm:w-16 h-1 rounded-full transition-colors ${isPast ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-600"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-4 max-w-md mx-auto">
            <div className="flex-1">
              <Progress value={progress} className="h-2.5" />
            </div>
            <span className="text-sm font-semibold text-primary min-w-[60px]">
              {progress}% done
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-6 lg:py-8">
        <div className="grid lg:grid-cols-5 gap-6 lg:gap-10">
          {/* Document Preview (3 columns) */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <Card className="h-full min-h-[500px] overflow-hidden border-0 shadow-xl">
              <PDFSigningViewer
                pdfUrl={signingData?.form.pdfUrl}
                fields={pdfSignatureFields}
                signatureData={signatureTab === "type" ? typedSignature : signatureData}
                onFieldClick={(field: { type: string }) => {
                  if (field.type === "signature") {
                    setCurrentStep("signature");
                  }
                }}
                readOnly={currentStep === "review"}
                className="h-[600px]"
              />
            </Card>
          </div>

          {/* Form Panel (2 columns) */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="lg:sticky lg:top-[200px]">
              {/* Fields Step */}
              {currentStep === "fields" && (
                <Card className="p-6 shadow-2xl border-0 bg-white dark:bg-slate-800">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center ring-4 ring-primary/5">
                      <FileCheck className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg">Complete Your Details</h2>
                      <p className="text-sm text-muted-foreground">
                        {filledRequiredFields.length} of {requiredFields.length} required fields
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5 max-h-[380px] overflow-y-auto pr-2">
                    {fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.id} className="text-sm font-medium flex items-center gap-2">
                          {field.name}
                          {field.required && (
                            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">Required</span>
                          )}
                          {fieldValues[field.id]?.trim() && (
                            <Check className="h-4 w-4 text-emerald-500" />
                          )}
                        </Label>
                        {field.type === "date" ? (
                          <Input
                            id={field.id}
                            type="date"
                            value={fieldValues[field.id] || ""}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            className="h-12"
                          />
                        ) : field.type === "email" ? (
                          <Input
                            id={field.id}
                            type="email"
                            value={fieldValues[field.id] || ""}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            placeholder={field.placeholder || "email@example.com"}
                            className="h-12"
                          />
                        ) : field.type === "signature" ? (
                          <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-cyan-500/5 border border-primary/20 text-sm text-primary flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <PenTool className="h-4 w-4" />
                            </div>
                            <span className="font-medium">You'll add your signature in the next step</span>
                          </div>
                        ) : (
                          <Input
                            id={field.id}
                            type={field.type === "phone" ? "tel" : "text"}
                            value={fieldValues[field.id] || ""}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            placeholder={field.placeholder}
                            className="h-12"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-5 border-t">
                    <Button
                      className="w-full h-14 text-base font-bold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/30 rounded-xl"
                      disabled={!canProceedToSignature}
                      onClick={() => {
                        handleSaveProgress();
                        setCurrentStep("signature");
                      }}
                    >
                      Continue to Signature
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                  </div>
                </Card>
              )}

              {/* Signature Step */}
              {currentStep === "signature" && (
                <Card className="p-6 shadow-2xl border-0 bg-white dark:bg-slate-800">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center ring-4 ring-primary/5">
                        <PenTool className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold text-lg">Add Your Signature</h2>
                        <p className="text-sm text-muted-foreground">Create your electronic signature</p>
                      </div>
                    </div>
                    {savedSignatures.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSavedSignatures(!showSavedSignatures)}
                        className="border-2"
                      >
                        <History className="h-4 w-4 mr-1" />
                        Saved ({savedSignatures.length})
                      </Button>
                    )}
                  </div>

                  {/* Saved Signatures Panel */}
                  {showSavedSignatures && savedSignatures.length > 0 && (
                    <div className="mb-5 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-muted-foreground">Previously Used Signatures</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowSavedSignatures(false)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {savedSignatures.map((sig) => (
                          <div
                            key={sig.id}
                            className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border hover:border-primary/50 transition-colors group"
                          >
                            <button
                              type="button"
                              onClick={() => handleApplySavedSignature(sig)}
                              className="flex-1 flex items-center gap-3 text-left"
                            >
                              <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                                {sig.type === "typed" ? (
                                  <Type className="h-4 w-4 text-primary" />
                                ) : (
                                  <PenTool className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {sig.type === "typed" ? (
                                  <p
                                    className="text-lg text-primary truncate"
                                    style={{ fontFamily: "'Brush Script MT', cursive" }}
                                  >
                                    {sig.data}
                                  </p>
                                ) : (
                                  <div className="h-8 flex items-center">
                                    <img src={sig.data} alt="Saved signature" className="max-h-full max-w-[120px] object-contain" />
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Used {formatRelativeTime(sig.lastUsedAt)}
                                </p>
                              </div>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteSavedSignature(sig.id)}
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowSavedSignatures(false)}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Signature
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Quick signature options or show uploaded/drawn signature */}
                  {signatureData && signatureData.startsWith("data:image") ? (
                    <div className="space-y-4">
                      <div className="p-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/50 dark:to-slate-800 rounded-xl border-2 border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Signature</p>
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            <Check className="h-3 w-3 mr-1" />
                            Applied
                          </Badge>
                        </div>
                        <div className="flex items-center justify-center py-4 min-h-[80px]">
                          <img src={signatureData} alt="Your signature" className="max-h-20 max-w-full object-contain" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 border-2"
                          onClick={() => {
                            setSignatureData("");
                            setTypedSignature("");
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Clear Signature
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-2"
                          onClick={() => setShowSignaturePad(true)}
                        >
                          <PenTool className="h-4 w-4 mr-2" />
                          Change Signature
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Tabs value={signatureTab} onValueChange={(v) => setSignatureTab(v as "type" | "draw" | "upload")}>
                        <TabsList className="w-full mb-5 h-12 p-1 bg-slate-100 dark:bg-slate-700/50">
                          <TabsTrigger value="type" className="flex-1 h-10 font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <Type className="h-4 w-4 mr-2" />
                            Type
                          </TabsTrigger>
                          <TabsTrigger value="draw" className="flex-1 h-10 font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <PenTool className="h-4 w-4 mr-2" />
                            Draw
                          </TabsTrigger>
                          <TabsTrigger value="upload" className="flex-1 h-10 font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="type" className="space-y-5">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Type your full legal name</Label>
                            <Input
                              value={typedSignature}
                              onChange={(e) => setTypedSignature(e.target.value)}
                              placeholder="Your full name as signature"
                              className="h-12 text-base"
                            />
                          </div>
                          <div className="p-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/50 dark:to-slate-800 rounded-xl border-2 border-dashed border-primary/20">
                            <p className="text-xs text-muted-foreground mb-3 text-center font-medium uppercase tracking-wide">Signature Preview</p>
                            <p
                              className="text-4xl text-center py-4 text-primary dark:text-cyan-400 min-h-[60px] font-signature-elegant"
                            >
                              {typedSignature || "Your Signature"}
                            </p>
                          </div>
                        </TabsContent>

                        <TabsContent value="draw" className="space-y-4">
                          <div className="border-2 border-dashed border-primary/20 rounded-xl bg-white dark:bg-slate-700/30 overflow-hidden">
                            <canvas
                              ref={canvasRef}
                              className="w-full h-[150px] cursor-crosshair touch-none"
                              style={{ touchAction: 'none' }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Button variant="outline" size="sm" onClick={clearCanvas} className="border-2">
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Clear
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowSignaturePad(true)}
                              className="text-primary"
                            >
                              <Maximize2 className="h-4 w-4 mr-2" />
                              Full Signature Pad
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="upload" className="space-y-4">
                          <div
                            className="border-2 border-dashed border-primary/20 rounded-xl bg-white dark:bg-slate-700/30 p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            onClick={() => setShowSignaturePad(true)}
                          >
                            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                            <p className="font-medium mb-1">Upload your signature</p>
                            <p className="text-sm text-muted-foreground">
                              Click to open the signature pad and upload an image
                            </p>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {/* Open Full Signature Pad Button */}
                      <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white">
                              <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Want more options?</p>
                              <p className="text-xs text-muted-foreground">
                                Choose from multiple fonts, colors, and drawing tools
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => setShowSignaturePad(true)}
                            className="bg-gradient-to-r from-primary to-cyan-500"
                          >
                            <PenTool className="h-4 w-4 mr-2" />
                            Open Signature Pad
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-6 pt-5 border-t flex gap-3">
                    <Button variant="outline" className="h-12 border-2 px-6" onClick={() => setCurrentStep("fields")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1 h-12 font-bold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/30 rounded-xl"
                      disabled={!typedSignature && !signatureData}
                      onClick={() => setCurrentStep("review")}
                    >
                      Review & Sign
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </Card>
              )}

              {/* Review Step */}
              {currentStep === "review" && (
                <Card className="p-6 shadow-2xl border-0 bg-white dark:bg-slate-800">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center ring-4 ring-emerald-100/50 dark:ring-emerald-900/20">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg">Review & Confirm</h2>
                      <p className="text-sm text-muted-foreground">Verify your information before signing</p>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 mb-4">
                    {fields.filter(f => f.type !== "signature").map((field) => (
                      <div key={field.id} className="flex justify-between items-center py-3 px-4 rounded-lg bg-slate-50 dark:bg-slate-700/30">
                        <span className="text-sm text-muted-foreground">{field.name}</span>
                        <span className="text-sm font-semibold">{fieldValues[field.id] || "—"}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700/50 dark:to-slate-800 rounded-xl border">
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Your Signature</p>
                    <div className="flex items-center justify-center py-2 min-h-[60px]">
                      {signatureData && signatureData.startsWith("data:image") ? (
                        <img src={signatureData} alt="Your signature" className="max-h-16 max-w-full object-contain" />
                      ) : typedSignature ? (
                        <p className="text-3xl text-primary dark:text-cyan-400 font-signature-elegant">
                          {typedSignature}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                        By clicking "Sign Document", you confirm that your electronic signature is legally binding and equivalent to your handwritten signature.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-5 border-t flex gap-3">
                    <Button variant="outline" className="h-12 border-2 px-6" onClick={() => setCurrentStep("signature")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1 h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/30 rounded-xl"
                      disabled={submitting}
                      onClick={handleComplete}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <PenTool className="h-5 w-5 mr-2" />
                          Sign Document
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-t mt-auto">
        <div className="container max-w-6xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                P
              </div>
              <span className="font-medium">PearSign</span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-full">
              <Shield className="h-4 w-4 text-emerald-500" />
              <span className="hidden sm:inline text-emerald-700 dark:text-emerald-400 font-medium text-xs">Bank-level security</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Document Preview Modal */}
      {showMobilePreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-slate-900">
            <h3 className="text-white font-semibold">Document Preview</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMobilePreview(false)}
              className="text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <PDFSigningViewer
              pdfUrl={signingData?.form.pdfUrl}
              fields={pdfSignatureFields}
              signatureData={signatureTab === "type" ? typedSignature : signatureData}
              readOnly
              className="h-full"
            />
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      <SignaturePad
        open={showSignaturePad}
        onOpenChange={setShowSignaturePad}
        onSave={handleSignaturePadSave}
        signerName={signingData?.submission.signerName || ""}
        title="Create Your Signature"
        description="Draw, type, or upload your electronic signature"
      />
    </div>
  );
}
