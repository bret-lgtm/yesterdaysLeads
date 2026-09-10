import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  UserCheck,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Pencil,
} from 'lucide-react';

const REFERRAL_BASE = 'https://yesterdaysleads.com';

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export default function SalesRepManager({ orders = [] }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', referral_code: '', phone: '', notes: '', hubspot_owner_id: '', active: true });

  const { data: reps = [], isLoading } = useQuery({
    queryKey: ['salesReps'],
    queryFn: () => base44.entities.SalesRep.list('-created_date', 500),
  });

  const resetForm = () => {
    setForm({ name: '', email: '', referral_code: '', phone: '', notes: '', hubspot_owner_id: '', active: true });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (rep) => {
    setEditing(rep);
    setForm({
      name: rep.name || '',
      email: rep.email || '',
      referral_code: rep.referral_code || '',
      phone: rep.phone || '',
      notes: rep.notes || '',
      hubspot_owner_id: rep.hubspot_owner_id || '',
      active: rep.active !== false,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.referral_code.trim()) {
      toast.error('Name and referral code are required');
      return;
    }
    const code = slugify(form.referral_code);
    if (!code) {
      toast.error('Referral code must contain letters or numbers');
      return;
    }
    const duplicate = reps.find((r) => r.referral_code === code && r.id !== editing?.id);
    if (duplicate) {
      toast.error(`Referral code "${code}" is already used by ${duplicate.name}`);
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        referral_code: code,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        hubspot_owner_id: form.hubspot_owner_id.trim() || null,
        active: form.active,
      };
      if (editing) {
        await base44.entities.SalesRep.update(editing.id, payload);
        toast.success('Sales rep updated');
      } else {
        await base44.entities.SalesRep.create(payload);
        toast.success('Sales rep added');
      }
      queryClient.invalidateQueries({ queryKey: ['salesReps'] });
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save rep');
    }
  };

  const handleDelete = async (rep) => {
    if (!confirm(`Delete sales rep "${rep.name}"? Existing orders keep their attribution.`)) return;
    try {
      await base44.entities.SalesRep.delete(rep.id);
      queryClient.invalidateQueries({ queryKey: ['salesReps'] });
      toast.success('Sales rep deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete rep');
    }
  };

  const copyLink = (code) => {
    const link = `${REFERRAL_BASE}/?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => toast.success('Referral link copied'));
  };

  // Aggregate completed orders by referred_by
  const report = React.useMemo(() => {
    const map = {};
    for (const o of orders) {
      if (o.status !== 'completed') continue;
      const key = o.referred_by;
      if (!key) continue;
      if (!map[key]) map[key] = { code: key, orders: 0, leads: 0, revenue: 0 };
      map[key].orders += 1;
      map[key].leads += o.lead_data_snapshot?.length || o.leads_purchased?.length || o.lead_count || 0;
      map[key].revenue += o.total_price || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const repByCode = React.useMemo(() => {
    const m = {};
    for (const r of reps) m[r.referral_code] = r;
    return m;
  }, [reps]);

  const totalAttributedRevenue = report.reduce((s, r) => s + r.revenue, 0);
  const totalAttributedLeads = report.reduce((s, r) => s + r.leads, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 rounded-2xl border-slate-200/60">
          <p className="text-sm text-slate-500 mb-1">Active Reps</p>
          <p className="text-3xl font-bold text-slate-900">{reps.filter((r) => r.active !== false).length}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-200/60">
          <p className="text-sm text-slate-500 mb-1">Attributed Revenue</p>
          <p className="text-3xl font-bold text-slate-900">${totalAttributedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-200/60">
          <p className="text-sm text-slate-500 mb-1">Attributed Leads</p>
          <p className="text-3xl font-bold text-slate-900">{totalAttributedLeads.toLocaleString()}</p>
        </Card>
      </div>

      {/* Rep list */}
      <Card className="p-6 rounded-2xl border-slate-200/60">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Sales Reps</h2>
              <p className="text-sm text-slate-500">Each rep gets a referral link that attributes orders automatically</p>
            </div>
          </div>
          {!showForm && (
            <Button onClick={() => { resetForm(); setShowForm(true); }} className="rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Add Rep
            </Button>
          )}
        </div>

        {showForm && (
          <div className="bg-slate-50 rounded-2xl p-5 mb-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="John Smith"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="mb-1.5">Referral Code *</Label>
                <Input
                  value={form.referral_code}
                  onChange={(e) => setForm({ ...form, referral_code: e.target.value })}
                  onBlur={() => setForm((f) => ({ ...f, referral_code: slugify(f.referral_code) }))}
                  placeholder="john-smith"
                  className="rounded-xl"
                />
                <p className="text-xs text-slate-400 mt-1">Link: {REFERRAL_BASE}/?ref={slugify(form.referral_code) || 'code'}</p>
              </div>
              <div>
                <Label className="mb-1.5">Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="rep@agency.com"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="mb-1.5">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="555-123-4567"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-1.5">Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Agency, region, commission notes…"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-1.5">HubSpot Owner ID</Label>
                <Input
                  value={form.hubspot_owner_id}
                  onChange={(e) => setForm({ ...form, hubspot_owner_id: e.target.value })}
                  placeholder="e.g. 12345678"
                  className="rounded-xl"
                />
                <p className="text-xs text-slate-400 mt-1">Find this in HubSpot under Settings → Users & Teams (the numeric ID). Deals from this rep's referrals are assigned to this owner.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="rounded-xl">{editing ? 'Save Changes' : 'Add Rep'}</Button>
              <Button variant="outline" onClick={resetForm} className="rounded-xl">Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : reps.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <UserCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>No sales reps yet. Add your first rep to generate a referral link.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{rep.name}</div>
                      {rep.email && <div className="text-xs text-slate-500">{rep.email}</div>}
                    </TableCell>
                    <TableCell><code className="text-sm bg-slate-100 px-2 py-1 rounded">{rep.referral_code}</code></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 truncate max-w-[220px]">{REFERRAL_BASE}/?ref={rep.referral_code}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(rep.referral_code)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <a href={`${REFERRAL_BASE}/?ref=${rep.referral_code}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rep.active === false ? 'outline' : 'default'} className={rep.active === false ? 'text-slate-400' : 'bg-emerald-100 text-emerald-700'}>
                        {rep.active === false ? 'Inactive' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(rep)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(rep)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Attribution report */}
      <Card className="p-6 rounded-2xl border-slate-200/60">
        <h2 className="font-semibold text-slate-900 mb-1">Attribution Report</h2>
        <p className="text-sm text-slate-500 mb-4">Revenue and leads attributed to each rep's referral code (completed orders only)</p>
        {report.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No attributed orders yet. Share referral links to start tracking sales.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((row) => {
                  const rep = repByCode[row.code];
                  return (
                    <TableRow key={row.code}>
                      <TableCell className="font-medium text-slate-900">{rep?.name || <span className="text-slate-400 italic">Unknown ({row.code})</span>}</TableCell>
                      <TableCell><code className="text-sm bg-slate-100 px-2 py-1 rounded">{row.code}</code></TableCell>
                      <TableCell className="text-right">{row.orders}</TableCell>
                      <TableCell className="text-right">{row.leads.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">${row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}