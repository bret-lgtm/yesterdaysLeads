import React from 'react';
import { Card } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-slate-600">
            Last updated: February 5, 2026
          </p>
        </div>

        {/* Content */}
        <Card className="rounded-2xl border-slate-200/60 p-8 sm:p-12 shadow-sm">
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-700 leading-relaxed mb-6">
              Yesterday's Leads ("Yesterday's Leads," "we," "us," or "our") operates this website and related Services to provide insurance agents and agencies with aged, non-exclusive insurance lead data and related products. This Privacy Policy explains how we collect, use, disclose, and protect personal information when you visit our website, make a purchase, submit information, or otherwise interact with our Services.
            </p>
            <p className="text-slate-700 leading-relaxed mb-6">
              By accessing or using our Services, you agree to this Privacy Policy. If you do not agree, you should not use the Services.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              We may collect the following categories of personal information depending on your interaction with our Services:
            </p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li><strong>Contact Information:</strong> Name, mailing address, email address, phone number.</li>
              <li><strong>Financial Information:</strong> Payment card details, billing address, and transaction records (processed through third-party payment processors).</li>
              <li><strong>Account Information:</strong> Login credentials, preferences, and account-related settings.</li>
              <li><strong>Lead Data (Consumer Information):</strong> Information submitted by consumers when requesting insurance information or offers, which may include age range, ZIP code or state, insurance interests (e.g., life, health, Medicare, final expense, P&C), and contact details.</li>
              <li><strong>Transaction & Order History:</strong> Records of products purchased, delivery history, and customer service communications.</li>
              <li><strong>Device & Usage Data:</strong> IP address, browser type, device identifiers, cookies, and activity on our website.</li>
              <li><strong>Communications:</strong> Information you provide when contacting support or otherwise communicating with us.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Sources of Information</h2>
            <p className="text-slate-700 leading-relaxed mb-2">We collect personal information from the following sources:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Directly from you, when you create an account, place an order, or contact us;</li>
              <li>Automatically, through cookies, analytics tools, and similar technologies;</li>
              <li>From third-party partners, affiliates, and vendors involved in lead sourcing, verification, payment processing, analytics, or technical services.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. How We Use Personal Information</h2>
            <p className="text-slate-700 leading-relaxed mb-2">We use personal information for the following purposes:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li><strong>Service Delivery:</strong> To process orders, deliver purchased lead data, provide customer support, and manage accounts.</li>
              <li><strong>Insurance Lead Generation & Distribution:</strong> If you submit information as a consumer, your data may be verified, categorized, and delivered to one or more licensed insurance agents or agencies who may contact you regarding insurance products or services.</li>
              <li><strong>Marketing & Communications:</strong> To send business-related communications, service updates, and promotional information. You may opt out of marketing communications at any time.</li>
              <li><strong>Security & Fraud Prevention:</strong> To protect accounts, prevent unauthorized activity, and secure our Services.</li>
              <li><strong>Legal & Regulatory Compliance:</strong> To enforce our Terms, comply with legal obligations, and respond to lawful requests.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. How We Disclose Personal Information</h2>
            <p className="text-slate-700 leading-relaxed mb-2">We may disclose personal information in the following circumstances:</p>
            
            <p className="text-slate-700 leading-relaxed mb-2 mt-4">
              <strong>With Insurance Agents & Agencies:</strong><br />
              If you submit information as a consumer lead, your information may be sold, licensed, or otherwise shared with one or more licensed insurance agents or agencies for marketing and sales purposes. Leads are non-exclusive and may be resold.
            </p>

            <p className="text-slate-700 leading-relaxed mb-2 mt-4">
              <strong>With Service Providers:</strong><br />
              We share information with vendors that perform services on our behalf, such as payment processing, analytics, hosting, customer support, and security services.
            </p>

            <p className="text-slate-700 leading-relaxed mb-2 mt-4">
              <strong>With Marketing & Advertising Partners:</strong><br />
              To deliver relevant advertising or evaluate campaign performance, subject to applicable law.
            </p>

            <p className="text-slate-700 leading-relaxed mb-2 mt-4">
              <strong>For Legal or Safety Reasons:</strong><br />
              To comply with legal obligations, respond to subpoenas or regulatory requests, protect our rights, or prevent fraud or harm.
            </p>

            <p className="text-slate-700 leading-relaxed mb-2 mt-4">
              <strong>Business Transfers:</strong><br />
              If Yesterday's Leads is involved in a merger, acquisition, sale of assets, or similar transaction, personal information may be transferred as part of that transaction.
            </p>

            <p className="text-slate-700 leading-relaxed mb-6 mt-4">
              We do not knowingly collect or sell personal information from individuals under the age of 16.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Aged & Resold Lead Disclosure</h2>
            <p className="text-slate-700 leading-relaxed mb-2">You acknowledge that:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-6">
              <li>Consumer lead data may be aged and not recent at the time of delivery.</li>
              <li>Consumer information may be resold or shared with multiple buyers.</li>
              <li>Consumers may have been previously contacted or may no longer be actively shopping for insurance.</li>
              <li>Contact information may be outdated, reassigned, or inaccurate.</li>
              <li>These characteristics are inherent to aged lead data and are disclosed prior to purchase.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Your Privacy Rights</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              Depending on your jurisdiction (including California, Colorado, Virginia, Connecticut, Utah, and the European Economic Area), you may have the right to:
            </p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-4">
              <li>Access the personal information we hold about you;</li>
              <li>Request correction or deletion of your personal information;</li>
              <li>Request a copy of your data (data portability);</li>
              <li>Opt out of the sale or sharing of personal information for targeted advertising;</li>
              <li>Limit or withdraw consent where applicable;</li>
              <li>Manage communication preferences.</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-6">
              Requests may be submitted to support@yesterdaysleads.com.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Do Not Sell or Share My Personal Information</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Yesterday's Leads operates in the business of insurance lead generation and distribution.
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              If you are a consumer and wish to opt out of the sale or sharing of your personal information, you may submit a request by emailing support@yesterdaysleads.com with the subject line: "Do Not Sell or Share My Personal Information."
            </p>
            <p className="text-slate-700 leading-relaxed mb-6">
              We will process requests in accordance with applicable law.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Data Retention</h2>
            <p className="text-slate-700 leading-relaxed mb-2">We retain personal information only for as long as necessary to:</p>
            <ul className="list-disc pl-6 text-slate-700 leading-relaxed space-y-2 mb-4">
              <li>Deliver and support our Services;</li>
              <li>Comply with legal, regulatory, and accounting obligations;</li>
              <li>Resolve disputes and enforce agreements.</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mb-6">
              Data is securely deleted, anonymized, or archived when no longer required.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Security of Information</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              We implement reasonable administrative, technical, and physical safeguards designed to protect personal information. However, no system is completely secure, and we cannot guarantee absolute security.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. Children's Privacy</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              Our Services are not directed to children, and we do not knowingly collect personal information from individuals under the age of majority in their jurisdiction. If you believe a minor's information has been collected, please contact us for removal.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. International Transfers</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              Your information may be processed or stored outside your state or country, including in the United States, through our service providers and technology platforms. We take steps to ensure appropriate safeguards are in place where required by law.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-slate-700 leading-relaxed mb-6">
              We may update this Privacy Policy periodically. Any changes will be reflected by updating the "Last updated" date. Material changes will be communicated as required by law.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. Contact Information</h2>
            <p className="text-slate-700 leading-relaxed mb-2">
              For questions about this Privacy Policy or to exercise your privacy rights, contact:
            </p>
            <p className="text-slate-700 leading-relaxed mb-2">
              <strong>Yesterday's Leads</strong><br />
              3253 E. Chestnut Expressway, Suite 321<br />
              Springfield, MO 65802<br />
              Email: support@yesterdaysleads.com<br />
              Phone: 833-402-4368
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}