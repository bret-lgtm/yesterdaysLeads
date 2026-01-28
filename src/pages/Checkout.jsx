import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: cartItems = [], isLoading } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.CartItem.filter({ user_email: user.email });
    },
    enabled: !!user?.email
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list()
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (itemId) => base44.entities.CartItem.delete(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    }
  });

  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const bulkDiscount = calculateBulkDiscount(cartItems.length);
  const discountAmount = subtotal * (bulkDiscount / 100);
  const total = subtotal - discountAmount;

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    setProcessing(true);

    try {
      // Get or create customer
      let customer = (await base44.entities.Customer.filter({ email: user.email }))[0];
      if (!customer) {
        customer = await base44.entities.Customer.create({
          user_id: user.id,
          email: user.email,
          full_name: user.full_name,
          suppression_list: []
        });
      }

      // Get lead data for snapshot
      const leadIds = cartItems.map(item => item.lead_id);
      const purchasedLeads = leads.filter(l => leadIds.includes(l.id));

      // Create order
      const order = await base44.entities.Order.create({
        customer_id: customer.id,
        customer_email: user.email,
        total_price: total,
        lead_count: cartItems.length,
        stripe_transaction_id: `sim_${Date.now()}`,
        leads_purchased: leadIds,
        lead_data_snapshot: purchasedLeads.map(l => ({
          external_id: l.external_id,
          first_name: l.first_name,
          last_name: l.last_name,
          phone: l.phone,
          email: l.email,
          state: l.state,
          zip_code: l.zip_code,
          lead_type: l.lead_type,
          utility_bill_amount: l.utility_bill_amount
        })),
        status: 'completed'
      });

      // Update leads to sold
      for (const leadId of leadIds) {
        await base44.entities.Lead.update(leadId, { status: 'sold' });
      }

      // Update suppression list
      const updatedSuppressionList = [...(customer.suppression_list || []), ...leadIds];
      await base44.entities.Customer.update(customer.id, {
        suppression_list: updatedSuppressionList
      });

      // Clear cart
      for (const item of cartItems) {
        await base44.entities.CartItem.delete(item.id);
      }

      setCompletedOrder(order);
      setOrderComplete(true);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['customer'] });

    } catch (error) {
      toast.error('Checkout failed. Please try again.');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (!completedOrder?.lead_data_snapshot) return;

    const headers = ['External ID', 'First Name', 'Last Name', 'Phone', 'Email', 'State', 'ZIP', 'Type', 'Utility Bill'];
    const rows = completedOrder.lead_data_snapshot.map(l => [
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
    a.download = `leads-order-${completedOrder.id}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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

              {isLoading ? (
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
                        <p className="font-medium text-slate-900">{item.lead_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {item.lead_type}
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
                          onClick={() => removeFromCartMutation.mutate(item.id)}
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