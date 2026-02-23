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
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['recentOrders', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const allOrders = await base44.entities.Order.filter({ customer_email: user.email });
      return allOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!user?.email,
    retry: 3,
    retryDelay: 1000
  });

  const latestOrder = orders[0];

  const [pixelFired, setPixelFired] = useState(false);

  useEffect(() => {
    if (latestOrder && !pixelFired) {
      setOrderReady(true);
      if (window.fbq) {
        fbq('track', 'Purchase', {
          value: latestOrder.total_price,
          currency: 'USD',
          num_items: latestOrder.lead_count,
          order_id: latestOrder.id
        });
      }
      setPixelFired(true);
      return;
    }
    if (latestOrder) {
      setOrderReady(true);
      return;
    }

    if (!user?.email) {
      return;
    }

    // Poll for order creation (webhook might take a moment)
    const interval = setInterval(() => {
      refetch();
    }, 2000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setOrderReady(true);
    }, 30000); // Increased to 30 seconds

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [latestOrder, refetch, user]);

  const [downloading, setDownloading] = useState(false);

  const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'];

  const isSnapshotComplete = (snapshot) => {
    if (!snapshot || snapshot.length === 0) return false;
    const first = snapshot[0];
    // Must have real lead fields, not just system/cart fields
    return !!(first.first_name || first.email || first.phone);
  };

  const generateAndDownloadCSVs = (leadData, orderId) => {
    const leadsByType = {};
    leadData.forEach(lead => {
      const type = lead.lead_type || 'unknown';
      if (!leadsByType[type]) leadsByType[type] = [];
      leadsByType[type].push(lead);
    });

    Object.entries(leadsByType).forEach(([type, leads], index) => {
      setTimeout(() => {
        const allKeys = new Set();
        leads.forEach(lead => Object.keys(lead).forEach(key => allKeys.add(key)));
        const headers = Array.from(allKeys).filter(key => !SYSTEM_FIELDS.includes(key));

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
        a.download = `leads-${type}-order-${orderId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      }, index * 800);
    });
  };

  const downloadCSV = async () => {
    if (!latestOrder) return;
    setDownloading(true);

    let leadData = latestOrder.lead_data_snapshot;

    // If snapshot is missing or incomplete, fetch fresh from sheets
    if (!isSnapshotComplete(leadData)) {
      const leadIds = latestOrder.leads_purchased || (leadData || []).map(l => l.lead_id).filter(Boolean);
      if (leadIds.length > 0) {
        const response = await base44.functions.invoke('getLeadsFromSheetsForCSV', { lead_ids: leadIds });
        const freshLeads = response.data?.leads || [];
        if (freshLeads.length > 0) {
          leadData = freshLeads.map(lead => {
            const filtered = {};
            Object.entries(lead).forEach(([k, v]) => {
              if (!SYSTEM_FIELDS.includes(k)) filtered[k] = v;
            });
            return filtered;
          });
        }
      }
    }

    if (!leadData || leadData.length === 0) {
      setDownloading(false);
      return;
    }

    generateAndDownloadCSVs(leadData, latestOrder.id);
    setDownloading(false);
  };

  if (!user?.email) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 rounded-3xl border-slate-200/60 text-center max-w-md">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Loading...</h2>
          <p className="text-slate-500">Please wait</p>
        </Card>
      </div>
    );
  }

  if (!orderReady || !latestOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 rounded-3xl border-slate-200/60 text-center max-w-md">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Processing your order...</h2>
          <p className="text-slate-500">Please wait while we prepare your leads</p>
          <p className="text-xs text-slate-400 mt-3">This may take up to 30 seconds</p>
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
            disabled={downloading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 mb-3 shadow-lg shadow-emerald-500/20"
          >
            {downloading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />}
            {downloading ? 'Preparing CSV...' : 'Download Leads CSV'}
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