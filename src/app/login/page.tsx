"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  Check,
  FileCheck,
  Shield,
  Zap,
  Lock,
} from "lucide-react";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

type AuthMode = "login" | "register" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [mounted, setMounted] = useState(false);
  const [activeCallout, setActiveCallout] = useState(0);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCallout((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!data.success) {
        if (data.error?.includes('verify your email')) {
          setShowResendVerification(true);
        }
        throw new Error(data.error || 'Login failed');
      }

      setShowResendVerification(false);
      setSuccess('Signed in successfully.');

      setTimeout(() => {
        window.location.href = '/';
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('verify your email')) {
        setShowResendVerification(true);
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          organizationName: organizationName || undefined
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess('Account created! Check your email for a verification link. You must verify your email before you can log in.');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send reset link');
      }

      setSuccess('If an account exists with this email, a reset link has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "h-[52px] rounded-2xl border-0 bg-[#f5f5f7] text-[17px] text-[#1d1d1f] placeholder:text-[#86868b] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/30 focus:shadow-[0_0_0_4px_rgba(0,113,227,0.1)] transition-all duration-200 px-5";

  const callouts = [
    { icon: FileCheck, label: "Legally binding", desc: "eIDAS & ESIGN compliant signatures", color: "#0071e3" },
    { icon: Shield, label: "Enterprise secure", desc: "256-bit encryption & audit trails", color: "#34c759" },
    { icon: Zap, label: "Lightning fast", desc: "Close deals 80% faster", color: "#ff9f0a" },
  ];

  return (
    <div className="min-h-screen bg-[#fbfbfd] flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-orb login-orb-4" />

        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <svg className="login-float login-float-1" width="200" height="260" viewBox="0 0 200 260" fill="none">
          <rect x="4" y="4" width="192" height="252" rx="12" fill="white" stroke="#e5e5ea" strokeWidth="1.5"/>
          <rect x="20" y="22" width="80" height="8" rx="4" fill="#e5e5ea"/>
          <rect x="20" y="40" width="160" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="52" width="140" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="64" width="155" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="80" width="160" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="92" width="120" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="108" width="160" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="120" width="100" height="5" rx="2.5" fill="#f0f0f2"/>
          <rect x="20" y="148" width="60" height="4" rx="2" fill="#86868b" opacity="0.3"/>
          <line x1="20" y1="168" x2="100" y2="168" stroke="#d1d1d6" strokeWidth="0.5" strokeDasharray="3 2"/>
          <path className="login-signature-path" d="M24 166 C30 154, 36 172, 44 160 C52 148, 56 170, 64 158 C68 152, 72 164, 78 156 C82 150, 88 162, 94 158" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <rect x="20" y="182" width="60" height="4" rx="2" fill="#86868b" opacity="0.3"/>
          <line x1="20" y1="202" x2="100" y2="202" stroke="#d1d1d6" strokeWidth="0.5" strokeDasharray="3 2"/>
          <rect x="20" y="206" width="50" height="3" rx="1.5" fill="#f0f0f2"/>
          <rect x="110" y="148" width="60" height="4" rx="2" fill="#86868b" opacity="0.3"/>
          <rect x="110" y="160" width="70" height="24" rx="4" fill="#f0f0f2"/>
          <text x="145" y="176" textAnchor="middle" fill="#86868b" fontSize="9" fontFamily="system-ui">Date</text>
          <circle className="login-stamp" cx="152" cy="220" r="22" stroke="#34c759" strokeWidth="1.5" fill="none" opacity="0"/>
          <path className="login-stamp-check" d="M142 220 L149 227 L163 213" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0"/>
        </svg>

        <svg className="login-float login-float-2 hidden sm:block" width="140" height="50" viewBox="0 0 140 50" fill="none">
          <rect x="2" y="2" width="136" height="46" rx="23" fill="white" stroke="#e5e5ea" strokeWidth="1"/>
          <circle cx="26" cy="25" r="12" fill="#0071e3" opacity="0.1"/>
          <path d="M21 25 L24 28 L31 21" stroke="#0071e3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          <rect x="46" y="18" width="48" height="5" rx="2.5" fill="#1d1d1f" opacity="0.08"/>
          <rect x="46" y="27" width="72" height="4" rx="2" fill="#86868b" opacity="0.15"/>
        </svg>

        <svg className="login-float login-float-3 hidden sm:block" width="140" height="50" viewBox="0 0 140 50" fill="none">
          <rect x="2" y="2" width="136" height="46" rx="23" fill="white" stroke="#e5e5ea" strokeWidth="1"/>
          <circle cx="26" cy="25" r="12" fill="#ff9f0a" opacity="0.1"/>
          <path d="M20 25 L26 25 M23 22 L23 28 M29 22 L29 28 L32 25 L29 22" stroke="#ff9f0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          <rect x="46" y="18" width="56" height="5" rx="2.5" fill="#1d1d1f" opacity="0.08"/>
          <rect x="46" y="27" width="40" height="4" rx="2" fill="#86868b" opacity="0.15"/>
        </svg>

        <svg className="login-float login-float-4 hidden sm:block" width="140" height="50" viewBox="0 0 140 50" fill="none">
          <rect x="2" y="2" width="136" height="46" rx="23" fill="white" stroke="#e5e5ea" strokeWidth="1"/>
          <circle cx="26" cy="25" r="12" fill="#34c759" opacity="0.1"/>
          <path d="M20 30 L24 20 L28 26 L32 18" stroke="#34c759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          <rect x="46" y="18" width="52" height="5" rx="2.5" fill="#1d1d1f" opacity="0.08"/>
          <rect x="46" y="27" width="64" height="4" rx="2" fill="#86868b" opacity="0.15"/>
        </svg>

        <svg className="login-float login-float-5" width="52" height="52" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="24" fill="white" stroke="#e5e5ea" strokeWidth="1"/>
          <path d="M18 28 C22 20, 28 32, 34 24" stroke="#0071e3" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
          <circle cx="34" cy="24" r="3" fill="#0071e3" opacity="0.15"/>
        </svg>
      </div>

      <nav className={`relative z-10 w-full px-6 sm:px-10 py-5 flex items-center justify-between transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex items-center gap-2.5">
          <img src="/pearsign-logo.png" alt="PearSign" className="w-12 h-12" />
          <span className="font-semibold text-[22px] tracking-tight text-[#1d1d1f]">PearSign</span>
        </div>
        {mode !== "forgot" && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
              setSuccess(null);
            }}
            className="text-[14px] font-medium text-[#0071e3] hover:text-[#0077ED] transition-colors"
            data-testid="button-switch-mode"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        )}
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className={`w-full max-w-[440px] bg-white/70 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-white/80 transition-all duration-600 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
              className="flex items-center gap-1 text-[14px] text-[#0071e3] hover:text-[#0077ED] font-medium mb-8 transition-colors"
              data-testid="button-back-to-login"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <div className="text-center mb-8">
            <h1 className="text-[32px] sm:text-[40px] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              {mode === "login" ? "Sign in to PearSign" : mode === "register" ? "Create your account" : "Reset your password"}
            </h1>
            {mode === "login" && (
              <p className="text-[17px] text-[#86868b] mt-2">
                Your documents are waiting.
              </p>
            )}
            {mode === "register" && (
              <p className="text-[17px] text-[#86868b] mt-2">
                Free for 14 days. No credit card needed.
              </p>
            )}
          </div>

          <div className={`mb-8 transition-all duration-700 delay-200 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="relative overflow-hidden rounded-2xl bg-[#fbfbfd] border border-[#e8e8ed]">
              <div className="flex">
                {callouts.map((item, i) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setActiveCallout(i)}
                    className={`flex-1 py-4 px-3 flex flex-col items-center gap-2 transition-all duration-500 relative ${
                      activeCallout === i ? 'bg-white shadow-sm' : 'hover:bg-white/50'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500"
                      style={{
                        background: activeCallout === i ? `${item.color}12` : '#f5f5f7',
                      }}
                    >
                      <item.icon
                        className="w-[18px] h-[18px] transition-colors duration-500"
                        style={{ color: activeCallout === i ? item.color : '#86868b' }}
                      />
                    </div>
                    <span className={`text-[12px] font-semibold tracking-tight transition-colors duration-500 ${
                      activeCallout === i ? 'text-[#1d1d1f]' : 'text-[#86868b]'
                    }`}>
                      {item.label}
                    </span>
                    {activeCallout === i && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full" style={{ background: item.color }} />
                    )}
                  </button>
                ))}
              </div>
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${activeCallout * 100}%)` }}
                >
                  {callouts.map((item) => (
                    <div key={item.label} className="w-full flex-shrink-0 px-5 py-3 text-center">
                      <p className="text-[13px] text-[#86868b]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-5 py-3 px-4 bg-[#fff5f5] rounded-2xl" data-testid="alert-error">
              <p className="text-[14px] text-[#ff3b30] text-center">{error}</p>
              {showResendVerification && (
                <button
                  type="button"
                  disabled={resendingVerification}
                  onClick={async () => {
                    setResendingVerification(true);
                    try {
                      const res = await fetch('/api/auth/verify-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setError(null);
                        setShowResendVerification(false);
                        setSuccess('Verification email sent! Check your inbox.');
                      } else {
                        setError(data.error || 'Failed to resend verification email');
                      }
                    } catch {
                      setError('Failed to resend verification email');
                    } finally {
                      setResendingVerification(false);
                    }
                  }}
                  className="mt-2 w-full text-[13px] font-medium text-[#0071e3] hover:underline"
                  data-testid="button-resend-verification"
                >
                  {resendingVerification ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          {success && (
            <div className="mb-5 py-3 px-4 bg-[#f0faf0] rounded-2xl flex items-center justify-center gap-2" data-testid="alert-success">
              <Check className="w-4 h-4 text-[#34c759]" />
              <p className="text-[14px] text-[#1d1d1f]">{success}</p>
            </div>
          )}

          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-3" data-testid="form-login">
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                data-testid="input-email"
              />

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputClass} pr-12`}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>

              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
                  className="text-[13px] text-[#0071e3] hover:text-[#0077ED] font-medium transition-colors"
                  data-testid="button-forgot-password"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[52px] rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
                style={{ background: isLoading ? '#86868b' : '#0071e3' }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = '#0077ED'; }}
                onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = '#0071e3'; }}
                data-testid="button-submit-login"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Sign in</>
                )}
              </button>
            </form>
          )}

          {mode === "register" && (
            <div className="text-center py-6" data-testid="register-invite-notice">
              <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-5">
                <Shield className="w-7 h-7 text-[#86868b]" />
              </div>
              <h3 className="text-[20px] font-semibold text-[#1d1d1f] mb-3">Invite Only</h3>
              <p className="text-[15px] text-[#86868b] leading-relaxed mb-6">
                PearSign registration is by invitation only. If your organization has been approved, you should have received an invite link via email.
              </p>
              <p className="text-[13px] text-[#86868b]">
                Contact your administrator if you need access.
              </p>
            </div>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-3" data-testid="form-forgot">
              <Input
                id="reset-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                data-testid="input-reset-email"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[52px] rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
                style={{ background: isLoading ? '#86868b' : '#0071e3' }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = '#0077ED'; }}
                onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = '#0071e3'; }}
                data-testid="button-submit-reset"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>
          )}

          {mode !== "forgot" && (
            <div className="mt-8 text-center">
              <p className="text-[14px] text-[#86868b]">
                {mode === "login" ? "New to PearSign?" : "Already have an account?"}
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-[#0071e3] hover:text-[#0077ED] font-medium transition-colors"
                  data-testid="button-switch-mode-bottom"
                >
                  {mode === "login" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </div>
          )}

          <div className={`mt-10 flex items-center justify-center gap-5 transition-all duration-700 delay-400 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#86868b]" />
              <span className="text-[11px] text-[#86868b] font-medium">256-bit SSL</span>
            </div>
            <div className="w-px h-3 bg-[#e8e8ed]" />
            <span className="text-[11px] text-[#86868b] font-medium">GDPR Compliant</span>
            <div className="w-px h-3 bg-[#e8e8ed]" />
            <span className="text-[11px] text-[#86868b] font-medium">99.9% Uptime</span>
          </div>
        </div>
      </main>

      <footer className={`relative z-10 py-5 text-center transition-all duration-700 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-[12px] text-[#86868b]">
          Copyright &copy; 2026 PearSign Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
