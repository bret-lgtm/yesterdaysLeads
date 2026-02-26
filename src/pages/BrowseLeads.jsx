import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LeadFilters from '../components/leads/LeadFilters';
import LeadCard from '../components/leads/LeadCard';
import CartSidebar from '../components/leads/CartSidebar';
import { calculateLeadPrice } from '../components/pricing/PricingCalculator';
import { useCart } from '../components/useCart';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, ChevronLeft, ChevronRight, ArrowUpDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

const ITEMS_PER_PAGE = 20;

// Always compute age from external_id so it's accurate at cart-add time
function computeAgeInDays(lead) {
  if (lead.external_id && lead.external_id.includes('-')) {
    const dateStr = lead.external_id.split('-')[0];
    if (dateStr && dateStr.length === 8) {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const uploadDate = new Date(year, month, day);
      if (!isNaN(uploadDate.getTime())) {
        return Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
      }
    }
  }
  return lead.age_in_days || 1;
}

export default function BrowseLeads() {
  // Get lead_type and age_range from URL params if present
  const urlParams = new URLSearchParams(window.location.search);
  const urlLeadType = urlParams.get('lead_type');
  const urlAgeRange = urlParams.get('age_range');
  
  const [filters, setFilters] = useState({ age_range: urlAgeRange || 'all', lead_type: urlLeadType || 'all', states: [] });
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOption, setSortOption] = useState('most-popular');
  const [quantity, setQuantity] = useState('');

  const queryClient = useQueryClient();

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Use cart hook
  const { cartItems, addToCart, removeFromCart, clearLocalCart } = useCart(user);

  // Fetch lead suppressions for tier-based filtering
  const { data: leadSuppressions = [] } = useQuery({
    queryKey: ['leadSuppressions'],
    queryFn: () => base44.entities.LeadSuppression.list()
  });

  // Fetch filtered leads from backend
  const { data: allLeads = [], isLoading: leadsLoading, error: leadsError } = useQuery({
    queryKey: ['filteredLeads', JSON.stringify(filters)],
    queryFn: async () => {
      try {
        console.log('Fetching leads with filters:', filters);
        const response = await base44.functions.invoke('getFilteredLeads', { filters });
        console.log('Received leads:', response.data?.leads?.length);
        return response.data?.leads || [];
      } catch (err) {
        console.error('Failed to load leads');
        throw err;
      }
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1
  });

  // Fetch pricing tiers
  const { data: pricingTiers = [] } = useQuery({
    queryKey: ['pricingTiers'],
    queryFn: () => base44.entities.PricingTier.list()
  });

  // Fetch order data to determine most popular lead types
  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list()
  });

  const cartLeadIds = cartItems.map(item => item.lead_id);

  // Helper function to get tier from age
  const getTierFromAge = (ageInDays) => {
    if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
    if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
    if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
    if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
    if (ageInDays >= 91) return 'tier5';
    return 'tier1';
  };

  // Apply tier-based suppression
  const filteredLeads = allLeads.filter(lead => {
    // Exclude leads that have been sold in their current tier
    const currentTier = getTierFromAge(lead.age_in_days || 1);
    const soldInCurrentTier = leadSuppressions.some(
      sup => sup.lead_id === lead.id && sup.tier === currentTier
    );
    return !soldInCurrentTier;
  });

  // Calculate lead type popularity from orders
  const leadTypePopularity = React.useMemo(() => {
    const popularity = {};
    orders.forEach(order => {
      if (order.lead_data_snapshot) {
        order.lead_data_snapshot.forEach(lead => {
          const type = lead.lead_type;
          if (type) {
            popularity[type] = (popularity[type] || 0) + 1;
          }
        });
      }
    });
    return popularity;
  }, [orders]);

  // Apply sorting
  const sortedLeads = React.useMemo(() => {
    const sorted = [...filteredLeads];
    
    if (sortOption === 'most-popular') {
      sorted.sort((a, b) => {
        const popA = leadTypePopularity[a.lead_type] || 0;
        const popB = leadTypePopularity[b.lead_type] || 0;
        if (popB !== popA) {
          return popB - popA;
        }
        // Within same popularity, sort by age (newest first)
        return (a.age_in_days || 0) - (b.age_in_days || 0);
      });
    } else if (sortOption === 'age-old-new') {
      sorted.sort((a, b) => (b.age_in_days || 0) - (a.age_in_days || 0));
    } else if (sortOption === 'age-new-old') {
      sorted.sort((a, b) => (a.age_in_days || 0) - (b.age_in_days || 0));
    } else if (sortOption === 'price-low-high') {
      sorted.sort((a, b) => {
        const priceA = calculateLeadPrice(a, pricingTiers);
        const priceB = calculateLeadPrice(b, pricingTiers);
        return priceA - priceB;
      });
    } else if (sortOption === 'price-high-low') {
      sorted.sort((a, b) => {
        const priceA = calculateLeadPrice(a, pricingTiers);
        const priceB = calculateLeadPrice(b, pricingTiers);
        return priceB - priceA;
      });
    }
    
    return sorted;
  }, [filteredLeads, sortOption, pricingTiers, leadTypePopularity]);

  // Pagination
  const totalPages = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = sortedLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Bulk add to cart
  const handleBulkAddToCart = async () => {
    const leadsToAdd = selectedLeads.filter(lead => !cartLeadIds.includes(lead.id));
    
    console.log('Selected leads:', selectedLeads.length);
    console.log('Leads to add (not in cart):', leadsToAdd.length);
    
    if (leadsToAdd.length === 0) {
      toast.info('All selected leads are already in cart');
      return;
    }
    
    if (user) {
      // Create items one by one for authenticated users (RLS compatibility)
      for (const lead of leadsToAdd) {
        await base44.entities.CartItem.create({
          user_email: user.email,
          lead_id: lead.id,
          lead_type: lead.lead_type,
          lead_name: `${lead.first_name} ${lead.last_name || lead.last_name_initial || 'Unknown'}.`,
          state: lead.state,
          zip_code: String(lead.zip_code || ''),
          age_in_days: computeAgeInDays(lead),
          price: calculateLeadPrice({...lead, age_in_days: computeAgeInDays(lead)}, pricingTiers)
        });
      }
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success(`${leadsToAdd.length} leads added to cart`);
    } else {
      // Batch add to localStorage for anonymous users
      const stored = localStorage.getItem('anonymous_cart');
      const existingCart = stored ? JSON.parse(stored) : [];
      
      const newItems = leadsToAdd.map(lead => ({
        id: `local_${Date.now()}_${Math.random()}`,
        lead_id: lead.id,
        lead_type: lead.lead_type,
        lead_name: `${lead.first_name} ${lead.last_name || lead.last_name_initial || 'Unknown'}.`,
        state: lead.state,
        zip_code: String(lead.zip_code || ''),
        age_in_days: computeAgeInDays(lead),
        price: calculateLeadPrice({...lead, age_in_days: computeAgeInDays(lead)}, pricingTiers)
      }));
      
      const updatedCart = [...existingCart, ...newItems];
      localStorage.setItem('anonymous_cart', JSON.stringify(updatedCart));
      window.dispatchEvent(new Event('cartUpdated'));
      toast.success(`${leadsToAdd.length} leads added to cart`);
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

  const handleSelectAll = () => {
    const currentPageLeadIds = paginatedLeads.map(l => l.id);
    const allCurrentPageSelected = paginatedLeads.every(lead => 
      selectedLeads.find(l => l.id === lead.id)
    );
    
    if (allCurrentPageSelected) {
      // Unselect all leads on current page
      setSelectedLeads(prev => prev.filter(l => !currentPageLeadIds.includes(l.id)));
    } else {
      // Select all leads on current page (keep selections from other pages)
      const newSelections = paginatedLeads.filter(lead => 
        !selectedLeads.find(l => l.id === lead.id)
      );
      setSelectedLeads(prev => [...prev, ...newSelections]);
    }
  };

  const [quantityLoading, setQuantityLoading] = useState(false);

  const handleQuantityAddToCart = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const availableLeads = sortedLeads.filter(lead => !cartLeadIds.includes(lead.id));
    const leadsToAdd = availableLeads.slice(0, qty);

    if (leadsToAdd.length === 0) {
      toast.info('No available leads to add');
      return;
    }

    setQuantityLoading(true);
    try {
      const items = leadsToAdd.map(lead => {
        const age = computeAgeInDays(lead);
        return {
          lead_id: lead.id,
          lead_type: lead.lead_type,
          lead_name: `${lead.first_name} ${lead.last_name || lead.last_name_initial || 'Unknown'}.`,
          state: lead.state,
          zip_code: String(lead.zip_code || ''),
          age_in_days: age,
          price: calculateLeadPrice({...lead, age_in_days: age}, pricingTiers)
        };
      });

      if (user) {
        // Bulk create in batches of 50 to avoid timeouts
        const BATCH_SIZE = 50;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE).map(item => ({ user_email: user.email, ...item }));
          await base44.entities.CartItem.bulkCreate(batch);
        }
        queryClient.invalidateQueries({ queryKey: ['cart'] });
      } else {
        const stored = localStorage.getItem('anonymous_cart');
        const existingCart = stored ? JSON.parse(stored) : [];
        const newItems = items.map(item => ({ id: `local_${Date.now()}_${Math.random()}`, ...item }));
        localStorage.setItem('anonymous_cart', JSON.stringify([...existingCart, ...newItems]));
        window.dispatchEvent(new Event('cartUpdated'));
      }
      toast.success(`${leadsToAdd.length} leads added to cart`);
      setQuantity('');
    } finally {
      setQuantityLoading(false);
    }
  };

  const handleCheckout = () => {
    window.location.href = '/Checkout';
  };

  const handleRemoveAll = async () => {
    if (user) {
      await base44.functions.invoke('clearCart', {});
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Cart cleared');
    } else {
      clearLocalCart();
      toast.success('Cart cleared');
    }
  };

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
          onChange={(newFilters) => {
            setFilters(newFilters);
            setCurrentPage(1);
          }}
          onReset={() => {
            setFilters({ age_range: 'all', lead_type: 'all', states: [] });
            setCurrentPage(1);
          }}
        />

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 my-6">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-900">{sortedLeads.length}</span> leads found
          </p>
          
          <div className="flex items-center gap-3">
            {/* Select All Button */}
            {paginatedLeads.length > 0 && (
              <Button
                onClick={handleSelectAll}
                variant="outline"
                className="rounded-xl border-slate-200"
              >
                {paginatedLeads.every(lead => selectedLeads.find(l => l.id === lead.id)) ? 'Unselect All on Page' : 'Select All on Page'}
              </Button>
            )}

            {/* Quantity Selector */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Qty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-20 h-10 rounded-xl border-slate-200"
                min="1"
              />
              <Button
                onClick={handleQuantityAddToCart}
                disabled={!quantity || parseInt(quantity) <= 0 || sortedLeads.length === 0 || quantityLoading}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4 mr-1" />
                {quantityLoading ? 'Adding...' : 'Add to Cart'}
              </Button>
            </div>

            {selectedLeads.length > 0 && (
              <Button
                onClick={handleBulkAddToCart}
                variant="outline"
                className="rounded-xl border-slate-200"
              >
                Add {selectedLeads.length} Selected
              </Button>
            )}
          </div>
        </div>

        {/* Sort Options */}
        {sortedLeads.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <ArrowUpDown className="w-4 h-4 text-slate-500" />
            <Select value={sortOption} onValueChange={setSortOption}>
              <SelectTrigger className="w-48 h-10 rounded-xl border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="most-popular">Most Popular</SelectItem>
                <SelectItem value="age-old-new">Age: Old → New</SelectItem>
                <SelectItem value="age-new-old">Age: New → Old</SelectItem>
                <SelectItem value="price-low-high">Price: Low → High</SelectItem>
                <SelectItem value="price-high-low">Price: High → Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

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
                  onAddToCart={async (lead, _price) => {
                    const age = computeAgeInDays(lead);
                    const computedPrice = calculateLeadPrice({...lead, age_in_days: age}, pricingTiers);
                    await addToCart({
                      lead_id: lead.id,
                      lead_type: lead.lead_type,
                      lead_name: `${lead.first_name} ${lead.last_name || lead.last_name_initial || 'Unknown'}.`,
                      state: lead.state,
                      zip_code: String(lead.zip_code || ''),
                      age_in_days: age,
                      price: computedPrice
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
        onRemoveAll={handleRemoveAll}
      />
    </div>
  );
}