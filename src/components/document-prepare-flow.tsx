"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  FileText,
  User,
  Mail,
  Plus,
  X,
  Send,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  PenTool,
  Calendar,
  Type,
  Hash,
  Trash2,
  GripVertical,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronDown,
  Users,
  FileCheck,
  Eye,
  Edit3,
  Paperclip,
  Phone,
  Shield,
  Undo2,
  Redo2,
  Circle,
  List,
  DollarSign,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Envelope } from "@/lib/api-client";
import * as pdfjsLib from 'pdfjs-dist';
import { usePinchZoom, pinchZoomStyles } from "@/hooks/use-pinch-zoom";
import { useFieldHistory } from "@/hooks/use-field-history";
import { contentToPdf, pdfBytesToBase64 } from "@/lib/html-to-pdf";
import { cn } from "@/lib/utils";

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface DocumentPrepareFlowProps {
  onClose: () => void;
  onSuccess?: (envelope: Envelope) => void;
  initialFile?: File;
  initialContent?: { content: string; title: string };
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'cc';
  require2FA?: boolean;
  phoneNumber?: string;
}

// Get color for recipient based on their position in the list
const getRecipientColor = (index: number) => RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];

interface SignatureField {
  id: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'name' | 'email' | 'company' | 'title' | 'upload' | 'checkbox' | 'radio' | 'dropdown' | 'payment';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  recipientId: string;
  required: boolean;
  prefillValue?: string;
  placeholder?: string;
  groupId?: string;
  groupLabel?: string;
  acceptedFileTypes?: string;
  maxFiles?: number;
  options?: string[];
  currency?: string;
}

// Resize handle types: corners + edges
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

// Field size constraints (especially important for signature fields)
const FIELD_SIZE_CONSTRAINTS: Record<SignatureField['type'], { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }> = {
  signature: { minWidth: 120, maxWidth: 400, minHeight: 40, maxHeight: 120 },
  initials: { minWidth: 40, maxWidth: 150, minHeight: 30, maxHeight: 80 },
  text: { minWidth: 60, maxWidth: 500, minHeight: 24, maxHeight: 100 },
  email: { minWidth: 100, maxWidth: 400, minHeight: 24, maxHeight: 40 },
  date: { minWidth: 80, maxWidth: 200, minHeight: 24, maxHeight: 40 },
  name: { minWidth: 100, maxWidth: 400, minHeight: 24, maxHeight: 40 },
  checkbox: { minWidth: 18, maxWidth: 40, minHeight: 18, maxHeight: 40 },
  company: { minWidth: 100, maxWidth: 400, minHeight: 24, maxHeight: 60 },
  title: { minWidth: 100, maxWidth: 300, minHeight: 24, maxHeight: 40 },
  upload: { minWidth: 120, maxWidth: 400, minHeight: 60, maxHeight: 200 },
  radio: { minWidth: 18, maxWidth: 40, minHeight: 18, maxHeight: 40 },
  dropdown: { minWidth: 120, maxWidth: 400, minHeight: 28, maxHeight: 48 },
  payment: { minWidth: 100, maxWidth: 300, minHeight: 28, maxHeight: 48 },
};

type Step = 'upload' | 'recipients' | 'fields' | 'review';

// Recipient colors for field assignment
const RECIPIENT_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
];

