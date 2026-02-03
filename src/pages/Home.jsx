import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  ArrowRight, 
  Shield, 
  Zap, 
  Target,
  TrendingDown,
  Phone,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Users
} from "lucide-react";

const features = [
  {
    icon: Phone,
    title: "Phone Verified",
    description: "Never get a bad phone number. All of our leads are required to verify their phone via SMS before becoming a lead."
  },
  {
    icon: TrendingDown,
    title: "Aged Lead Pricing",
    description: "Get premium leads at a fraction of the cost. Our tiered pricing ensures you pay less for older leads."
  },
  {
    icon: Target,
    title: "Targeted Filters",
    description: "Filter by state, ZIP code, lead type, and age to find exactly what your business needs."
  },
  {
    icon: Shield,
    title: "Suppression Lists",
    description: "Never see the same lead twice. Your purchases are automatically added to your suppression list."
  },
  {
    icon: Zap,
    title: "Instant Delivery",
    description: "Download your leads immediately after purchase in CSV format, ready for your CRM."
  },
  {
    icon: FileCheck,
    title: "Quality Verified",
    description: "All leads are validated and deduplicated before being added to our inventory."
  }
];

const leadTypes = [
  { name: "Final Expense", value: "final_expense", color: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200" },
  { name: "Life", value: "life", color: "bg-violet-100 text-violet-700 hover:bg-violet-200" },
  { name: "Veteran Life", value: "veteran_life", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
  { name: "Retirement", value: "retirement", color: "bg-gray-100 text-red-600 hover:bg-gray-200" },
  { name: "Home", value: "home", color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
  { name: "Auto", value: "auto", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  { name: "Medicare", value: "medicare", color: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  { name: "Health", value: "health", color: "bg-rose-100 text-rose-700 hover:bg-rose-200" }
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-white to-white" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <Badge className="mb-6 bg-slate-100 text-slate-700 border-slate-200 px-4 py-1.5 text-sm pointer-events-none">
              Premium Aged Insurance Leads
            </Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Quality, Phone Verified Leads at
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-emerald-400">
                Unbeatable Prices
              </span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              Access our extensive database of aged insurance leads. 
              Filter by type, location, and age to find the perfect prospects for your business.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={createPageUrl('BrowseLeads')}>
                <Button size="lg" className="h-14 px-8 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-base shadow-lg shadow-emerald-500/30">
                  Browse Leads
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to={createPageUrl('Pricing')}>
                <Button size="lg" variant="outline" className="h-14 px-8 rounded-xl border-slate-200 text-base">
                  View Pricing
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Lead Type Pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-wrap justify-center gap-2 mt-12"
          >
            {leadTypes.map((type, i) => (
              <Link key={i} to={createPageUrl('BrowseLeads') + `?lead_type=${type.value}`}>
                <Badge className={`${type.color} border-0 px-4 py-2 text-sm font-medium cursor-pointer transition-colors`}>
                  {type.name}
                </Badge>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* The Aged Lead Antidote Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">The Aged Lead Antidote</h2>
          </div>

          {/* The Problem */}
          <Card className="p-8 rounded-2xl border-red-200 bg-red-50/50 mb-8">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">The Problem</h3>
                <p className="text-slate-700 leading-relaxed">
                  Most vendors sell "recycled garbage"—data sold 10+ times, harvested from junk surveys, and riddled with disconnected numbers.
                </p>
              </div>
            </div>
          </Card>

          {/* Our Solution */}
          <Card className="p-8 rounded-2xl border-emerald-200 bg-emerald-50/50 mb-12">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Our Solution</h3>
                <p className="text-slate-700 leading-relaxed">
                  Yesterday's Leads provides high-intent, phone-verified data without the industry fluff.
                </p>
              </div>
            </div>
          </Card>

          {/* The 4 Pillars */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-slate-900 text-center mb-8">The Yesterday's Leads Difference</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900">Capped Distribution</h4>
                </div>
                <p className="text-slate-600">
                  We stop the "Infinite Resale." Unlike competitors who sell leads into oblivion, we strictly limit distribution to protect your ROI.
                </p>
              </Card>

              <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-violet-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900">Audit-Ready Compliance</h4>
                </div>
                <p className="text-slate-600">
                  No more TCPA nightmares. Every lead is 100% compliant, allowing you to dial with confidence.
                </p>
              </Card>

              <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900">Phone-Verified Connectivity</h4>
                </div>
                <p className="text-slate-600">
                  We scrub and verify every number. Stop wasting hours on "disconnected" tones and start talking to live prospects.
                </p>
              </Card>

              <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-amber-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900">Organic Intent Only</h4>
                </div>
                <p className="text-slate-600">
                  We banish "Garbage Data." No co-reg traps or "free gift card" click-bait—just real people who actually requested a quote.
                </p>
              </Card>
            </div>
          </div>

          {/* Bottom Line CTA */}
          <div className="text-center">
            <p className="text-xl font-bold text-slate-900 mb-6">
              The Bottom Line: Quality, Phone-Verified Leads at Unbeatable Prices.
            </p>
            <Link to={createPageUrl('BrowseLeads')}>
              <Button size="lg" className="h-14 px-8 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-base shadow-lg shadow-emerald-500/30">
                Browse Leads Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Why Choose Our Platform?</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Built specifically for insurance agents who need quality leads without breaking the bank
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              viewport={{ once: true }}
            >
              <Card className="p-6 rounded-2xl border-slate-200/60 h-full hover:shadow-lg transition-shadow">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-emerald-700" />
                </div>
                <h3 className="font-semibold text-slate-900 text-lg mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <Card className="p-12 rounded-3xl bg-gradient-to-br from-emerald-700 to-emerald-800 text-center shadow-xl">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Grow Your Business?</h2>
          <p className="text-emerald-50 max-w-xl mx-auto mb-8">
            Start browsing our lead inventory today. No minimum purchases, no contracts.
          </p>
          <Link to={createPageUrl('BrowseLeads')}>
            <Button size="lg" className="h-14 px-8 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-base shadow-lg shadow-amber-500/30">
              Get Started Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </Card>
      </section>
    </div>
  );
}