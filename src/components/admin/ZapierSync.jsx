import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";

export default function ZapierSync({ onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch('/api/functions/syncLeadsFromZapier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();
      setResult(data);

      if (data.success && onSyncComplete) {
        onSyncComplete();
      }
    } catch (error) {
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
          <Zap className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Zapier Tables Sync</h3>
          <p className="text-sm text-slate-500">Import leads from your Zapier database</p>
        </div>
      </div>

      {result && (
        <Alert className={`mb-4 ${result.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-start gap-2">
            {result.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
            )}
            <div className="flex-1">
              <AlertDescription className={result.success ? 'text-emerald-800' : 'text-red-800'}>
                {result.success ? (
                  <>
                    <p className="font-medium mb-1">{result.message}</p>
                    <p className="text-sm text-emerald-700">
                      Fetched: {result.total_fetched} • New: {result.new_leads} • Duplicates: {result.duplicates_skipped}
                    </p>
                  </>
                ) : (
                  <p>{result.error}</p>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      <Button
        onClick={handleSync}
        disabled={syncing}
        className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700"
      >
        {syncing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync from Zapier Now
          </>
        )}
      </Button>

      <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
        <p className="font-medium mb-1">⚙️ Setup Required:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Get API key from zapier.com/app/profile/api-management</li>
          <li>Set ZAPIER_API_KEY and ZAPIER_TABLE_ID in app secrets</li>
          <li>Adjust field mapping in backend function if needed</li>
        </ol>
      </div>
    </Card>
  );
}