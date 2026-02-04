import React from 'react';
import { Card } from "@/components/ui/card";
import { Package, Clock, DollarSign, TrendingUp } from "lucide-react";

export default function InventoryStats({ leads }) {
  const totalLeads = leads.length;
  
  const avgAge = leads.length > 0 
    ? Math.round(leads.reduce((sum, l) => sum + (l.age_in_days || 0), 0) / leads.length)
    : 0;

  const stats = [
    {
      label: "Available Leads",
      value: totalLeads.toLocaleString(),
      icon: Package,
      color: "bg-emerald-50 text-emerald-600",
      trend: "in Google Sheets"
    },
    {
      label: "Average Age",
      value: `${avgAge}d`,
      icon: Clock,
      color: "bg-blue-50 text-blue-600",
      trend: "across all leads"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {stats.map((stat, i) => (
        <Card key={i} className="p-5 rounded-2xl border-slate-200/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.trend}</p>
            </div>
            <div className={`h-11 w-11 rounded-xl ${stat.color} flex items-center justify-center`}>
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}