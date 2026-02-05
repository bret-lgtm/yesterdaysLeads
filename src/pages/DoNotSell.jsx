import React from 'react';
import { Card } from "@/components/ui/card";
import { Mail } from 'lucide-react';

export default function DoNotSell() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Do Not Sell or Share My Personal Information
          </h1>
        </div>

        {/* Content */}
        <Card className="rounded-2xl border-slate-200/60 p-8 sm:p-12 shadow-sm">
          <div className="space-y-6">
            <p className="text-slate-700 leading-relaxed">
              Yesterday's Leads generates and distributes insurance marketing leads to licensed insurance agents and agencies.
            </p>

            <p className="text-slate-700 leading-relaxed">
              If you are a consumer and would like to opt out of the sale or sharing of your personal information, please submit your request by emailing{' '}
              <a href="mailto:support@yesterdaysleads.com" className="text-emerald-600 hover:text-emerald-700 font-medium underline">
                support@yesterdaysleads.com
              </a>
              {' '}with the subject line:
            </p>

            <div className="bg-slate-100 rounded-xl p-6 border-l-4 border-emerald-600">
              <p className="font-semibold text-slate-900">
                "Do Not Sell or Share My Personal Information."
              </p>
            </div>

            <p className="text-slate-700 leading-relaxed">
              Please include your full name, phone number, and email address so we can process your request accurately. We will respond in accordance with applicable privacy laws.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}