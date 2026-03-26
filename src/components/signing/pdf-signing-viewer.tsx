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
  Move,
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
  allowFieldAdjust?: boolean;
  onFieldAdjust?: (fieldId: string, x: number, y: number, width: number, height: number) => void;
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
  allowFieldAdjust = false,
  onFieldAdjust,
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

  // Drag/resize state for field adjustment
  const [localAdjustments, setLocalAdjustments] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const dragRef = useRef<{
    fieldId: string;
    type: 'move' | 'resize';
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const currentAdjustRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

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
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

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

  // Get effective field position (local adjustments override the original)
  const getEffectiveField = useCallback((field: SignatureField) => {
    const adj = localAdjustments[field.id];
    return adj ? { ...field, ...adj } : field;
  }, [localAdjustments]);

  // Start dragging or resizing a field
  const handleFieldDragStart = useCallback((e: React.MouseEvent, field: SignatureField, type: 'move' | 'resize') => {
    if (!allowFieldAdjust || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const eff = getEffectiveField(field);
    dragRef.current = {
      fieldId: field.id,
      type,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: eff.x,
      startY: eff.y,
      startW: eff.width,
      startH: eff.height,
    };
    currentAdjustRef.current = null;
  }, [allowFieldAdjust, readOnly, getEffectiveField]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const canvasW = parseFloat(canvas.style.width) || canvas.offsetWidth || 1;
    const canvasH = parseFloat(canvas.style.height) || canvas.offsetHeight || 1;

    const dx = ((e.clientX - dragRef.current.startMouseX) / canvasW) * 100;
    const dy = ((e.clientY - dragRef.current.startMouseY) / canvasH) * 100;
    const { fieldId, type, startX, startY, startW, startH } = dragRef.current;

    let newAdj: { x: number; y: number; width: number; height: number };
    if (type === 'move') {
      newAdj = {
        x: Math.max(0, Math.min(100 - startW, startX + dx)),
        y: Math.max(0, Math.min(100 - startH, startY + dy)),
        width: startW,
        height: startH,
      };
    } else {
      newAdj = {
        x: startX,
        y: startY,
        width: Math.max(4, Math.min(100 - startX, startW + dx)),
        height: Math.max(2, Math.min(100 - startY, startH + dy)),
      };
    }

    currentAdjustRef.current = newAdj;
    setLocalAdjustments(prev => ({ ...prev, [fieldId]: newAdj }));
  }, []);

  const handleGlobalMouseUp = useCallback(() => {
    if (!dragRef.current) return;
    const fieldId = dragRef.current.fieldId;
    if (currentAdjustRef.current) {
      const { x, y, width, height } = currentAdjustRef.current;
      onFieldAdjust?.(fieldId, x, y, width, height);
    }
    dragRef.current = null;
    currentAdjustRef.current = null;
  }, [onFieldAdjust]);

  useEffect(() => {
    if (allowFieldAdjust) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [allowFieldAdjust, handleGlobalMouseMove, handleGlobalMouseUp]);

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
            const eff = getEffectiveField(field);
            const isFilled = !!(field.value || (field.type === "signature" && signatureData));
            const canAdjust = allowFieldAdjust && !readOnly && !isFilled;
            return (
              <div
                key={field.id}
                data-testid={`pdf-field-${field.type}-${field.id}`}
                className={`absolute rounded-md border-2 overflow-visible box-border ${
                  isFilled
                    ? "border-emerald-400 bg-emerald-50/90 dark:bg-emerald-900/40 shadow-sm"
                    : `border-dashed ${getFieldColors(field.type, false)}`
                } ${canAdjust ? "cursor-move select-none" : readOnly ? "cursor-default" : "cursor-pointer"}`}
                style={{
                  left: `${eff.x}%`,
                  top: `${eff.y}%`,
                  width: `${eff.width}%`,
                  height: `${eff.height}%`,
                  transition: dragRef.current?.fieldId === field.id ? 'none' : 'left 0.05s, top 0.05s, width 0.05s, height 0.05s',
                }}
                onMouseDown={canAdjust ? (e) => handleFieldDragStart(e, field, 'move') : undefined}
                onClick={!canAdjust ? () => !readOnly && onFieldClick?.(field) : undefined}
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
                  <div
                    className={`w-full h-full flex flex-col items-center justify-center gap-0.5 p-1 ${getFieldTextColor(field.type)}`}
                    onClick={canAdjust ? () => onFieldClick?.(field) : undefined}
                  >
                    {canAdjust && (
                      <Move className="h-2.5 w-2.5 opacity-50 absolute top-0.5 left-0.5" />
                    )}
                    {getFieldIcon(field.type)}
                    <span className="text-[8px] md:text-xs font-semibold mt-0.5 truncate max-w-full">
                      {field.label}
                    </span>
                  </div>
                )}

                {/* Resize handle */}
                {canAdjust && (
                  <div
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10 flex items-center justify-center"
                    style={{ transform: 'translate(30%, 30%)' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleFieldDragStart(e, field, 'resize');
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 7L7 1M4 7L7 4M7 7V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={getFieldTextColor(field.type)} />
                    </svg>
                  </div>
                )}
              </div>
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
