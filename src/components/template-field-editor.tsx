"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  X,
  Plus,
  Trash2,
  Type,
  Mail,
  Calendar,
  PenTool,
  Hash,
  CheckSquare,
  Upload,
  Building2,
  MapPin,
  Phone,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Settings2,
  Users,
  AlertCircle,
  Check,
  Loader2,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as pdfjsLib from "pdfjs-dist";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlignmentGuidesRenderer,
  calculateAlignmentGuides,
  snapToGuides,
  TextFieldSubMenu,
  CheckboxGroupManager,
  alignCheckboxGroup,
  type AlignmentGuide,
} from "@/components/enhanced-field-editor";
import { useFieldHistory } from "@/hooks/use-field-history";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Initialize PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// Field types with their icons and colors
const FIELD_TYPES = [
  { type: "signature", label: "Signature", icon: PenTool, color: "#2563eb", bgColor: "bg-blue-100 dark:bg-blue-950" },
  { type: "initials", label: "Initials", icon: Type, color: "#3b82f6", bgColor: "bg-blue-50 dark:bg-blue-900" },
  { type: "text", label: "Text", icon: Type, color: "#6b7280", bgColor: "bg-gray-100 dark:bg-gray-800" },
  { type: "email", label: "Email", icon: Mail, color: "#10b981", bgColor: "bg-emerald-100 dark:bg-emerald-950" },
  { type: "date", label: "Date", icon: Calendar, color: "#f97316", bgColor: "bg-orange-100 dark:bg-orange-950" },
  { type: "number", label: "Number", icon: Hash, color: "#8b5cf6", bgColor: "bg-purple-100 dark:bg-purple-950" },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, color: "#14b8a6", bgColor: "bg-teal-100 dark:bg-teal-950" },
  { type: "company", label: "Company", icon: Building2, color: "#6366f1", bgColor: "bg-indigo-100 dark:bg-indigo-950" },
  { type: "address", label: "Address", icon: MapPin, color: "#f43f5e", bgColor: "bg-rose-100 dark:bg-rose-950" },
  { type: "phone", label: "Phone", icon: Phone, color: "#f59e0b", bgColor: "bg-amber-100 dark:bg-amber-950" },
  { type: "upload", label: "Upload", icon: Upload, color: "#06b6d4", bgColor: "bg-cyan-100 dark:bg-cyan-950" },
] as const;

type FieldType = typeof FIELD_TYPES[number]["type"];

export interface TemplateField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  signerRoleId: string;
  placeholder?: string;
  defaultValue?: string;
  groupId?: string; // For checkbox groups
}

export interface SignerRole {
  id: string;
  name: string;
  order: number;
  color: string;
}

const DEFAULT_FIELD_SIZES: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 200, height: 60 },
  initials: { width: 80, height: 40 },
  text: { width: 180, height: 30 },
  email: { width: 200, height: 30 },
  date: { width: 120, height: 30 },
  number: { width: 100, height: 30 },
  checkbox: { width: 24, height: 24 },
  company: { width: 200, height: 30 },
  address: { width: 250, height: 60 },
  phone: { width: 150, height: 30 },
  upload: { width: 200, height: 100 },
};

// Field size constraints (especially important for signature fields)
const FIELD_SIZE_CONSTRAINTS: Record<FieldType, { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }> = {
  signature: { minWidth: 120, maxWidth: 400, minHeight: 40, maxHeight: 120 },
  initials: { minWidth: 40, maxWidth: 150, minHeight: 30, maxHeight: 80 },
  text: { minWidth: 60, maxWidth: 500, minHeight: 24, maxHeight: 100 },
  email: { minWidth: 100, maxWidth: 400, minHeight: 24, maxHeight: 40 },
  date: { minWidth: 80, maxWidth: 200, minHeight: 24, maxHeight: 40 },
  number: { minWidth: 50, maxWidth: 200, minHeight: 24, maxHeight: 40 },
  checkbox: { minWidth: 18, maxWidth: 40, minHeight: 18, maxHeight: 40 },
  company: { minWidth: 100, maxWidth: 400, minHeight: 24, maxHeight: 60 },
  address: { minWidth: 150, maxWidth: 500, minHeight: 40, maxHeight: 150 },
  phone: { minWidth: 100, maxWidth: 250, minHeight: 24, maxHeight: 40 },
  upload: { minWidth: 120, maxWidth: 400, minHeight: 60, maxHeight: 200 },
};

