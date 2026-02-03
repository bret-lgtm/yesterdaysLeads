import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CART_STORAGE_KEY = 'anonymous_cart';

export function useCart(user) {
  const queryClient = useQueryClient();
  const [localCart, setLocalCart] = useState([]);

  // Load localStorage cart on mount and listen for updates
  useEffect(() => {
    if (!user) {
      const loadCart = () => {
        const stored = localStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          try {
            setLocalCart(JSON.parse(stored));
          } catch (e) {
            localStorage.removeItem(CART_STORAGE_KEY);
          }
        } else {
          setLocalCart([]);
        }
      };

      loadCart();
      window.addEventListener('cartUpdated', loadCart);

      return () => {
        window.removeEventListener('cartUpdated', loadCart);
      };
    }
  }, [user]);

  // Fetch database cart for authenticated users
  const { data: dbCart = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.CartItem.filter({ user_email: user.email });
    },
    enabled: !!user?.email
  });

  // Add to cart mutation (database)
  const addToDbCartMutation = useMutation({
    mutationFn: async (item) => {
      return base44.entities.CartItem.create({
        user_email: user.email,
        ...item
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Lead added to cart');
    }
  });

  // Remove from cart mutation (database)
  const removeFromDbCartMutation = useMutation({
    mutationFn: (itemId) => base44.entities.CartItem.delete(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Lead removed from cart');
    }
  });

  // Add to localStorage cart
  const addToLocalCart = (item) => {
    const newCart = [...localCart, { ...item, id: `local_${Date.now()}` }];
    setLocalCart(newCart);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newCart));
    window.dispatchEvent(new Event('cartUpdated'));
    toast.success('Lead added to cart');
  };

  // Remove from localStorage cart
  const removeFromLocalCart = (itemId) => {
    const newCart = localCart.filter(item => item.id !== itemId);
    setLocalCart(newCart);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newCart));
    window.dispatchEvent(new Event('cartUpdated'));
    toast.success('Lead removed from cart');
  };

  // Unified add to cart
  const addToCart = async (item) => {
    if (user) {
      await addToDbCartMutation.mutateAsync(item);
    } else {
      addToLocalCart(item);
    }
  };

  // Unified remove from cart
  const removeFromCart = (itemId) => {
    if (user) {
      removeFromDbCartMutation.mutate(itemId);
    } else {
      removeFromLocalCart(itemId);
    }
  };

  // Get current cart items
  const cartItems = user ? dbCart : localCart;

  // Clear localStorage cart (used after migration)
  const clearLocalCart = () => {
    setLocalCart([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  };

  return {
    cartItems,
    addToCart,
    removeFromCart,
    clearLocalCart,
    isLoading: user ? addToDbCartMutation.isPending || removeFromDbCartMutation.isPending : false
  };
}