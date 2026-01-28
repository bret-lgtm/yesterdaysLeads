// Tiered Pricing Logic based on lead_type, age_range, and quantity

const DEFAULT_PRICING = {
  auto: { base: 2.50, fresh: 4.00, aged: 1.50 },
  home: { base: 3.00, fresh: 5.00, aged: 2.00 },
  health: { base: 3.50, fresh: 6.00, aged: 2.50 },
  life: { base: 4.00, fresh: 7.00, aged: 3.00 },
  medicare: { base: 5.00, fresh: 8.00, aged: 3.50 },
  final_expense: { base: 4.50, fresh: 7.50, aged: 3.00 }
};

const BULK_DISCOUNTS = [
  { threshold: 100, discount: 5 },
  { threshold: 250, discount: 10 },
  { threshold: 500, discount: 15 },
  { threshold: 1000, discount: 20 }
];

export function calculateLeadPrice(lead, pricingTiers = []) {
  const ageInDays = Math.floor((new Date() - new Date(lead.upload_date)) / (1000 * 60 * 60 * 24));
  
  // Check for custom pricing tier
  const customTier = pricingTiers.find(tier => 
    tier.lead_type === lead.lead_type &&
    ageInDays >= tier.age_range_min &&
    ageInDays <= tier.age_range_max
  );

  if (customTier) {
    return customTier.base_price;
  }

  // Default pricing logic
  const typePrice = DEFAULT_PRICING[lead.lead_type] || DEFAULT_PRICING.auto;
  
  if (ageInDays <= 30) {
    return typePrice.fresh;
  } else if (ageInDays <= 90) {
    return typePrice.base;
  } else {
    return typePrice.aged;
  }
}

export function calculateBulkDiscount(quantity) {
  for (let i = BULK_DISCOUNTS.length - 1; i >= 0; i--) {
    if (quantity >= BULK_DISCOUNTS[i].threshold) {
      return BULK_DISCOUNTS[i].discount;
    }
  }
  return 0;
}

export function calculateCartTotal(cartItems, pricingTiers = []) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const discount = calculateBulkDiscount(cartItems.length);
  const discountAmount = subtotal * (discount / 100);
  const total = subtotal - discountAmount;
  
  return {
    subtotal,
    discount,
    discountAmount,
    total,
    itemCount: cartItems.length
  };
}

export function getAgeRange(ageInDays) {
  if (ageInDays <= 30) return '0-30';
  if (ageInDays <= 60) return '31-60';
  if (ageInDays <= 90) return '61-90';
  if (ageInDays <= 180) return '91-180';
  return '181+';
}

export { DEFAULT_PRICING, BULK_DISCOUNTS };