"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor,
  Smartphone,
  Tablet,
  Loader2,
  LogOut,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Clock,
} from "lucide-react";

interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
}

interface ActiveSession {
  id: string;
  userId: string;
  tenantId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  lastActivity: string;
  createdAt: string;
  isCurrent: boolean;
}

interface SessionsResponse {
  sessions: ActiveSession[];
  totalCount: number;
  currentSessionId: string;
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function DeviceIcon({ device }: { device: string }) {
  if (device === 'Mobile') {
    return <Smartphone className="h-5 w-5 text-muted-foreground" />;
  }
  if (device === 'Tablet') {
    return <Tablet className="h-5 w-5 text-muted-foreground" />;
  }
  return <Monitor className="h-5 w-5 text-muted-foreground" />;
}

export function SessionsDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);
  const [data, setData] = useState<SessionsResponse | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/sessions');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load sessions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchSessions();
    }
  }, [open, fetchSessions]);

  const handleTerminateSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to terminate session');
      }

      toast({
        title: "Session terminated",
        description: "The session has been logged out",
      });

      fetchSessions();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to terminate session",
        variant: "destructive",
      });
    } finally {
      setTerminatingId(null);
    }
  };

  const handleTerminateAllOthers = async () => {
    setTerminatingAll(true);
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminateAll: true }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to terminate sessions');
      }

      const result = await response.json();

      toast({
        title: "Sessions terminated",
        description: result.message || `Terminated ${result.count} session(s)`,
      });

      fetchSessions();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to terminate sessions",
        variant: "destructive",
      });
    } finally {
      setTerminatingAll(false);
    }
  };

  const otherSessionsCount = data?.sessions.filter(s => !s.isCurrent).length || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors">
          <div>
            <p className="font-medium">Active Sessions</p>
            <p className="text-sm text-muted-foreground">Manage your active sessions</p>
          </div>
          <Button variant="outline" size="sm">
            View Sessions
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Active Sessions
          </DialogTitle>
          <DialogDescription>
            These are the devices currently logged into your account
          </DialogDescription>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Actions */}
            {otherSessionsCount > 0 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    {otherSessionsCount} other active session{otherSessionsCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTerminateAllOthers}
                  disabled={terminatingAll}
                  className="text-amber-700 border-amber-300 hover:bg-amber-100"
                >
                  {terminatingAll ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-2" />
                  )}
                  Log out all
                </Button>
              </div>
            )}

            {/* Sessions List */}
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {data?.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border ${
                      session.isCurrent
                        ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900'
                        : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <DeviceIcon device={session.deviceInfo.device} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {session.deviceInfo.browser} on {session.deviceInfo.os}
                            </p>
                            {session.isCurrent && (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {session.ipAddress}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getRelativeTime(session.lastActivity)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!session.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTerminateSession(session.id)}
                          disabled={terminatingId === session.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {terminatingId === session.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {data?.sessions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No active sessions found
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Session info */}
            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              Sessions automatically expire after 7 days of inactivity
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
