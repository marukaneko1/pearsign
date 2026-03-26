"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  FileText,
  PenTool,
  X,
  Calendar,
  ZoomIn,
  ZoomOut,
  Loader2,
  Shield,
  Download,
  RotateCcw,
  Type,
  Check,
  Info,
  Lock,
  FileCheck,
  AlertCircle,
  ExternalLink,
  Clock,
  User,
  Mail,
  Building,
  Briefcase,
  Edit3,
  ChevronDown,
  Paperclip,
  Upload,
  Trash2,
  ArrowRight,
  ArrowDown,
  MousePointer2,
} from "lucide-react";
import { MeteorBackground, GlowOrb } from "./meteor-background";
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface Envelope {
  id: string;
  title: string;
  description?: string;
  status: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface Field {
  id: string;
  type: string;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value?: string;
  preFilledValue?: string;
  isPreFilled: boolean;
  placeholder?: string;
  groupId?: string;
  groupLabel?: string;
  options?: string[];
  currency?: string;
}

interface SigningPageContentProps {
  token: string;
  envelope: Envelope;
  recipient: Recipient;
  documentUrl?: string;
  assignedFields: Field[];
  allFields: Field[];
}

type SigningStage = 'welcome' | 'consent' | 'signing' | 'completed' | 'declined';
type SignatureMode = 'draw' | 'type';

// Field type configurations
const FIELD_ICONS: Record<string, React.ElementType> = {
  signature: PenTool,
  initials: Type,
  date: Calendar,
  name: User,
  email: Mail,
  text: Edit3,
  company: Building,
  title: Briefcase,
  upload: Paperclip,
  radio: CheckCircle2,
  dropdown: ChevronDown,
  payment: FileText,
};

// Fields that require signature capture (not text input)
const SIGNATURE_FIELDS = ['signature', 'initials'];

// Fields that auto-fill with today's date
const DATE_FIELDS = ['date'];

// Text-based fields that allow typing
const TEXT_FIELDS = ['name', 'email', 'text', 'company', 'title'];

// Fields that allow file uploads
const UPLOAD_FIELDS = ['upload'];

// Radio button fields (single select from group)
const RADIO_FIELDS = ['radio'];

// Dropdown fields (select from options list)
const DROPDOWN_FIELDS = ['dropdown'];

// Payment/amount fields (numeric with currency)
const PAYMENT_FIELDS = ['payment'];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '\u20AC', GBP: '\u00A3', ILS: '\u20AA',
  CAD: '$', AUD: '$', JPY: '\u00A5', CHF: 'Fr',
};

// Uploaded file interface
interface UploadedFile {
  id: string;
  fieldId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export function SigningPageContent({
  token,
  envelope,
  recipient,
  documentUrl,
  assignedFields,
  allFields,
}: SigningPageContentProps) {
  // Stage management
  const [stage, setStage] = useState<SigningStage>('welcome');
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [filledFields, setFilledFields] = useState<Record<string, string>>({});

  // Modals
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [decliningInProgress, setDecliningInProgress] = useState(false);
  const [editingTextFieldId, setEditingTextFieldId] = useState<string | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  // Signature capture
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState(recipient.name);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedInitials, setSavedInitials] = useState<string | null>(null);

  // Loading states
  const [completing, setCompleting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditData, setAuditData] = useState<{
    events: Array<{
      id: string;
      action: string;
      timestamp: string;
      actor: string;
      details: string;
    }>;
    fieldsSummary: Array<{ name: string; type: string; value: string }>;
  } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Completion URLs returned from API
  const [completionData, setCompletionData] = useState<{
    downloadUrl: string;
    auditUrl: string;
    auditPdfUrl: string;
  } | null>(null);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Dropdown state
  const [showDropdownFieldId, setShowDropdownFieldId] = useState<string | null>(null);

  // Payment state
  const [editingPaymentFieldId, setEditingPaymentFieldId] = useState<string | null>(null);
  const [paymentInputValue, setPaymentInputValue] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF state
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const [pagesRendered, setPagesRendered] = useState(false);
  const [canvasesReady, setCanvasesReady] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Guided signing UX state (DocuSign-style enhancements)
  const [showFillInGuide, setShowFillInGuide] = useState(true);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [justCompletedField, setJustCompletedField] = useState<string | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const mountedCanvasCount = useRef(0);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize filled fields with prefilled values
  useEffect(() => {
    const prefilledData: Record<string, string> = {};
    assignedFields.forEach(field => {
      if (field.preFilledValue && field.isPreFilled) {
        prefilledData[field.id] = field.preFilledValue;
      }
    });
    if (Object.keys(prefilledData).length > 0) {
      setFilledFields(prev => ({ ...prev, ...prefilledData }));
    }
  }, [assignedFields]);

  // Computed values
  const currentField = assignedFields[currentFieldIndex];
  const requiredFields = assignedFields.filter((f) => f.required);
  const unfilledRequiredFields = requiredFields.filter(f => !filledFields[f.id]);
  const filledRequiredCount = requiredFields.filter((f) => filledFields[f.id]).length;
  const progress = requiredFields.length > 0
    ? (filledRequiredCount / requiredFields.length) * 100
    : 100;
  const allRequiredFilled = unfilledRequiredFields.length === 0;

  // Get the next unfilled required field for the "Fill In" button
  const nextUnfilledField = unfilledRequiredFields[0] || null;

  // Load PDF with optimized auto-zoom for full-screen fit
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setPdfLoading(true);
        setPdfError(null);

        const urlsToTry = documentUrl
          ? [
              documentUrl.startsWith('/') ? `${window.location.origin}${documentUrl}` : documentUrl,
              `${window.location.origin}/api/public/sample-pdf`
            ]
          : [`${window.location.origin}/api/public/sample-pdf`];

        let lastError: Error | null = null;

        for (const url of urlsToTry) {
          try {
            console.log('[SigningPage] Trying to load PDF from:', url);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('application/pdf')) throw new Error('Not a PDF');

            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength < 100) throw new Error('PDF too small');

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            console.log('[SigningPage] PDF loaded successfully, pages:', pdf.numPages);

            setPdfDocument(pdf);
            setTotalPages(pdf.numPages);
            setCanvasesReady(false);
            mountedCanvasCount.current = 0;
            setRenderKey(k => k + 1);

            // Enhanced auto-fit zoom for full-screen document display
            // Calculate optimal zoom to make document fill viewport cleanly
            if (containerRef.current) {
              const page = await pdf.getPage(1);
              const viewport = page.getViewport({ scale: 1.0 });

              // Get available viewport dimensions (accounting for header, toolbar, bottom bar)
              const containerWidth = containerRef.current.clientWidth - 32; // padding
              const availableHeight = window.innerHeight - 200; // header + toolbar + bottom bar

              // Calculate zoom to fit width while ensuring reasonable height visibility
              const widthBasedZoom = containerWidth / viewport.width;
              const heightBasedZoom = availableHeight / viewport.height;

              // Use the larger of the two to maximize document visibility
              // but cap at 1.5x to prevent excessive scaling
              const fitZoom = Math.min(
                Math.max(widthBasedZoom, heightBasedZoom * 0.9),
                1.5
              );

              // Ensure minimum zoom of 0.8 for readability
              const finalZoom = Math.max(0.8, fitZoom);

              console.log('[SigningPage] Auto-zoom calculated:', {
                containerWidth,
                availableHeight,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
                widthBasedZoom,
                heightBasedZoom,
                finalZoom
              });

              setZoom(finalZoom);
            }

