import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Send, Mail } from 'lucide-react';

export default function Support() {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await base44.integrations.Core.SendEmail({
        to: 'support@yesterdaysleads.com',
        subject: `Support Request from ${formData.first_name} ${formData.last_name}`,
        body: `
New support request received:

Name: ${formData.first_name} ${formData.last_name}
Email: ${formData.email}
Phone: ${formData.phone}

Message:
${formData.message}
        `
      });

      toast.success('Message sent! We\'ll get back to you soon.');
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        message: ''
      });
    } catch (error) {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-600">
            Have questions? We're here to help.
          </p>
        </div>

        {/* Form */}
        <Card className="rounded-2xl border-slate-200/60 p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">What can we help you with?</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                rows={6}
                className="rounded-xl border-slate-200 resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/20"
            >
              {submitting ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}