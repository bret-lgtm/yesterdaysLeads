import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { motion } from "framer-motion";
import { FileText, Download, Calendar, Search } from "lucide-react";

export default function OrdersList({ orders, customers }) {
  const [searchQuery, setSearchQuery] = useState('');

  const customerMap = {};
  customers.forEach(customer => {
    customerMap[customer.email] = customer;
  });

  const filteredOrders = orders.filter(order => {
    const customer = customerMap[order.customer_email];
    const customerName = customer?.full_name || '';
    const customerEmail = order.customer_email || '';
    
    const query = searchQuery.toLowerCase();
    return customerName.toLowerCase().includes(query) || 
           customerEmail.toLowerCase().includes(query);
  });
  const downloadCSV = async (order) => {
    let leadData = order.lead_data_snapshot;

    if (!leadData || leadData.length === 0) {
      if (!order.leads_purchased || order.leads_purchased.length === 0) {
        console.error('No lead IDs available for order:', order.id);
        return;
      }

      try {
        const response = await base44.functions.invoke('getLeadsFromSheetsForCSV', {
          lead_ids: order.leads_purchased
        });
        leadData = response.data.leads;

        if (!leadData || leadData.length === 0) {
          console.error('Failed to fetch lead data for order:', order.id);
          return;
        }
      } catch (error) {
        console.error('Error fetching lead data:', error);
        return;
      }
    }

    const leadsByType = {};
    leadData.forEach(lead => {
      const type = lead.lead_type || 'unknown';
      if (!leadsByType[type]) {
        leadsByType[type] = [];
      }
      leadsByType[type].push(lead);
    });

    Object.entries(leadsByType).forEach(([type, leads]) => {
      const allKeys = new Set();
      leads.forEach(lead => {
        Object.keys(lead).forEach(key => allKeys.add(key));
      });
      
      const headers = Array.from(allKeys).filter(key => 
        !['id', 'created_date', 'updated_date', 'created_by'].includes(key)
      );

      const rows = leads.map(lead => 
        headers.map(header => {
          const value = lead[header];
          if (value === null || value === undefined) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
      );

      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${type}-order-${order.id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder="Search by customer name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {filteredOrders.map((order, index) => (
        <motion.div
          key={order.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.02 }}
        >
          <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-slate-500">
                      #{order.id?.slice(0, 8)}
                    </span>
                    <Badge className={
                      order.status === 'completed' 
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }>
                      {order.status}
                    </Badge>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {customerMap[order.customer_email]?.full_name || 'Unknown Customer'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {order.customer_email}
                  </p>
                  <p className="text-sm text-slate-600">
                    {order.lead_count} Leads
                  </p>
                  <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(order.created_date), 'MMM d, yyyy • h:mm a')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 lg:text-right">
                <div>
                  <p className="text-2xl font-bold text-slate-900">
                    ${order.total_price?.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500">
                    ${(order.total_price / order.lead_count).toFixed(2)} per lead
                  </p>
                </div>
                <Button
                  onClick={() => downloadCSV(order)}
                  disabled={order.status !== 'completed'}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}