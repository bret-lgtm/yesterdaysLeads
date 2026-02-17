import React from 'react';
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const typeLabels = {
  auto: "Auto",
  home: "Home",
  health: "Health",
  life: "Life",
  medicare: "Medicare",
  final_expense: "Final Exp.",
  veteran_life: "Vet Life",
  retirement: "Retirement",
  annuity: "Annuity",
  recruiting: "Recruiting",
  unknown: "Unknown"
};

const typeColors = {
  auto: "#3b82f6",
  home: "#10b981",
  health: "#f43f5e",
  life: "#8b5cf6",
  medicare: "#f59e0b",
  final_expense: "#06b6d4",
  veteran_life: "#f97316",
  retirement: "#ef4444",
  annuity: "#a855f7",
  recruiting: "#22d3ee",
  unknown: "#94a3b8"
};

export default function SoldByType({ orders }) {
  console.log('Orders received:', orders.length);
  
  const soldByType = orders.reduce((acc, order) => {
    let counted = false;
    
    // First try: use lead_data_snapshot
    if (order.lead_data_snapshot && Array.isArray(order.lead_data_snapshot)) {
      console.log(`Order ${order.id}: Found ${order.lead_data_snapshot.length} leads in snapshot`);
      order.lead_data_snapshot.forEach(lead => {
        const leadType = lead.lead_type || lead.leadType || lead.type;
        if (leadType) {
          acc[leadType] = (acc[leadType] || 0) + 1;
          counted = true;
        }
      });
    }
    
    // Second try: parse from leads_purchased IDs
    if (!counted && order.leads_purchased && Array.isArray(order.leads_purchased)) {
      console.log(`Order ${order.id}: Parsing ${order.leads_purchased.length} lead IDs`);
      order.leads_purchased.forEach(leadId => {
        const parts = String(leadId).split('_');
        if (parts.length >= 2) {
          const leadType = parts.slice(0, -1).join('_');
          if (leadType) {
            acc[leadType] = (acc[leadType] || 0) + 1;
            counted = true;
          }
        }
      });
    }
    
    // Final fallback: count as "unknown" if we have lead_count but couldn't parse type
    if (!counted && order.lead_count > 0) {
      console.log(`Order ${order.id}: Could not determine type for ${order.lead_count} leads`);
      acc['unknown'] = (acc['unknown'] || 0) + order.lead_count;
    }
    
    return acc;
  }, {});
  
  console.log('Final soldByType:', soldByType);

  // Initialize all lead types with 0
  const allTypes = ['auto', 'home', 'health', 'life', 'medicare', 'final_expense', 'veteran_life', 'retirement', 'annuity', 'recruiting'];
  allTypes.forEach(type => {
    if (!soldByType[type]) {
      soldByType[type] = 0;
    }
  });

  const data = Object.entries(soldByType).map(([type, count]) => ({
    type: typeLabels[type] || type,
    rawType: type,
    count
  }));

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <h3 className="font-semibold text-slate-900 mb-4">Sold by Type</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis 
              dataKey="type" 
              type="category" 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              width={90}
              interval={0}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={typeColors[entry.rawType] || '#64748b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}