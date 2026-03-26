"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Palette,
  Upload,
  X,
  Save,
  Eye,
  Image,
  Mail,
  FileText,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  settingsApi,
  type BrandingSettings as BrandingType,
} from "@/lib/settings-api";

const colorPresets = [
  { name: "Blue", value: "#2563eb" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Orange", value: "#f97316" },
  { name: "Green", value: "#22c55e" },
  { name: "Slate", value: "#475569" },
];

export function BrandingSettings() {
  const { toast } = useToast();
  const [branding, setBranding] = useState<BrandingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<BrandingType>({
    logoUrl: null,
    primaryColor: "#2563eb",
    accentColor: "#1d4ed8",
    productName: "PearSign",
    supportEmail: "info@pearsign.com",
    footerText: "© 2025 PearSign. All rights reserved.",
    faviconUrl: null,
    customCss: null,
  });

  const loadBranding = useCallback(async () => {
    setLoading(true);
    try {
      // Initialize branding table with logo columns
      await fetch('/api/settings/branding/init', { method: 'POST' }).catch(() => {});

      const data = await settingsApi.getBranding();
      setBranding(data);
      setFormData(data);
    } catch (error) {
      toast({
        title: "Error loading branding",
        description: error instanceof Error ? error.message : "Failed to load branding settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  const updateField = <K extends keyof BrandingType>(key: K, value: BrandingType[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await settingsApi.updateBranding(formData);
      setBranding(updated);
      setHasChanges(false);

      toast({
        title: "Branding updated",
        description: "Your branding settings have been saved",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Failed to save branding settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Logo must be less than 2MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const url = await settingsApi.uploadLogo(file);
      updateField("logoUrl", url);

      toast({
        title: "Logo uploaded",
        description: "Your logo has been updated",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await settingsApi.removeLogo();
      updateField("logoUrl", null);

      toast({
        title: "Logo removed",
        description: "Your logo has been removed",
      });
    } catch (error) {
      toast({
        title: "Failed to remove logo",
        description: error instanceof Error ? error.message : "Failed to remove logo",
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Branding & White-label</h2>
          <p className="text-muted-foreground">
            Customize the look and feel of your signing experience
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Logo */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Logo
            </CardTitle>
            <CardDescription>
              Upload your company logo (recommended size: 200x50px)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo Preview */}
            <div className="relative h-24 rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center bg-muted/30">
              {formData.logoUrl ? (
                <>
                  <img
                    src={formData.logoUrl}
                    alt="Logo"
                    className="max-h-16 max-w-[200px] object-contain"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 bg-background/80 hover:bg-background"
                    onClick={handleRemoveLogo}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <div className="text-center">
                  <Image className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No logo uploaded</p>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Logo
            </Button>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Brand Colors
            </CardTitle>
            <CardDescription>
              Choose colors that match your brand
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Primary Color */}
            <div className="space-y-3">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg border-2 border-border cursor-pointer relative overflow-hidden"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => updateField("primaryColor", e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <Input
                  value={formData.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                  className="w-28 font-mono text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => updateField("primaryColor", color.value)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all hover:scale-110",
                      formData.primaryColor === color.value
                        ? "border-foreground ring-2 ring-offset-2 ring-foreground"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-3">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg border-2 border-border cursor-pointer relative overflow-hidden"
                  style={{ backgroundColor: formData.accentColor }}
                >
                  <input
                    type="color"
                    value={formData.accentColor}
                    onChange={(e) => updateField("accentColor", e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <Input
                  value={formData.accentColor}
                  onChange={(e) => updateField("accentColor", e.target.value)}
                  className="w-28 font-mono text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Company Information
            </CardTitle>
            <CardDescription>
              Details shown in emails and signing pages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Product Name</Label>
              <Input
                id="productName"
                value={formData.productName}
                onChange={(e) => updateField("productName", e.target.value)}
                placeholder="Your Company Name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={formData.supportEmail}
                onChange={(e) => updateField("supportEmail", e.target.value)}
                placeholder="support@yourcompany.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footerText">Footer Text</Label>
              <Input
                id="footerText"
                value={formData.footerText}
                onChange={(e) => updateField("footerText", e.target.value)}
                placeholder="© 2025 Your Company. All rights reserved."
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
            <CardDescription>
              How your branding will appear
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email Preview */}
            <div className="rounded-lg overflow-hidden border">
              <div
                className="p-4 text-center"
                style={{ backgroundColor: formData.primaryColor }}
              >
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo"
                    className="h-8 mx-auto object-contain"
                    style={{ filter: "brightness(0) invert(1)" }}
                  />
                ) : (
                  <span className="text-white font-bold text-lg">
                    {formData.productName}
                  </span>
                )}
              </div>
              <div className="p-4 bg-muted/30">
                <p className="text-sm mb-4">Hi Jane, you have a document to sign...</p>
                <button
                  className="px-6 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  Review & Sign Document
                </button>
              </div>
              <div className="p-3 text-center text-xs text-muted-foreground border-t bg-muted/20">
                {formData.footerText}
              </div>
            </div>

            {/* Button Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Button Styles</Label>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: formData.accentColor }}
                >
                  Secondary
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Where branding appears */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Where Your Branding Appears</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { icon: Mail, label: "Signature request emails", desc: "Logo, colors, footer" },
              { icon: FileText, label: "Signing pages", desc: "Logo, colors, buttons" },
              { icon: Check, label: "Completion certificates", desc: "Logo, company name" },
              { icon: FileText, label: "PDF documents", desc: "Logo in header" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-8 h-8 rounded-lg bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                </div>
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
