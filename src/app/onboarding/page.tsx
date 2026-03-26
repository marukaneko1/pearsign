"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingSuccess } from "@/components/onboarding-success";
import { useToast } from "@/hooks/use-toast";

interface OnboardingData {
  organizationName: string;
  plan: string;
  teamInvites: Array<{ email: string; role: string }>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isComplete, setIsComplete] = useState(false);
  const [completedData, setCompletedData] = useState<OnboardingData | null>(null);

  const handleComplete = (data: OnboardingData) => {
    setCompletedData(data);
    setIsComplete(true);

    toast({
      title: "Organization created!",
      description: `${data.organizationName} is ready to use.`,
    });
  };

  const handleContinue = () => {
    // Redirect to dashboard
    router.push("/");
  };

  const handleCancel = () => {
    router.push("/");
  };

  if (isComplete && completedData) {
    return (
      <OnboardingSuccess
        organizationName={completedData.organizationName}
        plan={completedData.plan}
        teamInvitesCount={completedData.teamInvites.filter(i => i.email).length}
        onContinue={handleContinue}
      />
    );
  }

  return (
    <OnboardingWizard
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  );
}
