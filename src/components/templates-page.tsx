"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  Zap,
  Link2,
  Send,
  Check,
  Sparkles,
  Users,
  LayoutTemplate,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Power,
  PowerOff,
  Upload,
  File,
  X,
  PenTool,
  Settings2,
  Mail,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TemplateFieldEditor, type TemplateField, type SignerRole } from "./template-field-editor";
import { PageTour, TEMPLATES_TOUR_STEPS, TourTriggerButton } from "./page-tour";

// Types matching the backend
export type TemplateStatus = 'draft' | 'active';

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: TemplateStatus;
  useCount: number;
  lastUsedAt: string | null;
  fields: TemplateField[];
  signerRoles: SignerRole[];
  hasFusionForm: boolean;
  fusionFormId: string | null;
  fusionFormUrl: string | null;
  documentUrl: string | null;
  documentData: string | null;
  createdAt: string;
  updatedAt: string;
}

const categoryConfig: Record<string, { color: string; bg: string }> = {
  HR: { color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950" },
  Legal: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950" },
  Sales: { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-950" },
  Procurement: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950" },
  General: { color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-950" },
};

const CATEGORIES = ['HR', 'Legal', 'Sales', 'Procurement', 'General'];

const DEFAULT_SIGNER_ROLES: SignerRole[] = [
  { id: 'signer-1', name: 'Signer 1', order: 1, color: '#2563eb' },
];

interface TemplatesPageProps {
  onUseTemplate?: (template: Template) => void;
  onCreateFusionForm?: (template: Template) => void;
}

// Recipient type for the use template dialog
interface TemplateRecipient {
  roleId: string;
  roleName: string;
  roleColor: string;
  name: string;
  email: string;
  fieldCount: number;
}

export function TemplatesPage({ onUseTemplate, onCreateFusionForm }: TemplatesPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | 'all'>('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tour state
  const [showTour, setShowTour] = useState(false);

  // Dialog states
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showFusionFormDialog, setShowFusionFormDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);
  const [formCreated, setFormCreated] = useState(false);
  const [fusionFormUrl, setFusionFormUrl] = useState<string | null>(null);

  // USE TEMPLATE Dialog state
  const [showUseTemplateDialog, setShowUseTemplateDialog] = useState(false);
  const [templateRecipients, setTemplateRecipients] = useState<TemplateRecipient[]>([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");

  // Field Editor state
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{
    id?: string;
    name: string;
    description: string;
    category: string;
    pdfData: string;
    fields: TemplateField[];
    signerRoles: SignerRole[];
  } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Create form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'General',
  });

  // PDF file upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch templates from API
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/templates?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch templates');
      }

      setTemplates(result.data);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handle file upload
  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);

    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFileData(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Auto-fill name from file name if empty
    if (!formData.name) {
      const nameFromFile = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      setFormData(prev => ({ ...prev, name: nameFromFile }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setUploadedFileData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Proceed to field editor after uploading PDF
  const handleProceedToFieldEditor = () => {
    if (!uploadedFileData || !formData.name.trim()) {
      toast({
        title: "Missing Information",
        description: "Please upload a PDF and enter a template name.",
        variant: "destructive",
      });
      return;
    }

    setEditingTemplate({
      name: formData.name,
      description: formData.description,
      category: formData.category,
      pdfData: uploadedFileData,
      fields: [],
      signerRoles: [...DEFAULT_SIGNER_ROLES],
    });

    setShowCreateDialog(false);
    setShowFieldEditor(true);
  };

  // Open field editor for existing template
  const openFieldEditor = async (template: Template) => {
    if (!template.documentData) {
      toast({
        title: "No Document",
        description: "This template has no PDF document. Please upload one first.",
        variant: "destructive",
      });
      return;
    }

    setEditingTemplate({
      id: template.id,
      name: template.name,
      description: template.description || '',
      category: template.category,
      pdfData: template.documentData,
      fields: template.fields || [],
      signerRoles: template.signerRoles?.length > 0 ? template.signerRoles : [...DEFAULT_SIGNER_ROLES],
    });

    setShowFieldEditor(true);
  };

  // Save template from field editor
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    setSavingTemplate(true);

    try {
      const hasSignatureField = editingTemplate.fields.some(f => f.type === 'signature');

      if (!hasSignatureField) {
        toast({
          title: "Signature Required",
          description: "Templates must have at least one signature field to be activated.",
          variant: "destructive",
        });
        setSavingTemplate(false);
        return;
      }

      const payload = {
        name: editingTemplate.name,
        description: editingTemplate.description,
        category: editingTemplate.category,
        documentData: editingTemplate.pdfData,
        fields: editingTemplate.fields,
        signerRoles: editingTemplate.signerRoles,
        status: 'active' as TemplateStatus, // Activate when saving with fields
      };

      let response;
      if (editingTemplate.id) {
        // Update existing template
        response = await fetch(`/api/templates/${editingTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        // Create new template
        response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...payload,
            createdBy: 'demo-user',
          }),
        });
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save template');
      }

      toast({
        title: editingTemplate.id ? "Template Updated" : "Template Created",
        description: `"${editingTemplate.name}" is now active and ready to use.`,
      });

      setShowFieldEditor(false);
      setEditingTemplate(null);
      clearUploadedFile();
      setFormData({ name: '', description: '', category: 'General' });
      fetchTemplates();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to save template',
        variant: "destructive",
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Cancel field editor
  const handleCancelFieldEditor = () => {
    setShowFieldEditor(false);
    setEditingTemplate(null);
    clearUploadedFile();
    setFormData({ name: '', description: '', category: 'General' });
  };

  // Create FusionForm from template
  const handleCreateFusionForm = (template: Template) => {
    if (template.status !== 'active') {
      toast({
        title: "Template Not Active",
        description: "Only active templates can generate FusionForms. Please map fields first.",
        variant: "destructive",
      });
      return;
    }

    if (!template.fields || template.fields.length === 0) {
      toast({
        title: "No Fields Mapped",
        description: "This template has no fields. Please edit it and add fields first.",
        variant: "destructive",
      });
      openFieldEditor(template);
      return;
    }

    setSelectedTemplate(template);
    setShowFusionFormDialog(true);
    setFormCreated(false);
    setFusionFormUrl(null);
  };

  const confirmCreateFusionForm = async () => {
    if (!selectedTemplate) return;
    setCreatingForm(true);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: `${selectedTemplate.name} Form`,
          createdBy: 'demo-user',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create FusionForm');
      }

      setFusionFormUrl(result.data.fusionForm.publicUrl);
      setFormCreated(true);
      fetchTemplates();

      toast({
        title: "FusionForm Created",
        description: "Your FusionForm has been created and is ready to share.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to create FusionForm',
        variant: "destructive",
      });
    } finally {
      setCreatingForm(false);
    }
  };

  // Use template - opens dialog to add recipients, then sends directly
  const handleUseTemplate = async (template: Template) => {
    if (!template.documentData) {
      toast({
        title: "No Document",
        description: "This template has no PDF document. Please edit and upload one.",
        variant: "destructive",
      });
      openFieldEditor(template);
      return;
    }

    if (template.status !== 'active') {
      toast({
        title: "Template Not Active",
        description: "This template needs field mapping before it can be used. Opening editor...",
      });
      openFieldEditor(template);
      return;
    }

    if (!template.fields || template.fields.length === 0) {
      toast({
        title: "No Fields Mapped",
        description: "This template has no fields mapped. Opening editor...",
      });
      openFieldEditor(template);
      return;
    }

    // Prepare recipients from signer roles
    const recipients: TemplateRecipient[] = template.signerRoles.map(role => ({
      roleId: role.id,
      roleName: role.name,
      roleColor: role.color,
      name: '',
      email: '',
      fieldCount: template.fields.filter(f => f.signerRoleId === role.id).length,
    }));

    setSelectedTemplate(template);
    setTemplateRecipients(recipients);
    setTemplateMessage("");
    setShowUseTemplateDialog(true);
  };

  // Update recipient info
  const updateRecipient = (roleId: string, field: 'name' | 'email', value: string) => {
    setTemplateRecipients(prev =>
      prev.map(r => r.roleId === roleId ? { ...r, [field]: value } : r)
    );
  };

  // Validate recipients
  const areRecipientsValid = () => {
    return templateRecipients.every(r =>
      r.name.trim() !== '' &&
      r.email.trim() !== '' &&
      r.email.includes('@')
    );
  };

  // Send template directly
  const handleSendTemplate = async () => {
    if (!selectedTemplate || !areRecipientsValid()) return;

    setSendingTemplate(true);

    try {
      // Build recipients array for the API
      const recipients = templateRecipients.map(r => ({
        name: r.name,
        email: r.email,
        role: 'signer' as const,
        roleId: r.roleId,
      }));

      // Map template fields to signature fields with recipient IDs
      const signatureFields = selectedTemplate.fields.map((field, index) => {
        const recipient = templateRecipients.find(r => r.roleId === field.signerRoleId);
        return {
          id: field.id,
          type: field.type,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          page: field.page,
          recipientId: recipient?.roleId || templateRecipients[0]?.roleId,
          required: field.required,
          label: field.name,
        };
      });

      // Send the envelope
      const response = await fetch('/api/envelopes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: selectedTemplate.name,
          recipients,
          message: templateMessage || `Please review and sign: ${selectedTemplate.name}`,
          pdfBase64: selectedTemplate.documentData,
          signatureFields,
          expirationDays: 30,
          enableReminders: true,
          // Mark as template-based send
          templateId: selectedTemplate.id,
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

      if (!result.success) {
        throw new Error(result.error || 'Failed to send document');
      }

      // Increment template use count
      await fetch(`/api/templates/${selectedTemplate.id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      toast({
        title: "Document Sent!",
        description: `"${selectedTemplate.name}" has been sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''} for signing.`,
      });

      setShowUseTemplateDialog(false);
      setSelectedTemplate(null);
      fetchTemplates(); // Refresh to update use count
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to send document',
        variant: "destructive",
      });
    } finally {
      setSendingTemplate(false);
    }
  };

  // Duplicate template
  const handleDuplicateTemplate = async (template: Template) => {
    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'duplicate' }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to duplicate template');
      }

      toast({
        title: "Template Duplicated",
        description: "A copy has been created as a draft. Edit it to customize.",
      });

      fetchTemplates();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to duplicate template',
        variant: "destructive",
      });
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete template');
      }

      toast({
        title: "Template Deleted",
        description: "The template has been permanently deleted.",
      });

      setShowDeleteDialog(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to delete template',
        variant: "destructive",
      });
    }
  };

  const openDeleteDialog = (template: Template) => {
    setSelectedTemplate(template);
    setShowDeleteDialog(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Link copied to clipboard.",
    });
  };

  // Format last used time
  const formatLastUsed = (lastUsedAt: string | null, useCount: number): string => {
    if (!lastUsedAt) return 'Never used';
    const date = new Date(lastUsedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  };

  // Stats
  const totalUses = templates.reduce((sum, t) => sum + t.useCount, 0);
  const fusionFormCount = templates.filter(t => t.hasFusionForm).length;
  const activeCount = templates.filter(t => t.status === 'active').length;
  const draftCount = templates.filter(t => t.status === 'draft').length;

  // Show field editor if active
  if (showFieldEditor && editingTemplate) {
    return (
      <TemplateFieldEditor
        pdfData={editingTemplate.pdfData}
        fields={editingTemplate.fields}
        signerRoles={editingTemplate.signerRoles}
        onFieldsChange={(fields) => setEditingTemplate(prev => prev ? { ...prev, fields } : null)}
        onSignerRolesChange={(signerRoles) => setEditingTemplate(prev => prev ? { ...prev, signerRoles } : null)}
        onSave={handleSaveTemplate}
        onCancel={handleCancelFieldEditor}
        saving={savingTemplate}
        templateName={editingTemplate.name}
      />
    );
  }

  return (
    <>
    {/* Page Tour */}
    <PageTour
      isOpen={showTour}
      onClose={() => setShowTour(false)}
      onComplete={() => setShowTour(false)}
      steps={TEMPLATES_TOUR_STEPS}
      tourName="templates"
    />

    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4" data-tour="templates-header">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-xs sm:text-base text-muted-foreground">
            Pre-mapped documents for instant, consistent sends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TourTriggerButton onClick={() => setShowTour(true)} />
          <Button
            data-tour="templates-create"
            className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            onClick={() => {
              setFormData({ name: '', description: '', category: 'General' });
              clearUploadedFile();
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <Card className="p-2 sm:p-4 border-border/50">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-lg bg-primary/10 items-center justify-center shrink-0">
              <LayoutTemplate className="h-5 w-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{templates.length}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-2 sm:p-4 border-border/50">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{activeCount}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-2 sm:p-4 border-border/50">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 items-center justify-center shrink-0">
              <PenTool className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{draftCount}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Drafts</p>
            </div>
          </div>
        </Card>
        <Card className="p-2 sm:p-4 border-border/50">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <div className="hidden sm:flex w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-950 items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{fusionFormCount}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Forms</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm" data-tour="templates-search">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50 border-0"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TemplateStatus | 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]" data-tour="templates-filter">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active (Ready to Use)</SelectItem>
            <SelectItem value="draft">Draft (Needs Mapping)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {loading && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading templates...</p>
          </div>
        </Card>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="p-8 border-destructive/50">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
          <Button variant="outline" className="mt-4" onClick={fetchTemplates}>
            Retry
          </Button>
        </Card>
      )}

      {/* Templates List */}
      {!loading && !error && (
        <Card className="overflow-hidden border-border/50" data-tour="templates-list">
          {/* Table Header - Desktop only */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
            <div className="col-span-4">Template</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Fields</div>
            <div className="col-span-2"></div>
          </div>

          {/* Template Items */}
          <div className="divide-y">
            {filteredTemplates.map((template) => {
              const catConfig = categoryConfig[template.category] || categoryConfig.General;
              const fieldCount = template.fields?.length || 0;
              const hasSignature = template.fields?.some(f => f.type === 'signature');
              const isReady = template.status === 'active' && fieldCount > 0 && hasSignature;

              return (
                <div
                  key={template.id}
                  className="hover:bg-muted/30 transition-colors group"
                >
                  {/* Desktop Table Row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-4 items-center">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                        isReady
                          ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white"
                          : "bg-amber-100 dark:bg-amber-950 text-amber-600"
                      )}>
                        {isReady ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <PenTool className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{template.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {template.useCount} uses · {formatLastUsed(template.lastUsedAt, template.useCount)}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge variant="secondary" className={cn("font-normal", catConfig.bg, catConfig.color)}>
                        {template.category}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      {isReady ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : template.documentData ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <PenTool className="h-3 w-3 mr-1" />
                          Needs Mapping
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500 border-gray-300">
                          <Upload className="h-3 w-3 mr-1" />
                          No Document
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-2">
                      {fieldCount > 0 ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium">{fieldCount}</span>
                          <span className="text-muted-foreground">fields</span>
                          {hasSignature && (
                            <PenTool className="h-3 w-3 text-blue-500 ml-1" />
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No fields</span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      {isReady ? (
                        <Button
                          size="sm"
                          className="h-8 opacity-0 group-hover:opacity-100 transition-opacity bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                          onClick={() => handleUseTemplate(template)}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Use
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 opacity-0 group-hover:opacity-100 transition-opacity border-amber-300 text-amber-600 hover:bg-amber-50"
                          onClick={() => openFieldEditor(template)}
                        >
                          <PenTool className="h-3 w-3 mr-1" />
                          Map Fields
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {isReady && (
                            <DropdownMenuItem onClick={() => handleUseTemplate(template)}>
                              <Send className="h-4 w-4 mr-2" />
                              Use Template
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openFieldEditor(template)}>
                            <Settings2 className="h-4 w-4 mr-2" />
                            Edit Fields
                          </DropdownMenuItem>
                          {isReady && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleCreateFusionForm(template)}
                                className="text-orange-600 focus:text-orange-600"
                              >
                                <Zap className="h-4 w-4 mr-2" />
                                {template.hasFusionForm ? 'View FusionForm' : 'Create FusionForm'}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(template)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Mobile Card Layout */}
                  <div className="md:hidden p-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                        isReady
                          ? "bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white"
                          : "bg-amber-100 dark:bg-amber-950 text-amber-600"
                      )}>
                        {isReady ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <PenTool className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{template.name}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {isReady && (
                                <DropdownMenuItem onClick={() => handleUseTemplate(template)}>
                                  <Send className="h-4 w-4 mr-2" />
                                  Use Template
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openFieldEditor(template)}>
                                <Settings2 className="h-4 w-4 mr-2" />
                                Edit Fields
                              </DropdownMenuItem>
                              {isReady && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleCreateFusionForm(template)}
                                    className="text-orange-600 focus:text-orange-600"
                                  >
                                    <Zap className="h-4 w-4 mr-2" />
                                    {template.hasFusionForm ? 'View FusionForm' : 'Create FusionForm'}
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(template)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.useCount} uses · {formatLastUsed(template.lastUsedAt, template.useCount)}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className={cn("font-normal text-[10px] px-1.5 py-0", catConfig.bg, catConfig.color)}>
                            {template.category}
                          </Badge>
                          {isReady ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-[10px] px-1.5 py-0">
                              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                              Ready
                            </Badge>
                          ) : template.documentData ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                              <PenTool className="h-2.5 w-2.5 mr-0.5" />
                              Needs Mapping
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 border-gray-300 text-[10px] px-1.5 py-0">
                              <Upload className="h-2.5 w-2.5 mr-0.5" />
                              No Document
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredTemplates.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No templates found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a template to get started
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* USE TEMPLATE Dialog - Add Recipients & Send */}
      <Dialog open={showUseTemplateDialog} onOpenChange={(open) => {
        setShowUseTemplateDialog(open);
        if (!open) {
          setSelectedTemplate(null);
          setTemplateRecipients([]);
          setTemplateMessage("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              Send "{selectedTemplate?.name}"
            </DialogTitle>
            <DialogDescription>
              Add recipients to send this pre-configured template. Fields are already mapped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Template Summary */}
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{selectedTemplate?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate?.fields?.length || 0} pre-mapped fields · Ready to send
                  </p>
                </div>
                <Badge className="bg-green-100 text-green-700">
                  <Check className="h-3 w-3 mr-1" />
                  Mapped
                </Badge>
              </div>
            </div>

            {/* Recipients */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Recipients</Label>
              {templateRecipients.map((recipient, index) => (
                <div key={recipient.roleId} className="p-3 rounded-lg border bg-background">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: recipient.roleColor }}
                    />
                    <span className="font-medium text-sm">{recipient.roleName}</span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {recipient.fieldCount} field{recipient.fieldCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Full name"
                          value={recipient.name}
                          onChange={(e) => updateRecipient(recipient.roleId, 'name', e.target.value)}
                          className="pl-8 h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={recipient.email}
                          onChange={(e) => updateRecipient(recipient.roleId, 'email', e.target.value)}
                          className="pl-8 h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Optional Message */}
            <div className="space-y-2">
              <Label htmlFor="message" className="text-sm font-medium">
                Message (Optional)
              </Label>
              <Textarea
                id="message"
                placeholder="Add a personal message for recipients..."
                value={templateMessage}
                onChange={(e) => setTemplateMessage(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowUseTemplateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendTemplate}
              disabled={sendingTemplate || !areRecipientsValid()}
              className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            >
              {sendingTemplate ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendingTemplate ? 'Sending...' : 'Send for Signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog - Step 1: Upload PDF */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          clearUploadedFile();
          setFormData({ name: '', description: '', category: 'General' });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Upload a PDF document and give it a name. You'll map fields in the next step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* PDF Upload Area */}
            <div className="space-y-2">
              <Label>Document (PDF) *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {!uploadedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    isDragging
                      ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                      : "border-muted-foreground/25 hover:border-[hsl(var(--pearsign-primary))]/50 hover:bg-muted/50"
                  )}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium text-sm">
                    Drop your PDF here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max file size: 10MB
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
                      <File className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearUploadedFile();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Employment Contract"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this template..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info about next step */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900">
              <PenTool className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">Next: Map signature fields</p>
                <p className="text-blue-700 dark:text-blue-300 mt-0.5">
                  After uploading, you'll place fields on the document and assign them to signers.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleProceedToFieldEditor}
              disabled={!uploadedFile || !formData.name.trim()}
              className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            >
              <PenTool className="h-4 w-4 mr-2" />
              Continue to Field Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedTemplate?.name}&quot;? This action cannot be undone.
              {selectedTemplate?.hasFusionForm && (
                <span className="block mt-2 text-amber-600">
                  Note: This will also deactivate the associated FusionForm.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* FusionForm Dialog */}
      <Dialog open={showFusionFormDialog} onOpenChange={setShowFusionFormDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              {formCreated ? 'FusionForm Ready!' : 'Create FusionForm'}
            </DialogTitle>
            <DialogDescription>
              {formCreated
                ? 'Share this link to collect information and auto-generate documents.'
                : `Create a shareable form for "${selectedTemplate?.name}"`
              }
            </DialogDescription>
          </DialogHeader>

          {!formCreated ? (
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedTemplate?.name}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedTemplate?.fields?.length || 0} pre-mapped fields ready
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {['Share link with anyone', 'They fill out the form', 'Document auto-populates', 'Sent for signature'].map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-xs text-orange-600">
                      {i + 1}
                    </div>
                    {step}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowFusionFormDialog(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                  onClick={confirmCreateFusionForm}
                  disabled={creatingForm}
                >
                  {creatingForm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {creatingForm ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                <code className="flex-1 text-sm truncate">
                  {fusionFormUrl || `forms.pearsign.com/t/${selectedTemplate?.name.toLowerCase().replace(/\s+/g, '-')}`}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(fusionFormUrl || '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowFusionFormDialog(false)}>
                  Done
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (fusionFormUrl) {
                      window.open(fusionFormUrl, '_blank');
                    }
                    setShowFusionFormDialog(false);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Form
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
