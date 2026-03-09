import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function RecoverOrder() {
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRecover = async () => {
    if (!paymentIntentId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await base44.functions.invoke('recoverOrderByPI', {
        payment_intent_id: paymentIntentId.trim()
      });
      setResult({ success: true, data: response.data });
      toast.success('Order recovered successfully!');
    } catch (error) {
      setResult({ success: false, error: error.message });
      toast.error('Recovery failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card className="p-6 rounded-2xl border-slate-200/60">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Recover Missing Order</h2>
            <p className="text-sm text-slate-500">Rebuild an order from a Stripe payment intent</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pi">Stripe Payment Intent ID</Label>
            <Input
              id="pi"
              placeholder="pi_3T87O7HG7ZtkxCre1..."
              value={paymentIntentId}
              onChange={(e) => setPaymentIntentId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <Button
            onClick={handleRecover}
            disabled={!paymentIntentId.trim() || loading}
            className="w-full bg-slate-900 hover:bg-slate-800"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recovering...</>
            ) : (
              <><Wrench className="w-4 h-4 mr-2" /> Recover Order</>
            )}
          </Button>
        </div>

        {result && (
          <div className={`mt-4 p-4 rounded-xl ${result.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {result.success ? (
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-800">Order Recovered!</p>
                  <p className="text-emerald-700">Customer: {result.data.customer_email}</p>
                  <p className="text-emerald-700">Leads: {result.data.lead_count} • Total: ${result.data.total?.toFixed(2)}</p>
                  <p className="text-emerald-700 font-mono text-xs mt-1">Order ID: {result.data.new_order_id || result.data.order_id}</p>
                  {result.data.message && <p className="text-emerald-700">{result.data.message}</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-red-800">Recovery Failed</p>
                  <p className="text-red-700">{result.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}