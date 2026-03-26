"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X, Cookie, Settings, Shield } from "lucide-react";

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  preferences: boolean;
  accepted: boolean;
  timestamp?: string;
}

const COOKIE_CONSENT_KEY = "pearsign_cookie_consent";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true, // Always required
    analytics: false,
    preferences: false,
    accepted: false,
  });

  useEffect(() => {
    // Check if user has already set cookie preferences
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.accepted) {
          setPreferences(parsed);
          return;
        }
      } catch (e) {
        // Invalid stored data
      }
    }

    // Show banner after a short delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const toSave = {
      ...prefs,
      accepted: true,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(toSave));
    setPreferences(toSave);
    setIsVisible(false);
    setShowSettings(false);
  };

  const acceptAll = () => {
    savePreferences({
      essential: true,
      analytics: true,
      preferences: true,
      accepted: true,
    });
  };

  const acceptSelected = () => {
    savePreferences(preferences);
  };

  const rejectNonEssential = () => {
    savePreferences({
      essential: true,
      analytics: false,
      preferences: false,
      accepted: true,
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    // Non-blocking Banner - no backdrop to allow page interaction
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {!showSettings ? (
            // Main Banner
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}>
                  <Cookie className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    We value your privacy
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.
                    By clicking "Accept All", you consent to our use of cookies.{" "}
                    <Link href="/privacy" className="text-[#2464ea] hover:underline">
                      Read our Privacy Policy
                    </Link>
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={acceptAll}
                      className="text-white font-medium"
                      style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}
                    >
                      Accept All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={rejectNonEssential}
                    >
                      Reject Non-Essential
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setShowSettings(true)}
                      className="text-gray-600 dark:text-gray-400"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Customize
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Settings Panel
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}>
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Cookie Settings
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Manage your cookie preferences
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                {/* Essential Cookies */}
                <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">Essential Cookies</h4>
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                        Required
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      These cookies are necessary for the website to function properly. They enable core functionality such as security, account access, and session management.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <div className="w-12 h-6 bg-[#2464ea] rounded-full flex items-center justify-end px-1">
                      <div className="w-4 h-4 bg-white rounded-full shadow" />
                    </div>
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex-1 pr-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">Analytics Cookies</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      These cookies help us understand how you use our website, which pages you visit, and how you interact with features. This helps us improve our services.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <button
                      onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                      className={`w-12 h-6 rounded-full flex items-center transition-colors ${
                        preferences.analytics
                          ? 'bg-[#2464ea] justify-end'
                          : 'bg-gray-300 dark:bg-gray-600 justify-start'
                      } px-1`}
                    >
                      <div className="w-4 h-4 bg-white rounded-full shadow" />
                    </button>
                  </div>
                </div>

                {/* Preference Cookies */}
                <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex-1 pr-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">Preference Cookies</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      These cookies remember your settings and preferences, such as theme, language, and customizations, to provide a more personalized experience.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <button
                      onClick={() => setPreferences(p => ({ ...p, preferences: !p.preferences }))}
                      className={`w-12 h-6 rounded-full flex items-center transition-colors ${
                        preferences.preferences
                          ? 'bg-[#2464ea] justify-end'
                          : 'bg-gray-300 dark:bg-gray-600 justify-start'
                      } px-1`}
                    >
                      <div className="w-4 h-4 bg-white rounded-full shadow" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link
                  href="/privacy"
                  className="text-sm text-[#2464ea] hover:underline"
                >
                  Privacy Policy
                </Link>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={rejectNonEssential}
                  >
                    Reject All
                  </Button>
                  <Button
                    onClick={acceptSelected}
                    className="text-white font-medium"
                    style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}
                  >
                    Save Preferences
                  </Button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook to check cookie consent
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookiePreferences | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      try {
        setConsent(JSON.parse(stored));
      } catch (e) {
        setConsent(null);
      }
    }
  }, []);

  return {
    hasConsent: consent?.accepted ?? false,
    allowsAnalytics: consent?.analytics ?? false,
    allowsPreferences: consent?.preferences ?? false,
    resetConsent: () => {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
      window.location.reload();
    },
  };
}
