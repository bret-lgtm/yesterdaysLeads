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
import { Checkbox } from "@/components/ui/checkbox";

export default function Checkout() {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
  const { cartItems, removeFromCart, clearLocalCart } = useCart(user);

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
  const total = subtotal;

  // Group by lead type, then by age
  const groupedItems = React.useMemo(() => {
    const groups = {};
    cartItems.forEach(item => {
      const type = item.lead_type;
      if (!groups[type]) groups[type] = {};
      
      const ageKey = item.age_in_days;
      if (!groups[type][ageKey]) {
        groups[type][ageKey] = { count: 0, price: item.price, age_in_days: ageKey, items: [] };
      }
      groups[type][ageKey].count++;
      groups[type][ageKey].items.push(item);
    });
    return groups;
  }, [cartItems]);

  const handleCheckout = async () => {
    if (cartItems.length === 0 || !termsAccepted) {
      if (!termsAccepted) {
        toast.error('Please accept the terms to continue');
      }
      return;
    }

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

  const handleRemoveAll = async () => {
    if (user) {
      // Delete all cart items for authenticated user
      for (const item of cartItems) {
        await removeFromCart(item.id);
      }
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Cart cleared');
    } else {
      // Clear local storage for anonymous user
      clearLocalCart();
      toast.success('Cart cleared');
    }
  };

  const downloadCSV = async () => {
    if (!completedOrder?.lead_data_snapshot || completedOrder.lead_data_snapshot.length === 0) return;

    try {
      const response = await base44.functions.invoke('filterLeadsForCSV', {
        leads: completedOrder.lead_data_snapshot
      });

      if (!response.data.success) {
        toast.error('Failed to generate CSV');
        return;
      }

      const csvContent = response.data.csvContent;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-order-${completedOrder.id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download CSV');
      console.error(error);
    }
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
                <div className="space-y-4">
                  {Object.entries(groupedItems).map(([leadType, ageGroups]) => (
                    <div key={leadType} className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        {leadType.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </h3>
                      {Object.entries(ageGroups)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([age, group]) => (
                          <div key={age} className="bg-slate-50 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-900">
                                  {group.count} Leads
                                </p>
                                <p className="text-sm text-slate-500">
                                  {age} days old • ${group.price.toFixed(2)} each
                                </p>
                              </div>
                              <span className="font-semibold text-slate-900">
                                ${(group.count * group.price).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={handleRemoveAll}
                    className="w-full rounded-xl border-slate-200 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove All
                  </Button>
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

                <Separator />

                <div className="flex justify-between">
                  <span className="font-medium text-slate-900">Total</span>
                  <span className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <Checkbox 
                    id="terms-checkbox"
                    checked={termsAccepted}
                    onCheckedChange={setTermsAccepted}
                    className="mt-1"
                  />
                  <div>
                    <label 
                      htmlFor="terms-checkbox" 
                      className="text-sm text-slate-700 leading-relaxed cursor-pointer"
                    >
                      I understand that these are aged, non-exclusive insurance leads, which may have been previously sold, contacted, or resold, and are provided as is with no guarantees of performance or compliance.
                    </label>
                    <p className="text-xs text-slate-500 mt-2">
                      Buyer is solely responsible for TCPA compliance, consent verification, and lawful outreach.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={cartItems.length === 0 || processing || !termsAccepted}
                className="w-full h-12 mt-6 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
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