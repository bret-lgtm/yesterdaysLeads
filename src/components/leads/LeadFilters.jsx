import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, RotateCcw, Info, X, Check } from "lucide-react";

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
  { value: "health", label: "Health" },
  { value: "annuity", label: "Annuity" },
  { value: "recruiting", label: "Recruiting" }
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">State</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 w-full rounded-xl border-slate-200 justify-start font-normal">
                {filters.states?.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{filters.states.length} selected</span>
                    {filters.states.slice(0, 3).map(state => (
                      <Badge key={state} variant="secondary" className="text-xs">
                        {state}
                      </Badge>
                    ))}
                    {filters.states.length > 3 && (
                      <span className="text-xs text-slate-500">+{filters.states.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-500">All States</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">Select States</span>
                  {filters.states?.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleChange('states', [])}
                      className="h-7 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-3 max-h-64 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      const selected = filters.states || [];
                      if (selected.includes('Unknown')) {
                        handleChange('states', selected.filter(s => s !== 'Unknown'));
                      } else {
                        handleChange('states', [...selected, 'Unknown']);
                      }
                    }}
                    className={`p-2 text-sm rounded-lg border transition-colors ${
                      (filters.states || []).includes('Unknown')
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>Unknown</span>
                      {(filters.states || []).includes('Unknown') && <Check className="w-3 h-3" />}
                    </div>
                    <span className="text-xs text-emerald-600 font-medium">50% Off!</span>
                  </button>
                  {US_STATES.map(state => (
                    <button
                      key={state}
                      onClick={() => {
                        const selected = filters.states || [];
                        if (selected.includes(state)) {
                          handleChange('states', selected.filter(s => s !== state));
                        } else {
                          handleChange('states', [...selected, state]);
                        }
                      }}
                      className={`p-2 text-sm rounded-lg border transition-colors ${
                        (filters.states || []).includes(state)
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{state}</span>
                        {(filters.states || []).includes(state) && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Distance (miles)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex ml-1 align-middle">
                    <Info className="w-3 h-3 text-slate-400" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Use this to expand on Zip Code</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Input
            type="number"
            placeholder="Radius"
            value={filters.distance || ""}
            onChange={(e) => handleChange('distance', e.target.value)}
            className="h-11 rounded-xl border-slate-200"
            disabled={!filters.zip_code}
          />
        </div>

        <div className="flex items-end gap-2 lg:col-span-1">
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