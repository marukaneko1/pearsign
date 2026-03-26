"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Scale, Shield, AlertTriangle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
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
            <Scale className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            Please read these terms carefully before using PearSign's electronic signature services.
          </p>
          <p className="text-blue-200 text-sm mt-4">Last updated: {lastUpdated}</p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-8 sm:p-12 prose prose-gray dark:prose-invert max-w-none">

            {/* Table of Contents */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-8 not-prose">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#2464ea]" />
                Table of Contents
              </h3>
              <nav className="grid sm:grid-cols-2 gap-2 text-sm">
                {[
                  "1. Acceptance of Terms",
                  "2. Description of Service",
                  "3. User Accounts",
                  "4. Electronic Signatures",
                  "5. Acceptable Use",
                  "6. Intellectual Property",
                  "7. Payment Terms",
                  "8. Limitation of Liability",
                  "9. Indemnification",
                  "10. Termination",
                  "11. Governing Law",
                  "12. Contact Information",
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
                Acceptance of Terms
              </h2>
              <p>
                By accessing or using PearSign's services ("Service"), you agree to be bound by these Terms of Service ("Terms").
                If you do not agree to these Terms, you may not access or use the Service.
              </p>
              <p>
                These Terms apply to all visitors, users, and others who access or use the Service. By using the Service,
                you represent that you are at least 18 years of age and have the legal capacity to enter into a binding agreement.
              </p>
            </section>

            <section id="section-2">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>2</span>
                Description of Service
              </h2>
              <p>
                PearSign provides an electronic signature platform that enables users to:
              </p>
              <ul>
                <li>Send documents for electronic signature</li>
                <li>Sign documents electronically</li>
                <li>Create and manage document templates</li>
                <li>Track document status and manage workflows</li>
                <li>Store and retrieve signed documents</li>
                <li>Integrate with third-party applications via APIs</li>
              </ul>
              <p>
                We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time,
                with or without notice. We will not be liable to you or any third party for any modification,
                suspension, or discontinuation of the Service.
              </p>
            </section>

            <section id="section-3">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>3</span>
                User Accounts
              </h2>
              <p>
                To use certain features of the Service, you must register for an account. When you register, you agree to:
              </p>
              <ul>
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Keep your password secure and confidential</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
              <p>
                We reserve the right to suspend or terminate your account if any information provided is inaccurate,
                false, or no longer current, or if you violate these Terms.
              </p>
            </section>

            <section id="section-4">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>4</span>
                Electronic Signatures
              </h2>
              <p>
                By using the Service, you acknowledge and agree that:
              </p>
              <ul>
                <li>
                  <strong>Legal Validity:</strong> Electronic signatures created through PearSign are legally binding
                  and enforceable in accordance with applicable electronic signature laws, including the U.S. Electronic
                  Signatures in Global and National Commerce Act (ESIGN), the Uniform Electronic Transactions Act (UETA),
                  and eIDAS Regulation in the European Union.
                </li>
                <li>
                  <strong>Consent:</strong> You consent to conducting transactions electronically and to receiving
                  electronic records related to such transactions.
                </li>
                <li>
                  <strong>Authentication:</strong> You are responsible for verifying the identity of signers and
                  ensuring appropriate authentication measures are in place.
                </li>
                <li>
                  <strong>Document Integrity:</strong> We maintain audit trails and security measures to ensure
                  document integrity, but you are responsible for reviewing documents before signing.
                </li>
              </ul>
            </section>

            <section id="section-5">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>5</span>
                Acceptable Use
              </h2>
              <p>
                You agree not to use the Service to:
              </p>
              <ul>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on the rights of others, including intellectual property rights</li>
                <li>Transmit any malicious code, viruses, or harmful content</li>
                <li>Engage in fraudulent activities or misrepresentation</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with the proper functioning of the Service</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
              </ul>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 my-4 not-prose">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Violation of these terms may result in immediate termination of your account and may
                    subject you to civil and criminal liability.
                  </p>
                </div>
              </div>
            </section>

            <section id="section-6">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>6</span>
                Intellectual Property
              </h2>
              <p>
                The Service and its original content, features, and functionality are owned by PearSign and are
                protected by international copyright, trademark, patent, trade secret, and other intellectual
                property laws.
              </p>
              <p>
                You retain ownership of any documents you upload to the Service. By uploading content, you grant
                PearSign a limited license to store, process, and transmit such content solely for the purpose
                of providing the Service.
              </p>
            </section>

            <section id="section-7">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>7</span>
                Payment Terms
              </h2>
              <p>
                Certain features of the Service require payment of fees. By subscribing to a paid plan, you agree to:
              </p>
              <ul>
                <li>Pay all applicable fees as described in your selected plan</li>
                <li>Provide accurate billing information</li>
                <li>Authorize us to charge your payment method on a recurring basis</li>
                <li>Accept that fees are non-refundable except as required by law</li>
              </ul>
              <p>
                We reserve the right to change our pricing at any time. Any price changes will be communicated
                to you in advance and will take effect at the start of your next billing cycle.
              </p>
            </section>

            <section id="section-8">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>8</span>
                Limitation of Liability
              </h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PEARSIGN SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA,
                USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
              <p>
                Our total liability for any claims arising from or related to the Service shall not exceed the
                amount you paid to us in the twelve (12) months preceding the claim.
              </p>
            </section>

            <section id="section-9">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>9</span>
                Indemnification
              </h2>
              <p>
                You agree to indemnify, defend, and hold harmless PearSign and its officers, directors, employees,
                agents, and affiliates from and against any claims, liabilities, damages, losses, and expenses,
                including reasonable attorneys' fees, arising out of or in any way connected with:
              </p>
              <ul>
                <li>Your access to or use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
                <li>Any content you upload or transmit through the Service</li>
              </ul>
            </section>

            <section id="section-10">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>10</span>
                Termination
              </h2>
              <p>
                We may terminate or suspend your account and access to the Service immediately, without prior
                notice or liability, for any reason, including if you breach these Terms.
              </p>
              <p>
                Upon termination, your right to use the Service will cease immediately. You may export your
                data before termination. We will retain and may use your information as necessary to comply
                with legal obligations, resolve disputes, and enforce our agreements.
              </p>
            </section>

            <section id="section-11">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>11</span>
                Governing Law
              </h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the State of Delaware,
                United States, without regard to its conflict of law provisions.
              </p>
              <p>
                Any disputes arising from or relating to these Terms or the Service shall be resolved through
                binding arbitration in accordance with the rules of the American Arbitration Association.
              </p>
            </section>

            <section id="section-12">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white" style={{ background: '#2464ea' }}>12</span>
                Contact Information
              </h2>
              <p>
                If you have any questions about these Terms, please contact us:
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 not-prose">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #2464ea 0%, #1e40af 100%)' }}>
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">PearSign Legal</h4>
                    <p className="text-gray-600 dark:text-gray-300 mt-1">
                      Email: <a href="mailto:info@pearsign.com" className="text-[#2464ea] hover:underline">info@pearsign.com</a>
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      Support: <a href="mailto:info@pearsign.com" className="text-[#2464ea] hover:underline">info@pearsign.com</a>
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
            By using PearSign, you acknowledge that you have read and understood these Terms of Service.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link href="/privacy" className="text-sm text-[#2464ea] hover:underline">
              Privacy Policy
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
