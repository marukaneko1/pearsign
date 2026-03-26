"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Bell,
  Shield,
  Loader2,
  Save,
} from "lucide-react";
import { TwoFactorDialog } from "./two-factor-dialog";
import { SessionsDialog } from "./sessions-dialog";
import { ChangePasswordDialog } from "./change-password-dialog";

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
}

export function GeneralSettings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
  });

  // Notification preferences
  const [notifications, setNotifications] = useState({
    documentSigned: true,
    reminders: true,
    weeklySummary: false,
    marketingEmails: false,
  });

  // Load profile from API
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          company: data.company || '',
          phone: data.phone || '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast({
        title: "Error loading profile",
        description: "Failed to load your profile data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      // Dispatch custom event to notify header to refresh profile
      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email
        }
      }));

      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully",
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error saving profile",
        description: "Failed to save your profile changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = async (key: keyof typeof notifications, value: boolean) => {
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);

    try {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      toast({
        title: "Preferences updated",
        description: `${key.replace(/([A-Z])/g, ' $1').trim()} has been ${value ? 'enabled' : 'disabled'}`,
      });
    } catch {
      // Revert on failure
      setNotifications(prev => ({ ...prev, [key]: !value }));
      toast({
        title: "Failed to save preferences",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">General Settings</h2>
        <p className="text-muted-foreground">
          Manage your account preferences and integrations
        </p>
      </div>



      {/* Account Settings */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Update your personal information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={profile.firstName}
                onChange={(e) => setProfile(p => ({ ...p, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={profile.lastName}
                onChange={(e) => setProfile(p => ({ ...p, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={profile.company}
                onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose how you want to be notified
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm">Document Signed</p>
              <p className="text-xs text-muted-foreground">Get notified when a document is signed</p>
            </div>
            <Switch
              checked={notifications.documentSigned}
              onCheckedChange={(checked) => handleNotificationChange('documentSigned', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm">Signature Reminders</p>
              <p className="text-xs text-muted-foreground">Receive updates about pending signatures</p>
            </div>
            <Switch
              checked={notifications.reminders}
              onCheckedChange={(checked) => handleNotificationChange('reminders', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm">Weekly Summary</p>
              <p className="text-xs text-muted-foreground">Get a weekly email summary of activity</p>
            </div>
            <Switch
              checked={notifications.weeklySummary}
              onCheckedChange={(checked) => handleNotificationChange('weeklySummary', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm">Marketing Updates</p>
              <p className="text-xs text-muted-foreground">Receive news and product updates</p>
            </div>
            <Switch
              checked={notifications.marketingEmails}
              onCheckedChange={(checked) => handleNotificationChange('marketingEmails', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your account security
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">Keep your account secure with a strong password</p>
            </div>
            <ChangePasswordDialog />
          </div>

          {/* Two-Factor Authentication - Real Implementation */}
          <TwoFactorDialog />

          {/* Active Sessions - Real Implementation */}
          <SessionsDialog />
        </CardContent>
      </Card>
    </div>
  );
}
