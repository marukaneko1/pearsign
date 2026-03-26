"use client";

import { useState, useEffect } from "react";
import { SettingsLayout, type SettingsSection } from "./settings-layout";
import { GeneralSettings } from "./general-settings";
import { StorageBillingSettings } from "./storage-billing-settings";
import { TeamSettings } from "./team-settings";
import { RolesSettings } from "./roles-settings";
import { EmailSettings } from "./email-settings";
import { BrandingSettings } from "./branding-settings";
import { TimeSettings } from "./time-settings";
import { ComplianceSettings } from "./compliance-settings";
import { NotificationSettings } from "./notification-settings";
import { ApiKeysSettings } from "./api-keys-settings";
import { ApiAnalyticsSettings } from "./api-analytics-settings";
import { RateLimitAlertsSettings } from "./rate-limit-alerts-settings";
import { ApiDocumentationSettings } from "./api-documentation-settings";
import { ModulesSettings } from "./modules-settings";
import { IntegrationsSettings } from "./integrations-settings";
import { SetupGuideSettings } from "./setup-guide-settings";
import { CertificatesSettings } from "./certificates-settings";
import { PaymentProcessorsSettings } from "./payment-processors-settings";

interface SettingsPageContainerProps {
  onClose: () => void;
  initialSection?: SettingsSection;
}

export function SettingsPageContainer({ onClose, initialSection }: SettingsPageContainerProps) {
  const [currentSection, setCurrentSection] = useState<SettingsSection>(initialSection || "general");

  // Update section when initialSection prop changes
  useEffect(() => {
    if (initialSection) {
      setCurrentSection(initialSection);
    }
  }, [initialSection]);

  const renderSection = () => {
    switch (currentSection) {
      case "general":
        return <GeneralSettings />;
      case "setup-guide":
        return <SetupGuideSettings />;
      case "storage-billing":
        return <StorageBillingSettings />;
      case "modules":
        return <ModulesSettings />;
      case "integrations":
        return <IntegrationsSettings />;
      case "api-keys":
        return <ApiKeysSettings />;
      case "api-analytics":
        return <ApiAnalyticsSettings />;
      case "rate-limit-alerts":
        return <RateLimitAlertsSettings />;
      case "api-documentation":
        return <ApiDocumentationSettings />;
      case "notifications":
        return <NotificationSettings />;
      case "team":
        return <TeamSettings />;
      case "roles":
        return <RolesSettings />;
      case "email":
        return <EmailSettings />;
      case "branding":
        return <BrandingSettings />;
      case "time":
        return <TimeSettings />;
      case "compliance":
        return <ComplianceSettings />;
      case "certificates":
        return <CertificatesSettings />;
      case "payment-processors":
        return <PaymentProcessorsSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <SettingsLayout
      currentSection={currentSection}
      onNavigate={setCurrentSection}
      onBack={onClose}
    >
      {renderSection()}
    </SettingsLayout>
  );
}

export { GeneralSettings } from "./general-settings";
export { StorageBillingSettings } from "./storage-billing-settings";
export { TeamSettings } from "./team-settings";
export { RolesSettings } from "./roles-settings";
export { EmailSettings } from "./email-settings";
export { BrandingSettings } from "./branding-settings";
export { TimeSettings } from "./time-settings";
export { ComplianceSettings } from "./compliance-settings";
export { NotificationSettings } from "./notification-settings";
export { ApiKeysSettings } from "./api-keys-settings";
export { ApiAnalyticsSettings } from "./api-analytics-settings";
export { RateLimitAlertsSettings } from "./rate-limit-alerts-settings";
export { ApiDocumentationSettings } from "./api-documentation-settings";
export { ModulesSettings } from "./modules-settings";
export { IntegrationsSettings } from "./integrations-settings";
export { SetupGuideSettings } from "./setup-guide-settings";
export { CertificatesSettings } from "./certificates-settings";
export { PaymentProcessorsSettings } from "./payment-processors-settings";
export { SettingsLayout } from "./settings-layout";
export type { SettingsSection } from "./settings-layout";
