"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SigningPageLoader } from "@/components/signing/signing-page-loader";
import { SigningPageError } from "@/components/signing/signing-page-error";
import { SigningPageContent } from "@/components/signing/signing-page-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Shield,
  Phone,
  Loader2,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface Envelope {
  id: string;
  title: string;
  description?: string;
  status: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface Field {
  id: string;
  type: string;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value?: string;
  preFilledValue?: string;
  isPreFilled: boolean;
  tooltipText?: string;
}

interface TwoFactorAuth {
  required: boolean;
  verified: boolean;
  maskedPhone: string | null;
}

interface SigningData {
  envelope: Envelope;
  recipient: Recipient;
  documentUrl?: string;
  assignedFields: Field[];
  allFields: Field[];
  twoFactorAuth?: TwoFactorAuth;
}

/**
 * Public Signing Page
 *
 * CRITICAL: This page is NOT part of the dashboard
 * - No JWT authentication required
 * - Token-based access only
 * - Signer-only experience
 * - All actions logged
 */
export default function SigningPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingData, setSigningData] = useState<SigningData | null>(null);

  // 2FA state
  const [twoFAVerified, setTwoFAVerified] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    loadSigningData();
  }, [token]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const loadSigningData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call backend API
      const response = await fetch(`/api/public/sign/${token}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load signing page');
      }

      const data = await response.json();
      setSigningData(data);

      // Check if 2FA is already verified
      if (data.twoFactorAuth?.verified) {
        setTwoFAVerified(true);
      }

      // Mark as viewed (only after 2FA if required)
      if (!data.twoFactorAuth?.required || data.twoFactorAuth?.verified) {
        if (process.env.NODE_ENV !== 'production') console.log("[Signing Page] Marking document as viewed...");
        // Call both endpoints to ensure viewed is tracked
        try {
          // Primary: POST to /viewed endpoint (triggers email)
          const viewedRes = await fetch(`/api/public/sign/${token}/viewed`, {
            method: 'POST',
          });
          const viewedData = await viewedRes.json();
          if (process.env.NODE_ENV !== 'production') console.log("[Signing Page] Viewed endpoint response:", viewedData);
        } catch (viewedErr) {
          console.error("[Signing Page] Viewed endpoint error:", viewedErr);
        }

        // Secondary: PUT to main endpoint (backup)
        try {
          await fetch(`/api/public/sign/${token}`, {
            method: 'PUT',
          });
        } catch (putErr) {
          console.error("[Signing Page] PUT endpoint error:", putErr);
        }
      }
    } catch (err: unknown) {
      console.error('Error loading signing data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load signing page');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    setOtpSending(true);
    setOtpError(null);

    try {
      const response = await fetch(`/api/public/sign/${token}/verify-phone`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setOtpSent(true);
        setCooldown(60);
      } else {
        setOtpError(data.message || 'Failed to send verification code');
      }
    } catch {
      setOtpError('Failed to send verification code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter a 6-digit code');
      return;
    }

    setOtpVerifying(true);
    setOtpError(null);

    try {
      const response = await fetch(`/api/public/sign/${token}/verify-phone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode }),
      });

      const data = await response.json();

      if (data.success && data.verified) {
        setOtpSuccess(true);
        // Wait a moment for the success animation
        setTimeout(async () => {
          setTwoFAVerified(true);
          // Now mark as viewed
          await fetch(`/api/public/sign/${token}`, {
            method: 'PUT',
          });
        }, 1500);
      } else {
        setOtpError(data.message || 'Invalid verification code');
        if (data.remainingAttempts !== undefined) {
          setOtpError(`Invalid code. ${data.remainingAttempts} attempts remaining.`);
        }
      }
    } catch {
      setOtpError('Verification failed. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  if (loading) {
    return <SigningPageLoader />;
  }

  if (error) {
    return <SigningPageError error={error} />;
  }

  if (!signingData) {
    return <SigningPageError error="No signing data available" />;
  }

  // Show 2FA verification screen if required and not verified
  if (signingData.twoFactorAuth?.required && !twoFAVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white to-emerald-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 shadow-xl border-0">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[hsl(var(--pearsign-primary))]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Phone Verification Required
            </h1>
            <p className="text-muted-foreground">
              This document requires phone verification for additional security.
            </p>
          </div>

          {/* Document info */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6 border">
            <p className="text-sm text-muted-foreground mb-1">Document</p>
            <p className="font-medium text-foreground">{signingData.envelope.title}</p>
            <p className="text-sm text-muted-foreground mt-2 mb-1">Signing as</p>
            <p className="font-medium text-foreground">{signingData.recipient.name}</p>
          </div>

          {otpSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[hsl(var(--pearsign-primary))]/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <CheckCircle2 className="h-8 w-8 text-[hsl(var(--pearsign-primary))]" />
              </div>
              <p className="text-lg font-medium text-[hsl(var(--pearsign-primary))]">
                Verified successfully!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Loading document...
              </p>
            </div>
          ) : !otpSent ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-[hsl(var(--pearsign-primary))]/5 rounded-lg border border-[hsl(var(--pearsign-primary))]/20">
                <Phone className="h-5 w-5 text-[hsl(var(--pearsign-primary))] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Verification code will be sent to
                  </p>
                  <p className="text-lg font-mono text-[hsl(var(--pearsign-primary))]">
                    {signingData.twoFactorAuth.maskedPhone || '***'}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSendOTP}
                disabled={otpSending}
                className="w-full bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                size="lg"
              >
                {otpSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              {otpError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {otpError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Enter verification code
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setOtpCode(value);
                    setOtpError(null);
                  }}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono h-14"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Code sent to {signingData.twoFactorAuth.maskedPhone}
                </p>
              </div>

              <Button
                onClick={handleVerifyOTP}
                disabled={otpVerifying || otpCode.length !== 6}
                className="w-full bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
                size="lg"
              >
                {otpVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              {otpError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {otpError}
                </div>
              )}

              <div className="text-center">
                <Button
                  variant="ghost"
                  onClick={handleSendOTP}
                  disabled={cooldown > 0 || otpSending}
                  className="text-sm text-[hsl(var(--pearsign-primary))] hover:text-[hsl(var(--pearsign-primary))]/80"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <SigningPageContent
      token={token}
      envelope={signingData.envelope}
      recipient={signingData.recipient}
      documentUrl={signingData.documentUrl}
      assignedFields={signingData.assignedFields}
      allFields={signingData.allFields}
    />
  );
}
