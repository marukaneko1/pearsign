"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
  className?: string;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "Contains uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "Contains lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "Contains a number", test: (p) => /[0-9]/.test(p) },
  { label: "Contains special character", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

type StrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

interface StrengthConfig {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  percentage: number;
}

const STRENGTH_CONFIG: Record<StrengthLevel, StrengthConfig> = {
  empty: {
    label: "",
    color: "bg-gray-200 dark:bg-gray-700",
    bgColor: "bg-gray-200 dark:bg-gray-700",
    textColor: "text-gray-400",
    percentage: 0,
  },
  weak: {
    label: "Weak",
    color: "bg-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    textColor: "text-red-600 dark:text-red-400",
    percentage: 25,
  },
  fair: {
    label: "Fair",
    color: "bg-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    percentage: 50,
  },
  good: {
    label: "Good",
    color: "bg-yellow-500",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-600 dark:text-yellow-400",
    percentage: 75,
  },
  strong: {
    label: "Strong",
    color: "bg-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    textColor: "text-green-600 dark:text-green-400",
    percentage: 100,
  },
};

function calculateStrength(password: string): StrengthLevel {
  if (!password) return "empty";

  let score = 0;

  // Length scoring
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;

  // Complexity bonus
  if (password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
    score += 1;
  }

  // Map score to strength level
  if (score <= 2) return "weak";
  if (score <= 4) return "fair";
  if (score <= 6) return "good";
  return "strong";
}

export function PasswordStrengthMeter({
  password,
  showRequirements = true,
  className
}: PasswordStrengthMeterProps) {
  const strength = useMemo(() => calculateStrength(password), [password]);
  const config = STRENGTH_CONFIG[strength];

  const metRequirements = useMemo(() => {
    return PASSWORD_REQUIREMENTS.map(req => ({
      ...req,
      met: req.test(password),
    }));
  }, [password]);

  const metCount = metRequirements.filter(r => r.met).length;

  if (!password) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Strength Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">Password strength</span>
          <span className={cn("text-xs font-medium", config.textColor)}>
            {config.label}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300 ease-out",
              config.color
            )}
            style={{ width: `${config.percentage}%` }}
          />
        </div>

        {/* Strength Indicators */}
        <div className="flex gap-1">
          {["weak", "fair", "good", "strong"].map((level, index) => {
            const isActive =
              (level === "weak" && ["weak", "fair", "good", "strong"].includes(strength)) ||
              (level === "fair" && ["fair", "good", "strong"].includes(strength)) ||
              (level === "good" && ["good", "strong"].includes(strength)) ||
              (level === "strong" && strength === "strong");

            return (
              <div
                key={level}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-200",
                  isActive ? STRENGTH_CONFIG[level as StrengthLevel].color : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className={cn(
          "rounded-lg p-3 transition-colors duration-200",
          config.bgColor
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Password requirements
            </span>
            <span className={cn("text-xs", config.textColor)}>
              {metCount}/{PASSWORD_REQUIREMENTS.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {metRequirements.map((req, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-2 text-xs transition-colors duration-200",
                  req.met
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                {req.met ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className={req.met ? "line-through opacity-70" : ""}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Export helper for checking if password meets minimum requirements
export function isPasswordValid(password: string): boolean {
  return password.length >= 8;
}

// Export helper for checking if password is strong enough
export function isPasswordStrong(password: string): boolean {
  const strength = calculateStrength(password);
  return strength === "good" || strength === "strong";
}
