"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
  PenTool,
  Calendar,
  Type,
  FileText,
  AlertCircle,
} from "lucide-react";
import { usePinchZoom, pinchZoomStyles } from "@/hooks/use-pinch-zoom";

interface SignatureField {
  id: string;
  type: "signature" | "date" | "text" | "initials";
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  label: string;
  required: boolean;
  value?: string;
}

interface PDFSigningViewerProps {
  pdfUrl?: string;
  pdfBase64?: string;
  fields: SignatureField[];
  onFieldClick?: (field: SignatureField) => void;
  onFieldValueChange?: (fieldId: string, value: string) => void;
  signatureData?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
  readOnly?: boolean;
}

export function PDFSigningViewer({
  pdfUrl,
  pdfBase64,
  fields = [],
  onFieldClick,
  signatureData,
  currentPage: controlledPage,
  onPageChange,
  className = "",
  readOnly = false,
}: PDFSigningViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<unknown>(null);
  const [currentPage, setCurrentPage] = useState(controlledPage || 1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const renderTaskRef = useRef<unknown>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (controlledPage !== undefined && controlledPage !== currentPage) {
      setCurrentPage(controlledPage);
    }
  }, [controlledPage, currentPage]);

  useEffect(() => {
    const loadPDF = async () => {
      if (!pdfUrl && !pdfBase64) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        let pdfSource: string | { data: Uint8Array };

        if (pdfBase64) {
          const binaryString = atob(pdfBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfSource = { data: bytes };
        } else if (pdfUrl) {
          pdfSource = pdfUrl;
        } else {
          setLoading(false);
          return;
        }

        const loadingTask = pdfjs.getDocument(pdfSource);
        const pdf = await loadingTask.promise;

        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF document");
        setLoading(false);
      }
    };

    loadPDF();
  }, [pdfUrl, pdfBase64]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      if (renderTaskRef.current) {
        try {
          (renderTaskRef.current as { cancel: () => void }).cancel();
        } catch (e) {
          // Ignore cancel errors
        }
      }

      const pdf = pdfDoc as {
        getPage: (num: number) => Promise<{
          getViewport: (options: { scale: number }) => { width: number; height: number };
          render: (options: {
            canvasContext: CanvasRenderingContext2D;
            viewport: { width: number; height: number };
          }) => { promise: Promise<void>; cancel: () => void };
        }>;
      };
      const page = await pdf.getPage(currentPage);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const container = containerRef.current;
      let containerWidth = container?.clientWidth || 600;

      if (isMobile) {
        containerWidth = window.innerWidth - 32;
      }

      const viewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / viewport.width;
      const finalScale = baseScale * scale;

      // Get device pixel ratio for high-DPI displays
      const dpr = window.devicePixelRatio || 1;

      // Use higher render scale for crisp rendering at any zoom level
      // Minimum 2x for good quality on all displays
      const renderMultiplier = Math.max(2, dpr);
      const renderScale = finalScale * renderMultiplier;

      const displayViewport = page.getViewport({ scale: finalScale });
      const renderViewport = page.getViewport({ scale: renderScale });

      // Set canvas to high-resolution size
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;

      // Scale back down with CSS for display
      canvas.style.width = `${displayViewport.width}px`;
      canvas.style.height = `${displayViewport.height}px`;

      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderContext = {
        canvasContext: ctx,
        viewport: renderViewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await (renderTaskRef.current as { promise: Promise<void> }).promise;
    } catch (err) {
      if ((err as Error).name !== "RenderingCancelledException") {
        console.error("Error rendering page:", err);
      }
    }
  }, [pdfDoc, currentPage, scale, isMobile]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage();
    }
  }, [pdfDoc, renderPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      onPageChange?.(newPage);
    }
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)));
  };

  // Pinch-to-zoom for mobile devices
  const { touchHandlers } = usePinchZoom({
    minScale: 0.5,
    maxScale: 3,
    currentScale: scale,
    onZoomChange: setScale,
  });

  const getFieldIcon = (type: string) => {
    switch (type) {
      case "signature":
        return <PenTool className="h-4 w-4" />;
      case "date":
        return <Calendar className="h-4 w-4" />;
      case "initials":
        return <Type className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getFieldColors = (type: string, filled: boolean) => {
    if (filled) {
      return "border-emerald-400 bg-emerald-50/90 dark:bg-emerald-900/30 shadow-sm";
    }
    switch (type) {
      case "signature":
      case "initials":
        return "border-amber-400 bg-amber-50/90 dark:bg-amber-900/20 hover:bg-amber-100/90 dark:hover:bg-amber-900/30 shadow-sm shadow-amber-200/50";
      case "date":
        return "border-sky-400 bg-sky-50/90 dark:bg-sky-900/20 hover:bg-sky-100/90 dark:hover:bg-sky-900/30 shadow-sm shadow-sky-200/50";
      default:
        return "border-violet-400 bg-violet-50/90 dark:bg-violet-900/20 hover:bg-violet-100/90 dark:hover:bg-violet-900/30 shadow-sm shadow-violet-200/50";
    }
  };

  const getFieldTextColor = (type: string) => {
    switch (type) {
      case "signature":
      case "initials":
        return "text-amber-700 dark:text-amber-400";
      case "date":
        return "text-sky-700 dark:text-sky-400";
      default:
        return "text-violet-700 dark:text-violet-400";
    }
  };

  const getFieldActionLabel = (type: string) => {
    switch (type) {
      case "signature":
        return "Click to sign";
      case "initials":
        return "Click to initial";
      case "date":
        return "Click to add date";
      default:
        return `Enter ${type}`;
    }
  };

  const currentPageFields = fields.filter((f) => f.page === currentPage);

  // Demo document when no PDF is provided
  if (!pdfUrl && !pdfBase64 && !loading) {
    return (
      <div className={`relative bg-white dark:bg-slate-800 rounded-xl overflow-hidden ${className}`}>
        <div className="p-6 md:p-10 min-h-[400px] md:min-h-[600px]">
          <div className="max-w-lg mx-auto space-y-6">
            <div className="text-center border-b pb-6">
              <div className="flex items-center justify-center gap-2 text-primary mb-3">
                <FileText className="h-6 w-6" />
                <span className="font-semibold text-lg">DOCUMENT</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-200">
                Service Agreement
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Agreement Date: {new Date().toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/5" />
              <div className="h-6" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            </div>

            <div className="pt-8 mt-8 border-t space-y-6">
              {fields.map((field) => (
                <div key={field.id} className="relative">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => !readOnly && onFieldClick?.(field)}
                    disabled={readOnly}
                    data-testid={`field-${field.type}-${field.id}`}
                    className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                      field.value || signatureData
                        ? "border-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/20 shadow-sm"
                        : `border-dashed ${getFieldColors(field.type, false)}`
                    } ${readOnly ? "cursor-default" : "cursor-pointer group"}`}
                  >
                    {(field.value || (field.type === "signature" && signatureData)) ? (
                      <div className="text-center relative">
                        {field.type === "signature" ? (
                          signatureData?.startsWith("data:image") ? (
                            <img
                              src={signatureData}
                              alt="Signature"
                              className="max-h-16 mx-auto"
                            />
                          ) : (
                            <p
                              className="text-2xl text-primary"
                              style={{ fontFamily: "'Brush Script MT', cursive" }}
                            >
                              {signatureData}
                            </p>
                          )
                        ) : (
                          <p className="font-medium">{field.value}</p>
                        )}
                      </div>
                    ) : (
                      <div className={`flex items-center justify-center gap-2.5 ${getFieldTextColor(field.type)}`}>
                        {getFieldIcon(field.type)}
                        <span className="text-sm font-semibold">
                          {getFieldActionLabel(field.type)}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 md:p-3 bg-slate-100 dark:bg-slate-800 border-b gap-2">
        <div className="flex items-center gap-1 md:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs md:text-sm font-medium min-w-[60px] text-center">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleZoom(-0.25)}
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[40px] text-center hidden md:inline">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleZoom(0.25)}
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScale(1)}
            className="h-8 w-8 hidden md:flex"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas Container with Pinch-to-Zoom */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900 p-2 md:p-4"
        {...touchHandlers}
        style={isMobile ? pinchZoomStyles : undefined}
      >
        <div className="relative inline-block mx-auto" style={{ minWidth: "100%" }}>
          <canvas
            ref={canvasRef}
            className="mx-auto shadow-xl rounded-sm bg-white"
            style={{ touchAction: "none" }}
          />

          {/* Signature Field Overlays */}
          {currentPageFields.map((field) => {
            const isFilled = !!(field.value || (field.type === "signature" && signatureData));
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => !readOnly && onFieldClick?.(field)}
                disabled={readOnly}
                data-testid={`pdf-field-${field.type}-${field.id}`}
                className={`absolute transition-all duration-200 rounded-md border-2 overflow-hidden box-border ${
                  isFilled
                    ? "border-emerald-400 bg-emerald-50/90 dark:bg-emerald-900/40 shadow-sm"
                    : `border-dashed ${getFieldColors(field.type, false)}`
                } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              >
                {isFilled ? (
                  <div className="w-full h-full flex items-center justify-center p-1 relative">
                    {field.type === "signature" && signatureData?.startsWith("data:image") ? (
                      <img src={signatureData} alt="Signature" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span
                        className="text-xs md:text-sm text-slate-800 dark:text-slate-200 font-medium truncate"
                        style={field.type === "signature" ? { fontFamily: "'Brush Script MT', cursive" } : undefined}
                      >
                        {field.type === "signature" ? signatureData : field.value}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center gap-0.5 p-1 ${getFieldTextColor(field.type)}`}>
                    {getFieldIcon(field.type)}
                    <span className="text-[8px] md:text-xs font-semibold mt-0.5 truncate max-w-full">
                      {field.label}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Page Indicator */}
      {isMobile && totalPages > 1 && (
        <div className="flex justify-center gap-1 py-2 bg-slate-100 dark:bg-slate-800 border-t">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePageChange(i + 1)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentPage === i + 1
                  ? "bg-primary w-4"
                  : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
