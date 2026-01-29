import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCart } from '../components/useCart';
import { migrateLocalCartToDatabase } from '../components/cartMigration';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { calculateBulkDiscount } from '../components/pricing/PricingCalculator';
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  ShoppingCart, 
  CreditCard, 
  ArrowLeft, 
  Tag, 
  Loader2,
  CheckCircle,
  Download,
  Trash2
} from "lucide-react";

export default function Checkout() {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  // Use cart hook
  const { cartItems, removeFromCart } = useCart(user);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!userLoading && !user) {
      base44.auth.redirectToLogin(window.location.pathname);
    }
  }, [user, userLoading]);

  // Migrate cart on sign-in
  useEffect(() => {
    if (user?.email) {
      migrateLocalCartToDatabase(user.email).then(() => {
        queryClient.invalidateQueries({ queryKey: ['cart'] });
      });
    }
  }, [user?.email, queryClient]);



  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const bulkDiscount = calculateBulkDiscount(cartItems.length);
  const discountAmount = subtotal * (bulkDiscount / 100);
  const total = subtotal - discountAmount;

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    setProcessing(true);

    try {
      const response = await base44.functions.invoke('createCheckoutSession', {
        cartItems,
        customerEmail: user?.email
      });

      if (response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      toast.error('Failed to start checkout. Please try again.');
      console.error(error);
      setProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (!completedOrder?.lead_data_snapshot || completedOrder.lead_data_snapshot.length === 0) return;

    // Dynamically build headers from the first lead's keys, excluding status and external_id
    const firstLead = completedOrder.lead_data_snapshot[0];
    const headers = Object.keys(firstLead).filter(key => key !== 'status' && key !== 'external_id');

    // Build rows using the dynamic headers
    const rows = completedOrder.lead_data_snapshot.map(lead =>
      headers.map(header => lead[header] || '')
    );

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-order-${completedOrder.id}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (orderComplete) {
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
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Order Complete!</h1>
            <p className="text-slate-500 mb-6">
              Your {completedOrder?.lead_count} leads are ready for download
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Order ID</span>
                <span className="font-mono text-slate-700">{completedOrder?.id?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total Paid</span>
                <span className="font-semibold text-slate-900">${completedOrder?.total_price?.toFixed(2)}</span>
              </div>
            </div>

            <Button
              onClick={downloadCSV}
              className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 mb-3"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Leads CSV
            </Button>

            <Link to={createPageUrl('BrowseLeads')}>
              <Button variant="outline" className="w-full h-12 rounded-xl">
                Continue Browsing
              </Button>
            </Link>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link to={createPageUrl('BrowseLeads')} className="inline-flex items-center text-slate-500 hover:text-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Browse
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Checkout</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6 rounded-2xl border-slate-200/60">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Your Cart</h2>
                  <p className="text-sm text-slate-500">{cartItems.length} leads</p>
                </div>
              </div>

              {userLoading ? (
                <div className="animate-pulse space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-slate-100 rounded-xl" />
                  ))}
                </div>
              ) : cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500">Your cart is empty</p>
                  <Link to={createPageUrl('BrowseLeads')}>
                    <Button variant="outline" className="mt-4 rounded-xl">
                      Browse Leads
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">
                          {item.lead_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {item.lead_type.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {item.state} • {item.age_in_days}d old
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">${item.price.toFixed(2)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Order Summary */}
          <div>
            <Card className="p-6 rounded-2xl border-slate-200/60 sticky top-8">
              <h2 className="font-semibold text-slate-900 mb-4">Order Summary</h2>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal ({cartItems.length} leads)</span>
                  <span className="text-slate-900">${subtotal.toFixed(2)}</span>
                </div>

                {bulkDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <div className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Bulk Discount ({bulkDiscount}%)</span>
                    </div>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between">
                  <span className="font-medium text-slate-900">Total</span>
                  <span className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={cartItems.length === 0 || processing}
                className="w-full h-12 mt-6 rounded-xl bg-slate-900 hover:bg-slate-800"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Complete Purchase
                  </>
                )}
              </Button>

              <p className="text-xs text-slate-400 text-center mt-4">
                Secure checkout. Your leads will be available immediately after purchase.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}