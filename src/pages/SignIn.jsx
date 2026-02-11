import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function SignIn() {
  useEffect(() => {
    // Get the redirect URL from query params
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('from_url') || '/';
    
    // Redirect to Base44's built-in login
    base44.auth.redirectToLogin(fromUrl);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697a2f6ba7fe7cab15e8500b/297055a20_YesterdaysLeadsMAINLOGOWHITE.png"
            alt="Yesterday's Leads"
            className="h-12 w-auto mx-auto mb-4"
            style={{ filter: 'brightness(0) saturate(100%) invert(45%) sepia(61%) saturate(502%) hue-rotate(115deg) brightness(94%) contrast(88%)' }}
          />
          <CardTitle className="text-2xl">Redirecting to login...</CardTitle>
          <CardDescription>
            Please wait while we redirect you
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </CardContent>
      </Card>
    </div>
  );
}