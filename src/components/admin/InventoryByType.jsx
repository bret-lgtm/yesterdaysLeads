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
  retirement: "Retirement"
};

const colors = ['#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#64748b'];

export default function InventoryByType({ leads }) {
  const byType = leads.reduce((acc, lead) => {
    acc[lead.lead_type] = (acc[lead.lead_type] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(byType).map(([type, count]) => ({
    type: typeLabels[type] || type,
    count
  })).sort((a, b) => b.count - a.count);

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <h3 className="font-semibold text-slate-900 mb-4">Inventory by Type</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis dataKey="type" type="category" tick={{ fill: '#64748b', fontSize: 12 }} width={70} />
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
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}