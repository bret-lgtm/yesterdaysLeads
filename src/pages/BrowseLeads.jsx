import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LeadFilters from '../components/leads/LeadFilters';
import LeadCard from '../components/leads/LeadCard';
import CartSidebar from '../components/leads/CartSidebar';
import { calculateLeadPrice, calculateBulkDiscount } from '../components/pricing/PricingCalculator';
import { useCart } from '../components/useCart';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

export default function BrowseLeads() {
  // Get lead_type from URL params if present
  const urlParams = new URLSearchParams(window.location.search);
  const urlLeadType = urlParams.get('lead_type');
  
  const [filters, setFilters] = useState({ age_range: 'all', lead_type: urlLeadType || 'all' });
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Use cart hook
  const { cartItems, addToCart, removeFromCart } = useCart(user);

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

  // Fetch all available leads from Google Sheets
  const { data: sheetsResponse = { leads: [] }, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getLeadsFromSheets', { filters });
      return response.data;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const allLeads = sheetsResponse.leads || [];

  // Fetch pricing tiers
  const { data: pricingTiers = [] } = useQuery({
    queryKey: ['pricingTiers'],
    queryFn: () => base44.entities.PricingTier.list()
  });

  // Filter out suppressed leads
  const suppressionList = customer?.suppression_list || [];
  const cartLeadIds = cartItems.map(item => item.lead_id);

  const filteredLeads = allLeads.filter(lead => {
    // Exclude suppressed leads (only for authenticated users)
    if (user && suppressionList.includes(lead.id)) return false;

    // Apply filters
    if (filters.lead_type && filters.lead_type !== 'all' && lead.lead_type !== filters.lead_type) return false;
    if (filters.state && filters.state !== 'all' && lead.state !== filters.state) return false;
    if (filters.zip_code && !lead.zip_code?.startsWith(filters.zip_code)) return false;

    if (filters.age_range && filters.age_range !== 'all') {
      const uploadDate = new Date(lead.upload_date);
      const hoursSinceUpload = (new Date() - uploadDate) / (1000 * 60 * 60);
      const ageInDays = Math.floor(hoursSinceUpload / 24);

      if (filters.age_range === 'yesterday' && hoursSinceUpload > 72) return false;
      if (filters.age_range === '4-14' && (ageInDays < 4 || ageInDays > 14)) return false;
      if (filters.age_range === '15-30' && (ageInDays < 15 || ageInDays > 30)) return false;
      if (filters.age_range === '31-90' && (ageInDays < 31 || ageInDays > 90)) return false;
      if (filters.age_range === '91+' && ageInDays < 91) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Bulk add to cart
  const handleBulkAddToCart = async () => {
    for (const lead of selectedLeads) {
      if (!cartLeadIds.includes(lead.id)) {
        const price = calculateLeadPrice(lead, pricingTiers);
        const dateStr = lead.external_id.split('-')[0];
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const uploadDate = new Date(year, month, day);
        const ageInDays = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
        
        await addToCart({
          lead_id: lead.id,
          lead_type: lead.lead_type,
          lead_name: `${lead.first_name} ${lead.last_name_initial}.`,
          state: lead.state,
          zip_code: lead.zip_code,
          age_in_days: ageInDays,
          price
        });
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
          onReset={() => { setFilters({ age_range: 'yesterday' }); setCurrentPage(1); }}
        />

        {/* Results Header */}
        <div className="flex items-center justify-between my-6">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-900">{filteredLeads.length}</span> leads found
          </p>
          {selectedLeads.length > 0 && (
            <Button
              onClick={handleBulkAddToCart}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/20"
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
                  onAddToCart={async (lead, price) => {
                    const dateStr = lead.external_id.split('-')[0];
                    const year = parseInt(dateStr.substring(0, 4));
                    const month = parseInt(dateStr.substring(4, 6)) - 1;
                    const day = parseInt(dateStr.substring(6, 8));
                    const uploadDate = new Date(year, month, day);
                    const ageInDays = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));

                    await addToCart({
                      lead_id: lead.id,
                      lead_type: lead.lead_type,
                      lead_name: `${lead.first_name} ${lead.last_name_initial}.`,
                      state: lead.state,
                      zip_code: lead.zip_code,
                      age_in_days: ageInDays,
                      price
                    });
                  }}
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
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
        isOpen={cartOpen}
        onToggle={() => setCartOpen(!cartOpen)}
        bulkDiscount={bulkDiscount}
      />
    </div>
  );
}