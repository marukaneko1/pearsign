"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Sparkles,
  Phone,
  MessageSquare,
  Loader2,
  Shield,
  AlertTriangle,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SettingsPage() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Twilio state
  const [twilioLoading, setTwilioLoading] = useState(true);
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioTesting, setTwilioTesting] = useState(false);
  const [twilioEnabled, setTwilioEnabled] = useState(false);
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
  const [twilioHasCredentials, setTwilioHasCredentials] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [twilioUsage, setTwilioUsage] = useState({ today: 0, thisMonth: 0 });
  const [twilioLimits, setTwilioLimits] = useState({
    dailyLimit: 100,
    monthlyLimit: 1000,
    perEnvelopeLimit: 5,
  });
  const [testPhoneNumber, setTestPhoneNumber] = useState("");

  // Check if API key is saved in localStorage
  const savedKey = typeof window !== 'undefined' ? localStorage.getItem('openai_api_key') : null;

  // Load Twilio settings
  const loadTwilioSettings = useCallback(async () => {
    try {
      setTwilioLoading(true);
      const response = await fetch('/api/settings/twilio');
      const data = await response.json();

      if (data.success) {
        setTwilioEnabled(data.settings.enabled || false);
        setTwilioAccountSid(data.settings.accountSid || "");
        setTwilioAuthToken(data.settings.authToken || "");
        setTwilioPhoneNumber(data.settings.phoneNumber || "");
        setTwilioHasCredentials(data.settings.hasCredentials || false);
        setTwilioLimits({
          dailyLimit: data.settings.dailyLimit || 100,
          monthlyLimit: data.settings.monthlyLimit || 1000,
          perEnvelopeLimit: data.settings.perEnvelopeLimit || 5,
        });
        setTwilioUsage(data.usage || { today: 0, thisMonth: 0 });
      }
    } catch (error) {
      console.error('Failed to load Twilio settings:', error);
    } finally {
      setTwilioLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTwilioSettings();
  }, [loadTwilioSettings]);

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('openai_api_key', apiKey);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  const handleRemoveApiKey = () => {
    localStorage.removeItem('openai_api_key');
    setApiKey("");
    setIsSaved(false);
  };

  const handleSaveTwilioSettings = async () => {
    setTwilioSaving(true);
    try {
      const response = await fetch('/api/settings/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: twilioAccountSid,
          authToken: twilioAuthToken,
          phoneNumber: twilioPhoneNumber,
          enabled: twilioEnabled,
          dailyLimit: twilioLimits.dailyLimit,
          monthlyLimit: twilioLimits.monthlyLimit,
          perEnvelopeLimit: twilioLimits.perEnvelopeLimit,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Settings saved",
          description: "Twilio SMS settings have been updated.",
        });
        loadTwilioSettings();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save settings",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save Twilio settings",
        variant: "destructive",
      });
    } finally {
      setTwilioSaving(false);
    }
  };

  const handleTestTwilio = async () => {
    if (!testPhoneNumber) {
      toast({
        title: "Phone number required",
        description: "Enter a phone number to send a test SMS",
        variant: "destructive",
      });
      return;
    }

    setTwilioTesting(true);
    try {
      // Format phone number
      const formattedPhone = testPhoneNumber.startsWith('+')
        ? testPhoneNumber
        : '+1' + testPhoneNumber.replace(/\D/g, '');

      const response = await fetch('/api/settings/twilio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testPhone: formattedPhone }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Test SMS sent!",
          description: `Check ${formattedPhone} for the test message.`,
        });
      } else {
        toast({
          title: "Test failed",
          description: data.error || "Failed to send test SMS",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to test Twilio connection",
        variant: "destructive",
      });
    } finally {
      setTwilioTesting(false);
    }
  };

  const handleRemoveTwilioSettings = async () => {
    try {
      await fetch('/api/settings/twilio', { method: 'DELETE' });
      setTwilioEnabled(false);
      setTwilioAccountSid("");
      setTwilioAuthToken("");
      setTwilioPhoneNumber("");
      setTwilioHasCredentials(false);
      toast({
        title: "Settings removed",
        description: "Twilio configuration has been removed.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove settings",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences and integrations
        </p>
      </div>

      <Separator />

      {/* AI Document Generation Section */}
      <Card className="border-[hsl(var(--pearsign-primary))]/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                AI Document Generation
                <Badge variant="secondary" className="text-xs">New</Badge>
              </CardTitle>
              <CardDescription>
                Enable AI-powered document creation with ChatGPT
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-[hsl(var(--pearsign-primary))]/5 border border-[hsl(var(--pearsign-primary))]/20 p-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
              How it works
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
              <li>Ask our AI agent to create documents (NDAs, contracts, agreements)</li>
              <li>Answer a few simple questions in natural conversation</li>
              <li>AI generates a custom, professional document instantly</li>
              <li>Review, edit, and send for signature - all in one place</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Key className="h-4 w-4" />
                OpenAI API Key
                {savedKey && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <Check className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder={savedKey ? "••••••••••••••••••••••••••••••••" : "sk-proj-..."}
                    value={apiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600"
                >
                  {isSaved ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    "Save Key"
                  )}
                </Button>
                {savedKey && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveApiKey}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Get your API key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(var(--pearsign-primary))] hover:underline"
                >
                  OpenAI Platform
                </a>
                . Your key is stored locally and never sent to our servers.
              </p>
            </div>

            {!savedKey && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/50 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  💡 <strong>Tip:</strong> Add your OpenAI API key to unlock AI-powered document generation.
                  This enables natural conversation-based document creation.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Twilio SMS Settings */}
      <Card className="border-emerald-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                SMS Verification (Twilio)
                {twilioHasCredentials && twilioEnabled && (
                  <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                    <Check className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Send OTP codes via SMS for 2FA phone verification
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="twilio-enabled" className="text-sm text-muted-foreground">
                {twilioEnabled ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id="twilio-enabled"
                checked={twilioEnabled}
                onCheckedChange={setTwilioEnabled}
                disabled={twilioLoading}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {twilioLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Usage Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="text-xl font-bold">
                    {twilioUsage.today}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{twilioLimits.dailyLimit}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">This Month</p>
                  <p className="text-xl font-bold">
                    {twilioUsage.thisMonth}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{twilioLimits.monthlyLimit}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Daily Limit</p>
                  <Input
                    type="number"
                    value={twilioLimits.dailyLimit}
                    onChange={(e) => setTwilioLimits(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) || 100 }))}
                    className="mt-1 h-8 text-sm"
                    min={1}
                    max={10000}
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Monthly Limit</p>
                  <Input
                    type="number"
                    value={twilioLimits.monthlyLimit}
                    onChange={(e) => setTwilioLimits(prev => ({ ...prev, monthlyLimit: parseInt(e.target.value) || 1000 }))}
                    className="mt-1 h-8 text-sm"
                    min={1}
                    max={100000}
                  />
                </div>
              </div>

              {/* Rate Limit Warning */}
              {(twilioUsage.today >= twilioLimits.dailyLimit * 0.8 || twilioUsage.thisMonth >= twilioLimits.monthlyLimit * 0.8) && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Approaching SMS limit. Consider increasing limits or reviewing usage.
                  </p>
                </div>
              )}

              {/* Credentials */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Key className="h-4 w-4" />
                      Account SID
                    </Label>
                    <Input
                      type="text"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4" />
                      Auth Token
                    </Label>
                    <div className="relative">
                      <Input
                        type={showTwilioToken ? "text" : "password"}
                        placeholder="Enter auth token..."
                        value={twilioAuthToken}
                        onChange={(e) => setTwilioAuthToken(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowTwilioToken(!showTwilioToken)}
                      >
                        {showTwilioToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4" />
                    Twilio Phone Number
                  </Label>
                  <Input
                    type="tel"
                    placeholder="+15551234567"
                    value={twilioPhoneNumber}
                    onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The phone number to send SMS from. Must be a Twilio number.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Per-Document Limit</Label>
                  <Input
                    type="number"
                    value={twilioLimits.perEnvelopeLimit}
                    onChange={(e) => setTwilioLimits(prev => ({ ...prev, perEnvelopeLimit: parseInt(e.target.value) || 5 }))}
                    className="w-32"
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum SMS per document (prevents abuse per envelope)
                  </p>
                </div>
              </div>

              {/* Test Section */}
              {twilioHasCredentials && (
                <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Send Test SMS
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center justify-center px-3 bg-muted rounded-md border text-sm font-medium text-muted-foreground h-10 shrink-0">
                        +1
                      </div>
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={testPhoneNumber}
                        onChange={(e) => setTestPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        maxLength={10}
                      />
                    </div>
                    <Button
                      onClick={handleTestTwilio}
                      disabled={twilioTesting || !testPhoneNumber}
                      variant="outline"
                    >
                      {twilioTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSaveTwilioSettings}
                  disabled={twilioSaving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {twilioSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Settings
                </Button>
                {twilioHasCredentials && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveTwilioSettings}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>

              {/* Help text */}
              <p className="text-xs text-muted-foreground">
                Get your Twilio credentials from{" "}
                <a
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(var(--pearsign-primary))] hover:underline"
                >
                  Twilio Console
                </a>
                . You'll need an Account SID, Auth Token, and a phone number capable of sending SMS.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Manage your profile and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Full Name</label>
            <Input defaultValue="John Doe" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Email</label>
            <Input defaultValue="john@company.com" type="email" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Company</label>
            <Input defaultValue="Acme Inc." />
          </div>
          <Button variant="outline">Update Profile</Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Choose how you want to be notified
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Document Signed</p>
              <p className="text-xs text-muted-foreground">Get notified when a document is signed</p>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Reminders</p>
              <p className="text-xs text-muted-foreground">Receive signature request reminders</p>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Weekly Summary</p>
              <p className="text-xs text-muted-foreground">Get a weekly email summary</p>
            </div>
            <input type="checkbox" className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
