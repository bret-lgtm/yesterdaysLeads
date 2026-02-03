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
import { migrateLocalCartToDatabase } from '../components/cartMigration';

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
    if (!user) {
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

      updateLocalCount();
      window.addEventListener('storage', updateLocalCount);
      
      // Custom event for same-tab updates
      window.addEventListener('cartUpdated', updateLocalCount);

      return () => {
        window.removeEventListener('storage', updateLocalCount);
        window.removeEventListener('cartUpdated', updateLocalCount);
      };
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
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Home')} className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697a2f6ba7fe7cab15e8500b/ac72ff8b0_YesterdaysLeadsMAINLOGO.png"
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
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <Link
                  to={createPageUrl('AdminDashboard')}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Admin
                </Link>
              )}
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* Cart */}
              <Link to={createPageUrl('Checkout')} className="relative">
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <ShoppingCart className="w-5 h-5 text-slate-600" />
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
                    <Button variant="ghost" className="rounded-xl gap-2 px-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-600" />
                      </div>
                      <span className="hidden sm:block text-sm font-medium text-slate-700">
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
                <Button 
                  onClick={() => base44.auth.redirectToLogin()}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/20"
                >
                  Sign In
                </Button>
              )}

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-xl"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={createPageUrl(link.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <link.icon className="w-5 h-5 text-slate-500" />
                  {link.name}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <Link
                  to={createPageUrl('AdminDashboard')}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <Settings className="w-5 h-5 text-slate-500" />
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

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697a2f6ba7fe7cab15e8500b/ac72ff8b0_YesterdaysLeadsMAINLOGO.png"
              alt="Yesterday's Leads"
              className="h-8 w-auto"
            />
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} Yesterday's Leads. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}