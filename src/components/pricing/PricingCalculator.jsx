// Tiered Pricing Logic based on lead_type and age_range

// Default pricing per lead type, indexed by tier (7 tiers):
// [1-3d, 4-14d, 15-30d, 31-90d, 91-180d, 181-365d, 366+d]
const DEFAULT_PRICING = {
  final_expense: [15, 10, 7.5, 5, 2.5, 1.25, 0.75],
  life: [21, 14, 10, 7, 3.5, 1.75, 1],
  veteran_life: [14, 9, 7, 5, 2, 1, 0.5],
  retirement: [29, 19, 14, 9, 4.5, 2.25, 1.25],
  home: [16, 11, 8, 5.5, 3, 1.5, 0.75],
  auto: [16, 11, 8, 5.5, 3, 1.5, 0.75],
  medicare: [15, 10, 7.5, 5, 2.5, 1.25, 0.75],
  health: [16, 11, 8, 5.5, 3, 1.5, 0.75],
  annuity: [150, 100, 75, 50, 25, 12.5, 6.25],
  recruiting: [18, 12, 9, 6, 3, 1.5, 0.75]
};

function getTierPriceIndex(ageInDays) {
  if (ageInDays <= 3) return 0;
  if (ageInDays <= 14) return 1;
  if (ageInDays <= 30) return 2;
  if (ageInDays <= 90) return 3;
  if (ageInDays <= 180) return 4;
  if (ageInDays <= 365) return 5;
  return 6;
}

export function calculateLeadPrice(lead, pricingTiers = []) {
  const ageInDays = Math.max(1, lead.age_in_days || 1);

  // Check for unknown city or state (50% discount)
  const hasUnknownLocation =
    (String(lead.city || '').toLowerCase() === 'unknown') ||
    (String(lead.state || '').toLowerCase() === 'unknown');

  // Check for custom pricing tier from database
  const customTier = pricingTiers.find(tier =>
    tier.lead_type === lead.lead_type &&
    ageInDays >= tier.age_range_min &&
    ageInDays <= tier.age_range_max
  );

  let basePrice;

  if (customTier) {
    basePrice = customTier.base_price;
  } else {
    // Fallback to default pricing
    const typePrices = DEFAULT_PRICING[lead.lead_type] || DEFAULT_PRICING.auto;
    basePrice = typePrices[getTierPriceIndex(ageInDays)];
  }

  // Apply 50% discount for Unknown location
  return hasUnknownLocation ? basePrice * 0.5 : basePrice;
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
  if (ageInDays <= 365) return '181-365';
  return '366+';
}

export { DEFAULT_PRICING };