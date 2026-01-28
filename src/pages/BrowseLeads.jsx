import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import LeadFilters from '../components/leads/LeadFilters';
import LeadCard from '../components/leads/LeadCard';
import CartSidebar from '../components/leads/CartSidebar';
import { calculateLeadPrice, calculateBulkDiscount } from '../components/pricing/PricingCalculator';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

export default function BrowseLeads() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({});
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch customer data for suppression list
  const { data: customer } = useQuery({
    queryKey: ['customer', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const customers = await base44.entities.Customer.filter({ email: user.email });
      return customers[0] || null;
    },
    enabled: !!user?.email
  });

  // Fetch leads
  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.filter({ status: 'available' }, '-upload_date')
  });

  // Fetch cart items
  const { data: cartItems = [], isLoading: cartLoading } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.CartItem.filter({ user_email: user.email });
    },
    enabled: !!user?.email
  });

  // Fetch pricing tiers
  const { data: pricingTiers = [] } = useQuery({
    queryKey: ['pricingTiers'],
    queryFn: () => base44.entities.PricingTier.list()
  });

  // Filter out suppressed leads
  const suppressionList = customer?.suppression_list || [];
  const cartLeadIds = cartItems.map(item => item.lead_id);

  const filteredLeads = allLeads.filter(lead => {
    // Exclude suppressed leads
    if (suppressionList.includes(lead.id)) return false;

    // Apply filters
    if (filters.lead_type && filters.lead_type !== 'all' && lead.lead_type !== filters.lead_type) return false;
    if (filters.state && filters.state !== 'all' && lead.state !== filters.state) return false;
    if (filters.zip_code && !lead.zip_code?.startsWith(filters.zip_code)) return false;

    if (filters.age_range && filters.age_range !== 'all') {
      const ageInDays = Math.floor((new Date() - new Date(lead.upload_date)) / (1000 * 60 * 60 * 24));
      const [min, max] = filters.age_range.includes('+') 
        ? [parseInt(filters.age_range), Infinity]
        : filters.age_range.split('-').map(Number);
      if (ageInDays < min || ageInDays > max) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: async ({ lead, price }) => {
      const ageInDays = Math.floor((new Date() - new Date(lead.upload_date)) / (1000 * 60 * 60 * 24));
      return base44.entities.CartItem.create({
        user_email: user.email,
        lead_id: lead.id,
        lead_type: lead.lead_type,
        lead_name: `${lead.first_name} ${lead.last_name}`,
        state: lead.state,
        age_in_days: ageInDays,
        price
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Lead added to cart');
    }
  });

  // Remove from cart mutation
  const removeFromCartMutation = useMutation({
    mutationFn: (itemId) => base44.entities.CartItem.delete(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Lead removed from cart');
    }
  });

  // Bulk add to cart
  const handleBulkAddToCart = async () => {
    for (const lead of selectedLeads) {
      if (!cartLeadIds.includes(lead.id)) {
        const price = calculateLeadPrice(lead, pricingTiers);
        await addToCartMutation.mutateAsync({ lead, price });
      }
    }
    setSelectedLeads([]);
  };

  const handleSelectLead = (lead) => {
    setSelectedLeads(prev => 
      prev.find(l => l.id === lead.id)
        ? prev.filter(l => l.id !== lead.id)
        : [...prev, lead]
    );
  };

  const handleCheckout = () => {
    window.location.href = '/Checkout';
  };

  const bulkDiscount = calculateBulkDiscount(cartItems.length);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Browse Leads</h1>
          <p className="text-slate-500">Find high-quality aged insurance leads for your business</p>
        </div>

        {/* Filters */}
        <LeadFilters
          filters={filters}
          onChange={setFilters}
          onSearch={() => setCurrentPage(1)}
          onReset={() => { setFilters({}); setCurrentPage(1); }}
        />

        {/* Results Header */}
        <div className="flex items-center justify-between my-6">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-900">{filteredLeads.length}</span> leads found
          </p>
          {selectedLeads.length > 0 && (
            <Button
              onClick={handleBulkAddToCart}
              className="rounded-xl bg-slate-900 hover:bg-slate-800"
            >
              Add {selectedLeads.length} Selected to Cart
            </Button>
          )}
        </div>

        {/* Leads Grid */}
        {leadsLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : paginatedLeads.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No leads found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedLeads.map(lead => {
              const price = calculateLeadPrice(lead, pricingTiers);
              const isInCart = cartLeadIds.includes(lead.id);
              const isSelected = selectedLeads.find(l => l.id === lead.id);

              return (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  price={price}
                  isSelected={!!isSelected}
                  onSelect={handleSelectLead}
                  isInCart={isInCart}
                  onAddToCart={(lead, price) => addToCartMutation.mutate({ lead, price })}
                />
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-xl"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-4 text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      <CartSidebar
        items={cartItems}
        onRemove={(id) => removeFromCartMutation.mutate(id)}
        onCheckout={handleCheckout}
        isOpen={cartOpen}
        onToggle={() => setCartOpen(!cartOpen)}
        bulkDiscount={bulkDiscount}
      />
    </div>
  );
}