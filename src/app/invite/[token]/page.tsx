"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Eye,
  EyeOff,
  Check,
  Building2,
  Shield,
  AlertCircle,
  Lock,
} from "lucide-react";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

interface InviteInfo {
  tenantName: string;
  ownerEmail: string;
  ownerName?: string;
  allowedDomain?: string;
  plan: string;
  expiresAt: string;
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      validateInvite();
    }
  }, [token]);

  const validateInvite = async () => {
    try {
      const res = await fetch(`/api/invite?token=${token}`);
      const data = await res.json();

      if (data.success) {
        setInviteInfo(data.invite);
        if (data.invite.ownerEmail) {
          setEmail(data.invite.ownerEmail);
        }
        if (data.invite.ownerName) {
          const parts = data.invite.ownerName.split(" ");
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
        }
      } else {
        setInviteError(data.error || "Invalid invite link");
      }
    } catch {
      setInviteError("Failed to validate invite link");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsSubmitting(false);
      return;
    }

    if (inviteInfo?.allowedDomain) {
      const emailDomain = email.split("@")[1]?.toLowerCase();
      const allowed = inviteInfo.allowedDomain.toLowerCase();
      if (emailDomain !== allowed) {
        setError(`Only @${allowed} email addresses are allowed for this organization.`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          organizationName: inviteInfo?.tenantName,
          inviteToken: token,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Registration failed");
      }

      setSuccess(
        "Account created! Check your email for a verification link. You must verify your email before you can log in."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "h-[52px] rounded-2xl border-0 bg-[#f5f5f7] text-[17px] text-[#1d1d1f] placeholder:text-[#86868b] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/30 focus:shadow-[0_0_0_4px_rgba(0,113,227,0.1)] transition-all duration-200 px-5";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#0071e3]" />
          <p className="text-[#86868b] text-[17px]">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center p-4">
        <div className="max-w-[440px] w-full bg-white/70 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-white/80 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-[28px] font-bold text-[#1d1d1f] mb-3">
            Invalid Invite
          </h1>
          <p className="text-[17px] text-[#86868b] mb-8">{inviteError}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full h-[52px] rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ background: "#0071e3" }}
            data-testid="button-go-to-login"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center p-4">
        <div className="max-w-[440px] w-full bg-white/70 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-white/80 text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-[28px] font-bold text-[#1d1d1f] mb-3">
            Account Created
          </h1>
          <p className="text-[17px] text-[#86868b] mb-8">{success}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full h-[52px] rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ background: "#0071e3" }}
            data-testid="button-go-to-login-after-register"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd] flex flex-col relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-[440px] bg-white/70 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-white/80">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#1e40af] flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-[28px] sm:text-[32px] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Join {inviteInfo?.tenantName}
            </h1>
            <p className="text-[15px] text-[#86868b] mt-2">
              Create your account to access the workspace
            </p>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <Shield className="w-5 h-5 text-[#0071e3]" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#1d1d1f]">
                  {inviteInfo?.tenantName}
                </p>
                <p className="text-[12px] text-[#86868b]">
                  {inviteInfo?.allowedDomain
                    ? `@${inviteInfo.allowedDomain} emails only`
                    : `Invited: ${inviteInfo?.ownerEmail}`}
                  {" · "}
                  {inviteInfo?.plan === "free"
                    ? "Trial"
                    : inviteInfo?.plan?.charAt(0).toUpperCase() +
                      (inviteInfo?.plan?.slice(1) || "")}{" "}
                  plan
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div
              className="mb-5 py-3 px-4 bg-[#fff5f5] rounded-2xl"
              data-testid="alert-error"
            >
              <p className="text-[14px] text-[#ff3b30] text-center">{error}</p>
            </div>
          )}

          <form
            onSubmit={handleRegister}
            className="space-y-3"
            data-testid="form-invite-register"
          >
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={inputClass}
                data-testid="input-first-name"
              />
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={inputClass}
                data-testid="input-last-name"
              />
            </div>

            <div className="relative">
              <Input
                type="email"
                placeholder={
                  inviteInfo?.allowedDomain
                    ? `you@${inviteInfo.allowedDomain}`
                    : "Work email"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                data-testid="input-email"
              />
              {inviteInfo?.allowedDomain && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-[#86868b] bg-[#e8e8ed] px-2 py-0.5 rounded-full">
                  @{inviteInfo.allowedDomain}
                </div>
              )}
            </div>

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={`${inputClass} pr-12`}
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                data-testid="button-toggle-password"
              >
                {showPassword ? (
                  <EyeOff className="w-[18px] h-[18px]" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" />
                )}
              </button>
            </div>

            <PasswordStrengthMeter password={password} showRequirements={true} />

            <button
              type="submit"
              disabled={isSubmitting || password.length < 8}
              className="w-full h-[52px] rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
              style={{
                background:
                  isSubmitting || password.length < 8 ? "#86868b" : "#0071e3",
              }}
              data-testid="button-submit-register"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Create account"
              )}
            </button>

            <p className="text-[12px] text-[#86868b] text-center leading-relaxed pt-1">
              By continuing, you agree to our{" "}
              <a href="/terms" className="text-[#0071e3] hover:underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-[#0071e3] hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </form>

          <div className="mt-8 text-center">
            <p className="text-[14px] text-[#86868b]">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-[#0071e3] hover:text-[#0077ED] font-medium transition-colors"
                data-testid="button-go-to-login"
              >
                Sign in
              </button>
            </p>
          </div>

          <div className="mt-10 flex items-center justify-center gap-5">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#86868b]" />
              <span className="text-[11px] text-[#86868b] font-medium">
                256-bit SSL
              </span>
            </div>
            <div className="w-px h-3 bg-[#e8e8ed]" />
            <span className="text-[11px] text-[#86868b] font-medium">
              GDPR Compliant
            </span>
            <div className="w-px h-3 bg-[#e8e8ed]" />
            <span className="text-[11px] text-[#86868b] font-medium">
              99.9% Uptime
            </span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-5 text-center">
        <p className="text-[12px] text-[#86868b]">
          Copyright &copy; 2026 PearSign Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
