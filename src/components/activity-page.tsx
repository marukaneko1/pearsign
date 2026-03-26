"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Send,
  Eye,
  CheckCircle2,
  PenTool,
  Clock,
  Search,
  Filter,
  Download,
  Calendar,
  Mail,
  User,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
  Ban,
  Bell,
  Settings,
  UserPlus,
  LogIn,
  LogOut,
  Globe,
  Monitor,
  Smartphone,
  ArrowRight,
  Activity,
  TrendingUp,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PageTour, ACTIVITY_TOUR_STEPS, TourTriggerButton } from "./page-tour";

// Types for audit logs
interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

type ActivityType = "all" | "envelope" | "template" | "user" | "settings" | "system";

const activityFilters: { value: ActivityType; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All", icon: Activity },
  { value: "envelope", label: "Documents", icon: FileText },
  { value: "template", label: "Templates", icon: FileCheck },
  { value: "user", label: "Users", icon: User },
  { value: "settings", label: "Settings", icon: Settings },
  { value: "system", label: "System", icon: Monitor },
];

// Enhanced action display with better descriptions
const getActionDisplay = (action: string, details: Record<string, unknown> = {}): {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  category: string;
} => {
  const signerName = details?.signerName || details?.actorName || details?.recipientName;
  const signerEmail = details?.signerEmail || details?.actorEmail || details?.recipientEmail;
  const documentName = details?.documentName || details?.envelopeTitle || details?.templateName || 'document';

  const actionMap: Record<string, {
    label: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    category: string;
  }> = {
    'envelope.created': {
      label: 'Document Created',
      description: `A new document "${documentName}" was created and prepared for signing`,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      category: 'Document'
    },
    'envelope.sent': {
      label: 'Document Sent',
      description: signerEmail
        ? `Document sent to ${signerName || signerEmail} for signature`
        : `Document "${documentName}" was sent for signature`,
      icon: Send,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      category: 'Document'
    },
    'envelope.viewed': {
      label: 'Document Viewed',
      description: signerName
        ? `${signerName} opened and is viewing the document`
        : `Document was opened by a recipient`,
      icon: Eye,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      category: 'Document'
    },
    'envelope.signed': {
      label: 'Document Signed',
      description: signerName
        ? `${signerName} has signed the document`
        : `A recipient has signed the document`,
      icon: PenTool,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      category: 'Document'
    },
    'envelope.completed': {
      label: 'Signing Complete',
      description: `All recipients have signed. Document "${documentName}" is now complete.`,
      icon: CheckCircle2,
      color: 'text-green-700',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      category: 'Document'
    },
    'envelope.voided': {
      label: 'Document Voided',
      description: details?.reason
        ? `Document voided: ${details.reason}`
        : `Document "${documentName}" was voided and can no longer be signed`,
      icon: Ban,
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      category: 'Document'
    },
    'envelope.declined': {
      label: 'Signature Declined',
      description: signerName
        ? `${signerName} declined to sign the document`
        : `A recipient declined to sign`,
      icon: X,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      category: 'Document'
    },
    'envelope.reminder_sent': {
      label: 'Reminder Sent',
      description: signerEmail
        ? `Reminder email sent to ${signerName || signerEmail}`
        : `Reminder was sent to pending signers`,
      icon: Bell,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      category: 'Document'
    },
    'template.created': {
      label: 'Template Created',
      description: `New template "${documentName}" was created`,
      icon: FileCheck,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      category: 'Template'
    },
    'template.updated': {
      label: 'Template Updated',
      description: `Template "${documentName}" was modified`,
      icon: FileCheck,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      category: 'Template'
    },
    'template.deleted': {
      label: 'Template Deleted',
      description: `Template "${documentName}" was permanently deleted`,
      icon: X,
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      category: 'Template'
    },
    'user.invited': {
      label: 'User Invited',
      description: signerEmail
        ? `Invitation sent to ${signerEmail}`
        : `A new team member was invited`,
      icon: UserPlus,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      category: 'User'
    },
    'user.joined': {
      label: 'User Joined',
      description: signerName
        ? `${signerName} joined the team`
        : `A new team member has joined`,
      icon: User,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      category: 'User'
    },
    'settings.updated': {
      label: 'Settings Changed',
      description: `Organization settings were updated`,
      icon: Settings,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      category: 'Settings'
    },
    'system.login': {
      label: 'Login',
      description: signerName
        ? `${signerName} logged in`
        : `User logged into the account`,
      icon: LogIn,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      category: 'System'
    },
    'system.logout': {
      label: 'Logout',
      description: signerName
        ? `${signerName} logged out`
        : `User logged out`,
      icon: LogOut,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      category: 'System'
    },
  };

  return actionMap[action] || {
    label: action.split('.').pop()?.replace(/_/g, ' ') || action,
    description: `Action: ${action}`,
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    category: 'Other'
  };
};

