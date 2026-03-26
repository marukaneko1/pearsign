"use client";

import { useState, useEffect } from "react";

type AuthMode = "login" | "register" | "forgot";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      let data: { success?: boolean; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        throw new Error(response.ok ? "Login failed" : `Server error (${response.status})`);
      }

      if (!response.ok || !data.success) {
        if (data.error?.includes("verify your email")) {
          setShowResendVerification(true);
        }
        throw new Error(data.error || "Login failed");
      }

      setShowResendVerification(false);
      setSuccess("Signed in successfully.");
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg.includes("verify your email")) {
        setShowResendVerification(true);
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      let data: { success?: boolean; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server error (${response.status})`);
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to send reset link");
      }
      setSuccess("If an account exists with this email, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset link");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setError(null);
        setShowResendVerification(false);
        setSuccess("Verification email sent! Check your inbox.");
      } else {
        setError(data.error || "Failed to resend verification email");
      }
    } catch {
      setError("Failed to resend verification email");
    } finally {
      setResendingVerification(false);
    }
  };

  const [activeFeature, setActiveFeature] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setActiveFeature((p) => (p + 1) % 3), 4000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    { label: "Legally binding", desc: "eIDAS & ESIGN compliant signatures", icon: "📄", color: "#0071e3" },
    { label: "Enterprise secure", desc: "256-bit encryption & audit trails", icon: "🛡️", color: "#34c759" },
    { label: "Lightning fast", desc: "Close deals 80% faster", icon: "⚡", color: "#ff9f0a" },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "52px",
    borderRadius: "16px",
    border: "none",
    background: "#f5f5f7",
    fontSize: "17px",
    color: "#1d1d1f",
    padding: "0 20px",
    outline: "none",
    boxSizing: "border-box",
    transition: "all 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fbfbfd",
      display: "flex",
      flexDirection: "column",
      fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif",
    }}>
      {/* Nav */}
      <nav style={{
        width: "100%",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/pearsign-logo.png" alt="PearSign" style={{ width: "48px", height: "48px" }} />
          <span style={{ fontWeight: 600, fontSize: "22px", letterSpacing: "-0.02em", color: "#1d1d1f" }}>PearSign</span>
        </div>
        {mode !== "forgot" && (
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); setSuccess(null); }}
            style={{ background: "none", border: "none", color: "#0071e3", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        )}
      </nav>

      {/* Main */}
      <main style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 16px",
        position: "relative",
        zIndex: 10,
      }}>
        <div style={{
          width: "100%",
          maxWidth: "440px",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "24px",
          padding: "clamp(20px, 5vw, 32px) clamp(16px, 6vw, 40px)",
          boxShadow: "0 2px 40px rgba(0,0,0,0.06)",
          border: "1px solid rgba(255,255,255,0.8)",
        }}>
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
              style={{ background: "none", border: "none", color: "#0071e3", fontSize: "14px", fontWeight: 500, cursor: "pointer", marginBottom: "24px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              ← Back
            </button>
          )}

          {/* Heading */}
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>
              {mode === "login" ? "Sign in to PearSign" : mode === "register" ? "Create your account" : "Reset your password"}
            </h1>
            {mode === "login" && <p style={{ fontSize: "17px", color: "#86868b", marginTop: "8px" }}>Your documents are waiting.</p>}
            {mode === "register" && <p style={{ fontSize: "17px", color: "#86868b", marginTop: "8px" }}>Free for 14 days. No credit card needed.</p>}
          </div>

          {/* Feature callouts */}
          {mode === "login" && (
            <div style={{ marginBottom: "32px", borderRadius: "16px", background: "#fbfbfd", border: "1px solid #e8e8ed", overflow: "hidden" }} role="tablist" aria-label="PearSign features">
              <div style={{ display: "flex" }}>
                {features.map((f, i) => (
                  <button
                    key={f.label}
                    type="button"
                    role="tab"
                    aria-selected={activeFeature === i}
                    aria-controls="feature-desc"
                    onClick={() => setActiveFeature(i)}
                    style={{
                      flex: 1,
                      padding: "16px 8px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      background: activeFeature === i ? "#ffffff" : "transparent",
                      border: "none",
                      borderBottom: activeFeature === i ? `2px solid ${f.color}` : "2px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.3s",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>{f.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: activeFeature === i ? "#1d1d1f" : "#86868b" }}>{f.label}</span>
                  </button>
                ))}
              </div>
              <div id="feature-desc" role="tabpanel" style={{ padding: "12px 20px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "#86868b", margin: 0 }}>{features[activeFeature].desc}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" aria-live="assertive" style={{ background: "#fff5f5", borderRadius: "16px", padding: "12px 16px", marginBottom: "20px", textAlign: "center" }}>
              <p style={{ fontSize: "14px", color: "#ff3b30", margin: 0 }}>{error}</p>
              {showResendVerification && (
                <button
                  type="button"
                  disabled={resendingVerification}
                  onClick={handleResendVerification}
                  style={{ background: "none", border: "none", color: "#0071e3", fontSize: "13px", fontWeight: 500, cursor: "pointer", marginTop: "8px" }}
                >
                  {resendingVerification ? "Sending..." : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          {/* Success */}
          {success && (
            <div role="status" aria-live="polite" style={{ background: "#f0faf0", borderRadius: "16px", padding: "12px 16px", marginBottom: "20px", textAlign: "center" }}>
              <p style={{ fontSize: "14px", color: "#1d1d1f", margin: 0 }}>✓ {success}</p>
            </div>
          )}

          {/* Login form */}
          {mode === "login" && (
            <form onSubmit={handleLogin} aria-label="Sign in form" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label htmlFor="login-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Email address</label>
              <input
                id="login-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
                aria-invalid={!!error}
                autoComplete="email"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(0,113,227,0.1)"; }}
                onBlur={(e) => { e.currentTarget.style.background = "#f5f5f7"; e.currentTarget.style.boxShadow = "none"; }}
              />

              <div style={{ position: "relative" }}>
                <label htmlFor="login-password" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Password</label>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: "48px" }}
                  onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(0,113,227,0.1)"; }}
                  onBlur={(e) => { e.currentTarget.style.background = "#f5f5f7"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#86868b", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <div style={{ textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
                  style={{ background: "none", border: "none", color: "#0071e3", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: "100%",
                  height: "52px",
                  borderRadius: "16px",
                  border: "none",
                  background: isLoading ? "#86868b" : "#0071e3",
                  color: "#fff",
                  fontSize: "17px",
                  fontWeight: 600,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = "#0077ED"; }}
                onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = "#0071e3"; }}
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          {/* Register notice */}
          {mode === "register" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <span style={{ fontSize: "28px" }}>🛡️</span>
              </div>
              <h3 style={{ fontSize: "20px", fontWeight: 600, color: "#1d1d1f", margin: "0 0 12px" }}>Invite Only</h3>
              <p style={{ fontSize: "15px", color: "#86868b", lineHeight: 1.6, margin: "0 0 24px" }}>
                PearSign registration is by invitation only. If your organization has been approved, you should have received an invite link via email.
              </p>
              <p style={{ fontSize: "13px", color: "#86868b", margin: 0 }}>Contact your administrator if you need access.</p>
            </div>
          )}

          {/* Forgot password form */}
          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword} aria-label="Reset password form" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label htmlFor="forgot-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Email address</label>
              <input
                id="forgot-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
                autoComplete="email"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(0,113,227,0.1)"; }}
                onBlur={(e) => { e.currentTarget.style.background = "#f5f5f7"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: "100%",
                  height: "52px",
                  borderRadius: "16px",
                  border: "none",
                  background: isLoading ? "#86868b" : "#0071e3",
                  color: "#fff",
                  fontSize: "17px",
                  fontWeight: 600,
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                {isLoading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          {/* Switch mode */}
          {mode !== "forgot" && (
            <div style={{ textAlign: "center", marginTop: "32px" }}>
              <span style={{ fontSize: "14px", color: "#86868b" }}>
                {mode === "login" ? "New to PearSign? " : "Already have an account? "}
              </span>
              <button
                type="button"
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); setSuccess(null); }}
                style={{ background: "none", border: "none", color: "#0071e3", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </div>
          )}

          {/* Trust badges */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "32px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", color: "#86868b", fontWeight: 500 }}>🔒 256-bit SSL</span>
            </div>
            <div style={{ width: "1px", height: "12px", background: "#e8e8ed" }} />
            <span style={{ fontSize: "11px", color: "#86868b", fontWeight: 500 }}>GDPR Compliant</span>
            <div style={{ width: "1px", height: "12px", background: "#e8e8ed" }} />
            <span style={{ fontSize: "11px", color: "#86868b", fontWeight: 500 }}>99.9% Uptime</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: "20px", textAlign: "center", position: "relative", zIndex: 10 }}>
        <p style={{ fontSize: "12px", color: "#86868b", margin: 0 }}>
          Copyright © 2026 PearSign Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
