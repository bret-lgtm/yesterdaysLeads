import React from 'react';
import { Card } from "@/components/ui/card";
import { Package, Clock, DollarSign, TrendingUp } from "lucide-react";

export default function InventoryStats({ leads }) {
  const availableLeads = leads.filter(l => l.status === 'available').length;
  const soldLeads = leads.filter(l => l.status === 'sold').length;
  const totalLeads = leads.length;
  
  const avgAge = leads.length > 0 
    ? Math.round(leads.reduce((sum, l) => {
        let age = l.age_in_days || 1;
        
        // Calculate from external_id if available
        if (l.external_id && l.external_id.includes('-')) {
          const dateStr = l.external_id.split('-')[0];
          if (dateStr && dateStr.length === 8) {
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = parseInt(dateStr.substring(6, 8));
            const uploadDate = new Date(year, month, day);
            if (!isNaN(uploadDate.getTime())) {
              age = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
            }
          }
        }
        
        return sum + age;
      }, 0) / leads.length)
    : 0;

  const stats = [
    {
      label: "Available Leads",
      value: availableLeads.toLocaleString(),
      icon: Package,
      color: "bg-emerald-50 text-emerald-600",
      trend: "ready to sell"
    },
    {
      label: "Average Age",
      value: `${avgAge}d`,
      icon: Clock,
      color: "bg-blue-50 text-blue-600",
      trend: "across inventory"
    },
    {
      label: "Total Inventory",
      value: totalLeads.toLocaleString(),
      icon: TrendingUp,
      color: "bg-violet-50 text-violet-600",
      trend: "all leads"
    },
    {
      label: "Leads Sold",
      value: soldLeads.toLocaleString(),
      icon: DollarSign,
      color: "bg-amber-50 text-amber-600",
      trend: "completed sales"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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