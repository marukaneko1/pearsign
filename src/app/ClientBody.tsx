"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-context";
import { TenantProvider } from "@/contexts/tenant-context";
import { TenantSessionProvider } from "@/contexts/tenant-session-context";
import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/cookie-consent";
import { initCapacitor } from "@/lib/capacitor";

export default function ClientBody({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.className = "antialiased";
    initCapacitor();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <TenantSessionProvider>
          <TenantProvider>
            <div className="antialiased">{children}</div>
            <Toaster />
            <CookieConsent />
          </TenantProvider>
        </TenantSessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
