import React from 'react';
import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const ageRanges = [
  { min: 0, max: 7, label: '0-7 days', color: '#10b981' },
  { min: 8, max: 14, label: '8-14 days', color: '#3b82f6' },
  { min: 15, max: 30, label: '15-30 days', color: '#f59e0b' },
  { min: 31, max: 60, label: '31-60 days', color: '#f43f5e' },
  { min: 61, max: Infinity, label: '60+ days', color: '#64748b' }
];

export default function InventoryByAge({ leads }) {
  const data = ageRanges.map(range => {
    const count = leads.filter(lead => {
      const age = lead.age_in_days || 0;
      return age >= range.min && age <= range.max;
    }).length;
    return { name: range.label, value: count, color: range.color };
  }).filter(d => d.value > 0);

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <h3 className="font-semibold text-slate-900 mb-4">Inventory by Age</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(value) => <span className="text-slate-600 text-sm">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}