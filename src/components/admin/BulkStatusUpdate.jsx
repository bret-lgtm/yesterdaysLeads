import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RefreshCw, Loader2, CheckCircle } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";

const LEAD_TYPES = [
  { value: "all", label: "All Types" },
  { value: "auto", label: "Auto Insurance" },
  { value: "home", label: "Home Insurance" },
  { value: "health", label: "Health Insurance" },
  { value: "life", label: "Life Insurance" },
  { value: "medicare", label: "Medicare" },
  { value: "final_expense", label: "Final Expense" }
];

export default function BulkStatusUpdate({ leads, onUpdate }) {
  const [leadType, setLeadType] = useState("all");
  const [currentStatus, setCurrentStatus] = useState("all");
  const [newStatus, setNewStatus] = useState("");
  const [resetDate, setResetDate] = useState(false);
  const [minAge, setMinAge] = useState("");
  const [processing, setProcessing] = useState(false);

  const getMatchingLeads = () => {
    return leads.filter(lead => {
      const typeMatch = leadType === "all" || lead.lead_type === leadType;
      const statusMatch = currentStatus === "all" || lead.status === currentStatus;
      const ageMatch = !minAge || Math.floor((new Date() - new Date(lead.upload_date)) / (1000 * 60 * 60 * 24)) >= parseInt(minAge);
      return typeMatch && statusMatch && ageMatch;
    });
  };

  const matchingCount = getMatchingLeads().length;

  const handleUpdate = async () => {
    if (!newStatus && !resetDate) {
      toast.error("Please select a new status or enable date reset");
      return;
    }

    setProcessing(true);
    const matching = getMatchingLeads();

    try {
      for (const lead of matching) {
        const updateData = {};
        if (newStatus) updateData.status = newStatus;
        if (resetDate) updateData.upload_date = new Date().toISOString().split('T')[0];
        await base44.entities.Lead.update(lead.id, updateData);
      }

      toast.success(`Updated ${matching.length} leads`);
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error("Failed to update leads");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <h3 className="font-semibold text-slate-900 mb-4">Bulk Status Update</h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lead Type</Label>
            <Select value={leadType} onValueChange={setLeadType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Current Status</Label>
            <Select value={currentStatus} onValueChange={setCurrentStatus}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="held">Held</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Minimum Age (days)</Label>
          <Input
            type="number"
            placeholder="e.g., 90"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            className="rounded-xl"
          />
        </div>

        <div className="p-4 bg-slate-50 rounded-xl">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{matchingCount}</span> leads match your criteria
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">New Status</Label>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Select new status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="held">Held</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={resetDate}
            onChange={(e) => setResetDate(e.target.checked)}
            className="rounded"
          />
          <div>
            <p className="font-medium text-slate-900 text-sm">Reset Upload Date</p>
            <p className="text-xs text-slate-500">Set upload date to today</p>
          </div>
        </label>

        <Button
          onClick={handleUpdate}
          disabled={processing || matchingCount === 0}
          className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800"
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Update {matchingCount} Leads
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}