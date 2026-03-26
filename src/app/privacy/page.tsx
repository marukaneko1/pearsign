"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Eye, Database, Lock, Globe, UserCheck, Bell, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  const lastUpdated = "January 7, 2025";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/login" className="flex items-center gap-3">
              <img src="/pearsign-logo.png" alt="PearSign" className="w-10 h-10 rounded-xl" />
              <span className="font-bold text-xl text-gray-900 dark:text-white">PearSign</span>
            </Link>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full -translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            Your privacy is important to us. This policy explains how we collect, use, and protect your personal information.
          </p>
          <p className="text-blue-200 text-sm mt-4">Last updated: {lastUpdated}</p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-8 sm:p-12 prose prose-gray dark:prose-invert max-w-none">

            {/* Quick Overview */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8 not-prose">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-[#2464ea]" />
                Privacy at a Glance
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <Lock className="w-4 h-4 text-[#2464ea] mt-0.5 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Your documents are encrypted at rest and in transit</span>
                </div>
                <div className="flex items-start gap-3">
                  <Database className="w-4 h-4 text-[#2464ea] mt-0.5 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">We never sell your personal data to third parties</span>
                </div>
                <div className="flex items-start gap-3">
                  <UserCheck className="w-4 h-4 text-[#2464ea] mt-0.5 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">You control your data and can export or delete it</span>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="w-4 h-4 text-[#2464ea] mt-0.5 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">We comply with GDPR, CCPA, and other regulations</span>
                </div>
              </div>
            </div>

            {/* Table of Contents */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-8 not-prose">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Table of Contents</h3>
              <nav className="grid sm:grid-cols-2 gap-2 text-sm">
                {[
                  "1. Information We Collect",
                  "2. How We Use Your Information",
                  "3. Information Sharing",
                  "4. Data Security",
                  "5. Data Retention",
                  "6. Your Rights and Choices",
                  "7. Cookies and Tracking",
                  "8. International Transfers",
                  "9. Children's Privacy",
                  "10. Changes to This Policy",
                  "11. Contact Us",
                ].map((item) => (
                  <a
                    key={item}
                    href={`#section-${item.split(".")[0]}`}
                    className="text-[#2464ea] hover:text-blue-700 hover:underline"
                  >
                    {item}
                  </a>
                ))}
              </nav>
            </div>

            <section id="section-1">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>1</span>
                Information We Collect
              </h2>
              <p>
                We collect information you provide directly to us, as well as information collected automatically
                when you use our Service.
              </p>

              <h3>Information You Provide</h3>
              <ul>
                <li>
                  <strong>Account Information:</strong> When you create an account, we collect your name, email address,
                  password, and organization details.
                </li>
                <li>
                  <strong>Document Content:</strong> Documents you upload for signature, including any personal information
                  contained within those documents.
                </li>
                <li>
                  <strong>Signature Data:</strong> Electronic signatures you create, including signature images and
                  related metadata.
                </li>
                <li>
                  <strong>Payment Information:</strong> If you subscribe to a paid plan, we collect billing information
                  through our payment processor.
                </li>
                <li>
                  <strong>Communications:</strong> Information you provide when you contact us for support or feedback.
                </li>
              </ul>

              <h3>Information Collected Automatically</h3>
              <ul>
                <li>
                  <strong>Usage Data:</strong> Information about how you use the Service, including pages viewed,
                  features used, and actions taken.
                </li>
                <li>
                  <strong>Device Information:</strong> Information about your device, including browser type,
                  operating system, and IP address.
                </li>
                <li>
                  <strong>Audit Logs:</strong> Records of document-related activities for compliance and security purposes.
                </li>
              </ul>
            </section>

            <section id="section-2">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>2</span>
                How We Use Your Information
              </h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve the Service</li>
                <li>Process and complete electronic signature transactions</li>
                <li>Send you technical notices, updates, and administrative messages</li>
                <li>Respond to your comments, questions, and support requests</li>
                <li>Monitor and analyze usage patterns and trends</li>
                <li>Detect, investigate, and prevent fraudulent or unauthorized activities</li>
                <li>Comply with legal obligations and enforce our terms</li>
                <li>Personalize your experience and provide recommendations</li>
              </ul>
            </section>

            <section id="section-3">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>3</span>
                Information Sharing
              </h2>
              <p>
                We do not sell your personal information. We may share your information in the following circumstances:
              </p>
              <ul>
                <li>
                  <strong>With Your Consent:</strong> We may share information when you direct us to do so.
                </li>
                <li>
                  <strong>Document Signers:</strong> When you send a document for signature, we share relevant
                  information with the recipients.
                </li>
                <li>
                  <strong>Service Providers:</strong> We work with third-party service providers who assist in
                  operating our Service (e.g., hosting, payment processing, email delivery).
                </li>
                <li>
                  <strong>Legal Requirements:</strong> We may disclose information if required by law, regulation,
                  or legal process.
                </li>
                <li>
                  <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets,
                  your information may be transferred.
                </li>
              </ul>
            </section>

            <section id="section-4">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>4</span>
                Data Security
              </h2>
              <p>
                We implement comprehensive security measures to protect your information:
              </p>

              <div className="grid sm:grid-cols-2 gap-4 my-6 not-prose">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <Lock className="w-6 h-6 text-[#2464ea] mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Encryption</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    256-bit AES encryption for data at rest and TLS 1.3 for data in transit
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <Shield className="w-6 h-6 text-[#2464ea] mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Security Best Practices</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Regular security assessments verify our security controls
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <Database className="w-6 h-6 text-[#2464ea] mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Secure Infrastructure</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enterprise-grade cloud infrastructure with redundancy
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <UserCheck className="w-6 h-6 text-[#2464ea] mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Access Controls</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Role-based access and multi-factor authentication
                  </p>
                </div>
              </div>

              <p>
                While we implement these safeguards, no method of transmission over the Internet or electronic
                storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section id="section-5">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>5</span>
                Data Retention
              </h2>
              <p>
                We retain your information for as long as necessary to provide the Service and fulfill the
                purposes described in this policy. Specifically:
              </p>
              <ul>
                <li>
                  <strong>Account Data:</strong> Retained while your account is active and for a reasonable period
                  after closure.
                </li>
                <li>
                  <strong>Signed Documents:</strong> Retained according to your retention settings and applicable
                  legal requirements.
                </li>
                <li>
                  <strong>Audit Logs:</strong> Retained for a minimum of 7 years for compliance purposes.
                </li>
                <li>
                  <strong>Usage Data:</strong> Generally retained for up to 2 years for analytics purposes.
                </li>
              </ul>
            </section>

            <section id="section-6">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>6</span>
                Your Rights and Choices
              </h2>
              <p>
                Depending on your location, you may have the following rights regarding your personal information:
              </p>

              <div className="space-y-4 my-6 not-prose">
                <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Eye className="w-5 h-5 text-[#2464ea] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Right to Access</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Request a copy of the personal information we hold about you
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <UserCheck className="w-5 h-5 text-[#2464ea] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Right to Rectification</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Request correction of inaccurate or incomplete information
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Trash2 className="w-5 h-5 text-[#2464ea] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Right to Erasure</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Request deletion of your personal information, subject to legal obligations
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Database className="w-5 h-5 text-[#2464ea] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Right to Data Portability</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Receive your data in a structured, commonly used format
                    </p>
                  </div>
                </div>
              </div>

              <p>
                To exercise these rights, please contact us at{" "}
                <a href="mailto:info@pearsign.com" className="text-[#2464ea]">info@pearsign.com</a>.
                We will respond to your request within 30 days.
              </p>
            </section>

            <section id="section-7">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>7</span>
                Cookies and Tracking
              </h2>
              <p>
                We use cookies and similar tracking technologies to collect and track information and improve
                the Service. The types of cookies we use include:
              </p>
              <ul>
                <li>
                  <strong>Essential Cookies:</strong> Required for the Service to function properly. These cannot
                  be disabled.
                </li>
                <li>
                  <strong>Analytics Cookies:</strong> Help us understand how you use the Service so we can improve it.
                </li>
                <li>
                  <strong>Preference Cookies:</strong> Remember your settings and preferences for a better experience.
                </li>
              </ul>
              <p>
                You can control cookies through your browser settings. Note that disabling certain cookies may
                affect the functionality of the Service.
              </p>
            </section>

            <section id="section-8">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>8</span>
                International Transfers
              </h2>
              <p>
                Your information may be transferred to and processed in countries other than your country of
                residence. We take steps to ensure that your information receives adequate protection in
                accordance with this policy and applicable law.
              </p>
              <p>
                For transfers from the European Economic Area (EEA), we rely on:
              </p>
              <ul>
                <li>Standard Contractual Clauses approved by the European Commission</li>
                <li>Adequacy decisions where applicable</li>
                <li>Your explicit consent where appropriate</li>
              </ul>
            </section>

            <section id="section-9">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>9</span>
                Children's Privacy
              </h2>
              <p>
                The Service is not intended for use by children under the age of 18. We do not knowingly collect
                personal information from children under 18. If we become aware that we have collected personal
                information from a child under 18, we will take steps to delete such information.
              </p>
            </section>

            <section id="section-10">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>10</span>
                Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. When we make material changes, we will:
              </p>
              <ul>
                <li>Update the "Last updated" date at the top of this policy</li>
                <li>Notify you via email or through the Service</li>
                <li>Where required by law, obtain your consent before making changes</li>
              </ul>
              <p>
                We encourage you to review this policy periodically to stay informed about how we protect
                your information.
              </p>
            </section>

            <section id="section-11">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>11</span>
                Contact Us
              </h2>
              <p>
                If you have any questions about this Privacy Policy or our privacy practices, please contact us:
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 not-prose">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}>
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">PearSign Privacy Team</h4>
                    <p className="text-gray-600 dark:text-gray-300 mt-1">
                      Email: <a href="mailto:info@pearsign.com" className="text-[#2464ea] hover:underline">info@pearsign.com</a>
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      Data Protection Officer: <a href="mailto:info@pearsign.com" className="text-[#2464ea] hover:underline">info@pearsign.com</a>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg not-prose">
                <div className="flex gap-3">
                  <Bell className="w-5 h-5 text-[#2464ea] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                      For California Residents
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      If you are a California resident, you have additional rights under the California Consumer
                      Privacy Act (CCPA). Please see our{" "}
                      <a href="/privacy#california" className="text-[#2464ea] hover:underline">California Privacy Notice</a>{" "}
                      for more information.
                    </p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your privacy is our priority. We are committed to protecting your personal information.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link href="/terms" className="text-sm text-[#2464ea] hover:underline">
              Terms of Service
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/login" className="text-sm text-[#2464ea] hover:underline">
              Back to Login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
