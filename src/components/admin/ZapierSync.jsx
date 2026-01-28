import React from 'react';
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Upload } from "lucide-react";

export default function ZapierSync() {
  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <Database className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Import Leads</h3>
          <p className="text-sm text-slate-500">Optimized for high-volume storage (1M+ records)</p>
        </div>
      </div>

      <Alert className="mb-4 border-blue-200 bg-blue-50">
        <Database className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Use the CSV Uploader below to import leads in bulk. The platform handles millions of records efficiently with automatic indexing and pagination.
        </AlertDescription>
      </Alert>

      <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
        <p className="font-medium mb-2">📊 Best Practices:</p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>Import via CSV for bulk uploads (thousands at once)</li>
          <li>Database automatically indexes for fast queries</li>
          <li>Pagination handles large datasets smoothly</li>
          <li>Use filters to narrow searches efficiently</li>
        </ul>
      </div>
    </Card>
  );
}