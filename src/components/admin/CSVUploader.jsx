import React, { useState, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from "framer-motion";

export default function CSVUploader({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  const processCSV = async (csvFile) => {
    setProcessing(true);
    setProgress(10);

    try {
      // Read file content
      const fileContent = await csvFile.text();
      const blob = new Blob([fileContent], { type: 'text/csv' });
      
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file: blob });
      setProgress(30);

      // Extract data
      const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              external_id: { type: "string" },
              lead_type: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              state: { type: "string" },
              zip_code: { type: "string" },
              utility_bill_amount: { type: "number" }
            }
          }
        }
      });
      setProgress(50);

      if (extracted.status === 'error') {
        throw new Error(extracted.details);
      }

      const records = extracted.output;
      
      // Get existing leads to check for duplicates
      const existingLeads = await base44.entities.Lead.list();
      const existingIds = new Set(existingLeads.map(l => l.external_id));
      setProgress(60);

      // Filter out duplicates and prepare new records
      const newRecords = records.filter(r => r.external_id && !existingIds.has(r.external_id))
        .map(r => ({
          ...r,
          status: 'available',
          upload_date: new Date().toISOString().split('T')[0]
        }));

      const duplicates = records.length - newRecords.length;
      setProgress(80);

      // Bulk create new leads
      if (newRecords.length > 0) {
        await base44.entities.Lead.bulkCreate(newRecords);
      }
      setProgress(100);

      setResults({
        success: true,
        total: records.length,
        imported: newRecords.length,
        duplicates
      });

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      setResults({
        success: false,
        error: error.message
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      setFile(droppedFile);
      processCSV(droppedFile);
    }
  }, []);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      processCSV(selectedFile);
    }
  };

  const reset = () => {
    setFile(null);
    setProgress(0);
    setResults(null);
  };

  return (
    <Card className="p-6 rounded-2xl border-slate-200/60">
      <h3 className="font-semibold text-slate-900 mb-4">Upload Leads CSV</h3>
      
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                isDragging ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-slate-600 mb-2">Drag and drop your CSV file here</p>
              <p className="text-sm text-slate-400 mb-4">or</p>
              <label>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button variant="outline" className="rounded-xl" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
              <FileText className="w-8 h-8 text-slate-400" />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Processing...</span>
                  <span className="text-slate-900 font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {results && (
              <div className={`p-4 rounded-xl ${
                results.success ? 'bg-emerald-50' : 'bg-red-50'
              }`}>
                <div className="flex items-start gap-3">
                  {results.success ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    {results.success ? (
                      <>
                        <p className="font-medium text-emerald-900">Import Complete</p>
                        <p className="text-sm text-emerald-700">
                          {results.imported} leads imported, {results.duplicates} duplicates skipped
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-red-900">Import Failed</p>
                        <p className="text-sm text-red-700">{results.error}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!processing && (
              <Button onClick={reset} variant="outline" className="w-full rounded-xl">
                Upload Another File
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}