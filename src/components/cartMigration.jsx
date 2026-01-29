import { base44 } from '@/api/base44Client';

const CART_STORAGE_KEY = 'anonymous_cart';

export async function migrateLocalCartToDatabase(userEmail) {
  const stored = localStorage.getItem(CART_STORAGE_KEY);
  if (!stored) return;

  try {
    const localCart = JSON.parse(stored);
    if (localCart.length === 0) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }

    // Get existing cart items to avoid duplicates
    const existingItems = await base44.entities.CartItem.filter({ user_email: userEmail });
    const existingLeadIds = new Set(existingItems.map(item => item.lead_id));

    // Migrate non-duplicate items
    const itemsToMigrate = localCart.filter(item => !existingLeadIds.has(item.lead_id));
    
    if (itemsToMigrate.length > 0) {
      await Promise.all(
        itemsToMigrate.map(item => 
          base44.entities.CartItem.create({
            user_email: userEmail,
            lead_id: item.lead_id,
            lead_type: item.lead_type,
            lead_name: item.lead_name,
            state: item.state,
            zip_code: item.zip_code,
            age_in_days: item.age_in_days,
            price: item.price
          })
        )
      );
    }

    // Clear localStorage cart
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to migrate cart:', error);
  }
}