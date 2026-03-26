"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Search,
  MoreVertical,
  FileText,
  Download,
  Trash2,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Calendar,
  Mail,
  ArrowRight,
  X,
  Ban,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PageTour, DOCUMENTS_TOUR_STEPS, TourTriggerButton } from "./page-tour";

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface Document {
  id: string;
  title: string;
  status: "draft" | "in_signing" | "completed" | "voided" | "expired";
  recipients: Recipient[];
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, {
  label: string;
  icon: React.ElementType;
  className: string;
  dotColor: string;
}> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    dotColor: "bg-green-500",
  },
  viewed: {
    label: "Viewed",
    icon: Eye,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    dotColor: "bg-blue-500",
  },
  in_signing: {
    label: "Sent",
    icon: Clock,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    dotColor: "bg-amber-500",
  },
  draft: {
    label: "Draft",
    icon: FileText,
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dotColor: "bg-slate-400",
  },
  voided: {
    label: "Voided",
    icon: AlertCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  expired: {
    label: "Expired",
    icon: AlertCircle,
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    dotColor: "bg-gray-500",
  },
  declined: {
    label: "Declined",
    icon: AlertCircle,
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    dotColor: "bg-orange-500",
  },
};

// Recipient-level status config
const recipientStatusConfig: Record<string, {
  label: string;
  icon: React.ElementType;
  className: string;
}> = {
  completed: {
    label: "Signed",
    icon: CheckCircle2,
    className: "text-green-600",
  },
  viewed: {
    label: "Viewed",
    icon: Eye,
    className: "text-blue-600",
  },
  sent: {
    label: "Sent",
    icon: Send,
    className: "text-amber-600",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className: "text-gray-500",
  },
  declined: {
    label: "Declined",
    icon: AlertCircle,
    className: "text-red-600",
  },
  expired: {
    label: "Expired",
    icon: AlertCircle,
    className: "text-gray-500",
  },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MyDocumentsPage() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "in_signing" | "completed">("all");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [voidingDocument, setVoidingDocument] = useState<Document | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tour state
  const [showTour, setShowTour] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/envelopes?limit=100', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.envelopes) {
        setDocuments(data.envelopes);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Count by status
  const statusCounts = {
    all: documents.length,
    draft: documents.filter(d => d.status === 'draft').length,
    in_signing: documents.filter(d => d.status === 'in_signing').length,
    completed: documents.filter(d => d.status === 'completed').length,
  };

  const handleDownload = async (doc: Document) => {
    try {
      setDownloading(doc.id);

      // First, find the signing session token for this envelope
      const response = await fetch(`/api/envelopes/${doc.id}/download`, {
        credentials: 'include',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
          title: 'Download started',
          description: 'Your document is being downloaded',
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: 'Download failed',
        description: 'Could not download the document. The document may not have a signed copy yet.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleSendReminder = async (doc: Document) => {
    toast({
      title: 'Reminder sent',
      description: `Reminder sent to ${doc.recipients.length} recipient(s)`,
    });
  };

  const handleViewDocument = (doc: Document) => {
    setSelectedDocument(doc);
  };

  const handleVoidDocument = async () => {
    if (!voidingDocument || !voidReason.trim()) return;

    setIsVoiding(true);
    try {
      const response = await fetch('/api/envelopes/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          envelopeId: voidingDocument.id,
          reason: voidReason.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Document voided',
          description: 'The document has been voided and recipients have been notified.',
        });
        // Close dialog and refresh list
        setVoidingDocument(null);
        setVoidReason("");
        loadDocuments();
      } else {
        throw new Error(data.error || 'Failed to void document');
      }
    } catch (error) {
      console.error('Failed to void document:', error);
      toast({
        title: 'Error',
        description: 'Failed to void document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deletingDocument) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/envelopes/${deletingDocument.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Document deleted',
          description: 'The document has been permanently deleted.',
        });
        setDeletingDocument(null);
        loadDocuments();
      } else {
        throw new Error(data.error || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    {/* Page Tour */}
    <PageTour
      isOpen={showTour}
      onClose={() => setShowTour(false)}
      onComplete={() => setShowTour(false)}
      steps={DOCUMENTS_TOUR_STEPS}
      tourName="documents"
    />

    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between" data-tour="documents-header">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight">My Documents</h2>
          <p className="text-xs sm:text-base text-muted-foreground">View and manage all your documents</p>
        </div>
        <div className="flex items-center gap-2">
          <TourTriggerButton onClick={() => setShowTour(true)} />
          <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loading} data-tour="documents-refresh">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4" data-tour="documents-stats">
        <Card className="p-2.5 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{statusCounts.all}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{statusCounts.in_signing}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Pending</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{statusCounts.completed}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Done</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{statusCounts.draft}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Drafts</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between">
          <div className="relative w-full md:w-96" data-tour="documents-search">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 text-sm"
            />
          </div>

          <div className="flex gap-1.5 sm:gap-2 flex-wrap w-full md:w-auto" data-tour="documents-status">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              All ({statusCounts.all})
            </Button>
            <Button
              variant={statusFilter === "draft" ? "default" : "outline"}
              onClick={() => setStatusFilter("draft")}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              Draft ({statusCounts.draft})
            </Button>
            <Button
              variant={statusFilter === "in_signing" ? "default" : "outline"}
              onClick={() => setStatusFilter("in_signing")}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              Pending ({statusCounts.in_signing})
            </Button>
            <Button
              variant={statusFilter === "completed" ? "default" : "outline"}
              onClick={() => setStatusFilter("completed")}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              Done ({statusCounts.completed})
            </Button>

            <div className="border-l pl-1.5 sm:pl-2 ml-auto sm:ml-2 flex gap-1" data-tour="documents-view-toggle">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Documents List */}
      {!loading && filteredDocuments.length > 0 && (
        <Card data-tour="documents-table">
          {viewMode === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">Document Name</TableHead>
                  <TableHead className="text-xs sm:text-sm">Status</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Recipients</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">Last Updated</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => {
                  const config = statusConfig[doc.status] || statusConfig.draft;
                  const StatusIcon = config.icon;

                  return (
                    <TableRow key={doc.id} className="cursor-pointer" onClick={() => handleViewDocument(doc)}>
                      <TableCell className="font-medium p-2 sm:p-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-muted flex items-center justify-center">
                              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                            </div>
                            <div className={cn(
                              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-background",
                              config.dotColor
                            )} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-xs sm:text-sm truncate max-w-[140px] sm:max-w-[300px]">{doc.title}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                              {doc.recipients.length > 0 ? doc.recipients[0].email : 'No recipients'}
                              {doc.recipients.length > 1 && ` +${doc.recipients.length - 1}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-4">
                        <Badge className={cn("gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-1.5 sm:px-2.5", config.className)} variant="secondary">
                          <StatusIcon className="h-3 w-3" />
                          <span className="hidden sm:inline">{config.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                        <div className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm">
                          <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span>{doc.recipients.length}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs sm:text-sm p-2 sm:p-4">
                        {formatTimeAgo(doc.updatedAt || doc.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewDocument(doc); }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {doc.status === 'in_signing' && (
                              <>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendReminder(doc); }}>
                                  <Send className="mr-2 h-4 w-4" />
                                  Send Reminder
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={(e) => { e.stopPropagation(); setVoidingDocument(doc); }}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Void Document
                                </DropdownMenuItem>
                              </>
                            )}
                            {doc.status === 'completed' && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}>
                                <Download className="mr-2 h-4 w-4" />
                                {downloading === doc.id ? 'Downloading...' : 'Download'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingDocument(doc); }} data-testid={`button-delete-${doc.id}`}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-4">
              {filteredDocuments.map((doc) => {
                const config = statusConfig[doc.status] || statusConfig.draft;
                const StatusIcon = config.icon;

                return (
                  <Card
                    key={doc.id}
                    className="p-3 sm:p-4 hover:shadow-sm transition-shadow group cursor-pointer"
                    onClick={() => handleViewDocument(doc)}
                  >
                    <div className="flex items-start justify-between mb-2 sm:mb-3">
                      <div className="relative">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center">
                          <FileText className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                        </div>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-background",
                          config.dotColor
                        )} />
                      </div>
                      <Badge className={cn("gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2", config.className)} variant="secondary">
                        <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="hidden sm:inline">{config.label}</span>
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-2">{doc.title}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">
                      <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span>{doc.recipients.length} recipient{doc.recipients.length !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{formatTimeAgo(doc.updatedAt || doc.createdAt)}</p>
                    <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="flex-1" onClick={(e) => { e.stopPropagation(); handleViewDocument(doc); }}>
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {doc.status === 'in_signing' && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendReminder(doc); }}>
                                <Send className="mr-2 h-4 w-4" />
                                Send Reminder
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={(e) => { e.stopPropagation(); setVoidingDocument(doc); }}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Void Document
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {doc.status === 'completed' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingDocument(doc); }} data-testid={`button-delete-card-${doc.id}`}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Empty State */}
      {!loading && filteredDocuments.length === 0 && (
        <div className="text-center py-12">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No documents found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || statusFilter !== 'all'
              ? "Try adjusting your search or filters"
              : "Send your first document to get started"}
          </p>
        </div>
      )}

      {/* Document Details Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              </div>
              <span className="truncate">{selectedDocument?.title}</span>
            </DialogTitle>
            <DialogDescription>
              Document details and recipient status
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-6">
              {/* Status and Dates */}
              <div className="flex flex-wrap items-center gap-4">
                {(() => {
                  const config = statusConfig[selectedDocument.status] || statusConfig.draft;
                  const StatusIcon = config.icon;
                  return (
                    <Badge className={cn("gap-1.5 text-sm py-1.5 px-3", config.className)} variant="secondary">
                      <StatusIcon className="h-4 w-4" />
                      {config.label}
                    </Badge>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created: {formatDate(selectedDocument.createdAt)}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Recipients ({selectedDocument.recipients.length})
                </h4>
                <div className="space-y-2">
                  {selectedDocument.recipients.length > 0 ? selectedDocument.recipients.map((recipient, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center text-[hsl(var(--pearsign-primary))] font-semibold text-sm">
                          {recipient.name?.charAt(0)?.toUpperCase() || recipient.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{recipient.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {recipient.email}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className={cn(
                        "text-xs",
                        recipient.status === 'signed' || recipient.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      )}>
                        {recipient.status === 'signed' || recipient.status === 'completed' ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" />Signed</>
                        ) : (
                          <><Clock className="h-3 w-3 mr-1" />Pending</>
                        )}
                      </Badge>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No recipients</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                {selectedDocument.status === 'in_signing' && (
                  <>
                    <Button variant="outline" onClick={() => handleSendReminder(selectedDocument)}>
                      <Send className="h-4 w-4 mr-2" />
                      Send Reminder
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => { setSelectedDocument(null); setVoidingDocument(selectedDocument); }}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Void
                    </Button>
                  </>
                )}
                {selectedDocument.status === 'completed' && (
                  <Button
                    onClick={() => handleDownload(selectedDocument)}
                    disabled={downloading === selectedDocument.id}
                    className="bg-[hsl(var(--pearsign-primary))]"
                  >
                    {downloading === selectedDocument.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download Signed PDF
                  </Button>
                )}
                <Button variant="ghost" className="ml-auto" onClick={() => setSelectedDocument(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Document Confirmation Dialog */}
      <Dialog open={!!voidingDocument} onOpenChange={(open) => { if (!open) { setVoidingDocument(null); setVoidReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Void Document
            </DialogTitle>
            <DialogDescription>
              This will cancel the signing process and notify all recipients. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {voidingDocument && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">{voidingDocument.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {voidingDocument.recipients.length} recipient{voidingDocument.recipients.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-reason">Reason for voiding (required)</Label>
                <Textarea
                  id="void-reason"
                  placeholder="Enter the reason for voiding this document..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoidingDocument(null); setVoidReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidDocument}
              disabled={!voidReason.trim() || isVoiding}
            >
              {isVoiding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Void Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingDocument} onOpenChange={(open) => { if (!open) setDeletingDocument(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deletingDocument && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{deletingDocument.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {deletingDocument.recipients.length} recipient{deletingDocument.recipients.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingDocument(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDocument}
              disabled={isDeleting}
              data-testid="button-confirm-delete"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
