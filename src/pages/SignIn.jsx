import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setLoading(true);
    
    try {
      // Get the redirect URL from query params
      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl = urlParams.get('from_url') || window.location.origin;
      
      // Send magic link email
      await base44.integrations.Core.SendEmail({
        to: email,
        subject: "Sign in to Yesterday's Leads",
        body: `Click here to sign in: ${window.location.origin}/api/auth/magic-link?email=${encodeURIComponent(email)}&next=${encodeURIComponent(fromUrl)}`
      });
      
      setEmailSent(true);
      toast.success('Check your email for the login link!');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to send login link');
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We've sent a login link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600 text-center">
              Click the link in your email to sign in. You can close this page.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setEmailSent(false);
                setEmail('');
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardTitle className="text-2xl">Sign in to your account</CardTitle>
          <CardDescription>
            Enter your email to receive a login link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-12"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending link...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send login link
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}