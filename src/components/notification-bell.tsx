"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Eye,
  FileText,
  Info,
  Loader2,
  PenTool,
  Send,
  Shield,
  Trash2,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { notificationClient } from "@/lib/notification-client";
import type { Notification, NotificationType } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useTenantSession } from "@/contexts/tenant-session-context";

// Icon mapping for notification types
const NOTIFICATION_ICONS: Record<NotificationType, React.ElementType> = {
  envelope_sent: Send,
  envelope_viewed: Eye,
  envelope_signed: PenTool,
  envelope_completed: Check,
  envelope_voided: XCircle,
  envelope_declined: XCircle,
  envelope_expired: Clock,
  team_invite: UserPlus,
  role_changed: Shield,
  user_deactivated: UserX,
  template_assigned: FileText,
  reminder_sent: Bell,
  document_deleted: Trash2,
  system_update: Info,
};

// Color mapping for notification types
const NOTIFICATION_COLORS: Record<NotificationType, { bg: string; text: string }> = {
  envelope_sent: { bg: "bg-primary/10", text: "text-primary" },
  envelope_viewed: { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-600 dark:text-amber-400" },
  envelope_signed: { bg: "bg-green-100 dark:bg-green-950", text: "text-green-600 dark:text-green-400" },
  envelope_completed: { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
  envelope_voided: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-600 dark:text-red-400" },
  envelope_declined: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-600 dark:text-red-400" },
  envelope_expired: { bg: "bg-orange-100 dark:bg-orange-950", text: "text-orange-600 dark:text-orange-400" },
  team_invite: { bg: "bg-violet-100 dark:bg-violet-950", text: "text-violet-600 dark:text-violet-400" },
  role_changed: { bg: "bg-indigo-100 dark:bg-indigo-950", text: "text-indigo-600 dark:text-indigo-400" },
  user_deactivated: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-600 dark:text-red-400" },
  template_assigned: { bg: "bg-primary/10", text: "text-primary" },
  reminder_sent: { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-600 dark:text-amber-400" },
  document_deleted: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-600 dark:text-red-400" },
  system_update: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400" },
};

interface NotificationBellProps {
  onNavigate?: (path: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const router = useRouter();
  const { isAuthenticated } = useTenantSession();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationClient.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await notificationClient.getNotifications({ limit: 20 });
      setNotifications(response.data || []);
      // Also update unread count from fresh data
      const unread = (response.data || []).filter((n) => !n.isRead).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up real-time updates and polling - only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchUnreadCount();

    try {
      eventSourceRef.current = notificationClient.createStream((data) => {
        if (data.type === "count" || data.type === "update") {
          setUnreadCount(data.count);
          if (data.notifications && isOpen) {
            setNotifications((prev) => {
              const newIds = new Set(data.notifications!.map((n) => n.id));
              const filtered = prev.filter((n) => !newIds.has(n.id));
              return [...data.notifications!, ...filtered].slice(0, 20);
            });
          }

          if (data.notifications && data.notifications.length > 0) {
            const statusChangeTypes: NotificationType[] = [
              'envelope_declined',
              'envelope_signed',
              'envelope_completed',
              'envelope_voided',
              'envelope_viewed',
            ];
            const hasStatusChange = data.notifications.some((n) =>
              statusChangeTypes.includes(n.type as NotificationType)
            );
            if (hasStatusChange && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('envelope-status-changed', {
                detail: { notifications: data.notifications }
              }));
            }
          }
        }
      });
    } catch (error) {
      console.error("Failed to create SSE connection:", error);
    }

    pollingIntervalRef.current = setInterval(fetchUnreadCount, 30000);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchUnreadCount, isOpen, isAuthenticated]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      await notificationClient.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // Close dropdown
    setIsOpen(false);

    // Navigate to actionUrl
    if (notification.actionUrl) {
      if (onNavigate) {
        // Use custom navigation (for internal routing)
        onNavigate(notification.actionUrl);
      } else {
        // Use router for navigation
        router.push(notification.actionUrl);
      }
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    setIsMarkingAllRead(true);
    try {
      await notificationClient.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  // Format relative time
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-[hsl(var(--pearsign-primary))] text-[10px] font-bold"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-96 max-h-[500px] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAllRead}
            >
              {isMarkingAllRead ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll notify you when something happens
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((notification, index) => {
                const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                const colors = NOTIFICATION_COLORS[notification.type] || {
                  bg: "bg-slate-100",
                  text: "text-slate-600",
                };

                return (
                  <div key={notification.id}>
                    <button
                      className={cn(
                        "w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                        !notification.isRead && "bg-[hsl(var(--pearsign-primary))]/5"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          colors.bg
                        )}
                      >
                        <Icon className={cn("h-4 w-4", colors.text)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-medium leading-tight",
                              !notification.isRead && "font-semibold"
                            )}
                          >
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <div className="w-2 h-2 rounded-full bg-[hsl(var(--pearsign-primary))] shrink-0 mt-1.5" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {getTimeAgo(notification.createdAt)}
                        </p>
                      </div>
                    </button>
                    {index < notifications.length - 1 && (
                      <Separator className="mx-4" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-sm"
                onClick={() => {
                  setIsOpen(false);
                  if (onNavigate) {
                    onNavigate("/activity");
                  } else {
                    router.push("/activity");
                  }
                }}
              >
                View all activity
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
