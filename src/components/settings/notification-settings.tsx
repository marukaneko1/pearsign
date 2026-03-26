"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  Mail,
  FileText,
  Users,
  Shield,
  Clock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { notificationClient } from "@/lib/notification-client";
import type { NotificationPreferences } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

export function NotificationSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const prefs = await notificationClient.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error("Failed to load preferences:", error);
      toast({
        title: "Error",
        description: "Failed to load notification preferences",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;

    const updated = { ...preferences, [key]: value };
    setPreferences(updated);

    setIsSaving(true);
    try {
      await notificationClient.updatePreferences({ [key]: value });
      toast({
        title: "Preferences updated",
        description: "Your notification preferences have been saved.",
      });
    } catch (error) {
      console.error("Failed to update preferences:", error);
      // Revert on error
      setPreferences(preferences);
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load preferences</p>
        <Button variant="outline" onClick={loadPreferences} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Choose which notifications you want to receive
        </p>
      </div>

      {/* Delivery Methods */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Delivery Methods
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications" className="font-medium">
                Email Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={preferences.emailNotifications}
              onCheckedChange={(checked) => handleToggle("emailNotifications", checked)}
              disabled={isSaving}
            />
          </div>
        </div>
      </Card>

      {/* Document Notifications */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Document Activity
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="envelope-sent" className="font-medium">
                Document Sent
              </Label>
              <p className="text-sm text-muted-foreground">
                When you send a document for signature
              </p>
            </div>
            <Switch
              id="envelope-sent"
              checked={preferences.envelopeSent}
              onCheckedChange={(checked) => handleToggle("envelopeSent", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="envelope-viewed" className="font-medium">
                Document Viewed
              </Label>
              <p className="text-sm text-muted-foreground">
                When a recipient views your document
              </p>
            </div>
            <Switch
              id="envelope-viewed"
              checked={preferences.envelopeViewed}
              onCheckedChange={(checked) => handleToggle("envelopeViewed", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="envelope-signed" className="font-medium">
                Document Signed
              </Label>
              <p className="text-sm text-muted-foreground">
                When a recipient signs your document
              </p>
            </div>
            <Switch
              id="envelope-signed"
              checked={preferences.envelopeSigned}
              onCheckedChange={(checked) => handleToggle("envelopeSigned", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="envelope-completed" className="font-medium">
                Document Completed
              </Label>
              <p className="text-sm text-muted-foreground">
                When all parties have signed a document
              </p>
            </div>
            <Switch
              id="envelope-completed"
              checked={preferences.envelopeCompleted}
              onCheckedChange={(checked) => handleToggle("envelopeCompleted", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="envelope-declined" className="font-medium">
                Document Declined
              </Label>
              <p className="text-sm text-muted-foreground">
                When a recipient declines to sign your document
              </p>
            </div>
            <Switch
              id="envelope-declined"
              data-testid="switch-envelope-declined"
              checked={preferences.envelopeDeclined}
              onCheckedChange={(checked) => handleToggle("envelopeDeclined", checked)}
              disabled={isSaving}
            />
          </div>
        </div>
      </Card>

      {/* Team Notifications */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team Activity
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="team-invites" className="font-medium">
                Team Invitations
              </Label>
              <p className="text-sm text-muted-foreground">
                When you're invited to join a team
              </p>
            </div>
            <Switch
              id="team-invites"
              checked={preferences.teamInvites}
              onCheckedChange={(checked) => handleToggle("teamInvites", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="role-changes" className="font-medium">
                Role Changes
              </Label>
              <p className="text-sm text-muted-foreground">
                When your role or permissions change
              </p>
            </div>
            <Switch
              id="role-changes"
              checked={preferences.roleChanges}
              onCheckedChange={(checked) => handleToggle("roleChanges", checked)}
              disabled={isSaving}
            />
          </div>
        </div>
      </Card>

      {/* Other Notifications */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Other Notifications
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="template-assigned" className="font-medium">
                Template Assignments
              </Label>
              <p className="text-sm text-muted-foreground">
                When a template is assigned to you
              </p>
            </div>
            <Switch
              id="template-assigned"
              checked={preferences.templateAssigned}
              onCheckedChange={(checked) => handleToggle("templateAssigned", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reminders" className="font-medium">
                Reminders
              </Label>
              <p className="text-sm text-muted-foreground">
                When reminders are sent to recipients
              </p>
            </div>
            <Switch
              id="reminders"
              checked={preferences.reminders}
              onCheckedChange={(checked) => handleToggle("reminders", checked)}
              disabled={isSaving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="system-updates" className="font-medium">
                System Updates
              </Label>
              <p className="text-sm text-muted-foreground">
                Product updates and new features
              </p>
            </div>
            <Switch
              id="system-updates"
              checked={preferences.systemUpdates}
              onCheckedChange={(checked) => handleToggle("systemUpdates", checked)}
              disabled={isSaving}
            />
          </div>
        </div>
      </Card>

      {/* Test Notifications */}
      <Card className="p-6 border-dashed">
        <h3 className="font-semibold mb-2">Test Notifications</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Generate sample notifications to test the notification system
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await notificationClient.seedNotifications();
              toast({
                title: "Sample notifications created",
                description: "Check the notification bell to see them.",
              });
            } catch (error) {
              toast({
                title: "Error",
                description: "Failed to create sample notifications",
                variant: "destructive",
              });
            }
          }}
        >
          <Bell className="h-4 w-4 mr-2" />
          Generate Sample Notifications
        </Button>
      </Card>
    </div>
  );
}
