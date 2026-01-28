import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, X, Trash2, CreditCard, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CartSidebar({ items, onRemove, onCheckout, isOpen, onToggle, bulkDiscount }) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discountAmount = bulkDiscount > 0 ? subtotal * (bulkDiscount / 100) : 0;
  const total = subtotal - discountAmount;

  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={onToggle}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-2xl bg-slate-900 hover:bg-slate-800 shadow-lg z-40"
      >
        <ShoppingCart className="w-5 h-5" />
        {items.length > 0 && (
          <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-emerald-500 p-0 flex items-center justify-center">
            {items.length}
          </Badge>
        )}
      </Button>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
              onClick={onToggle}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-slate-900">Your Cart</h2>
                      <p className="text-sm text-slate-500">{items.length} leads selected</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={onToggle} className="rounded-xl">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Items */}
              <ScrollArea className="flex-1 p-6">
                {items.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <ShoppingCart className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500">Your cart is empty</p>
                    <p className="text-sm text-slate-400 mt-1">Browse leads and add them to your cart</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-slate-50 rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{item.lead_name}</p>
                            <p className="text-sm text-slate-500">
                              {item.lead_type} • {item.state} • {item.age_in_days}d old
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">${item.price.toFixed(2)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemove(item.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              {items.length > 0 && (
                <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                  {bulkDiscount > 0 && (
                    <div className="flex items-center justify-between mb-3 text-emerald-600">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        <span className="text-sm font-medium">Bulk Discount ({bulkDiscount}%)</span>
                      </div>
                      <span className="font-medium">-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-slate-600">Total</span>
                    <span className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</span>
                  </div>
                  <Button
                    onClick={onCheckout}
                    className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-base"
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    Proceed to Checkout
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}