const generateDemoId = () => `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const createDemoEnvelope = (title: string, message: string, recipients: Recipient[], fields: SignatureField[]): Envelope => ({
  id: generateDemoId(),
  title,
  description: message,
  status: 'in_signing',
  signingOrder: 'sequential',
  organizationId: 'demo-org',
  createdBy: 'demo-user',
  recipients: recipients.filter(r => r.name && r.email).map((r, index) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: 'sent' as const,
    signingOrder: index + 1,
  })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  metadata: {
    documentCount: 1,
    recipientCount: recipients.filter(r => r.name && r.email).length,
  },
});

// Import enhanced field editor components
import {
  AlignmentGuidesRenderer,
  calculateAlignmentGuides,
  snapToGuides,
  type AlignmentGuide,
} from "@/components/enhanced-field-editor";

type FieldGroup = 'signature' | 'data' | 'other';

interface FieldTypeConfig {
  type: SignatureField['type'];
  label: string;
  icon: typeof PenTool;
  width: number;
  height: number;
  color: string;
  bgLight: string;
  bgCanvas: string;
  bgCanvasSelected: string;
  borderCanvas: string;
  textCanvas: string;
  group: FieldGroup;
  hasSubMenu?: boolean;
}

const FIELD_TYPE_CONFIG: FieldTypeConfig[] = [
  { type: 'signature', label: 'Signature', icon: PenTool, width: 200, height: 60, color: '#2563eb', bgLight: 'bg-blue-50 dark:bg-blue-950/50', bgCanvas: 'rgba(37,99,235,0.06)', bgCanvasSelected: 'rgba(37,99,235,0.12)', borderCanvas: '#3b82f6', textCanvas: '#1d4ed8', group: 'signature' },
  { type: 'initials', label: 'Initials', icon: Type, width: 80, height: 50, color: '#2563eb', bgLight: 'bg-blue-50 dark:bg-blue-950/50', bgCanvas: 'rgba(37,99,235,0.06)', bgCanvasSelected: 'rgba(37,99,235,0.12)', borderCanvas: '#3b82f6', textCanvas: '#1d4ed8', group: 'signature' },
  { type: 'date', label: 'Date Signed', icon: Calendar, width: 150, height: 32, color: '#ea580c', bgLight: 'bg-orange-50 dark:bg-orange-950/50', bgCanvas: 'rgba(234,88,12,0.06)', bgCanvasSelected: 'rgba(234,88,12,0.12)', borderCanvas: '#f97316', textCanvas: '#c2410c', group: 'data' },
  { type: 'name', label: 'Full Name', icon: User, width: 200, height: 32, color: '#7c3aed', bgLight: 'bg-violet-50 dark:bg-violet-950/50', bgCanvas: 'rgba(124,58,237,0.06)', bgCanvasSelected: 'rgba(124,58,237,0.12)', borderCanvas: '#8b5cf6', textCanvas: '#6d28d9', group: 'data' },
  { type: 'email', label: 'Email', icon: Mail, width: 220, height: 32, color: '#059669', bgLight: 'bg-emerald-50 dark:bg-emerald-950/50', bgCanvas: 'rgba(5,150,105,0.06)', bgCanvasSelected: 'rgba(5,150,105,0.12)', borderCanvas: '#10b981', textCanvas: '#047857', group: 'data' },
  { type: 'company', label: 'Company', icon: FileText, width: 200, height: 32, color: '#4f46e5', bgLight: 'bg-indigo-50 dark:bg-indigo-950/50', bgCanvas: 'rgba(79,70,229,0.06)', bgCanvasSelected: 'rgba(79,70,229,0.12)', borderCanvas: '#6366f1', textCanvas: '#4338ca', group: 'data' },
  { type: 'title', label: 'Job Title', icon: Edit3, width: 180, height: 32, color: '#7c3aed', bgLight: 'bg-purple-50 dark:bg-purple-950/50', bgCanvas: 'rgba(124,58,237,0.06)', bgCanvasSelected: 'rgba(124,58,237,0.12)', borderCanvas: '#a78bfa', textCanvas: '#6d28d9', group: 'data' },
  { type: 'text', label: 'Text Field', icon: Type, width: 200, height: 32, color: '#6b7280', bgLight: 'bg-gray-50 dark:bg-gray-800/50', bgCanvas: 'rgba(107,114,128,0.06)', bgCanvasSelected: 'rgba(107,114,128,0.12)', borderCanvas: '#9ca3af', textCanvas: '#4b5563', group: 'other', hasSubMenu: true },
  { type: 'checkbox', label: 'Checkbox', icon: CheckCircle2, width: 24, height: 24, color: '#0d9488', bgLight: 'bg-teal-50 dark:bg-teal-950/50', bgCanvas: 'rgba(13,148,136,0.06)', bgCanvasSelected: 'rgba(13,148,136,0.12)', borderCanvas: '#14b8a6', textCanvas: '#0f766e', group: 'other' },
  { type: 'radio', label: 'Radio Button', icon: Circle, width: 24, height: 24, color: '#d946ef', bgLight: 'bg-fuchsia-50 dark:bg-fuchsia-950/50', bgCanvas: 'rgba(217,70,239,0.06)', bgCanvasSelected: 'rgba(217,70,239,0.12)', borderCanvas: '#d946ef', textCanvas: '#a21caf', group: 'other' },
  { type: 'dropdown', label: 'Dropdown', icon: List, width: 200, height: 32, color: '#0284c7', bgLight: 'bg-sky-50 dark:bg-sky-950/50', bgCanvas: 'rgba(2,132,199,0.06)', bgCanvasSelected: 'rgba(2,132,199,0.12)', borderCanvas: '#0ea5e9', textCanvas: '#0369a1', group: 'other' },
  { type: 'payment', label: 'Payment', icon: DollarSign, width: 160, height: 32, color: '#16a34a', bgLight: 'bg-green-50 dark:bg-green-950/50', bgCanvas: 'rgba(22,163,74,0.06)', bgCanvasSelected: 'rgba(22,163,74,0.12)', borderCanvas: '#22c55e', textCanvas: '#15803d', group: 'other' },
  { type: 'upload', label: 'File Upload', icon: Paperclip, width: 200, height: 60, color: '#0891b2', bgLight: 'bg-cyan-50 dark:bg-cyan-950/50', bgCanvas: 'rgba(8,145,178,0.06)', bgCanvasSelected: 'rgba(8,145,178,0.12)', borderCanvas: '#06b6d4', textCanvas: '#0e7490', group: 'other' },
];

const FIELD_GROUPS: { key: FieldGroup; label: string }[] = [
  { key: 'signature', label: 'Signing' },
  { key: 'data', label: 'Contact Info' },
  { key: 'other', label: 'Other' },
];

const LOCAL_FIELD_TYPES = FIELD_TYPE_CONFIG;

export function DocumentPrepareFlow({ onClose, onSuccess, initialFile, initialContent }: DocumentPrepareFlowProps) {
  const [step, setStep] = useState<Step>(initialFile || initialContent ? 'recipients' : 'upload');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentEnvelope, setSentEnvelope] = useState<Envelope | null>(null);

  // Document state
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);
  const [title, setTitle] = useState(
    initialContent?.title || initialFile?.name.replace(/\.[^/.]+$/, "") || ""
  );
  const [generatedContent, setGeneratedContent] = useState<string | null>(initialContent?.content || null);
  const [message, setMessage] = useState("");
  const [expirationDays, setExpirationDays] = useState<number>(30); // Default 30 days
  const [enableReminders, setEnableReminders] = useState(true);

  // Recipients state
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', name: '', email: '', role: 'signer' }
  ]);

  // Contact history state
  interface Contact {
    id: string;
    name: string;
    email: string;
    company?: string;
    title?: string;
    useCount: number;
  }
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<Contact[]>([]);
  const [activeInputId, setActiveInputId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Signature fields state
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<SignatureField['type']>('signature');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('1');
  const [editingField, setEditingField] = useState<string | null>(null);

  // PDF rendering state
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Resizing state - updated for edge handles
  const [resizingField, setResizingField] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, fieldX: 0, fieldY: 0 });

  // Enhanced field placement state
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // Text field configuration state for sub-menu
  const [textFieldConfig, setTextFieldConfig] = useState<Partial<SignatureField>>({});

  // Undo/Redo history for fields
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    handleFieldsChange: historyFieldsChange,
  } = useFieldHistory({
    fields,
    onFieldsChange: setFields,
    enableKeyboardShortcuts: true,
    containerRef: editorRef,
  });

  // Pinch-to-zoom for mobile devices
  const { touchHandlers } = usePinchZoom({
    minScale: 0.5,
    maxScale: 2,
    currentScale: zoom,
    onZoomChange: setZoom,
  });

  // Fetch contact history on mount
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await fetch('/api/contacts?limit=20');
        if (response.ok) {
          const data = await response.json();
          setContacts(data.contacts || []);
        }
      } catch (error) {
        console.error('Failed to fetch contacts:', error);
      }
    };
    fetchContacts();
  }, []);

  // Search contacts as user types
  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setContactSuggestions(contacts.slice(0, 5));
      return;
    }

    try {
      const response = await fetch(`/api/contacts?q=${encodeURIComponent(query)}&limit=5`);
      if (response.ok) {
        const data = await response.json();
        setContactSuggestions(data.contacts || []);
      }
    } catch (error) {
      // Fallback to local filtering
      const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.email.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      setContactSuggestions(filtered);
    }
  }, [contacts]);

  // Save contacts after successful send
  const saveContacts = async (recipientList: Recipient[]) => {
    try {
      const validContacts = recipientList
        .filter(r => r.name && r.email)
        .map(r => ({ name: r.name, email: r.email }));

      if (validContacts.length > 0) {
        await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: validContacts }),
        });
      }
    } catch (error) {
      console.error('Failed to save contacts:', error);
    }
  };

  // Handle selecting a contact from suggestions
  const selectContact = (recipientId: string, contact: Contact) => {
    setRecipients(prev => prev.map(r =>
      r.id === recipientId
        ? { ...r, name: contact.name, email: contact.email }
        : r
    ));
    setShowSuggestions(false);
    setActiveInputId(null);
  };

  // Load PDF when on fields step (or generate from content)
  useEffect(() => {
    if (step !== 'fields') return;

    const loadPDF = async () => {
      try {
        setIsLoading(true);
        let pdfData: ArrayBuffer;

        if (selectedFile) {
          // Use uploaded file
          pdfData = await selectedFile.arrayBuffer();
        } else if (generatedContent) {
          // Generate PDF from text content
          console.log('[DocumentPrepare] Generating PDF from content for preview...');
          const pdfBytes = await contentToPdf(generatedContent, title || 'Document');
          // Create a proper ArrayBuffer copy
          pdfData = new ArrayBuffer(pdfBytes.length);
          new Uint8Array(pdfData).set(pdfBytes);
          console.log('[DocumentPrepare] Generated PDF size:', pdfBytes.length, 'bytes');
        } else {
          setIsLoading(false);
          return;
        }

        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);

        // Auto-fit zoom
        if (containerRef.current) {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.0 });
          const containerWidth = containerRef.current.clientWidth - 40;
          const fitZoom = Math.min(containerWidth / viewport.width, 1.2);
          setZoom(fitZoom);
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [selectedFile, step, generatedContent, title]);

  // Render PDF page with high-DPI support for crystal clear rendering
  useEffect(() => {
    // Only render in fields or review steps
    if (step !== 'fields' && step !== 'review') return;
    if (!pdfDocument || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdfDocument.getPage(currentPage);

      // Get device pixel ratio for high-DPI displays (Retina, etc.)
      const pixelRatio = window.devicePixelRatio || 1;

      // Use a higher scale for crisp rendering, then scale down with CSS
      // Minimum 2x for good quality, scale up more at higher zoom levels
      const renderScale = Math.max(2, zoom) * pixelRatio;

      const viewport = page.getViewport({ scale: zoom });
      const scaledViewport = page.getViewport({ scale: renderScale });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d', {
        alpha: false, // Disable alpha for better performance
      });
      if (!context) return;

      // Set canvas resolution to high-DPI size
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      // Scale canvas back down with CSS to display size
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      setPageWidth(viewport.width);
      setPageHeight(viewport.height);

      // Enable image smoothing for crisp rendering
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;
    };

    // Small delay to ensure canvas is mounted in DOM
    const timeoutId = setTimeout(renderPage, 100);
    return () => clearTimeout(timeoutId);
  }, [pdfDocument, currentPage, zoom, step]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const addRecipient = () => {
    const newId = String(Date.now());
    setRecipients([
      ...recipients,
      {
        id: newId,
        name: '',
        email: '',
        role: 'signer',
      }
    ]);
  };

  const moveRecipient = (index: number, direction: 'up' | 'down') => {
    const newRecipients = [...recipients];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= recipients.length) return;

    [newRecipients[index], newRecipients[newIndex]] = [newRecipients[newIndex], newRecipients[index]];
    setRecipients(newRecipients);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id));
      setFields(fields.filter(f => f.recipientId !== id));
    }
  };

  const updateRecipient = (id: string, field: keyof Recipient, value: string | boolean) => {
    setRecipients(recipients.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    ));
  };

  // Field mapping functions - updated for history
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Close edit panel when clicking canvas (click-away behavior)
    if (editingField) {
      setEditingField(null);
      return;
    }

    if (!containerRef.current || draggingField) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const fieldConfig = LOCAL_FIELD_TYPES.find(f => f.type === selectedFieldType);
    if (!fieldConfig) return;

    // Apply any pre-configured options for text fields
    const additionalConfig = selectedFieldType === 'text' && textFieldConfig
      ? {
          placeholder: textFieldConfig.placeholder || `Enter ${fieldConfig.label.toLowerCase()}`,
          prefillValue: textFieldConfig.prefillValue || '',
          required: textFieldConfig.required !== undefined ? textFieldConfig.required : true,
        }
      : {
          placeholder: `Enter ${fieldConfig.label.toLowerCase()}`,
          prefillValue: '',
          required: selectedFieldType === 'signature' || selectedFieldType === 'initials',
        };

    const newField: SignatureField = {
      id: generateDemoId(),
      type: selectedFieldType,
      x: Math.max(0, x - fieldConfig.width / 2),
      y: Math.max(0, y - fieldConfig.height / 2),
      width: fieldConfig.width,
      height: fieldConfig.height,
      page: currentPage,
      recipientId: selectedRecipientId,
      groupId: (selectedFieldType === 'checkbox' || selectedFieldType === 'radio') ? `group-${Date.now()}` : undefined,
      options: selectedFieldType === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : selectedFieldType === 'radio' ? undefined : undefined,
      currency: selectedFieldType === 'payment' ? 'USD' : undefined,
      ...additionalConfig,
    };

    historyFieldsChange([...fields, newField], `add ${selectedFieldType} field`);

    // Clear text field config after use
    if (selectedFieldType === 'text') {
      setTextFieldConfig({});
    }
  };

  const getCheckboxGroup = (groupId: string | undefined) => {
    if (!groupId) return [];
    return fields.filter(f => f.groupId === groupId);
  };

  const addAnotherCheckbox = (sourceField: SignatureField) => {
    const fieldConfig = LOCAL_FIELD_TYPES.find(f => f.type === 'checkbox');
    if (!fieldConfig) return;

    const groupCheckboxes = getCheckboxGroup(sourceField.groupId);
    const lastInGroup = groupCheckboxes.length > 0
      ? groupCheckboxes.reduce((prev, curr) => curr.y > prev.y || (curr.y === prev.y && curr.x > prev.x) ? curr : prev)
      : sourceField;

    const newField: SignatureField = {
      id: generateDemoId(),
      type: 'checkbox',
      x: lastInGroup.x,
      y: lastInGroup.y + 28,
      width: fieldConfig.width,
      height: fieldConfig.height,
      page: sourceField.page,
      recipientId: sourceField.recipientId,
      required: sourceField.required,
      prefillValue: '',
      placeholder: '',
      groupId: sourceField.groupId,
      groupLabel: sourceField.groupLabel,
    };

    historyFieldsChange([...fields, newField], 'add checkbox to group');
  };

  const addAnotherRadio = (sourceField: SignatureField) => {
    const fieldConfig = LOCAL_FIELD_TYPES.find(f => f.type === 'radio');
    if (!fieldConfig) return;

    const groupRadios = getCheckboxGroup(sourceField.groupId);
    const lastInGroup = groupRadios.length > 0
      ? groupRadios.reduce((prev, curr) => curr.y > prev.y || (curr.y === prev.y && curr.x > prev.x) ? curr : prev)
      : sourceField;

    const newField: SignatureField = {
      id: generateDemoId(),
      type: 'radio',
      x: lastInGroup.x,
      y: lastInGroup.y + 28,
      width: fieldConfig.width,
      height: fieldConfig.height,
      page: sourceField.page,
      recipientId: sourceField.recipientId,
      required: sourceField.required,
      prefillValue: '',
      placeholder: '',
      groupId: sourceField.groupId,
      groupLabel: sourceField.groupLabel,
    };

    historyFieldsChange([...fields, newField], 'add radio to group');
  };

  const toggleGroupRequired = (groupId: string) => {
    const group = getCheckboxGroup(groupId);
    if (group.length === 0) return;
    const newRequired = !group[0].required;
    historyFieldsChange(
      fields.map(f => f.groupId === groupId ? { ...f, required: newRequired } : f),
      'toggle group required'
    );
  };

  const updateGroupLabel = (groupId: string, label: string) => {
    historyFieldsChange(
      fields.map(f => f.groupId === groupId ? { ...f, groupLabel: label } : f),
      'update group label'
    );
  };

  const removeFromGroup = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field || !field.groupId) return;
    const remainingGroup = fields.filter(f => f.groupId === field.groupId && f.id !== fieldId);
    let updatedFields = fields.map(f => {
      if (f.id === fieldId) return { ...f, groupId: `solo-${Date.now()}`, groupLabel: undefined, required: false };
      return f;
    });
    if (remainingGroup.length === 1) {
      updatedFields = updatedFields.map(f =>
        f.id === remainingGroup[0].id ? { ...f, groupId: `solo-${Date.now()}-rem`, groupLabel: undefined } : f
      );
    }
    historyFieldsChange(updatedFields, 'remove from group');
  };

  const deleteCheckboxGroup = (groupId: string) => {
    historyFieldsChange(fields.filter(f => f.groupId !== groupId), 'delete checkbox group');
    setEditingField(null);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    if (editingField === fieldId) return;

    const field = fields.find(f => f.id === fieldId);
    if (!field || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setDraggingField(fieldId);
    setDragOffset({
      x: e.clientX - rect.left - field.x,
      y: e.clientY - rect.top - field.y,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingField || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const field = fields.find(f => f.id === draggingField);
    if (!field) return;

    let newX = e.clientX - rect.left - dragOffset.x;
    let newY = e.clientY - rect.top - dragOffset.y;

    newX = Math.max(0, Math.min(newX, pageWidth - field.width));
    newY = Math.max(0, Math.min(newY, pageHeight - field.height));

    const updatedField = { ...field, x: newX, y: newY };
    const isGroupedField = (field.type === 'checkbox' || field.type === 'radio') && field.groupId;
    const groupMembers = isGroupedField ? fields.filter(f => f.groupId === field.groupId && f.id !== field.id) : [];
    const otherFields = fields.filter(f => f.id !== draggingField && f.page === currentPage && (!isGroupedField || f.groupId !== field.groupId));

    const guides = calculateAlignmentGuides(updatedField, otherFields, pageWidth, pageHeight);
    setAlignmentGuides(guides);

    const snapped = snapToGuides(updatedField, guides);
    newX = Math.max(0, Math.min(snapped.x, pageWidth - field.width));
    newY = Math.max(0, Math.min(snapped.y, pageHeight - field.height));

    if (isGroupedField) {
      const allGroupFields = fields.filter(f => f.groupId === field.groupId);
      const groupMinX = Math.min(...allGroupFields.map(f => f.x));
      const groupMinY = Math.min(...allGroupFields.map(f => f.y));
      const groupMaxX = Math.max(...allGroupFields.map(f => f.x + f.width));
      const groupMaxY = Math.max(...allGroupFields.map(f => f.y + f.height));

      let deltaX = newX - field.x;
      let deltaY = newY - field.y;

      if (groupMinX + deltaX < 0) deltaX = -groupMinX;
      if (groupMinY + deltaY < 0) deltaY = -groupMinY;
      if (groupMaxX + deltaX > pageWidth) deltaX = pageWidth - groupMaxX;
      if (groupMaxY + deltaY > pageHeight) deltaY = pageHeight - groupMaxY;

      setFields(fields.map(f => {
        if (f.groupId === field.groupId) {
          return { ...f, x: f.x + deltaX, y: f.y + deltaY };
        }
        return f;
      }));
    } else {
      setFields(fields.map(f =>
        f.id === draggingField ? { ...f, x: newX, y: newY } : f
      ));
    }
  }, [draggingField, dragOffset, fields, pageWidth, pageHeight, currentPage]);

  const handleMouseUp = useCallback(() => {
    // If we were dragging or resizing, save to history
    if (draggingField) {
      historyFieldsChange(fields, 'move field');
    }
    if (resizingField) {
      historyFieldsChange(fields, 'resize field');
    }

    setDraggingField(null);
    setResizingField(null);
    setResizeHandle(null);
    setAlignmentGuides([]);
  }, [draggingField, resizingField, fields, historyFieldsChange]);

  // Handle resize with edge and corner support + constraints
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingField || !containerRef.current || !resizeHandle) return;

    const field = fields.find(f => f.id === resizingField);
    if (!field) return;

    const constraints = FIELD_SIZE_CONSTRAINTS[field.type];
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;

    let newX = resizeStart.fieldX;
    let newY = resizeStart.fieldY;
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;

    // Handle resize based on handle type
    if (resizeHandle.includes('e')) {
      newWidth = Math.max(constraints.minWidth, Math.min(constraints.maxWidth, resizeStart.width + deltaX));
    }
    if (resizeHandle.includes('w')) {
      const proposedWidth = resizeStart.width - deltaX;
      newWidth = Math.max(constraints.minWidth, Math.min(constraints.maxWidth, proposedWidth));
      newX = resizeStart.fieldX + (resizeStart.width - newWidth);
    }
    if (resizeHandle.includes('s')) {
      newHeight = Math.max(constraints.minHeight, Math.min(constraints.maxHeight, resizeStart.height + deltaY));
    }
    if (resizeHandle.includes('n')) {
      const proposedHeight = resizeStart.height - deltaY;
      newHeight = Math.max(constraints.minHeight, Math.min(constraints.maxHeight, proposedHeight));
      newY = resizeStart.fieldY + (resizeStart.height - newHeight);
    }

    // Clamp to page bounds
    newX = Math.max(0, Math.min(newX, pageWidth - newWidth));
    newY = Math.max(0, Math.min(newY, pageHeight - newHeight));

    setFields(fields.map(f =>
      f.id === resizingField
        ? { ...f, x: newX, y: newY, width: newWidth, height: newHeight }
        : f
    ));
  }, [resizingField, resizeHandle, resizeStart, fields, pageWidth, pageHeight]);

  useEffect(() => {
    if (draggingField) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingField, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (resizingField) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizingField, handleResizeMove, handleMouseUp]);

  const startResize = (e: React.MouseEvent, fieldId: string, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    setResizingField(fieldId);
    setResizeHandle(handle);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: field.width,
      height: field.height,
      fieldX: field.x,
      fieldY: field.y,
    });
  };

  // Get cursor for resize handle
  const getResizeCursor = (handle: ResizeHandle): string => {
    switch (handle) {
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      default:
        return 'default';
    }
  };

  const deleteField = (fieldId: string) => {
    historyFieldsChange(fields.filter(f => f.id !== fieldId), 'delete field');
    if (editingField === fieldId) setEditingField(null);
  };

  const updateFieldPrefill = (fieldId: string, value: string) => {
    historyFieldsChange(fields.map(f =>
      f.id === fieldId ? { ...f, prefillValue: value } : f
    ), 'update prefill');
  };

  const toggleFieldRequired = (fieldId: string) => {
    historyFieldsChange(fields.map(f =>
      f.id === fieldId ? { ...f, required: !f.required } : f
    ), 'toggle required');
  };

  const updateFieldSize = (fieldId: string, width: number, height: number) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    const constraints = FIELD_SIZE_CONSTRAINTS[field.type];
    historyFieldsChange(fields.map(f =>
      f.id === fieldId ? {
        ...f,
        width: Math.max(constraints.minWidth, Math.min(constraints.maxWidth, width)),
        height: Math.max(constraints.minHeight, Math.min(constraints.maxHeight, height))
      } : f
    ), 'resize field');
  };

  const getRecipientById = (id: string) => {
    const index = recipients.findIndex(r => r.id === id);
    const recipient = recipients[index];
    if (!recipient) return null;
    return { ...recipient, color: getRecipientColor(index), index };
  };

  const getFieldConfig = (type: SignatureField['type']) => LOCAL_FIELD_TYPES.find(f => f.type === type);

  const validRecipients = recipients.filter(r => r.name && r.email);

  const handleSend = async () => {
    setIsSending(true);
    try {
      // Convert PDF to base64 - either from file or from generated content
      let pdfBase64: string | null = null;

      if (selectedFile) {
        // Convert uploaded file to base64
        const arrayBuffer = await selectedFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      } else if (generatedContent) {
        // Generate PDF from text/HTML content
        console.log('[DocumentPrepare] Generating PDF from content, length:', generatedContent.length);
        const pdfBytes = await contentToPdf(generatedContent, title || 'Document');
        pdfBase64 = pdfBytesToBase64(pdfBytes);
        console.log('[DocumentPrepare] Generated PDF base64 length:', pdfBase64.length);

        if (!pdfBase64 || pdfBase64.length < 100) {
          throw new Error('Failed to generate PDF from document content');
        }
      }

      if (!pdfBase64) {
        throw new Error('No document to send. Please upload a file or generate content.');
      }

      // Call the API to send the envelope and create notifications
      const response = await fetch('/api/envelopes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          recipients: validRecipients.map(r => ({
            name: r.name,
            email: r.email,
            role: r.role,
            require2FA: r.require2FA || false,
            phoneNumber: r.require2FA ? r.phoneNumber : undefined,
          })),
          message,
          expirationDays,
          enableReminders,
          // Include the PDF and signature fields
          // IMPORTANT: Normalize coordinates to base scale (divide by zoom) so they're stored in PDF points
          pdfBase64,
          signatureFields: fields.map(f => ({
            id: f.id,
            type: f.type,
            x: Math.round(f.x / zoom),
            y: Math.round(f.y / zoom),
            width: Math.round(f.width / zoom),
            height: Math.round(f.height / zoom),
            page: f.page,
            recipientId: f.recipientId,
            required: f.required,
            prefillValue: f.prefillValue || '',
            placeholder: f.placeholder || '',
            groupId: f.groupId,
            groupLabel: f.groupLabel,
            options: f.options,
            currency: f.currency,
          })),
        }),
      });

      const result = await response.json();

      if (result.error === 'LimitExceeded' || result.upgradeRequired) {
        toast({
          title: "Send Limit Reached",
          description: "You've used all your trial sends. Please upgrade your plan to continue sending documents.",
          variant: "destructive",
        });
        window.location.href = '/select-plan';
        return;
      }

      if (result.success) {
        // Check if any emails failed to send
        const emailResults = result.data.emailResults || [];
        const failedEmails = emailResults.filter((r: { success: boolean }) => !r.success);
        if (failedEmails.length > 0) {
          console.warn('Some emails failed to send:', failedEmails);
        }

        // Create envelope object from API response
        const envelope: Envelope = {
          id: result.data.id,
          title: result.data.title,
          description: message,
          status: 'in_signing',
          signingOrder: 'sequential',
          organizationId: 'demo-org',
          createdBy: 'demo-user',
          recipients: validRecipients.map((r, index) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            status: 'sent' as const,
            signingOrder: index + 1,
          })),
          createdAt: result.data.createdAt,
          updatedAt: result.data.createdAt,
          metadata: {
            documentCount: 1,
            recipientCount: validRecipients.length,
          },
        };
        setSentEnvelope(envelope);
        setShowSuccess(true);
        // Save contacts to history for future use
        saveContacts(validRecipients);
      } else {
        // Fallback to demo mode if API fails
        console.warn('API call failed, using demo mode:', result.error);
        const demoEnvelope = createDemoEnvelope(title, message, recipients, fields);
        setSentEnvelope(demoEnvelope);
        setShowSuccess(true);
        saveContacts(validRecipients);
      }
    } catch (error) {
      // Fallback to demo mode on network error
      console.warn('Network error, using demo mode:', error);
      const demoEnvelope = createDemoEnvelope(title, message, recipients, fields);
      setSentEnvelope(demoEnvelope);
      setShowSuccess(true);
      saveContacts(validRecipients);
    } finally {
      setIsSending(false);
    }
  };

  const canProceedFromUpload = selectedFile && title;
  const canProceedFromRecipients = validRecipients.length > 0;
  const canProceedFromFields = fields.length > 0;

  // Step content
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 py-4 bg-background border-b">
      {[
        { key: 'upload', label: 'Add Document', icon: Upload },
        { key: 'recipients', label: 'Add Recipients', icon: Users },
        { key: 'fields', label: 'Place Fields', icon: Edit3 },
        { key: 'review', label: 'Review & Send', icon: Send },
      ].map((s, i, arr) => {
        const stepIndex = ['upload', 'recipients', 'fields', 'review'].indexOf(step);
        const isActive = step === s.key;
        const isCompleted = stepIndex > i;
        const Icon = s.icon;

        return (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
              isActive
                ? 'bg-[hsl(var(--pearsign-primary))] text-white'
                : isCompleted
                  ? 'bg-[hsl(var(--pearsign-primary))]/20 text-[hsl(var(--pearsign-primary))]'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="text-sm font-medium hidden md:inline">{s.label}</span>
            </div>
            {i < arr.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${isCompleted ? 'bg-[hsl(var(--pearsign-primary))]' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="font-semibold">{title || 'Prepare Document'}</h1>
            <p className="text-xs text-muted-foreground">
              {selectedFile?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {step === 'review' && (
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send for Signature
            </Button>
          )}
        </div>
      </header>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-xl space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Upload Your Document</h2>
                <p className="text-muted-foreground">
                  Start by uploading the document you want to send for signature
                </p>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer hover:border-[hsl(var(--pearsign-primary))] ${
                  selectedFile
                    ? 'border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5'
                    : 'border-muted-foreground/25'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('file-upload-flow')?.click()}
              >
                <input
                  type="file"
                  id="file-upload-flow"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleFileSelect}
                />
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto bg-[hsl(var(--pearsign-primary))]/10 rounded-xl flex items-center justify-center">
                      <FileCheck className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    >
                      Choose a different file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-xl flex items-center justify-center">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">Drop your PDF here</p>
                      <p className="text-sm text-muted-foreground">or click to browse</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-title">Document Title</Label>
                <Input
                  id="doc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for this document"
                  className="text-lg py-6"
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep('recipients')}
                  disabled={!canProceedFromUpload}
                  size="lg"
                  className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Recipients */}
        {step === 'recipients' && (
          <div className="h-full flex items-center justify-center p-8 overflow-y-auto">
            <div className="w-full max-w-2xl space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Who needs to sign?</h2>
                <p className="text-muted-foreground">
                  Add signers in the order they should receive the document
                </p>
              </div>

              {/* Signing Order Info */}
              {recipients.length > 1 && (
                <Card className="p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100">Sequential Signing Order</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Signers will receive the document in order. Each signer must complete before the next one receives their email.
                        Use the arrows to reorder signers.
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              <div className="space-y-3">
                {recipients.map((recipient, index) => (
                  <Card key={recipient.id} className="p-4 relative">
                    <div className="flex items-start gap-4">
                      {/* Order Controls */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0}
                          onClick={() => moveRecipient(index, 'up')}
                        >
                          <ChevronLeft className="h-4 w-4 rotate-90" />
                        </Button>
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: getRecipientColor(index) }}
                        >
                          {index + 1}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === recipients.length - 1}
                          onClick={() => moveRecipient(index, 'down')}
                        >
                          <ChevronLeft className="h-4 w-4 -rotate-90" />
                        </Button>
                      </div>

                      {/* Recipient Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge
                            variant="secondary"
                            className="text-xs"
                            style={{
                              backgroundColor: `${getRecipientColor(index)}20`,
                              color: getRecipientColor(index),
                              borderColor: getRecipientColor(index)
                            }}
                          >
                            {index === 0 ? 'Signs First' : index === recipients.length - 1 ? 'Signs Last' : `Signs #${index + 1}`}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="relative">
                            <Label className="text-xs text-muted-foreground">Full Name</Label>
                            <Input
                              placeholder="John Smith"
                              value={recipient.name}
                              onChange={(e) => {
                                updateRecipient(recipient.id, 'name', e.target.value);
                                searchContacts(e.target.value);
                              }}
                              onFocus={() => {
                                setActiveInputId(recipient.id);
                                setShowSuggestions(true);
                                searchContacts(recipient.name || '');
                              }}
                              onBlur={() => {
                                // Delay to allow click on suggestion
                                setTimeout(() => {
                                  if (activeInputId === recipient.id) {
                                    setShowSuggestions(false);
                                  }
                                }, 200);
                              }}
                              className="mt-1"
                              autoComplete="off"
                            />

                            {/* 2FA Phone Verification Toggle */}
                            <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Shield className="h-4 w-4 text-blue-600" />
                                  <div>
                                    <p className="text-sm font-medium">Phone Verification (2FA)</p>
                                    <p className="text-xs text-muted-foreground">Require SMS code before signing</p>
                                  </div>
                                </div>
                                <Switch
                                  checked={recipient.require2FA || false}
                                  onCheckedChange={(checked) => updateRecipient(recipient.id, 'require2FA', checked)}
                                />
                              </div>
                              {recipient.require2FA && (
                                <div className="mt-3">
                                  <Label className="text-xs text-muted-foreground">Phone Number</Label>
                                  <div className="relative mt-1 flex gap-2">
                                    <div className="flex items-center justify-center px-3 bg-muted rounded-md border text-sm font-medium text-muted-foreground shrink-0">
                                      +1
                                    </div>
                                    <div className="relative flex-1">
                                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        type="tel"
                                        placeholder="(555) 123-4567"
                                        value={recipient.phoneNumber?.replace(/^\+1\s*/, '') || ''}
                                        onChange={(e) => {
                                          const digits = e.target.value.replace(/\D/g, '');
                                          updateRecipient(recipient.id, 'phoneNumber', '+1' + digits);
                                        }}
                                        className="pl-10"
                                        maxLength={14}
                                      />
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    US phone number for SMS verification
                                  </p>
                                </div>
                              )}
                            </div>
                            {/* Contact Suggestions Dropdown */}
                            {showSuggestions && activeInputId === recipient.id && contactSuggestions.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b bg-muted/50">
                                  Recent contacts
                                </div>
                                {contactSuggestions.map((contact) => (
                                  <button
                                    key={contact.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-3 transition-colors"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      selectContact(recipient.id, contact);
                                    }}
                                  >
                                    <div className="w-8 h-8 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center text-[hsl(var(--pearsign-primary))] text-xs font-medium shrink-0">
                                      {contact.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{contact.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                                    </div>
                                    {contact.useCount > 1 && (
                                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {contact.useCount}x
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Email Address</Label>
                            <Input
                              type="email"
                              placeholder="john@company.com"
                              value={recipient.email}
                              onChange={(e) => {
                                updateRecipient(recipient.id, 'email', e.target.value);
                                searchContacts(e.target.value);
                              }}
                              onFocus={() => {
                                setActiveInputId(`${recipient.id}-email`);
                                setShowSuggestions(true);
                                searchContacts(recipient.email || '');
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  if (activeInputId === `${recipient.id}-email`) {
                                    setShowSuggestions(false);
                                  }
                                }, 200);
                              }}
                              className="mt-1"
                              autoComplete="off"
                            />
                            {/* Contact Suggestions Dropdown for Email */}
                            {showSuggestions && activeInputId === `${recipient.id}-email` && contactSuggestions.length > 0 && (
                              <div className="absolute z-50 w-64 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b bg-muted/50">
                                  Recent contacts
                                </div>
                                {contactSuggestions.map((contact) => (
                                  <button
                                    key={contact.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-3 transition-colors"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      selectContact(recipient.id, contact);
                                    }}
                                  >
                                    <div className="w-8 h-8 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center text-[hsl(var(--pearsign-primary))] text-xs font-medium shrink-0">
                                      {contact.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{contact.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Remove Button */}
                      {recipients.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRecipient(recipient.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addRecipient}
                className="w-full py-6 border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Another Signer
              </Button>

              <div className="flex justify-between pt-4">
                <Button variant="outline" size="lg" onClick={() => setStep('upload')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (validRecipients.length > 0) {
                      setSelectedRecipientId(validRecipients[0].id);
                    }
                    setStep('fields');
                  }}
                  disabled={!canProceedFromRecipients}
                  size="lg"
                  className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Field Mapping */}
        {step === 'fields' && (
          <div className="h-full flex">
            {/* Left Sidebar - Field Tools (Standardized with Template Editor) */}
            <div className="w-56 border-r bg-muted/30 p-4 flex flex-col overflow-hidden">
              <div className="space-y-4 flex-1 overflow-y-auto">
                {/* Recipient Selector */}
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Assign Fields To
                  </Label>
                  <div className="mt-2 space-y-1">
                    {validRecipients.map((recipient) => {
                      const recipientIndex = recipients.findIndex(r => r.id === recipient.id);
                      const color = getRecipientColor(recipientIndex);
                      return (
                        <button
                          key={recipient.id}
                          onClick={() => setSelectedRecipientId(recipient.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all border ${
                            selectedRecipientId === recipient.id
                              ? 'bg-accent ring-2 ring-[hsl(var(--pearsign-primary))] border-[hsl(var(--pearsign-primary))]'
                              : 'hover:bg-accent/50 border-transparent'
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {recipientIndex + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{recipient.name}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Add Fields - Grouped */}
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Add Fields
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                    Select a field type, then click on the document to place it
                  </p>
                  <div className="space-y-3">
                    {FIELD_GROUPS.map((group) => {
                      const groupFields = FIELD_TYPE_CONFIG.filter(f => f.group === group.key);
                      if (groupFields.length === 0) return null;
                      return (
                        <div key={group.key}>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                          <div className="mt-1.5 space-y-1">
                            {groupFields.map((fieldType) => {
                              const Icon = fieldType.icon;
                              const isActive = selectedFieldType === fieldType.type;

                              if (fieldType.hasSubMenu) {
                                return (
                                  <Popover key={fieldType.type}>
                                    <PopoverTrigger asChild>
                                      <button
                                        data-testid={`button-field-type-${fieldType.type}`}
                                        className={cn(
                                          "w-full h-9 rounded-md flex items-center gap-2.5 px-2.5 transition-all text-left hover-elevate",
                                          isActive && "outline outline-2 outline-offset-1"
                                        )}
                                        style={isActive ? { backgroundColor: fieldType.bgCanvas, outlineColor: fieldType.borderCanvas } : undefined}
                                      >
                                        <div
                                          className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", fieldType.bgLight)}
                                        >
                                          <Icon className="h-3.5 w-3.5" style={{ color: fieldType.color }} />
                                        </div>
                                        <span className="text-sm font-medium flex-1 text-foreground">{fieldType.label}</span>
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-2" side="right" align="start">
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold text-muted-foreground px-2 py-1">Text Field Options</p>
                                        {[
                                          { label: 'Empty Text Field', icon: Type, config: { placeholder: '', required: true } },
                                          { label: 'With Placeholder', icon: Edit3, config: { placeholder: 'Enter your response...', required: true } },
                                          { label: 'Pre-filled Text', icon: FileText, config: { prefillValue: 'Read-only text', required: false } },
                                        ].map((opt) => (
                                          <button
                                            key={opt.label}
                                            data-testid={`button-text-option-${opt.label.toLowerCase().replace(/\s+/g, '-')}`}
                                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover-elevate text-left"
                                            onClick={() => {
                                              setTextFieldConfig(opt.config);
                                              setSelectedFieldType('text');
                                            }}
                                          >
                                            <opt.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span>{opt.label}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                );
                              }

                              return (
                                <button
                                  key={fieldType.type}
                                  data-testid={`button-field-type-${fieldType.type}`}
                                  onClick={() => setSelectedFieldType(fieldType.type)}
                                  className={cn(
                                    "w-full h-9 rounded-md flex items-center gap-2.5 px-2.5 transition-all text-left hover-elevate",
                                    isActive && "outline outline-2 outline-offset-1"
                                  )}
                                  style={isActive ? { backgroundColor: fieldType.bgCanvas, outlineColor: fieldType.borderCanvas } : undefined}
                                >
                                  <div
                                    className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", fieldType.bgLight)}
                                  >
                                    <Icon className="h-3.5 w-3.5" style={{ color: fieldType.color }} />
                                  </div>
                                  <span className="text-sm font-medium text-foreground">{fieldType.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Placed Fields */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Placed Fields ({fields.length})
                  </Label>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {fields.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Click on the document to place fields
                      </p>
                    ) : (
                      (() => {
                        const renderedGroups = new Set<string>();
                        return fields.map((field) => {
                          const recipient = getRecipientById(field.recipientId);
                          const config = getFieldConfig(field.type);
                          const ftCfg = FIELD_TYPE_CONFIG.find(f => f.type === field.type);

                          if ((field.type === 'checkbox' || field.type === 'radio') && field.groupId) {
                            if (renderedGroups.has(field.groupId)) return null;
                            renderedGroups.add(field.groupId);
                            const groupMembers = getCheckboxGroup(field.groupId);
                            const isRadioGrp = field.type === 'radio';
                            const ringColor = isRadioGrp ? 'ring-fuchsia-500' : 'ring-teal-500';
                            const defaultLabel = isRadioGrp ? 'Radio Group' : 'Checkbox Group';
                            return (
                              <div
                                key={`group-${field.groupId}`}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-md text-sm",
                                  editingField && groupMembers.some(m => m.id === editingField) ? `bg-accent ring-2 ${ringColor}` : 'bg-accent/50'
                                )}
                              >
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ftCfg?.borderCanvas || '#14b8a6' }} />
                                <span className="flex-1 truncate text-xs">
                                  {field.groupLabel || defaultLabel} ({groupMembers.length})
                                </span>
                                {field.required && <span className="text-[10px] text-red-500 font-bold">*</span>}
                                <span className="text-[10px] text-muted-foreground">p.{field.page}</span>
                                <button
                                  data-testid={`button-edit-group-${field.groupId}`}
                                  onClick={() => setEditingField(editingField === field.id ? null : field.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  data-testid={`button-delete-group-${field.groupId}`}
                                  onClick={() => deleteCheckboxGroup(field.groupId!)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={field.id}
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-md text-sm",
                                editingField === field.id ? 'bg-accent ring-2 ring-[hsl(var(--pearsign-primary))]' : 'bg-accent/50'
                              )}
                            >
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ftCfg?.borderCanvas || recipient?.color }} />
                              <span className="flex-1 truncate text-xs">{config?.label}</span>
                              {field.required && <span className="text-[10px] text-red-500 font-bold">*</span>}
                              <span className="text-[10px] text-muted-foreground">p.{field.page}</span>
                              <button
                                data-testid={`button-edit-field-${field.id}`}
                                onClick={() => setEditingField(editingField === field.id ? null : field.id)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                data-testid={`button-delete-field-sidebar-${field.id}`}
                                onClick={() => deleteField(field.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="pt-4 border-t mt-4 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('recipients')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  className="w-full bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                  onClick={() => setStep('review')}
                  disabled={!canProceedFromFields}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* PDF Preview Area */}
            <div className="flex-1 bg-muted/50 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 bg-background border-b">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-16 text-center">{Math.round(zoom * 100)}%</span>
                  <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canUndo}
                          onClick={undo}
                          aria-label="Undo"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canRedo}
                          onClick={redo}
                          aria-label="Redo"
                        >
                          <Redo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-sm text-muted-foreground">
                    Click on document to add {LOCAL_FIELD_TYPES.find(f => f.type === selectedFieldType)?.label}
                  </span>
                </div>
              </div>

              {/* PDF Canvas with Pinch-to-Zoom */}
              <div
                className="flex-1 overflow-auto p-6 flex justify-center"
                {...touchHandlers}
                style={pinchZoomStyles}
                ref={editorRef}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--pearsign-primary))]" />
                  </div>
                ) : (
                  <div
                    ref={containerRef}
                    className="relative bg-white shadow-2xl cursor-crosshair"
                    onClick={handleCanvasClick}
                  >
                    {generatedContent && !selectedFile ? (
                      <div className="p-8 min-w-[612px] min-h-[792px] bg-white font-mono text-sm whitespace-pre-wrap leading-relaxed">
                        {generatedContent}
                      </div>
                    ) : (
                      <canvas
                        ref={canvasRef}
                        className="block"
                        style={{
                          imageRendering: 'auto',
                          WebkitFontSmoothing: 'antialiased',
                          touchAction: 'none',
                        }}
                      />
                    )}

                    {/* Alignment Guides */}
                    {alignmentGuides.length > 0 && (
                      <AlignmentGuidesRenderer
                        guides={alignmentGuides}
                        containerWidth={pageWidth}
                        containerHeight={pageHeight}
                      />
                    )}

                    {/* Checkbox/Radio Group containers */}
                    {(() => {
                      const currentPageFields = fields.filter(f => f.page === currentPage);
                      const groupIds = [...new Set(currentPageFields.filter(f => (f.type === 'checkbox' || f.type === 'radio') && f.groupId).map(f => f.groupId!))];
                      return groupIds.map(gid => {
                        const groupFields = currentPageFields.filter(f => f.groupId === gid);
                        if (groupFields.length < 2) return null;
                        const isRadioGroup = groupFields[0]?.type === 'radio';
                        const minX = Math.min(...groupFields.map(f => f.x));
                        const minY = Math.min(...groupFields.map(f => f.y));
                        const maxX = Math.max(...groupFields.map(f => f.x + f.width));
                        const maxY = Math.max(...groupFields.map(f => f.y + f.height));
                        const pad = 8;
                        const anySelected = groupFields.some(f => editingField === f.id);
                        const label = groupFields[0]?.groupLabel;
                        const isRequired = groupFields[0]?.required;
                        return (
                          <div
                            key={`group-${gid}`}
                            data-testid={`checkbox-group-${gid}`}
                            className={cn(
                              "absolute rounded-md pointer-events-none transition-all",
                              anySelected ? "border-2 border-dashed" : "border border-dashed"
                            )}
                            style={{
                              left: minX - pad,
                              top: minY - pad - (label ? 16 : 0),
                              width: maxX - minX + pad * 2,
                              height: maxY - minY + pad * 2 + (label ? 16 : 0),
                              borderColor: anySelected
                                ? (isRadioGroup ? '#d946ef' : '#14b8a6')
                                : (isRadioGroup ? '#d946ef80' : '#14b8a680'),
                              backgroundColor: anySelected
                                ? (isRadioGroup ? 'rgba(217,70,239,0.04)' : 'rgba(20,184,166,0.04)')
                                : 'transparent',
                            }}
                          >
                            {label && (
                              <div className={cn(
                                "absolute top-0 left-2 text-[10px] font-medium flex items-center gap-1",
                                isRadioGroup ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-teal-600 dark:text-teal-400"
                              )}>
                                <span>{label}</span>
                                {isRequired && <span className="text-red-500 font-bold">*</span>}
                              </div>
                            )}
                            {!label && isRequired && (
                              <div className="absolute -top-0.5 right-1 text-[10px] font-bold text-red-500">*</div>
                            )}
                          </div>
                        );
                      });
                    })()}

                    {/* Rendered fields - Per-type color coding */}
                    {fields.filter(f => f.page === currentPage).map((field) => {
                      const recipient = getRecipientById(field.recipientId);
                      const config = getFieldConfig(field.type);
                      const ftConfig = FIELD_TYPE_CONFIG.find(f => f.type === field.type);
                      const Icon = config?.icon || PenTool;
                      const isEditing = editingField === field.id;
                      const isSelected = editingField === field.id;
                      const isDragging = draggingField === field.id;

                      const borderColor = ftConfig?.borderCanvas || '#3b82f6';
                      const bgColor = ftConfig?.bgCanvas || 'rgba(37,99,235,0.06)';
                      const bgColorSelected = ftConfig?.bgCanvasSelected || 'rgba(37,99,235,0.12)';
                      const textColor = ftConfig?.textCanvas || '#1d4ed8';

                      return (
                        <div
                          key={field.id}
                          data-testid={`canvas-field-${field.type}-${field.id}`}
                          className={cn(
                            "absolute group/field select-none",
                            isDragging ? "cursor-grabbing z-30" : "cursor-grab",
                            isSelected && "z-20"
                          )}
                          style={{
                            left: field.x,
                            top: field.y,
                            width: field.width,
                            height: field.height,
                          }}
                          onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingField(field.id);
                          }}
                        >
                          {/* Main field box */}
                          <div
                            className={cn(
                              "w-full h-full rounded-md flex items-center justify-center transition-all",
                              isSelected ? "shadow-lg" : "hover:shadow-md"
                            )}
                            style={{
                              border: `2px solid ${isSelected ? borderColor : borderColor + 'cc'}`,
                              backgroundColor: isSelected ? bgColorSelected : bgColor,
                            }}
                          >
                            <div className="flex items-center gap-1.5 px-2" style={{ color: textColor }}>
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs font-medium truncate">
                                {config?.label}
                              </span>
                              {field.required && (
                                <span className="text-[10px] font-bold text-red-500 shrink-0">*</span>
                              )}
                            </div>
                          </div>

                          {/* Recipient label pill */}
                          {recipient && (
                            <div
                              className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow-sm"
                              style={{ backgroundColor: recipient.color || borderColor }}
                            >
                              {recipient.name || `Signer ${recipient.index + 1}`}
                            </div>
                          )}

                          {/* Delete button */}
                          <button
                            data-testid={`button-delete-field-${field.id}`}
                            onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                            className={cn(
                              "absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center transition-opacity shadow-sm hover:bg-red-600",
                              isSelected ? "opacity-100" : "opacity-0 group-hover/field:opacity-100"
                            )}
                          >
                            <X className="h-3 w-3" />
                          </button>



                          {/* + Add Another Button for Checkboxes and Radio Buttons */}
                          {(field.type === 'checkbox' || field.type === 'radio') && isSelected && (
                            <button
                              data-testid={`button-add-another-${field.type}-${field.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                field.type === 'radio' ? addAnotherRadio(field) : addAnotherCheckbox(field);
                              }}
                              className="absolute -right-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-white flex items-center justify-center shadow-sm transition-colors"
                              style={{ backgroundColor: borderColor }}
                              title={`Add another ${field.type} to group`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}

                          {/* Editing Panel */}
                          {isEditing && (
                            <div
                              className="absolute left-full top-0 ml-3 w-60 p-3 bg-card rounded-lg shadow-xl border z-40 space-y-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Header with type color accent */}
                              <div className="flex items-center justify-between gap-2 pb-2 border-b">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-5 h-5 rounded flex items-center justify-center"
                                    style={{ backgroundColor: bgColorSelected }}
                                  >
                                    <Icon className="h-3 w-3" style={{ color: borderColor }} />
                                  </div>
                                  <span className="text-sm font-medium text-foreground">
                                    {field.type === 'checkbox' ? 'Checkbox Group' : field.type === 'radio' ? 'Radio Group' : config?.label}
                                  </span>
                                </div>
                                <button
                                  data-testid="button-close-field-editor"
                                  onClick={(e) => { e.stopPropagation(); setEditingField(null); }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Checkbox/Radio Group Controls */}
                              {(field.type === 'checkbox' || field.type === 'radio') && field.groupId && (() => {
                                const groupMembers = getCheckboxGroup(field.groupId);
                                const isRadio = field.type === 'radio';
                                const typeLabel = isRadio ? 'radio button' : 'checkbox';
                                const typeLabelPlural = isRadio ? 'radio buttons' : 'checkboxes';
                                return (
                                  <div className="space-y-3">
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Group Label</Label>
                                      <Input
                                        data-testid="input-checkbox-group-label"
                                        value={field.groupLabel || ''}
                                        onChange={(e) => updateGroupLabel(field.groupId!, e.target.value)}
                                        placeholder={isRadio ? "e.g. Choose one option" : "e.g. Select your preferences"}
                                        className="h-8 text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Required</Label>
                                        <p className="text-[10px] text-muted-foreground">
                                          {isRadio ? 'Must select one option' : 'At least one must be checked'}
                                        </p>
                                      </div>
                                      <Switch
                                        data-testid="switch-checkbox-group-required"
                                        checked={field.required}
                                        onCheckedChange={() => toggleGroupRequired(field.groupId!)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>

                                    <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50">
                                      <span className="text-xs text-muted-foreground">{groupMembers.length} {groupMembers.length !== 1 ? typeLabelPlural : typeLabel} in group</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        data-testid="button-add-checkbox-to-group"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          isRadio ? addAnotherRadio(field) : addAnotherCheckbox(field);
                                        }}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add
                                      </Button>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[10px] text-muted-foreground">{isRadio ? 'Options' : 'Checkboxes'}</Label>
                                      {groupMembers.map((member, idx) => (
                                        <div
                                          key={member.id}
                                          className={cn(
                                            "flex items-center justify-between gap-2 px-2 py-1 rounded text-xs",
                                            member.id === field.id
                                              ? (isRadio ? "bg-fuchsia-50 dark:bg-fuchsia-950/30" : "bg-teal-50 dark:bg-teal-950/30")
                                              : "bg-muted/30"
                                          )}
                                        >
                                          <span className="text-muted-foreground">
                                            {idx + 1}. {isRadio ? 'Option' : 'Checkbox'}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            <button
                                              data-testid={`button-select-${field.type}-${member.id}`}
                                              onClick={(e) => { e.stopPropagation(); setEditingField(member.id); }}
                                              className="text-muted-foreground hover:text-foreground"
                                              title={`Select this ${typeLabel}`}
                                            >
                                              <Eye className="h-3 w-3" />
                                            </button>
                                            {groupMembers.length > 1 && (
                                              <button
                                                data-testid={`button-remove-from-group-${member.id}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (groupMembers.length <= 2) {
                                                    deleteField(member.id);
                                                  } else {
                                                    removeFromGroup(member.id);
                                                  }
                                                }}
                                                className="text-muted-foreground hover:text-destructive"
                                                title={groupMembers.length <= 2 ? `Delete ${typeLabel}` : "Remove from group"}
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="flex gap-2 pt-2 border-t">
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="flex-1 text-xs"
                                        data-testid="button-delete-checkbox-group"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteCheckboxGroup(field.groupId!);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Delete Group
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="flex-1 text-xs"
                                        data-testid="button-done-field-editor"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingField(null);
                                        }}
                                      >
                                        Done
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Non-group field controls */}
                              {field.type !== 'checkbox' && field.type !== 'radio' && (
                                <>
                                  {/* Required Toggle */}
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs text-muted-foreground">Required</Label>
                                    <Switch
                                      checked={field.required}
                                      onCheckedChange={() => toggleFieldRequired(field.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>

                                  {/* Size Controls */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Width</Label>
                                      <Input
                                        type="number"
                                        value={Math.round(field.width)}
                                        onChange={(e) => updateFieldSize(field.id, parseInt(e.target.value) || 50, field.height)}
                                        className="h-8 text-xs"
                                        min={FIELD_SIZE_CONSTRAINTS[field.type].minWidth}
                                        max={FIELD_SIZE_CONSTRAINTS[field.type].maxWidth}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Height</Label>
                                      <Input
                                        type="number"
                                        value={Math.round(field.height)}
                                        onChange={(e) => updateFieldSize(field.id, field.width, parseInt(e.target.value) || 25)}
                                        className="h-8 text-xs"
                                        min={FIELD_SIZE_CONSTRAINTS[field.type].minHeight}
                                        max={FIELD_SIZE_CONSTRAINTS[field.type].maxHeight}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  </div>

                                  {/* Prefill Input (for text-based fields) */}
                                  {['text', 'name', 'email', 'company', 'title'].includes(field.type) && (
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Pre-fill Value</Label>
                                      <Input
                                        value={field.prefillValue || ''}
                                        onChange={(e) => updateFieldPrefill(field.id, e.target.value)}
                                        placeholder="Optional default value"
                                        className="h-8 text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  )}

                                  {/* Dropdown Options Editor */}
                                  {field.type === 'dropdown' && (
                                    <div className="space-y-2">
                                      <Label className="text-[10px] text-muted-foreground">Options</Label>
                                      {(field.options || []).map((opt, idx) => (
                                        <div key={idx} className="flex items-center gap-1">
                                          <Input
                                            data-testid={`input-dropdown-option-${idx}`}
                                            value={opt}
                                            onChange={(e) => {
                                              const newOptions = [...(field.options || [])];
                                              newOptions[idx] = e.target.value;
                                              historyFieldsChange(
                                                fields.map(f => f.id === field.id ? { ...f, options: newOptions } : f),
                                                'update dropdown option'
                                              );
                                            }}
                                            className="h-7 text-xs flex-1"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <button
                                            data-testid={`button-remove-dropdown-option-${idx}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const newOptions = (field.options || []).filter((_, i) => i !== idx);
                                              historyFieldsChange(
                                                fields.map(f => f.id === field.id ? { ...f, options: newOptions } : f),
                                                'remove dropdown option'
                                              );
                                            }}
                                            className="text-muted-foreground hover:text-destructive shrink-0"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ))}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs w-full"
                                        data-testid="button-add-dropdown-option"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newOptions = [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`];
                                          historyFieldsChange(
                                            fields.map(f => f.id === field.id ? { ...f, options: newOptions } : f),
                                            'add dropdown option'
                                          );
                                        }}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Option
                                      </Button>
                                      <div>
                                        <Label className="text-[10px] text-muted-foreground">Placeholder</Label>
                                        <Input
                                          data-testid="input-dropdown-placeholder"
                                          value={field.placeholder || ''}
                                          onChange={(e) => {
                                            historyFieldsChange(
                                              fields.map(f => f.id === field.id ? { ...f, placeholder: e.target.value } : f),
                                              'update dropdown placeholder'
                                            );
                                          }}
                                          placeholder="Select an option..."
                                          className="h-7 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Payment Currency Selector */}
                                  {field.type === 'payment' && (
                                    <div className="space-y-2">
                                      <div>
                                        <Label className="text-[10px] text-muted-foreground">Currency</Label>
                                        <select
                                          data-testid="select-payment-currency"
                                          value={field.currency || 'USD'}
                                          onChange={(e) => {
                                            historyFieldsChange(
                                              fields.map(f => f.id === field.id ? { ...f, currency: e.target.value } : f),
                                              'update payment currency'
                                            );
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full h-8 text-xs rounded-md border bg-background px-2"
                                        >
                                          <option value="USD">USD ($)</option>
                                          <option value="EUR">EUR (&euro;)</option>
                                          <option value="GBP">GBP (&pound;)</option>
                                          <option value="ILS">ILS (&#8362;)</option>
                                          <option value="CAD">CAD ($)</option>
                                          <option value="AUD">AUD ($)</option>
                                          <option value="JPY">JPY (&yen;)</option>
                                          <option value="CHF">CHF (Fr)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label className="text-[10px] text-muted-foreground">Pre-fill Amount</Label>
                                        <Input
                                          data-testid="input-payment-prefill"
                                          type="number"
                                          value={field.prefillValue || ''}
                                          onChange={(e) => updateFieldPrefill(field.id, e.target.value)}
                                          placeholder="0.00"
                                          className="h-8 text-xs"
                                          step="0.01"
                                          min="0"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex gap-2 pt-2 border-t">
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="flex-1 text-xs"
                                      data-testid="button-delete-field-confirm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteField(field.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="flex-1 text-xs"
                                      data-testid="button-done-field-editor"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingField(null);
                                      }}
                                    >
                                      Done
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Resize Handles - per-type color */}
                          {isSelected && (
                            <>
                              {(['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'] as ResizeHandle[]).map((handle) => {
                                const posMap: Record<string, string> = {
                                  nw: 'absolute -top-1 -left-1',
                                  ne: 'absolute -top-1 -right-1',
                                  sw: 'absolute -bottom-1 -left-1',
                                  se: 'absolute -bottom-1 -right-1',
                                  n: 'absolute -top-1 left-1/2 -translate-x-1/2',
                                  s: 'absolute -bottom-1 left-1/2 -translate-x-1/2',
                                  w: 'absolute top-1/2 -left-1 -translate-y-1/2',
                                  e: 'absolute top-1/2 -right-1 -translate-y-1/2',
                                };
                                return (
                                  <div
                                    key={handle}
                                    className={cn(posMap[handle], "w-2.5 h-2.5 rounded-sm border border-white shadow-sm hover:scale-125 transition-transform")}
                                    style={{ backgroundColor: borderColor, cursor: getResizeCursor(handle) }}
                                    onMouseDown={(e) => startResize(e, field.id, handle)}
                                  />
                                );
                              })}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="h-full flex">
            {/* Left Panel - Summary */}
            <div className="w-96 border-r bg-card p-6 overflow-y-auto">
              <h2 className="text-xl font-bold mb-6">Review & Send</h2>

              <div className="space-y-6">
                {/* Document */}
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-[hsl(var(--pearsign-primary))]/10 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{title}</h3>
                      <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {totalPages} page{totalPages > 1 ? 's' : ''} • {fields.length} field{fields.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Recipients */}
                <div>
                  <h3 className="font-semibold mb-3">Recipients ({validRecipients.length})</h3>
                  <div className="space-y-2">
                    {validRecipients.map((recipient) => {
                      const recipientIndex = recipients.findIndex(r => r.id === recipient.id);
                      const color = getRecipientColor(recipientIndex);
                      const recipientFields = fields.filter(f => f.recipientId === recipient.id);
                      return (
                        <Card key={recipient.id} className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                              style={{ backgroundColor: color }}
                            >
                              {recipientIndex + 1}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{recipient.name}</p>
                              <p className="text-sm text-muted-foreground">{recipient.email}</p>
                            </div>
                            <Badge variant="secondary">
                              {recipientFields.length} field{recipientFields.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Fields Summary */}
                <div>
                  <h3 className="font-semibold mb-3">Fields by Type</h3>
                  <div className="flex flex-wrap gap-2">
                    {LOCAL_FIELD_TYPES.map(fieldType => {
                      const count = fields.filter(f => f.type === fieldType.type).length;
                      if (count === 0) return null;
                      const Icon = fieldType.icon;
                      return (
                        <Badge key={fieldType.type} variant="outline" className="gap-1 py-1">
                          <Icon className="h-3 w-3" />
                          {count} {fieldType.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Prefilled Fields */}
                {fields.some(f => f.prefillValue) && (
                  <div>
                    <h3 className="font-semibold mb-3">Prefilled Values</h3>
                    <div className="space-y-2">
                      {fields.filter(f => f.prefillValue).map(field => {
                        const config = getFieldConfig(field.type);
                        const recipient = getRecipientById(field.recipientId);
                        return (
                          <div key={field.id} className="flex items-center gap-2 text-sm">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: recipient?.color }}
                            />
                            <span className="text-muted-foreground">{config?.label}:</span>
                            <span className="font-medium">"{field.prefillValue}"</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Document Settings */}
                <Card className="p-4">
                  <h3 className="font-semibold mb-4">Document Settings</h3>
                  <div className="space-y-4">
                    {/* Expiration */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">Expiration</Label>
                        <p className="text-xs text-muted-foreground">
                          Document will expire if not completed
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={expirationDays}
                          onChange={(e) => setExpirationDays(Number(e.target.value))}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value={7}>7 days</option>
                          <option value={14}>14 days</option>
                          <option value={30}>30 days</option>
                          <option value={60}>60 days</option>
                          <option value={90}>90 days</option>
                          <option value={180}>180 days</option>
                          <option value={365}>1 year</option>
                        </select>
                      </div>
                    </div>

                    {/* Reminders */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">Send Reminders</Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically remind signers who haven't completed
                        </p>
                      </div>
                      <button
                        onClick={() => setEnableReminders(!enableReminders)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          enableReminders ? 'bg-[hsl(var(--pearsign-primary))]' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            enableReminders ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </Card>

                {/* Message */}
                <div>
                  <Label htmlFor="message">Message to Recipients (optional)</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a personal message that will be included in the email..."
                    className="mt-2"
                    rows={4}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 space-y-2">
                <Button
                  className="w-full bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                  size="lg"
                  onClick={handleSend}
                  disabled={isSending}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send for Signature
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('fields')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Edit Fields
                </Button>
              </div>
            </div>

            {/* Right Panel - Document Preview */}
            <div className="flex-1 bg-muted/50 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-background border-b">
                <h3 className="font-medium">Document Preview</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {currentPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 flex justify-center">
                <div className="relative bg-white shadow-xl">
                  {generatedContent && !selectedFile ? (
                      <div className="p-8 min-w-[612px] min-h-[792px] bg-white font-mono text-sm whitespace-pre-wrap leading-relaxed">
                        {generatedContent}
                      </div>
                    ) : (
                      <canvas ref={canvasRef} />
                    )}

                  {/* Show fields in preview (read-only) - Blue theme */}
                  {fields.filter(f => f.page === currentPage).map((field) => {
                    const config = getFieldConfig(field.type);
                    const Icon = config?.icon || PenTool;

                    return (
                      <div
                        key={field.id}
                        className="absolute rounded border-2 border-blue-500 bg-blue-50 flex items-center justify-center gap-1.5 px-2 text-blue-700"
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height,
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {field.prefillValue || config?.label}
                        </span>
                        {field.required && (
                          <span className="text-[10px] font-bold text-red-500 shrink-0">*</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sending Overlay */}
      {isSending && (
        <div className="fixed inset-0 z-60 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-16 w-16 mx-auto text-[hsl(var(--pearsign-primary))] animate-spin mb-4" />
            <h2 className="text-2xl font-bold mb-2">Sending Your Document</h2>
            <p className="text-muted-foreground">Please wait while we prepare everything...</p>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      {showSuccess && sentEnvelope && (
        <div className="fixed inset-0 z-60 bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <div className="h-20 w-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-foreground">Document Sent Successfully!</h2>
            <p className="text-muted-foreground mb-6">
              Your document "{sentEnvelope.title}" has been sent to {validRecipients.length} recipient{validRecipients.length !== 1 ? 's' : ''} for signature.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-semibold text-foreground mb-2">Recipients:</h3>
              <ul className="space-y-1">
                {validRecipients.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <span>{r.name}</span>
                    <span className="text-muted-foreground/60">({r.email})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowSuccess(false);
                  onSuccess?.(sentEnvelope);
                }}
              >
                View in Sent Requests
              </Button>
              <Button
                className="flex-1 bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                onClick={() => {
                  setShowSuccess(false);
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
