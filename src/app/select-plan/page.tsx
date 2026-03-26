"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Check,
  Zap,
  Building2,
  Crown,
  ArrowRight,
  Loader2,
} from "lucide-react";

const plans = [
  {
    id: "free",
    name: "Trial",
    description: "Try PearSign with 5 free sends",
    priceMonthly: 0,
    priceYearly: 0,
    badge: "Current",
    features: [
      "5 document sends total",
      "3 templates",
      "1 user",
      "Email support",
    ],
    icon: Zap,
    color: "#86868b",
    popular: false,
  },
  {
    id: "starter",
    name: "Starter",
    description: "For small teams getting started",
    priceMonthly: 19,
    priceYearly: 190,
    badge: null,
    features: [
      "50 documents per month",
      "10 templates",
      "3 team members",
      "Custom branding",
      "Webhooks & API access",
      "Priority email support",
    ],
    icon: Building2,
    color: "#0071e3",
    popular: true,
  },
  {
    id: "professional",
    name: "Professional",
    description: "For growing businesses",
    priceMonthly: 49,
    priceYearly: 490,
    badge: null,
    features: [
      "500 documents per month",
      "100 templates",
      "15 team members",
      "Bulk send",
      "Phone verification (2FA)",
      "All integrations",
      "Chat support",
    ],
    icon: Crown,
    color: "#5e5ce6",
    popular: false,
  },
];

export default function SelectPlanPage() {
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId);
    setIsLoading(true);

    if (planId === "free") {
      router.push("/login");
      return;
    }

    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "createCheckout",
          plan: planId,
          billingPeriod,
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl || data.url) {
        window.location.href = data.checkoutUrl || data.url;
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: "linear-gradient(135deg, #0071e3 0%, #5e5ce6 100%)" }}>
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1d1d1f] tracking-tight mb-4">
            Choose your plan
          </h1>
          <p className="text-lg text-[#86868b] max-w-xl mx-auto">
            Start with 5 free sends on the Trial plan, or choose a paid plan to unlock more features.
          </p>
        </div>

        <div className="flex items-center justify-center mb-10">
          <div className="bg-white rounded-full p-1 shadow-sm border border-gray-200 flex">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                billingPeriod === "monthly"
                  ? "bg-[#1d1d1f] text-white"
                  : "text-[#86868b] hover:text-[#1d1d1f]"
              }`}
              data-testid="toggle-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                billingPeriod === "yearly"
                  ? "bg-[#1d1d1f] text-white"
                  : "text-[#86868b] hover:text-[#1d1d1f]"
              }`}
              data-testid="toggle-yearly"
            >
              Yearly
              <span className="ml-1 text-[#34c759] text-xs font-semibold">Save 17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = billingPeriod === "monthly" ? plan.priceMonthly : Math.round(plan.priceYearly / 12);
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                  plan.popular
                    ? "border-[#0071e3] shadow-lg shadow-blue-100"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {plan.popular && (
                  <div className="bg-[#0071e3] text-white text-center py-1.5 text-xs font-semibold tracking-wide uppercase">
                    Most Popular
                  </div>
                )}

                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${plan.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: plan.color }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#1d1d1f]">{plan.name}</h3>
                      {plan.badge && (
                        <span className="text-xs font-medium text-[#86868b] bg-gray-100 px-2 py-0.5 rounded-full">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-[#86868b] mb-5">{plan.description}</p>

                  <div className="mb-6">
                    {plan.priceMonthly === 0 ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-[#1d1d1f]">Free</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-[#1d1d1f]">${price}</span>
                        <span className="text-[#86868b] text-sm">/month</span>
                      </div>
                    )}
                    {billingPeriod === "yearly" && plan.priceYearly > 0 && (
                      <p className="text-xs text-[#34c759] mt-1">
                        ${plan.priceYearly}/year — save ${plan.priceMonthly * 12 - plan.priceYearly}
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isLoading && isSelected}
                    className={`w-full h-11 rounded-xl font-semibold transition-all ${
                      plan.id === "free"
                        ? "bg-gray-100 text-[#1d1d1f] hover:bg-gray-200 border border-gray-200"
                        : "text-white"
                    }`}
                    style={
                      plan.id !== "free"
                        ? { background: `linear-gradient(135deg, ${plan.color} 0%, ${plan.color}dd 100%)` }
                        : undefined
                    }
                    data-testid={`button-select-${plan.id}`}
                  >
                    {isLoading && isSelected ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : plan.id === "free" ? (
                      <>
                        Start Trial
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    ) : (
                      <>
                        Get {plan.name}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: plan.color }} />
                        <span className="text-sm text-[#1d1d1f]">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm text-[#86868b]">
            Need more? <a href="mailto:info@pearsign.com" className="text-[#0071e3] hover:underline">Contact us</a> for Enterprise pricing with unlimited everything.
          </p>
        </div>
      </div>
    </div>
  );
}
