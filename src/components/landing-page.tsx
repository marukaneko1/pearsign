"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileSignature,
  Shield,
  Zap,
  Users,
  Globe,
  Clock,
  Check,
  ArrowRight,
  Star,
  Building2,
  Lock,
  FileCheck,
  Workflow,
  BarChart3,
  Smartphone,
  Mail,
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img src="/pearsign-logo.png" alt="PearSign" className="w-8 h-8" />
              <span className="text-xl font-bold text-gray-900">PearSign</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm font-medium">Features</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 text-sm font-medium">Pricing</a>
              <a href="#security" className="text-gray-600 hover:text-gray-900 text-sm font-medium">Security</a>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onLogin} className="text-gray-600">
                Sign In
              </Button>
              <Button onClick={onGetStarted} className="bg-teal-600 hover:bg-teal-700">
                Get Started Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Star className="w-4 h-4" />
              Trusted by 10,000+ businesses worldwide
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 tracking-tight mb-6">
              Sign documents
              <span className="text-teal-600"> faster</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              The modern e-signature platform that helps you close deals faster.
              Get documents signed in minutes, not days. Legally binding and Adobe-certified.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" onClick={onGetStarted} className="bg-teal-600 hover:bg-teal-700 h-14 px-8 text-lg">
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={onLogin} className="h-14 px-8 text-lg">
                Watch Demo
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </div>

          {/* Hero Image/Preview */}
          <div className="mt-16 relative">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-1">
              <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
                <div className="bg-gray-100 px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 bg-white rounded-lg shadow-lg p-6 border">
                      <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
                      <div className="h-3 w-full bg-gray-100 rounded mb-2" />
                      <div className="h-3 w-3/4 bg-gray-100 rounded mb-6" />
                      <div className="border-2 border-dashed border-teal-300 rounded-lg p-4 bg-teal-50/50">
                        <div className="flex items-center gap-3">
                          <FileSignature className="w-8 h-8 text-teal-600" />
                          <div>
                            <div className="h-3 w-24 bg-teal-200 rounded mb-1" />
                            <div className="h-2 w-16 bg-teal-100 rounded" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white rounded-lg shadow p-4 border">
                        <div className="flex items-center gap-2 mb-2">
                          <Check className="w-5 h-5 text-green-500" />
                          <span className="text-sm font-medium text-gray-700">Sent to signer</span>
                        </div>
                        <div className="h-2 w-full bg-green-100 rounded" />
                      </div>
                      <div className="bg-white rounded-lg shadow p-4 border">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-5 h-5 text-amber-500" />
                          <span className="text-sm font-medium text-gray-700">Awaiting signature</span>
                        </div>
                        <div className="h-2 w-3/4 bg-amber-100 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 mb-8">Trusted by leading companies</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
            {["TechCorp", "StartupX", "Enterprise Co", "Innovation Labs", "Global Inc"].map((company) => (
              <div key={company} className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-gray-400" />
                <span className="text-lg font-semibold text-gray-400">{company}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything you need to close deals faster
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A complete e-signature solution with enterprise-grade security and
              the simplicity your team deserves.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: FileSignature,
                title: "Drag & Drop Signing",
                description: "Place signature fields anywhere on your documents. Support for signatures, initials, dates, and custom fields.",
              },
              {
                icon: Shield,
                title: "Bank-Level Security",
                description: "256-bit encryption with complete audit trails for every document.",
              },
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Documents signed in minutes, not days. Automated reminders keep things moving.",
              },
              {
                icon: Users,
                title: "Multi-Signer Support",
                description: "Route documents to multiple signers in order. Track progress in real-time.",
              },
              {
                icon: Globe,
                title: "Works Everywhere",
                description: "Sign from any device - desktop, tablet, or mobile. No downloads required.",
              },
              {
                icon: FileCheck,
                title: "Adobe Certified",
                description: "PKI digital signatures recognized by Adobe Acrobat with blue certification ribbon.",
              },
              {
                icon: Workflow,
                title: "Templates & Bulk Send",
                description: "Save time with reusable templates. Send to hundreds of recipients at once.",
              },
              {
                icon: BarChart3,
                title: "Analytics Dashboard",
                description: "Track completion rates, average signing time, and team productivity.",
              },
              {
                icon: Lock,
                title: "Phone Verification",
                description: "Optional 2FA with SMS verification for high-security documents.",
              },
            ].map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-teal-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Integrates with your favorite tools
            </h2>
            <p className="text-xl text-gray-600">
              Connect PearSign with the apps you already use
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { name: "Google Drive", icon: "📁" },
              { name: "Dropbox", icon: "📦" },
              { name: "Salesforce", icon: "☁️" },
              { name: "Slack", icon: "💬" },
              { name: "Zapier", icon: "⚡" },
              { name: "Webhooks", icon: "🔗" },
            ].map((integration) => (
              <div key={integration.name} className="bg-white rounded-xl px-6 py-4 shadow-md flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <span className="font-medium text-gray-700">{integration.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Start free, upgrade as you grow
            </p>
            <div className="inline-flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "monthly" ? "bg-white shadow text-gray-900" : "text-gray-600"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "yearly" ? "bg-white shadow text-gray-900" : "text-gray-600"
                }`}
              >
                Yearly <span className="text-teal-600 text-xs">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                name: "Free",
                price: 0,
                description: "For individuals getting started",
                features: ["5 documents/month", "1 user", "Basic templates", "Email support"],
                cta: "Start Free",
                popular: false,
              },
              {
                name: "Starter",
                price: billingCycle === "yearly" ? 12 : 15,
                description: "For small teams",
                features: ["50 documents/month", "5 users", "Templates", "Reminders", "Branding"],
                cta: "Start Trial",
                popular: false,
              },
              {
                name: "Professional",
                price: billingCycle === "yearly" ? 32 : 40,
                description: "For growing businesses",
                features: ["Unlimited documents", "25 users", "Bulk send", "API access", "Phone verification", "Priority support"],
                cta: "Start Trial",
                popular: true,
              },
              {
                name: "Enterprise",
                price: null,
                description: "For large organizations",
                features: ["Everything in Pro", "Unlimited users", "SSO/SAML", "White-label", "Dedicated support", "Custom SLA"],
                cta: "Contact Sales",
                popular: false,
              },
            ].map((plan) => (
              <Card
                key={plan.name}
                className={`relative ${plan.popular ? "border-2 border-teal-600 shadow-xl" : "border shadow-lg"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-teal-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="mb-4">
                    {plan.price !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                        <span className="text-gray-600">/month</span>
                      </div>
                    ) : (
                      <div className="text-4xl font-bold text-gray-900">Custom</div>
                    )}
                  </div>
                  <p className="text-gray-600 mb-6">{plan.description}</p>
                  <Button
                    className={`w-full mb-6 ${plan.popular ? "bg-teal-600 hover:bg-teal-700" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                    onClick={onGetStarted}
                  >
                    {plan.cta}
                  </Button>
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">
                Enterprise-grade security you can trust
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Your documents are protected with the same level of security used by banks and governments.
              </p>
              <ul className="space-y-4">
                {[
                  "256-bit AES encryption at rest and in transit",
                  "Enterprise-grade security infrastructure",
                  "ESIGN Act and UETA compliant",
                  "GDPR and CCPA ready",
                  "Complete audit trails with timestamps",
                  "PKI digital signatures (Adobe certified)",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center">
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: "Documents Signed", value: "10M+" },
                { label: "Countries", value: "190+" },
                { label: "Uptime SLA", value: "99.9%" },
                { label: "Support Response", value: "<2hr" },
              ].map((stat, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-6 text-center">
                  <div className="text-3xl font-bold text-teal-400 mb-2">{stat.value}</div>
                  <div className="text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-teal-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to streamline your document signing?
          </h2>
          <p className="text-xl text-teal-100 mb-8">
            Join thousands of businesses that trust PearSign for their e-signatures.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={onGetStarted} className="bg-white text-teal-600 hover:bg-gray-100 h-14 px-8 text-lg">
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 h-14 px-8 text-lg" asChild>
              <a href="mailto:info@pearsign.com">
                <Mail className="mr-2 w-5 h-5" />
                Contact Sales
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/pearsign-logo.png" alt="PearSign" className="w-8 h-8" />
                <span className="text-xl font-bold text-white">PearSign</span>
              </div>
              <p className="text-sm">
                The modern e-signature platform for businesses of all sizes.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#security" className="hover:text-white">Security</a></li>
                <li><a href="/docs" className="hover:text-white">API Docs</a></li>
                <li><a href="/verify" className="hover:text-white">Verify Document</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:info@pearsign.com" className="hover:text-white">About</a></li>
                <li><a href="mailto:info@pearsign.com" className="hover:text-white">Blog</a></li>
                <li><a href="mailto:info@pearsign.com" className="hover:text-white">Careers</a></li>
                <li><a href="mailto:info@pearsign.com" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/terms" className="hover:text-white">Terms of Service</a></li>
                <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="/privacy#cookies" className="hover:text-white">Cookie Policy</a></li>
                <li><a href="mailto:legal@pearsign.com" className="hover:text-white">DPA</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">© 2026 PearSign. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Smartphone className="w-5 h-5" />
              <span className="text-sm">Available on all devices</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
