"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DocumentStatus = "completed" | "pending" | "draft" | "expired";

interface Document {
  id: string;
  name: string;
  status: DocumentStatus;
  recipients: string[];
  lastUpdated: string;
}

interface Envelope {
  id: string;
  title: string;
  status: string;
  recipients?: Array<{ email: string }>;
  createdAt: string;
  updatedAt?: string;
}

interface RecentDocumentsProps {
  envelopes?: Envelope[];
  loading?: boolean;
  onViewAll?: () => void;
}

const sampleDocuments: Document[] = [
  {
    id: "1",
    name: "Employment Contract - Sarah Johnson",
    status: "pending",
    recipients: ["sarah.johnson@email.com"],
    lastUpdated: "2 hours ago",
  },
  {
    id: "2",
    name: "NDA Agreement - Tech Corp",
    status: "completed",
    recipients: ["legal@techcorp.com", "ceo@techcorp.com"],
    lastUpdated: "1 day ago",
  },
  {
    id: "3",
    name: "Service Agreement Draft",
    status: "draft",
    recipients: [],
    lastUpdated: "3 days ago",
  },
];

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

function mapEnvelopeStatus(status: string): DocumentStatus {
  switch (status) {
    case 'completed': return 'completed';
    case 'in_signing': return 'pending';
    case 'draft': return 'draft';
    case 'voided': return 'expired';
    default: return 'draft';
  }
}

const statusConfig: Record<DocumentStatus, {
  label: string;
  icon: React.ElementType;
  dotColor: string;
}> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    dotColor: "bg-green-500",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    dotColor: "bg-amber-500",
  },
  draft: {
    label: "Draft",
    icon: FileEdit,
    dotColor: "bg-gray-400",
  },
  expired: {
    label: "Expired",
    icon: AlertCircle,
    dotColor: "bg-red-500",
  },
};

const MAX_DOCUMENTS = 5;

export function RecentDocuments({ envelopes = [], loading, onViewAll }: RecentDocumentsProps) {
  const documents: Document[] = envelopes.length > 0
    ? envelopes.slice(0, MAX_DOCUMENTS).map(env => ({
        id: env.id,
        name: env.title,
        status: mapEnvelopeStatus(env.status),
        recipients: env.recipients?.map(r => r.email) || [],
        lastUpdated: formatTimeAgo(env.updatedAt || env.createdAt),
      }))
    : sampleDocuments.slice(0, MAX_DOCUMENTS);

  const totalCount = envelopes.length > 0 ? envelopes.length : sampleDocuments.length;

  return (
    <div className="space-y-4" data-tour="recent-documents">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-foreground">Recent documents</h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-primary"
          onClick={onViewAll}
        >
          View all <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-md border border-border/60 p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Documents List */}
      {!loading && (
        <div className="rounded-md border border-border/60 bg-card overflow-hidden">
          {documents.map((doc, index) => (
            <div
              key={doc.id}
              className={cn(
                "flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer",
                index !== documents.length - 1 && "border-b border-border/60"
              )}
              onClick={onViewAll}
            >
              {/* Document Icon */}
              <div className="w-9 h-9 rounded-lg bg-primary/8 dark:bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>

              {/* Document Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">{doc.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {doc.recipients.length > 0 ? doc.recipients[0] : 'No recipients'}
                  {doc.recipients.length > 1 && ` +${doc.recipients.length - 1}`}
                </p>
              </div>

              {/* Time */}
              <span className="text-xs text-muted-foreground shrink-0">
                {doc.lastUpdated}
              </span>

              {/* Status Dot */}
              <div className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                statusConfig[doc.status].dotColor
              )} />
            </div>
          ))}

          {/* Empty State */}
          {documents.length === 0 && (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No documents yet</p>
            </div>
          )}

          {/* Show more */}
          {totalCount > MAX_DOCUMENTS && (
            <div
              className="px-4 py-2.5 text-center border-t border-border/60 bg-muted/30 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={onViewAll}
            >
              <span className="text-xs text-muted-foreground">
                +{totalCount - MAX_DOCUMENTS} more documents
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
