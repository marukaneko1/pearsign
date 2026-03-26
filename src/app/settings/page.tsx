"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SettingsRedirect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    const focus = searchParams.get("focus");
    const params = new URLSearchParams();
    params.set("view", "settings");
    if (tab) params.set("tab", tab);
    if (focus) params.set("focus", focus);
    window.location.replace(`/?${params.toString()}`);
  }, [searchParams]);

  return null;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsRedirect />
    </Suspense>
  );
}
