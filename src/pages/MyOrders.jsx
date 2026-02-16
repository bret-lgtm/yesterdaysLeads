import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from 'date-fns';
import { motion } from "framer-motion";
import { 
  Package, 
  Download, 
  Calendar, 
  FileText,
  ArrowRight
} from "lucide-react";

export default function MyOrders() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Order.filter({ customer_email: user.email }, '-created_date');
    },
    enabled: !!user?.email
  });

  const downloadCSV = (order) => {
    if (!order.lead_data_snapshot || order.lead_data_snapshot.length === 0) {
      console.error('No lead data available for order:', order.id);
      return;
    }

    // Group leads by type
    const leadsByType = {};
    order.lead_data_snapshot.forEach(lead => {
      const type = lead.lead_type || 'unknown';
      if (!leadsByType[type]) {
        leadsByType[type] = [];
      }
      leadsByType[type].push(lead);
    });

    // Generate and download a CSV for each lead type
    Object.entries(leadsByType).forEach(([type, leads]) => {
      // Get all unique keys from all leads of this type
      const allKeys = new Set();
      leads.forEach(lead => {
        Object.keys(lead).forEach(key => allKeys.add(key));
      });
      
      // Exclude internal fields and convert to array
      const headers = Array.from(allKeys).filter(key => 
        !['id', 'created_date', 'updated_date', 'created_by'].includes(key)
      );

      // Generate rows with all fields
      const rows = leads.map(lead => 
        headers.map(header => {
          const value = lead[header];
          // Escape commas and quotes in CSV
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">My Orders</h1>
          <p className="text-slate-500">View and download your purchased leads</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <Card className="p-12 rounded-2xl border-slate-200/60 text-center">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No orders yet</h3>
            <p className="text-slate-500 mb-6">Start browsing our lead inventory to make your first purchase</p>
            <Link to={createPageUrl('BrowseLeads')}>
              <Button className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/20">
                Browse Leads
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="p-6 rounded-2xl border-slate-200/60 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                        <p className="font-semibold text-slate-900 text-lg">
                          {order.lead_count} Leads
                        </p>
                        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(new Date(order.created_date), 'MMM d, yyyy • h:mm a')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:text-right">
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
                        disabled={!order.lead_data_snapshot || order.lead_data_snapshot.length === 0 || order.status !== 'completed'}
                        className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
        )}
      </div>
    </div>
  );
}