"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
} from "lucide-react";
import { envelopesApi, documentsApi, Envelope } from "@/lib/api-client";
import * as pdfjsLib from 'pdfjs-dist';
import { usePinchZoom, pinchZoomStyles } from "@/hooks/use-pinch-zoom";

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface SendDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (envelope: Envelope) => void;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'cc';
  color: string;
}

interface SignatureField {
  id: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'name' | 'email';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  recipientId: string;
  required: boolean;
}

type Step = 'upload' | 'recipients' | 'fields' | 'review' | 'sending' | 'success';

// Demo mode flag
const DEMO_MODE = true;

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

export function SendDocumentDialog({ open, onOpenChange, onSuccess }: SendDocumentDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Document state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);

  // Envelope state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  // Recipients state
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', name: '', email: '', role: 'signer', color: RECIPIENT_COLORS[0] }
  ]);

  // Signature fields state
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<SignatureField['type']>('signature');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('1');

  // PDF rendering state
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Created envelope
  const [createdEnvelope, setCreatedEnvelope] = useState<Envelope | null>(null);

  // Dragging state
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Pinch-to-zoom for mobile devices
  const { touchHandlers } = usePinchZoom({
    minScale: 0.5,
    maxScale: 2,
    currentScale: zoom,
    onZoomChange: setZoom,
  });

  // Load PDF when file is selected and we're on the fields step
  useEffect(() => {
    if (!selectedFile || step !== 'fields') return;

    const loadPDF = async () => {
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF for field mapping');
      }
    };

    loadPDF();
  }, [selectedFile, step]);

  // Render PDF page with high-DPI support for crystal clear rendering
  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdfDocument.getPage(currentPage);

      // Get device pixel ratio for high-DPI displays (Retina, etc.)
      const pixelRatio = window.devicePixelRatio || 1;

      // Use a higher scale for crisp rendering, then scale down with CSS
      // Minimum 2x for good quality, scale up more at higher zoom levels
      const renderScale = Math.max(2, zoom) * pixelRatio;

      const displayViewport = page.getViewport({ scale: zoom });
      const renderViewport = page.getViewport({ scale: renderScale });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      // Set canvas resolution to high-DPI size
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;

      // Scale canvas back down with CSS to display size
      canvas.style.width = `${displayViewport.width}px`;
      canvas.style.height = `${displayViewport.height}px`;

      setPageWidth(displayViewport.width);
      setPageHeight(displayViewport.height);

      // Enable image smoothing for crisp rendering
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      await page.render({
        canvasContext: context,
        viewport: renderViewport,
      }).promise;
    };

    renderPage();
  }, [pdfDocument, currentPage, zoom]);

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
        color: RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length]
      }
    ]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id));
      // Also remove fields assigned to this recipient
      setFields(fields.filter(f => f.recipientId !== id));
    }
  };

  const updateRecipient = (id: string, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    ));
  };

  // Field mapping functions
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || draggingField) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate field dimensions based on type
    const fieldDimensions = {
      signature: { width: 200, height: 60 },
      initials: { width: 80, height: 40 },
      date: { width: 150, height: 30 },
      text: { width: 200, height: 30 },
      name: { width: 180, height: 30 },
      email: { width: 220, height: 30 },
    };

    const dims = fieldDimensions[selectedFieldType];

    const newField: SignatureField = {
      id: generateDemoId(),
      type: selectedFieldType,
      x: x - dims.width / 2,
      y: y - dims.height / 2,
      width: dims.width,
      height: dims.height,
      page: currentPage,
      recipientId: selectedRecipientId,
      required: true,
    };

    setFields([...fields, newField]);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    setDraggingField(fieldId);
    setDragOffset({
      x: e.clientX - field.x,
      y: e.clientY - field.y,
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingField || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x + rect.left;
    const newY = e.clientY - rect.top - dragOffset.y + rect.top;

    setFields(fields.map(f =>
      f.id === draggingField
        ? { ...f, x: Math.max(0, Math.min(newX, pageWidth - f.width)), y: Math.max(0, Math.min(newY, pageHeight - f.height)) }
        : f
    ));
  }, [draggingField, dragOffset, fields, pageWidth, pageHeight]);

  const handleMouseUp = () => {
    setDraggingField(null);
  };

  const deleteField = (fieldId: string) => {
    setFields(fields.filter(f => f.id !== fieldId));
  };

  const getRecipientById = (id: string) => recipients.find(r => r.id === id);

  const getFieldLabel = (type: SignatureField['type']) => {
    switch (type) {
      case 'signature': return 'Signature';
      case 'initials': return 'Initials';
      case 'date': return 'Date';
      case 'text': return 'Text';
      case 'name': return 'Name';
      case 'email': return 'Email';
    }
  };

  const getFieldIcon = (type: SignatureField['type']) => {
    switch (type) {
      case 'signature': return <PenTool className="h-3 w-3" />;
      case 'initials': return <Hash className="h-3 w-3" />;
      case 'date': return <Calendar className="h-3 w-3" />;
      case 'text': return <Type className="h-3 w-3" />;
      case 'name': return <User className="h-3 w-3" />;
      case 'email': return <Mail className="h-3 w-3" />;
    }
  };

  const handleUploadAndNext = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setError(null);

    try {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setUploadedDocumentId(generateDemoId());
        setStep('recipients');
      } else {
        const doc = await documentsApi.upload(selectedFile);
        setUploadedDocumentId(doc.id);
        setStep('recipients');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to upload document");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecipientsNext = () => {
    const validRecipients = recipients.filter(r => r.name && r.email);
    if (validRecipients.length === 0) {
      setError("Please add at least one recipient with name and email");
      return;
    }
    setError(null);
    setSelectedRecipientId(validRecipients[0].id);
    setStep('fields');
  };

  const handleFieldsNext = () => {
    if (fields.length === 0) {
      setError("Please add at least one signature field");
      return;
    }
    setError(null);
    setStep('review');
  };

  const handleSend = async () => {
    setIsLoading(true);
    setError(null);
    setStep('sending');

    try {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const demoEnvelope = createDemoEnvelope(title, message, recipients, fields);
        setCreatedEnvelope(demoEnvelope);
        setStep('success');
        onSuccess?.(demoEnvelope);
      } else {
        const envelope = await envelopesApi.create({
          title,
          description: message,
          signingOrder: 'sequential',
          enableReminders: true,
          allowDecline: true,
          message,
        });

        if (uploadedDocumentId) {
          await envelopesApi.addDocument(envelope.id, {
            documentId: uploadedDocumentId,
          });
        }

        for (const recipient of recipients.filter(r => r.name && r.email)) {
          await envelopesApi.addRecipient(envelope.id, {
            name: recipient.name,
            email: recipient.email,
            role: recipient.role,
            signingOrder: recipients.indexOf(recipient) + 1,
          });
        }

        const sentEnvelope = await envelopesApi.send(envelope.id);
        setCreatedEnvelope(sentEnvelope);
        setStep('success');
        onSuccess?.(sentEnvelope);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to send document");
      setStep('review');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setSelectedFile(null);
    setUploadedDocumentId(null);
    setTitle("");
    setMessage("");
    setRecipients([{ id: '1', name: '', email: '', role: 'signer', color: RECIPIENT_COLORS[0] }]);
    setFields([]);
    setCreatedEnvelope(null);
    setError(null);
    setPdfDocument(null);
    onOpenChange(false);
  };

  const validRecipients = recipients.filter(r => r.name && r.email);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'fields' ? "max-w-6xl h-[90vh]" : "max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && "Upload Document"}
            {step === 'recipients' && "Add Recipients"}
            {step === 'fields' && "Add Signature Fields"}
            {step === 'review' && "Review & Send"}
            {step === 'sending' && "Sending..."}
            {step === 'success' && "Document Sent!"}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && "Select a document to send for signature"}
            {step === 'recipients' && "Add the people who need to sign this document"}
            {step === 'fields' && "Click on the document to place signature fields"}
            {step === 'review' && "Review the details before sending"}
            {step === 'sending' && "Please wait while we send your document"}
            {step === 'success' && "Your document has been sent successfully"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        {step !== 'sending' && step !== 'success' && (
          <div className="flex items-center justify-center gap-2 py-2">
            {['upload', 'recipients', 'fields', 'review'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s
                    ? 'bg-[hsl(var(--pearsign-primary))] text-white'
                    : ['upload', 'recipients', 'fields', 'review'].indexOf(step) > i
                      ? 'bg-[hsl(var(--pearsign-primary))]/20 text-[hsl(var(--pearsign-primary))]'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                {i < 3 && <div className={`w-8 h-0.5 ${['upload', 'recipients', 'fields', 'review'].indexOf(step) > i ? 'bg-[hsl(var(--pearsign-primary))]' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                selectedFile ? 'border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5' : 'border-muted-foreground/25 hover:border-[hsl(var(--pearsign-primary))]/50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-10 w-10 text-[hsl(var(--pearsign-primary))]" />
                  <div className="text-left">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="font-medium mb-1">Drag & drop your document here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <input
                    type="file"
                    id="doc-upload"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                  />
                  <Button asChild variant="outline">
                    <label htmlFor="doc-upload" className="cursor-pointer">
                      Browse Files
                    </label>
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleUploadAndNext}
                disabled={!selectedFile || !title || isLoading}
                className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Recipients */}
        {step === 'recipients' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {recipients.map((recipient, index) => (
                <Card key={recipient.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                      style={{ backgroundColor: recipient.color }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          placeholder="Recipient name"
                          value={recipient.name}
                          onChange={(e) => updateRecipient(recipient.id, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Email</Label>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={recipient.email}
                          onChange={(e) => updateRecipient(recipient.id, 'email', e.target.value)}
                        />
                      </div>
                    </div>
                    {recipients.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeRecipient(recipient.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Button variant="outline" onClick={addRecipient} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add Another Recipient
            </Button>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleRecipientsNext}
                className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
              >
                Next: Add Fields <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Field Mapping */}
        {step === 'fields' && (
          <div className="flex gap-4 h-[calc(90vh-180px)]">
            {/* Left sidebar - Field tools */}
            <div className="w-64 shrink-0 space-y-4 overflow-y-auto">
              {/* Recipient selector */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">ASSIGN TO</Label>
                <div className="space-y-1">
                  {validRecipients.map((recipient, index) => (
                    <button
                      key={recipient.id}
                      onClick={() => setSelectedRecipientId(recipient.id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-left text-sm transition-colors ${
                        selectedRecipientId === recipient.id
                          ? 'bg-accent'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                        style={{ backgroundColor: recipient.color }}
                      >
                        {index + 1}
                      </div>
                      <span className="truncate">{recipient.name || recipient.email}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Field type selector */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">FIELD TYPE</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['signature', 'initials', 'date', 'text', 'name', 'email'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedFieldType(type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-md text-xs transition-colors ${
                        selectedFieldType === type
                          ? 'bg-[hsl(var(--pearsign-primary))] text-white'
                          : 'bg-accent hover:bg-accent/80'
                      }`}
                    >
                      {getFieldIcon(type)}
                      {getFieldLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Placed fields list */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  PLACED FIELDS ({fields.filter(f => f.page === currentPage).length})
                </Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {fields.filter(f => f.page === currentPage).map((field) => {
                    const recipient = getRecipientById(field.recipientId);
                    return (
                      <div
                        key={field.id}
                        className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs"
                      >
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: recipient?.color }}
                        />
                        <span className="flex-1">{getFieldLabel(field.type)}</span>
                        <button onClick={() => deleteField(field.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {fields.filter(f => f.page === currentPage).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Click on the document to add fields
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* PDF Preview */}
            <div className="flex-1 bg-muted rounded-lg overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between p-2 bg-background border-b">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
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

              {/* PDF Canvas with Pinch-to-Zoom */}
              <div
                className="flex-1 overflow-auto p-4 flex justify-center"
                {...touchHandlers}
                style={pinchZoomStyles}
              >
                <div
                  ref={containerRef}
                  className="relative bg-white shadow-lg cursor-crosshair"
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <canvas ref={canvasRef} style={{ touchAction: 'none' }} />

                  {/* Rendered fields */}
                  {fields.filter(f => f.page === currentPage).map((field) => {
                    const recipient = getRecipientById(field.recipientId);
                    return (
                      <div
                        key={field.id}
                        className="absolute border-2 rounded flex items-center justify-center gap-1 text-xs font-medium cursor-move select-none"
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height,
                          borderColor: recipient?.color,
                          backgroundColor: `${recipient?.color}20`,
                          color: recipient?.color,
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-3 w-3 opacity-50" />
                        {getFieldIcon(field.type)}
                        <span>{getFieldLabel(field.type)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                          className="ml-1 opacity-50 hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom navigation */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between">
              <Button variant="outline" onClick={() => setStep('recipients')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleFieldsNext}
                className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
              >
                Next: Review <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <Card className="p-4">
              <h4 className="font-medium mb-2">Document</h4>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                <span>{title}</span>
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="font-medium mb-2">Recipients ({validRecipients.length})</h4>
              <div className="space-y-2">
                {validRecipients.map((recipient, index) => (
                  <div key={recipient.id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: recipient.color }}
                    >
                      {index + 1}
                    </div>
                    <span>{recipient.name}</span>
                    <span className="text-muted-foreground">({recipient.email})</span>
                    <Badge variant="secondary" className="ml-auto">
                      {fields.filter(f => f.recipientId === recipient.id).length} fields
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="font-medium mb-2">Signature Fields ({fields.length})</h4>
              <div className="flex flex-wrap gap-2">
                {(['signature', 'initials', 'date', 'text', 'name', 'email'] as const).map(type => {
                  const count = fields.filter(f => f.type === type).length;
                  if (count === 0) return null;
                  return (
                    <Badge key={type} variant="outline" className="gap-1">
                      {getFieldIcon(type)}
                      {count} {getFieldLabel(type)}{count > 1 ? 's' : ''}
                    </Badge>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="message">Message to Recipients (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a personal message..."
                rows={3}
              />
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('fields')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleSend}
                className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
              >
                <Send className="mr-2 h-4 w-4" /> Send for Signature
              </Button>
            </div>
          </div>
        )}

        {/* Sending State */}
        {step === 'sending' && (
          <div className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-[hsl(var(--pearsign-primary))] animate-spin mb-4" />
            <p className="text-lg font-medium">Sending your document...</p>
            <p className="text-sm text-muted-foreground">This may take a moment</p>
          </div>
        )}

        {/* Success State */}
        {step === 'success' && createdEnvelope && (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-lg font-medium mb-2">Document Sent Successfully!</p>
            <p className="text-sm text-muted-foreground mb-6">
              Your document has been sent to {validRecipients.length} recipient{validRecipients.length > 1 ? 's' : ''}.
            </p>
            <div className="bg-muted rounded-lg p-4 text-left mb-6">
              <p className="text-sm font-medium">{createdEnvelope.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sent to: {validRecipients.map(r => r.email).join(', ')}
              </p>
            </div>
            <Button onClick={handleClose} className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