// Resize handle types: corners + edges
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const SIGNER_COLORS = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#059669", // emerald
  "#dc2626", // red
  "#ea580c", // orange
  "#0891b2", // cyan
];

interface TemplateFieldEditorProps {
  pdfData: string; // Base64 PDF data
  fields: TemplateField[];
  signerRoles: SignerRole[];
  onFieldsChange: (fields: TemplateField[]) => void;
  onSignerRolesChange: (roles: SignerRole[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  templateName: string;
}

export function TemplateFieldEditor({
  pdfData,
  fields,
  signerRoles,
  onFieldsChange,
  onSignerRolesChange,
  onSave,
  onCancel,
  saving = false,
  templateName,
}: TemplateFieldEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsMobileDevice(true);
    }
  }, []);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingField, setResizingField] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [initialResizeState, setInitialResizeState] = useState<{ x: number; y: number; width: number; height: number; mouseX: number; mouseY: number } | null>(null);

  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [activeToolType, setActiveToolType] = useState<FieldType | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'fields' | 'pdf' | 'properties'>('pdf');

  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [showTextFieldMenu, setShowTextFieldMenu] = useState<string | null>(null);
  const [showCheckboxMenu, setShowCheckboxMenu] = useState<string | null>(null);

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    handleFieldsChange: historyFieldsChange,
  } = useFieldHistory({
    fields,
    onFieldsChange,
    enableKeyboardShortcuts: true,
    containerRef: editorRef,
  });

  if (isMobileDevice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-4">
          <Settings2 className="h-8 w-8 text-blue-500" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Field Mapping Requires Desktop</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Placing fields on documents requires precise drag-and-drop which works best on a larger screen. Please use a desktop or tablet to map fields on your templates.
        </p>
        {fields.length > 0 && (
          <p className="text-xs text-muted-foreground mb-4">
            This template already has {fields.length} field{fields.length > 1 ? 's' : ''} mapped and is ready to use.
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} data-testid="button-back-mobile">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {fields.length > 0 && (
            <Button onClick={onSave} disabled={saving} data-testid="button-save-mobile">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Save Template
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Load PDF
  useEffect(() => {
    if (!pdfData) return;

    const loadPdf = async () => {
      setLoading(true);
      try {
        const base64Data = pdfData.includes(",") ? pdfData.split(",")[1] : pdfData;
        const binaryData = atob(base64Data);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          bytes[i] = binaryData.charCodeAt(i);
        }

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error loading PDF:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfData]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d")!;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageWidth(viewport.width);
      setPageHeight(viewport.height);

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    };

    renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, scale]);

  // Get fields for current page
  const currentPageFields = fields.filter((f) => f.page === currentPage);

  // Get field type config
  const getFieldTypeConfig = (type: FieldType) => {
    return FIELD_TYPES.find((t) => t.type === type) || FIELD_TYPES[0];
  };

  // Get signer role by ID
  const getSignerRole = (roleId: string) => {
    return signerRoles.find((r) => r.id === roleId);
  };

  // Add a new field (with history)
  const addField = (type: FieldType, x: number, y: number, groupId?: string) => {
    const defaultRole = signerRoles[0];
    if (!defaultRole) return;

    const fieldCount = fields.filter(f => f.type === type).length;

    const newField: TemplateField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: type === 'checkbox'
        ? `Checkbox ${fieldCount + 1}`
        : `${getFieldTypeConfig(type).label} ${fields.length + 1}`,
      type,
      required: type === "signature" || type === "initials",
      x,
      y,
      width: DEFAULT_FIELD_SIZES[type].width,
      height: DEFAULT_FIELD_SIZES[type].height,
      page: currentPage,
      signerRoleId: defaultRole.id,
      groupId: groupId || (type === 'checkbox' ? `group-${Date.now()}` : undefined),
    };

    historyFieldsChange([...fields, newField], `add ${type} field`);
    setSelectedFieldId(newField.id);
    setActiveToolType(null);

    return newField;
  };

  // Align checkbox group
  const handleAlignGroup = (groupId: string, alignment: 'left' | 'center' | 'right' | 'distribute-h' | 'distribute-v') => {
    const groupFields = fields.filter(f => f.groupId === groupId);
    if (groupFields.length < 2) return;

    const otherFields = fields.filter(f => f.groupId !== groupId);
    let updatedGroupFields: TemplateField[];

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...groupFields.map(f => f.x));
        updatedGroupFields = groupFields.map(f => ({ ...f, x: minX }));
        break;
      }
      case 'center': {
        const avgX = groupFields.reduce((sum, f) => sum + f.x + f.width / 2, 0) / groupFields.length;
        updatedGroupFields = groupFields.map(f => ({ ...f, x: avgX - f.width / 2 }));
        break;
      }
      case 'right': {
        const maxX = Math.max(...groupFields.map(f => f.x + f.width));
        updatedGroupFields = groupFields.map(f => ({ ...f, x: maxX - f.width }));
        break;
      }
      case 'distribute-h': {
        const sortedByX = [...groupFields].sort((a, b) => a.x - b.x);
        const minX = sortedByX[0].x;
        const maxX = sortedByX[sortedByX.length - 1].x;
        const spacing = (maxX - minX) / (groupFields.length - 1);
        updatedGroupFields = sortedByX.map((f, i) => ({ ...f, x: minX + spacing * i }));
        break;
      }
      case 'distribute-v': {
        const sortedByY = [...groupFields].sort((a, b) => a.y - b.y);
        const minY = sortedByY[0].y;
        const maxY = sortedByY[sortedByY.length - 1].y;
        const spacing = (maxY - minY) / (groupFields.length - 1);
        updatedGroupFields = sortedByY.map((f, i) => ({ ...f, y: minY + spacing * i }));
        break;
      }
      default:
        updatedGroupFields = groupFields;
    }

    historyFieldsChange([...otherFields, ...updatedGroupFields], 'align checkbox group');
  };

  // Add another checkbox in the same group (DocuSign-style) - with history
  const addAnotherCheckbox = (sourceField: TemplateField) => {
    const defaultRole = signerRoles.find(r => r.id === sourceField.signerRoleId) || signerRoles[0];
    if (!defaultRole) return;

    const groupCheckboxes = fields.filter(f => f.groupId === sourceField.groupId);

    const newField: TemplateField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Checkbox ${groupCheckboxes.length + 1}`,
      type: 'checkbox',
      required: sourceField.required,
      x: sourceField.x + 30,
      y: sourceField.y,
      width: DEFAULT_FIELD_SIZES.checkbox.width,
      height: DEFAULT_FIELD_SIZES.checkbox.height,
      page: sourceField.page,
      signerRoleId: sourceField.signerRoleId,
      groupId: sourceField.groupId,
    };

    historyFieldsChange([...fields, newField], 'add checkbox to group');
    setSelectedFieldId(newField.id);
  };

  // Update a field (for drag operations - no history for continuous updates)
  const updateField = (fieldId: string, updates: Partial<TemplateField>) => {
    onFieldsChange(
      fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    );
  };

  // Update a field with history (for discrete operations)
  const updateFieldWithHistory = (fieldId: string, updates: Partial<TemplateField>, action: string) => {
    historyFieldsChange(
      fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
      action
    );
  };

  // Delete a field (with history)
  const deleteField = (fieldId: string) => {
    historyFieldsChange(fields.filter((f) => f.id !== fieldId), 'delete field');
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  };

  // Handle canvas click to add field
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeToolType) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    addField(activeToolType, x, y);
  };

  // Handle field drag start
  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    setSelectedFieldId(fieldId);

    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingField(fieldId);
    setDragOffset({
      x: e.clientX - rect.left - field.x,
      y: e.clientY - rect.top - field.y,
    });
  };

  // Handle resize start with handle type
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    fieldId: string,
    handle: ResizeHandle
  ) => {
    e.stopPropagation();
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    setResizingField(fieldId);
    setResizeHandle(handle);
    setInitialResizeState({
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
    });
  };

  // Handle mouse move for drag/resize with constraints
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingField) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const field = fields.find(f => f.id === draggingField);
        if (!field) return;

        let x = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, pageWidth - field.width));
        let y = Math.max(0, Math.min(e.clientY - rect.top - dragOffset.y, pageHeight - field.height));

        // Calculate alignment guides
        const updatedField = { ...field, x, y };
        const otherFields = fields.filter(f => f.id !== draggingField && f.page === currentPage);
        const guides = calculateAlignmentGuides(updatedField, otherFields, pageWidth, pageHeight);
        setAlignmentGuides(guides);

        // Snap to guides
        const snapped = snapToGuides(updatedField, guides);
        x = Math.max(0, Math.min(snapped.x, pageWidth - field.width));
        y = Math.max(0, Math.min(snapped.y, pageHeight - field.height));

        updateField(draggingField, { x, y });
      }

      if (resizingField && resizeHandle && initialResizeState) {
        const field = fields.find((f) => f.id === resizingField);
        if (!field) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const constraints = FIELD_SIZE_CONSTRAINTS[field.type];
        const deltaX = e.clientX - initialResizeState.mouseX;
        const deltaY = e.clientY - initialResizeState.mouseY;

        let newWidth = initialResizeState.width;
        let newHeight = initialResizeState.height;
        let newX = initialResizeState.x;
        let newY = initialResizeState.y;

        // Handle resize based on handle type
        if (resizeHandle.includes('e')) {
          newWidth = Math.max(constraints.minWidth, Math.min(constraints.maxWidth, initialResizeState.width + deltaX));
        }
        if (resizeHandle.includes('w')) {
          const proposedWidth = initialResizeState.width - deltaX;
          newWidth = Math.max(constraints.minWidth, Math.min(constraints.maxWidth, proposedWidth));
          newX = initialResizeState.x + (initialResizeState.width - newWidth);
        }
        if (resizeHandle.includes('s')) {
          newHeight = Math.max(constraints.minHeight, Math.min(constraints.maxHeight, initialResizeState.height + deltaY));
        }
        if (resizeHandle.includes('n')) {
          const proposedHeight = initialResizeState.height - deltaY;
          newHeight = Math.max(constraints.minHeight, Math.min(constraints.maxHeight, proposedHeight));
          newY = initialResizeState.y + (initialResizeState.height - newHeight);
        }

        // Ensure field stays within page bounds
        newX = Math.max(0, Math.min(newX, pageWidth - newWidth));
        newY = Math.max(0, Math.min(newY, pageHeight - newHeight));

        updateField(resizingField, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [draggingField, resizingField, resizeHandle, initialResizeState, dragOffset, fields, pageWidth, pageHeight, currentPage]
  );

  // Handle mouse up - save to history
  const handleMouseUp = useCallback(() => {
    // If we were dragging or resizing, save to history
    if (draggingField) {
      const field = fields.find(f => f.id === draggingField);
      if (field) {
        historyFieldsChange(fields, 'move field');
      }
    }
    if (resizingField) {
      const field = fields.find(f => f.id === resizingField);
      if (field) {
        historyFieldsChange(fields, 'resize field');
      }
    }

    setDraggingField(null);
    setResizingField(null);
    setResizeHandle(null);
    setInitialResizeState(null);
    setAlignmentGuides([]);
  }, [draggingField, resizingField, fields, historyFieldsChange]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!draggingField && !resizingField) return;
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
  }, [handleMouseMove, draggingField, resizingField]);

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  useEffect(() => {
    if (draggingField || resizingField) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [draggingField, resizingField, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Add signer role
  const addSignerRole = () => {
    const newRole: SignerRole = {
      id: `role-${Date.now()}`,
      name: `Signer ${signerRoles.length + 1}`,
      order: signerRoles.length + 1,
      color: SIGNER_COLORS[signerRoles.length % SIGNER_COLORS.length],
    };
    onSignerRolesChange([...signerRoles, newRole]);
  };

  // Update signer role
  const updateSignerRole = (roleId: string, updates: Partial<SignerRole>) => {
    onSignerRolesChange(
      signerRoles.map((r) => (r.id === roleId ? { ...r, ...updates } : r))
    );
  };

  // Delete signer role
  const deleteSignerRole = (roleId: string) => {
    if (signerRoles.length <= 1) return;

    // Reassign fields to first remaining role
    const remainingRoles = signerRoles.filter((r) => r.id !== roleId);
    const newRoleId = remainingRoles[0].id;

    onFieldsChange(
      fields.map((f) =>
        f.signerRoleId === roleId ? { ...f, signerRoleId: newRoleId } : f
      )
    );
    onSignerRolesChange(remainingRoles);
  };

  // Validation
  const hasSignatureFields = fields.some((f) => f.type === "signature");
  const allRolesHaveFields = signerRoles.every((role) =>
    fields.some((f) => f.signerRoleId === role.id)
  );
  const canActivate = hasSignatureFields && fields.length > 0;

  const selectedField = selectedFieldId
    ? fields.find((f) => f.id === selectedFieldId)
    : null;

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

  return (
    <div ref={editorRef} className="fixed inset-0 z-50 bg-background flex flex-col" tabIndex={-1}>
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-2 md:px-4 bg-background shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0">
            <X className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Cancel</span>
          </Button>
          <div className="h-6 w-px bg-border hidden md:block" />

          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo}
                    className="h-8 w-8 p-0"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Undo <kbd className="ml-1 text-xs opacity-60">Ctrl+Z</kbd></p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={redo}
                    disabled={!canRedo}
                    className="h-8 w-8 p-0"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Redo <kbd className="ml-1 text-xs opacity-60">Ctrl+Shift+Z</kbd></p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <div className="h-6 w-px bg-border hidden md:block" />
          <div className="hidden md:block min-w-0">
            <h1 className="font-semibold truncate">{templateName}</h1>
            <p className="text-xs text-muted-foreground">
              Map fields to create a reusable template
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-sm">
            {!hasSignatureFields && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertCircle className="h-3 w-3 mr-1" />
                Add signature field
              </Badge>
            )}
            {fields.length === 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertCircle className="h-3 w-3 mr-1" />
                No fields added
              </Badge>
            )}
            {canActivate && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                <Check className="h-3 w-3 mr-1" />
                Ready to activate
              </Badge>
            )}
          </div>

          <Button
            onClick={onSave}
            disabled={saving || !canActivate}
            size="sm"
            className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 md:mr-2" />
            )}
            <span className="hidden md:inline">Save & Activate</span>
            <span className="md:hidden">Save</span>
          </Button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex border-b bg-muted/30 shrink-0">
        <button
          onClick={() => setMobilePanel('fields')}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors",
            mobilePanel === 'fields'
              ? "border-[hsl(var(--pearsign-primary))] text-[hsl(var(--pearsign-primary))]"
              : "border-transparent text-muted-foreground"
          )}
        >
          Add Fields
        </button>
        <button
          onClick={() => setMobilePanel('pdf')}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors",
            mobilePanel === 'pdf'
              ? "border-[hsl(var(--pearsign-primary))] text-[hsl(var(--pearsign-primary))]"
              : "border-transparent text-muted-foreground"
          )}
        >
          Document
        </button>
        <button
          onClick={() => setMobilePanel('properties')}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors",
            mobilePanel === 'properties'
              ? "border-[hsl(var(--pearsign-primary))] text-[hsl(var(--pearsign-primary))]"
              : "border-transparent text-muted-foreground"
          )}
        >
          Roles & Props
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar - Field Types */}
        <div className={cn(
          "w-44 border-r bg-muted/30 flex flex-col py-4 px-3 gap-1 shrink-0 overflow-y-auto",
          "max-md:w-full max-md:flex-1",
          mobilePanel !== 'fields' && "max-md:hidden"
        )}>
          <p className="text-xs font-semibold text-foreground mb-3 px-2">
            Add Fields
          </p>
          <p className="text-[10px] text-muted-foreground mb-2 px-2">
            Click a field, then click on the document to place it
          </p>
          {FIELD_TYPES.map((fieldType) => {
            const Icon = fieldType.icon;
            const isActive = activeToolType === fieldType.type;
            return (
              <button
                key={fieldType.type}
                onClick={() => {
                  setActiveToolType(isActive ? null : fieldType.type);
                  if (!isActive) setMobilePanel('pdf');
                }}
                className={cn(
                  "w-full h-11 rounded-lg flex items-center gap-3 px-3 transition-all text-left border",
                  isActive
                    ? "bg-[hsl(var(--pearsign-primary))] text-white shadow-md border-[hsl(var(--pearsign-primary))]"
                    : "hover:bg-muted border-transparent hover:border-border"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                  isActive ? "bg-white/20" : fieldType.bgColor
                )}>
                  <Icon
                    className="h-4 w-4"
                    style={{ color: isActive ? "white" : fieldType.color }}
                  />
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  isActive ? "text-white" : "text-foreground"
                )}>
                  {fieldType.label}
                </span>
              </button>
            );
          })}

          {/* Instructions */}
          <div className="mt-4 pt-4 border-t px-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <strong>Tip:</strong> Drag fields to reposition. Resize from corners or edges. Click to select and edit properties.
            </p>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden bg-muted/50",
          mobilePanel !== 'pdf' && "max-md:hidden"
        )}>
          {/* Page Controls */}
          <div className="h-12 border-b bg-background flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm min-w-[100px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale((s) => Math.min(2, s + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 overflow-auto p-2 md:p-8">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                ref={containerRef}
                className={cn(
                  "relative mx-auto bg-white shadow-xl",
                  activeToolType && "cursor-crosshair"
                )}
                style={{ width: pageWidth, height: pageHeight }}
                onClick={handleCanvasClick}
              >
                <canvas ref={canvasRef} className="absolute inset-0" />

                {/* Alignment Guides */}
                {alignmentGuides.length > 0 && (
                  <AlignmentGuidesRenderer
                    guides={alignmentGuides}
                    containerWidth={pageWidth}
                    containerHeight={pageHeight}
                  />
                )}

                {/* Rendered Fields */}
                {currentPageFields.map((field) => {
                  const typeConfig = getFieldTypeConfig(field.type);
                  const role = getSignerRole(field.signerRoleId);
                  const Icon = typeConfig.icon;
                  const isSelected = selectedFieldId === field.id;
                  const isCheckbox = field.type === 'checkbox';

                  return (
                    <div
                      key={field.id}
                      className={cn(
                        "absolute border-2 rounded cursor-move transition-shadow group/field",
                        isSelected
                          ? "border-[hsl(var(--pearsign-primary))] shadow-lg ring-2 ring-[hsl(var(--pearsign-primary))]/20"
                          : "border-dashed hover:border-solid"
                      )}
                      style={{
                        left: field.x,
                        top: field.y,
                        width: field.width,
                        height: field.height,
                        borderColor: role?.color || "#2563eb",
                        backgroundColor: `${role?.color || "#2563eb"}15`,
                      }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        const touch = e.touches[0];
                        setSelectedFieldId(field.id);
                        const field_ = fields.find((f) => f.id === field.id);
                        if (!field_) return;
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        setDraggingField(field.id);
                        setDragOffset({ x: touch.clientX - rect.left - field_.x, y: touch.clientY - rect.top - field_.y });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFieldId(field.id);
                      }}
                    >
                      {/* Field Content */}
                      <div className="absolute inset-0 flex items-center justify-center gap-1 text-xs font-medium opacity-70">
                        <Icon className="h-3 w-3" style={{ color: role?.color }} />
                        <span style={{ color: role?.color }}>{field.name}</span>
                        {field.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </div>

                      {/* Role Badge */}
                      <div
                        className="absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                        style={{ backgroundColor: role?.color }}
                      >
                        {role?.name}
                      </div>

                      {/* + Add Another Button for Checkboxes */}
                      {isCheckbox && isSelected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addAnotherCheckbox(field);
                          }}
                          className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[hsl(var(--pearsign-primary))] text-white flex items-center justify-center shadow-md hover:bg-[hsl(var(--pearsign-primary))]/90 transition-colors z-20"
                          title="Add another checkbox"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}

                      {/* Resize Handles (when selected) */}
                      {isSelected && (
                        <>
                          {/* Corners */}
                          {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((corner) => (
                            <div
                              key={corner}
                              className={cn(
                                "absolute w-3 h-3 bg-white border-2 rounded-sm z-10",
                                corner === "nw" && "-top-1.5 -left-1.5",
                                corner === "ne" && "-top-1.5 -right-1.5",
                                corner === "sw" && "-bottom-1.5 -left-1.5",
                                corner === "se" && "-bottom-1.5 -right-1.5"
                              )}
                              style={{
                                borderColor: role?.color,
                                cursor: getResizeCursor(corner),
                              }}
                              onMouseDown={(e) =>
                                handleResizeMouseDown(e, field.id, corner)
                              }
                            />
                          ))}
                          {/* Edges */}
                          {(["n", "s", "e", "w"] as ResizeHandle[]).map((edge) => (
                            <div
                              key={edge}
                              className={cn(
                                "absolute bg-white border-2 rounded-sm z-10",
                                edge === "n" && "-top-1.5 left-1/2 -translate-x-1/2 w-3 h-3",
                                edge === "s" && "-bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3",
                                edge === "e" && "top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3",
                                edge === "w" && "top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3"
                              )}
                              style={{
                                borderColor: role?.color,
                                cursor: getResizeCursor(edge),
                              }}
                              onMouseDown={(e) =>
                                handleResizeMouseDown(e, field.id, edge)
                              }
                            />
                          ))}
                        </>
                      )}

                      {/* Delete button */}
                      <button
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover/field:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteField(field.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}

                {/* Click hint when tool is active */}
                {activeToolType && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="bg-black/50 text-white px-4 py-2 rounded-lg text-sm">
                      Click to place {getFieldTypeConfig(activeToolType).label.toLowerCase()} field
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Properties & Roles */}
        <div className={cn(
          "w-80 border-l bg-background flex flex-col shrink-0",
          "max-md:w-full max-md:border-l-0",
          mobilePanel !== 'properties' && "max-md:hidden"
        )}>
          {/* Signer Roles Section */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Signer Roles
              </h3>
              <Button variant="outline" size="sm" onClick={addSignerRole}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {signerRoles.map((role, index) => (
                <div
                  key={role.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: role.color }}
                  />
                  <Input
                    value={role.name}
                    onChange={(e) =>
                      updateSignerRole(role.id, { name: e.target.value })
                    }
                    className="h-7 text-sm flex-1"
                  />
                  <span className="text-xs text-muted-foreground">
                    #{index + 1}
                  </span>
                  {signerRoles.length > 1 && (
                    <button
                      onClick={() => deleteSignerRole(role.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Field Properties */}
          {selectedField ? (
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="font-medium flex items-center gap-2 mb-4">
                <Settings2 className="h-4 w-4" />
                Field Properties
              </h3>

              <div className="space-y-4">
                {/* Field Name */}
                <div className="space-y-2">
                  <Label>Field Name</Label>
                  <Input
                    value={selectedField.name}
                    onChange={(e) =>
                      updateFieldWithHistory(selectedField.id, { name: e.target.value }, "edit field name")
                    }
                  />
                </div>

                {/* Field Type */}
                <div className="space-y-2">
                  <Label>Field Type</Label>
                  <Select
                    value={selectedField.type}
                    onValueChange={(v) =>
                      updateFieldWithHistory(selectedField.id, {
                        type: v as FieldType,
                        ...DEFAULT_FIELD_SIZES[v as FieldType],
                      }, "change field type")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((ft) => {
                        const Icon = ft.icon;
                        return (
                          <SelectItem key={ft.type} value={ft.type}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {ft.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assigned Role */}
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select
                    value={selectedField.signerRoleId}
                    onValueChange={(v) =>
                      updateFieldWithHistory(selectedField.id, { signerRoleId: v }, "change assigned role")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {signerRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: role.color }}
                            />
                            {role.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Required Toggle */}
                <div className="flex items-center justify-between">
                  <Label>Required</Label>
                  <Switch
                    checked={selectedField.required}
                    onCheckedChange={(checked) =>
                      updateFieldWithHistory(selectedField.id, { required: checked }, "toggle required")
                    }
                  />
                </div>

                {/* Placeholder (for text fields) */}
                {["text", "email", "company", "address", "phone", "number"].includes(
                  selectedField.type
                ) && (
                  <div className="space-y-2">
                    <Label>Placeholder</Label>
                    <Input
                      value={selectedField.placeholder || ""}
                      onChange={(e) =>
                        updateFieldWithHistory(selectedField.id, {
                          placeholder: e.target.value,
                        }, "edit placeholder")
                      }
                      placeholder="Enter placeholder text..."
                    />
                  </div>
                )}

                {/* Position & Size */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Position & Size</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">X</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.x)}
                        onChange={(e) =>
                          updateFieldWithHistory(selectedField.id, {
                            x: parseInt(e.target.value) || 0,
                          }, "edit x position")
                        }
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Y</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.y)}
                        onChange={(e) =>
                          updateFieldWithHistory(selectedField.id, {
                            y: parseInt(e.target.value) || 0,
                          }, "edit y position")
                        }
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Width</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.width)}
                        min={FIELD_SIZE_CONSTRAINTS[selectedField.type].minWidth}
                        max={FIELD_SIZE_CONSTRAINTS[selectedField.type].maxWidth}
                        onChange={(e) => {
                          let val = parseInt(e.target.value) || FIELD_SIZE_CONSTRAINTS[selectedField.type].minWidth;
                          val = Math.max(FIELD_SIZE_CONSTRAINTS[selectedField.type].minWidth, Math.min(FIELD_SIZE_CONSTRAINTS[selectedField.type].maxWidth, val));
                          updateFieldWithHistory(selectedField.id, {
                            width: val,
                          }, "edit width");
                        }}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Height</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.height)}
                        min={FIELD_SIZE_CONSTRAINTS[selectedField.type].minHeight}
                        max={FIELD_SIZE_CONSTRAINTS[selectedField.type].maxHeight}
                        onChange={(e) => {
                          let val = parseInt(e.target.value) || FIELD_SIZE_CONSTRAINTS[selectedField.type].minHeight;
                          val = Math.max(FIELD_SIZE_CONSTRAINTS[selectedField.type].minHeight, Math.min(FIELD_SIZE_CONSTRAINTS[selectedField.type].maxHeight, val));
                          updateFieldWithHistory(selectedField.id, {
                            height: val,
                          }, "edit height");
                        }}
                        className="h-8"
                      />
                    </div>
                  </div>
                </div>

                {/* Delete Field */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => deleteField(selectedField.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Field
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4 text-center text-muted-foreground">
              <div>
                <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a field to edit its properties</p>
                <p className="text-xs mt-1">
                  Or click a field type on the left and click on the document to
                  add it
                </p>
              </div>
            </div>
          )}

          {/* Field Summary */}
          <div className="p-4 border-t bg-muted/30">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              Field Summary
            </h4>
            <div className="space-y-1">
              {signerRoles.map((role) => {
                const roleFields = fields.filter(
                  (f) => f.signerRoleId === role.id
                );
                return (
                  <div
                    key={role.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span>{role.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {roleFields.length} field{roleFields.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
