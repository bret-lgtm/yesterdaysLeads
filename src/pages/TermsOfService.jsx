import React from 'react';
import { Card } from "@/components/ui/card";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-slate-600">
            Last updated: February 5, 2026
          </p>
        </div>

        {/* Content */}
        <Card className="rounded-2xl border-slate-200/60 p-8 sm:p-12 shadow-sm">
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-700 leading-relaxed mb-6">
              Welcome to Yesterday's Leads. The terms "we," "us," and "our" refer to Yesterday's Leads. These Terms of Service ("Terms") govern your access to and use of Yesterday's Leads products and services (the "Services"), including our website, aged insurance lead data, marketing products, and related offerings. By purchasing or using our Services, you agree to be bound by these Terms. If you do not agree, you must not use the Services.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Eligibility & Accounts</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              You must be at least the age of majority in your jurisdiction to use the Services and must be legally authorized to sell, solicit, or market insurance products where applicable. You represent that all information you provide is accurate and complete. You are solely responsible for all activity conducted under your account.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Our Products (Aged Insurance Leads)</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Yesterday's Leads provides aged insurance marketing leads, which may include consumer information related to life insurance, health insurance, Medicare, final expense, property & casualty, and other insurance products.
            </p>
            <p className="text-slate-700 leading-relaxed mb-2">You acknowledge and agree that:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Leads are not exclusive and may have been previously sold, contacted, or marketed to by other agents or agencies.</li>
              <li>Leads may vary in age, responsiveness, accuracy, and intent.</li>
              <li>We make no guarantees regarding contact rates, conversion rates, appointment setting, policy placement, commissions, or revenue.</li>
              <li>Leads are provided "as is" and reflect consumer information available at the time of original collection.</li>
              <li>Yesterday's Leads does not act as an insurance agency, broker, or producer and does not sell insurance products.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Lead Freshness & Resale Disclosure</h2>
            <p className="text-slate-700 leading-relaxed mb-2">You expressly acknowledge and accept that:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Leads sold by Yesterday's Leads may be days, weeks, months, or older at the time of delivery.</li>
              <li>Leads may have been resold multiple times prior to your purchase.</li>
              <li>Consumers may no longer be actively shopping for insurance or may have already purchased coverage.</li>
              <li>Contact information may be outdated, incorrect, disconnected, or reassigned.</li>
              <li>These characteristics are inherent to aged leads and are not grounds for refunds, credits, or disputes, except as required by law.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Orders & Payments</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              By placing an order, you agree to pay all applicable fees associated with your purchase. All sales are final. No refunds, credits, or chargebacks will be issued based on lead performance, contact rates, age, resale status, or consumer response, except where required by law.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Compliance With Laws & Insurance Regulations</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              You expressly acknowledge and agree that you are solely responsible for compliance with all applicable laws, regulations, and industry standards, including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-4">
              <li>Telephone Consumer Protection Act (TCPA)</li>
              <li>Telemarketing Sales Rule (TSR)</li>
              <li>CAN-SPAM Act</li>
              <li>State insurance laws and regulations</li>
              <li>State "mini-TCPA" statutes</li>
              <li>Do-Not-Call registries</li>
              <li>Carrier, platform, and dialing system rules</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-2">
              <strong>Consent & Outreach:</strong> You are solely responsible for determining whether a lead may be legally contacted and for maintaining all required consents before calling, texting, emailing, or otherwise contacting any consumer.
            </p>
            <p className="text-slate-700 leading-relaxed mb-6">
              <strong>No Compliance Warranty:</strong> Yesterday's Leads makes no representation or warranty that any lead is compliant, contactable, or suitable for your intended marketing method or insurance product.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Prohibited Uses</h2>
            <p className="text-slate-700 leading-relaxed mb-2">You may not use the Services to:</p>
            <ul className="list-none text-slate-700 leading-relaxed space-y-2 mb-4">
              <li>(a) violate any federal, state, or local law or insurance regulation;</li>
              <li>(b) make misleading or deceptive insurance representations;</li>
              <li>(c) engage in harassment, coercion, or high-pressure sales tactics;</li>
              <li>(d) initiate robocalls, prerecorded messages, or mass texting without proper consent;</li>
              <li>(e) misrepresent your identity, licensing status, or carrier affiliation.</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-6">
              Violation may result in immediate termination without refund.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Disclaimer of Warranties</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              The Services are provided "as is" and "as available." Yesterday's Leads disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not warrant that leads will be reachable, responsive, or interested in insurance products.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Limitation of Liability</h2>
            <p className="text-slate-700 leading-relaxed mb-2">To the fullest extent permitted by law:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Yesterday's Leads' total liability for any claim shall not exceed the amount paid by you to Yesterday's Leads in the three (3) months preceding the event giving rise to the claim.</li>
              <li>We are not liable for indirect, incidental, statutory, punitive, or consequential damages, including TCPA penalties, regulatory fines, lost commissions, lost profits, or attorney fees.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Indemnification</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              You agree to indemnify, defend, and hold harmless Yesterday's Leads and its owners, officers, employees, contractors, and affiliates from any claims, damages, fines, penalties, investigations, or legal fees arising from:
            </p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Your use of the Services</li>
              <li>Your insurance marketing or sales activities</li>
              <li>Any alleged violation of TCPA, insurance laws, or consumer protection statutes</li>
              <li>Any consumer, carrier, or regulatory complaint related to your outreach</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. Arbitration & Class Action Waiver</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              All disputes shall be resolved by binding arbitration administered by the American Arbitration Association (AAA). You waive the right to a jury trial and agree that claims may only be brought individually, not as part of a class or representative action.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. Governing Law & Venue</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              These Terms are governed by the laws of the State of Missouri. Any arbitration or court proceeding shall occur exclusively in Greene County, Missouri.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Termination</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              We may suspend or terminate access to the Services at any time for violations of these Terms or applicable law. You remain responsible for all charges incurred prior to termination.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. Entire Agreement</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              These Terms, together with our Privacy Policy and any purchase agreements, constitute the entire agreement between you and Yesterday's Leads.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">14. Contact Information</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              <strong>Yesterday's Leads</strong><br />
              3253 E. Chestnut Expressway, Suite 321<br />
              Springfield, MO<br />
              Email: support@yesterdaysleads.com<br />
              Phone: 833-402-4368
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}