import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CheckCircle, Download, Loader2 } from "lucide-react";

export default function CheckoutSuccess() {
  const [orderReady, setOrderReady] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['recentOrders', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const allOrders = await base44.entities.Order.filter({ customer_email: user.email });
      return allOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!user?.email
  });

  const latestOrder = orders[0];

  useEffect(() => {
    if (latestOrder) {
      setOrderReady(true);
      return;
    }

    // Poll for order creation (webhook might take a moment)
    const interval = setInterval(() => {
      refetch();
    }, 2000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setOrderReady(true);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [latestOrder, refetch]);

  const downloadCSV = () => {
    if (!latestOrder?.lead_data_snapshot) return;

    const headers = ['External ID', 'First Name', 'Last Name', 'Phone', 'Email', 'State', 'ZIP', 'Type', 'Utility Bill'];
    const rows = latestOrder.lead_data_snapshot.map(l => [
      l.external_id,
      l.first_name,
      l.last_name,
      l.phone || '',
      l.email || '',
      l.state,
      l.zip_code || '',
      l.lead_type,
      l.utility_bill_amount || ''
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-order-${latestOrder.id}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!orderReady || !latestOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 rounded-3xl border-slate-200/60 text-center max-w-md">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Processing your order...</h2>
          <p className="text-slate-500">Please wait while we prepare your leads</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <Card className="p-8 rounded-3xl border-slate-200/60 text-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
          <p className="text-slate-500 mb-6">
            Your {latestOrder.lead_count} leads are ready for download
          </p>

          <div className="bg-slate-50 rounded-2xl p-4 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-500">Order ID</span>
              <span className="font-mono text-slate-700">{latestOrder.id.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Paid</span>
              <span className="font-semibold text-slate-900">${latestOrder.total_price.toFixed(2)}</span>
            </div>
          </div>

          <Button
            onClick={downloadCSV}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 mb-3 shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Leads CSV
          </Button>

          <Link to={createPageUrl('BrowseLeads')}>
            <Button variant="outline" className="w-full h-12 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              Continue Browsing
            </Button>
          </Link>
        </Card>
      </motion.div>
    </div>
  );
}