"use client";

import { useRouter } from "next/navigation";
import { LandingPage } from "@/components/landing-page";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <LandingPage
      onGetStarted={() => router.push("/login")}
      onLogin={() => router.push("/login")}
    />
  );
}
