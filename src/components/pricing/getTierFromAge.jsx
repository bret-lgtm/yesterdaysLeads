// Helper function to determine tier based on lead age in days
// Tier 1: 1-3d, Tier 2: 4-14d, Tier 3: 15-30d, Tier 4: 31-90d
// Tier 5: 91-180d, Tier 6: 181-365d, Tier 7: 366+ days
export function getTierFromAge(ageInDays) {
  if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
  if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
  if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
  if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
  if (ageInDays >= 91 && ageInDays <= 180) return 'tier5';
  if (ageInDays >= 181 && ageInDays <= 365) return 'tier6';
  if (ageInDays >= 366) return 'tier7';
  return 'tier1'; // default
}