            return;
          } catch (err) {
            console.warn('[SigningPage] Failed to load from', url, ':', err);
            lastError = err instanceof Error ? err : new Error('Unknown error');
          }
        }

        throw lastError || new Error('Failed to load document');
      } catch (err) {
        console.error('[SigningPage] All PDF load attempts failed:', err);
        setPdfError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setPdfLoading(false);
      }
    };

    loadPDF();
  }, [documentUrl]);

  // Render all PDF pages for continuous scroll - only when in signing stage
  useEffect(() => {
    if (!pdfDocument || stage !== 'signing') return;

    // Delay to ensure canvases are mounted in DOM
    const timeoutId = setTimeout(async () => {
      console.log('[SigningPage] Rendering all pages, stage:', stage, 'totalPages:', totalPages);
      const heights: number[] = [];
      const pixelRatio = window.devicePixelRatio || 1;
      const renderScale = Math.max(2, zoom) * pixelRatio;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);
          const viewport = page.getViewport({ scale: zoom });
          const scaledViewport = page.getViewport({ scale: renderScale });

          const canvas = canvasRefs.current[pageNum];
          if (!canvas) {
            console.warn('[SigningPage] Canvas not found for page', pageNum, '- retrying...');
            // Wait a bit and retry once
            await new Promise(r => setTimeout(r, 100));
            const retryCanvas = canvasRefs.current[pageNum];
            if (!retryCanvas) {
              console.error('[SigningPage] Canvas still not found for page', pageNum);
              continue;
            }
          }

          const finalCanvas = canvasRefs.current[pageNum]!;
          const context = finalCanvas.getContext('2d', { alpha: false });
          if (!context) continue;

          finalCanvas.width = scaledViewport.width;
          finalCanvas.height = scaledViewport.height;
          finalCanvas.style.width = `${viewport.width}px`;
          finalCanvas.style.height = `${viewport.height}px`;

          heights[pageNum - 1] = viewport.height;

          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';

          await page.render({
            canvasContext: context,
            viewport: scaledViewport,
          }).promise;

          console.log('[SigningPage] Page', pageNum, 'rendered successfully');
        } catch (err) {
          console.error('[SigningPage] Error rendering page', pageNum, ':', err);
        }
      }

      setPageHeights(heights);
      setPagesRendered(true);
    }, 300); // Wait 300ms for canvases to mount

    return () => clearTimeout(timeoutId);
  }, [pdfDocument, totalPages, zoom, stage]);

  // Initialize signature canvas
  useEffect(() => {
    if (showSignatureModal && signatureMode === 'draw' && signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [showSignatureModal, signatureMode]);

  // Focus text input when editing
  useEffect(() => {
    if (editingTextFieldId && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [editingTextFieldId]);

  // Scroll to first unfilled required field when entering signing stage - enhanced with delay for better UX
  useEffect(() => {
    if (stage === 'signing' && pagesRendered && unfilledRequiredFields.length > 0) {
      const firstUnfilled = unfilledRequiredFields[0];
      const fieldIndex = assignedFields.findIndex(f => f.id === firstUnfilled.id);
      if (fieldIndex >= 0) {
        setCurrentFieldIndex(fieldIndex);
        // Slightly longer delay for smoother transition into signing
        setTimeout(() => {
          scrollToField(firstUnfilled.id);
          setShowFillInGuide(true);
        }, 600);
      }
    }
  }, [stage, pagesRendered]);

  // Clear the "just completed" animation after a short delay
  useEffect(() => {
    if (justCompletedField) {
      const timer = setTimeout(() => {
        setJustCompletedField(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [justCompletedField]);

  // Scroll to field helper with smooth behavior
  const scrollToField = useCallback((fieldId: string) => {
    const el = fieldRefs.current[fieldId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Find next unfilled required field
  const findNextUnfilledField = useCallback((afterIndex: number = -1): number => {
    const idx = assignedFields.findIndex(
      (f, i) => i > afterIndex && f.required && !filledFields[f.id]
    );
    return idx;
  }, [assignedFields, filledFields]);

  // Enhanced advance to next field with animation
  const advanceToNextField = useCallback(() => {
    const nextIdx = findNextUnfilledField(currentFieldIndex);
    if (nextIdx >= 0) {
      setIsAutoAdvancing(true);
      setCurrentFieldIndex(nextIdx);

      // Smooth scroll with animation feedback
      setTimeout(() => {
        scrollToField(assignedFields[nextIdx].id);
        setTimeout(() => {
          setIsAutoAdvancing(false);
        }, 300);
      }, 150);
    } else {
      // All fields completed - show completion state
      setIsAutoAdvancing(false);
    }
  }, [currentFieldIndex, findNextUnfilledField, assignedFields, scrollToField]);

  // Handle clicking the "Fill In" guide button
  const handleFillInClick = useCallback(() => {
    if (nextUnfilledField) {
      const fieldIndex = assignedFields.findIndex(f => f.id === nextUnfilledField.id);
      if (fieldIndex >= 0) {
        setCurrentFieldIndex(fieldIndex);
        scrollToField(nextUnfilledField.id);

        // Auto-trigger the field action after scrolling
        setTimeout(() => {
          handleFieldClick(nextUnfilledField);
        }, 400);
      }
    }
  }, [nextUnfilledField, assignedFields, scrollToField]);

  // Signature drawing handlers
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const coords = getCanvasCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCanvasCoords(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Handle signature adoption - enhanced with completion animation
  const handleSignatureAdopt = () => {
    let signatureData: string;

    if (signatureMode === 'draw') {
      const canvas = signatureCanvasRef.current;
      if (!canvas || !hasDrawn) return;
      signatureData = canvas.toDataURL("image/png");
    } else if (signatureMode === 'type') {
      if (!typedSignature.trim()) return;
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1e293b';
      ctx.font = "italic 36px 'Dancing Script', cursive";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedSignature, 200, 40);
      signatureData = canvas.toDataURL("image/png");
    } else {
      return;
    }

    // Save for reuse
    if (currentField?.type === 'signature') {
      setSavedSignature(signatureData);
    } else if (currentField?.type === 'initials') {
      setSavedInitials(signatureData);
    }

    if (currentField) {
      setFilledFields((prev) => ({ ...prev, [currentField.id]: signatureData }));
      setJustCompletedField(currentField.id);
      advanceToNextField();
    }

    setShowSignatureModal(false);
    setHasDrawn(false);
  };

  // Handle field clicks - enhanced with completion feedback
  const handleFieldClick = (field: Field) => {
    if (filledFields[field.id]) return; // Already filled

    const fieldIndex = assignedFields.findIndex(f => f.id === field.id);
    setCurrentFieldIndex(fieldIndex);

    if (SIGNATURE_FIELDS.includes(field.type)) {
      // Check for saved signature
      const saved = field.type === 'signature' ? savedSignature : savedInitials;
      if (saved) {
        setFilledFields(prev => ({ ...prev, [field.id]: saved }));
        setJustCompletedField(field.id);
        advanceToNextField();
      } else {
        setShowSignatureModal(true);
      }
    } else if (DATE_FIELDS.includes(field.type)) {
      // Auto-fill with today's date
      const today = new Date().toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });
      setFilledFields(prev => ({ ...prev, [field.id]: today }));
      setJustCompletedField(field.id);
      advanceToNextField();
    } else if (TEXT_FIELDS.includes(field.type)) {
      // Open text input
      setEditingTextFieldId(field.id);
      setTextInputValue(field.preFilledValue || '');
    } else if (UPLOAD_FIELDS.includes(field.type)) {
      // Open upload modal
      setUploadingFieldId(field.id);
      setShowUploadModal(true);
      setUploadError(null);
    } else if (RADIO_FIELDS.includes(field.type)) {
      // For radio, selecting one deselects others in the same group
      if (field.groupId) {
        const groupFields = assignedFields.filter(f => f.groupId === field.groupId);
        const newFilled = { ...filledFields };
        groupFields.forEach(gf => { delete newFilled[gf.id]; });
        newFilled[field.id] = 'selected';
        setFilledFields(newFilled);
        setJustCompletedField(field.id);
        advanceToNextField();
      }
    } else if (DROPDOWN_FIELDS.includes(field.type)) {
      setShowDropdownFieldId(field.id);
    } else if (PAYMENT_FIELDS.includes(field.type)) {
      setEditingPaymentFieldId(field.id);
      setPaymentInputValue(field.preFilledValue || '');
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !uploadingFieldId) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fieldId', uploadingFieldId);

        const response = await fetch(`/api/public/sign/${token}/upload`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Upload failed');
        }

        // Add to uploaded files list
        setUploadedFiles(prev => [...prev, {
          id: result.file.id,
          fieldId: uploadingFieldId,
          fileName: result.file.fileName,
          fileType: result.file.fileType,
          fileSize: result.file.fileSize,
          createdAt: result.file.createdAt,
        }]);
      }

      // Mark the field as filled (use placeholder text showing count)
      const fieldUploads = uploadedFiles.filter(f => f.fieldId === uploadingFieldId).length + files.length;
      setFilledFields(prev => ({
        ...prev,
        [uploadingFieldId]: `${fieldUploads} file(s) uploaded`
      }));

    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle file deletion
  const handleDeleteUpload = async (fileId: string) => {
    try {
      const response = await fetch(`/api/public/sign/${token}/upload?fileId=${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Delete failed');
      }

      // Remove from list
      const deletedFile = uploadedFiles.find(f => f.id === fileId);
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));

      // Update field filled status
      if (deletedFile) {
        const remainingUploads = uploadedFiles.filter(
          f => f.fieldId === deletedFile.fieldId && f.id !== fileId
        );
        if (remainingUploads.length === 0) {
          setFilledFields(prev => {
            const updated = { ...prev };
            delete updated[deletedFile.fieldId];
            return updated;
          });
        } else {
          setFilledFields(prev => ({
            ...prev,
            [deletedFile.fieldId]: `${remainingUploads.length} file(s) uploaded`
          }));
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  // Close upload modal and advance if files were uploaded
  const handleCloseUploadModal = () => {
    if (uploadingFieldId) {
      const fieldUploads = uploadedFiles.filter(f => f.fieldId === uploadingFieldId);
      if (fieldUploads.length > 0) {
        advanceToNextField();
      }
    }
    setShowUploadModal(false);
    setUploadingFieldId(null);
    setUploadError(null);
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Fetch existing uploads when entering signing stage
  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const response = await fetch(`/api/public/sign/${token}/upload`);
        if (response.ok) {
          const result = await response.json();
          if (result.files && result.files.length > 0) {
            setUploadedFiles(result.files);
            // Update filled fields for each upload field that has files
            const fieldCounts: Record<string, number> = {};
            for (const file of result.files) {
              fieldCounts[file.fieldId] = (fieldCounts[file.fieldId] || 0) + 1;
            }
            setFilledFields(prev => {
              const updated = { ...prev };
              for (const [fieldId, count] of Object.entries(fieldCounts)) {
                updated[fieldId] = `${count} file(s) uploaded`;
              }
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('Error fetching uploads:', err);
      }
    };

    if (stage === 'signing') {
      fetchUploads();
    }
  }, [stage, token]);

  // Handle text field save - enhanced with completion feedback
  const handleTextFieldSave = () => {
    if (editingTextFieldId && textInputValue.trim()) {
      setFilledFields(prev => ({ ...prev, [editingTextFieldId]: textInputValue.trim() }));
      setJustCompletedField(editingTextFieldId);
      setEditingTextFieldId(null);
      setTextInputValue('');
      advanceToNextField();
    }
  };

  // Handle completing signing - Uses LIVE API
  const handleComplete = async () => {
    try {
      setCompleting(true);

      const response = await fetch(`/api/public/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipient.id,
          signerName: recipient.name,
          signerEmail: recipient.email,
          fieldValues: filledFields,
          signatureData: Object.values(filledFields).find(v => v.startsWith('data:image')) || '',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to complete signing');
      }

      const result = await response.json();

      // Store completion data with URLs
      setCompletionData({
        downloadUrl: result.downloadUrl || `/api/public/sign/${token}/download`,
        auditUrl: result.auditUrl || `/api/public/sign/${token}/audit`,
        auditPdfUrl: `/api/public/sign/${token}/audit-pdf`,
      });

      setStage('completed');
    } catch (error: unknown) {
      console.error('Error completing signing:', error);
      alert(error instanceof Error ? error.message : 'Failed to complete signing. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  // Handle downloading signed PDF
  const handleDownloadPdf = async () => {
    if (!completionData?.downloadUrl) return;

    try {
      setDownloadingPdf(true);
      const response = await fetch(completionData.downloadUrl);

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envelope.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Handle downloading audit trail as PDF
  const handleDownloadAudit = async () => {
    if (!completionData?.auditPdfUrl) return;

    try {
      const response = await fetch(completionData.auditPdfUrl);

      if (!response.ok) {
        throw new Error('Failed to download audit trail');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envelope.title.replace(/[^a-zA-Z0-9]/g, '_')}_audit_trail.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading audit trail:', error);
      alert('Failed to download audit trail. Please try again.');
    }
  };

  // Handle viewing audit trail
  const handleViewAudit = async () => {
    if (!completionData?.auditUrl) return;

    try {
      setAuditLoading(true);
      setShowAuditModal(true);

      const response = await fetch(completionData.auditUrl);

      if (!response.ok) {
        throw new Error('Failed to load audit trail');
      }

      const data = await response.json();
      setAuditData(data);
    } catch (error) {
      console.error('Error loading audit trail:', error);
      alert('Failed to load audit trail. Please try again.');
      setShowAuditModal(false);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleDecline = async () => {
    setDecliningInProgress(true);
    try {
      const response = await fetch(`/api/public/sign/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to decline document. Please try again.');
        return;
      }

      setShowDeclineModal(false);
      setStage('declined');
    } catch (err) {
      console.error('[Decline] Error:', err);
      alert('Failed to decline document. Please try again.');
    } finally {
      setDecliningInProgress(false);
    }
  };

  // Get field icon
  const getFieldIcon = (type: string) => FIELD_ICONS[type] || Edit3;

  // Get field display label for tags
  const getFieldTagLabel = (type: string): string => {
    const labels: Record<string, string> = {
      signature: 'Sign',
      initials: 'Initial',
      date: 'Date',
      name: 'Name',
      email: 'Email',
      text: 'Text',
      company: 'Company',
      title: 'Title',
      upload: 'Upload',
      radio: 'Select',
      dropdown: 'Choose',
      payment: 'Amount',
    };
    return labels[type] || type;
  };

  // ==================== WELCOME SCREEN ====================
  if (stage === 'welcome') {
    return (
      <div className="min-h-screen relative flex flex-col text-white overflow-hidden">
        <MeteorBackground meteorCount={15} />
        <GlowOrb color="blue" size="lg" className="top-[-10%] right-[-5%] animate-float" />
        <GlowOrb color="purple" size="md" className="bottom-[10%] left-[-5%] animate-float" style={{ animationDelay: '3s' } as React.CSSProperties} />

        <header className="relative z-10 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/pearsign-logo.png" alt="PearSign" className="h-10 w-10 rounded-xl" />
              <span className="font-semibold text-white/90 text-lg tracking-tight">PearSign</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Lock className="h-3.5 w-3.5" />
              <span>Secure signing</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
          <div className="w-full max-w-md">
            <div className="signing-glass-card rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
              <div className="px-6 pt-6 pb-5">
                <div className="flex items-start gap-4 mb-6">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 animate-float">
                    <FileCheck className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h1 className="text-xl font-bold text-white truncate tracking-tight">{envelope.title}</h1>
                    <p className="text-sm text-white/50 mt-1">Ready for your signature</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 mb-5">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/15">
                    {recipient.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{recipient.name}</p>
                    <p className="text-sm text-white/40 truncate">{recipient.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-white/60 mb-6">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
                    <PenTool className="h-3.5 w-3.5 text-blue-400" />
                    <span>{assignedFields.filter(f => SIGNATURE_FIELDS.includes(f.type)).length} signature</span>
                  </div>
                  {assignedFields.filter(f => DATE_FIELDS.includes(f.type)).length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
                      <Calendar className="h-3.5 w-3.5 text-blue-400" />
                      <span>{assignedFields.filter(f => DATE_FIELDS.includes(f.type)).length} date</span>
                    </div>
                  )}
                  {assignedFields.filter(f => TEXT_FIELDS.includes(f.type)).length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
                      <Edit3 className="h-3.5 w-3.5 text-blue-400" />
                      <span>{assignedFields.filter(f => TEXT_FIELDS.includes(f.type)).length} fields</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
                    <Clock className="h-3.5 w-3.5 text-white/30" />
                    <span>~1 min</span>
                  </div>
                </div>

                <button
                  onClick={() => setStage('consent')}
                  className="w-full h-12 text-base font-semibold text-white rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  Review & Sign
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>

                <button
                  onClick={() => setShowDeclineModal(true)}
                  className="w-full mt-3 text-sm text-white/30 hover:text-white/60 py-2 transition-colors"
                >
                  I don't want to sign
                </button>
              </div>

              <div className="px-6 py-3.5 border-t border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-center gap-4 text-[11px] text-white/25">
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    <span>ESIGN/UETA compliant</span>
                  </div>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span>256-bit encryption</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {showDeclineModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="signing-glass-card-solid rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Decline to sign?</h3>
              </div>
              <p className="text-white/50 text-sm mb-4">
                The sender will be notified that you declined to sign this document.
              </p>
              <textarea
                data-testid="input-decline-reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining (optional)"
                rows={3}
                className="w-full mb-4 px-3 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-transparent resize-none"
              />
              <div className="flex gap-3">
                <button onClick={() => { setShowDeclineModal(false); setDeclineReason(''); }} disabled={decliningInProgress} className="flex-1 h-10 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 text-sm font-medium transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button data-testid="button-confirm-decline" onClick={handleDecline} disabled={decliningInProgress} className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {decliningInProgress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {decliningInProgress ? 'Declining...' : 'Decline'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== CONSENT SCREEN ====================
  if (stage === 'consent') {
    return (
      <div className="min-h-screen relative flex flex-col text-white overflow-hidden">
        <MeteorBackground meteorCount={10} />
        <GlowOrb color="cyan" size="md" className="top-[5%] left-[-3%] animate-float" />
        <GlowOrb color="blue" size="lg" className="bottom-[-5%] right-[-10%] animate-float" style={{ animationDelay: '2s' } as React.CSSProperties} />

        <header className="relative z-10 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/pearsign-logo.png" alt="PearSign" className="h-10 w-10 rounded-xl" />
              <span className="font-semibold text-white/90 text-lg tracking-tight">PearSign</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
          <div className="w-full max-w-lg">
            <div className="signing-glass-card rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
              <div className="px-6 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-500/15 border border-blue-400/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Electronic Signature Consent</h2>
                    <p className="text-sm text-white/40">Please review before signing</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[50vh] overflow-y-auto">
                <div className="text-white/60">
                  <h3 className="text-base font-semibold text-white mb-2">Consent to Electronic Records and Signatures</h3>
                  <p className="text-sm leading-relaxed">
                    By clicking &ldquo;I Agree&rdquo; below, you consent to:
                  </p>
                  <ul className="text-sm space-y-2.5 mt-3">
                    <li className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-blue-400" />
                      </div>
                      <span>Use electronic records and signatures in connection with this document</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-blue-400" />
                      </div>
                      <span>Your electronic signature has the same legal validity as a handwritten signature</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-blue-400" />
                      </div>
                      <span>You have read and understand the contents of the document you are signing</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-blue-400" />
                      </div>
                      <span>You agree to be bound by the terms of the document upon signing</span>
                    </li>
                  </ul>

                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <h4 className="text-sm font-semibold text-white/80 mb-1">Legal Basis</h4>
                    <p className="text-xs text-white/40 leading-relaxed">
                      This electronic signature is conducted in accordance with the Electronic Signatures in Global and National Commerce Act (ESIGN Act, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA). Your signature will be legally binding and enforceable.
                    </p>
                  </div>

                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <h4 className="text-sm font-semibold text-white/80 mb-1">What We Record</h4>
                    <p className="text-xs text-white/40 leading-relaxed">
                      For audit and compliance purposes, we record: your IP address, timestamp of signing, browser information, and the signature image you create. This information is securely stored and may be used to verify the authenticity of your signature.
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 border-t border-white/5 bg-white/[0.02] space-y-3">
                <button
                  onClick={() => setStage('signing')}
                  className="w-full h-12 text-base font-semibold text-white rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  I Agree — Continue to Sign
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => setStage('welcome')}
                  className="w-full text-sm text-white/30 hover:text-white/60 py-2 transition-colors"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==================== COMPLETED SCREEN ====================
  if (stage === 'completed') {
    return (
      <div className="min-h-screen relative flex flex-col text-white overflow-hidden">
        <MeteorBackground meteorCount={12} />
        <GlowOrb color="blue" size="lg" className="top-[-5%] left-[10%] animate-float" />
        <GlowOrb color="purple" size="md" className="bottom-[5%] right-[5%] animate-float" style={{ animationDelay: '4s' } as React.CSSProperties} />

        <header className="relative z-10 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/pearsign-logo.png" alt="PearSign" className="h-10 w-10 rounded-xl" />
              <span className="font-semibold text-white/90 text-lg tracking-tight">PearSign</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
          <div className="w-full max-w-md text-center">
            <div className="mb-8">
              <div className="relative inline-flex">
                <div className="h-24 w-24 rounded-full bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center animate-float">
                  <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                </div>
                <div className="absolute inset-0 rounded-full bg-emerald-400/10 animate-ping" style={{ animationDuration: '3s' }} />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Signing Complete</h1>
            <p className="text-white/50 mb-8">
              You&apos;ve successfully signed <span className="text-white/80 font-medium">{envelope.title}</span>
            </p>

            <div className="signing-glass-card rounded-2xl p-5 mb-6 text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">Signed by {recipient.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">
                    {new Date().toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <span className="text-sm text-white/70">Legally binding signature recorded</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                className="w-full h-12 font-semibold text-white rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-600/30 transition-all duration-200 flex items-center justify-center gap-2"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloadingPdf ? 'Preparing Download...' : 'Download Signed Copy'}
              </button>
              <button
                className="w-full h-10 rounded-xl border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                onClick={handleViewAudit}
              >
                <ExternalLink className="h-4 w-4" />
                View Audit Trail
              </button>
            </div>

            <p className="mt-6 text-sm text-white/30">
              A copy has been sent to {recipient.email}
            </p>
          </div>
        </main>

        {/* Audit Trail Modal */}
        {showAuditModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="signing-glass-card-solid rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                  <h3 className="text-lg font-semibold text-white">Audit Trail</h3>
                  <p className="text-sm text-white/40">{envelope.title}</p>
                </div>
                <button
                  onClick={() => setShowAuditModal(false)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                  </div>
                ) : auditData ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-white/80 mb-4">Signing Timeline</h4>
                      <div className="relative pl-6 border-l-2 border-white/10 space-y-4">
                        {auditData.events.map((event, index) => (
                          <div key={event.id} className="relative">
                            <div className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 border-slate-900 ${
                              event.action === 'completed' ? 'bg-emerald-500' :
                              event.action === 'signed' ? 'bg-blue-500' :
                              event.action === 'viewed' ? 'bg-violet-500' :
                              event.action === 'sent' ? 'bg-blue-400' :
                              'bg-slate-500'
                            }`} />
                            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                                <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                                  event.action === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                                  event.action === 'signed' ? 'bg-blue-500/15 text-blue-400' :
                                  event.action === 'viewed' ? 'bg-violet-500/15 text-violet-400' :
                                  event.action === 'sent' ? 'bg-blue-500/15 text-blue-400' :
                                  'bg-white/5 text-white/60'
                                }`}>
                                  {event.action}
                                </span>
                                <span className="text-xs text-white/30">
                                  {new Date(event.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-white/70">{event.details}</p>
                              <p className="text-xs text-white/30 mt-1">by {event.actor}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {auditData.fieldsSummary && auditData.fieldsSummary.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-white/80 mb-3">Fields Completed</h4>
                        <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4 space-y-2">
                          {auditData.fieldsSummary.map((field, index) => (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="text-white/50">{field.name}</span>
                              <span className="text-white/90 font-medium">{field.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-white/40 py-12">No audit data available</p>
                )}
              </div>

              <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-white/25">
                    This audit trail is legally compliant under ESIGN Act & UETA
                  </p>
                  <button
                    onClick={handleDownloadAudit}
                    disabled={!completionData?.auditPdfUrl}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-30"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== DECLINED SCREEN ====================
  if (stage === 'declined') {
    return (
      <div className="min-h-screen relative flex flex-col text-white overflow-hidden">
        <MeteorBackground meteorCount={8} />
        <GlowOrb color="blue" size="lg" className="top-[-5%] left-[10%] animate-float" />

        <header className="relative z-10 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/pearsign-logo.png" alt="PearSign" className="h-10 w-10 rounded-xl" />
              <span className="font-semibold text-white/90 text-lg tracking-tight">PearSign</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
          <div className="w-full max-w-md text-center">
            <div className="mb-8">
              <div className="h-24 w-24 mx-auto rounded-full bg-red-500/15 border border-red-400/20 flex items-center justify-center">
                <X className="h-12 w-12 text-red-400" />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Document Declined</h1>
            <p className="text-white/50 mb-8">
              You have declined to sign <span className="text-white/80 font-medium">{envelope.title}</span>.
              The sender has been notified.
            </p>

            <div className="signing-glass-card rounded-2xl p-5 mb-6 text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/15 border border-red-400/20 flex items-center justify-center">
                    <X className="h-3.5 w-3.5 text-red-400" />
                  </div>
                  <span className="text-sm text-white/70">Declined by {recipient.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/15 border border-red-400/20 flex items-center justify-center">
                    <Clock className="h-3.5 w-3.5 text-red-400" />
                  </div>
                  <span className="text-sm text-white/70">
                    {new Date().toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                {declineReason.trim() && (
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 shrink-0 rounded-full bg-red-500/15 border border-red-400/20 flex items-center justify-center mt-0.5">
                      <FileText className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <span className="text-sm text-white/70">{declineReason}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-sm text-white/30">
              You may close this window.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ==================== SIGNING VIEW (Continuous Scroll) ====================
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* E-Signature Disclosure Banner */}
      <div className="bg-slate-900 text-white px-4 py-2 border-b border-white/5">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-xs sm:text-sm">
          <Shield className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <p className="text-center text-white/50">
            <span className="font-medium text-white/70">E-Signature Disclosure:</span>{' '}
            By signing, you agree your electronic signature is legally binding under ESIGN Act & UETA.
          </p>
        </div>
      </div>

      {/* Top Header - Premium dark */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-white/5 safe-top">
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/15">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-sm font-semibold text-white truncate">{envelope.title}</h1>
              <p className="text-xs text-white/40 truncate">Signing as {recipient.name}</p>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm font-bold text-white">
                  {filledRequiredCount}/{requiredFields.length}
                </span>
                <span className="text-[10px] sm:text-xs font-medium text-white/40 hidden sm:inline">
                  completed
                </span>
              </div>
              <div className="w-20 sm:w-32 h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    allRequiredFilled
                      ? 'bg-emerald-400'
                      : 'bg-gradient-to-r from-blue-500 to-blue-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {allRequiredFilled && (
              <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Ready</span>
              </div>
            )}
          </div>

          <button
            data-testid="button-decline-signing"
            onClick={() => setShowDeclineModal(true)}
            className="text-white/40 hover:text-red-400 hover:bg-red-500/10 shrink-0 px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Decline</span>
          </button>
        </div>
      </header>

      {/* Document Viewer with Continuous Scroll */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-white/5">
          <div className="flex items-center gap-1">
            <button data-testid="button-zoom-out" onClick={() => setZoom(z => Math.max(0.5, z - 0.15))} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span data-testid="text-zoom-level" className="text-xs text-white/40 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button data-testid="button-zoom-in" onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="text-sm text-white/50">
            {totalPages} page{totalPages > 1 ? 's' : ''}
          </div>

          <div className="flex items-center gap-1 text-xs text-white/30">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Secure</span>
          </div>
        </div>

        {/* PDF Container - Continuous Scroll */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-slate-800/50 py-2 px-1 sm:py-4 sm:px-4"
        >
          {pdfLoading ? (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              <p className="text-white/40 text-sm">Loading document...</p>
            </div>
          ) : pdfError ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 max-w-md mx-auto text-center px-4">
              <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <p className="text-white/90 font-medium mb-1">Unable to load document</p>
                <p className="text-white/40 text-sm">{pdfError}</p>
              </div>
              <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition-colors flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Try Again
              </button>
            </div>
          ) : pdfDocument ? (
            <div className="flex flex-col items-center gap-5">
              {/* Render all pages */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={`${renderKey}-${pageNum}`} className="relative shadow-lg rounded-sm bg-white dark:bg-slate-900">
                  <canvas
                    ref={(el) => {
                      if (el) {
                        canvasRefs.current[pageNum] = el;
                        mountedCanvasCount.current++;
                        // Trigger rendering when all canvases are mounted
                        if (mountedCanvasCount.current >= totalPages && !canvasesReady) {
                          console.log('[SigningPage] All canvases mounted:', mountedCanvasCount.current);
                          // Use requestAnimationFrame to ensure DOM is ready
                          requestAnimationFrame(() => {
                            setCanvasesReady(true);
                          });
                        }
                      }
                    }}
                    className="block"
                  />

                  {/* Field Overlays for this page */}
                  {assignedFields
                    .filter(f => f.page === pageNum)
                    .map((field) => {
                      const isFilled = !!filledFields[field.id];
                      const isCurrentField = currentField?.id === field.id && !isFilled;
                      const Icon = getFieldIcon(field.type);

                      // Enhanced: Animate field completion
                      const showCompleteAnim = justCompletedField === field.id;

                      // Enhanced: Animate auto-advance
                      const showAutoAdvanceAnim = isAutoAdvancing && isCurrentField;

                      return (
                        <div
                          key={field.id}
                          ref={(el) => { fieldRefs.current[field.id] = el; }}
                          data-testid={`signing-field-${field.type}-${field.id}`}
                          className={`absolute transition-all duration-200 overflow-hidden box-border ${isFilled ? '' : 'cursor-pointer'} ${showCompleteAnim ? 'z-50 animate-field-complete' : ''} ${showAutoAdvanceAnim ? 'animate-auto-advance' : ''}`}
                          style={{
                            left: field.x * zoom,
                            top: field.y * zoom,
                            width: field.width * zoom,
                            height: field.height * zoom,
                          }}
                          onClick={() => handleFieldClick(field)}
                        >
                          {isFilled ? (
                            <div className="w-full h-full relative rounded-md bg-white/60 backdrop-blur-[1px]">
                              {SIGNATURE_FIELDS.includes(field.type) && (
                                <img src={filledFields[field.id]} alt="Signature" className="w-full h-full object-contain" />
                              )}
                              {(DATE_FIELDS.includes(field.type) || TEXT_FIELDS.includes(field.type)) && (() => {
                                const boxW = field.width * zoom;
                                const boxH = field.height * zoom;
                                const text = filledFields[field.id] || '';
                                const maxByHeight = Math.max(8, boxH * 0.65);
                                const charW = text.length * 0.6;
                                const maxByWidth = charW > 0 ? Math.max(6, (boxW - 8) / charW) : maxByHeight;
                                const autoSize = Math.min(maxByHeight, maxByWidth, 16 * zoom);
                                return (
                                  <div
                                    className="w-full h-full flex items-center px-1 text-slate-800 dark:text-slate-100 font-medium overflow-hidden whitespace-nowrap"
                                    style={{ fontSize: `${Math.max(6, autoSize)}px` }}
                                  >
                                    <span className="truncate">{text}</span>
                                  </div>
                                );
                              })()}
                              {UPLOAD_FIELDS.includes(field.type) && (
                                <div
                                  className="w-full h-full flex items-center gap-1.5 px-2 bg-emerald-50/90 border border-emerald-300 rounded-md text-emerald-700 font-medium overflow-hidden cursor-pointer hover:bg-emerald-100 dark:bg-emerald-900/40/90 transition-colors"
                                  style={{ fontSize: `${Math.max(10, 11 * zoom)}px` }}
                                  onClick={() => handleFieldClick(field)}
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{filledFields[field.id]}</span>
                                </div>
                              )}
                              {RADIO_FIELDS.includes(field.type) && (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="w-4 h-4 rounded-full border-2 border-fuchsia-500 flex items-center justify-center bg-white">
                                    <div className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
                                  </div>
                                </div>
                              )}
                              {DROPDOWN_FIELDS.includes(field.type) && (() => {
                                const boxW = field.width * zoom;
                                const boxH = field.height * zoom;
                                const text = filledFields[field.id] || '';
                                const maxByHeight = Math.max(8, boxH * 0.65);
                                const charW = text.length * 0.6;
                                const maxByWidth = charW > 0 ? Math.max(6, (boxW - 8) / charW) : maxByHeight;
                                const autoSize = Math.min(maxByHeight, maxByWidth, 16 * zoom);
                                return (
                                  <div
                                    className="w-full h-full flex items-center px-1 text-slate-800 dark:text-slate-100 font-medium overflow-hidden whitespace-nowrap"
                                    style={{ fontSize: `${Math.max(6, autoSize)}px` }}
                                  >
                                    <span className="truncate">{text}</span>
                                  </div>
                                );
                              })()}
                              {PAYMENT_FIELDS.includes(field.type) && (() => {
                                const boxW = field.width * zoom;
                                const boxH = field.height * zoom;
                                const text = `${CURRENCY_SYMBOLS[field.currency || 'USD']}${filledFields[field.id]}`;
                                const maxByHeight = Math.max(8, boxH * 0.65);
                                const charW = text.length * 0.6;
                                const maxByWidth = charW > 0 ? Math.max(6, (boxW - 8) / charW) : maxByHeight;
                                const autoSize = Math.min(maxByHeight, maxByWidth, 16 * zoom);
                                return (
                                  <div
                                    className="w-full h-full flex items-center px-1 text-green-700 font-semibold overflow-hidden whitespace-nowrap"
                                    style={{ fontSize: `${Math.max(6, autoSize)}px` }}
                                  >
                                    <span className="truncate">{text}</span>
                                  </div>
                                );
                              })()}
                              {!RADIO_FIELDS.includes(field.type) && (
                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                  <Check className="h-2.5 w-2.5 text-white" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              className={`h-full rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold transition-all duration-200 shadow-sm ${
                                SIGNATURE_FIELDS.includes(field.type)
                                  ? 'bg-amber-50/95 border-2 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 hover:shadow-md hover:shadow-amber-200/40'
                                  : DATE_FIELDS.includes(field.type)
                                    ? 'bg-sky-50/95 border-2 border-sky-400 text-sky-800 hover:bg-sky-100 hover:shadow-md hover:shadow-sky-200/40'
                                    : UPLOAD_FIELDS.includes(field.type)
                                      ? 'bg-orange-50/95 border-2 border-orange-400 text-orange-800 hover:bg-orange-100 hover:shadow-md hover:shadow-orange-200/40'
                                      : RADIO_FIELDS.includes(field.type)
                                        ? 'bg-fuchsia-50/95 border-2 border-fuchsia-400 text-fuchsia-800 hover:bg-fuchsia-100 hover:shadow-md hover:shadow-fuchsia-200/40'
                                        : DROPDOWN_FIELDS.includes(field.type)
                                          ? 'bg-sky-50/95 border-2 border-sky-400 text-sky-700 hover:bg-sky-100 hover:shadow-md hover:shadow-sky-200/40'
                                          : PAYMENT_FIELDS.includes(field.type)
                                            ? 'bg-green-50/95 border-2 border-green-400 text-green-700 hover:bg-green-100 hover:shadow-md hover:shadow-green-200/40'
                                            : 'bg-violet-50/95 border-2 border-violet-400 text-violet-800 hover:bg-violet-100 hover:shadow-md hover:shadow-violet-200/40'
                              } ${isCurrentField ? 'ring-2 ring-offset-2 ring-blue-500 animate-subtle-pulse shadow-lg shadow-blue-200/50 scale-[1.03]' : ''}`}
                            >
                              {RADIO_FIELDS.includes(field.type) ? (
                                <div className="w-4 h-4 rounded-full border-2 border-fuchsia-400 bg-white" />
                              ) : (
                                <>
                                  <Icon className="h-3.5 w-3.5" />
                                  <span style={{ fontSize: Math.max(10, 11 * zoom) }}>
                                    {getFieldTagLabel(field.type)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <FileText className="h-12 w-12 text-white/15" />
              <p className="text-white/30">No document</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-white/5 shadow-lg safe-bottom">
        {/* Floating "Fill In" guided navigation button */}
        {!allRequiredFilled && nextUnfilledField && showFillInGuide && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-12 z-50">
            <button
              className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/30 border border-blue-400/30 hover:bg-blue-500 transition-all animate-float-bounce text-sm"
              onClick={handleFillInClick}
              style={{ minWidth: 160 }}
            >
              <MousePointer2 className="h-4 w-4" />
              <span className="truncate">Fill In: {getFieldTagLabel(nextUnfilledField.type)}</span>
              <ArrowRight className="h-4 w-4 animate-bounce shrink-0" />
            </button>
          </div>
        )}

        {/* Guidance Banner */}
        {!allRequiredFilled && currentField && !filledFields[currentField.id] && (
          <div className="flex items-center justify-center gap-2 py-1.5 sm:py-2 px-3 sm:px-4 bg-amber-500/10 border-b border-amber-500/10 text-xs sm:text-sm text-amber-300">
            <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">
              {SIGNATURE_FIELDS.includes(currentField.type) && 'Tap the highlighted field to sign'}
              {DATE_FIELDS.includes(currentField.type) && 'Tap the highlighted field to add date'}
              {TEXT_FIELDS.includes(currentField.type) && `Tap the field to enter your ${currentField.type}`}
              {UPLOAD_FIELDS.includes(currentField.type) && 'Tap the highlighted field to upload'}
              {RADIO_FIELDS.includes(currentField.type) && 'Tap to select this option'}
              {DROPDOWN_FIELDS.includes(currentField.type) && 'Tap to choose from the list'}
              {PAYMENT_FIELDS.includes(currentField.type) && 'Tap to enter the amount'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-bounce shrink-0" />
          </div>
        )}

        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 gap-2 sm:gap-3">
          {/* Progress Indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-[40%] sm:max-w-[40%]">
            <span className="text-xs text-white/50 font-medium">
              {filledRequiredCount} of {requiredFields.length}
            </span>
            <span className="text-xs text-white/30 font-medium">
              ({Math.round(progress)}%)
            </span>
            <div className="flex items-center gap-1.5">
              {requiredFields.map((field) => {
                const isFilled = !!filledFields[field.id];
                const isCurrent = currentField?.id === field.id && !isFilled;
                return (
                  <button
                    key={field.id}
                    onClick={() => {
                      setCurrentFieldIndex(assignedFields.findIndex(f => f.id === field.id));
                      scrollToField(field.id);
                    }}
                    className={`h-2.5 rounded-full transition-all ${
                      isFilled
                        ? 'bg-emerald-400 w-2.5'
                        : isCurrent
                          ? 'bg-amber-400 w-5'
                          : 'bg-white/15 hover:bg-white/25 w-2.5'
                    }`}
                    title={`${field.label} ${isFilled ? '(completed)' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Main Action */}
          {allRequiredFilled ? (
            <Button
              onClick={handleComplete}
              disabled={completing}
              className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              {completing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finishing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Finish Signing
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (currentField && !filledFields[currentField.id]) {
                  handleFieldClick(currentField);
                }
              }}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              {currentField && SIGNATURE_FIELDS.includes(currentField.type) && (
                <>
                  <PenTool className="mr-2 h-4 w-4" />
                  {currentField.type === 'signature' ? 'Sign' : 'Initial'}
                </>
              )}
              {currentField && DATE_FIELDS.includes(currentField.type) && (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Add Date
                </>
              )}
              {currentField && TEXT_FIELDS.includes(currentField.type) && (
                <>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Fill {currentField.type.charAt(0).toUpperCase() + currentField.type.slice(1)}
                </>
              )}
              {currentField && UPLOAD_FIELDS.includes(currentField.type) && (
                <>
                  <Paperclip className="mr-2 h-4 w-4" />
                  Upload Document
                </>
              )}
              {!currentField && 'Next'}
            </Button>
          )}
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg signing-glass-card-solid rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-lg font-semibold text-white">
                {currentField?.type === 'initials' ? 'Add Your Initials' : 'Add Your Signature'}
              </h3>
              <button onClick={() => { setShowSignatureModal(false); setHasDrawn(false); }} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex border-b border-white/5">
              {(['draw', 'type'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSignatureMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                    signatureMode === mode
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {mode === 'draw' && <PenTool className="h-4 w-4" />}
                  {mode === 'type' && <Type className="h-4 w-4" />}
                  <span className="capitalize">{mode}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {signatureMode === 'draw' && (
                <div className="space-y-4">
                  <div className="relative rounded-xl border-2 border-dashed border-white/10 overflow-hidden">
                    <canvas
                      ref={signatureCanvasRef}
                      width={400}
                      height={currentField?.type === 'initials' ? 80 : 120}
                      className="w-full touch-none bg-white"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    <div className="absolute bottom-4 left-8 right-8 h-px bg-slate-300" />
                    {!hasDrawn && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-slate-400 text-sm">
                          {currentField?.type === 'initials' ? 'Initial here' : 'Sign here'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-start">
                    <button onClick={clearSignature} className="text-white/40 hover:text-white/70 text-sm flex items-center gap-1.5 transition-colors">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {signatureMode === 'type' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
                    <input
                      type="text"
                      value={typedSignature}
                      onChange={(e) => setTypedSignature(e.target.value)}
                      placeholder={currentField?.type === 'initials' ? 'Your initials' : 'Type your name'}
                      className="w-full bg-transparent border-none text-center text-2xl text-white placeholder:text-white/20 focus:outline-none"
                      style={{ fontFamily: "'Dancing Script', cursive" }}
                    />
                    <div className="mt-3 h-px bg-white/10 mx-4" />
                  </div>
                  <p className="text-xs text-white/30 text-center">
                    Your {currentField?.type === 'initials' ? 'initials' : 'name'} will appear as a signature
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 pb-5">
              <button
                data-testid="button-adopt-sign"
                onClick={handleSignatureAdopt}
                disabled={(signatureMode === 'draw' && !hasDrawn) || (signatureMode === 'type' && !typedSignature.trim())}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium disabled:opacity-30 transition-all"
              >
                Adopt and Sign
              </button>
              <p className="mt-3 text-xs text-white/25 text-center">
                By clicking, you agree this is your legal signature
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Text Field Input Modal */}
      {editingTextFieldId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md signing-glass-card-solid rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-lg font-semibold text-white">
                {assignedFields.find(f => f.id === editingTextFieldId)?.label || 'Enter Value'}
              </h3>
              <button onClick={() => { setEditingTextFieldId(null); setTextInputValue(''); }} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              <input
                ref={textInputRef}
                type={assignedFields.find(f => f.id === editingTextFieldId)?.type === 'email' ? 'email' : 'text'}
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder={assignedFields.find(f => f.id === editingTextFieldId)?.placeholder || 'Enter value'}
                className="w-full h-12 px-4 text-lg bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTextFieldSave();
                }}
              />
            </div>

            <div className="px-5 pb-5">
              <button
                data-testid="button-save-text-field"
                onClick={handleTextFieldSave}
                disabled={!textInputValue.trim()}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium disabled:opacity-30 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Picker Modal */}
      {showDropdownFieldId && (() => {
        const dropdownField = assignedFields.find(f => f.id === showDropdownFieldId);
        if (!dropdownField) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="w-full max-w-md signing-glass-card-solid rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <h3 className="text-lg font-semibold text-white">
                  {dropdownField.label || 'Select an Option'}
                </h3>
                <button onClick={() => setShowDropdownFieldId(null)} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
                {(dropdownField.options || []).map((option, idx) => (
                  <button
                    key={idx}
                    data-testid={`button-dropdown-option-${idx}`}
                    onClick={() => {
                      setFilledFields(prev => ({ ...prev, [showDropdownFieldId]: option }));
                      setJustCompletedField(showDropdownFieldId);
                      setShowDropdownFieldId(null);
                      advanceToNextField();
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                  >
                    {option}
                  </button>
                ))}
                {(!dropdownField.options || dropdownField.options.length === 0) && (
                  <p className="text-center text-white/30 py-4 text-sm">No options available</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment Input Modal */}
      {editingPaymentFieldId && (() => {
        const paymentField = assignedFields.find(f => f.id === editingPaymentFieldId);
        if (!paymentField) return null;
        const currencySymbol = CURRENCY_SYMBOLS[paymentField.currency || 'USD'];
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="w-full max-w-md signing-glass-card-solid rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <h3 className="text-lg font-semibold text-white">
                  Enter Amount ({paymentField.currency || 'USD'})
                </h3>
                <button onClick={() => { setEditingPaymentFieldId(null); setPaymentInputValue(''); }} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-white/60">{currencySymbol}</span>
                  <input
                    type="number"
                    value={paymentInputValue}
                    onChange={(e) => setPaymentInputValue(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="flex-1 h-14 px-4 text-2xl font-semibold bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && paymentInputValue.trim()) {
                        const formatted = parseFloat(paymentInputValue).toFixed(paymentField.currency === 'JPY' ? 0 : 2);
                        setFilledFields(prev => ({ ...prev, [editingPaymentFieldId]: formatted }));
                        setJustCompletedField(editingPaymentFieldId);
                        setEditingPaymentFieldId(null);
                        setPaymentInputValue('');
                        advanceToNextField();
                      }
                    }}
                  />
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  data-testid="button-save-payment-field"
                  onClick={() => {
                    if (paymentInputValue.trim()) {
                      const formatted = parseFloat(paymentInputValue).toFixed(paymentField.currency === 'JPY' ? 0 : 2);
                      setFilledFields(prev => ({ ...prev, [editingPaymentFieldId]: formatted }));
                      setJustCompletedField(editingPaymentFieldId);
                      setEditingPaymentFieldId(null);
                      setPaymentInputValue('');
                      advanceToNextField();
                    }
                  }}
                  disabled={!paymentInputValue.trim()}
                  className="w-full h-11 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-xl font-medium disabled:opacity-30 transition-all"
                >
                  Save Amount
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upload Modal */}
      {showUploadModal && uploadingFieldId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg signing-glass-card-solid rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-lg font-semibold text-white">
                Upload Documents
              </h3>
              <button onClick={handleCloseUploadModal} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div
                className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-blue-400/40 hover:bg-blue-500/5 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                    <span className="text-sm text-white/50">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-12 w-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-white/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/70">Click to upload files</p>
                      <p className="text-xs text-white/30 mt-1">PDF, JPG, PNG, GIF, WebP, DOC, DOCX (max 10MB each)</p>
                    </div>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadedFiles.filter(f => f.fieldId === uploadingFieldId).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/30 uppercase tracking-wide">Uploaded Files</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uploadedFiles.filter(f => f.fieldId === uploadingFieldId).map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-lg border border-white/5"
                      >
                        <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{file.fileName}</p>
                          <p className="text-xs text-white/30">{formatFileSize(file.fileSize)}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteUpload(file.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 shrink-0 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-white/25 text-center">
                Uploaded documents will be attached to the completion email
              </p>
            </div>

            <div className="px-5 pb-5">
              <button
                onClick={handleCloseUploadModal}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium transition-all"
              >
                {uploadedFiles.filter(f => f.fieldId === uploadingFieldId).length > 0 ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="signing-glass-card-solid rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Decline to sign?</h3>
            </div>
            <p className="text-white/50 text-sm mb-4">
              The sender will be notified that you declined to sign this document.
            </p>
            <textarea
              data-testid="input-decline-reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Reason for declining (optional)"
              rows={3}
              className="w-full mb-4 px-3 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-transparent resize-none"
            />
            <div className="flex gap-3">
              <button data-testid="button-cancel-decline" onClick={() => { setShowDeclineModal(false); setDeclineReason(''); }} disabled={decliningInProgress} className="flex-1 h-10 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 text-sm font-medium transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button data-testid="button-confirm-decline" onClick={handleDecline} disabled={decliningInProgress} className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {decliningInProgress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {decliningInProgress ? 'Declining...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap');

        @keyframes subtle-pulse {
          0%, 100% { opacity: 1; transform: scale(1.03); }
          50% { opacity: 0.9; transform: scale(1); }
        }

        .animate-subtle-pulse {
          animation: subtle-pulse 1.8s ease-in-out infinite;
        }

        @keyframes field-complete {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); transform: scale(1); }
          50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.15); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); transform: scale(1); }
        }
        .animate-field-complete {
          animation: field-complete 0.5s cubic-bezier(0.4,0,0.2,1);
        }

        @keyframes float-bounce {
          0%, 100% { transform: translateY(0) translateX(-50%); }
          50% { transform: translateY(-6px) translateX(-50%); }
        }
        .animate-float-bounce {
          animation: float-bounce 1.5s ease-in-out infinite;
        }

        @keyframes auto-advance {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.08); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .animate-auto-advance {
          animation: auto-advance 0.4s cubic-bezier(0.4,0,0.2,1);
        }
      `}</style>
    </div>
  );
}
