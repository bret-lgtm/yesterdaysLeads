import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import InventoryStats from '../components/admin/InventoryStats';
import InventoryByType from '../components/admin/InventoryByType';
import InventoryByAge from '../components/admin/InventoryByAge';
import SoldByType from '../components/admin/SoldByType';
import CSVUploader from '../components/admin/CSVUploader';
import BulkStatusUpdate from '../components/admin/BulkStatusUpdate';
import OrdersList from '../components/admin/OrdersList';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LayoutDashboard, 
  Upload, 
  RefreshCw,
  DollarSign,
  Users,
  ShoppingBag
} from "lucide-react";

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: sheetLeadsResponse, isLoading: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ['sheetLeads'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getLeadsFromSheets', {
        filters: {},
        include_last_names: true
      });
      return response.data;
    }
  });

  const leads = sheetLeadsResponse?.leads || [];

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['allOrders'],
    queryFn: () => base44.entities.Order.list('-created_date', 1000)
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['allCustomers'],
    queryFn: () => base44.entities.Customer.list('-created_date', 1000)
  });

  const completedOrders = orders.filter(o => o.status === 'completed' && o.stripe_transaction_id);
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
  const totalLeadsSold = orders.reduce((sum, o) => {
    // Count from lead_data_snapshot array for accuracy
    const count = o.lead_data_snapshot?.length || o.leads_purchased?.length || o.lead_count || 0;
    return sum + count;
  }, 0);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sheetLeads'] });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Card className="p-8 rounded-2xl text-center max-w-md">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500">You need admin privileges to view this page.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Admin Dashboard</h1>
          <p className="text-slate-500">Manage inventory, pricing, and view analytics</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 rounded-2xl border-slate-200/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-slate-900">${totalRevenue.toLocaleString()}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5 rounded-2xl border-slate-200/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Leads Sold</p>
                <p className="text-3xl font-bold text-slate-900">{totalLeadsSold.toLocaleString()}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5 rounded-2xl border-slate-200/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Orders</p>
                <p className="text-3xl font-bold text-slate-900">{orders.length}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5 rounded-2xl border-slate-200/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Customers</p>
                <p className="text-3xl font-bold text-slate-900">{customers.length}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="inventory" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl">
            <TabsTrigger value="inventory" className="rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="upload" className="rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="manage" className="rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              <RefreshCw className="w-4 h-4 mr-2" />
              Manage
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Orders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-6">
            {leadsLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-72 rounded-2xl" />
                  <Skeleton className="h-72 rounded-2xl" />
                </div>
              </div>
            ) : (
              <>
                <InventoryStats leads={leads} />
                <div className="grid lg:grid-cols-2 gap-6">
                  <InventoryByType leads={leads} />
                  <InventoryByAge leads={leads} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6 mt-6">
                  <SoldByType orders={orders} />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="upload">
            <div className="max-w-xl">
              <CSVUploader onUploadComplete={handleRefresh} />
            </div>
          </TabsContent>

          <TabsContent value="manage">
            <div className="max-w-xl">
              <BulkStatusUpdate leads={leads} onUpdate={handleRefresh} />
            </div>
          </TabsContent>

          <TabsContent value="orders">
            {ordersLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
              </div>
            ) : (
              <OrdersList orders={orders} customers={customers} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}