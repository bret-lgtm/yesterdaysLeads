import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Calendar, Phone, Mail, DollarSign, ShoppingCart, Check } from "lucide-react";
import { motion } from "framer-motion";

const typeColors = {
  auto: "bg-blue-50 text-blue-700 border-blue-200",
  home: "bg-emerald-50 text-emerald-700 border-emerald-200",
  health: "bg-rose-50 text-rose-700 border-rose-200",
  life: "bg-violet-50 text-violet-700 border-violet-200",
  medicare: "bg-amber-50 text-amber-700 border-amber-200",
  final_expense: "bg-slate-100 text-slate-700 border-slate-200"
};

const typeLabels = {
  auto: "Auto",
  home: "Home",
  health: "Health",
  life: "Life",
  medicare: "Medicare",
  final_expense: "Final Expense"
};

export default function LeadCard({ lead, price, isSelected, onSelect, isInCart, onAddToCart }) {
  const ageInDays = Math.floor((new Date() - new Date(lead.upload_date)) / (1000 * 60 * 60 * 24));
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`p-5 rounded-2xl border transition-all duration-200 hover:shadow-md ${
        isSelected ? 'border-slate-900 bg-slate-50/50' : 'border-slate-200/60 bg-white'
      }`}>
        <div className="flex items-start gap-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(lead)}
            className="mt-1 h-5 w-5 rounded-md border-slate-300"
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <Badge className={`${typeColors[lead.lead_type]} border font-medium px-2.5 py-0.5`}>
                {typeLabels[lead.lead_type]}
              </Badge>
              <span className="text-xs text-slate-400 font-mono">#{lead.external_id}</span>
            </div>
            
            <h3 className="font-semibold text-slate-900 text-lg mb-2">
              {lead.first_name} {lead.last_name}
            </h3>
            
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {lead.state} {lead.zip_code}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {ageInDays} days old
              </div>
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {lead.phone}
                </div>
              )}
              {lead.utility_bill_amount && (
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  ${lead.utility_bill_amount}/mo
                </div>
              )}
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end gap-3">
            <div>
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
                  : 'bg-slate-900 hover:bg-slate-800'
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