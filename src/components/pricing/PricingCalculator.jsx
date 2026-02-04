// Tiered Pricing Logic based on lead_type, age_range, and quantity

const DEFAULT_PRICING = {
  auto: { base: 2.50, fresh: 4.00, aged: 1.50 },
  home: { base: 3.00, fresh: 5.00, aged: 2.00 },
  health: { base: 3.50, fresh: 6.00, aged: 2.50 },
  life: { base: 4.00, fresh: 7.00, aged: 3.00 },
  medicare: { base: 5.00, fresh: 8.00, aged: 3.50 },
  final_expense: { base: 4.50, fresh: 7.50, aged: 3.00 },
  veteran_life: { base: 4.50, fresh: 7.50, aged: 3.00 },
  retirement: { base: 14.00, fresh: 29.00, aged: 4.50 }
};



export function calculateLeadPrice(lead, pricingTiers = []) {
  const ageInDays = Math.max(1, lead.age_in_days || 1);
  
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
  
  // Special pricing logic for retirement leads
  if (lead.lead_type === 'retirement') {
    if (ageInDays <= 3) return 29.00;
    if (ageInDays <= 14) return 19.00;
    if (ageInDays <= 30) return 14.00;
    if (ageInDays <= 90) return 9.00;
    return 4.50;
  }
  
  if (ageInDays <= 30) {
    return typePrice.fresh;
  } else if (ageInDays <= 90) {
    return typePrice.base;
  } else {
    return typePrice.aged;
  }
}



export function calculateCartTotal(cartItems, pricingTiers = []) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  
  return {
    subtotal,
    total: subtotal,
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

export { DEFAULT_PRICING };