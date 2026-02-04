import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Calendar, Phone, Mail, DollarSign, ShoppingCart, Check, Info } from "lucide-react";
import { motion } from "framer-motion";

const typeColors = {
  auto: "bg-blue-50 text-blue-700 border-blue-200",
  home: "bg-emerald-50 text-emerald-700 border-emerald-200",
  health: "bg-rose-50 text-rose-700 border-rose-200",
  life: "bg-violet-50 text-violet-700 border-violet-200",
  medicare: "bg-amber-50 text-amber-700 border-amber-200",
  final_expense: "bg-cyan-50 text-cyan-700 border-cyan-200",
  veteran_life: "bg-orange-50 text-orange-700 border-orange-200",
  retirement: "bg-gray-100 text-red-600 border-gray-200"
};

const typeLabels = {
  auto: "Auto",
  home: "Home",
  health: "Health",
  life: "Life",
  medicare: "Medicare",
  final_expense: "Final Expense",
  veteran_life: "Veteran Life",
  retirement: "Retirement"
};

export default function LeadCard({ lead, price, isSelected, onSelect, isInCart, onAddToCart }) {
  let ageInDays = lead.age_in_days || 1;
  
  if (lead.external_id && lead.external_id.includes('-')) {
    const dateStr = lead.external_id.split('-')[0];
    if (dateStr && dateStr.length === 8) {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const uploadDate = new Date(year, month, day);
      if (!isNaN(uploadDate.getTime())) {
        ageInDays = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
      }
    }
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:shadow-md ${
        isSelected ? 'border-emerald-600 bg-emerald-50/30 shadow-md shadow-emerald-500/10' : 'border-slate-200/60 bg-white'
      }`}>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(lead)}
            className="mt-1 h-5 w-5 rounded-md border-slate-300 sm:order-1"
          />
          
          <div className="flex-1 min-w-0 w-full sm:order-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge className={`${typeColors[lead.lead_type]} border font-medium px-2.5 py-0.5`}>
                {typeLabels[lead.lead_type]}
              </Badge>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400 font-mono">#{lead.external_id}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Format: YYYYMMDD-TYPE-###</p>
                      <p className="text-xs text-slate-400 mt-1">Date uploaded - Lead type - Sequence</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            
            <h3 className="font-semibold text-slate-900 text-lg mb-3">
              {lead.first_name} {lead.last_name_initial}.
            </h3>
            
            <div className="flex flex-col gap-2 text-sm text-slate-600 mb-4 sm:mb-0">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {(String(lead.city || '').toLowerCase() === 'unknown' || String(lead.state || '').toLowerCase() === 'unknown') 
                  ? 'Unknown' 
                  : `${lead.state} ${lead.zip_code}`}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {ageInDays} days old
              </div>
              {lead.coverage_amount && !isNaN(parseFloat(lead.coverage_amount)) && (
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  ${parseFloat(lead.coverage_amount).toLocaleString()} coverage
                </div>
              )}
            </div>
          </div>
          
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 w-full sm:w-auto sm:order-3">
            <div className="sm:text-right">
              <span className="text-2xl font-bold text-slate-900">${price.toFixed(2)}</span>
              <span className="text-xs text-slate-400 block">per lead</span>
            </div>
            <Button
              size="sm"
              onClick={() => onAddToCart(lead, price)}
              disabled={isInCart}
              className={`rounded-xl ${
                isInCart 
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' 
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md shadow-emerald-500/20'
              }`}
            >
              {isInCart ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}