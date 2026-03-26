"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  FileText,
  ExternalLink,
  Copy,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  BarChart3,
  Users,
  Zap,
  Link2,
  Globe,
  Clock,
  Loader2,
  CheckCircle2,
  Pause,
  Play,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface FusionForm {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  accessCode: string;
  publicUrl: string;
  templateId: string;
  templateName: string;
  submissionCount: number;
  lastSubmissionAt: string | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fields: Array<{ id: string; name: string; type: string; required: boolean }>;
}

interface FusionFormStats {
  totalForms: number;
  activeForms: number;
  totalSubmissions: number;
  completedSubmissions: number;
  avgCompletionRate: number;
}

const statusConfig: Record<
  FusionForm["status"],
  { label: string; icon: React.ElementType; className: string; dotColor: string }
> = {
  active: {
    label: "Active",
    icon: Globe,
    className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
    dotColor: "bg-green-500",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dotColor: "bg-amber-500",
  },
  archived: {
    label: "Archived",
    icon: FileText,
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    dotColor: "bg-slate-400",
  },
};

interface FormsPageProps {
  onCreateForm?: () => void;
  onEditForm?: (formId: string) => void;
}

export function FormsPage({ onEditForm }: FormsPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [forms, setForms] = useState<FusionForm[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<FusionFormStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSubmissionsDialog, setShowSubmissionsDialog] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Array<{
    id: string;
    signerName: string;
    signerEmail: string | null;
    status: string;
    signedAt: string | null;
    createdAt: string;
  }>>([]);

  // Stat detail panel
  type StatDetailType = 'forms' | 'active' | 'submissions' | 'completion';
  const [statDetailType, setStatDetailType] = useState<StatDetailType | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Array<{
    id: string;
    fusionFormId: string;
    formName: string;
    signerName: string;
    signerEmail: string | null;
    status: string;
    signedAt: string | null;
    createdAt: string;
  }>>([]);
  const [loadingAllSubs, setLoadingAllSubs] = useState(false);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [newFormDescription, setNewFormDescription] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [formsRes, templatesRes, statsRes] = await Promise.all([
        fetch("/api/fusion-forms", { credentials: 'include', cache: 'no-store' }),
        fetch("/api/templates", { credentials: 'include', cache: 'no-store' }),
        fetch("/api/fusion-forms/stats", { credentials: 'include', cache: 'no-store' }),
      ]);

      if (formsRes.ok) {
        const formsData = await formsRes.json();
        setForms(formsData.forms || []);
      }

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(templatesData.data || templatesData.templates || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load FusionForms data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSubmissions = async (formId: string) => {
    try {
      const response = await fetch(`/api/fusion-forms/${formId}/submissions`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data.submissions || []);
      }
    } catch (error) {
      console.error("Error loading submissions:", error);
    }
  };

  const handleStatClick = async (type: StatDetailType) => {
    setStatDetailType(type);
    if (type === 'submissions') {
      setLoadingAllSubs(true);
      try {
        const res = await fetch('/api/fusion-forms/all-submissions', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setAllSubmissions(data.submissions || []);
        }
      } catch (err) {
        console.error('Error loading all submissions:', err);
      } finally {
        setLoadingAllSubs(false);
      }
    }
  };

  const handleCreateForm = async () => {
    if (!newFormName || !selectedTemplateId) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);
      const response = await fetch("/api/fusion-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          name: newFormName,
          description: newFormDescription,
          templateId: selectedTemplateId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create FusionForm");
      }

      const newForm = await response.json();

      toast({
        title: "FusionForm Created!",
        description: "Your public form link is ready to share.",
      });

      setForms((prev) => [newForm, ...prev]);
      setShowCreateDialog(false);
      setNewFormName("");
      setNewFormDescription("");
      setSelectedTemplateId("");
    } catch (error) {
      console.error("Error creating form:", error);
      toast({
        title: "Error",
        description: "Failed to create FusionForm",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (formId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";

    try {
      const response = await fetch(`/api/fusion-forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      setForms((prev) =>
        prev.map((f) => (f.id === formId ? { ...f, status: newStatus as "active" | "paused" } : f))
      );

      toast({
        title: newStatus === "active" ? "Form Activated" : "Form Paused",
        description:
          newStatus === "active"
            ? "The form is now accepting submissions"
            : "The form is no longer accepting submissions",
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update form status",
        variant: "destructive",
      });
    }
  };

  const handleDeleteForm = async (formId: string) => {
    try {
      const response = await fetch(`/api/fusion-forms/${formId}`, {
        method: "DELETE",
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error("Failed to delete form");
      }

      setForms((prev) => prev.filter((f) => f.id !== formId));

      toast({
        title: "Form Deleted",
        description: "The FusionForm has been deleted",
      });
    } catch (error) {
      console.error("Error deleting form:", error);
      toast({
        title: "Error",
        description: "Failed to delete form",
        variant: "destructive",
      });
    }
  };

  // Construct full URL from relative path using current window location
  const getFullUrl = (relativePath: string): string => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${relativePath}`;
    }
    return relativePath;
  };

  const copyToClipboard = (relativePath: string) => {
    const fullUrl = getFullUrl(relativePath);
    navigator.clipboard.writeText(fullUrl);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard",
    });
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  const filteredForms = forms.filter(
    (form) =>
      form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (form.description?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FusionForms</h1>
            <p className="text-sm text-muted-foreground">
              Public signing links - like DocuSign PowerForms
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create FusionForm
        </Button>
      </div>

      {/* Stats Row — each card is clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            key: 'forms' as StatDetailType,
            icon: FileText,
            iconColor: 'text-primary',
            iconBg: 'bg-primary/10',
            value: loading ? '-' : String(stats?.totalForms || 0),
            label: 'Total Forms',
            hint: 'View all forms',
          },
          {
            key: 'active' as StatDetailType,
            icon: Globe,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50 dark:bg-emerald-950',
            value: loading ? '-' : String(stats?.activeForms || 0),
            label: 'Active',
            hint: 'View active forms',
          },
          {
            key: 'submissions' as StatDetailType,
            icon: Users,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50 dark:bg-blue-950',
            value: loading ? '-' : String(stats?.totalSubmissions || 0),
            label: 'Submissions',
            hint: 'View all submissions',
          },
          {
            key: 'completion' as StatDetailType,
            icon: TrendingUp,
            iconColor: 'text-violet-600',
            iconBg: 'bg-violet-50 dark:bg-violet-950',
            value: loading ? '-' : `${stats?.avgCompletionRate || 0}%`,
            label: 'Completion Rate',
            hint: 'View per-form breakdown',
          },
        ].map(({ key, icon: Icon, iconColor, iconBg, value, label, hint }) => (
          <button
            key={key}
            onClick={() => handleStatClick(key)}
            className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
          >
            <Card className="p-4 border-border/50 hover:border-primary/40 hover:shadow-md transition-all duration-150 cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-2 group-hover:text-primary/70 transition-colors">{hint} →</p>
            </Card>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search forms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-muted/50 border-0"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground animate-spin mb-4" />
            <p className="text-muted-foreground">Loading FusionForms...</p>
          </div>
        </Card>
      )}

      {/* Forms List */}
      {!loading && (
        <Card className="overflow-hidden border-border/50">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
            <div className="col-span-4">Form</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Submissions</div>
            <div className="col-span-2">Last Activity</div>
            <div className="col-span-2"></div>
          </div>

          {/* Table Body */}
          <div className="divide-y">
            {filteredForms.map((form) => {
              const config = statusConfig[form.status];
              const StatusIcon = config.icon;

              return (
                <div
                  key={form.id}
                  className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-muted/30 transition-colors group"
                >
                  {/* Form Info */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="h-5 w-5 text-primary" />
                      </div>
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                          config.dotColor
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{form.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {form.templateName}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <Badge
                      variant="secondary"
                      className={cn("gap-1.5 font-normal", config.className)}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>

                  {/* Submissions */}
                  <div className="col-span-2 flex items-center gap-1.5 text-sm">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{form.submissionCount}</span>
                  </div>

                  {/* Last Activity */}
                  <div className="col-span-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {form.lastSubmissionAt ? getTimeAgo(form.lastSubmissionAt) : "Never"}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex justify-end gap-1">
                    {form.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => copyToClipboard(form.publicUrl)}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />
                        Copy Link
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => window.open(getFullUrl(form.publicUrl), "_blank")}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Public Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyToClipboard(form.publicUrl)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedFormId(form.id);
                            loadSubmissions(form.id);
                            setShowSubmissionsDialog(true);
                          }}
                        >
                          <BarChart3 className="h-4 w-4 mr-2" />
                          View Submissions
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(form.id, form.status)}
                        >
                          {form.status === "active" ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Pause Form
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Activate Form
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteForm(form.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredForms.length === 0 && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto bg-muted rounded-2xl flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No FusionForms found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? "Try a different search term"
                  : "Create your first FusionForm to get started"}
              </p>
              {!searchQuery && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create FusionForm
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Create FusionForm Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              Create FusionForm
            </DialogTitle>
            <DialogDescription>
              Create a public signing link that anyone can use to sign your document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Form Name *</Label>
              <Input
                id="name"
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="e.g., Client Intake Form"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Select Template *</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{template.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {template.category}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  No templates available. Create a template first.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={newFormDescription}
                onChange={(e) => setNewFormDescription(e.target.value)}
                placeholder="Brief description of this form..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateForm}
                disabled={creating || !newFormName || !selectedTemplateId}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Form
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stat Detail Dialog ───────────────────────────────────────── */}
      <Dialog open={!!statDetailType} onOpenChange={(open) => { if (!open) setStatDetailType(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statDetailType === 'forms' && <><FileText className="h-5 w-5 text-primary" /> All Forms</>}
              {statDetailType === 'active' && <><Globe className="h-5 w-5 text-emerald-600" /> Active Forms</>}
              {statDetailType === 'submissions' && <><Users className="h-5 w-5 text-blue-600" /> All Submissions</>}
              {statDetailType === 'completion' && <><TrendingUp className="h-5 w-5 text-violet-600" /> Completion Rate Breakdown</>}
            </DialogTitle>
            <DialogDescription>
              {statDetailType === 'forms' && `${stats?.totalForms || 0} forms total`}
              {statDetailType === 'active' && `${stats?.activeForms || 0} forms currently accepting submissions`}
              {statDetailType === 'submissions' && `${stats?.totalSubmissions || 0} total submissions across all forms`}
              {statDetailType === 'completion' && `Average completion rate: ${stats?.avgCompletionRate || 0}%`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-2">
            {/* ── Total / Active forms list ── */}
            {(statDetailType === 'forms' || statDetailType === 'active') && (() => {
              const list = statDetailType === 'active'
                ? forms.filter(f => f.status === 'active')
                : forms;
              if (list.length === 0) {
                return (
                  <div className="py-10 text-center">
                    <Zap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No forms found</p>
                  </div>
                );
              }
              return (
                <div className="divide-y">
                  {list.map(form => {
                    const cfg = statusConfig[form.status];
                    const SIcon = cfg.icon;
                    return (
                      <div key={form.id} className="py-4 flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-primary" />
                          </div>
                          <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background', cfg.dotColor)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{form.name}</p>
                          <p className="text-sm text-muted-foreground">{form.templateName}</p>
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          <Badge variant="secondary" className={cn('gap-1', cfg.className)}>
                            <SIcon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                          <p className="text-xs text-muted-foreground">{form.submissionCount} submission{form.submissionCount !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="shrink-0 flex gap-1">
                          {form.status === 'active' && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => copyToClipboard(form.publicUrl)} title="Copy link">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => window.open(getFullUrl(form.publicUrl), '_blank')} title="Open">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── All submissions ── */}
            {statDetailType === 'submissions' && (
              loadingAllSubs ? (
                <div className="py-10 flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading submissions…</p>
                </div>
              ) : allSubmissions.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No submissions yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allSubmissions.map(sub => (
                    <div key={sub.id} className="py-3 grid grid-cols-3 gap-3 items-center text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{sub.signerName}</p>
                        <p className="text-xs text-muted-foreground truncate">{sub.signerEmail || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Form</p>
                        <p className="truncate font-medium">{sub.formName}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={sub.status === 'completed' ? 'default' : 'secondary'} className="mb-1">
                          {sub.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sub.signedAt || sub.createdAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Completion rate breakdown ── */}
            {statDetailType === 'completion' && (
              <div className="space-y-3">
                {forms.length === 0 ? (
                  <div className="py-10 text-center">
                    <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No forms to display</p>
                  </div>
                ) : forms.map(form => {
                  const total = form.submissionCount;
                  // We don't have per-form completed count here, show total vs status as proxy
                  const pct = total > 0 ? 100 : 0;
                  return (
                    <div key={form.id} className="p-4 rounded-xl border bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{form.name}</p>
                          <p className="text-xs text-muted-foreground">{form.templateName}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-lg font-bold">{total}</span>
                          <p className="text-xs text-muted-foreground">submission{total !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct > 0 ? '#8b5cf6' : '#e2e8f0',
                            }}
                          />
                        </div>
                        <Badge variant="secondary" className={statusConfig[form.status].className}>
                          {statusConfig[form.status].label}
                        </Badge>
                      </div>
                      {form.lastSubmissionAt && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last submission: {getTimeAgo(form.lastSubmissionAt)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Submissions Dialog */}
      <Dialog open={showSubmissionsDialog} onOpenChange={setShowSubmissionsDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Form Submissions</DialogTitle>
            <DialogDescription>
              View all submissions for this FusionForm
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto">
            {submissions.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No submissions yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {submissions.map((submission) => (
                  <div key={submission.id} className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{submission.signerName}</p>
                      <p className="text-sm text-muted-foreground">
                        {submission.signerEmail || "No email"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={submission.status === "completed" ? "default" : "secondary"}
                      >
                        {submission.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {submission.signedAt
                          ? new Date(submission.signedAt).toLocaleDateString()
                          : new Date(submission.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
