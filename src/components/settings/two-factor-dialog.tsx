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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Check,
  Copy,
  Download,
  Loader2,
  AlertTriangle,
  Smartphone,
  Key,
  RefreshCw,
} from "lucide-react";

interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
  lastVerifiedAt: string | null;
}

interface TwoFactorSetup {
  qrCodeUrl: string;
  manualEntryCode: string;
}

type Step = 'status' | 'setup' | 'verify' | 'backup-codes' | 'disable';

export function TwoFactorDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState<Step>('status');

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/2fa');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching 2FA status:', error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setStep('status');
      setVerificationCode("");
      setSetup(null);
      setBackupCodes([]);
    }
  }, [open, fetchStatus]);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start 2FA setup');
      }

      const data = await response.json();
      setSetup(data);
      setStep('setup');
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start 2FA setup",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length < 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit verification code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable 2FA');
      }

      const data = await response.json();
      setBackupCodes(data.backupCodes || []);
      setStep('backup-codes');

      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication is now active on your account.",
      });
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid verification code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setVerificationCode("");
    }
  };

  const handleDisable = async () => {
    if (!verificationCode || verificationCode.length < 6) {
      toast({
        title: "Invalid code",
        description: "Please enter your 6-digit verification code to disable 2FA",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disable 2FA');
      }

      await fetchStatus();
      setStep('status');

      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setVerificationCode("");
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!verificationCode || verificationCode.length < 6) {
      toast({
        title: "Invalid code",
        description: "Please enter your verification code to regenerate backup codes",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to regenerate backup codes');
      }

      const data = await response.json();
      setBackupCodes(data.backupCodes || []);
      setStep('backup-codes');

      toast({
        title: "Backup Codes Regenerated",
        description: "Your previous backup codes are no longer valid.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to regenerate backup codes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setVerificationCode("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const downloadBackupCodes = () => {
    const content = `PearSign Backup Codes\n${'='.repeat(30)}\n\nGenerated: ${new Date().toLocaleString()}\n\nStore these codes in a safe place. Each code can only be used once.\n\n${backupCodes.join('\n')}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pearsign-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Backup codes saved to file",
    });
  };

  const handleDone = () => {
    fetchStatus();
    setStep('status');
    setBackupCodes([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
            </div>
          </div>
          {status?.enabled ? (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
              <Check className="h-3 w-3 mr-1" />
              Enabled
            </Badge>
          ) : (
            <Button variant="outline" size="sm">
              Enable
            </Button>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {step === 'status' && 'Secure your account with two-factor authentication'}
            {step === 'setup' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the code from your authenticator app'}
            {step === 'backup-codes' && 'Save your backup codes in a safe place'}
            {step === 'disable' && 'Enter your verification code to disable 2FA'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Step */}
          {step === 'status' && (
            <>
              {status?.enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <Check className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">2FA is enabled</p>
                      <p className="text-sm text-green-600/80">
                        {status.backupCodesRemaining} backup codes remaining
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setStep('verify');
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate backup codes
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setStep('disable')}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Disable 2FA
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-700 dark:text-amber-400">2FA is not enabled</p>
                      <p className="text-sm text-amber-600/80">
                        Your account is less secure without 2FA
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start gap-3 p-3 border rounded-lg">
                      <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Authenticator app</p>
                        <p className="text-xs text-muted-foreground">
                          Use Google Authenticator, Authy, or any TOTP app
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 border rounded-lg">
                      <Key className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Backup codes</p>
                        <p className="text-xs text-muted-foreground">
                          10 one-time codes for account recovery
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleStartSetup}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    Set up 2FA
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Setup Step - QR Code */}
          {step === 'setup' && setup && (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={setup.qrCodeUrl}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Or enter this code manually:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                    {setup.manualEntryCode}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(setup.manualEntryCode)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verify-code">
                  Enter the 6-digit code from your app
                </Label>
                <Input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('status')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVerifyAndEnable}
                  disabled={loading || verificationCode.length < 6}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Verify & Enable
                </Button>
              </div>
            </div>
          )}

          {/* Verify Step (for regenerating backup codes) */}
          {step === 'verify' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your verification code to regenerate backup codes. Your previous codes will no longer work.
              </p>

              <div className="space-y-2">
                <Label htmlFor="regen-code">
                  Verification code
                </Label>
                <Input
                  id="regen-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('status');
                    setVerificationCode("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerateBackupCodes}
                  disabled={loading || verificationCode.length < 6}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Regenerate
                </Button>
              </div>
            </div>
          )}

          {/* Backup Codes Step */}
          {step === 'backup-codes' && backupCodes.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Save these codes! They won&apos;t be shown again.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="p-2 bg-background rounded text-center font-mono text-sm"
                  >
                    {code}
                  </code>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(backupCodes.join('\n'))}
                  className="flex-1"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadBackupCodes}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>

              <Button onClick={handleDone} className="w-full">
                I&apos;ve saved my backup codes
              </Button>
            </div>
          )}

          {/* Disable Step */}
          {step === 'disable' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  Disabling 2FA will make your account less secure
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disable-code">
                  Enter your verification code to confirm
                </Label>
                <Input
                  id="disable-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('status');
                    setVerificationCode("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisable}
                  disabled={loading || verificationCode.length < 6}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Disable 2FA
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
