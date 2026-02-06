import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { 
  Menu,
  X,
  User,
  LogOut,
  ShoppingCart,
  Package,
  FileText,
  Settings,
  Home,
  DollarSign
} from "lucide-react";
import { migrateLocalCartToDatabase } from './components/cartMigration';
import ChatWidget from './components/chat/ChatWidget';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [localCartCount, setLocalCartCount] = React.useState(0);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: cartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.CartItem.filter({ user_email: user.email });
    },
    enabled: !!user?.email
  });

  // Migrate cart on sign-in
  React.useEffect(() => {
    if (user?.email) {
      migrateLocalCartToDatabase(user.email).then(() => {
        setLocalCartCount(0);
      });
    }
  }, [user?.email]);

  // Track localStorage cart count for anonymous users
  React.useEffect(() => {
    const updateLocalCount = () => {
      const stored = localStorage.getItem('anonymous_cart');
      if (stored) {
        try {
          const cart = JSON.parse(stored);
          setLocalCartCount(cart.length);
        } catch {
          setLocalCartCount(0);
        }
      } else {
        setLocalCartCount(0);
      }
    };

    if (!user) {
      updateLocalCount();
      window.addEventListener('storage', updateLocalCount);
      window.addEventListener('cartUpdated', updateLocalCount);

      return () => {
        window.removeEventListener('storage', updateLocalCount);
        window.removeEventListener('cartUpdated', updateLocalCount);
      };
    } else {
      setLocalCartCount(0);
    }
  }, [user]);

  const handleLogout = () => {
    base44.auth.logout();
  };

  const navLinks = [
    { name: 'Home', href: 'Home', icon: Home },
    { name: 'Browse Leads', href: 'BrowseLeads', icon: Package },
    { name: 'Pricing', href: 'Pricing', icon: DollarSign },
    ...(user ? [{ name: 'My Orders', href: 'MyOrders', icon: FileText }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-emerald-700 border-b border-emerald-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Home')} className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697a2f6ba7fe7cab15e8500b/297055a20_YesterdaysLeadsMAINLOGOWHITE.png"
                alt="Yesterday's Leads"
                className="h-10 sm:h-12 w-auto"
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={createPageUrl(link.href)}
                  className="px-4 py-2 text-sm font-medium text-white hover:text-white rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <Link
                  to={createPageUrl('AdminDashboard')}
                  className="px-4 py-2 text-sm font-medium text-white hover:text-white rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  Admin
                </Link>
              )}
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* Cart */}
              <Link to={createPageUrl('Checkout')} className="relative">
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-emerald-600">
                  <ShoppingCart className="w-5 h-5 text-white" />
                  {((user ? cartItems.length : localCartCount) > 0) && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 p-0 flex items-center justify-center text-xs">
                      {user ? cartItems.length : localCartCount}
                    </Badge>
                  )}
                </Button>
              </Link>

              {/* User Menu */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="rounded-xl gap-2 px-3 hover:bg-emerald-600">
                      <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <span className="hidden sm:block text-sm font-medium text-white">
                        {user.full_name?.split(' ')[0] || user.email?.split('@')[0]}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <div className="px-3 py-2">
                      <p className="font-medium text-slate-900">{user.full_name}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={createPageUrl('MyOrders')} className="cursor-pointer">
                        <FileText className="w-4 h-4 mr-2" />
                        My Orders
                      </Link>
                    </DropdownMenuItem>
                    {user.role === 'admin' && (
                      <DropdownMenuItem asChild>
                        <Link to={createPageUrl('AdminDashboard')} className="cursor-pointer">
                          <Settings className="w-4 h-4 mr-2" />
                          Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="rounded-xl bg-white text-emerald-700 hover:bg-white/90 shadow-lg">
                      Sign In
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuItem
                      onClick={() => {
                        const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
                        const redirectUri = `${window.location.origin}/api/functions/googleAuthCallback`;
                        const state = JSON.stringify({ from_url: window.location.href });
                        const scope = 'openid email profile';
                        
                        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
                        window.location.href = authUrl;
                      }}
                      className="cursor-pointer"
                    >
                      Continue with Google
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/login" className="cursor-pointer">
                        Sign in with Email
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-xl hover:bg-emerald-600"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-emerald-800 bg-emerald-700">
            <nav className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={createPageUrl(link.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white rounded-xl hover:bg-emerald-600 transition-colors"
                >
                  <link.icon className="w-5 h-5 text-white/80" />
                  {link.name}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <Link
                  to={createPageUrl('AdminDashboard')}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-white rounded-xl hover:bg-emerald-600 transition-colors"
                >
                  <Settings className="w-5 h-5 text-white/80" />
                  Admin Dashboard
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main>
        {children}
      </main>

      {/* Chat Widget */}
      <ChatWidget />

      {/* Footer */}
      <footer className="bg-emerald-700 border-t border-emerald-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697a2f6ba7fe7cab15e8500b/297055a20_YesterdaysLeadsMAINLOGOWHITE.png"
              alt="Yesterday's Leads"
              className="h-8 w-auto"
            />
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
              <Link 
                to={createPageUrl('Support')} 
                className="text-sm text-white hover:text-white/80 transition-colors"
              >
                Support
              </Link>
              <Link 
                to={createPageUrl('PrivacyPolicy')} 
                className="text-sm text-white hover:text-white/80 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                to={createPageUrl('TermsOfService')} 
                className="text-sm text-white hover:text-white/80 transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                to={createPageUrl('DoNotSell')} 
                className="text-sm text-white hover:text-white/80 transition-colors"
              >
                Do Not Sell or Share My Personal Information
              </Link>
              <p className="text-sm text-white">
                © {new Date().getFullYear()} Yesterday's Leads. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}