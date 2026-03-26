"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Type,
  Calendar,
  CheckCircle2,
  Download,
  Loader2,
  Trash2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  X,
  Save,
  User,
  Mail,
  Building,
  Briefcase,
  CheckSquare,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface SelfSignFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFile?: File;
}

type Step = "upload" | "sign" | "complete";

interface SignatureField {
  id: string;
  type: "signature" | "initials" | "date" | "fullname" | "email" | "text" | "checkbox" | "company" | "jobtitle";
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  value?: string;
  required?: boolean;
}

const SIGNATURE_FONTS = [
  { name: "Elegant", family: "Georgia, serif", style: "italic" },
  { name: "Classic", family: "Times New Roman, serif", style: "italic" },
  { name: "Script", family: "cursive", style: "normal" },
  { name: "Bold", family: "Palatino, serif", style: "italic" },
];

type SelfSignFieldGroup = 'signature' | 'data' | 'other';

interface SelfSignFieldType {
  type: SignatureField['type'];
  icon: typeof PenTool;
  label: string;
  color: string;
  bgLight: string;
  bgCanvas: string;
  borderCanvas: string;
  defaultSize: { w: number; h: number };
  group: SelfSignFieldGroup;
}

const FIELD_TYPES: SelfSignFieldType[] = [
  { type: "signature", icon: PenTool, label: "Signature", color: "#2563eb", bgLight: "bg-blue-50 dark:bg-blue-950/50", bgCanvas: "rgba(37,99,235,0.06)", borderCanvas: "#3b82f6", defaultSize: { w: 200, h: 60 }, group: "signature" },
  { type: "initials", icon: Type, label: "Initials", color: "#2563eb", bgLight: "bg-blue-50 dark:bg-blue-950/50", bgCanvas: "rgba(37,99,235,0.06)", borderCanvas: "#3b82f6", defaultSize: { w: 80, h: 40 }, group: "signature" },
  { type: "date", icon: Calendar, label: "Date Signed", color: "#ea580c", bgLight: "bg-orange-50 dark:bg-orange-950/50", bgCanvas: "rgba(234,88,12,0.06)", borderCanvas: "#f97316", defaultSize: { w: 120, h: 30 }, group: "data" },
  { type: "fullname", icon: User, label: "Full Name", color: "#7c3aed", bgLight: "bg-violet-50 dark:bg-violet-950/50", bgCanvas: "rgba(124,58,237,0.06)", borderCanvas: "#8b5cf6", defaultSize: { w: 180, h: 30 }, group: "data" },
  { type: "email", icon: Mail, label: "Email", color: "#059669", bgLight: "bg-emerald-50 dark:bg-emerald-950/50", bgCanvas: "rgba(5,150,105,0.06)", borderCanvas: "#10b981", defaultSize: { w: 200, h: 30 }, group: "data" },
  { type: "text", icon: Type, label: "Text Field", color: "#6b7280", bgLight: "bg-gray-50 dark:bg-gray-800/50", bgCanvas: "rgba(107,114,128,0.06)", borderCanvas: "#9ca3af", defaultSize: { w: 150, h: 30 }, group: "other" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox", color: "#0d9488", bgLight: "bg-teal-50 dark:bg-teal-950/50", bgCanvas: "rgba(13,148,136,0.06)", borderCanvas: "#14b8a6", defaultSize: { w: 24, h: 24 }, group: "other" },
  { type: "company", icon: Building, label: "Company", color: "#4f46e5", bgLight: "bg-indigo-50 dark:bg-indigo-950/50", bgCanvas: "rgba(79,70,229,0.06)", borderCanvas: "#6366f1", defaultSize: { w: 180, h: 30 }, group: "data" },
  { type: "jobtitle", icon: Briefcase, label: "Job Title", color: "#7c3aed", bgLight: "bg-purple-50 dark:bg-purple-950/50", bgCanvas: "rgba(124,58,237,0.06)", borderCanvas: "#a78bfa", defaultSize: { w: 150, h: 30 }, group: "data" },
];

const SELF_SIGN_FIELD_GROUPS: { key: SelfSignFieldGroup; label: string }[] = [
  { key: "signature", label: "Signing" },
  { key: "data", label: "Contact Info" },
  { key: "other", label: "Other" },
];

export function SelfSignFlow({ open, onOpenChange, initialFile }: SelfSignFlowProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<SignatureField["type"] | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [signatureTab, setSignatureTab] = useState<"draw" | "type">("type");
  const [typedSignature, setTypedSignature] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [selectedFont, setSelectedFont] = useState(0);
  const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [certificateApplied, setCertificateApplied] = useState(false);
  const [certificateInfo, setCertificateInfo] = useState<{ subject: string; fingerprint: string } | null>(null);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showFieldSettings, setShowFieldSettings] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);

  // Dragging & resizing
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [resizingField, setResizingField] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [fieldStart, setFieldStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const isRenderingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initialFile) {
      setFile(initialFile);
      loadPdfFromFile(initialFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("upload");
        setFile(null);
        setPdfBytes(null);
        setFields([]);
        setSelectedFieldType(null);
        setSelectedFieldId(null);
        setCurrentPage(1);
        setTotalPages(1);
        setTypedSignature("");
        setSignerName("");
        setSignerEmail("");
        setSignedPdfBlob(null);
        setDrawnSignature(null);
        setZoom(1);
        setSavedDocumentId(null);
        setCertificateApplied(false);
        setCertificateInfo(null);
        setSigningError(null);
        setShowFieldSettings(false);
        pdfDocRef.current = null;
      }, 300);
    }
  }, [open]);

  const loadPdfFromFile = async (pdfFile: File) => {
    setIsLoadingPdf(true);
    try {
      if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
        toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
        return;
      }
      const arrayBuffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      setPdfBytes(bytes);

      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setStep("sign");
      setTimeout(() => renderPage(pdf, 1), 100);
    } catch (error) {
      console.error("Error loading PDF:", error);
      toast({ title: "Error", description: "Failed to load PDF.", variant: "destructive" });
      setStep("upload");
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas || isRenderingRef.current) return;
    isRenderingRef.current = true;

    try {
      const page = await pdf.getPage(pageNum);
      const scale = 1.5 * zoom;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    } catch (e) {
      console.error("Render error:", e);
    } finally {
      isRenderingRef.current = false;
    }
  };

  useEffect(() => {
    if (pdfDocRef.current && step === "sign") {
      renderPage(pdfDocRef.current, currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoom, step]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") {
      setFile(f);
      loadPdfFromFile(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); loadPdfFromFile(f); }
  };

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX || 0) : e.clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY || 0) : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!selectedFieldType || draggedField || resizingField) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getCanvasPos(e);
    const fieldInfo = FIELD_TYPES.find(f => f.type === selectedFieldType);
    const defaultW = fieldInfo?.defaultSize.w || 150;
    const defaultH = fieldInfo?.defaultSize.h || 40;

    const newField: SignatureField = {
      id: `field-${Date.now()}`,
      type: selectedFieldType,
      x: pos.x,
      y: pos.y,
      width: defaultW,
      height: defaultH,
      page: currentPage,
      required: true,
    };

    setFields([...fields, newField]);
    setSelectedFieldType(null);
    setSelectedFieldId(newField.id);
    setShowFieldSettings(true);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string, handle?: string) => {
    e.stopPropagation();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const pos = getCanvasPos(e);
    setDragStart(pos);
    setFieldStart({ x: field.x, y: field.y, w: field.width, h: field.height });
    setSelectedFieldId(fieldId);

    if (handle) {
      setResizingField(fieldId);
      setResizeHandle(handle);
    } else {
      setDraggedField(fieldId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedField && !resizingField) return;
    const pos = getCanvasPos(e);
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;

    if (draggedField) {
      setFields(fields.map(f => f.id === draggedField ? { ...f, x: fieldStart.x + dx, y: fieldStart.y + dy } : f));
    } else if (resizingField && resizeHandle) {
      const field = fields.find(f => f.id === resizingField);
      if (!field) return;

      let newW = fieldStart.w, newH = fieldStart.h, newX = fieldStart.x, newY = fieldStart.y;

      if (resizeHandle.includes('e')) newW = Math.max(30, fieldStart.w + dx);
      if (resizeHandle.includes('w')) { newW = Math.max(30, fieldStart.w - dx); newX = fieldStart.x + dx; }
      if (resizeHandle.includes('s')) newH = Math.max(20, fieldStart.h + dy);
      if (resizeHandle.includes('n')) { newH = Math.max(20, fieldStart.h - dy); newY = fieldStart.y + dy; }

      setFields(fields.map(f => f.id === resizingField ? { ...f, x: newX, y: newY, width: newW, height: newH } : f));
    }
  };

  const handleMouseUp = () => {
    setDraggedField(null);
    setResizingField(null);
    setResizeHandle(null);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedFieldId === id) { setSelectedFieldId(null); setShowFieldSettings(false); }
  };

  const updateFieldSize = (id: string, w: number, h: number) => {
    setFields(fields.map(f => f.id === id ? { ...f, width: w, height: h } : f));
  };

  const toggleFieldRequired = (id: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, required: !f.required } : f));
  };

  // Signature drawing
  const getSignPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX || 0) : e.clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY || 0) : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = signatureCanvasRef.current?.getContext("2d");
    if (ctx) { const pos = getSignPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = signatureCanvasRef.current?.getContext("2d");
    if (ctx) {
      const pos = getSignPos(e);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#2563EB"; // PearSign blue
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (signatureCanvasRef.current) setDrawnSignature(signatureCanvasRef.current.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const ctx = signatureCanvasRef.current?.getContext("2d");
    if (ctx && signatureCanvasRef.current) ctx.clearRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
    setDrawnSignature(null);
  };

  // Get effective signature (typed or drawn)
  const getSignatureText = () => typedSignature.trim() || signerName.trim() || "Signature";
  const getInitials = () => {
    const name = typedSignature.trim() || signerName.trim();
    if (!name) return "XX";
    return name.split(" ").map(n => n[0] || "").join("").toUpperCase().slice(0, 3);
  };

  const handleSign = async () => {
    if (!pdfBytes || !file) return;
    if (fields.length === 0) {
      toast({ title: "No fields", description: "Add at least one field.", variant: "destructive" });
      return;
    }

    // Must have signature input
    const hasSignatureField = fields.some(f => f.type === "signature");
    if (hasSignatureField && !typedSignature.trim() && !drawnSignature) {
      toast({ title: "No signature", description: "Please type or draw your signature.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);

    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

      const sigText = getSignatureText();
      const initials = getInitials();
      const dateText = new Date().toLocaleDateString();
      const timestamp = new Date().toLocaleString();
      const docId = `PS-${Date.now().toString(36).toUpperCase()}`;
      const nameText = signerName.trim() || sigText;
      const emailText = signerEmail.trim() || "email@example.com";

      // Embed drawn signature image if available
      let signatureImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
      if (drawnSignature && signatureTab === "draw") {
        try {
          const base64Data = drawnSignature.split(",")[1];
          signatureImage = await pdfDoc.embedPng(base64Data);
        } catch (err) {
          console.warn("Could not embed signature image:", err);
        }
      }

      // Add audit badge to first page
      const firstPage = pages[0];
      const { width: pw, height: ph } = firstPage.getSize();
      const badgeW = 150, badgeH = 35;
      const badgeX = pw - badgeW - 10, badgeY = ph - badgeH - 10;

      firstPage.drawRectangle({
        x: badgeX, y: badgeY, width: badgeW, height: badgeH,
        color: rgb(0.98, 0.98, 0.99),
        borderColor: rgb(0.1, 0.4, 0.5),
        borderWidth: 0.5,
      });
      firstPage.drawText("PS", { x: badgeX + 4, y: badgeY + badgeH - 12, size: 9, font: helveticaBold, color: rgb(0.1, 0.4, 0.5) });
      firstPage.drawText(`Signed: ${sigText.slice(0, 18)}`, { x: badgeX + 20, y: badgeY + badgeH - 11, size: 6, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      firstPage.drawText(timestamp, { x: badgeX + 20, y: badgeY + badgeH - 20, size: 5, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
      firstPage.drawText(`ID: ${docId}`, { x: badgeX + 20, y: badgeY + badgeH - 28, size: 5, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

      // Render each field
      const scale = 1.5 * zoom;
      for (const field of fields) {
        const page = pages[field.page - 1];
        if (!page) continue;
        const { width: pageW, height: pageH } = page.getSize();

        // Convert pixel coords to PDF coords
        const pdfX = (field.x / scale);
        const pdfY = pageH - (field.y / scale) - (field.height / scale);
        const pdfW = field.width / scale;
        const pdfH = field.height / scale;

        if (field.type === "signature") {
          // Background
          page.drawRectangle({
            x: pdfX, y: pdfY, width: pdfW, height: pdfH,
            color: rgb(0.98, 0.99, 1),
            borderColor: rgb(0.2, 0.4, 0.7),
            borderWidth: 0.75,
          });

          if (signatureImage) {
            // Draw signature image
            const imgDims = signatureImage.scale(1);
            const imgScale = Math.min((pdfW - 10) / imgDims.width, (pdfH - 10) / imgDims.height);
            page.drawImage(signatureImage, {
              x: pdfX + 5,
              y: pdfY + 5,
              width: imgDims.width * imgScale,
              height: imgDims.height * imgScale,
            });
          } else {
            const maxW = pdfW - 10;
            let fontSize = Math.min(pdfH * 0.6, 24);
            const tw = timesItalic.widthOfTextAtSize(sigText, fontSize);
            if (tw > maxW && maxW > 0) fontSize = Math.max(8, fontSize * (maxW / tw));
            page.drawText(sigText, {
              x: pdfX + 5,
              y: pdfY + pdfH / 2 - fontSize / 3,
              size: fontSize,
              font: timesItalic,
              color: rgb(0.1, 0.2, 0.4),
              maxWidth: maxW,
            });
          }

          // PS badge & timestamp
          page.drawText("PS", { x: pdfX + 2, y: pdfY + pdfH - 8, size: 6, font: helveticaBold, color: rgb(0.2, 0.4, 0.6) });
          page.drawText(timestamp, { x: pdfX + 2, y: pdfY + 2, size: 4, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

        } else if (field.type === "initials") {
          page.drawRectangle({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, borderColor: rgb(0.4, 0.2, 0.6), borderWidth: 0.75 });
          const maxW = pdfW - 6;
          let ifs = Math.min(14, pdfH * 0.65);
          const itw = timesItalic.widthOfTextAtSize(initials, ifs);
          if (itw > maxW && maxW > 0) ifs = Math.max(6, ifs * (maxW / itw));
          page.drawText(initials, { x: pdfX + 3, y: pdfY + (pdfH - ifs) / 2, size: ifs, font: timesItalic, color: rgb(0.2, 0.1, 0.4), maxWidth: maxW });

        } else if (field.type === "date") {
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(dateText, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(dateText, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });

        } else if (field.type === "fullname") {
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(nameText, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(nameText, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });

        } else if (field.type === "email") {
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(emailText, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(emailText, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });

        } else if (field.type === "text") {
          const val = field.value || "—";
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(val, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(val, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });

        } else if (field.type === "checkbox") {
          page.drawRectangle({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.5 });
          const checkSize = Math.min(12, pdfW - 4, pdfH - 4);
          page.drawText("✓", { x: pdfX + (pdfW - checkSize) / 2, y: pdfY + (pdfH - checkSize) / 2, size: checkSize, font: helveticaBold, color: rgb(0.1, 0.5, 0.3) });

        } else if (field.type === "company") {
          const val = field.value || "Company";
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(val, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(val, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });

        } else if (field.type === "jobtitle") {
          const val = field.value || "Job Title";
          const maxW = pdfW - 4;
          let fs = Math.min(10, pdfH * 0.65);
          const tw = helvetica.widthOfTextAtSize(val, fs);
          if (tw > maxW && maxW > 0) fs = Math.max(6, fs * (maxW / tw));
          page.drawText(val, { x: pdfX + 2, y: pdfY + (pdfH - fs) / 2, size: fs, font: helvetica, color: rgb(0.1, 0.1, 0.1), maxWidth: maxW });
        }
      }

      pdfDoc.setTitle(`${file.name.replace(".pdf", "")} - Signed`);
      pdfDoc.setCreator("PearSign");

      const pdfBytesOut = await pdfDoc.save();
      setSignedPdfBlob(new Blob([pdfBytesOut], { type: "application/pdf" }));

      // Save to API and apply digital certificate
      try {
        const uint8 = new Uint8Array(pdfBytesOut);
        const chunkSize = 8192;
        let binaryStr = '';
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binaryStr += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binaryStr);
        const res = await fetch('/api/self-sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name.replace('.pdf', ''),
            originalFilename: file.name,
            signedFilename: file.name.replace('.pdf', '_signed.pdf'),
            fileSize: pdfBytesOut.length,
            pageCount: totalPages,
            signerName: sigText,
            signatureStyle: signatureTab,
            fieldsCount: fields.length,
            pdfBase64: base64,
            fields: fields.map(f => ({ type: f.type, page: f.page })),
          }),
        });
        const data = await res.json();
        console.log('[SelfSign] API response:', { success: data.success, certificateApplied: data.certificateApplied, hasSignedPdf: !!data.signedPdfBase64, error: data.error });
        if (data.document?.id) setSavedDocumentId(data.document.id);
        if (data.certificateApplied && data.signedPdfBase64) {
          const signedBinaryStr = atob(data.signedPdfBase64);
          const signedBytes = new Uint8Array(signedBinaryStr.length);
          for (let i = 0; i < signedBinaryStr.length; i++) signedBytes[i] = signedBinaryStr.charCodeAt(i);
          setSignedPdfBlob(new Blob([signedBytes], { type: "application/pdf" }));
          setCertificateApplied(true);
          setCertificateInfo(data.certificateInfo || null);
        } else if (data.certificateError) {
          console.warn('[SelfSign] Certificate error:', data.certificateError);
          setSigningError(data.certificateError);
        } else if (data.error) {
          console.error('[SelfSign] API error:', data.error);
          setSigningError(data.error);
        }
      } catch (certErr) {
        console.error('[SelfSign] Certificate signing failed:', certErr);
        setSigningError('Could not apply digital certificate');
      }

      setStep("complete");
      toast({ title: "Signed!", description: "Document signed successfully." });
    } catch (error) {
      console.error("Sign error:", error);
      toast({ title: "Error", description: "Failed to sign document.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!signedPdfBlob || !file) return;
    const url = URL.createObjectURL(signedPdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(".pdf", "_signed.pdf");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <PenTool className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Sign Yourself</h1>
              {file && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{file.name}</p>}
            </div>
          </div>
        </div>

        {step === "sign" && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border rounded-lg px-2 py-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut className="h-3 w-3" /></Button>
              <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(2, z + 0.25))}><ZoomIn className="h-3 w-3" /></Button>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                <span className="text-xs">Page {currentPage} of {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {step === "sign" && (
            <Button onClick={handleSign} disabled={isProcessing || fields.length === 0}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Signing...</> : <>Sign & Download</>}
            </Button>
          )}
          {step === "complete" && (
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />Download
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Upload */}
        {step === "upload" && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn("w-full max-w-md border-2 border-dashed rounded-xl p-12 text-center transition-colors hover-elevate", isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30")}
            >
              {isLoadingPdf ? (
                <div className="flex flex-col items-center"><Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" /><p className="text-muted-foreground">Loading PDF...</p></div>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Upload PDF to Sign</h3>
                  <p className="text-sm text-muted-foreground mb-4">Drag & drop or click to browse</p>
                  <input type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" id="upload-pdf" />
                  <label htmlFor="upload-pdf">
                    <Button className="cursor-pointer" asChild><span>Choose File</span></Button>
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* Sign */}
        {step === "sign" && (
          <>
            {/* Left Sidebar */}
            <aside className="w-64 border-r bg-card p-4 overflow-y-auto flex flex-col">
              <div className="mb-4">
                <Label className="text-xs font-semibold text-foreground">Add Fields</Label>
                <p className="text-[10px] text-muted-foreground mt-1 mb-3">Select a field type, then click on the document to place it</p>
                <div className="space-y-3">
                  {SELF_SIGN_FIELD_GROUPS.map((group) => {
                    const groupFields = FIELD_TYPES.filter(f => f.group === group.key);
                    if (groupFields.length === 0) return null;
                    return (
                      <div key={group.key}>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                        <div className="mt-1.5 space-y-1">
                          {groupFields.map((fieldType) => {
                            const Icon = fieldType.icon;
                            const isActive = selectedFieldType === fieldType.type;
                            return (
                              <button
                                key={fieldType.type}
                                data-testid={`button-field-type-${fieldType.type}`}
                                onClick={() => setSelectedFieldType(isActive ? null : fieldType.type)}
                                className={cn(
                                  "w-full h-9 rounded-md flex items-center gap-2.5 px-2.5 transition-all text-left hover-elevate",
                                  isActive && "outline outline-2 outline-offset-1"
                                )}
                                style={isActive ? { backgroundColor: fieldType.bgCanvas, outlineColor: fieldType.borderCanvas } : undefined}
                              >
                                <div className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", fieldType.bgLight)}>
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

              {/* Signature Input */}
              <div className="mt-auto pt-4 border-t">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">YOUR SIGNATURE</h3>
                <Tabs value={signatureTab} onValueChange={(v) => setSignatureTab(v as "draw" | "type")}>
                  <TabsList className="w-full mb-2 h-8">
                    <TabsTrigger value="type" className="flex-1 text-xs">Type</TabsTrigger>
                    <TabsTrigger value="draw" className="flex-1 text-xs">Draw</TabsTrigger>
                  </TabsList>
                  <TabsContent value="type" className="space-y-2">
                    <Input value={typedSignature} onChange={e => setTypedSignature(e.target.value)} placeholder="Type signature" className="h-8 text-sm" />
                    <div className="flex gap-1">
                      {SIGNATURE_FONTS.map((f, i) => (
                        <button key={i} onClick={() => setSelectedFont(i)} className={cn("flex-1 p-1 border rounded text-center transition-colors hover-elevate", selectedFont === i ? "border-primary bg-primary/10" : "")}>
                          <span className="text-sm" style={{ fontFamily: f.family, fontStyle: f.style }}>Aa</span>
                        </button>
                      ))}
                    </div>
                    {typedSignature && (
                      <div className="p-2 bg-white border rounded text-center">
                        <span className="text-lg" style={{ fontFamily: SIGNATURE_FONTS[selectedFont].family, fontStyle: SIGNATURE_FONTS[selectedFont].style }}>{typedSignature}</span>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="draw" className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">Draw your signature below:</p>
                    <div className={cn(
                      "border-2 rounded bg-white transition-colors",
                      drawnSignature ? "border-green-400" : "border-dashed border-gray-300"
                    )}>
                      <canvas ref={signatureCanvasRef} width={220} height={80} className="w-full cursor-crosshair"
                        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                    </div>
                    {drawnSignature && (
                      <div className="flex items-center gap-1 text-[10px] text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Signature captured</span>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={clearSignature} className="w-full h-7 text-xs"><RotateCcw className="h-3 w-3 mr-1" />Clear & Redraw</Button>
                  </TabsContent>
                </Tabs>

                <div className="mt-3 space-y-2">
                  <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Full Name" className="h-8 text-sm" />
                  <Input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
                </div>
              </div>
            </aside>

            {/* Document Canvas */}
            <main ref={containerRef} className="flex-1 overflow-auto bg-muted/50 p-6" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
              <div className="flex justify-center">
                <div className={cn("relative bg-white shadow-lg", selectedFieldType && "cursor-crosshair")} onClick={handleCanvasClick}>
                  <canvas ref={canvasRef} className="block" />

                  {/* Field Overlays */}
                  {fields.filter(f => f.page === currentPage).map(field => {
                    const info = FIELD_TYPES.find(t => t.type === field.type);
                    const isSelected = selectedFieldId === field.id;
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "absolute group box-border",
                          isSelected ? "z-20" : "z-10"
                        )}
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height,
                          border: isSelected ? '2px solid #2563EB' : '2px dashed #2563EB80',
                          backgroundColor: 'transparent',
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                      >
                        {/* Header badge */}
                        <div
                          className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] text-white rounded-t flex items-center gap-1"
                          style={{ backgroundColor: info?.borderCanvas || '#3b82f6' }}
                        >
                          {info && <info.icon className="h-2.5 w-2.5" />}
                          {info?.label}{field.required && " *"}
                        </div>

                        {/* Content preview - transparent background */}
                        <div className="w-full h-full flex items-center justify-center text-xs text-blue-700 font-medium pointer-events-none overflow-hidden">
                          {field.type === "signature" && (
                            drawnSignature && signatureTab === "draw" ? (
                              <img
                                src={drawnSignature}
                                alt="Signature"
                                className="max-w-full max-h-full object-contain"
                                style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))' }}
                              />
                            ) : typedSignature ? (
                              <span className="text-lg italic" style={{ fontFamily: SIGNATURE_FONTS[selectedFont].family }}>
                                {typedSignature}
                              </span>
                            ) : (
                              <span className="text-gray-400">Signature</span>
                            )
                          )}
                          {field.type === "initials" && (
                            <span className="text-base italic" style={{ fontFamily: SIGNATURE_FONTS[selectedFont].family }}>
                              {getInitials()}
                            </span>
                          )}
                          {field.type === "date" && new Date().toLocaleDateString()}
                          {field.type === "fullname" && (signerName || <span className="text-gray-400">Full Name</span>)}
                          {field.type === "email" && (signerEmail || <span className="text-gray-400">Email</span>)}
                          {field.type === "text" && <span className="text-gray-400">Text</span>}
                          {field.type === "checkbox" && "✓"}
                          {field.type === "company" && <span className="text-gray-400">Company</span>}
                          {field.type === "jobtitle" && <span className="text-gray-400">Job Title</span>}
                        </div>

                        {/* Resize handles */}
                        {isSelected && (
                          <>
                            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-600 rounded-full cursor-nw-resize" onMouseDown={e => handleFieldMouseDown(e, field.id, 'nw')} />
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-600 rounded-full cursor-ne-resize" onMouseDown={e => handleFieldMouseDown(e, field.id, 'ne')} />
                            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-blue-600 rounded-full cursor-sw-resize" onMouseDown={e => handleFieldMouseDown(e, field.id, 'sw')} />
                            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-blue-600 rounded-full cursor-se-resize" onMouseDown={e => handleFieldMouseDown(e, field.id, 'se')} />
                            <div className="absolute top-1/2 -left-1 w-2 h-2 bg-blue-600 rounded-full cursor-w-resize -translate-y-1/2" onMouseDown={e => handleFieldMouseDown(e, field.id, 'w')} />
                            <div className="absolute top-1/2 -right-1 w-2 h-2 bg-blue-600 rounded-full cursor-e-resize -translate-y-1/2" onMouseDown={e => handleFieldMouseDown(e, field.id, 'e')} />
                            <div className="absolute -top-1 left-1/2 w-2 h-2 bg-blue-600 rounded-full cursor-n-resize -translate-x-1/2" onMouseDown={e => handleFieldMouseDown(e, field.id, 'n')} />
                            <div className="absolute -bottom-1 left-1/2 w-2 h-2 bg-blue-600 rounded-full cursor-s-resize -translate-x-1/2" onMouseDown={e => handleFieldMouseDown(e, field.id, 's')} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </main>

            {/* Field Settings Panel */}
            {selectedField && showFieldSettings && (
              <aside className="w-56 border-l bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Field Settings</h3>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFieldSettings(false)}><X className="h-4 w-4" /></Button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Required</Label>
                    <Switch checked={selectedField.required} onCheckedChange={() => toggleFieldRequired(selectedField.id)} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Width</Label>
                      <Input type="number" value={Math.round(selectedField.width)} onChange={e => updateFieldSize(selectedField.id, parseInt(e.target.value) || 50, selectedField.height)} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Height</Label>
                      <Input type="number" value={Math.round(selectedField.height)} onChange={e => updateFieldSize(selectedField.id, selectedField.width, parseInt(e.target.value) || 30)} className="h-8" />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="destructive" size="sm" className="flex-1" onClick={() => removeField(selectedField.id)}>
                      <Trash2 className="h-3 w-3 mr-1" />Delete
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => setShowFieldSettings(false)}>Done</Button>
                  </div>
                </div>
              </aside>
            )}
          </>
        )}

        {/* Complete */}
        {step === "complete" && (
          <div className="flex-1 flex items-center justify-center p-6">
            <Card className="w-full max-w-md">
              <CardContent className="pt-6 pb-6 space-y-5">
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Document Signed</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {file?.name}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span className="text-muted-foreground">Signer</span>
                    <span className="font-medium">{signerName || typedSignature || "Self"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span className="text-muted-foreground">Fields</span>
                    <span className="font-medium">{fields.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span className="text-muted-foreground">Pages</span>
                    <span className="font-medium">{totalPages}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span className="text-muted-foreground">Saved</span>
                    <span className="font-medium">
                      {savedDocumentId ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Local only</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2">
                    <span className="text-muted-foreground">Digital Certificate</span>
                    <span className="font-medium">
                      {certificateApplied ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <ShieldCheck className="h-3.5 w-3.5" /> Applied
                        </span>
                      ) : signingError ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5" /> Not applied
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </span>
                  </div>
                </div>

                {certificateApplied && certificateInfo && (
                  <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Digital Signature Embedded
                    </div>
                    <p className="text-muted-foreground">
                      Certificate: {certificateInfo.subject}
                    </p>
                  </div>
                )}

                {signingError && (
                  <div className="rounded-md bg-amber-500/10 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Certificate Warning
                    </div>
                    <p className="text-muted-foreground">
                      The document was signed but the digital certificate could not be applied. The PDF is still valid for download.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Close</Button>
                  <Button className="flex-1" onClick={handleDownload} data-testid="button-download-signed">
                    <Download className="h-4 w-4 mr-1.5" />Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
