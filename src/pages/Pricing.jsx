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
  health: "Health"
};

const leadTypeOrder = ['final_expense', 'life', 'veteran_life', 'retirement', 'home', 'auto', 'medicare', 'health'];

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
        grouped[tier.lead_type] = { tier1: null, tier2: null, tier3: null, tier4: null, tier5: null };
      }
      
      if (tier.age_range_min >= 1 && tier.age_range_max <= 3) {
        grouped[tier.lead_type].tier1 = tier.base_price;
      } else if (tier.age_range_min >= 4 && tier.age_range_max <= 14) {
        grouped[tier.lead_type].tier2 = tier.base_price;
      } else if (tier.age_range_min >= 15 && tier.age_range_max <= 30) {
        grouped[tier.lead_type].tier3 = tier.base_price;
      } else if (tier.age_range_min >= 31 && tier.age_range_max <= 90) {
        grouped[tier.lead_type].tier4 = tier.base_price;
      } else if (tier.age_range_min >= 91) {
        grouped[tier.lead_type].tier5 = tier.base_price;
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
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-slate-900">Price Per Lead by Type & Age</h2>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading pricing...</div>
            ) : leadTypesWithPricing.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold">Lead Type</TableHead>
                      <TableHead className="text-center font-semibold text-xs whitespace-nowrap">1-3 days</TableHead>
                      <TableHead className="text-center font-semibold text-xs whitespace-nowrap">4-14 days</TableHead>
                      <TableHead className="text-center font-semibold text-xs whitespace-nowrap">15-30 days</TableHead>
                      <TableHead className="text-center font-semibold text-xs whitespace-nowrap">31-90 days</TableHead>
                      <TableHead className="text-center font-semibold text-xs whitespace-nowrap">91+ days</TableHead>
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
                        <TableCell className="text-center">
                          {pricingByType[type].tier1 ? (
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=1-3`} className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                              ${pricingByType[type].tier1.toFixed(2)}
                            </Link>
                          ) : (
                            <span className="text-base font-semibold text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pricingByType[type].tier2 ? (
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=4-14`} className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                              ${pricingByType[type].tier2.toFixed(2)}
                            </Link>
                          ) : (
                            <span className="text-base font-semibold text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pricingByType[type].tier3 ? (
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=15-30`} className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                              ${pricingByType[type].tier3.toFixed(2)}
                            </Link>
                          ) : (
                            <span className="text-base font-semibold text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pricingByType[type].tier4 ? (
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=31-90`} className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition-colors">
                              ${pricingByType[type].tier4.toFixed(2)}
                            </Link>
                          ) : (
                            <span className="text-base font-semibold text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pricingByType[type].tier5 ? (
                            <Link to={createPageUrl('BrowseLeads') + `?lead_type=${type}&age_range=91%2B`} className="text-base font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                              ${pricingByType[type].tier5.toFixed(2)}
                            </Link>
                          ) : (
                            <span className="text-base font-semibold text-slate-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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