// Format relative time with more detail
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

// Format full date time
const formatFullDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleString("en-US", {
    weekday: 'short',
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Detect device from user agent
const getDeviceInfo = (userAgent: string | null): { icon: React.ElementType; label: string } => {
  if (!userAgent) return { icon: Monitor, label: 'Unknown device' };

  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return { icon: Smartphone, label: 'Mobile' };
  }
  return { icon: Monitor, label: 'Desktop' };
};

export function ActivityPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActivityType>("all");
  const [dateRange, setDateRange] = useState("all");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const limit = 50;

  // Tour state
  const [showTour, setShowTour] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/audit-logs?limit=${limit}&offset=${offset}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.success) {
        setLogs(data.data || []);
        setTotal(data.pagination?.total || 0);
      } else {
        setError(data.error || 'Failed to load activity logs');
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Calculate stats
  const stats = {
    total: logs.length,
    documents: logs.filter(l => l.action.startsWith('envelope.')).length,
    signed: logs.filter(l => l.action === 'envelope.signed' || l.action === 'envelope.completed').length,
    viewed: logs.filter(l => l.action === 'envelope.viewed').length,
  };

  // Filter logs based on search and filters
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.actorName && log.actorName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.actorEmail && log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase()));

    let matchesType = true;
    if (activeFilter !== "all") {
      const entityTypeMap: Record<ActivityType, string[]> = {
        all: [],
        envelope: ['ENVELOPE', 'DOCUMENT'],
        template: ['TEMPLATE'],
        user: ['USER', 'TEAM'],
        settings: ['SETTINGS'],
        system: ['SYSTEM', 'NOTIFICATION'],
      };
      matchesType = entityTypeMap[activeFilter]?.includes(log.entityType) ||
                    (activeFilter === 'envelope' && log.action.startsWith('envelope.')) ||
                    (activeFilter === 'template' && log.action.startsWith('template.')) ||
                    false;
    }

    let matchesDate = true;
    const now = new Date();
    const logDate = new Date(log.createdAt);

    if (dateRange === "today") {
      matchesDate = logDate.toDateString() === now.toDateString();
    } else if (dateRange === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      matchesDate = logDate >= weekAgo;
    } else if (dateRange === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      matchesDate = logDate >= monthAgo;
    }

    return matchesSearch && matchesType && matchesDate;
  });

  // Group logs by date
  const groupedLogs = filteredLogs.reduce((groups, log) => {
    const date = new Date(log.createdAt);
    const now = new Date();
    let dateKey: string;

    if (date.toDateString() === now.toDateString()) {
      dateKey = "Today";
    } else if (date.toDateString() === new Date(now.getTime() - 86400000).toDateString()) {
      dateKey = "Yesterday";
    } else if (date >= new Date(now.getTime() - 7 * 86400000)) {
      dateKey = "This Week";
    } else if (date >= new Date(now.getTime() - 30 * 86400000)) {
      dateKey = "This Month";
    } else {
      dateKey = "Earlier";
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(log);
    return groups;
  }, {} as Record<string, AuditLog[]>);

  const dateGroups = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];

  const clearFilters = () => {
    setSearchQuery("");
    setActiveFilter("all");
    setDateRange("all");
  };

  const hasFilters = searchQuery !== "" || activeFilter !== "all" || dateRange !== "all";

  return (
    <>
    {/* Page Tour */}
    <PageTour
      isOpen={showTour}
      onClose={() => setShowTour(false)}
      onComplete={() => setShowTour(false)}
      steps={ACTIVITY_TOUR_STEPS}
      tourName="activity"
    />

    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4" data-tour="activity-header">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Activity Log</h1>
          <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
            Complete audit trail of all document and system activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TourTriggerButton onClick={() => setShowTour(true)} />
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" data-tour="activity-export">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4" data-tour="activity-stats">
        <Card className="p-2.5 sm:p-4 border-border/50">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Activity className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.total}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4 border-border/50">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.documents}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Docs</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4 border-border/50">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <PenTool className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.signed}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Signed</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-4 border-border/50">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <Eye className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.viewed}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Views</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3 sm:p-4 border-border/50">
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
          {/* Search */}
          <div className="relative flex-1" data-tour="activity-search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background h-9 text-sm"
            />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2" data-tour="activity-filter">
            {activityFilters.map((filter) => {
              const Icon = filter.icon;
              const isActive = activeFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                  className={cn(
                    "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Date filter */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] bg-background" data-tour="activity-date">
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {filteredLogs.length} of {logs.length} events
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-auto py-1 px-2 text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {/* Loading state */}
      {loading && (
        <Card className="p-12 border-border/50">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading activity...</p>
          </div>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="p-12 border-border/50">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Failed to load activity</h3>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
            <Button variant="outline" onClick={loadLogs}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && logs.length === 0 && (
        <Card className="p-12 border-border/50">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">No activity yet</h3>
              <p className="text-muted-foreground mt-1">
                When you send documents and collect signatures, all activity will appear here
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* No filtered results */}
      {!loading && !error && logs.length > 0 && filteredLogs.length === 0 && (
        <Card className="p-12 border-border/50">
          <div className="flex flex-col items-center justify-center gap-4">
            <Search className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-semibold text-lg">No matching activity</h3>
              <p className="text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </div>
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </Card>
      )}

      {/* Activity Timeline */}
      {!loading && !error && filteredLogs.length > 0 && (
        <div className="space-y-6" data-tour="activity-list">
          {dateGroups.map((group) => {
            const groupLogs = groupedLogs[group];
            if (!groupLogs || groupLogs.length === 0) return null;

            return (
              <div key={group}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {group}
                  </h2>
                  <div className="flex-1 h-px bg-border" />
                  <Badge variant="secondary" className="text-xs font-normal">
                    {groupLogs.length} {groupLogs.length === 1 ? 'event' : 'events'}
                  </Badge>
                </div>

                {/* Logs in this group */}
                <div className="space-y-2">
                  {groupLogs.map((log) => {
                    const actionInfo = getActionDisplay(log.action, log.details);
                    const Icon = actionInfo.icon;
                    const isExpanded = expandedLog === log.id;
                    const deviceInfo = getDeviceInfo(log.userAgent);
                    const DeviceIcon = deviceInfo.icon;

                    return (
                      <Card
                        key={log.id}
                        className={cn(
                          "overflow-hidden border-border/50 transition-all cursor-pointer hover:shadow-md",
                          isExpanded && "ring-2 ring-primary/20"
                        )}
                        onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                      >
                        <div className="p-3 sm:p-4">
                          <div className="flex items-start gap-2.5 sm:gap-4">
                            {/* Icon */}
                            <div
                              className={cn(
                                "w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0",
                                actionInfo.bgColor
                              )}
                            >
                              <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", actionInfo.color)} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 sm:gap-4">
                                <div className="flex-1 min-w-0">
                                  {/* Action label and category */}
                                  <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                    <span className="font-semibold text-xs sm:text-sm">
                                      {actionInfo.label}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4">
                                      {actionInfo.category}
                                    </Badge>
                                  </div>

                                  {/* Description */}
                                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                    {actionInfo.description}
                                  </p>

                                  {/* Actor info */}
                                  {(log.actorName || log.actorEmail) && (
                                    <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2">
                                      <div className="flex items-center gap-1 sm:gap-1.5">
                                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                                          <span className="text-[8px] sm:text-[10px] text-white font-medium">
                                            {(log.actorName || log.actorEmail || '?').charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                        <span className="text-[10px] sm:text-xs text-foreground font-medium">
                                          {log.actorName || 'Unknown'}
                                        </span>
                                      </div>
                                      {log.actorEmail && (
                                        <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">
                                          {log.actorEmail}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Time and expand indicator */}
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {formatRelativeTime(log.createdAt)}
                                  </span>
                                  <ArrowRight className={cn(
                                    "w-4 h-4 text-muted-foreground/50 transition-transform",
                                    isExpanded && "rotate-90"
                                  )} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-border/50">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                {/* Timestamp */}
                                <div className="flex items-start gap-2">
                                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Timestamp</p>
                                    <p className="font-medium">{formatFullDateTime(log.createdAt)}</p>
                                  </div>
                                </div>

                                {/* IP Address */}
                                {log.ipAddress && (
                                  <div className="flex items-start gap-2">
                                    <Globe className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase tracking-wide">IP Address</p>
                                      <p className="font-medium font-mono text-xs">{log.ipAddress}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Device */}
                                {log.userAgent && (
                                  <div className="flex items-start gap-2">
                                    <DeviceIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Device</p>
                                      <p className="font-medium">{deviceInfo.label}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Document ID */}
                                {log.entityId && (
                                  <div className="flex items-start gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Document ID</p>
                                      <p className="font-medium font-mono text-xs">{log.entityId}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Additional details */}
                                {log.details && Object.keys(log.details).length > 0 && (
                                  <div className="md:col-span-2 flex items-start gap-2">
                                    <Settings className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Additional Details</p>
                                      <div className="flex flex-wrap gap-2">
                                        {Object.entries(log.details).slice(0, 5).map(([key, value]) => (
                                          <Badge key={key} variant="secondary" className="text-xs font-normal">
                                            {key}: {String(value).substring(0, 30)}{String(value).length > 30 ? '...' : ''}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {total > limit && (
            <Card className="p-4 border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} events
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + limit >= total}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
    </>
  );
}
