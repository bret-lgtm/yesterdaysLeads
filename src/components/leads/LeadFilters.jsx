import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, RotateCcw } from "lucide-react";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const LEAD_TYPES = [
  { value: "final_expense", label: "Final Expense" },
  { value: "life", label: "Life" },
  { value: "veteran_life", label: "Veteran Life" },
  { value: "retirement", label: "Retirement" },
  { value: "home", label: "Home" },
  { value: "auto", label: "Auto" },
  { value: "medicare", label: "Medicare" },
  { value: "health", label: "Health" }
];

const AGE_RANGES = [
  { value: "yesterday", label: "Yesterday (Last 72hrs)" },
  { value: "4-14", label: "4-14 Days" },
  { value: "15-30", label: "15-30 Days" },
  { value: "31-90", label: "31-90 Days" },
  { value: "91+", label: "91+ Days" }
];

export default function LeadFilters({ filters, onChange, onSearch, onReset }) {
  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lead Type</Label>
          <Select value={filters.lead_type || "all"} onValueChange={(v) => handleChange('lead_type', v)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LEAD_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">State</Label>
          <Select value={filters.state || "all"} onValueChange={(v) => handleChange('state', v)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {US_STATES.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <SelectItem value="Unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lead Age</Label>
          <Select value={filters.age_range || "all"} onValueChange={(v) => handleChange('age_range', v)}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200">
              <SelectValue placeholder="All Ages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              {AGE_RANGES.map(a => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">ZIP Code</Label>
          <Input
            placeholder="Enter ZIP"
            value={filters.zip_code || ""}
            onChange={(e) => handleChange('zip_code', e.target.value)}
            className="h-11 rounded-xl border-slate-200"
          />
        </div>

        <div className="flex items-end gap-2">
          <Button onClick={onSearch} className="h-11 flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md shadow-emerald-500/20">
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
          <Button variant="outline" onClick={onReset} className="h-11 rounded-xl border-slate-200">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}