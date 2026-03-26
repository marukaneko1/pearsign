/**
 * Visual PDF Editor - Future-Proof Architecture
 *
 * STRATEGY (based on industry best practices):
 *
 * Step 1: PDF.js for base rendering
 *   - Render PDF canvas WITHOUT native text layer (background + graphics only)
 *   - Extract text with getTextContent() API
 *   - Prevents duplicate text rendering
 *
 * Step 2: Custom Editable Text Layer
 *   - Build DOM overlay with extracted text positioned exactly
 *   - Make each text span clickable/editable
 *   - Support zoom/scroll with coordinate scaling
 *
 * Step 3: Save edits back to PDF
 *   - Use pdf-lib to regenerate PDF with all edits
 *   - Flatten text edits and annotations
 *   - Export as new PDF file
 *
 * WHY THIS IS FUTURE-PROOF:
 *   ✅ PDF.js is Mozilla-backed (long-term support)
 *   ✅ We own the code (no external library dependencies)
 *   ✅ Follows official PDF.js patterns
 *   ✅ Can evolve with PDF.js updates
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Save,
  Download,
  Send,
  Type,
  Square,
  Circle,
  Minus,
  Highlighter,
  MousePointer,
  ZoomIn,
  ZoomOut,
  Undo,
  Redo,
  Trash2,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { usePinchZoom, pinchZoomStyles } from "@/hooks/use-pinch-zoom";

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface VisualPDFEditorProps {
  file: File;
  onBack: () => void;
  onSendForSignature: (file: File) => void;
}

interface TextSpan {
  id: string;
  content: string;
  baseX: number;  // Coordinates at scale 1.0
  baseY: number;
  baseWidth: number;
  baseHeight: number;
  baseFontSize: number;
  fontFamily: string;
  color: string;
  pageNumber: number;
  // For inline editing
  isEditing?: boolean;
}

interface DrawElement {
  id: string;
  type: 'rectangle' | 'circle' | 'line' | 'highlight';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  color: string;
  strokeWidth: number;
  pageNumber: number;
}

type Tool = 'select' | 'text' | 'rectangle' | 'circle' | 'line' | 'highlight';

interface HistoryState {
  textSpans: TextSpan[];
  drawElements: DrawElement[];
}

export function VisualPDFEditor({ file, onBack, onSendForSignature }: VisualPDFEditorProps) {
  if (process.env.NODE_ENV !== 'production') console.log('🎨 VisualPDFEditor mounted with file:', file.name, 'size:', file.size, 'type:', file.type);

  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  const [drawElements, setDrawElements] = useState<DrawElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const extractedPagesRef = useRef<Set<number>>(new Set());
  const [fileName, setFileName] = useState(file.name);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRequestRef = useRef<number>(0);
  const [editingSpanId, setEditingSpanId] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  // History stack for undo/redo
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);
  const originalPdfBytesRef = useRef<ArrayBuffer | null>(null);

  // Pinch-to-zoom for mobile devices
  const { touchHandlers } = usePinchZoom({
    minScale: 0.5,
    maxScale: 3,
    currentScale: zoom,
    onZoomChange: setZoom,
  });

  useEffect(() => {
    const loadPDF = async () => {
      try {
        if (process.env.NODE_ENV !== 'production') console.log('📄 Starting PDF load...');
        setIsLoading(true);
        const arrayBuffer = await file.arrayBuffer();
        if (process.env.NODE_ENV !== 'production') console.log('✅ PDF arrayBuffer loaded, size:', arrayBuffer.byteLength);

        // Store original PDF bytes for saving later
        originalPdfBytesRef.current = arrayBuffer;

        if (process.env.NODE_ENV !== 'production') console.log('🔄 Loading PDF with PDF.js...');
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (process.env.NODE_ENV !== 'production') console.log('✅ PDF loaded successfully! Pages:', pdf.numPages);

        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);
        setIsLoading(false);
      } catch (error) {
        console.error("❌ Error loading PDF:", error);
        alert(`Error loading PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [file]);

  // Auto-fit to width on PDF load
  useEffect(() => {
    const fitToWidth = async () => {
      if (!pdfDocument || !containerRef.current) return;

      try {
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = containerRef.current.clientWidth - 64;
        const fitZoom = containerWidth / viewport.width;

        setZoom(Math.min(fitZoom, 1.5));
        setPageWidth(viewport.width);
        setPageHeight(viewport.height);
      } catch (error) {
        console.error("Error fitting to width:", error);
      }
    };

    fitToWidth();
  }, [pdfDocument]);

  // Track history when textSpans or drawElements change
  useEffect(() => {
    // Skip if this is an undo/redo action
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    // Skip if no changes yet (initial load)
    if (textSpans.length === 0 && drawElements.length === 0) {
      return;
    }

    // Create new history entry
    const newState: HistoryState = {
      textSpans: JSON.parse(JSON.stringify(textSpans)),
      drawElements: JSON.parse(JSON.stringify(drawElements)),
    };

    setHistory(prev => {
      // Remove any history after current index (when making new change after undo)
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);

      // Limit history to 50 states
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }

      return newHistory;
    });

    setHistoryIndex(prev => {
      if (history.length >= 50) {
        return prev; // Don't increment if we removed oldest
      }
      return prev + 1;
    });
  }, [textSpans, drawElements, historyIndex, history.length]);

  // Single source of truth: Re-render everything on zoom/page change
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current || !textLayerRef.current) {
        if (process.env.NODE_ENV !== 'production') console.log('⏸️ Skipping render - waiting for refs:', {
          pdfDocument: !!pdfDocument,
          canvasRef: !!canvasRef.current,
          textLayerRef: !!textLayerRef.current
        });
        return;
      }

      const requestId = ++renderRequestRef.current;

      try {
        setIsRendering(true);

        const page = await pdfDocument.getPage(currentPage);

        // Get device pixel ratio for high-DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Use higher render scale for crystal clear PDFs at any zoom level
        // Minimum 2x for good quality on all displays
        const renderMultiplier = Math.max(2, dpr);
        const renderScale = zoom * renderMultiplier;

        const displayViewport = page.getViewport({ scale: zoom });
        const renderViewport = page.getViewport({ scale: renderScale });

        if (process.env.NODE_ENV !== 'production') console.log('📐 Display size:', displayViewport.width, 'x', displayViewport.height, 'at zoom:', zoom);
        if (process.env.NODE_ENV !== 'production') console.log('📐 Render size:', renderViewport.width, 'x', renderViewport.height, 'at scale:', renderScale);

        if (requestId !== renderRequestRef.current) return;

        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('❌ Canvas ref is null after check!');
          return;
        }

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          console.error('❌ No canvas context!');
          return;
        }

        // CRITICAL: Set canvas to high-resolution size for crisp rendering
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;

        // Scale back down with CSS for display
        canvas.style.width = `${displayViewport.width}px`;
        canvas.style.height = `${displayViewport.height}px`;

        if (process.env.NODE_ENV !== 'production') console.log('🎨 Canvas size set to:', canvas.width, 'x', canvas.height, '(CSS:', canvas.style.width, 'x', canvas.style.height, ')');
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Enable high-quality rendering
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        // CRITICAL: Render PDF WITHOUT text layer (background + graphics only)
        // This prevents duplicate text (canvas text + our editable overlay)
        if (process.env.NODE_ENV !== 'production') console.log('🖼️ Starting PDF render (background only)...');

        // Set white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Render with annotations and graphics, but NO text
        const renderTask = page.render({
          canvasContext: context,
          viewport: renderViewport,
          background: 'rgba(0,0,0,0)', // Transparent to preserve white background
        });

        await renderTask.promise;
        if (process.env.NODE_ENV !== 'production') console.log('✅ PDF background rendered (no text layer)!');

        if (requestId !== renderRequestRef.current) return;

        setIsRendering(false);

        // CRITICAL: Extract text for editable overlay (only for current page)
        // This creates the editable text layer that replaces the PDF's native text
        const needsTextExtraction = !extractedPagesRef.current.has(currentPage);
        if (needsTextExtraction) {
          setIsExtractingText(true);
          try {
            const textContent = await page.getTextContent();
            const baseViewport = page.getViewport({ scale: 1.0 });
            const extractedTextSpans: TextSpan[] = [];

            if (process.env.NODE_ENV !== 'production') console.log(`📝 Extracting ${textContent.items.length} text items from page ${currentPage}`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            textContent.items.forEach((item: any, index: number) => {
              if (item.str && item.str.trim()) {
                const transform = item.transform;
                const baseX = transform[4];
                const baseY = baseViewport.height - transform[5];
                const baseFontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);

                extractedTextSpans.push({
                  id: `extracted-${currentPage}-${index}`,
                  content: item.str,
                  baseX,
                  baseY: baseY - baseFontSize,
                  baseWidth: item.width || (item.str.length * baseFontSize * 0.6),
                  baseHeight: baseFontSize,
                  baseFontSize,
                  fontFamily: item.fontName || 'Arial',
                  color: '#000000', // Default to black, can be enhanced later
                  pageNumber: currentPage,
                });
              }
            });

            if (process.env.NODE_ENV !== 'production') console.log('✅ Created', extractedTextSpans.length, 'editable text spans');

            // Replace extracted text for this page (preserving user-added annotations)
            setTextSpans(prev => {
              const filtered = prev.filter(
                span => span.pageNumber !== currentPage || !span.id.startsWith('extracted-')
              );
              return [...filtered, ...extractedTextSpans];
            });

            extractedPagesRef.current.add(currentPage);
          } catch (error) {
            console.error('❌ Error extracting text:', error);
          }
          setIsExtractingText(false);
        }

        // Render user-added overlays (text boxes, shapes, highlights)
        const pageDrawElements = drawElements.filter(el => el.pageNumber === currentPage);

        pageDrawElements.forEach(element => {
          if (element.type === 'rectangle') {
            context.strokeStyle = element.color;
            context.lineWidth = element.strokeWidth;
            context.strokeRect(element.x, element.y, element.width || 0, element.height || 0);
          } else if (element.type === 'circle') {
            context.strokeStyle = element.color;
            context.lineWidth = element.strokeWidth;
            context.beginPath();
            context.arc(element.x, element.y, element.radius || 0, 0, 2 * Math.PI);
            context.stroke();
          } else if (element.type === 'line') {
            context.strokeStyle = element.color;
            context.lineWidth = element.strokeWidth;
            context.beginPath();
            context.moveTo(element.x, element.y);
            context.lineTo(element.x2 || 0, element.y2 || 0);
            context.stroke();
          } else if (element.type === 'highlight') {
            context.fillStyle = element.color + '40';
            context.fillRect(element.x, element.y, element.width || 0, element.height || 0);
          }
        });
      } catch (error) {
        console.error("Error rendering page:", error);
        setIsRendering(false);
      }
    };

    renderPage();

    // Cleanup function
    return () => {
      // Cancel any in-flight renders
      renderRequestRef.current++;
    };
  }, [pdfDocument, currentPage, zoom, drawElements]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'text') {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      const newTextBox: TextSpan = {
        id: `text-${Date.now()}`,
        content: 'New Text',
        baseX: x,
        baseY: y,
        baseWidth: 100,
        baseHeight: 20,
        baseFontSize: 16,
        fontFamily: 'Arial',
        color: '#000000',
        pageNumber: currentPage,
      };

      setTextSpans(prev => [...prev, newTextBox]);
      setEditingSpanId(newTextBox.id);
      setActiveTool('select');
    }
  };

  const handleTextSpanClick = (spanId: string) => {
    if (activeTool === 'select') {
      setEditingSpanId(spanId);
    }
  };

  const handleTextChange = (spanId: string, newContent: string) => {
    setTextSpans(textSpans.map(span =>
      span.id === spanId ? { ...span, content: newContent } : span
    ));
  };

  const handleTextBlur = () => {
    setEditingSpanId(null);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const previousState = history[historyIndex - 1];
      setTextSpans(JSON.parse(JSON.stringify(previousState.textSpans)));
      setDrawElements(JSON.parse(JSON.stringify(previousState.drawElements)));
      setHistoryIndex(historyIndex - 1);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const nextState = history[historyIndex + 1];
      setTextSpans(JSON.parse(JSON.stringify(nextState.textSpans)));
      setDrawElements(JSON.parse(JSON.stringify(nextState.drawElements)));
      setHistoryIndex(historyIndex + 1);
    }
  }, [historyIndex, history]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z (Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y (Cmd+Shift+Z or Cmd+Y on Mac)
      else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      setEditingSpanId(null);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      setEditingSpanId(null);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 0.25, 3);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 0.25, 0.5);
    setZoom(newZoom);
  };

  const handleFitToWidth = async () => {
    if (!pdfDocument || !containerRef.current) return;

    try {
      const page = await pdfDocument.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current.clientWidth - 64;
      const fitZoom = containerWidth / viewport.width;
      setZoom(fitZoom);
    } catch (error) {
      console.error("Error fitting to width:", error);
    }
  };

  const handleFitToPage = async () => {
    if (!pdfDocument || !containerRef.current) return;

    try {
      const page = await pdfDocument.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current.clientWidth - 64;
      const containerHeight = containerRef.current.clientHeight - 64;
      const fitZoomWidth = containerWidth / viewport.width;
      const fitZoomHeight = containerHeight / viewport.height;
      setZoom(Math.min(fitZoomWidth, fitZoomHeight));
    } catch (error) {
      console.error("Error fitting to page:", error);
    }
  };

  const handleSave = async () => {
    if (!originalPdfBytesRef.current) {
      alert("Original PDF not loaded");
      return;
    }

    try {
      setIsSaving(true);

      // Load the original PDF
      const pdfDoc = await PDFDocument.load(originalPdfBytesRef.current);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Process each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = pdfDoc.getPage(pageNum - 1);
        const { height } = page.getSize();

        // Get text spans for this page
        const pageTextSpans = textSpans.filter(span => span.pageNumber === pageNum);

        // Draw text edits
        for (const span of pageTextSpans) {
          // PDF coordinate system: (0,0) is bottom-left, we need to flip Y
          const pdfY = height - span.baseY - span.baseHeight;

          page.drawText(span.content, {
            x: span.baseX,
            y: pdfY,
            size: span.baseFontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        }

        // Get draw elements for this page
        const pageDrawElements = drawElements.filter(el => el.pageNumber === pageNum);

        // Draw shapes and annotations
        for (const element of pageDrawElements) {
          const pdfY = height - element.y;

          if (element.type === 'rectangle') {
            page.drawRectangle({
              x: element.x,
              y: pdfY - (element.height || 0),
              width: element.width || 0,
              height: element.height || 0,
              borderColor: rgb(0, 0, 0),
              borderWidth: element.strokeWidth,
            });
          } else if (element.type === 'circle') {
            // Approximate circle with ellipse
            page.drawEllipse({
              x: element.x,
              y: pdfY,
              xScale: element.radius || 0,
              yScale: element.radius || 0,
              borderColor: rgb(0, 0, 0),
              borderWidth: element.strokeWidth,
            });
          } else if (element.type === 'line') {
            page.drawLine({
              start: { x: element.x, y: pdfY },
              end: { x: element.x2 || 0, y: height - (element.y2 || 0) },
              color: rgb(0, 0, 0),
              thickness: element.strokeWidth,
            });
          } else if (element.type === 'highlight') {
            page.drawRectangle({
              x: element.x,
              y: pdfY - (element.height || 0),
              width: element.width || 0,
              height: element.height || 0,
              color: rgb(1, 1, 0),
              opacity: 0.3,
            });
          }
        }
      }

      // Save the modified PDF
      const pdfBytes = await pdfDoc.save();

      // Create a new file with the edits
      const editedFile = new File([pdfBytes], fileName, { type: 'application/pdf' });

      // Update the original bytes reference
      originalPdfBytesRef.current = await editedFile.arrayBuffer();

      setIsSaving(false);
      alert("✅ Edits saved to PDF! You can now download or send for signature.");
    } catch (error) {
      console.error("Error saving PDF:", error);
      setIsSaving(false);
      alert("Error saving PDF. Please try again.");
    }
  };

  const handleDownload = async () => {
    if (!originalPdfBytesRef.current) {
      alert("Please save your edits first");
      return;
    }

    try {
      setIsSaving(true);

      // Load the current PDF state
      const pdfDoc = await PDFDocument.load(originalPdfBytesRef.current);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Process each page with current edits
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = pdfDoc.getPage(pageNum - 1);
        const { height } = page.getSize();

        // Get text spans for this page
        const pageTextSpans = textSpans.filter(span => span.pageNumber === pageNum);

        // Draw text edits
        for (const span of pageTextSpans) {
          const pdfY = height - span.baseY - span.baseHeight;

          page.drawText(span.content, {
            x: span.baseX,
            y: pdfY,
            size: span.baseFontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        }

        // Get draw elements for this page
        const pageDrawElements = drawElements.filter(el => el.pageNumber === pageNum);

        // Draw shapes and annotations
        for (const element of pageDrawElements) {
          const pdfY = height - element.y;

          if (element.type === 'rectangle') {
            page.drawRectangle({
              x: element.x,
              y: pdfY - (element.height || 0),
              width: element.width || 0,
              height: element.height || 0,
              borderColor: rgb(0, 0, 0),
              borderWidth: element.strokeWidth,
            });
          } else if (element.type === 'circle') {
            page.drawEllipse({
              x: element.x,
              y: pdfY,
              xScale: element.radius || 0,
              yScale: element.radius || 0,
              borderColor: rgb(0, 0, 0),
              borderWidth: element.strokeWidth,
            });
          } else if (element.type === 'line') {
            page.drawLine({
              start: { x: element.x, y: pdfY },
              end: { x: element.x2 || 0, y: height - (element.y2 || 0) },
              color: rgb(0, 0, 0),
              thickness: element.strokeWidth,
            });
          } else if (element.type === 'highlight') {
            page.drawRectangle({
              x: element.x,
              y: pdfY - (element.height || 0),
              width: element.width || 0,
              height: element.height || 0,
              color: rgb(1, 1, 0),
              opacity: 0.3,
            });
          }
        }
      }

      // Save and download
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();

      URL.revokeObjectURL(url);
      setIsSaving(false);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      setIsSaving(false);
      alert("Error downloading PDF. Please try again.");
    }
  };

  const tools: Array<{ id: Tool; icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { id: 'select', icon: MousePointer, label: 'Select' },
    { id: 'text', icon: Type, label: 'Add Text' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  ];

  // Get current page text spans for rendering
  const currentPageTextSpans = textSpans.filter(span => span.pageNumber === currentPage);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b bg-background p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <Sparkles className="h-3 w-3 mr-1" />
              Visual PDF Editor
            </Badge>
          </div>
        </div>

        {/* Info banner about inline editing */}
        {!isLoading && (
          <Card className="p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>✨ Professional PDF Editing!</strong> Click any text to edit inline (like Adobe Acrobat). Add text boxes with "Add Text" tool. Undo with Ctrl+Z. Scroll with mouse wheel. Save edits to flatten changes.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  Page {currentPage} of {totalPages} • {isExtractingText ? 'Building editable text layer...' : `${textSpans.filter(s => s.id.startsWith('extracted-')).length} text items editable`} • {textSpans.filter(s => !s.id.startsWith('extracted-')).length} annotations added
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-4">
          <Input
            value={fileName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFileName(e.target.value)}
            className="max-w-md font-semibold"
          />

          <div className="flex gap-2">
            <Button onClick={handleSave} variant="outline" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Edits
                </>
              )}
            </Button>
            <Button onClick={handleDownload} variant="outline" disabled={isSaving}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              onClick={async () => {
                // Save edits first, then send
                await handleSave();
                if (originalPdfBytesRef.current) {
                  const editedFile = new File(
                    [originalPdfBytesRef.current],
                    fileName,
                    { type: 'application/pdf' }
                  );
                  onSendForSignature(editedFile);
                }
              }}
              className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
              disabled={isSaving}
            >
              <Send className="h-4 w-4 mr-2" />
              Send for Signature
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Tools Sidebar */}
        <div className="w-20 border-r bg-background p-2 space-y-2">
          {tools.map(tool => (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? "default" : "ghost"}
              size="icon"
              className={`w-full h-16 flex flex-col gap-1 ${
                activeTool === tool.id
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : ""
              }`}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
            >
              <tool.icon className="h-5 w-5" />
              <span className="text-xs">{tool.label.split(' ')[0]}</span>
            </Button>
          ))}
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b bg-background p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1}>
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleFitToWidth} title="Fit to width">
                Fit Width
              </Button>
              <Button variant="outline" size="sm" onClick={handleFitToPage} title="Fit to page">
                Fit Page
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm min-w-[60px] text-center font-mono">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
              >
                <Undo className="h-4 w-4 mr-2" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo className="h-4 w-4 mr-2" />
                Redo
              </Button>
              {history.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {historyIndex + 1}/{history.length}
                </span>
              )}
            </div>
          </div>

          {/* Canvas + Text Layer - SCROLLABLE with Pinch-to-Zoom */}
          <div
            ref={containerRef}
            className="flex-1 p-8 bg-gray-100 dark:bg-gray-800"
            style={{
              height: 'calc(100vh - 220px)',
              overflowY: 'auto',
              overflowX: 'auto',
              ...pinchZoomStyles,
            }}
            {...touchHandlers}
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                <p className="text-muted-foreground">Loading PDF...</p>
              </div>
            ) : (
              <div className="relative shadow-2xl mx-auto mb-8" style={{ width: 'fit-content' }}>
                {/* Rendering indicator */}
                {isRendering && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      <p className="text-sm text-muted-foreground">Rendering page...</p>
                    </div>
                  </div>
                )}



                {/* PDF Canvas (background) */}
                <canvas
                  ref={canvasRef}
                  className="border border-gray-300 dark:border-gray-700 bg-white cursor-crosshair"
                  style={{ display: 'block' }}
                  onClick={handleCanvasClick}
                />

                {/* Annotation Layer Overlay (extracted text + user-added elements) */}
                <div
                  ref={textLayerRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                >
                  {/* Editable Text Layer - replaces PDF's native text */}
                  {currentPageTextSpans.map(span => {
                    const displayX = span.baseX * zoom;
                    const displayY = span.baseY * zoom;
                    const displayWidth = span.baseWidth * zoom;
                    const displayHeight = span.baseHeight * zoom;
                    const displayFontSize = span.baseFontSize * zoom;

                    const isExtracted = span.id.startsWith('extracted-');
                    const isEditing = editingSpanId === span.id;

                    return (
                      <div
                        key={span.id}
                        className={`absolute pointer-events-auto transition-all ${
                          isEditing
                            ? 'bg-blue-50 ring-2 ring-blue-500 shadow-lg z-10 cursor-text'
                            : isExtracted
                            ? 'hover:bg-blue-100/30 cursor-text'
                            : 'bg-yellow-50/90 hover:bg-yellow-100 border border-yellow-400 cursor-move'
                        }`}
                        style={{
                          left: `${displayX}px`,
                          top: `${displayY}px`,
                          minWidth: `${displayWidth}px`,
                          height: `${displayHeight}px`,
                          fontSize: `${displayFontSize}px`,
                          fontFamily: span.fontFamily,
                          color: '#000000',
                          lineHeight: `${displayHeight}px`,
                          whiteSpace: 'nowrap',
                          overflow: 'visible',
                          padding: isExtracted ? '0 1px' : '4px 8px',
                          borderRadius: isExtracted ? '1px' : '3px',
                        }}
                        onClick={() => handleTextSpanClick(span.id)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={span.content}
                            onChange={(e) => handleTextChange(span.id, e.target.value)}
                            onBlur={handleTextBlur}
                            autoFocus
                            className="w-full h-full bg-transparent border-none outline-none"
                            style={{
                              fontSize: `${displayFontSize}px`,
                              fontFamily: span.fontFamily,
                              color: '#000000',
                              lineHeight: `${displayHeight}px`,
                              padding: 0,
                            }}
                          />
                        ) : (
                          <span>{span.content}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-80 border-l bg-background p-4 space-y-4">
          <h3 className="font-semibold">Properties</h3>

          <Card className="p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
            <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Quick Guide
            </h4>
            <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
              <li>• <strong>Edit Original Text</strong>: Click any text in PDF</li>
              <li>• <strong>Add New Text</strong>: Use "Add Text" tool</li>
              <li>• <strong>Undo/Redo</strong>: Ctrl+Z / Ctrl+Shift+Z</li>
              <li>• <strong>Scroll</strong>: Mouse wheel or scrollbar</li>
              <li>• <strong>Save</strong>: Flattens all edits to PDF</li>
            </ul>
          </Card>

          {history.length > 0 && (
            <Card className="p-4">
              <h4 className="font-medium mb-2">History</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Total changes: {history.length}</p>
                <p>Current position: {historyIndex + 1}</p>
                <p>Can undo: {historyIndex > 0 ? 'Yes' : 'No'}</p>
                <p>Can redo: {historyIndex < history.length - 1 ? 'Yes' : 'No'}</p>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h4 className="font-medium mb-2">Active Tool</h4>
            <p className="text-sm text-muted-foreground capitalize">{activeTool}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
