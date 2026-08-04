import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const typeLabels = {
  final_expense: "Final Expense",
  life: "Life",
  veteran_life: "Veteran Life",
  retirement: "Retirement",
  home: "Home",
  auto: "Auto",
  medicare: "Medicare",
  health: "Health",
  annuity: "Annuity",
  recruiting: "Recruiting"
};

const leadTypeOrder = ['final_expense', 'life', 'veteran_life', 'retirement', 'home', 'auto', 'medicare', 'health', 'annuity', 'recruiting'];

const tierColumns = [
  { key: 'tier1', label: '1-3 days', min: 1, max: 3, ageParam: 'yesterday' },
  { key: 'tier2', label: '4-14 days', min: 4, max: 14, ageParam: '4-14' },
  { key: 'tier3', label: '15-30 days', min: 15, max: 30, ageParam: '15-30' },
  { key: 'tier4', label: '31-90 days', min: 31, max: 90, ageParam: '31-90' },
  { key: 'tier5', label: '91-180 days', min: 91, max: 180, ageParam: '91-180' },
  { key: 'tier6', label: '181-365 days', min: 181, max: 365, ageParam: '181-365' },
  { key: 'tier7', label: '365+ days', min: 366, max: 36500, ageParam: '366%2B' },
];

export default function Pricing() {
  const { data: pricingTiers = [], isLoading } = useQuery({
    queryKey: ['pricingTiers'],
    queryFn: () => base44.entities.PricingTier.list()
  });

  // Group pricing tiers by lead type and age range
  const pricingByType = React.useMemo(() => {
    const grouped = {};

    pricingTiers.forEach(tier => {
      if (!grouped[tier.lead_type]) {
        grouped[tier.lead_type] = {};
      }

      for (const col of tierColumns) {
        if (tier.age_range_min >= col.min && tier.age_range_max <= col.max) {
          grouped[tier.lead_type][col.key] = tier.base_price;
          break;
        }
      }
    });

    return grouped;
  }, [pricingTiers]);

  const leadTypesWithPricing = leadTypeOrder.filter(type => pricingByType[type]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-slate-100 text-slate-700 border-slate-200 px-3 py-1">
            Phone Verified Leads
          </Badge>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Simple, Tiered Pricing
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Pay less for aged leads. The older the lead, the lower the price.
          </p>
        </div>

        {/* Pricing Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="rounded-2xl border-slate-200/60 overflow-hidden mb-12">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Price Per Lead by Type & Age</h2>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading pricing...</div>
            ) : leadTypesWithPricing.length > 0 ? (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold">Lead Type</TableHead>
                        {tierColumns.map(col => (
                          <TableHead key={col.key} className="text-center font-semibold text-xs whitespace-nowrap">
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leadTypesWithPricing.map((type) => (
                        <TableRow key={type} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="font-medium whitespace-nowrap">
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}`} className="text-slate-900 hover:text-emerald-600 transition-colors">
                              {typeLabels[type]}
                            </Link>
                          </TableCell>
                          {tierColumns.map(col => (
                            <TableCell key={col.key} className="text-center">
                              {pricingByType[type][col.key] != null ? (
                                <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=${col.ageParam}`} className="text-sm font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                                  ${pricingByType[type][col.key].toFixed(2)}
                                </Link>
                              ) : (
                                <span className="text-sm font-semibold text-slate-400">-</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {leadTypesWithPricing.map((type) => (
                    <div key={type} className="p-4">
                      <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}`} className="block mb-3">
                        <h3 className="text-lg font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                          {typeLabels[type]}
                        </h3>
                      </Link>
                      <div className="space-y-2">
                        {tierColumns.map(col => (
                          pricingByType[type][col.key] != null && (
                            <Link key={col.key} to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=${col.ageParam}`} className="flex justify-between items-center py-2 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors">
                              <span className="text-sm text-slate-600">{col.label}</span>
                              <span className="text-base font-semibold text-slate-900">${pricingByType[type][col.key].toFixed(2)}</span>
                            </Link>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-500">No pricing tiers configured yet.</div>
            )}
          </Card>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="rounded-2xl border-slate-200/60 p-8 mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-violet-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">What's Included</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                "Full contact information",
                "SMS-Verified Phone number",
                "Email",
                "City, State and ZIP code",
                "Lead type categorization",
                "Instant CSV download",
                "Automatic suppression list",
                "No duplicate purchases",
                "No monthly fees"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-slate-700">{feature}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Unknown Leads Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <Card className="rounded-2xl border-amber-200 bg-amber-50 p-8 mb-12">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Badge className="bg-amber-600 text-white border-0 px-2 py-0.5 text-xs">50% OFF</Badge>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-3">About Leads with Unknown States</h2>
                <p className="text-slate-700 leading-relaxed">
                  Leads with unknown City and State fields are the result of the prospect entering an incorrect or incomplete ZIP code, leaving the City and State fields blank. Due to the unconfirmed geographic information, we offer these leads at <span className="font-semibold text-amber-700">50% OFF</span> their standard price. The contact info is still verified—the price is just cut in half.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* CTA */}
        <div className="text-center">
          <Link to={createPageUrl('BrowseLeads')}>
            <Button size="lg" className="h-14 px-8 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-base shadow-lg shadow-emerald-500/30">
              Start Browsing Leads
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}