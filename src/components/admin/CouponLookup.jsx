import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Ticket, RefreshCw, Percent, DollarSign } from "lucide-react";

export default function CouponLookup() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['coupons', debouncedSearch],
    queryFn: async () => {
      const res = await base44.functions.invoke('lookupCoupons', { search: debouncedSearch });
      return res.data;
    }
  });

  const records = data?.records || [];

  const formatDiscount = (coupon) => {
    if (!coupon) return '—';
    if (coupon.percent_off != null) {
      return { icon: Percent, text: `${coupon.percent_off}% off` };
    }
    if (coupon.amount_off != null) {
      return { icon: DollarSign, text: `$${(coupon.amount_off / 100).toFixed(2)} off` };
    }
    return { icon: DollarSign, text: '—' };
  };

  const formatDuration = (coupon) => {
    if (!coupon) return '—';
    if (coupon.duration === 'once') return 'Once';
    if (coupon.duration === 'repeating') return `For ${coupon.duration_in_months || 1} months`;
    if (coupon.duration === 'forever') return 'Forever';
    return coupon.duration || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-emerald-600" />
            Coupon & Promo Code Lookup
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Search Stripe coupons and promotion codes by code, name, or ID.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by code, name, or ID (e.g. reel4)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <Card className="p-8 rounded-2xl text-center text-slate-500">
          No coupons or promo codes found{debouncedSearch ? ` for "${debouncedSearch}"` : ''}.
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {data.total} result{data.total !== 1 ? 's' : ''}
            {debouncedSearch && ` for "${debouncedSearch}"`}
          </p>
          <div className="space-y-3">
            {records.map((r) => {
              const disc = formatDiscount(r.coupon);
              const DiscIcon = disc.icon;
              return (
                <Card key={r.id} className="p-4 rounded-2xl border-slate-200/60">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-slate-900">
                          {r.code || r.coupon?.name || r.coupon?.id}
                        </span>
                        <Badge variant={r.active ? 'default' : 'secondary'} className={r.active ? 'bg-emerald-100 text-emerald-700' : ''}>
                          {r.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {r.type === 'promotion_code' ? 'Promo Code' : 'Coupon'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          <DiscIcon className="w-4 h-4 text-emerald-600" />
                          {disc.text}
                        </span>
                        <span>
                          Duration: <span className="font-medium text-slate-700">{formatDuration(r.coupon)}</span>
                        </span>
                        <span>
                          Redeemed: <span className="font-medium text-slate-700">{r.times_redeemed}{r.max_redemptions ? ` / ${r.max_redemptions}` : ''}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        <span>ID: {r.id}</span>
                        {r.coupon?.id && r.coupon.id !== r.id && <span>Coupon: {r.coupon.id}</span>}
                        <span>Created: {new Date(r.created).toLocaleDateString()}</span>
                        {r.expires_at && <span>Expires: {new Date(r.expires_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}