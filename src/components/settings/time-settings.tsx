"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Clock,
  Globe,
  Calendar,
  Save,
  Loader2,
  Info,
} from "lucide-react";
import {
  settingsApi,
  type TimeSettings as TimeSettingsType,
  TIMEZONES,
  LOCALES,
} from "@/lib/settings-api";

export function TimeSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<TimeSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState<TimeSettingsType>({
    timezone: "America/New_York",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    locale: "en-US",
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getTimeSettings();
      setSettings(data);
      setFormData(data);
    } catch (error) {
      toast({
        title: "Error loading settings",
        description: error instanceof Error ? error.message : "Failed to load time settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = <K extends keyof TimeSettingsType>(key: K, value: TimeSettingsType[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await settingsApi.updateTimeSettings(formData);
      setSettings(updated);
      setHasChanges(false);

      toast({
        title: "Settings saved",
        description: "Your time and locale settings have been updated",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Format preview
  const formatPreview = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: formData.timezone,
      year: "numeric",
      month: formData.dateFormat === "MM/DD/YYYY" ? "2-digit" : "2-digit",
      day: "2-digit",
      hour: formData.timeFormat === "12h" ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12: formData.timeFormat === "12h",
    };

    try {
      return new Intl.DateTimeFormat(formData.locale, options).format(now);
    } catch {
      return now.toLocaleString();
    }
  };

  const getCurrentTimeInTimezone = () => {
    const now = new Date();
    try {
      return new Intl.DateTimeFormat(formData.locale, {
        timeZone: formData.timezone,
        hour: formData.timeFormat === "12h" ? "numeric" : "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: formData.timeFormat === "12h",
      }).format(now);
    } catch {
      return now.toLocaleTimeString();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Time & Locale</h2>
          <p className="text-muted-foreground">
            Configure timezone and date/time formats for your organization
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Current Time Preview */}
      <Card className="border-border/50 bg-gradient-to-br from-[hsl(var(--pearsign-primary))]/5 to-transparent">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
              <Clock className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Current time in your timezone</p>
              <p className="text-3xl font-bold tracking-tight">{getCurrentTimeInTimezone()}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {TIMEZONES.find(t => t.value === formData.timezone)?.label}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timezone */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Timezone
            </CardTitle>
            <CardDescription>
              All timestamps will be displayed in this timezone
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={formData.timezone}
              onValueChange={(value: string) => updateField("timezone", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                This affects how dates and times are displayed in emails, audit logs, and certificates.
                All times are stored internally in UTC.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Locale */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Language & Region
            </CardTitle>
            <CardDescription>
              Affects number and currency formatting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={formData.locale}
              onValueChange={(value: string) => updateField("locale", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((locale) => (
                  <SelectItem key={locale.value} value={locale.value}>
                    {locale.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Date Format */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Format
            </CardTitle>
            <CardDescription>
              How dates are displayed throughout the app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.dateFormat}
              onValueChange={(value) => updateField("dateFormat", value as TimeSettingsType["dateFormat"])}
              className="space-y-3"
            >
              {[
                { value: "MM/DD/YYYY", example: "01/15/2025" },
                { value: "DD/MM/YYYY", example: "15/01/2025" },
                { value: "YYYY-MM-DD", example: "2025-01-15" },
              ].map((format) => (
                <div
                  key={format.value}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    formData.dateFormat === format.value
                      ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                      : "border-border/50 hover:border-border"
                  )}
                  onClick={() => updateField("dateFormat", format.value as TimeSettingsType["dateFormat"])}
                >
                  <RadioGroupItem value={format.value} id={format.value} />
                  <Label htmlFor={format.value} className="flex-1 cursor-pointer">
                    <span className="font-medium">{format.value}</span>
                    <span className="text-muted-foreground ml-2">({format.example})</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Time Format */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Time Format
            </CardTitle>
            <CardDescription>
              12-hour or 24-hour clock
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.timeFormat}
              onValueChange={(value) => updateField("timeFormat", value as TimeSettingsType["timeFormat"])}
              className="space-y-3"
            >
              {[
                { value: "12h", label: "12-hour", example: "2:30 PM" },
                { value: "24h", label: "24-hour", example: "14:30" },
              ].map((format) => (
                <div
                  key={format.value}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    formData.timeFormat === format.value
                      ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5"
                      : "border-border/50 hover:border-border"
                  )}
                  onClick={() => updateField("timeFormat", format.value as TimeSettingsType["timeFormat"])}
                >
                  <RadioGroupItem value={format.value} id={format.value} />
                  <Label htmlFor={format.value} className="flex-1 cursor-pointer">
                    <span className="font-medium">{format.label}</span>
                    <span className="text-muted-foreground ml-2">({format.example})</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Format Preview</CardTitle>
          <CardDescription>
            How dates and times will appear with your current settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Document signed at</p>
              <p className="font-medium">{formatPreview()}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Expires on</p>
              <p className="font-medium">
                {new Intl.DateTimeFormat(formData.locale, {
                  timeZone: formData.timezone,
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Audit log timestamp</p>
              <p className="font-medium">{formatPreview()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Where settings apply */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Where These Settings Apply</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "Email notifications", desc: "Timestamps in emails" },
              { label: "Audit logs", desc: "Event timestamps" },
              { label: "Certificates", desc: "Signing times" },
              { label: "Dashboard", desc: "All date displays" },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
