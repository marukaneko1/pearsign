"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Search,
  FileText,
  Eye,
  Download,
  Ban,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Users,
  Loader2,
  X,
  Mail,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import { sampleEnvelopes, type Envelope as SampleEnvelope } from "@/lib/sample-data";
import type { Envelope } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Extended envelope type to handle both API and sample data formats
type ExtendedEnvelope = (Envelope | SampleEnvelope) & {
  description?: string;
  message?: string;
};

// Recipient type with optional extended fields
interface ExtendedRecipient {
  name?: string;
  email?: string;
  status?: string;
  viewedAt?: string;
  signedAt?: string;
}

interface SentRequestsPageProps {
  envelopes?: Envelope[];
  loading?: boolean;
  onRefresh?: () => void;
  onVoidDocument?: (id: string, reason: string) => Promise<void>;
}

type EnvelopeStatus = 'completed' | 'in_signing' | 'viewed' | 'voided' | 'declined' | 'draft' | 'ready_to_send';

const statusConfig: Record<EnvelopeStatus, {
  label: string;
  icon: React.ElementType;
  className: string;
  dotColor: string;
}> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
    dotColor: "bg-green-500",
  },
  viewed: {
    label: "Viewed",
    icon: Eye,
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    dotColor: "bg-blue-500",
  },
  in_signing: {
    label: "Sent",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dotColor: "bg-amber-500",
  },
  voided: {
    label: "Voided",
    icon: XCircle,
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  declined: {
    label: "Declined",
    icon: XCircle,
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  draft: {
    label: "Draft",
    icon: AlertCircle,
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    dotColor: "bg-slate-400",
  },
  ready_to_send: {
    label: "Ready",
    icon: Send,
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    dotColor: "bg-blue-500",
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
    icon: XCircle,
    className: "text-red-600",
  },
  expired: {
    label: "Expired",
    icon: AlertCircle,
    className: "text-gray-500",
  },
};

// Polling interval in milliseconds (30 seconds)
const POLLING_INTERVAL = 30000;

export function SentRequestsPage({ envelopes, loading, onRefresh, onVoidDocument }: SentRequestsPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [selectedEnvelope, setSelectedEnvelope] = useState<Envelope | typeof sampleEnvelopes[number] | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidedIds, setVoidedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<"all" | "individual" | "bulk">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_signing" | "viewed" | "completed" | "voided">("all");
  const [selectedForBulkVoid, setSelectedForBulkVoid] = useState<Set<string>>(new Set());
  const [showBulkVoidDialog, setShowBulkVoidDialog] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  // Dialog state for details
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [detailsEnvelope, setDetailsEnvelope] = useState<Envelope | typeof sampleEnvelopes[number] | null>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Silent refresh function (doesn't show loading state)
  const silentRefresh = useCallback(async () => {
    if (!onRefresh || isPolling) return;
    setIsPolling(true);
    try {
      await onRefresh();
      setLastRefreshed(new Date());
    } catch (error) {
      console.error("Polling refresh failed:", error);
    } finally {
      setIsPolling(false);
    }
  }, [onRefresh, isPolling]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      pollingRef.current = setInterval(() => {
        silentRefresh();
      }, POLLING_INTERVAL);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [autoRefresh, silentRefresh, onRefresh]);

  // Listen for real-time envelope status changes (from SSE via notification-bell)
  // This enables immediate UI updates when signer declines, signs, views, etc.
  useEffect(() => {
    const handleEnvelopeStatusChange = () => {
      silentRefresh();
    };

    window.addEventListener('envelope-status-changed', handleEnvelopeStatusChange);
    return () => {
      window.removeEventListener('envelope-status-changed', handleEnvelopeStatusChange);
    };
  }, [silentRefresh]);

  // Update lastRefreshed when manual refresh happens
  useEffect(() => {
    if (!loading) {
      setLastRefreshed(new Date());
    }
  }, [loading, envelopes]);

  // Use provided envelopes if available, otherwise use sample data
  const baseEnvelopes = envelopes || sampleEnvelopes;
  const sentEnvelopes = baseEnvelopes
    .filter((env) => env.status !== 'draft')
    .map(env => voidedIds.has(env.id) ? { ...env, status: 'voided' as const } : env);

  const filteredEnvelopes = sentEnvelopes
    .filter(env => {
      // Status filter
      if (statusFilter !== "all" && env.status !== statusFilter) return false;
      // Type filter
      if (filterType === "bulk") return (env as SampleEnvelope).bulkSendId;
      if (filterType === "individual") return !(env as SampleEnvelope).bulkSendId;
      return true;
    })
    .filter(env =>
      env.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getTimeAgo = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - dateObj.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return diffMins + "m ago";
    if (diffHours < 24) return diffHours + "h ago";
    return diffDays + "d ago";
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = dateObj.toDateString() === yesterday.toDateString();

    if (isToday) {
      return `Today at ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (isYesterday) {
      return `Yesterday at ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return dateObj.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: dateObj.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleVoidClick = (envelope: Envelope | typeof sampleEnvelopes[number]) => {
    setSelectedEnvelope(envelope);
    setVoidReason("");
    setShowVoidDialog(true);
  };

  const handleVoidConfirm = async () => {
    if (!selectedEnvelope) return;
    setIsVoiding(true);
    try {
      if (onVoidDocument) {
        await onVoidDocument(selectedEnvelope.id, voidReason);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setVoidedIds(prev => new Set([...prev, selectedEnvelope.id]));
      }
      toast({
        title: "Document voided",
        description: "\"" + selectedEnvelope.title + "\" has been voided. Signers can no longer access this document.",
      });
      setShowVoidDialog(false);
      setSelectedEnvelope(null);
      setVoidReason("");
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({
        title: "Failed to void document",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const handleSendReminder = async (envelope: Envelope | typeof sampleEnvelopes[number]) => {
    setSendingReminder(envelope.id);
    try {
      const response = await fetch('/api/envelopes/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelopeId: envelope.id }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Reminder sent",
          description: result.message || `Reminder sent for "${envelope.title}"`,
        });
      } else {
        throw new Error(result.error || 'Failed to send reminder');
      }
    } catch (error) {
      toast({
        title: "Failed to send reminder",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSendingReminder(null);
    }
  };

  const handleBulkVoidConfirm = async () => {
    if (selectedForBulkVoid.size === 0) return;
    setIsVoiding(true);
    try {
      const ids = Array.from(selectedForBulkVoid);
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`/api/envelopes/${id}/void`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Bulk void' }),
          }).then(async res => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `Failed to void ${id}`);
            }
            return id;
          })
        )
      );

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);
      const failed = results.filter(r => r.status === 'rejected').length;

      if (succeeded.length > 0) {
        setVoidedIds(prev => new Set([...prev, ...succeeded]));
      }

      if (failed > 0 && succeeded.length === 0) {
        throw new Error(`Failed to void ${failed} document(s)`);
      }

      toast({
        title: "Documents voided",
        description: failed > 0
          ? `${succeeded.length} voided, ${failed} failed.`
          : `${succeeded.length} document(s) have been voided.`,
        variant: failed > 0 ? "destructive" : "default",
      });
      setShowBulkVoidDialog(false);
      setSelectedForBulkVoid(new Set());
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({
        title: "Failed to void documents",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const toggleSelectForVoid = (id: string) => {
    setSelectedForBulkVoid(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllInProgress = () => {
    const inProgressIds = filteredEnvelopes
      .filter(e => e.status === 'in_signing')
      .map(e => e.id);
    setSelectedForBulkVoid(new Set(inProgressIds));
  };

  const clearSelection = () => {
    setSelectedForBulkVoid(new Set());
  };

  const sentNotViewedCount = sentEnvelopes.filter((e) => e.status === 'in_signing').length;
  const viewedCount = sentEnvelopes.filter((e) => e.status === 'viewed').length;
  const completedCount = sentEnvelopes.filter((e) => e.status === 'completed').length;
  const voidedCount = sentEnvelopes.filter((e) => e.status === 'voided').length;
  const bulkSendCount = sentEnvelopes.filter((e) => (e as SampleEnvelope).bulkSendId).length;
  // "In Progress" = sent but not completed (includes sent and viewed)
  const inProgressCount = sentNotViewedCount + viewedCount;

  // Format last refreshed time
  const formatLastRefreshed = () => {
    const now = new Date();
    const diff = now.getTime() - lastRefreshed.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 10) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handler for details dialog
  const handleViewDetails = (envelope: Envelope | typeof sampleEnvelopes[number]) => {
    setDetailsEnvelope(envelope);
    setShowDetailsDialog(true);
  };

  // Handler for download
  const handleDownload = async (envelope: Envelope | typeof sampleEnvelopes[number]) => {
    setDownloadingId(envelope.id);
    try {
      // Check if document is completed - only completed docs have signed PDFs
      if (envelope.status === 'completed') {
        // Download signed PDF from the API
        const response = await fetch(`/api/envelopes/${envelope.id}/download`);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Download failed' }));
          throw new Error(error.error || 'Failed to download document');
        }

        // Get the blob and create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${envelope.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Download complete",
          description: `"${envelope.title}" has been downloaded.`,
        });
      } else {
        // For non-completed documents, download the original PDF
        const response = await fetch(`/api/envelopes/${envelope.id}/download?original=true`);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Download failed' }));
          throw new Error(error.error || 'Failed to download document');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${envelope.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Download complete",
          description: `"${envelope.title}" has been downloaded.`,
        });
      }
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">Sent Requests</h1>
          <Badge variant="secondary" className="no-default-active-elevate" data-testid="text-total-count">
            {sentEnvelopes.length} total
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {selectedForBulkVoid.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowBulkVoidDialog(true)}
              data-testid="button-bulk-void"
            >
              <Ban className="h-4 w-4 mr-2" />
              Void Selected ({selectedForBulkVoid.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || isPolling} data-testid="button-refresh">
            <RefreshCw className={cn("h-4 w-4 mr-2", (loading || isPolling) && "animate-spin")} />
            Refresh
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              autoRefresh ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
            )} />
            <span className="hidden sm:inline">{formatLastRefreshed()}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs"
              data-testid="button-auto-refresh"
            >
              Auto {autoRefresh ? "on" : "off"}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards - 4 equal cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          className={cn(
            "p-4 cursor-pointer transition-all",
            statusFilter === "in_signing" && "ring-2 ring-amber-500"
          )}
          onClick={() => setStatusFilter(statusFilter === "in_signing" ? "all" : "in_signing")}
          data-testid="card-stat-sent"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
              <Send className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sent</p>
              <p className="text-xl font-bold">{sentNotViewedCount}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-4 cursor-pointer transition-all",
            statusFilter === "viewed" && "ring-2 ring-blue-500"
          )}
          onClick={() => setStatusFilter(statusFilter === "viewed" ? "all" : "viewed")}
          data-testid="card-stat-viewed"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Viewed</p>
              <p className="text-xl font-bold">{viewedCount}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-4 cursor-pointer transition-all",
            statusFilter === "completed" && "ring-2 ring-green-500"
          )}
          onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
          data-testid="card-stat-completed"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-xl font-bold">{completedCount}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-4 cursor-pointer transition-all",
            statusFilter === "voided" && "ring-2 ring-red-500"
          )}
          onClick={() => setStatusFilter(statusFilter === "voided" ? "all" : "voided")}
          data-testid="card-stat-voided"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Voided</p>
              <p className="text-xl font-bold">{voidedCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            data-testid="button-filter-all"
          >
            All
          </Button>
          <Button
            variant={filterType === "individual" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("individual")}
            data-testid="button-filter-individual"
          >
            Individual
          </Button>
          <Button
            variant={filterType === "bulk" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("bulk")}
            data-testid="button-filter-bulk"
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            Bulk ({bulkSendCount})
          </Button>
        </div>
        {statusFilter === "in_signing" && (
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllInProgress}
              data-testid="button-select-all"
            >
              Select All
            </Button>
            {selectedForBulkVoid.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                data-testid="button-clear-selection"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Active Filters */}
      {(statusFilter !== "all" || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-muted-foreground text-xs">Filters:</span>
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {statusFilter === "in_signing" ? "Sent" : statusFilter === "viewed" ? "Viewed" : statusFilter === "completed" ? "Completed" : "Voided"}
              <button onClick={() => setStatusFilter("all")} className="ml-1" data-testid="button-clear-status-filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {searchQuery && (
            <Badge variant="secondary" className="gap-1">
              "{searchQuery}"
              <button onClick={() => setSearchQuery("")} className="ml-1" data-testid="button-clear-search-filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setSearchQuery(""); setFilterType("all"); }}>
            Clear all
          </Button>
        </div>
      )}

      {/* Document List */}
      <Card className="overflow-visible">
        <div className="divide-y divide-border">
          {filteredEnvelopes.map((envelope) => {
            const status = envelope.status as EnvelopeStatus;
            const config = statusConfig[status] || statusConfig.draft;
            const StatusIcon = config.icon;
            const isVoided = status === 'voided';
            const canVoid = status === 'in_signing' || status === 'viewed' || status === 'ready_to_send';
            const isBulkSend = (envelope as SampleEnvelope).bulkSendName;
            const isSelectableForBulkVoid = statusFilter === "in_signing" && status === "in_signing";

            const firstRecipient = envelope.recipients[0] as { name?: string; email?: string } | undefined;
            const recipientDisplay = firstRecipient?.name || firstRecipient?.email || 'Unknown';

            return (
              <div
                key={envelope.id}
                data-testid={`row-envelope-${envelope.id}`}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap transition-colors hover-elevate",
                  isVoided && "opacity-50",
                  selectedForBulkVoid.has(envelope.id) && "bg-amber-50/50 dark:bg-amber-950/20"
                )}
              >
                {/* Checkbox for bulk void */}
                {isSelectableForBulkVoid && (
                  <div className="shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedForBulkVoid.has(envelope.id)}
                      onChange={() => toggleSelectForVoid(envelope.id)}
                      className="accent-[hsl(var(--pearsign-primary))] h-4 w-4 rounded cursor-pointer"
                      aria-label="Select for bulk void"
                      data-testid={`checkbox-select-${envelope.id}`}
                    />
                  </div>
                )}

                {/* Document Icon - neutral */}
                <div className="shrink-0 w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Title + Recipient */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={cn(
                      "font-medium text-sm truncate",
                      isVoided && "line-through text-muted-foreground"
                    )} data-testid={`text-title-${envelope.id}`}>
                      {envelope.title}
                    </h3>
                    {isBulkSend && (
                      <Badge variant="outline" className="shrink-0 text-[10px] gap-1">
                        <Users className="h-2.5 w-2.5" />
                        Bulk
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid={`text-recipient-${envelope.id}`}>
                    {envelope.recipients.length > 0 ? (
                      <>
                        {recipientDisplay}
                        {envelope.recipients.length > 1 && (
                          <span className="text-muted-foreground/60"> +{envelope.recipients.length - 1}</span>
                        )}
                      </>
                    ) : (
                      <span className="italic">No recipients</span>
                    )}
                  </p>
                </div>

                {/* Status Badge */}
                <Badge
                  className={cn(
                    "shrink-0 gap-1 rounded-full no-default-active-elevate no-default-hover-elevate",
                    config.className
                  )}
                  data-testid={`badge-status-${envelope.id}`}
                >
                  <StatusIcon className="h-3 w-3" />
                  {config.label}
                </Badge>

                {/* Sent Date */}
                <div className="hidden sm:block shrink-0 text-right min-w-[90px]">
                  <p className="text-xs text-foreground" data-testid={`text-date-${envelope.id}`}>{formatDate(envelope.createdAt)}</p>
                  <p className="text-[11px] text-muted-foreground">{getTimeAgo(envelope.createdAt)}</p>
                </div>

                {/* Actions Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      data-testid={`button-actions-${envelope.id}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleViewDetails(envelope)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    {(status === 'in_signing' || status === 'viewed') && (
                      <DropdownMenuItem
                        onClick={() => handleSendReminder(envelope)}
                        disabled={sendingReminder === envelope.id}
                      >
                        {sendingReminder === envelope.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {sendingReminder === envelope.id ? 'Sending...' : 'Send Reminder'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleDownload(envelope)}
                      disabled={downloadingId === envelope.id}
                    >
                      {downloadingId === envelope.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {downloadingId === envelope.id ? 'Downloading...' : 'Download'}
                    </DropdownMenuItem>
                    {canVoid && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => handleVoidClick(envelope)}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Void Document
                        </DropdownMenuItem>
                      </>
                    )}
                    {isVoided && (
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        <XCircle className="mr-2 h-4 w-4" />
                        Document Voided
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredEnvelopes.length === 0 && (
          <div className="p-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Send className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base mb-1" data-testid="text-empty-title">No sent requests</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {searchQuery ? "Try adjusting your search query" : filterType === "bulk" ? "No bulk sends found" : "Documents you send for signature will appear here"}
            </p>
          </div>
        )}
      </Card>

      <AlertDialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Void Document
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to void <strong>"{selectedEnvelope?.title}"</strong>?</p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                  <p className="font-medium text-destructive mb-1">This action cannot be undone.</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>All signers will be notified that the document has been voided</li>
                    <li>Signers will no longer be able to view or sign this document</li>
                    <li>Any existing signatures will be invalidated</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="void-reason">Reason for voiding (optional)</Label>
            <Textarea
              id="void-reason"
              placeholder="e.g., Document sent to wrong recipient, Incorrect information..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoidConfirm} disabled={isVoiding} className="bg-destructive hover:bg-destructive/90">
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
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkVoidDialog} onOpenChange={setShowBulkVoidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Void Selected Documents
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to void <strong>{selectedForBulkVoid.size}</strong> document(s)?</p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                  <p className="font-medium text-destructive mb-1">This action cannot be undone.</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>All signers will be notified that the documents have been voided</li>
                    <li>Signers will no longer be able to view or sign these documents</li>
                    <li>Any existing signatures will be invalidated</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>Documents to be voided:</Label>
            <ul className="list-disc list-inside text-sm text-muted-foreground max-h-32 overflow-auto">
              {filteredEnvelopes
                .filter(e => selectedForBulkVoid.has(e.id))
                .map(e => (
                  <li key={e.id}>{e.title}</li>
                ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkVoidConfirm} disabled={isVoiding} className="bg-destructive hover:bg-destructive/90">
              {isVoiding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Void Selected
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              Document Details
            </DialogTitle>
            <DialogDescription>
              {detailsEnvelope?.title ? (
                <span className="font-semibold">{detailsEnvelope.title}</span>
              ) : (
                <span className="italic text-muted-foreground">No title</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {detailsEnvelope && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Sent: {formatDate(detailsEnvelope.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge className="gap-1 px-2 py-1 rounded-full">
                  {(() => {
                    const StatusIcon = statusConfig[detailsEnvelope.status as EnvelopeStatus]?.icon || FileText;
                    return <StatusIcon className="h-3 w-3" />;
                  })()}
                  {statusConfig[detailsEnvelope.status as EnvelopeStatus]?.label || detailsEnvelope.status}
                </Badge>
              </div>
              <div>
                <Label>Recipients</Label>
                <ul className="mt-1 space-y-2">
                  {detailsEnvelope.recipients.map((r, idx) => {
                    const recipient = r as ExtendedRecipient;
                    return (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{recipient.name || recipient.email || "Unknown"}</span>
                        {recipient.email && (
                          <span className="text-muted-foreground text-xs ml-2 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {recipient.email}
                          </span>
                        )}
                        {recipient.status && (
                          <Badge variant="secondary" className="ml-2 gap-1 px-2 py-0.5 rounded-full text-xs">
                            {(() => {
                              const statusCfg = recipientStatusConfig[recipient.status] || recipientStatusConfig.sent;
                              const Icon = statusCfg.icon;
                              return (
                                <>
                                  <Icon className="h-3 w-3" />
                                  {statusCfg.label}
                                </>
                              );
                            })()}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <Label>Document ID</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{detailsEnvelope.id}</span>
                  <a
                    href={`/envelope/${detailsEnvelope.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </div>
              </div>
              {(() => {
                const env = detailsEnvelope as ExtendedEnvelope;
                const messageText = env.description || env.message;
                return messageText ? (
                  <div>
                    <Label>Message</Label>
                    <div className="bg-muted/30 rounded p-2 text-sm">{messageText}</div>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
